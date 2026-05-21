-- Adiciona thiagoprazeres@gmail.com à whitelist de administradores no banco.

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
        'hpsuporteremoto@gmail.com',
        'thiagoprazeres@gmail.com'
      )
  );
$$;
