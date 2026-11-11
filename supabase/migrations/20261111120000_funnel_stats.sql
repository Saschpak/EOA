-- Anonyme Schritt-Zählung auf der Startseite: wie weit kommen Besucher?
-- Wie visit_stats nur Tagessummen je Quelle und Gerätetyp, keine Cookies, keine IP, keine Personen.
create table public.funnel_stats (
  day     date not null,
  source  text not null,
  device  text not null check (device in ('mobil', 'desktop')),
  step    text not null,
  n       integer not null default 0,
  primary key (day, source, device, step)
);

alter table public.funnel_stats enable row level security;
create policy "funnel_stats: coach liest" on public.funnel_stats
  for select to authenticated using (public.is_coach());
create policy "funnel_stats: coach löscht" on public.funnel_stats
  for delete to authenticated using (public.is_coach());
grant select, delete on public.funnel_stats to authenticated;

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
end;
$$;
grant execute on function public.track_step(text, text, text) to anon, authenticated;
