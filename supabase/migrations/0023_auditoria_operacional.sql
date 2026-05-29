-- Auditoria operacional: quem cadastrou clientes, criou pedidos, vendeu e atendeu.

alter table public.clientes
  add column if not exists cadastrado_por_user_id uuid
    references public.profiles(id) on delete set null;

alter table public.atendimentos
  add column if not exists criado_por_user_id uuid
    references public.profiles(id) on delete set null,
  add column if not exists vendido_por_user_id uuid
    references public.profiles(id) on delete set null,
  add column if not exists atendido_por_user_id uuid
    references public.profiles(id) on delete set null;

create index if not exists clientes_cadastrado_por_user_id_idx
  on public.clientes (cadastrado_por_user_id);

create index if not exists atendimentos_criado_por_user_id_idx
  on public.atendimentos (criado_por_user_id);

create index if not exists atendimentos_vendido_por_user_id_idx
  on public.atendimentos (vendido_por_user_id);

create index if not exists atendimentos_atendido_por_user_id_idx
  on public.atendimentos (atendido_por_user_id);
