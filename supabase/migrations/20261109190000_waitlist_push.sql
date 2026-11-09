-- Push-Nachricht aufs Handy (App „ntfy“) bei jedem neuen Eintrag auf der Warteliste.
-- Der Kanalname ist geheim und liegt im Supabase Vault als 'ntfy_topic'. Ohne ihn passiert nichts.
-- Es werden keine personenbezogenen Daten verschickt, nur Nummer und Quelle.

create or replace function public.waitlist_push_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare v_topic text;
begin
  if new.status <> 'waiting' then return new; end if;
  select decrypted_secret into v_topic from vault.decrypted_secrets where name = 'ntfy_topic' limit 1;
  if coalesce(v_topic, '') = '' then return new; end if;
  perform net.http_post(
    url := 'https://ntfy.sh/',
    body := jsonb_build_object(
      'topic', v_topic,
      'title', 'Neu auf der Warteliste',
      'message', 'Nr. ' || public.waitlist_place(new.id) || ' auf der Warteliste'
                 || coalesce(' · Quelle: ' || nullif(new.source, ''), ''),
      'tags', jsonb_build_array('tada'),
      'click', 'https://coaching.saschpak.de/#admin'),
    headers := jsonb_build_object('Content-Type', 'application/json'),
    timeout_milliseconds := 5000
  );
  return new;
exception when others then
  raise warning 'Push-Nachricht fehlgeschlagen: %', sqlerrm;
  return new;
end;
$$;
revoke execute on function public.waitlist_push_after_insert() from public, anon, authenticated;

create trigger waitlist_push_after_insert
  after insert on public.waitlist
  for each row execute function public.waitlist_push_after_insert();
