-- Early-Bird nur noch für die ersten 3 Anmeldungen auf der Warteliste.
-- Wer den Early-Bird schon hat, behält ihn.
create or replace function public.waitlist_early_bird_slots()
returns integer
language sql
immutable
as $$ select 3 $$;
