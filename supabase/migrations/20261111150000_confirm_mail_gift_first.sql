-- Startseite stellt jetzt das Gratis-PDF in den Vordergrund.
-- Die Bestätigungs-Mail spricht deshalb zuerst vom PDF und erst danach von der Warteliste.

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
    || '<p style="margin:0 0 16px;">schön, dass du dabei bist! Bestätige kurz deine E-Mail-Adresse, dann schicke ich dir direkt meine <b>Ableton-Shortcuts als PDF</b>.</p>'
    || '<p style="margin:0 0 16px;">Damit stehst du auch unverbindlich auf der Warteliste der Playback Masterclass'
    || case when public.waitlist_show_place(nr) then ' (<b>Nr. ' || nr || '</b>)' else ', ganz vorne mit dabei' end
    || ', und erfährst als Erstes, wenn es losgeht.</p>';
  return jsonb_build_object(
    'from', c->>'from', 'reply_to', c->>'reply_to', 'to', jsonb_build_array(w.email),
    'subject', 'Bitte bestätigen: deine Ableton-Shortcuts',
    'html', public.mail_html(
      body
      || '',
      'Adresse bestätigen und PDF holen', site || '#bestaetigen-' || w.token,
      '<b style="color:#1d1d1f;">So geht es weiter:</b> Ich melde mich in der Reihenfolge der Warteliste für ein kostenloses Kennenlerngespräch (ca. 20 Minuten). '
      || 'Danach entscheidest du in Ruhe, ob du einen der ' || (c->>'spots') || ' Teilnehmerplätze möchtest. '
      || 'Deinen Stand siehst du jederzeit <a href="' || site || '#platz-' || w.token || '" style="color:#d9480f;">hier</a>.<br><br>'
      || 'Du bekommst diese Mail, weil du dich auf coaching.saschpak.de eingetragen hast. '
      || '<a href="' || site || '#abmelden-' || w.token || '" style="color:#6e6e73;">Von der Warteliste abmelden</a> · '
      || '<a href="' || site || 'impressum.html" style="color:#6e6e73;">Impressum</a>'),
    'headers', jsonb_build_object('List-Unsubscribe', '<' || site || '#abmelden-' || w.token || '>')
  );
end;
$$;
revoke execute on function public.waitlist_confirm_message(public.waitlist) from public, anon, authenticated;
