-- Coach: Bestätigungs-Mail an eine einzelne Person (erneut) senden
create or replace function public.waitlist_resend_confirmation(p_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare w public.waitlist%rowtype;
begin
  if not public.is_coach() then raise exception 'Nur für den Coach'; end if;
  select * into w from public.waitlist where id = p_id;
  if not found then raise exception 'Eintrag nicht gefunden'; end if;
  if w.status <> 'waiting' then raise exception 'Dieser Eintrag wartet nicht mehr.'; end if;
  if w.confirmed_at is not null then raise exception 'Dieser Eintrag ist schon bestätigt.'; end if;
  return public.send_mails('bestaetigung', jsonb_build_array(public.waitlist_confirm_message(w)));
end;
$$;
grant execute on function public.waitlist_resend_confirmation(uuid) to authenticated;
revoke execute on function public.waitlist_resend_confirmation(uuid) from public, anon;
