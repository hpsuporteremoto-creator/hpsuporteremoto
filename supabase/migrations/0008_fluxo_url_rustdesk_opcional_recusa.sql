-- Novo fluxo:
--   servicos -> whatsapp -> solicitacao -> atendimento admin -> pagamento
--   -> concluido.
-- Permite recusa pelo admin.

alter type public.atendimento_state
  add value if not exists 'recusado' after 'aguardando_confirmacao';

create or replace function public.criar_atendimento(
  p_nome text,
  p_whatsapp text,
  p_instagram text,
  p_email text,
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
    descricao_solicitacao
  )
  values (
    v_cliente_id,
    p_servico_id,
    nullif(trim(p_descricao_solicitacao), '')
  )
  returning id into v_atendimento_id;

  return v_atendimento_id;
end;
$$;

grant execute on function public.criar_atendimento(
  text, text, text, text, uuid, text
) to anon, authenticated;
