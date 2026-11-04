-- First sign-up becomes the owner. After that, open sign-up is blocked:
-- new team members are created by the owner from the panel.
create or replace function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.profiles) then
    raise exception 'El registro está cerrado: pide al owner que te dé de alta';
  end if;
  insert into public.profiles (id, full_name, role)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''), 'owner');
  -- Confirm the first owner directly so no email round-trip is needed.
  update auth.users set email_confirmed_at = coalesce(email_confirmed_at, now()) where id = new.id;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

-- Lets the app know whether the one-time setup page should be shown.
create or replace function public.owner_exists() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where role = 'owner');
$$;
grant execute on function public.owner_exists() to anon, authenticated;
