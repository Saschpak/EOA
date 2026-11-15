-- Jeder Aufruf eines Angebots wird mit Zeitpunkt und Gerät (Handy/Computer) gespeichert,
-- damit der Coach sieht, ob jemand das Angebot öfter anschaut. Aufrufe innerhalb von
-- 30 Minuten zählen als einer. Eingeloggte (Coach) werden nicht gezählt.

create table public.offer_views (
  id bigint generated always as identity primary key,
  offer_id uuid not null references public.offers(id) on delete cascade,
  at timestamptz not null default now(),
  device text not null default '' check (device in ('', 'mobil', 'desktop'))
);
create index offer_views_offer_idx on public.offer_views (offer_id, at);

alter table public.offer_views enable row level security;
create policy "offer_views: coach liest" on public.offer_views
  for select to authenticated using (public.is_coach());
create policy "offer_views: coach löscht" on public.offer_views
  for delete to authenticated using (public.is_coach());

-- Bisherige erste Aufrufe übernehmen
insert into public.offer_views (offer_id, at)
select id, viewed_at from public.offers where viewed_at is not null;

drop function if exists public.offer_get(text);
create or replace function public.offer_get(p_token text, p_device text default '')
returns json
language plpgsql
security definer
set search_path = public
as $$
declare o public.offers;
begin
  select * into o from public.offers where id = public.offer_find(p_token);
  if not found then return null; end if;
  if coalesce(auth.uid()::text, '') = '' then
    if o.viewed_at is null then
      update public.offers set viewed_at = now() where id = o.id;
    end if;
    if not exists (select 1 from public.offer_views v where v.offer_id = o.id and v.at > now() - interval '30 minutes') then
      insert into public.offer_views (offer_id, device)
      values (o.id, case when p_device in ('mobil', 'desktop') then p_device else '' end);
    end if;
  end if;
  return json_build_object(
    'name', o.name, 'note', o.note, 'plan', o.plan,
    'full_price', o.full_price, 'full_was', o.full_was, 'full_label', o.full_label,
    'single_price', o.single_price, 'valid_until', o.valid_until,
    'status', o.status, 'expired', public.offer_expired(o), 'created_at', o.created_at
  );
end;
$$;
revoke execute on function public.offer_get(text, text) from public;
grant execute on function public.offer_get(text, text) to anon, authenticated;

-- Claude sieht Anzahl und letzten Aufruf
create or replace function public.claude_offers()
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare r json;
begin
  if not public.claude_key_ok() then raise exception 'Nicht erlaubt'; end if;
  select coalesce(json_agg(json_build_object('email', o.email, 'name', o.name, 'status', o.status,
         'gueltig_bis', o.valid_until, 'angesehen', o.viewed_at, 'beantwortet', o.answered_at, 'slug', o.slug,
         'aufrufe', (select count(*) from public.offer_views v where v.offer_id = o.id),
         'zuletzt', (select max(v.at) from public.offer_views v where v.offer_id = o.id))
         order by o.created_at), '[]'::json) into r from public.offers o;
  return r;
end;
$$;
