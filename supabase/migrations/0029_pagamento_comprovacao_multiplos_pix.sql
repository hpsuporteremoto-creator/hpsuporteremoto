-- Comprovação de pagamento no atendimento e múltiplas chaves PIX administráveis.

create table if not exists public.pix_recebedores (
  id uuid primary key default gen_random_uuid(),
  pix_key text not null unique,
  receiver_name text not null,
  receiver_city text not null,
  ativo boolean not null default true,
  padrao boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pix_recebedores_padrao_ativo check (not padrao or ativo)
);

-- Migra a configuração única existente para a nova lista, quando preenchida.
insert into public.pix_recebedores (pix_key, receiver_name, receiver_city, ativo, padrao)
select
  trim(pix_key),
  trim(receiver_name),
  trim(receiver_city),
  true,
  false
from public.pix_recebedor_config
where nullif(trim(pix_key), '') is not null
  and nullif(trim(receiver_name), '') is not null
  and nullif(trim(receiver_city), '') is not null
on conflict (pix_key) do nothing;

create unique index if not exists pix_recebedores_um_padrao_ativo_idx
  on public.pix_recebedores (padrao)
  where padrao and ativo;

update public.pix_recebedores
set padrao = true
where id = (
  select id
  from public.pix_recebedores
  where ativo
  order by created_at asc
  limit 1
)
and not exists (
  select 1 from public.pix_recebedores where padrao and ativo
);

alter table public.pix_recebedores enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'pix_recebedores'
      and policyname = 'Admin manage pix recebedores'
  ) then
    create policy "Admin manage pix recebedores"
      on public.pix_recebedores
      for all
      using (public.is_admin())
      with check (public.is_admin());
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'pix_recebedores_updated_at'
      and tgrelid = 'public.pix_recebedores'::regclass
  ) then
    create trigger pix_recebedores_updated_at
      before update on public.pix_recebedores
      for each row execute function public.touch_updated_at();
  end if;
end;
$$;

alter table public.atendimentos
  add column if not exists pix_recebedor_id uuid
    references public.pix_recebedores(id) on delete set null,
  add column if not exists pagamento_end_to_end_id text,
  add column if not exists pagamento_ispb text,
  add column if not exists pagamento_instituicao text,
  add column if not exists pagamento_comprovante_path text,
  add column if not exists pagamento_comprovante_nome text,
  add column if not exists pagamento_comprovante_tipo text,
  add column if not exists pagamento_confirmado_em timestamptz,
  add column if not exists pagamento_confirmado_por_user_id uuid
    references public.profiles(id) on delete set null;

create index if not exists atendimentos_pix_recebedor_id_idx
  on public.atendimentos (pix_recebedor_id);

create unique index if not exists atendimentos_pagamento_end_to_end_id_unique_idx
  on public.atendimentos (pagamento_end_to_end_id)
  where pagamento_end_to_end_id is not null;

notify pgrst, 'reload schema';
