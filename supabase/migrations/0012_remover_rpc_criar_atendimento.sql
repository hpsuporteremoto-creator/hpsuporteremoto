-- Remove a RPC criar_atendimento.
-- Ficou órfã: o admin agora cria atendimentos vinculados a um cliente
-- existente (insert direto em public.atendimentos), e o fluxo do cliente
-- não usa mais essa função. O comportamento de upsert de cliente por
-- whatsapp embutido na RPC era justamente o que queríamos eliminar.

drop function if exists public.criar_atendimento(
  text, text, text, text, uuid, text
);

drop function if exists public.criar_atendimento(
  text, text, text, text, uuid, uuid[], text
);
