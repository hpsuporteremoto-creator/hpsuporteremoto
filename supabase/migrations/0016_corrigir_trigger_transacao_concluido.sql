-- Corrige o trigger que cria entrada financeira ao concluir atendimento.
--
-- O índice único de transacoes.atendimento_id é parcial:
--   where atendimento_id is not null
-- Portanto o ON CONFLICT precisa repetir o predicado do índice para o Postgres
-- conseguir inferir qual índice deve ser usado.

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
    on conflict (atendimento_id) where atendimento_id is not null do nothing;
  end if;
  return new;
end;
$$;
