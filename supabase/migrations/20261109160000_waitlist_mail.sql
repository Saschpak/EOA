-- E-Mails für die Warteliste über Resend.
-- Der Resend-Schlüssel liegt im Supabase Vault unter dem Namen "resend_api_key".
-- Ohne Schlüssel wird nichts verschickt, aber jeder Versuch protokolliert.

create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault with schema vault;

alter table public.waitlist add column confirmed_at timestamptz;
alter table public.waitlist add column unsubscribed_at timestamptz;

-- Protokoll aller Mails (nur für den Coach lesbar)
create table public.mail_log (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  kind        text not null,
  to_email    text not null,
  subject     text not null,
  status      text not null,          -- 'gesendet' | 'kein_schluessel'
  request_id  bigint
);
alter table public.mail_log enable row level security;
create policy "mail_log: coach liest" on public.mail_log
  for select to authenticated using (public.is_coach());

-- Einstellungen für den Versand
create or replace function public.mail_config()
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'from', 'Sascha · Playback Masterclass <masterclass@saschpak.de>',
    'reply_to', 'info@saschpak.de',
    'coach_email', 'info@saschpak.de',
    'site', 'https://coaching.saschpak.de/',
    'spots', 6
  );
$$;

create or replace function public.esc_html(p text)
returns text
language sql
immutable
as $$
  select replace(replace(replace(replace(coalesce(p, ''), '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;');
$$;

-- Einheitliches, schlichtes Mail-Layout
create or replace function public.mail_html(p_body text, p_cta_label text default null, p_cta_url text default null, p_footer text default '')
returns text
language sql
immutable
as $$
  select
    '<!doctype html><html lang="de"><body style="margin:0;padding:0;background:#f5f5f7;">'
    || '<div style="max-width:560px;margin:0 auto;padding:32px 20px;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif;color:#1d1d1f;font-size:16px;line-height:1.55;">'
    || '<p style="margin:0 0 24px;font-weight:700;font-size:15px;"><span style="color:#e8530f;">▮</span> Playback Masterclass</p>'
    || '<div style="background:#ffffff;border-radius:12px;padding:28px 26px;">'
    || p_body
    || case when p_cta_url is not null then
         '<p style="margin:28px 0 8px;"><a href="' || p_cta_url || '" style="display:inline-block;background:#e8530f;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:8px;">'
         || public.esc_html(p_cta_label) || '</a></p>'
       else '' end
    || '</div>'
    || '<p style="margin:20px 4px 0;font-size:12.5px;color:#6e6e73;line-height:1.5;">' || p_footer || '</p>'
    || '</div></body></html>';
$$;

-- Mehrere Mails in einem Rutsch an Resend (max. 100 pro Aufruf)
create or replace function public.send_mails(p_kind text, p_messages jsonb)
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_key text;
  v_req bigint;
  v_chunk jsonb;
  v_i int := 0;
  v_n int := jsonb_array_length(coalesce(p_messages, '[]'::jsonb));
  m jsonb;
begin
  if v_n = 0 then return 0; end if;
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'resend_api_key' limit 1;

  while v_i < v_n loop
    select coalesce(jsonb_agg(e), '[]'::jsonb) into v_chunk
      from (select e from jsonb_array_elements(p_messages) with ordinality as t(e, o) where o > v_i and o <= v_i + 100) s;
    if v_key is null or v_key = '' then
      v_req := null;
    else
      v_req := net.http_post(
        url := 'https://api.resend.com/emails/batch',
        body := v_chunk,
        headers := jsonb_build_object('Authorization', 'Bearer ' || v_key, 'Content-Type', 'application/json'),
        timeout_milliseconds := 10000
      );
    end if;
    for m in select * from jsonb_array_elements(v_chunk) loop
      insert into public.mail_log (kind, to_email, subject, status, request_id)
      values (p_kind, m->'to'->>0, m->>'subject', case when v_req is null then 'kein_schluessel' else 'gesendet' end, v_req);
    end loop;
    v_i := v_i + 100;
  end loop;
  return v_n;
end;
$$;
revoke execute on function public.send_mails(text, jsonb) from public, anon, authenticated;

-- Bestätigungs-Mail für einen Wartelisten-Eintrag
create or replace function public.waitlist_confirm_message(w public.waitlist)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  c jsonb := public.mail_config();
  site text := c->>'site';
  nr int := public.waitlist_place(w.id);
  first text := split_part(trim(w.full_name), ' ', 1);
  body text;
begin
  body :=
    '<p style="margin:0 0 16px;">Hey ' || public.esc_html(first) || ',</p>'
    || '<p style="margin:0 0 16px;">danke für dein Interesse an der Playback Masterclass! Du bist <b>Nr. ' || nr || ' auf der Warteliste</b>.</p>'
    || '<p style="margin:0 0 16px;">Bitte bestätige kurz deine E-Mail-Adresse, damit ich dich über den Start informieren darf.</p>';
  return jsonb_build_object(
    'from', c->>'from', 'reply_to', c->>'reply_to', 'to', jsonb_build_array(w.email),
    'subject', 'Bitte bestätige deinen Eintrag: Nr. ' || nr || ' auf der Warteliste',
    'html', public.mail_html(
      body
      || '',
      'Eintrag bestätigen', site || '#bestaetigen-' || w.token,
      '<b style="color:#1d1d1f;">So geht es weiter:</b> Ich melde mich in der Reihenfolge der Warteliste für ein kostenloses Kennenlerngespräch (ca. 20 Minuten). '
      || 'Danach entscheidest du in Ruhe, ob du einen der ' || (c->>'spots') || ' Teilnehmerplätze möchtest. '
      || 'Deine aktuelle Nummer siehst du jederzeit <a href="' || site || '#platz-' || w.token || '" style="color:#d9480f;">hier</a>.<br><br>'
      || 'Du bekommst diese Mail, weil du dich auf coaching.saschpak.de eingetragen hast. '
      || '<a href="' || site || '#abmelden-' || w.token || '" style="color:#6e6e73;">Von der Warteliste abmelden</a> · '
      || '<a href="' || site || 'impressum.html" style="color:#6e6e73;">Impressum</a>'),
    'headers', jsonb_build_object('List-Unsubscribe', '<' || site || '#abmelden-' || w.token || '>')
  );
end;
$$;
revoke execute on function public.waitlist_confirm_message(public.waitlist) from public, anon, authenticated;

-- Bei jedem neuen Eintrag: Bestätigung an die Person, Info an den Coach
create or replace function public.waitlist_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  c jsonb := public.mail_config();
  nr int;
begin
  if new.status <> 'waiting' then return new; end if;
  nr := public.waitlist_place(new.id);
  perform public.send_mails('bestaetigung', jsonb_build_array(public.waitlist_confirm_message(new)));
  perform public.send_mails('coach_info', jsonb_build_array(jsonb_build_object(
    'from', c->>'from', 'to', jsonb_build_array(c->>'coach_email'),
    'subject', 'Neu auf der Warteliste: ' || new.full_name || ' (Nr. ' || nr || ')',
    'html', public.mail_html(
      '<p style="margin:0 0 12px;"><b>' || public.esc_html(new.full_name) || '</b> hat sich eingetragen.</p>'
      || '<p style="margin:0 0 6px;">E-Mail: ' || public.esc_html(new.email) || '</p>'
      || '<p style="margin:0 0 6px;">Nummer: ' || nr || '</p>'
      || '<p style="margin:0 0 6px;">Quelle: ' || public.esc_html(coalesce(nullif(new.source, ''), 'unbekannt')) || '</p>'
      || case when new.note <> '' then '<p style="margin:12px 0 0;white-space:pre-line;">„' || public.esc_html(new.note) || '“</p>' else '' end,
      'Warteliste öffnen', (c->>'site') || '#admin', '')
  )));
  return new;
end;
$$;

create trigger waitlist_mail_after_insert
  after insert on public.waitlist
  for each row execute function public.waitlist_after_insert();

-- Öffentlich: Eintrag bestätigen (Double-Opt-in)
create or replace function public.waitlist_confirm(p_token uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare rec public.waitlist%rowtype;
begin
  update public.waitlist set confirmed_at = coalesce(confirmed_at, now())
   where token = p_token and status <> 'removed'
   returning * into rec;
  if not found then return null; end if;
  return json_build_object('name', rec.full_name, 'status', rec.status,
    'position', case when rec.status = 'waiting' then public.waitlist_place(rec.id) end);
end;
$$;

-- Öffentlich: von der Warteliste abmelden
create or replace function public.waitlist_unsubscribe(p_token uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.waitlist set status = 'removed', unsubscribed_at = now()
   where token = p_token and status = 'waiting';
  return found;
end;
$$;

grant execute on function public.waitlist_confirm(uuid) to anon, authenticated;
grant execute on function public.waitlist_unsubscribe(uuid) to anon, authenticated;

-- Coach: Bestätigungen an alle noch unbestätigten Wartenden (erneut) senden
create or replace function public.waitlist_resend_confirmations()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v jsonb;
begin
  if not public.is_coach() then raise exception 'Nur für den Coach'; end if;
  select coalesce(jsonb_agg(public.waitlist_confirm_message(w)), '[]'::jsonb) into v
    from public.waitlist w where w.status = 'waiting' and w.confirmed_at is null;
  return public.send_mails('bestaetigung', v);
end;
$$;

-- Coach: Einladung (Teilnehmerplatz bestätigt)
create or replace function public.waitlist_send_invite(p_id uuid, p_extra text default '')
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  c jsonb := public.mail_config();
  w public.waitlist%rowtype;
begin
  if not public.is_coach() then raise exception 'Nur für den Coach'; end if;
  select * into w from public.waitlist where id = p_id;
  if not found then raise exception 'Eintrag nicht gefunden'; end if;
  return public.send_mails('einladung', jsonb_build_array(jsonb_build_object(
    'from', c->>'from', 'reply_to', c->>'reply_to', 'to', jsonb_build_array(w.email),
    'subject', 'Dein Teilnehmerplatz in der Playback Masterclass',
    'html', public.mail_html(
      '<p style="margin:0 0 16px;">Hey ' || public.esc_html(split_part(trim(w.full_name), ' ', 1)) || ',</p>'
      || '<p style="margin:0 0 16px;">schön, dass du dabei bist! Dein <b>Teilnehmerplatz</b> in der Playback Masterclass ist bestätigt.</p>'
      || case when coalesce(p_extra, '') <> '' then '<p style="margin:0 0 16px;">' || public.esc_html(p_extra) || '</p>' else '' end
      || '<p style="margin:0 0 16px;">Erstelle jetzt dein Konto, und zwar mit genau dieser E-Mail-Adresse. Danach findest du dort alles Weitere.</p>',
      'Konto erstellen', (c->>'site') || '#registrieren',
      'Fragen? Antworte einfach auf diese Mail. · <a href="' || (c->>'site') || 'impressum.html" style="color:#6e6e73;">Impressum</a>')
  )));
end;
$$;

-- Coach: Nachricht an die Warteliste. Platzhalter im Text: {vorname}, {nr}
create or replace function public.waitlist_broadcast(p_subject text, p_body text, p_only_confirmed boolean default true)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  c jsonb := public.mail_config();
  site text := c->>'site';
  v jsonb;
begin
  if not public.is_coach() then raise exception 'Nur für den Coach'; end if;
  if coalesce(trim(p_subject), '') = '' or coalesce(trim(p_body), '') = '' then
    raise exception 'Bitte Betreff und Text ausfüllen.';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
      'from', c->>'from', 'reply_to', c->>'reply_to', 'to', jsonb_build_array(w.email),
      'subject', replace(replace(p_subject, '{vorname}', split_part(trim(w.full_name), ' ', 1)), '{nr}', public.waitlist_place(w.id)::text),
      'html', public.mail_html(
        '<div style="white-space:pre-line;">'
        || replace(replace(public.esc_html(p_body), '{vorname}', public.esc_html(split_part(trim(w.full_name), ' ', 1))), '{nr}', public.waitlist_place(w.id)::text)
        || '</div>',
        null, null,
        'Deine aktuelle Nummer: <b style="color:#1d1d1f;">Nr. ' || public.waitlist_place(w.id) || ' auf der Warteliste</b> · '
        || '<a href="' || site || '#platz-' || w.token || '" style="color:#6e6e73;">ansehen</a><br><br>'
        || 'Du bekommst diese Mail, weil du auf der Warteliste der Playback Masterclass stehst. '
        || '<a href="' || site || '#abmelden-' || w.token || '" style="color:#6e6e73;">Von der Warteliste abmelden</a> · '
        || '<a href="' || site || 'impressum.html" style="color:#6e6e73;">Impressum</a>'),
      'headers', jsonb_build_object('List-Unsubscribe', '<' || site || '#abmelden-' || w.token || '>')
    )), '[]'::jsonb) into v
  from public.waitlist w
  where w.status = 'waiting' and (not p_only_confirmed or w.confirmed_at is not null);
  return public.send_mails('rundmail', v);
end;
$$;

-- Coach: Ist ein Schlüssel hinterlegt?
create or replace function public.mail_ready()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_coach() and exists (select 1 from vault.decrypted_secrets where name = 'resend_api_key' and coalesce(decrypted_secret, '') <> '');
$$;

grant execute on function public.waitlist_resend_confirmations() to authenticated;
grant execute on function public.waitlist_send_invite(uuid, text) to authenticated;
grant execute on function public.waitlist_broadcast(text, text, boolean) to authenticated;
grant execute on function public.mail_ready() to authenticated;

-- Coach-Funktionen ausdrücklich nicht für anonyme Aufrufe freigeben
revoke execute on function public.waitlist_resend_confirmations() from public, anon;
revoke execute on function public.waitlist_send_invite(uuid, text) from public, anon;
revoke execute on function public.waitlist_broadcast(text, text, boolean) from public, anon;
revoke execute on function public.mail_ready() from public, anon;

-- Status-Link zeigt auch, ob der Eintrag bestätigt ist
create or replace function public.waitlist_status(p_token uuid)
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object(
    'name', w.full_name,
    'status', w.status,
    'early_bird', w.early_bird,
    'confirmed', w.confirmed_at is not null,
    'position', case when w.status = 'waiting' then public.waitlist_place(w.id) end
  )
  from public.waitlist w
  where w.token = p_token;
$$;

-- Coach: letzte Mails mit der Antwort von Resend (pg_net hebt Antworten einige Stunden auf)
create or replace function public.mail_log_status()
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare r json;
begin
  if not public.is_coach() then raise exception 'Nur für den Coach'; end if;
  select coalesce(json_agg(x order by x.created_at desc), '[]'::json) into r from (
    select l.id, l.created_at, l.kind, l.to_email, l.subject, l.status,
           h.status_code, coalesce(h.error_msg, case when h.status_code >= 300 then left(h.content::text, 300) end) as error
      from public.mail_log l
      left join net._http_response h on h.id = l.request_id
     order by l.created_at desc
     limit 40) x;
  return r;
end;
$$;
grant execute on function public.mail_log_status() to authenticated;
revoke execute on function public.mail_log_status() from public, anon;
