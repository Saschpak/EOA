-- Verlauf pro Wartelisten-Eintrag: Mails, die außerhalb der Datenbank verschickt wurden
-- (Gesprächs-Einladung, Nachhaken, Bestätigung per Gmail), Antworten, Anrufe, Notizen.
-- Statuswechsel landen automatisch hier. Systemmails stehen weiter in mail_log.

create table public.contact_events (
  id bigint generated always as identity primary key,
  waitlist_id uuid not null references public.waitlist(id) on delete cascade,
  at timestamptz not null default now(),
  kind text not null check (kind in ('mail_raus', 'antwort', 'status', 'anruf', 'notiz')),
  text text not null default '' check (char_length(text) <= 500),
  by_whom text not null default 'coach' check (by_whom in ('coach', 'claude', 'system'))
);
create index contact_events_wl_idx on public.contact_events (waitlist_id, at);

alter table public.contact_events enable row level security;
create policy "contact_events: coach verwaltet" on public.contact_events
  for all to authenticated using (public.is_coach()) with check (public.is_coach());

-- Statuswechsel automatisch mitschreiben
create or replace function public.waitlist_stage_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(old.contact_stage, '') is distinct from coalesce(new.contact_stage, '') then
    insert into public.contact_events (waitlist_id, kind, text, by_whom)
    values (new.id, 'status', coalesce(new.contact_stage, ''),
            case when auth.uid() is null then 'claude' else 'coach' end);
  end if;
  if old.status is distinct from new.status and new.status = 'invited' then
    insert into public.contact_events (waitlist_id, kind, text, by_whom)
    values (new.id, 'status', 'platz_zugesagt', case when auth.uid() is null then 'claude' else 'coach' end);
  end if;
  return new;
end;
$$;
revoke execute on function public.waitlist_stage_event() from public, anon, authenticated;
create trigger waitlist_stage_event after update on public.waitlist
  for each row execute function public.waitlist_stage_event();

-- Claude trägt Mails und Antworten ein (nur mit x-claude-key)
create or replace function public.claude_contact_log(p_email text, p_kind text, p_text text, p_at timestamptz default null)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  if not public.claude_key_ok() then raise exception 'Nicht erlaubt'; end if;
  select id into v_id from public.waitlist where email = lower(trim(p_email)) limit 1;
  if v_id is null then return false; end if;
  insert into public.contact_events (waitlist_id, at, kind, text, by_whom)
  values (v_id, coalesce(p_at, now()), p_kind, left(coalesce(p_text, ''), 500), 'claude');
  return true;
end;
$$;
revoke execute on function public.claude_contact_log(text, text, text, timestamptz) from public;
grant execute on function public.claude_contact_log(text, text, text, timestamptz) to anon, authenticated;
