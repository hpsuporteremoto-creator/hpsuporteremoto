-- Contratos gerados pelo administrativo.

create table if not exists public.contratos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete restrict,
  status text not null default 'a_iniciar'
    check (status in ('a_iniciar', 'em_andamento', 'finalizado', 'cancelado')),
  objeto text not null,
  condicoes text,
  observacoes text,
  criado_por_user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists contratos_status_created_at_idx
  on public.contratos (status, created_at desc);

create index if not exists contratos_cliente_id_idx
  on public.contratos (cliente_id);

alter table public.contratos enable row level security;

drop policy if exists "Admin manage contratos" on public.contratos;
create policy "Admin manage contratos"
  on public.contratos for all
  using (public.is_admin())
  with check (public.is_admin());

drop trigger if exists contratos_updated_at on public.contratos;
create trigger contratos_updated_at
  before update on public.contratos
  for each row execute function public.touch_updated_at();
