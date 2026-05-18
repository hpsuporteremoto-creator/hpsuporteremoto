-- Schema inicial: profiles linkadas a auth.users, RLS e função is_admin().
-- Os emails admin abaixo DEVEM bater com:
--   src/app/core/auth/admin-emails.ts
--   netlify/functions/create-user.mts

-- =============================================================================
-- Tabela profiles
-- =============================================================================
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- =============================================================================
-- Função is_admin() — fonte da verdade no banco
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
    from auth.users
    where id = auth.uid()
      and lower(email) in (
        'heriveltonpiresalves@gmail.com',
        'hpsuporteremoto@gmail.com'
      )
  );
$$;

-- =============================================================================
-- Políticas RLS
-- =============================================================================
create policy "Users read own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Admins read all profiles"
  on public.profiles for select
  using (public.is_admin());

create policy "Users update own profile"
  on public.profiles for update
  using (auth.uid() = id);

create policy "Admins update any profile"
  on public.profiles for update
  using (public.is_admin());

-- =============================================================================
-- Trigger: cria profile automaticamente quando auth.users recebe um novo usuário
-- =============================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name'
    ),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do update
    set full_name = coalesce(excluded.full_name, public.profiles.full_name),
        avatar_url = coalesce(excluded.avatar_url, public.profiles.avatar_url);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Atualiza updated_at em mudanças
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();
