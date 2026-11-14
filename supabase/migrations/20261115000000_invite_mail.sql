-- Einladungs-Mail für Schüler, die der Coach direkt einlädt („Schüler einladen“).
-- Bewusst als eigene Funktion statt Trigger: „Platz zusagen“ aus der Warteliste
-- legt ebenfalls einen invites-Eintrag an und verschickt seine eigene Mail.

create or replace function public.invite_send_mail(p_email text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  c jsonb := public.mail_config();
  i public.invites%rowtype;
begin
  if not public.is_coach() then raise exception 'Nur für den Coach'; end if;
  select * into i from public.invites where email = lower(trim(p_email));
  if not found then raise exception 'Einladung nicht gefunden'; end if;
  return public.send_mails('einladung', jsonb_build_array(jsonb_build_object(
    'from', c->>'from', 'reply_to', c->>'reply_to', 'to', jsonb_build_array(i.email),
    'subject', 'Dein Zugang zur Playback Masterclass',
    'html', public.mail_html(
      '<p style="margin:0 0 16px;">' || public.mail_greeting(i.full_name) || '</p>'
      || '<p style="margin:0 0 16px;">ich habe dir einen Zugang zur Plattform der Playback Masterclass eingerichtet'
      || case when i.package_total > 0 then ', mit <b>' || i.package_total || ' 1:1-Session' || case when i.package_total = 1 then '' else 's' end || '</b>' || case when i.course_access then ' und dem Videokurs' else '' end
              when i.course_access then ', mit dem Videokurs' else '' end
      || '.</p>'
      || '<p style="margin:0 0 16px;">Erstelle jetzt dein Konto, und zwar mit genau dieser E-Mail-Adresse. Danach findest du dort alles Weitere.</p>',
      'Konto erstellen', (c->>'site') || '#registrieren',
      'Fragen? Antworte einfach auf diese Mail. · <a href="' || (c->>'site') || 'impressum.html" style="color:#6e6e73;">Impressum</a>')
  )));
end;
$$;
revoke execute on function public.invite_send_mail(text) from public, anon;
grant execute on function public.invite_send_mail(text) to authenticated;
