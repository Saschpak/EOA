-- Geschenk-PDF per Mail: Die Bestätigungs-Mail kündigt es an,
-- nach dem Bestätigen kommt eine kurze Mail mit dem Download-Link.

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
    || '<p style="margin:0 0 16px;">Bitte bestätige kurz deine E-Mail-Adresse, damit ich dich über den Start informieren darf. '
    || 'Als Dankeschön bekommst du danach meine <b>Ableton-Shortcuts als PDF</b>.</p>';
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

-- Mail mit dem Geschenk nach der Bestätigung
create or replace function public.waitlist_gift_message(w public.waitlist)
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
begin
  return jsonb_build_object(
    'from', c->>'from', 'reply_to', c->>'reply_to', 'to', jsonb_build_array(w.email),
    'subject', 'Danke! Hier sind deine Ableton-Shortcuts',
    'html', public.mail_html(
      '<p style="margin:0 0 16px;">Hey ' || public.esc_html(split_part(trim(w.full_name), ' ', 1)) || ',</p>'
      || '<p style="margin:0 0 16px;">danke fürs Bestätigen! Du stehst jetzt fest als <b>Nr. ' || nr || ' auf der Warteliste</b>.</p>'
      || '<p style="margin:0 0 16px;">Wie versprochen: Hier sind meine Ableton-Shortcuts als PDF. Die Tastenkürzel, die ich beim Bauen meiner Live-Sets ständig benutze, für Mac und Windows.</p>',
      'PDF herunterladen', site || 'downloads/ableton-shortcuts.pdf',
      '<b style="color:#1d1d1f;">So geht es weiter:</b> Ich melde mich in der Reihenfolge der Warteliste für ein kostenloses Kennenlerngespräch. '
      || 'Danach entscheidest du in Ruhe, ob du einen der ' || (c->>'spots') || ' Teilnehmerplätze möchtest.<br><br>'
      || '<a href="' || site || '#abmelden-' || w.token || '" style="color:#6e6e73;">Von der Warteliste abmelden</a> · '
      || '<a href="' || site || 'impressum.html" style="color:#6e6e73;">Impressum</a>'),
    'headers', jsonb_build_object('List-Unsubscribe', '<' || site || '#abmelden-' || w.token || '>')
  );
end;
$$;
revoke execute on function public.waitlist_gift_message(public.waitlist) from public, anon, authenticated;

-- Bestätigen: beim ersten Mal das Geschenk per Mail schicken
create or replace function public.waitlist_confirm(p_token uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  rec public.waitlist%rowtype;
  was_confirmed boolean;
begin
  select confirmed_at is not null into was_confirmed from public.waitlist where token = p_token and status <> 'removed';
  if not found then return null; end if;
  update public.waitlist set confirmed_at = coalesce(confirmed_at, now())
   where token = p_token and status <> 'removed'
   returning * into rec;
  if not was_confirmed and rec.status = 'waiting' then
    begin
      perform public.send_mails('geschenk', jsonb_build_array(public.waitlist_gift_message(rec)));
    exception when others then
      raise warning 'Geschenk-Mail fehlgeschlagen: %', sqlerrm;
    end;
  end if;
  return json_build_object('name', rec.full_name, 'status', rec.status,
    'position', case when rec.status = 'waiting' then public.waitlist_place(rec.id) end);
end;
$$;
grant execute on function public.waitlist_confirm(uuid) to anon, authenticated;
