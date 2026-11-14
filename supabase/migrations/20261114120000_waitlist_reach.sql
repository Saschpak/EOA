-- Freiwillig: Instagram-Name oder Handynummer (WhatsApp), damit der Coach
-- Wartelisten-Leute schneller erreicht. Wird erst nach dem Eintragen abgefragt.

alter table public.waitlist
  add column if not exists reach text not null default ''
  check (char_length(reach) <= 80);

-- Interessent setzt oder ändert den Wert über seinen Token (aus dem Status-Link).
create or replace function public.waitlist_set_reach(p_token uuid, p_reach text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare v text := left(regexp_replace(btrim(coalesce(p_reach, '')), '\s+', ' ', 'g'), 80);
begin
  update public.waitlist set reach = v
   where token = p_token and status = 'waiting';
  return found;
end;
$$;
revoke execute on function public.waitlist_set_reach(uuid, text) from public;
grant execute on function public.waitlist_set_reach(uuid, text) to anon, authenticated;

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
    'reach', w.reach,
    'position', case when w.status = 'waiting' then public.waitlist_place(w.id) end
  )
  from public.waitlist w
  where w.token = p_token;
$$;

-- Claude sieht den Wert mit, um Nachhaken auch per Instagram/WhatsApp vorzuschlagen.
create or replace function public.claude_waitlist()
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare r json;
begin
  if not public.claude_key_ok() then raise exception 'Nicht erlaubt'; end if;
  select coalesce(json_agg(x order by x.nr), '[]'::json) into r from (
    select public.waitlist_place(w.id) as nr, w.email, w.full_name as name,
           w.confirmed_at is not null as bestaetigt, w.contact_stage as kontakt,
           w.contact_at as kontakt_seit, w.call_at as termin, w.created_at as eingetragen,
           w.reach as erreichbar
      from public.waitlist w
     where w.status = 'waiting') x;
  return r;
end;
$$;
grant execute on function public.claude_waitlist() to anon, authenticated;
