-- Adiciona:
--   - servicos.categoria: agrupa serviços no picker do cliente
--   - atendimentos.descricao_solicitacao: texto livre do cliente explicando
--     o que precisa
-- Refaz a RPC criar_atendimento pra receber servico_id e descricao_solicitacao
-- na criação.

alter table public.servicos
  add column categoria text;

create index servicos_categoria_idx
  on public.servicos (categoria)
  where ativo = true;

alter table public.atendimentos
  add column descricao_solicitacao text;

-- Refaz a RPC com 2 parâmetros novos (default null para não quebrar callers
-- antigos). drop é necessário porque a assinatura mudou.
drop function if exists public.criar_atendimento(text, text, text, text, text, text);

create or replace function public.criar_atendimento(
  p_nome text,
  p_whatsapp text,
  p_instagram text,
  p_email text,
  p_rustdesk_id text,
  p_rustdesk_password text,
  p_servico_id uuid default null,
  p_descricao_solicitacao text default null
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

  insert into public.atendimentos (
    cliente_id,
    rustdesk_id,
    rustdesk_password,
    servico_id,
    descricao_solicitacao
  )
  values (
    v_cliente_id,
    p_rustdesk_id,
    p_rustdesk_password,
    p_servico_id,
    nullif(trim(p_descricao_solicitacao), '')
  )
  returning id into v_atendimento_id;

  return v_atendimento_id;
end;
$$;

grant execute on function public.criar_atendimento(
  text, text, text, text, text, text, uuid, text
) to anon, authenticated;
