-- Formular auf der Startseite fragt nur noch die E-Mail-Adresse ab, der Name ist optional.
-- Mails begrüßen ohne Namen mit „Hey,“; der Coach sieht dann die E-Mail-Adresse.

create or replace function public.mail_greeting(p_name text)
returns text
language sql
immutable
as $$
  select case when trim(coalesce(p_name, '')) = '' then 'Hey,'
              else 'Hey ' || public.esc_html(split_part(trim(p_name), ' ', 1)) || ',' end;
$$;

create or replace function public.join_waitlist(p_name text, p_email text, p_note text default '', p_source text default '')
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(p_email));
  v_name  text := trim(coalesce(p_name, ''));
  v_note  text := left(trim(coalesce(p_note, '')), 1000);
  rec public.waitlist%rowtype;
begin
  if length(v_name) > 100 then
    raise exception 'Der Name ist zu lang.';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(v_email) > 200 then
    raise exception 'Bitte gib eine gültige E-Mail-Adresse ein.';
  end if;

  select * into rec from public.waitlist where email = v_email;
  if found then
    return json_build_object(
      'already', true,
      'status', rec.status,
      'early_bird', rec.early_bird,
      'position', case when rec.status = 'waiting' then public.waitlist_place(rec.id) end
    );
  end if;

  insert into public.waitlist (email, full_name, note, source)
  values (v_email, v_name, v_note, public.clean_source(p_source))
  returning * into rec;

  return json_build_object(
    'already', false,
    'status', rec.status,
    'token', rec.token,
    'early_bird', false,
    'position', public.waitlist_place(rec.id)
  );
end;
$$;

grant execute on function public.join_waitlist(text, text, text, text) to anon, authenticated;

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
    '<p style="margin:0 0 16px;">' || public.mail_greeting(w.full_name) || '</p>'
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
      '<p style="margin:0 0 16px;">' || public.mail_greeting(w.full_name) || '</p>'
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
      '<p style="margin:0 0 16px;">' || public.mail_greeting(w.full_name) || '</p>'
      || '<p style="margin:0 0 16px;">schön, dass du dabei bist! Dein <b>Teilnehmerplatz</b> in der Playback Masterclass ist bestätigt.</p>'
      || case when coalesce(p_extra, '') <> '' then '<p style="margin:0 0 16px;">' || public.esc_html(p_extra) || '</p>' else '' end
      || '<p style="margin:0 0 16px;">Erstelle jetzt dein Konto, und zwar mit genau dieser E-Mail-Adresse. Danach findest du dort alles Weitere.</p>',
      'Konto erstellen', (c->>'site') || '#registrieren',
      'Fragen? Antworte einfach auf diese Mail. · <a href="' || (c->>'site') || 'impressum.html" style="color:#6e6e73;">Impressum</a>')
  )));
end;
$$;


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
      'subject', replace(replace(case when trim(w.full_name) = '' then replace(p_subject, ' {vorname}', '') else p_subject end, '{vorname}', split_part(trim(w.full_name), ' ', 1)), '{nr}', public.waitlist_place(w.id)::text),
      'html', public.mail_html(
        '<div style="white-space:pre-line;">'
        || replace(replace(case when trim(w.full_name) = '' then replace(public.esc_html(p_body), ' {vorname}', '') else public.esc_html(p_body) end, '{vorname}', public.esc_html(split_part(trim(w.full_name), ' ', 1))), '{nr}', public.waitlist_place(w.id)::text)
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
    'subject', 'Neu auf der Warteliste: ' || coalesce(nullif(trim(new.full_name), ''), new.email) || ' (Nr. ' || nr || ')',
    'html', public.mail_html(
      '<p style="margin:0 0 12px;"><b>' || public.esc_html(coalesce(nullif(trim(new.full_name), ''), new.email)) || '</b> hat sich eingetragen.</p>'
      || '<p style="margin:0 0 6px;">E-Mail: ' || public.esc_html(new.email) || '</p>'
      || '<p style="margin:0 0 6px;">Nummer: ' || nr || '</p>'
      || '<p style="margin:0 0 6px;">Quelle: ' || public.esc_html(coalesce(nullif(new.source, ''), 'unbekannt')) || '</p>'
      || case when new.note <> '' then '<p style="margin:12px 0 0;white-space:pre-line;">„' || public.esc_html(new.note) || '“</p>' else '' end,
      'Warteliste öffnen', (c->>'site') || '#admin', '')
  )));
  return new;
exception when others then
  -- Eine Störung beim Mailversand darf den Eintrag nie verhindern
  raise warning 'Wartelisten-Mail fehlgeschlagen: %', sqlerrm;
  return new;
end;
$$;

