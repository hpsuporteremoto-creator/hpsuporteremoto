-- Autorização por role operacional.
-- Admin continua compatível com app_metadata.is_admin=true, mas a regra
-- preferida passa a ser app_metadata.role='admin'.

create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select
    coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin'
    or coalesce(auth.jwt() -> 'app_metadata' ->> 'is_admin', 'false') = 'true';
$$;
