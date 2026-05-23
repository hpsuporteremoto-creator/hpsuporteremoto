-- Schema do fluxo de atendimento: clientes, servicos, atendimentos (state machine).
-- Reusa public.is_admin() e public.touch_updated_at() do 0001_init.sql.

-- =============================================================================
-- clientes
-- =============================================================================
create table public.clientes (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  whatsapp text not null unique,
  instagram text,
  email text,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =============================================================================
-- servicos
-- =============================================================================
create table public.servicos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  valor_centavos integer not null check (valor_centavos >= 0),
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

-- =============================================================================
-- atendimentos com state machine
-- =============================================================================
create type public.atendimento_state as enum (
  'conexao',
  'em_atendimento',
  'liquidacao',
  'finalizado'
);

create table public.atendimentos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete restrict,
  servico_id uuid references public.servicos(id) on delete set null,
  state public.atendimento_state not null default 'conexao',
  valor_centavos integer,
  pix_brcode text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index atendimentos_cliente_id_idx on public.atendimentos (cliente_id);
create index atendimentos_state_idx on public.atendimentos (state);

-- =============================================================================
-- RLS
-- =============================================================================
alter table public.clientes enable row level security;
alter table public.servicos enable row level security;
alter table public.atendimentos enable row level security;

-- Anon: inserir cliente/atendimento (via RPC criar_atendimento) e ler o próprio
-- atendimento por id (segurança via UUID unguessable até endurecermos com
-- client_token).
create policy "Anon insert clientes" on public.clientes
  for insert to anon with check (true);
create policy "Anon read own atendimento" on public.atendimentos
  for select to anon using (true);
create policy "Anon insert atendimento" on public.atendimentos
  for insert to anon with check (true);

-- Admin: acesso total
create policy "Admin manage clientes" on public.clientes
  for all using (public.is_admin());
create policy "Admin manage servicos" on public.servicos
  for all using (public.is_admin());
create policy "Admin manage atendimentos" on public.atendimentos
  for all using (public.is_admin());

-- Servicos ativos visíveis publicamente (para futuro catálogo público)
create policy "Public read servicos ativos" on public.servicos
  for select using (ativo = true);

-- =============================================================================
-- Realtime: publicar mudanças em atendimentos
-- =============================================================================
alter publication supabase_realtime add table public.atendimentos;

-- =============================================================================
-- Triggers updated_at (reusa public.touch_updated_at de 0001_init.sql)
-- =============================================================================
create trigger clientes_updated_at
  before update on public.clientes
  for each row execute function public.touch_updated_at();

create trigger atendimentos_updated_at
  before update on public.atendimentos
  for each row execute function public.touch_updated_at();

-- =============================================================================
-- RPC: criar_atendimento — upsert cliente por whatsapp + cria atendimento
-- =============================================================================
create or replace function public.criar_atendimento(
  p_nome text,
  p_whatsapp text,
  p_instagram text,
  p_email text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cliente_id uuid;
  v_atendimento_id uuid;
begin
  insert into public.clientes (nome, whatsapp, instagram, email)
  values (p_nome, p_whatsapp, p_instagram, p_email)
  on conflict (whatsapp) do update
    set nome = excluded.nome,
        instagram = coalesce(excluded.instagram, public.clientes.instagram),
        email = coalesce(excluded.email, public.clientes.email),
        updated_at = now()
  returning id into v_cliente_id;

  insert into public.atendimentos (cliente_id)
  values (v_cliente_id)
  returning id into v_atendimento_id;

  return v_atendimento_id;
end;
$$;

grant execute on function public.criar_atendimento(text, text, text, text)
  to anon, authenticated;
