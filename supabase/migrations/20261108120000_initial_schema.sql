-- Playback Coaching: Grundschema
-- Rollen: "coach" (Admin) und "student". Zugriffe sind per Row Level Security geregelt.

-- ---------------------------------------------------------------
-- Profile
-- ---------------------------------------------------------------
create table public.profiles (
  id             uuid primary key references auth.users (id) on delete cascade,
  email          text not null,
  full_name      text not null default '',
  role           text not null default 'student' check (role in ('student', 'coach')),
  package_total  integer not null default 0 check (package_total >= 0),
  course_access  boolean not null default true,
  started_at     date not null default current_date,
  created_at     timestamptz not null default now()
);

-- E-Mail-Adressen, die beim Registrieren automatisch Coach-Rechte bekommen
create table public.coach_emails (
  email text primary key
);

create or replace function public.is_coach()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'coach'
  );
$$;

-- Legt bei jeder Registrierung automatisch ein Profil an
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    case when exists (select 1 from public.coach_emails c where lower(c.email) = lower(new.email))
         then 'coach' else 'student' end
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------
-- Kurs
-- ---------------------------------------------------------------
create table public.modules (
  id          uuid primary key default gen_random_uuid(),
  position    integer not null default 0,
  title       text not null,
  drip_type   text not null default 'now' check (drip_type in ('now', 'days', 'sessions', 'manual')),
  drip_value  integer check (drip_value is null or drip_value >= 1),
  created_at  timestamptz not null default now(),
  constraint drip_value_required check (drip_type not in ('days', 'sessions') or drip_value is not null)
);

create table public.lessons (
  id                uuid primary key default gen_random_uuid(),
  module_id         uuid not null references public.modules (id) on delete cascade,
  position          integer not null default 0,
  title             text not null,
  duration_seconds  integer not null default 0 check (duration_seconds >= 0),
  points            text[] not null default '{}',
  video_id          text,            -- ID des Videos bei Bunny Stream
  created_at        timestamptz not null default now()
);
create index lessons_module_idx on public.lessons (module_id, position);

create table public.lesson_files (
  id            uuid primary key default gen_random_uuid(),
  lesson_id     uuid not null references public.lessons (id) on delete cascade,
  file_name     text not null,
  storage_path  text not null,       -- Pfad im Storage-Bucket "lesson-files"
  created_at    timestamptz not null default now()
);
create index lesson_files_lesson_idx on public.lesson_files (lesson_id);

create table public.lesson_progress (
  user_id       uuid not null references public.profiles (id) on delete cascade,
  lesson_id     uuid not null references public.lessons (id) on delete cascade,
  completed_at  timestamptz not null default now(),
  primary key (user_id, lesson_id)
);

-- Vom Coach vorzeitig freigeschaltete Module
create table public.module_unlocks (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  module_id  uuid not null references public.modules (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, module_id)
);

-- ---------------------------------------------------------------
-- 1:1s
-- ---------------------------------------------------------------
-- Abgehaltene Sessions (zählen als genutzt)
create table public.sessions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  held_on     date not null,
  topic       text not null,
  notes       text not null default '',
  created_at  timestamptz not null default now()
);
create index sessions_user_idx on public.sessions (user_id, held_on desc);

create table public.session_tasks (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references public.sessions (id) on delete cascade,
  position    integer not null default 0,
  body        text not null,
  done        boolean not null default false
);
create index session_tasks_session_idx on public.session_tasks (session_id, position);

-- Gebuchte Termine (später automatisch aus Calendly)
create table public.bookings (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  starts_at    timestamptz not null,
  topic        text not null default '',
  status       text not null default 'booked' check (status in ('booked', 'canceled')),
  external_id  text unique,          -- Calendly-Event
  created_at   timestamptz not null default now()
);
create index bookings_user_idx on public.bookings (user_id, starts_at);

-- ---------------------------------------------------------------
-- Fragen und News
-- ---------------------------------------------------------------
create table public.questions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  lesson_id    uuid references public.lessons (id) on delete set null,
  body         text not null check (length(body) > 0),
  answer       text,
  answered_at  timestamptz,
  created_at   timestamptz not null default now()
);
create index questions_open_idx on public.questions (answered_at nulls first, created_at desc);

create table public.news (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  body          text not null,
  published_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------
-- Drip: Ist ein Modul für einen Schüler freigeschaltet?
-- ---------------------------------------------------------------
create or replace function public.module_is_unlocked(p_user uuid, p_module uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.modules m
    join public.profiles p on p.id = p_user
    where m.id = p_module
      and p.course_access
      and (
        exists (select 1 from public.module_unlocks u where u.user_id = p_user and u.module_id = p_module)
        or m.drip_type = 'now'
        or (m.drip_type = 'days' and p.started_at + m.drip_value <= current_date)
        or (m.drip_type = 'sessions'
            and (select count(*) from public.sessions s where s.user_id = p_user) >= m.drip_value)
      )
  );
$$;

-- Schüler haken ihre eigenen Aufgaben ab, ohne den Text ändern zu dürfen
create or replace function public.set_task_done(p_task uuid, p_done boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.session_tasks t
     set done = p_done
    from public.sessions s
   where t.id = p_task
     and s.id = t.session_id
     and (s.user_id = auth.uid() or public.is_coach());
  if not found then
    raise exception 'Aufgabe nicht gefunden';
  end if;
end;
$$;

-- ---------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------
alter table public.profiles        enable row level security;
alter table public.coach_emails    enable row level security;
alter table public.modules         enable row level security;
alter table public.lessons         enable row level security;
alter table public.lesson_files    enable row level security;
alter table public.lesson_progress enable row level security;
alter table public.module_unlocks  enable row level security;
alter table public.sessions        enable row level security;
alter table public.session_tasks   enable row level security;
alter table public.bookings        enable row level security;
alter table public.questions       enable row level security;
alter table public.news            enable row level security;

-- Profile: Schüler sehen sich selbst, der Coach sieht und verwaltet alle
create policy "profiles: eigenes lesen" on public.profiles
  for select to authenticated using (id = auth.uid() or public.is_coach());
create policy "profiles: coach verwaltet" on public.profiles
  for all to authenticated using (public.is_coach()) with check (public.is_coach());

create policy "coach_emails: coach verwaltet" on public.coach_emails
  for all to authenticated using (public.is_coach()) with check (public.is_coach());

-- Kursstruktur: für eingeloggte Nutzer lesbar, nur der Coach ändert
create policy "modules: lesen" on public.modules
  for select to authenticated using (true);
create policy "modules: coach verwaltet" on public.modules
  for all to authenticated using (public.is_coach()) with check (public.is_coach());

create policy "lessons: lesen" on public.lessons
  for select to authenticated using (true);
create policy "lessons: coach verwaltet" on public.lessons
  for all to authenticated using (public.is_coach()) with check (public.is_coach());

create policy "lesson_files: lesen wenn freigeschaltet" on public.lesson_files
  for select to authenticated using (
    public.is_coach()
    or exists (
      select 1 from public.lessons l
      where l.id = lesson_id and public.module_is_unlocked(auth.uid(), l.module_id)
    )
  );
create policy "lesson_files: coach verwaltet" on public.lesson_files
  for all to authenticated using (public.is_coach()) with check (public.is_coach());

-- Fortschritt: eigener Fortschritt, nur in freigeschalteten Modulen
create policy "progress: eigenes lesen" on public.lesson_progress
  for select to authenticated using (user_id = auth.uid() or public.is_coach());
create policy "progress: eigenes eintragen" on public.lesson_progress
  for insert to authenticated with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.lessons l
      where l.id = lesson_id and public.module_is_unlocked(auth.uid(), l.module_id)
    )
  );
create policy "progress: eigenes entfernen" on public.lesson_progress
  for delete to authenticated using (user_id = auth.uid());

create policy "unlocks: eigenes lesen" on public.module_unlocks
  for select to authenticated using (user_id = auth.uid() or public.is_coach());
create policy "unlocks: coach verwaltet" on public.module_unlocks
  for all to authenticated using (public.is_coach()) with check (public.is_coach());

-- Sessions und Aufgaben: Schüler lesen ihre eigenen, der Coach schreibt
create policy "sessions: eigenes lesen" on public.sessions
  for select to authenticated using (user_id = auth.uid() or public.is_coach());
create policy "sessions: coach verwaltet" on public.sessions
  for all to authenticated using (public.is_coach()) with check (public.is_coach());

create policy "tasks: eigenes lesen" on public.session_tasks
  for select to authenticated using (
    public.is_coach()
    or exists (select 1 from public.sessions s where s.id = session_id and s.user_id = auth.uid())
  );
create policy "tasks: coach verwaltet" on public.session_tasks
  for all to authenticated using (public.is_coach()) with check (public.is_coach());

create policy "bookings: eigenes lesen" on public.bookings
  for select to authenticated using (user_id = auth.uid() or public.is_coach());
create policy "bookings: coach verwaltet" on public.bookings
  for all to authenticated using (public.is_coach()) with check (public.is_coach());

-- Fragen: Schüler stellen und lesen eigene, der Coach beantwortet
create policy "questions: eigenes lesen" on public.questions
  for select to authenticated using (user_id = auth.uid() or public.is_coach());
create policy "questions: eigene stellen" on public.questions
  for insert to authenticated with check (user_id = auth.uid() and answer is null and answered_at is null);
create policy "questions: coach verwaltet" on public.questions
  for all to authenticated using (public.is_coach()) with check (public.is_coach());

-- News: alle Eingeloggten lesen, der Coach schreibt
create policy "news: lesen" on public.news
  for select to authenticated using (true);
create policy "news: coach verwaltet" on public.news
  for all to authenticated using (public.is_coach()) with check (public.is_coach());

grant execute on function public.is_coach() to authenticated;
grant execute on function public.module_is_unlocked(uuid, uuid) to authenticated;
grant execute on function public.set_task_done(uuid, boolean) to authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- ---------------------------------------------------------------
-- Storage: Material zu Lektionen (privat)
-- ---------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('lesson-files', 'lesson-files', false)
on conflict (id) do nothing;

create policy "lesson-files: lesen wenn freigeschaltet" on storage.objects
  for select to authenticated using (
    bucket_id = 'lesson-files'
    and (
      public.is_coach()
      or exists (
        select 1
        from public.lesson_files f
        join public.lessons l on l.id = f.lesson_id
        where f.storage_path = storage.objects.name
          and public.module_is_unlocked(auth.uid(), l.module_id)
      )
    )
  );
create policy "lesson-files: coach lädt hoch" on storage.objects
  for insert to authenticated with check (bucket_id = 'lesson-files' and public.is_coach());
create policy "lesson-files: coach ändert" on storage.objects
  for update to authenticated using (bucket_id = 'lesson-files' and public.is_coach());
create policy "lesson-files: coach löscht" on storage.objects
  for delete to authenticated using (bucket_id = 'lesson-files' and public.is_coach());
