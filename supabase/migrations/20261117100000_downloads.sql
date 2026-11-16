-- Download-Bereich für Teilnehmer: Templates, Max-for-Live-Devices, Clips, Anleitungen.
-- Dateien liegen im privaten Bucket "downloads", Teilnehmer mit Kurszugang laden per signiertem Link.
-- download_log zählt, wer was geladen hat (nur für den Coach sichtbar).

create table if not exists public.downloads (
  id            uuid primary key default gen_random_uuid(),
  title         text not null check (char_length(title) between 1 and 120),
  description   text not null default '' check (char_length(description) <= 1000),
  category      text not null default 'Templates' check (char_length(category) between 1 and 60),
  version       text not null default '' check (char_length(version) <= 30),
  file_name     text not null,
  storage_path  text not null unique,
  size_bytes    bigint,
  published     boolean not null default true,
  position      int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists public.download_log (
  id           bigint generated always as identity primary key,
  download_id  uuid not null references public.downloads (id) on delete cascade,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  at           timestamptz not null default now()
);
create index if not exists download_log_dl_idx on public.download_log (download_id);

-- Wer darf laden: Coach oder Teilnehmer mit Kurszugang
create or replace function public.can_download()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and (role = 'coach' or course_access)
  );
$$;
grant execute on function public.can_download() to authenticated;

alter table public.downloads    enable row level security;
alter table public.download_log enable row level security;

create policy "downloads: lesen mit Kurszugang" on public.downloads
  for select to authenticated using (public.is_coach() or (published and public.can_download()));
create policy "downloads: coach verwaltet" on public.downloads
  for all to authenticated using (public.is_coach()) with check (public.is_coach());

create policy "download_log: eigenen Download eintragen" on public.download_log
  for insert to authenticated with check (
    user_id = auth.uid() and public.can_download()
    and exists (select 1 from public.downloads d where d.id = download_id and (d.published or public.is_coach()))
  );
create policy "download_log: coach liest" on public.download_log
  for select to authenticated using (public.is_coach());
create policy "download_log: coach löscht" on public.download_log
  for delete to authenticated using (public.is_coach());

-- Speicher: privat, 200 MB pro Datei
insert into storage.buckets (id, name, public, file_size_limit)
values ('downloads', 'downloads', false, 209715200)
on conflict (id) do nothing;

create policy "downloads-bucket: lesen mit Kurszugang" on storage.objects
  for select to authenticated using (
    bucket_id = 'downloads'
    and (
      public.is_coach()
      or (public.can_download() and exists (
        select 1 from public.downloads d where d.storage_path = storage.objects.name and d.published
      ))
    )
  );
create policy "downloads-bucket: coach lädt hoch" on storage.objects
  for insert to authenticated with check (bucket_id = 'downloads' and public.is_coach());
create policy "downloads-bucket: coach ändert" on storage.objects
  for update to authenticated using (bucket_id = 'downloads' and public.is_coach());
create policy "downloads-bucket: coach löscht" on storage.objects
  for delete to authenticated using (bucket_id = 'downloads' and public.is_coach());
