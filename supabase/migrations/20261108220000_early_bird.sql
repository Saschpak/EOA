-- Early-Bird: Die ersten 5 Einträge auf der Warteliste bekommen einen Bonus.
-- Der Early-Bird hängt an der Reihenfolge der Anmeldung und bleibt erhalten,
-- auch wenn sich der Platz später verschiebt.

alter table public.waitlist add column early_bird boolean not null default false;

create or replace function public.waitlist_early_bird_slots()
returns integer
language sql
immutable
as $$ select 5 $$;

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

  -- Gleichzeitige Anmeldungen nacheinander abarbeiten, damit nie mehr als 5 Early-Birds entstehen
  perform pg_advisory_xact_lock(hashtext('waitlist_join'));

  select * into rec from public.waitlist where email = v_email;
  if found then
    return json_build_object(
      'already', true,
      'status', rec.status,
      'early_bird', rec.early_bird,
      'position', case when rec.status = 'waiting' then public.waitlist_place(rec.id) end
    );
  end if;

  insert into public.waitlist (email, full_name, note, early_bird)
  values (
    v_email, v_name, v_note,
    (select count(*) from public.waitlist where early_bird) < public.waitlist_early_bird_slots()
  )
  returning * into rec;

  return json_build_object(
    'already', false,
    'status', rec.status,
    'token', rec.token,
    'early_bird', rec.early_bird,
    'position', public.waitlist_place(rec.id)
  );
end;
$$;

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
    'position', case when w.status = 'waiting' then public.waitlist_place(w.id) end
  )
  from public.waitlist w
  where w.token = p_token;
$$;

create or replace function public.waitlist_stats()
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object(
    'waiting', count(*) filter (where status = 'waiting'),
    'invited', count(*) filter (where status = 'invited'),
    'early_bird_slots', public.waitlist_early_bird_slots(),
    'early_bird_left', greatest(0, public.waitlist_early_bird_slots() - count(*) filter (where early_bird))
  )
  from public.waitlist;
$$;

grant execute on function public.waitlist_early_bird_slots() to anon, authenticated;
