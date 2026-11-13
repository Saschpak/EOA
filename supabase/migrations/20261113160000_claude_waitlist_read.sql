-- Lesezugang für Claude (gleicher Schlüssel wie claude_contact_update): wartende Einträge in Reihenfolge,
-- nur die Felder, die für Einladungen zum Kennenlerngespräch nötig sind.
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
           w.contact_at as kontakt_seit, w.call_at as termin, w.created_at as eingetragen
      from public.waitlist w
     where w.status = 'waiting') x;
  return r;
end;
$$;
grant execute on function public.claude_waitlist() to anon, authenticated;
