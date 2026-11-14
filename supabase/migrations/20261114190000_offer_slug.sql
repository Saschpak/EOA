-- Kurze, lesbare Links für Angebote: coaching.saschpak.de/angebot/<vorname>-<code>
-- Der Code (5 Zeichen) macht den Link schwer zu erraten; der lange Token funktioniert weiter.

create or replace function public.offer_make_slug(p_name text)
returns text
language plpgsql
volatile
as $$
declare
  base text := lower(coalesce(nullif(trim(split_part(coalesce(p_name, ''), ' ', 1)), ''), 'angebot'));
  abc text := 'abcdefghjkmnpqrstuvwxyz23456789';
  code text;
  s text;
begin
  base := translate(base, 'äöüß', 'aous');
  base := regexp_replace(base, '[^a-z0-9]+', '', 'g');
  if base = '' then base := 'angebot'; end if;
  base := left(base, 24);
  loop
    code := '';
    for i in 1..5 loop
      code := code || substr(abc, 1 + floor(random() * length(abc))::int, 1);
    end loop;
    s := base || '-' || code;
    exit when not exists (select 1 from public.offers where slug = s);
  end loop;
  return s;
end;
$$;
revoke execute on function public.offer_make_slug(text) from public, anon, authenticated;

alter table public.offers add column if not exists slug text unique;
update public.offers set slug = public.offer_make_slug(name) where slug is null;

create or replace function public.offers_set_slug()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.slug is null or new.slug = '' then new.slug := public.offer_make_slug(new.name); end if;
  return new;
end;
$$;
revoke execute on function public.offers_set_slug() from public, anon, authenticated;
create trigger offers_set_slug before insert on public.offers
  for each row execute function public.offers_set_slug();

-- Lesen und Annehmen gehen jetzt mit dem kurzen Code oder dem langen Token
drop function if exists public.offer_get(uuid);
drop function if exists public.offer_answer(uuid, text);

create or replace function public.offer_find(p_key text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.offers
   where slug = lower(trim(p_key)) or token::text = lower(trim(p_key))
   limit 1;
$$;
revoke execute on function public.offer_find(text) from public, anon, authenticated;

create or replace function public.offer_get(p_token text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare o public.offers;
begin
  select * into o from public.offers where id = public.offer_find(p_token);
  if not found then return null; end if;
  if o.viewed_at is null and coalesce(auth.uid()::text, '') = '' then
    update public.offers set viewed_at = now() where id = o.id;
  end if;
  return json_build_object(
    'name', o.name, 'note', o.note, 'plan', o.plan,
    'full_price', o.full_price, 'full_was', o.full_was, 'full_label', o.full_label,
    'single_price', o.single_price, 'valid_until', o.valid_until,
    'status', o.status, 'expired', public.offer_expired(o), 'created_at', o.created_at
  );
end;
$$;
revoke execute on function public.offer_get(text) from public;
grant execute on function public.offer_get(text) to anon, authenticated;

create or replace function public.offer_answer(p_token text, p_choice text)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  o public.offers;
  c jsonb := public.mail_config();
  v_topic text;
  v_what text;
  v_who text;
begin
  if p_choice not in ('coaching', 'einzelstunde') then raise exception 'Unbekannte Auswahl'; end if;
  select * into o from public.offers where id = public.offer_find(p_token) for update;
  if not found then raise exception 'Angebot nicht gefunden'; end if;
  if o.status <> 'offen' then return json_build_object('status', o.status, 'already', true); end if;
  if public.offer_expired(o) then raise exception 'Dieses Angebot ist leider abgelaufen.'; end if;
  if (p_choice = 'coaching' and o.full_price = 0) or (p_choice = 'einzelstunde' and o.single_price = 0) then
    raise exception 'Diese Option gehört nicht zum Angebot.';
  end if;

  update public.offers set status = p_choice, answered_at = now(), updated_at = now() where id = o.id;
  v_what := case p_choice when 'coaching' then 'Coaching angenommen' else 'Einzelstunde angefragt' end;
  v_who := coalesce(nullif(trim(o.name), ''), nullif(o.email, ''), 'Jemand');

  begin
    select decrypted_secret into v_topic from vault.decrypted_secrets where name = 'ntfy_topic' limit 1;
    if coalesce(v_topic, '') <> '' then
      perform net.http_post(
        url := 'https://ntfy.sh/',
        body := jsonb_build_object('topic', v_topic, 'title', 'Angebot: ' || v_what,
          'message', case p_choice when 'coaching' then '🎉 Ein Angebot wurde angenommen' else 'Eine Einzelstunde wurde angefragt' end || ' – Details per Mail',
          'tags', jsonb_build_array('tada'), 'click', 'https://coaching.saschpak.de/#admin'),
        headers := jsonb_build_object('Content-Type', 'application/json'),
        timeout_milliseconds := 5000);
    end if;
    perform public.send_mails('coach_info', jsonb_build_array(jsonb_build_object(
      'from', c->>'from', 'to', jsonb_build_array(c->>'coach_email'),
      'reply_to', nullif(o.email, ''),
      'subject', v_what || ': ' || v_who,
      'html', public.mail_html(
        '<p style="margin:0 0 12px;"><b>' || public.esc_html(v_who) || '</b>: ' || v_what || '.</p>'
        || case when o.email <> '' then '<p style="margin:0 0 6px;">E-Mail: ' || public.esc_html(o.email) || '</p>' else '' end
        || '<p style="margin:0 0 6px;">'
        || case p_choice when 'coaching' then 'Komplettes Coaching für ' || o.full_price || ' € insgesamt'
                         else 'Einzelstunde für ' || o.single_price || ' € pro Stunde' end || '</p>'
        || '<p style="margin:12px 0 0;">Nächste Schritte: Rechnung schicken und im Admin „Platz zusagen“.</p>',
        'Admin öffnen', (c->>'site') || '#admin', '')
    )));
  exception when others then
    raise warning 'Benachrichtigung zum Angebot fehlgeschlagen: %', sqlerrm;
  end;

  return json_build_object('status', p_choice, 'already', false);
end;
$$;
revoke execute on function public.offer_answer(text, text) from public;
grant execute on function public.offer_answer(text, text) to anon, authenticated;

-- Claude bekommt den kurzen Code mit zurück
create or replace function public.claude_offer_save(
  p_email text, p_name text, p_note text, p_plan jsonb,
  p_full_price integer, p_full_was integer, p_full_label text,
  p_single_price integer, p_valid_until date)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare w public.waitlist; o public.offers;
begin
  if not public.claude_key_ok() then raise exception 'Nicht erlaubt'; end if;
  select * into w from public.waitlist where email = lower(trim(p_email)) limit 1;
  select * into o from public.offers
   where (w.id is not null and waitlist_id = w.id) or email = lower(trim(p_email))
   order by created_at desc limit 1;
  if found and o.status <> 'offen' then raise exception 'Angebot wurde schon beantwortet'; end if;
  if found then
    update public.offers set name = coalesce(p_name, ''), note = coalesce(p_note, ''), plan = coalesce(p_plan, '[]'::jsonb),
      full_price = coalesce(p_full_price, 0), full_was = coalesce(p_full_was, 0), full_label = coalesce(p_full_label, ''),
      single_price = coalesce(p_single_price, 0), valid_until = p_valid_until, updated_at = now(),
      waitlist_id = coalesce(waitlist_id, w.id)
     where id = o.id returning * into o;
  else
    insert into public.offers (waitlist_id, email, name, note, plan, full_price, full_was, full_label, single_price, valid_until)
    values (w.id, lower(trim(p_email)), coalesce(p_name, ''), coalesce(p_note, ''), coalesce(p_plan, '[]'::jsonb),
            coalesce(p_full_price, 0), coalesce(p_full_was, 0), coalesce(p_full_label, ''), coalesce(p_single_price, 0), p_valid_until)
    returning * into o;
  end if;
  return json_build_object('token', o.token, 'slug', o.slug, 'status', o.status, 'waitlist', w.id is not null);
end;
$$;

create or replace function public.claude_offers()
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare r json;
begin
  if not public.claude_key_ok() then raise exception 'Nicht erlaubt'; end if;
  select coalesce(json_agg(json_build_object('email', email, 'name', name, 'status', status,
         'gueltig_bis', valid_until, 'angesehen', viewed_at, 'beantwortet', answered_at, 'slug', slug)
         order by created_at), '[]'::json) into r from public.offers;
  return r;
end;
$$;
