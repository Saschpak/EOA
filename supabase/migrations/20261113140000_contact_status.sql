-- Kontakt-Status für die Warteliste: wer hat eine Termin-Mail bekommen, wer hat geantwortet,
-- wann ist das Kennenlerngespräch. Der Coach pflegt das im Admin; Claude kann es per Schlüssel setzen.
alter table public.waitlist
  add column contact_stage text not null default ''
    check (contact_stage in ('', 'angefragt', 'termin', 'gefuehrt', 'keine_antwort', 'abgesagt', 'unzustellbar')),
  add column contact_at timestamptz,
  add column call_at timestamptz,
  add column contact_note text not null default '';

-- Schreibzugang für Claude: nur Kontakt-Felder, nur mit Schlüssel.
-- Der Schlüssel liegt im Supabase Vault als 'claude_key' und kommt im Header x-claude-key
-- (von der Proxy-Umgebung eingesetzt, Claude sieht den Wert nie).
create or replace function public.claude_key_ok()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_key text; v_hdr text;
begin
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'claude_key' limit 1;
  v_hdr := coalesce(current_setting('request.headers', true), '{}')::json->>'x-claude-key';
  return coalesce(v_key, '') <> '' and v_hdr is not null and v_hdr = v_key;
end;
$$;
revoke execute on function public.claude_key_ok() from public, anon, authenticated;

create or replace function public.claude_contact_update(p_email text, p_stage text, p_call_at timestamptz default null, p_note text default null)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare w public.waitlist%rowtype;
begin
  if not public.claude_key_ok() then raise exception 'Nicht erlaubt'; end if;
  if p_stage not in ('', 'angefragt', 'termin', 'gefuehrt', 'keine_antwort', 'abgesagt', 'unzustellbar') then
    raise exception 'Unbekannter Status';
  end if;
  update public.waitlist
     set contact_stage = p_stage,
         contact_at = now(),
         call_at = case when p_stage = 'termin' then coalesce(p_call_at, call_at) else call_at end,
         contact_note = coalesce(p_note, contact_note)
   where email = lower(trim(p_email))
   returning * into w;
  if not found then raise exception 'Eintrag nicht gefunden'; end if;
  return json_build_object('email', w.email, 'stage', w.contact_stage, 'call_at', w.call_at, 'nr', public.waitlist_place(w.id));
end;
$$;
grant execute on function public.claude_contact_update(text, text, timestamptz, text) to anon, authenticated;
