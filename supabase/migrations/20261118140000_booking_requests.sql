-- 1:1s werden angefragt, der Coach bestätigt oder lehnt ab.
-- Status: requested (angefragt, Zeit ist reserviert und zählt gegen das Paket), booked (bestätigt),
-- declined (abgelehnt, Zeit wieder frei), canceled (abgesagt, Zeit wieder frei).

alter table public.bookings drop constraint if exists bookings_status_check;
alter table public.bookings add constraint bookings_status_check check (status in ('requested', 'booked', 'canceled', 'declined'));
alter table public.bookings add column if not exists coach_note text not null default '';

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
  v_who text;
  v_hey text;
  v_msgs jsonb := '[]'::jsonb;
begin
  select * into b from public.bookings where id = p_booking;
  select * into p from public.profiles where id = b.user_id;
  if b.id is null or p.id is null then return; end if;
  v_when := public.de_when(b.starts_at);
  v_first := nullif(split_part(coalesce(p.full_name, ''), ' ', 1), '');
  v_who := coalesce(nullif(p.full_name, ''), p.email);
  v_hey := '<p style="margin:0 0 14px;">Hey' || coalesce(' ' || public.esc_html(v_first), '') || ',</p>';
  v_link := (c->>'site') || 'termin?t=' || to_char(b.starts_at at time zone 'Europe/Berlin', 'YYYYMMDD"T"HH24MI') || '&d=' || b.minutes || '&k=s';

  if p_kind in ('angefragt', 'abgesagt') then
    begin
      select decrypted_secret into v_topic from vault.decrypted_secrets where name = 'ntfy_topic' limit 1;
      if coalesce(v_topic, '') <> '' then
        perform net.http_post(url := 'https://ntfy.sh/',
          body := jsonb_build_object('topic', v_topic,
            'title', case p_kind when 'angefragt' then '1:1 angefragt' else '1:1 abgesagt' end,
            'message', case p_kind when 'angefragt' then 'Neue Anfrage für ' || v_when || ' – bitte bestätigen' else 'Abgesagt: ' || v_when end,
            'tags', jsonb_build_array('calendar'), 'click', (c->>'site') || '#admin'),
          headers := jsonb_build_object('Content-Type', 'application/json'), timeout_milliseconds := 5000);
      end if;
    exception when others then null;
    end;
  end if;

  if p_kind = 'angefragt' then
    v_msgs := jsonb_build_array(
      jsonb_build_object('from', c->>'from', 'to', jsonb_build_array(p.email), 'reply_to', c->>'reply_to',
        'subject', 'Deine 1:1-Anfrage für ' || v_when,
        'html', public.mail_html(v_hey
          || '<p style="margin:0 0 14px;">deine Anfrage für ein 1:1 am <b>' || v_when || '</b> ist bei mir angekommen. Ich schau in meinen Kalender und bestätige dir den Termin so schnell wie möglich.</p>'
          || '<p style="margin:0;">Liebe Grüße<br>Sascha</p>')),
      jsonb_build_object('from', c->>'from', 'to', jsonb_build_array(c->>'coach_email'), 'reply_to', p.email,
        'subject', '1:1 angefragt: ' || v_who || ', ' || v_when,
        'html', public.mail_html(
          '<p style="margin:0 0 12px;"><b>' || public.esc_html(v_who) || '</b> fragt ein 1:1 an.</p>'
          || '<p style="margin:0 0 6px;">Wann: ' || v_when || ' (' || b.minutes || ' Minuten)</p>'
          || case when b.topic <> '' then '<p style="margin:0 0 6px;">Thema: ' || public.esc_html(b.topic) || '</p>' else '' end
          || '<p style="margin:12px 0 0;">Bestätigen oder ablehnen im Admin unter „1:1-Zeiten“.</p>',
          'Admin öffnen', (c->>'site') || '#admin')));
  elsif p_kind = 'bestaetigt' then
    v_msgs := jsonb_build_array(jsonb_build_object('from', c->>'from', 'to', jsonb_build_array(p.email), 'reply_to', c->>'reply_to',
      'subject', 'Dein 1:1 am ' || v_when || ' ist bestätigt',
      'html', public.mail_html(v_hey
        || '<p style="margin:0 0 14px;">dein 1:1 ist bestätigt: <b>' || v_when || '</b> (' || b.minutes || ' Minuten).</p>'
        || case when b.coach_note <> '' then '<p style="margin:0 0 14px;">' || public.esc_html(b.coach_note) || '</p>' else '' end
        || '<p style="margin:0 0 14px;">Den Link für den Video-Call bekommst du rechtzeitig vorher von mir. Absagen kannst du bis 24 Stunden vorher selbst auf der Plattform unter 1:1s.</p>'
        || '<p style="margin:0;">Liebe Grüße<br>Sascha</p>',
        'In meinen Kalender eintragen', v_link)));
  elsif p_kind = 'abgelehnt' then
    v_msgs := jsonb_build_array(jsonb_build_object('from', c->>'from', 'to', jsonb_build_array(p.email), 'reply_to', c->>'reply_to',
      'subject', 'Dein 1:1 am ' || v_when,
      'html', public.mail_html(v_hey
        || '<p style="margin:0 0 14px;">am <b>' || v_when || '</b> klappt es bei mir leider doch nicht.'
        || case when b.coach_note <> '' then ' ' || public.esc_html(b.coach_note) else '' end || '</p>'
        || '<p style="margin:0 0 14px;">Die Session ist wieder in deinem Paket. Such dir unter 1:1s gern eine andere Zeit aus.</p>'
        || '<p style="margin:0;">Liebe Grüße<br>Sascha</p>',
        'Andere Zeit aussuchen', (c->>'site') || '#sessions')));
  elsif p_kind = 'abgesagt' then
    v_msgs := jsonb_build_array(jsonb_build_object('from', c->>'from', 'to', jsonb_build_array(c->>'coach_email'), 'reply_to', p.email,
      'subject', '1:1 abgesagt: ' || v_who || ', ' || v_when,
      'html', public.mail_html('<p style="margin:0;"><b>' || public.esc_html(v_who) || '</b> hat das 1:1 am ' || v_when || ' abgesagt. Die Zeit ist wieder frei.</p>')));
  end if;
  if jsonb_array_length(v_msgs) > 0 then perform public.send_mails('buchung', v_msgs); end if;
exception when others then null;
end;
$$;
revoke execute on function public.booking_notify(uuid, text) from public, anon, authenticated;

-- Schüler fragt eine freie Zeit an (mindestens 48 Stunden vorher); die Zeit ist damit reserviert
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
  if s.id is null or s.starts_at < now() + interval '48 hours' then raise exception 'Diese Zeit ist nicht mehr buchbar. 1:1s kannst du bis 48 Stunden vorher anfragen.'; end if;
  if s.booking_id is not null then raise exception 'Diese Zeit wurde gerade schon angefragt. Such dir bitte eine andere aus.'; end if;
  v_left := p.package_total
    - (select count(*) from public.sessions x where x.user_id = v_uid)
    - (select count(*) from public.bookings x where x.user_id = v_uid and x.status in ('requested', 'booked') and x.starts_at >= now() - interval '2 hours');
  if v_left <= 0 and p.role <> 'coach' then raise exception 'Du hast gerade keine offenen 1:1s mehr. Unten kannst du weitere dazubuchen.'; end if;
  insert into public.bookings (user_id, starts_at, topic, minutes, status)
  values (v_uid, s.starts_at, left(coalesce(trim(p_topic), ''), 500), s.minutes, 'requested')
  returning id into v_id;
  update public.slots set booking_id = v_id where id = s.id;
  perform public.booking_notify(v_id, 'angefragt');
  return json_build_object('id', v_id, 'starts_at', s.starts_at, 'status', 'requested');
end;
$$;

-- Schüler zieht eine Anfrage zurück (jederzeit) oder sagt ein bestätigtes 1:1 ab (bis 24 Stunden vorher)
create or replace function public.booking_cancel(p_booking uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare b public.bookings;
begin
  select * into b from public.bookings where id = p_booking and user_id = auth.uid() and status in ('requested', 'booked') for update;
  if b.id is null then raise exception 'Termin nicht gefunden.'; end if;
  if b.status = 'booked' and b.starts_at < now() + interval '24 hours' then raise exception 'Weniger als 24 Stunden vorher kannst du nicht mehr selbst absagen. Schreib mir bitte direkt.'; end if;
  update public.bookings set status = 'canceled' where id = b.id;
  update public.slots set booking_id = null where booking_id = b.id;
  perform public.booking_notify(b.id, 'abgesagt');
  return true;
end;
$$;

-- Coach bestätigt oder lehnt ab
create or replace function public.booking_decide(p_booking uuid, p_ok boolean, p_note text default '')
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare b public.bookings;
begin
  if not (public.is_coach() or public.claude_key_ok()) then raise exception 'nicht erlaubt'; end if;
  select * into b from public.bookings where id = p_booking and status = 'requested' for update;
  if b.id is null then raise exception 'Diese Anfrage ist nicht mehr offen.'; end if;
  update public.bookings set status = case when p_ok then 'booked' else 'declined' end, coach_note = left(coalesce(trim(p_note), ''), 500) where id = b.id;
  if not p_ok then update public.slots set booking_id = null where booking_id = b.id; end if;
  perform public.booking_notify(b.id, case when p_ok then 'bestaetigt' else 'abgelehnt' end);
  return true;
end;
$$;
revoke execute on function public.booking_decide(uuid, boolean, text) from public;
grant execute on function public.booking_decide(uuid, boolean, text) to anon, authenticated;

create or replace function public.claude_slots()
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.claude_key_ok() then raise exception 'nicht erlaubt'; end if;
  return coalesce((select json_agg(json_build_object('id', s.id, 'wann', public.de_when(s.starts_at), 'start', s.starts_at, 'minuten', s.minutes,
    'buchung', s.booking_id, 'status', b.status, 'von', coalesce(nullif(p.full_name, ''), p.email), 'thema', b.topic)
    order by s.starts_at)
    from public.slots s left join public.bookings b on b.id = s.booking_id left join public.profiles p on p.id = b.user_id
    where s.starts_at > now() - interval '1 day'), '[]'::json);
end;
$$;
