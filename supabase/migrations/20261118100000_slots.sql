-- 1:1-Buchung in der Plattform: Der Coach (oder Claude aus seinem Kalender) stellt freie Zeiten ein,
-- Schüler buchen selbst (mindestens 48 Stunden vorher). Eine Buchung zählt gegen das 1:1-Paket (package_total), Absagen bis 24 Stunden vorher.
-- Bestätigung per Mail an Schüler und Coach, Push ohne Namen.

create table if not exists public.slots (
  id          uuid primary key default gen_random_uuid(),
  starts_at   timestamptz not null unique,
  minutes     int not null default 60 check (minutes between 15 and 240),
  booking_id  uuid references public.bookings (id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists slots_start_idx on public.slots (starts_at);

alter table public.slots enable row level security;
create policy "slots: schüler sehen künftige Zeiten" on public.slots
  for select to authenticated using (public.is_coach() or (starts_at > now() + interval '48 hours' and public.can_download()));
create policy "slots: coach verwaltet" on public.slots
  for all to authenticated using (public.is_coach()) with check (public.is_coach());

alter table public.bookings add column if not exists minutes int not null default 60;

-- Datum hübsch auf Deutsch, Berliner Zeit
create or replace function public.de_when(p timestamptz)
returns text
language sql
immutable
as $$
  select (array['So','Mo','Di','Mi','Do','Fr','Sa'])[extract(dow from p at time zone 'Europe/Berlin')::int + 1]
    || ', ' || to_char(p at time zone 'Europe/Berlin', 'FMDD.FMMM.') || ' um ' || to_char(p at time zone 'Europe/Berlin', 'HH24:MI') || ' Uhr';
$$;

create or replace function public.booking_notify(p_booking uuid, p_kind text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  c jsonb := public.mail_config();
  b public.bookings;
  p public.profiles;
  v_when text;
  v_link text;
  v_topic text;
  v_first text;
begin
  select * into b from public.bookings where id = p_booking;
  select * into p from public.profiles where id = b.user_id;
  if b.id is null or p.id is null then return; end if;
  v_when := public.de_when(b.starts_at);
  v_first := nullif(split_part(coalesce(p.full_name, ''), ' ', 1), '');
  v_link := (c->>'site') || 'termin?t=' || to_char(b.starts_at at time zone 'Europe/Berlin', 'YYYYMMDD"T"HH24MI') || '&d=' || b.minutes || '&k=s';

  begin
    select decrypted_secret into v_topic from vault.decrypted_secrets where name = 'ntfy_topic' limit 1;
    if coalesce(v_topic, '') <> '' then
      perform net.http_post(
        url := 'https://ntfy.sh/',
        body := jsonb_build_object('topic', v_topic, 'title', case p_kind when 'gebucht' then '1:1 gebucht' else '1:1 abgesagt' end,
          'message', case p_kind when 'gebucht' then 'Neues 1:1: ' else 'Abgesagt: ' end || v_when,
          'tags', jsonb_build_array('calendar'), 'click', (c->>'site') || '#admin'),
        headers := jsonb_build_object('Content-Type', 'application/json'),
        timeout_milliseconds := 5000);
    end if;
  exception when others then null;
  end;

  if p_kind = 'gebucht' then
    perform public.send_mails('buchung', jsonb_build_array(
      jsonb_build_object('from', c->>'from', 'to', jsonb_build_array(p.email), 'reply_to', c->>'reply_to',
        'subject', 'Dein 1:1 am ' || v_when,
        'html', public.mail_html(
          '<p style="margin:0 0 14px;">Hey' || coalesce(' ' || public.esc_html(v_first), '') || ',</p>'
          || '<p style="margin:0 0 14px;">dein 1:1 ist gebucht: <b>' || v_when || '</b> (' || b.minutes || ' Minuten).</p>'
          || case when b.topic <> '' then '<p style="margin:0 0 14px;">Dein Thema: ' || public.esc_html(b.topic) || '</p>' else '' end
          || '<p style="margin:0 0 14px;">Den Link für den Video-Call bekommst du rechtzeitig vorher von mir. Absagen oder verschieben kannst du bis 24 Stunden vorher selbst auf der Plattform unter 1:1s.</p>'
          || '<p style="margin:0;">Liebe Grüße<br>Sascha</p>',
          'In meinen Kalender eintragen', v_link)),
      jsonb_build_object('from', c->>'from', 'to', jsonb_build_array(c->>'coach_email'), 'reply_to', p.email,
        'subject', '1:1 gebucht: ' || coalesce(nullif(p.full_name, ''), p.email) || ', ' || v_when,
        'html', public.mail_html(
          '<p style="margin:0 0 12px;"><b>' || public.esc_html(coalesce(nullif(p.full_name, ''), p.email)) || '</b> hat ein 1:1 gebucht.</p>'
          || '<p style="margin:0 0 6px;">Wann: ' || v_when || ' (' || b.minutes || ' Minuten)</p>'
          || case when b.topic <> '' then '<p style="margin:0 0 6px;">Thema: ' || public.esc_html(b.topic) || '</p>' else '' end,
          'In meinen Kalender eintragen', v_link))));
  else
    perform public.send_mails('buchung', jsonb_build_array(
      jsonb_build_object('from', c->>'from', 'to', jsonb_build_array(c->>'coach_email'), 'reply_to', p.email,
        'subject', '1:1 abgesagt: ' || coalesce(nullif(p.full_name, ''), p.email) || ', ' || v_when,
        'html', public.mail_html('<p style="margin:0;"><b>' || public.esc_html(coalesce(nullif(p.full_name, ''), p.email)) || '</b> hat das 1:1 am ' || v_when || ' abgesagt. Die Zeit ist wieder frei.</p>'))));
  end if;
exception when others then null;
end;
$$;
revoke execute on function public.booking_notify(uuid, text) from public, anon, authenticated;

-- Schüler bucht eine freie Zeit
create or replace function public.slot_book(p_slot uuid, p_topic text default '')
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  p public.profiles;
  s public.slots;
  v_left int;
  v_id uuid;
begin
  if v_uid is null then raise exception 'Bitte melde dich an.'; end if;
  select * into p from public.profiles where id = v_uid;
  if p.id is null or not (p.course_access or p.role = 'coach') then raise exception 'Für dein Konto sind noch keine 1:1s freigeschaltet.'; end if;
  select * into s from public.slots where id = p_slot for update;
  if s.id is null or s.starts_at < now() + interval '48 hours' then raise exception 'Diese Zeit ist nicht mehr buchbar. 1:1s kannst du bis 48 Stunden vorher buchen.'; end if;
  if s.booking_id is not null then raise exception 'Diese Zeit wurde gerade schon gebucht. Such dir bitte eine andere aus.'; end if;
  v_left := p.package_total
    - (select count(*) from public.sessions x where x.user_id = v_uid)
    - (select count(*) from public.bookings x where x.user_id = v_uid and x.status = 'booked' and x.starts_at >= now() - interval '2 hours');
  if v_left <= 0 and p.role <> 'coach' then raise exception 'Du hast gerade keine offenen 1:1s mehr. Schreib mir, wenn du eins dazubuchen möchtest.'; end if;
  insert into public.bookings (user_id, starts_at, topic, minutes)
  values (v_uid, s.starts_at, left(coalesce(trim(p_topic), ''), 500), s.minutes)
  returning id into v_id;
  update public.slots set booking_id = v_id where id = s.id;
  perform public.booking_notify(v_id, 'gebucht');
  return json_build_object('id', v_id, 'starts_at', s.starts_at);
end;
$$;
revoke execute on function public.slot_book(uuid, text) from public, anon;
grant execute on function public.slot_book(uuid, text) to authenticated;

-- Schüler sagt ab (bis 24 Stunden vorher); die Zeit wird wieder frei
create or replace function public.booking_cancel(p_booking uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare b public.bookings;
begin
  select * into b from public.bookings where id = p_booking and user_id = auth.uid() and status = 'booked' for update;
  if b.id is null then raise exception 'Termin nicht gefunden.'; end if;
  if b.starts_at < now() + interval '24 hours' then raise exception 'Weniger als 24 Stunden vorher kannst du nicht mehr selbst absagen. Schreib mir bitte direkt.'; end if;
  update public.bookings set status = 'canceled' where id = b.id;
  update public.slots set booking_id = null where booking_id = b.id;
  perform public.booking_notify(b.id, 'abgesagt');
  return true;
end;
$$;
revoke execute on function public.booking_cancel(uuid) from public, anon;
grant execute on function public.booking_cancel(uuid) to authenticated;

-- Claude stellt freie Zeiten aus Saschas Kalender ein (nur mit x-claude-key)
create or replace function public.claude_slots_add(p_times timestamptz[], p_minutes int default 60)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare n int;
begin
  if not public.claude_key_ok() then raise exception 'nicht erlaubt'; end if;
  insert into public.slots (starts_at, minutes)
  select t, coalesce(p_minutes, 60) from unnest(p_times) t where t > now()
  on conflict (starts_at) do nothing;
  get diagnostics n = row_count;
  return n;
end;
$$;

create or replace function public.claude_slots()
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.claude_key_ok() then raise exception 'nicht erlaubt'; end if;
  return coalesce((select json_agg(json_build_object('id', s.id, 'wann', public.de_when(s.starts_at), 'start', s.starts_at,
    'minuten', s.minutes, 'gebucht_von', (select coalesce(nullif(p.full_name, ''), p.email) from public.bookings b join public.profiles p on p.id = b.user_id where b.id = s.booking_id))
    order by s.starts_at) from public.slots s where s.starts_at > now() - interval '1 day'), '[]'::json);
end;
$$;

create or replace function public.claude_slot_delete(p_slot uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.claude_key_ok() then raise exception 'nicht erlaubt'; end if;
  delete from public.slots where id = p_slot and booking_id is null;
  return found;
end;
$$;
revoke execute on function public.claude_slots_add(timestamptz[], int) from public, authenticated;
revoke execute on function public.claude_slots() from public, authenticated;
revoke execute on function public.claude_slot_delete(uuid) from public, authenticated;
grant execute on function public.claude_slots_add(timestamptz[], int) to anon;
grant execute on function public.claude_slots() to anon;
grant execute on function public.claude_slot_delete(uuid) to anon;
