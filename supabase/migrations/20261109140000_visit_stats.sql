-- Besucherzählung ohne Cookies und ohne personenbezogene Daten:
-- pro Tag, Quelle und Gerätetyp nur ein Zähler.

create table public.visit_stats (
  day     date not null,
  source  text not null,
  device  text not null check (device in ('mobil', 'desktop')),
  views   integer not null default 0,
  primary key (day, source, device)
);

alter table public.visit_stats enable row level security;
create policy "visit_stats: coach liest" on public.visit_stats
  for select to authenticated using (public.is_coach());

-- Quelle normalisieren: Kleinbuchstaben, nur a-z 0-9 . _ -, max. 40 Zeichen
create or replace function public.clean_source(p text)
returns text
language sql
immutable
as $$
  select coalesce(nullif(left(regexp_replace(lower(coalesce(p, '')), '[^a-z0-9._-]', '', 'g'), 40), ''), 'direkt');
$$;

create or replace function public.track_visit(p_source text default '', p_device text default 'desktop')
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.visit_stats (day, source, device, views)
  values (
    (now() at time zone 'Europe/Berlin')::date,
    public.clean_source(p_source),
    case when p_device = 'mobil' then 'mobil' else 'desktop' end,
    1
  )
  on conflict (day, source, device) do update set views = public.visit_stats.views + 1;
end;
$$;
grant execute on function public.track_visit(text, text) to anon, authenticated;

-- Quelle auch bei der Warteliste merken
alter table public.waitlist add column source text not null default '';

drop function public.join_waitlist(text, text, text);
create function public.join_waitlist(p_name text, p_email text, p_note text default '', p_source text default '')
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
