-- Korrektur der Schritt-Zählung: Selbsttest des Coachs am 12.11.2026 (Story-Link im Instagram-Browser)
-- zählte als "tippen" und "abgeschickt". Beide Werte um 1 verringern.
update public.funnel_stats
   set n = n - 1
 where day = date '2026-11-12' and source = 'story' and device = 'mobil'
   and step in ('tippen', 'abgeschickt') and n > 0;
delete from public.funnel_stats where n <= 0;
