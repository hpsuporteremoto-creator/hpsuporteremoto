-- Remove credenciais RustDesk da camada persistente.
-- A aplicação administrativa não lê nem grava mais esses dados.

alter table public.atendimentos
  drop column if exists rustdesk_id,
  drop column if exists rustdesk_password;

-- Garante que nenhum overload legado da RPC pública permaneça disponível.
drop function if exists public.criar_atendimento(
  text, text, text, text, text, text
);

drop function if exists public.criar_atendimento(
  text, text, text, text, text, text, uuid, text
);

drop function if exists public.criar_atendimento(
  text, text, text, text, text, text, uuid, uuid[], text
);
