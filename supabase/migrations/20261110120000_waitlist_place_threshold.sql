-- Genaue Nummer auf der Warteliste erst ab Platz 10 nennen.
-- Davor heißt es „Du gehörst zu den Ersten auf der Warteliste“, weil kleine Zahlen nach
-- „hier ist nichts los“ wirken. Der Coach sieht im Admin und in seinen Infos weiter die echte Nummer.
-- Die Website nutzt dafür CONFIG.waitlistShowPlaceFrom (gleicher Wert halten).

create or replace function public.waitlist_show_place(nr int)
returns boolean
language sql
immutable
as $$
  select coalesce(nr, 0) >= 10;
$$;

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
    || '<p style="margin:0 0 16px;">danke für dein Interesse an der Playback Masterclass! '
    || case when public.waitlist_show_place(nr) then 'Du bist <b>Nr. ' || nr || ' auf der Warteliste</b>.'
            else 'Du gehörst zu den <b>Ersten auf der Warteliste</b>.' end || '</p>'
    || '<p style="margin:0 0 16px;">Bitte bestätige kurz deine E-Mail-Adresse, damit ich dich über den Start informieren darf. '
    || 'Als Dankeschön bekommst du danach meine <b>Ableton-Shortcuts als PDF</b>.</p>';
  return jsonb_build_object(
    'from', c->>'from', 'reply_to', c->>'reply_to', 'to', jsonb_build_array(w.email),
    'subject', case when public.waitlist_show_place(nr) then 'Bitte bestätige deinen Eintrag: Nr. ' || nr || ' auf der Warteliste'
                    else 'Bitte bestätige deinen Eintrag auf der Warteliste' end,
    'html', public.mail_html(
      body
      || '',
      'Eintrag bestätigen', site || '#bestaetigen-' || w.token,
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
      || '<p style="margin:0 0 16px;">danke fürs Bestätigen! '
      || case when public.waitlist_show_place(nr) then 'Du stehst jetzt fest als <b>Nr. ' || nr || ' auf der Warteliste</b>.'
              else 'Du stehst jetzt fest auf der Warteliste, ganz vorne mit dabei.' end || '</p>'
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
        case when public.waitlist_show_place(public.waitlist_place(w.id))
             then 'Deine aktuelle Nummer: <b style="color:#1d1d1f;">Nr. ' || public.waitlist_place(w.id) || ' auf der Warteliste</b> · '
             else 'Du gehörst zu den Ersten auf der Warteliste · ' end
        || '<a href="' || site || '#platz-' || w.token || '" style="color:#6e6e73;">Stand ansehen</a><br><br>'
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

