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

-- ---------------------------------------------------------------
-- Claude lädt selbst hoch (nur mit Header x-claude-key, vom Proxy eingesetzt)
-- ---------------------------------------------------------------
create or replace function public.claude_upload_ok()
returns boolean
language sql
stable
security definer
set search_path = public
as $$ select public.claude_key_ok() $$;
grant execute on function public.claude_upload_ok() to anon, authenticated;

create policy "downloads-bucket: claude liest" on storage.objects
  for select to anon using (bucket_id = 'downloads' and public.claude_upload_ok());
create policy "downloads-bucket: claude lädt hoch" on storage.objects
  for insert to anon with check (bucket_id = 'downloads' and public.claude_upload_ok());
create policy "downloads-bucket: claude ändert" on storage.objects
  for update to anon using (bucket_id = 'downloads' and public.claude_upload_ok());
create policy "downloads-bucket: claude löscht" on storage.objects
  for delete to anon using (bucket_id = 'downloads' and public.claude_upload_ok());

-- Eintrag anlegen oder ändern (p_id leer = neu). Felder, die null sind, bleiben beim Ändern wie sie sind.
create or replace function public.claude_download_save(
  p_id uuid default null, p_title text default null, p_category text default null, p_version text default null,
  p_description text default null, p_file_name text default null, p_storage_path text default null,
  p_size bigint default null, p_published boolean default null)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare v public.downloads;
begin
  if not public.claude_key_ok() then raise exception 'nicht erlaubt'; end if;
  if p_id is null then
    if p_title is null or p_file_name is null or p_storage_path is null then raise exception 'Titel, Dateiname und Pfad fehlen'; end if;
    insert into public.downloads (title, category, version, description, file_name, storage_path, size_bytes, published)
    values (p_title, coalesce(p_category, 'Templates'), coalesce(p_version, ''), coalesce(p_description, ''), p_file_name, p_storage_path, p_size, coalesce(p_published, false))
    returning * into v;
  else
    update public.downloads set
      title = coalesce(p_title, title), category = coalesce(p_category, category), version = coalesce(p_version, version),
      description = coalesce(p_description, description), file_name = coalesce(p_file_name, file_name),
      storage_path = coalesce(p_storage_path, storage_path), size_bytes = coalesce(p_size, size_bytes),
      published = coalesce(p_published, published), updated_at = now()
    where id = p_id returning * into v;
    if v.id is null then raise exception 'Download nicht gefunden'; end if;
  end if;
  return row_to_json(v);
end;
$$;

create or replace function public.claude_downloads()
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.claude_key_ok() then raise exception 'nicht erlaubt'; end if;
  return coalesce((select json_agg(json_build_object(
    'id', d.id, 'titel', d.title, 'kategorie', d.category, 'version', d.version, 'datei', d.file_name,
    'pfad', d.storage_path, 'groesse', d.size_bytes, 'sichtbar', d.published, 'stand', d.updated_at,
    'geladen', (select count(*) from public.download_log l where l.download_id = d.id)) order by d.category, d.created_at)
    from public.downloads d), '[]'::json);
end;
$$;

-- Löscht den Eintrag und gibt den Speicherpfad zurück (die Datei löscht Claude danach im Bucket)
create or replace function public.claude_download_delete(p_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare v_path text;
begin
  if not public.claude_key_ok() then raise exception 'nicht erlaubt'; end if;
  delete from public.downloads where id = p_id returning storage_path into v_path;
  return v_path;
end;
$$;
revoke execute on function public.claude_download_save(uuid, text, text, text, text, text, text, bigint, boolean) from public, authenticated;
revoke execute on function public.claude_downloads() from public, authenticated;
revoke execute on function public.claude_download_delete(uuid) from public, authenticated;
grant execute on function public.claude_download_save(uuid, text, text, text, text, text, text, bigint, boolean) to anon;
grant execute on function public.claude_downloads() to anon;
grant execute on function public.claude_download_delete(uuid) to anon;
