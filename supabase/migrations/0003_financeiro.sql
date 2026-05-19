-- Financeiro: entradas e saídas + auto-criação de entrada quando um
-- atendimento chega no estado 'finalizado'.

-- =============================================================================
-- transacoes
-- =============================================================================
create type public.transacao_tipo as enum ('entrada', 'saida');

create table public.transacoes (
  id uuid primary key default gen_random_uuid(),
  tipo public.transacao_tipo not null,
  valor_centavos integer not null check (valor_centavos > 0),
  descricao text not null,
  atendimento_id uuid references public.atendimentos(id) on delete set null,
  data date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index transacoes_data_idx on public.transacoes (data desc);
create index transacoes_tipo_idx on public.transacoes (tipo);

-- Garante que cada atendimento gera no máximo uma transação automaticamente.
create unique index transacoes_atendimento_unique
  on public.transacoes (atendimento_id)
  where atendimento_id is not null;

-- =============================================================================
-- RLS
-- =============================================================================
alter table public.transacoes enable row level security;

create policy "Admin manage transacoes" on public.transacoes
  for all using (public.is_admin());

-- =============================================================================
-- Trigger: updated_at (reusa public.touch_updated_at de 0001_init.sql)
-- =============================================================================
create trigger transacoes_updated_at
  before update on public.transacoes
  for each row execute function public.touch_updated_at();

-- =============================================================================
-- Auto-entrada quando atendimento.state vira 'finalizado'
-- =============================================================================
create or replace function public.handle_atendimento_finalizado()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.state = 'finalizado'
     and old.state is distinct from 'finalizado'
     and new.valor_centavos is not null
     and new.valor_centavos > 0 then
    insert into public.transacoes (tipo, valor_centavos, descricao, atendimento_id)
    values (
      'entrada',
      new.valor_centavos,
      'Atendimento #' || substr(new.id::text, 1, 8),
      new.id
    )
    on conflict (atendimento_id) do nothing;
  end if;
  return new;
end;
$$;

create trigger atendimento_finalizado_to_transacao
  after update of state on public.atendimentos
  for each row execute function public.handle_atendimento_finalizado();
