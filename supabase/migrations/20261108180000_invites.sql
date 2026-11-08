-- Einladungen: Nur vom Coach eingeladene E-Mail-Adressen bekommen beim
-- Registrieren ihr 1:1-Paket und Kurszugang. Alle anderen bekommen ein
-- Profil ohne Zugang, das der Coach im Admin-Bereich sieht.

create table public.invites (
  email          text primary key,
  full_name      text not null default '',
  package_total  integer not null default 0 check (package_total >= 0),
  course_access  boolean not null default true,
  created_at     timestamptz not null default now()
);

alter table public.invites enable row level security;
create policy "invites: coach verwaltet" on public.invites
  for all to authenticated using (public.is_coach()) with check (public.is_coach());

-- E-Mails immer kleingeschrieben speichern
create or replace function public.lower_invite_email()
returns trigger
language plpgsql
as $$
begin
  new.email := lower(trim(new.email));
  return new;
end;
$$;

create trigger invites_lower_email
  before insert or update on public.invites
  for each row execute function public.lower_invite_email();

-- Kennzeichnet, ob ein Schüler eingeladen wurde
alter table public.profiles add column invited boolean not null default false;
update public.profiles set invited = true;

-- Neue Registrierungen: Einladung übernehmen, sonst ohne Zugang
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  inv public.invites%rowtype;
  is_coach_email boolean;
begin
  select * into inv from public.invites where email = lower(new.email);
  is_coach_email := exists (select 1 from public.coach_emails c where lower(c.email) = lower(new.email));

  insert into public.profiles (id, email, full_name, role, package_total, course_access, invited)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(nullif(inv.full_name, ''), new.raw_user_meta_data ->> 'full_name', ''),
    case when is_coach_email then 'coach' else 'student' end,
    coalesce(inv.package_total, 0),
    case when is_coach_email or inv.email is not null then coalesce(inv.course_access, true) else false end,
    is_coach_email or inv.email is not null
  );

  if inv.email is not null then
    delete from public.invites where email = inv.email;
  end if;
  return new;
end;
$$;
