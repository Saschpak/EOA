-- Schüler fragen zusätzliche 1:1s an. Der Coach bekommt eine Mail und eine Push-Nachricht (ohne Namen),
-- schickt die Rechnung und erhöht danach im Admin das 1:1-Paket (profiles.package_total).

create or replace function public.request_extra_sessions(p_count int, p_note text default '')
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  c jsonb := public.mail_config();
  p public.profiles;
  v_topic text;
  v_who text;
begin
  select * into p from public.profiles where id = auth.uid();
  if p.id is null or not p.course_access then raise exception 'Für dein Konto sind noch keine 1:1s freigeschaltet.'; end if;
  if p_count is null or p_count < 1 or p_count > 10 then raise exception 'Bitte zwischen 1 und 10 Sessions wählen.'; end if;
  v_who := coalesce(nullif(p.full_name, ''), p.email);
  begin
    select decrypted_secret into v_topic from vault.decrypted_secrets where name = 'ntfy_topic' limit 1;
    if coalesce(v_topic, '') <> '' then
      perform net.http_post(url := 'https://ntfy.sh/',
        body := jsonb_build_object('topic', v_topic, 'title', 'Mehr 1:1s angefragt',
          'message', p_count || ' zusätzliche ' || case when p_count = 1 then 'Session' else 'Sessions' end || ' angefragt – Details per Mail',
          'tags', jsonb_build_array('calendar'), 'click', (c->>'site') || '#admin'),
        headers := jsonb_build_object('Content-Type', 'application/json'), timeout_milliseconds := 5000);
    end if;
  exception when others then null;
  end;
  perform public.send_mails('buchung', jsonb_build_array(jsonb_build_object(
    'from', c->>'from', 'to', jsonb_build_array(c->>'coach_email'), 'reply_to', p.email,
    'subject', 'Mehr 1:1s angefragt: ' || v_who,
    'html', public.mail_html(
      '<p style="margin:0 0 12px;"><b>' || public.esc_html(v_who) || '</b> möchte <b>' || p_count || '</b> zusätzliche '
      || case when p_count = 1 then '1:1-Session' else '1:1-Sessions' end || '.</p>'
      || '<p style="margin:0 0 6px;">E-Mail: ' || public.esc_html(p.email) || '</p>'
      || '<p style="margin:0 0 6px;">Paket bisher: ' || p.package_total || ' Sessions</p>'
      || case when coalesce(trim(p_note), '') <> '' then '<p style="margin:0 0 6px;">Nachricht: ' || public.esc_html(left(p_note, 500)) || '</p>' else '' end
      || '<p style="margin:12px 0 0;">Nächste Schritte: Rechnung schicken und im Admin unter Schüler das 1:1-Paket erhöhen.</p>',
      'Admin öffnen', (c->>'site') || '#admin'))));
  return true;
end;
$$;
revoke execute on function public.request_extra_sessions(int, text) from public, anon;
grant execute on function public.request_extra_sessions(int, text) to authenticated;
