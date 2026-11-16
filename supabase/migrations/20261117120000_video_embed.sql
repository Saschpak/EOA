-- Kursvideos über Bunny Stream: signierte Player-Links.
-- Der Token-Schlüssel der Library liegt im Vault als 'bunny_token_key' (nie im Repo),
-- die Library-ID als 'bunny_library_id'. lesson_video_url() prüft den Zugang und gibt einen
-- Link zurück, der 4 Stunden gilt. Claude pflegt Lektionen per claude_course/claude_lesson_save.

create or replace function public.bunny_cfg(p_name text)
returns text
language sql
stable
security definer
set search_path = public
as $$ select decrypted_secret from vault.decrypted_secrets where name = p_name limit 1 $$;
revoke execute on function public.bunny_cfg(text) from public, anon, authenticated;

create or replace function public.lesson_video_url(p_lesson uuid)
returns text
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_lesson public.lessons;
  v_me public.profiles;
  v_key text := public.bunny_cfg('bunny_token_key');
  v_lib text := coalesce(public.bunny_cfg('bunny_library_id'), '811527');
  v_exp bigint := extract(epoch from now() + interval '4 hours')::bigint;
begin
  if v_uid is null then return null; end if;
  select * into v_lesson from public.lessons where id = p_lesson;
  if v_lesson.id is null or coalesce(v_lesson.video_id, '') = '' or coalesce(v_key, '') = '' then return null; end if;
  select * into v_me from public.profiles where id = v_uid;
  if v_me.role <> 'coach' then
    if not public.module_is_unlocked(v_uid, v_lesson.module_id) then return null; end if;
    if v_me.access_until is not null and v_me.access_until < current_date then return null; end if;
  end if;
  return 'https://iframe.mediadelivery.net/embed/' || v_lib || '/' || v_lesson.video_id
    || '?token=' || encode(sha256(convert_to(v_key || v_lesson.video_id || v_exp::text, 'UTF8')), 'hex')
    || '&expires=' || v_exp::text;
end;
$$;
revoke execute on function public.lesson_video_url(uuid) from public, anon;
grant execute on function public.lesson_video_url(uuid) to authenticated;

-- Claude legt den Schlüssel selbst ab (Wert kommt direkt aus der Bunny-API, nie aus dem Chat)
create or replace function public.claude_set_secret(p_name text, p_value text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  if not public.claude_key_ok() then raise exception 'nicht erlaubt'; end if;
  if p_name not in ('bunny_token_key', 'bunny_library_id') then raise exception 'nur Bunny-Einstellungen'; end if;
  if coalesce(p_value, '') = '' then raise exception 'leer'; end if;
  select id into v_id from vault.secrets where name = p_name limit 1;
  if v_id is null then perform vault.create_secret(p_value, p_name, 'Bunny Stream');
  else perform vault.update_secret(v_id, p_value, p_name, 'Bunny Stream'); end if;
  return true;
end;
$$;
revoke execute on function public.claude_set_secret(text, text) from public, authenticated;
grant execute on function public.claude_set_secret(text, text) to anon;

-- Kurs lesen: Module mit Lektionen
create or replace function public.claude_course()
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.claude_key_ok() then raise exception 'nicht erlaubt'; end if;
  return coalesce((select json_agg(json_build_object(
    'id', m.id, 'nr', m.position, 'titel', m.title, 'freischaltung', m.drip_type, 'wert', m.drip_value,
    'lektionen', coalesce((select json_agg(json_build_object('id', l.id, 'pos', l.position, 'titel', l.title,
      'dauer', l.duration_seconds, 'punkte', l.points, 'video', l.video_id) order by l.position, l.created_at)
      from public.lessons l where l.module_id = m.id), '[]'::json)) order by m.position, m.created_at)
    from public.modules m), '[]'::json);
end;
$$;

-- Lektion anlegen (p_id leer) oder ändern; null = unverändert. p_video '' entfernt das Video.
create or replace function public.claude_lesson_save(
  p_id uuid default null, p_module uuid default null, p_title text default null, p_position int default null,
  p_duration int default null, p_points text[] default null, p_video text default null)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare v public.lessons;
begin
  if not public.claude_key_ok() then raise exception 'nicht erlaubt'; end if;
  if p_id is null then
    if p_module is null or coalesce(p_title, '') = '' then raise exception 'Modul und Titel fehlen'; end if;
    insert into public.lessons (module_id, title, position, duration_seconds, points, video_id)
    values (p_module, p_title,
      coalesce(p_position, (select coalesce(max(position), 0) + 1 from public.lessons where module_id = p_module)),
      coalesce(p_duration, 0), coalesce(p_points, '{}'), nullif(p_video, ''))
    returning * into v;
  else
    update public.lessons set
      module_id = coalesce(p_module, module_id), title = coalesce(p_title, title), position = coalesce(p_position, position),
      duration_seconds = coalesce(p_duration, duration_seconds), points = coalesce(p_points, points),
      video_id = case when p_video is null then video_id else nullif(p_video, '') end
    where id = p_id returning * into v;
    if v.id is null then raise exception 'Lektion nicht gefunden'; end if;
  end if;
  return row_to_json(v);
end;
$$;
revoke execute on function public.claude_course() from public, authenticated;
revoke execute on function public.claude_lesson_save(uuid, uuid, text, int, int, text[], text) from public, authenticated;
grant execute on function public.claude_course() to anon;
grant execute on function public.claude_lesson_save(uuid, uuid, text, int, int, text[], text) to anon;

-- Coach hat überall Zugriff, unabhängig von Kurszugang und Freischaltregeln
create or replace function public.module_is_unlocked(p_user uuid, p_module uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles c where c.id = p_user and c.role = 'coach')
  or exists (
    select 1
    from public.modules m
    join public.profiles p on p.id = p_user
    where m.id = p_module
      and p.course_access
      and (
        exists (select 1 from public.module_unlocks u where u.user_id = p_user and u.module_id = p_module)
        or m.drip_type = 'now'
        or (m.drip_type = 'days' and p.started_at + m.drip_value <= current_date)
        or (m.drip_type = 'sessions'
            and (select count(*) from public.sessions s where s.user_id = p_user) >= m.drip_value)
      )
  );
$$;
