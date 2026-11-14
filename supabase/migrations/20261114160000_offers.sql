-- Persönliche Angebote nach dem Kennenlerngespräch.
-- Jede Person bekommt einen geheimen Link (#angebot-<token>) mit Notiz, „Das nehmen wir uns vor“,
-- Optionen (komplettes Coaching und/oder Einzelstunden) und einer echten Frist.
-- Annehmen schickt dem Coach eine Push-Nachricht (ohne Namen) und eine Mail.

create table public.offers (
  id uuid primary key default gen_random_uuid(),
  waitlist_id uuid references public.waitlist(id) on delete set null,
  token uuid not null unique default gen_random_uuid(),
  email text not null default '',
  name text not null default '' check (char_length(name) <= 80),
  note text not null default '' check (char_length(note) <= 1500),
  plan jsonb not null default '[]'::jsonb,           -- [{"t": "Titel", "d": "Beschreibung"}, …]
  full_price integer not null default 0 check (full_price >= 0),   -- Euro brutto, 0 = Option ausblenden
  full_was integer not null default 0 check (full_was >= 0),       -- durchgestrichener Preis, 0 = keiner
  full_label text not null default '' check (char_length(full_label) <= 60),
  single_price integer not null default 0 check (single_price >= 0), -- Euro pro Stunde, 0 = ausblenden
  valid_until date,
  status text not null default 'offen' check (status in ('offen', 'coaching', 'einzelstunde')),
  viewed_at timestamptz,
  answered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index offers_waitlist_idx on public.offers (waitlist_id);

alter table public.offers enable row level security;
create policy "offers: coach verwaltet" on public.offers
  for all to authenticated using (public.is_coach()) with check (public.is_coach());

create or replace function public.offer_expired(o public.offers)
returns boolean
language sql
stable
as $$
  select o.valid_until is not null and o.valid_until < (now() at time zone 'Europe/Berlin')::date;
$$;

-- Öffentlich über den Token: Angebot lesen (merkt sich den ersten Aufruf)
create or replace function public.offer_get(p_token uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare o public.offers;
begin
  select * into o from public.offers where token = p_token;
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
revoke execute on function public.offer_get(uuid) from public;
grant execute on function public.offer_get(uuid) to anon, authenticated;

-- Öffentlich über den Token: Angebot annehmen ('coaching') oder Einzelstunde anfragen ('einzelstunde')
create or replace function public.offer_answer(p_token uuid, p_choice text)
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
  select * into o from public.offers where token = p_token for update;
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
revoke execute on function public.offer_answer(uuid, text) from public;
grant execute on function public.offer_answer(uuid, text) to anon, authenticated;

-- Claude legt Angebote an oder ändert ein noch offenes Angebot (nur mit x-claude-key)
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
      single_price = coalesce(p_single_price, 0), valid_until = p_valid_until, updated_at = now()
     where id = o.id returning * into o;
  else
    insert into public.offers (waitlist_id, email, name, note, plan, full_price, full_was, full_label, single_price, valid_until)
    values (w.id, lower(trim(p_email)), coalesce(p_name, ''), coalesce(p_note, ''), coalesce(p_plan, '[]'::jsonb),
            coalesce(p_full_price, 0), coalesce(p_full_was, 0), coalesce(p_full_label, ''), coalesce(p_single_price, 0), p_valid_until)
    returning * into o;
  end if;
  return json_build_object('token', o.token, 'status', o.status, 'waitlist', w.id is not null);
end;
$$;
revoke execute on function public.claude_offer_save(text, text, text, jsonb, integer, integer, text, integer, date) from public;
grant execute on function public.claude_offer_save(text, text, text, jsonb, integer, integer, text, integer, date) to anon, authenticated;

-- Claude sieht den Stand der Angebote (ohne Notizen)
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
         'gueltig_bis', valid_until, 'angesehen', viewed_at, 'beantwortet', answered_at, 'token', token)
         order by created_at), '[]'::json) into r from public.offers;
  return r;
end;
$$;
revoke execute on function public.claude_offers() from public;
grant execute on function public.claude_offers() to anon, authenticated;
