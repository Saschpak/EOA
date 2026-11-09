-- Early-Bird gilt für die ersten Buchungen, nicht für die ersten Einträge.
-- Beim Eintragen auf die Warteliste wird kein Early-Bird mehr vergeben.
-- Der Coach markiert ihn beim Einladen (Zusage nach dem Kennenlerngespräch).

create or replace function public.join_waitlist(p_name text, p_email text, p_note text default '')
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
  if v_name = '' or length(v_name) > 100 then
    raise exception 'Bitte gib deinen Namen ein.';
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

  insert into public.waitlist (email, full_name, note)
  values (v_email, v_name, v_note)
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

-- Früher automatisch vergebene Early-Birds für noch Wartende zurücksetzen
update public.waitlist set early_bird = false where status = 'waiting';
