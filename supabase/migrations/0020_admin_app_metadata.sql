-- Remove a whitelist fixa do estado final de autorização.
-- A fonte única passa a ser auth.users.app_metadata.is_admin.

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'is_admin', 'false') = 'true';
$$;

drop trigger if exists profiles_guard_is_admin on public.profiles;
drop function if exists public.guard_profiles_is_admin();

notify pgrst, 'reload schema';
