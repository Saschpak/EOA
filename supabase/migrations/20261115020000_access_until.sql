-- Zugang zum Videokurs ist zeitlich begrenzt (Standard 12 Monate ab Kursstart bzw. Beitritt).
-- Leer = Standard, berechnet in der App (CONFIG.accessMonths); ein Datum hier überschreibt ihn,
-- z. B. für Verlängerungen. Nur der Coach ändert Profile (bestehende RLS).

alter table public.profiles add column if not exists access_until date;
