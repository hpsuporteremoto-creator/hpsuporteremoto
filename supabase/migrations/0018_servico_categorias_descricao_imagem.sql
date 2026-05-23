-- Categorias viram entidade própria e serviços ganham descrição/imagem.

create table if not exists public.servico_categorias (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  descricao text,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists servico_categorias_nome_lower_key
  on public.servico_categorias (lower(nome));

create index if not exists servico_categorias_ativo_nome_idx
  on public.servico_categorias (ativo, nome);

alter table public.servico_categorias enable row level security;

drop policy if exists "Admin manage servico categorias"
  on public.servico_categorias;
create policy "Admin manage servico categorias"
  on public.servico_categorias
  for all using (public.is_admin());

drop policy if exists "Public read servico categorias ativas"
  on public.servico_categorias;
create policy "Public read servico categorias ativas"
  on public.servico_categorias
  for select using (ativo = true);

drop trigger if exists servico_categorias_updated_at
  on public.servico_categorias;
create trigger servico_categorias_updated_at
  before update on public.servico_categorias
  for each row execute function public.touch_updated_at();

alter table public.servicos
  add column if not exists descricao text,
  add column if not exists imagem_url text,
  add column if not exists categoria_id uuid
    references public.servico_categorias(id) on delete restrict;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'servicos'
      and column_name = 'categoria'
  ) then
    with categorias_legadas as (
      select distinct nullif(trim(categoria), '') as nome
      from public.servicos
    )
    insert into public.servico_categorias (nome)
    select c.nome
    from categorias_legadas c
    where c.nome is not null
      and not exists (
        select 1
        from public.servico_categorias sc
        where lower(sc.nome) = lower(c.nome)
      );

    update public.servicos s
    set categoria_id = sc.id
    from public.servico_categorias sc
    where s.categoria_id is null
      and nullif(trim(s.categoria), '') is not null
      and lower(sc.nome) = lower(trim(s.categoria));
  end if;
end;
$$;

update public.servico_categorias
set ativo = false,
    descricao = coalesce(
      descricao,
      'Serviços importados da planilha histórica de faturamento.'
    )
where lower(nome) = lower('Importado CSV');

update public.servicos
set descricao = nome
where descricao is null;

drop index if exists public.servicos_categoria_idx;

alter table public.servicos
  drop column if exists categoria;

create index if not exists servicos_categoria_id_idx
  on public.servicos (categoria_id);

create index if not exists servicos_ativo_categoria_nome_idx
  on public.servicos (ativo, categoria_id, nome);

notify pgrst, 'reload schema';
