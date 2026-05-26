-- Vitrine pública de serviços e comentários com respostas.

alter table public.servicos
  add column if not exists vitrine boolean not null default true;

create index if not exists servicos_vitrine_ativo_nome_idx
  on public.servicos (vitrine, ativo, nome);

create table if not exists public.servico_comentarios (
  id uuid primary key default gen_random_uuid(),
  servico_id uuid not null references public.servicos(id) on delete cascade,
  parent_id uuid references public.servico_comentarios(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  author_name text not null,
  author_email text,
  author_avatar_url text,
  texto text not null check (length(trim(texto)) between 2 and 1200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists servico_comentarios_servico_created_idx
  on public.servico_comentarios (servico_id, created_at);

create index if not exists servico_comentarios_parent_created_idx
  on public.servico_comentarios (parent_id, created_at);

create index if not exists servico_comentarios_user_idx
  on public.servico_comentarios (user_id);

alter table public.servico_comentarios enable row level security;

drop policy if exists "Public read servico comentarios"
  on public.servico_comentarios;
create policy "Public read servico comentarios"
  on public.servico_comentarios
  for select
  using (true);

drop policy if exists "Authenticated insert own servico comentarios"
  on public.servico_comentarios;
create policy "Authenticated insert own servico comentarios"
  on public.servico_comentarios
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Admin manage servico comentarios"
  on public.servico_comentarios;
create policy "Admin manage servico comentarios"
  on public.servico_comentarios
  for all
  using (public.is_admin())
  with check (public.is_admin());

create or replace function public.guard_servico_comentario_parent()
returns trigger
language plpgsql
as $$
declare
  v_parent_servico_id uuid;
  v_parent_parent_id uuid;
begin
  if new.parent_id is null then
    return new;
  end if;

  select servico_id, parent_id
    into v_parent_servico_id, v_parent_parent_id
    from public.servico_comentarios
   where id = new.parent_id;

  if v_parent_servico_id is null then
    raise exception 'Comentário pai não encontrado';
  end if;

  if v_parent_servico_id <> new.servico_id then
    raise exception 'Resposta precisa pertencer ao mesmo serviço';
  end if;

  if v_parent_parent_id is not null then
    raise exception 'Respostas só podem ter um nível';
  end if;

  return new;
end;
$$;

drop trigger if exists servico_comentarios_guard_parent
  on public.servico_comentarios;
create trigger servico_comentarios_guard_parent
  before insert or update on public.servico_comentarios
  for each row execute function public.guard_servico_comentario_parent();

drop trigger if exists servico_comentarios_updated_at
  on public.servico_comentarios;
create trigger servico_comentarios_updated_at
  before update on public.servico_comentarios
  for each row execute function public.touch_updated_at();

notify pgrst, 'reload schema';
