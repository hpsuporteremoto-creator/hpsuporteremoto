-- Marketing por email: consentimento, campanhas e auditoria de destinatários.
-- A base atual possui consentimento comercial prévio, conforme decisão operacional.

alter table public.clientes
  add column if not exists marketing_opt_in boolean not null default true,
  add column if not exists marketing_opt_in_at timestamptz,
  add column if not exists marketing_opt_out_at timestamptz,
  add column if not exists resend_contact_id text;

update public.clientes
   set marketing_opt_in = true,
       marketing_opt_in_at = coalesce(marketing_opt_in_at, now())
 where marketing_opt_in_at is null;

alter table public.clientes
  alter column marketing_opt_in_at set default now();

create index if not exists clientes_marketing_ativos_idx
  on public.clientes (ativo, marketing_opt_in, nome)
  where marketing_opt_out_at is null and email is not null;

create table public.marketing_campanhas (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (char_length(trim(nome)) >= 3),
  assunto text not null check (char_length(trim(assunto)) >= 3),
  mensagem text not null check (char_length(trim(mensagem)) >= 3),
  texto_previa text,
  servico_id uuid references public.servicos(id) on delete set null,
  somente_vendas_contabilizadas boolean not null default true,
  status text not null default 'rascunho'
    check (status in ('rascunho', 'agendada', 'enviada', 'falhou', 'cancelada')),
  total_destinatarios integer not null default 0 check (total_destinatarios >= 0),
  agendada_para timestamptz,
  enviada_em timestamptz,
  resend_segment_id text,
  resend_broadcast_id text unique,
  erro text,
  criado_por_user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index marketing_campanhas_created_at_idx
  on public.marketing_campanhas (created_at desc);

create index marketing_campanhas_status_idx
  on public.marketing_campanhas (status, agendada_para);

create table public.marketing_campanha_destinatarios (
  id uuid primary key default gen_random_uuid(),
  campanha_id uuid not null references public.marketing_campanhas(id) on delete cascade,
  cliente_id uuid references public.clientes(id) on delete set null,
  nome text not null,
  email text not null,
  whatsapp text,
  resend_contact_id text,
  status text not null default 'pendente'
    check (status in ('pendente', 'agendado', 'enviado', 'entregue', 'aberto', 'clicado', 'falhou', 'descadastrado')),
  erro text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campanha_id, email)
);

create index marketing_destinatarios_campanha_idx
  on public.marketing_campanha_destinatarios (campanha_id, status);

create index marketing_destinatarios_cliente_idx
  on public.marketing_campanha_destinatarios (cliente_id);

create table public.marketing_eventos (
  id uuid primary key default gen_random_uuid(),
  campanha_id uuid references public.marketing_campanhas(id) on delete cascade,
  destinatario_id uuid references public.marketing_campanha_destinatarios(id) on delete cascade,
  tipo text not null,
  resend_email_id text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index marketing_eventos_campanha_idx
  on public.marketing_eventos (campanha_id, created_at desc);

alter table public.marketing_campanhas enable row level security;
alter table public.marketing_campanha_destinatarios enable row level security;
alter table public.marketing_eventos enable row level security;

create trigger marketing_campanhas_updated_at
  before update on public.marketing_campanhas
  for each row execute function public.touch_updated_at();

create trigger marketing_campanha_destinatarios_updated_at
  before update on public.marketing_campanha_destinatarios
  for each row execute function public.touch_updated_at();
