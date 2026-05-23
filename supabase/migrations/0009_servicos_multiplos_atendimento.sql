-- Permite que a solicitação carregue múltiplos serviços escolhidos pelo cliente.
-- servico_id permanece como serviço principal/compatibilidade e servico_ids
-- guarda a lista completa na ordem enviada pelo frontend.

alter table public.atendimentos
  add column if not exists servico_ids uuid[] not null default '{}';

update public.atendimentos
   set servico_ids = array[servico_id]
 where servico_id is not null
   and coalesce(array_length(servico_ids, 1), 0) = 0;

create or replace function public.criar_atendimento(
  p_nome text,
  p_whatsapp text,
  p_instagram text,
  p_email text,
  p_servico_id uuid default null,
  p_servico_ids uuid[] default null,
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
  v_servico_ids uuid[];
begin
  v_servico_ids := coalesce(p_servico_ids, '{}');

  if coalesce(array_length(v_servico_ids, 1), 0) = 0 and p_servico_id is not null then
    v_servico_ids := array[p_servico_id];
  end if;

  insert into public.clientes (nome, whatsapp, instagram, email)
  values (
    trim(p_nome),
    trim(p_whatsapp),
    nullif(trim(p_instagram), ''),
    nullif(trim(p_email), '')
  )
  on conflict (whatsapp) do update
    set nome = excluded.nome,
        instagram = coalesce(excluded.instagram, public.clientes.instagram),
        email = coalesce(excluded.email, public.clientes.email),
        updated_at = now()
  returning id into v_cliente_id;

  insert into public.atendimentos (
    cliente_id,
    servico_id,
    servico_ids,
    descricao_solicitacao
  )
  values (
    v_cliente_id,
    coalesce(p_servico_id, v_servico_ids[1]),
    v_servico_ids,
    nullif(trim(p_descricao_solicitacao), '')
  )
  returning id into v_atendimento_id;

  return v_atendimento_id;
end;
$$;

grant execute on function public.criar_atendimento(
  text, text, text, text, uuid, uuid[], text
) to anon, authenticated;
