-- Funil de vendas: rename enum values pra casar com labels visuais e
-- adiciona o estado intermediário 'faturamento' entre em_andamento e
-- pagamento (onde o admin escolhe serviço/valor antes de gerar PIX).
--
-- mapeamento:
--   conexao        -> aguardando_confirmacao
--   em_atendimento -> em_andamento
--   <novo>         -> faturamento
--   liquidacao     -> pagamento
--   finalizado     -> concluido

alter type public.atendimento_state rename value 'conexao'        to 'aguardando_confirmacao';
alter type public.atendimento_state rename value 'em_atendimento' to 'em_andamento';
alter type public.atendimento_state rename value 'liquidacao'     to 'pagamento';
alter type public.atendimento_state rename value 'finalizado'     to 'concluido';
alter type public.atendimento_state add value 'faturamento' after 'em_andamento';

alter table public.atendimentos
  alter column state set default 'aguardando_confirmacao';

-- Trigger handle_atendimento_finalizado (do 0003_financeiro.sql) checa pelo
-- nome 'finalizado' — atualizar pra 'concluido'.
create or replace function public.handle_atendimento_finalizado()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.state = 'concluido'
     and old.state is distinct from 'concluido'
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
