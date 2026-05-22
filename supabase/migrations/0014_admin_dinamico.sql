-- Admin dinâmico: passa a permitir que um admin promova/demita outros usuários
-- via UI (/admin/usuarios), sem precisar de migration nova pra cada mudança.
--
-- Estratégia:
--   1. Adiciona `profiles.is_admin` (default false).
--   2. Backfill: marca true os emails do whitelist hardcoded — eles continuam
--      sendo admin permanente (rede de segurança contra lockout).
--   3. Atualiza public.is_admin() para considerar hardcoded OR profiles.is_admin.
--   4. Trigger que impede usuário comum de alterar o próprio is_admin
--      (só admin pode alterar; service role/migration passa porque auth.uid()
--      é NULL quando não há JWT).

-- =============================================================================
-- 1. Coluna is_admin
-- =============================================================================
alter table public.profiles
  add column if not exists is_admin boolean not null default false;

-- =============================================================================
-- 2. Backfill: hardcoded emails sempre admin
-- =============================================================================
update public.profiles
   set is_admin = true
 where lower(email) in (
   'heriveltonpiresalves@gmail.com',
   'hpsuporteremoto@gmail.com',
   'thiagoprazeres@gmail.com'
 );

-- =============================================================================
-- 3. is_admin() considera whitelist OR coluna
-- =============================================================================
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from auth.users u
    left join public.profiles p on p.id = u.id
    where u.id = auth.uid()
      and (
        lower(u.email) in (
          'heriveltonpiresalves@gmail.com',
          'hpsuporteremoto@gmail.com',
          'thiagoprazeres@gmail.com'
        )
        or p.is_admin = true
      )
  );
$$;

-- =============================================================================
-- 4. Trigger guard: só admin (ou contexto sem JWT, p.ex. migration/service role)
--    pode mudar o flag is_admin. Combinado com a RLS "Users update own profile",
--    isso impede que um usuário comum se auto-promova editando o próprio perfil.
-- =============================================================================
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
  return NEW;
end;
$$;

drop trigger if exists profiles_guard_is_admin on public.profiles;
create trigger profiles_guard_is_admin
  before update on public.profiles
  for each row execute function public.guard_profiles_is_admin();
