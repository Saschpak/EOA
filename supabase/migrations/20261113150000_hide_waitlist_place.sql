-- Interessenten bekommen ihre genaue Nummer auf der Warteliste gar nicht mehr gezeigt
-- (Wunsch des Coachs). Mails sagen dann "Du gehörst zu den Ersten", die Website "zu den ersten 10/20 …".
create or replace function public.waitlist_show_place(nr int)
returns boolean
language sql
immutable
as $$
  select false;
$$;
