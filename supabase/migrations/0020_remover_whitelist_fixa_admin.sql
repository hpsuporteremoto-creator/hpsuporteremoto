-- Remove a whitelist fixa do estado final de autorização.
-- A fonte única passa a ser public.profiles.is_admin.

do $$
begin
  if not exists (
    select 1
    from public.profiles
    where is_admin = true
  ) then
    raise exception
      'Não há nenhum profiles.is_admin = true. Promova pelo menos um usuário antes de remover a whitelist fixa.';
  end if;
end;
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.is_admin = true
  );
$$;

create or replace function public.guard_profiles_is_admin()
returns trigger
language plpgsql
as $$
begin
  if NEW.is_admin is distinct from OLD.is_admin
     and auth.uid() is not null
     and not public.is_admin() then
    raise exception 'Apenas administradores podem alterar is_admin';
  end if;

  if OLD.is_admin = true
     and NEW.is_admin = false
     and not exists (
       select 1
       from public.profiles p
       where p.is_admin = true
         and p.id <> OLD.id
     ) then
    raise exception 'Não é possível remover o último administrador';
  end if;

  return NEW;
end;
$$;

notify pgrst, 'reload schema';
