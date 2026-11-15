-- Stündliche Zählung für die Ansicht „Letzte 24 Stunden“ im Admin.
-- Nur anonyme Summen wie bei visit_stats/funnel_stats; step = 'besuch' für Seitenaufrufe.
-- Es werden nur die letzten 8 Tage aufgehoben.

create table public.stat_hourly (
  hour    timestamptz not null,
  source  text not null,
  device  text not null check (device in ('mobil', 'desktop')),
  step    text not null,
  n       integer not null default 0,
  primary key (hour, source, device, step)
);
alter table public.stat_hourly enable row level security;
create policy "stat_hourly: coach liest" on public.stat_hourly
  for select to authenticated using (public.is_coach());
create policy "stat_hourly: coach löscht" on public.stat_hourly
  for delete to authenticated using (public.is_coach());

create or replace function public.stat_hourly_add(p_step text, p_source text, p_device text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.stat_hourly (hour, source, device, step, n)
  values (date_trunc('hour', now()), public.clean_source(p_source),
          case when p_device = 'mobil' then 'mobil' else 'desktop' end, p_step, 1)
  on conflict (hour, source, device, step) do update set n = public.stat_hourly.n + 1;
  if random() < 0.02 then
    delete from public.stat_hourly where hour < now() - interval '8 days';
  end if;
end;
$$;
revoke execute on function public.stat_hourly_add(text, text, text) from public, anon, authenticated;

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
  perform public.stat_hourly_add('besuch', p_source, p_device);
end;
$$;

create or replace function public.track_step(p_step text, p_source text default '', p_device text default 'desktop')
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_step not in ('zeit_10s', 'zeit_30s', 'scroll_50', 'scroll_90', 'video', 'formular', 'tippen',
                    'abgeschickt', 'fehler', 'module', 'faq', 'preis') then
    return;
  end if;
  insert into public.funnel_stats (day, source, device, step, n)
  values (
    (now() at time zone 'Europe/Berlin')::date,
    public.clean_source(p_source),
    case when p_device = 'mobil' then 'mobil' else 'desktop' end,
    p_step,
    1
  )
  on conflict (day, source, device, step) do update set n = public.funnel_stats.n + 1;
  perform public.stat_hourly_add(p_step, p_source, p_device);
end;
$$;
