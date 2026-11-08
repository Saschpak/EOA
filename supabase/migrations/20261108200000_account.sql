-- Schüler dürfen ihren eigenen Namen ändern (sonst nichts am Profil)
create or replace function public.set_my_name(p_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(trim(p_name), '') = '' then
    raise exception 'Name darf nicht leer sein';
  end if;
  update public.profiles set full_name = trim(p_name) where id = auth.uid();
end;
$$;

grant execute on function public.set_my_name(text) to authenticated;
