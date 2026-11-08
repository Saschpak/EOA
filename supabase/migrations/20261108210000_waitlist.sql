-- Warteliste: öffentlich eintragen, eigenen Platz abfragen, Coach verwaltet

create table public.waitlist (
  id          uuid primary key default gen_random_uuid(),
  email       text not null unique,
  full_name   text not null,
  note        text not null default '',
  token       uuid not null unique default gen_random_uuid(),
  status      text not null default 'waiting' check (status in ('waiting', 'invited', 'removed')),
  created_at  timestamptz not null default now()
);
create index waitlist_waiting_idx on public.waitlist (status, created_at, id);

alter table public.waitlist enable row level security;
create policy "waitlist: coach verwaltet" on public.waitlist
  for all to authenticated using (public.is_coach()) with check (public.is_coach());

-- Platz in der Warteliste (nur Einträge mit Status "waiting" zählen)
create or replace function public.waitlist_place(p_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
  from public.waitlist w, public.waitlist me
  where me.id = p_id
    and w.status = 'waiting'
    and (w.created_at, w.id) <= (me.created_at, me.id);
$$;
revoke execute on function public.waitlist_place(uuid) from public, anon, authenticated;

-- Öffentlich: eintragen
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
    'position', public.waitlist_place(rec.id)
  );
end;
$$;

-- Öffentlich: eigenen Platz über den persönlichen Token abfragen
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
    'position', case when w.status = 'waiting' then public.waitlist_place(w.id) end
  )
  from public.waitlist w
  where w.token = p_token;
$$;

-- Öffentlich: Zahlen für die Startseite
create or replace function public.waitlist_stats()
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object(
    'waiting', count(*) filter (where status = 'waiting'),
    'invited', count(*) filter (where status = 'invited')
  )
  from public.waitlist;
$$;

grant execute on function public.join_waitlist(text, text, text) to anon, authenticated;
grant execute on function public.waitlist_status(uuid) to anon, authenticated;
grant execute on function public.waitlist_stats() to anon, authenticated;
