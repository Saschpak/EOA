-- Ausnahme vom Countdown: Einzelne Schüler sehen den Kurs schon vor dem Kursstart.
-- Gesetzt vom Coach beim Einladen (invites) oder später im Schüler-Profil.

alter table public.profiles add column if not exists early_access boolean not null default false;
alter table public.invites add column if not exists early_access boolean not null default false;

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

  insert into public.profiles (id, email, full_name, role, package_total, course_access, invited, early_access)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(nullif(inv.full_name, ''), new.raw_user_meta_data ->> 'full_name', ''),
    case when is_coach_email then 'coach' else 'student' end,
    coalesce(inv.package_total, 0),
    case when is_coach_email or inv.email is not null then coalesce(inv.course_access, true) else false end,
    is_coach_email or inv.email is not null,
    coalesce(inv.early_access, false)
  );

  if inv.email is not null then
    delete from public.invites where email = inv.email;
  end if;
  return new;
end;
$$;
