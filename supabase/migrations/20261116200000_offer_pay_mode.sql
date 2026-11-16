-- Beim Annehmen des Coachings wählt die Person die Zahlungsweise:
-- 'raten' (erste Rate als Anzahlung, Rest ab Kursstart) oder 'einmal' (Gesamtbetrag).

alter table public.offers add column if not exists pay_mode text not null default ''
  check (pay_mode in ('', 'raten', 'einmal'));

drop function if exists public.offer_answer(text, text);
create or replace function public.offer_answer(p_token text, p_choice text, p_pay text default '')
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
  v_pay text := case when p_choice = 'coaching' and p_pay in ('raten', 'einmal') then p_pay else '' end;
  v_pay_text text;
begin
  if p_choice not in ('coaching', 'einzelstunde') then raise exception 'Unbekannte Auswahl'; end if;
  select * into o from public.offers where id = public.offer_find(p_token) for update;
  if not found then raise exception 'Angebot nicht gefunden'; end if;
  if o.status <> 'offen' then return json_build_object('status', o.status, 'already', true); end if;
  if public.offer_expired(o) then raise exception 'Dieses Angebot ist leider abgelaufen.'; end if;
  if (p_choice = 'coaching' and o.full_price = 0) or (p_choice = 'einzelstunde' and o.single_price = 0) then
    raise exception 'Diese Option gehört nicht zum Angebot.';
  end if;

  update public.offers set status = p_choice, pay_mode = v_pay, answered_at = now(), updated_at = now() where id = o.id;
  v_what := case p_choice when 'coaching' then 'Coaching angenommen' else 'Einzelstunde angefragt' end;
  v_who := coalesce(nullif(trim(o.name), ''), nullif(o.email, ''), 'Jemand');
  v_pay_text := case v_pay
    when 'raten' then 'Zahlung in 4 Raten: ' || round(o.full_price / 4.0) || ' € Anzahlung jetzt, die weiteren Raten ab Kursstart'
    when 'einmal' then 'Zahlung einmalig: ' || o.full_price || ' €'
    else '' end;

  begin
    select decrypted_secret into v_topic from vault.decrypted_secrets where name = 'ntfy_topic' limit 1;
    if coalesce(v_topic, '') <> '' then
      perform net.http_post(
        url := 'https://ntfy.sh/',
        body := jsonb_build_object('topic', v_topic, 'title', 'Angebot: ' || v_what,
          'message', case p_choice when 'coaching' then '🎉 Ein Angebot wurde angenommen' else 'Eine Einzelstunde wurde angefragt' end
                     || case v_pay when 'raten' then ' (Raten)' when 'einmal' then ' (einmalig)' else '' end || ' – Details per Mail',
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
        || case when v_pay_text <> '' then '<p style="margin:0 0 6px;"><b>' || public.esc_html(v_pay_text) || '</b></p>' else '' end
        || '<p style="margin:12px 0 0;">Nächste Schritte: Rechnung schicken und im Admin „Platz zusagen“.</p>',
        'Admin öffnen', (c->>'site') || '#admin', '')
    )));
  exception when others then
    raise warning 'Benachrichtigung zum Angebot fehlgeschlagen: %', sqlerrm;
  end;

  return json_build_object('status', p_choice, 'pay_mode', v_pay, 'already', false);
end;
$$;
revoke execute on function public.offer_answer(text, text, text) from public;
grant execute on function public.offer_answer(text, text, text) to anon, authenticated;
