-- Öffentliche Kurzstatistik: nur anonyme Tagessummen, keine Personen, keine E-Mail-Adressen.
-- Damit kann Claude die Entwicklung der Startseite selbst abrufen (Wunsch des Coachs).
-- Enthält: Besuche, Schritt-Zählung und Anzahl Wartelisten-Einträge je Tag und Quelle.
create or replace function public.stats_summary(p_days integer default 30)
returns json
language sql
stable
security definer
set search_path = public
as $$
  with since as (
    select ((now() at time zone 'Europe/Berlin')::date - greatest(1, least(coalesce(p_days, 30), 365)) + 1) as d
  )
  select json_build_object(
    'seit', (select d from since),
    'besuche', coalesce((select json_agg(json_build_object('tag', day, 'quelle', source, 'geraet', device, 'n', views) order by day, source, device)
                         from public.visit_stats where day >= (select d from since)), '[]'::json),
    'schritte', coalesce((select json_agg(json_build_object('tag', day, 'quelle', source, 'geraet', device, 'schritt', step, 'n', n) order by day, source, step)
                          from public.funnel_stats where day >= (select d from since)), '[]'::json),
    'eintraege', coalesce((select json_agg(x order by x.tag, x.quelle) from (
                            select (created_at at time zone 'Europe/Berlin')::date as tag,
                                   coalesce(nullif(source, ''), 'unbekannt') as quelle,
                                   count(*) as n,
                                   count(*) filter (where confirmed_at is not null) as bestaetigt,
                                   count(*) filter (where status = 'invited') as eingeladen,
                                   count(*) filter (where status = 'removed') as entfernt
                              from public.waitlist
                             where (created_at at time zone 'Europe/Berlin')::date >= (select d from since)
                             group by 1, 2) x), '[]'::json),
    'gesamt', (select json_build_object(
                 'wartend', count(*) filter (where status = 'waiting'),
                 'bestaetigt', count(*) filter (where status = 'waiting' and confirmed_at is not null),
                 'eingeladen', count(*) filter (where status = 'invited'))
               from public.waitlist)
  );
$$;
grant execute on function public.stats_summary(integer) to anon, authenticated;
