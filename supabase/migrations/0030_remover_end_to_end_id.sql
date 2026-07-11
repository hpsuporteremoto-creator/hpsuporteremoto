-- EndToEndId não faz mais parte do fluxo de confirmação de pagamento.

drop index if exists public.atendimentos_pagamento_end_to_end_id_unique_idx;

alter table public.atendimentos
  drop column if exists pagamento_end_to_end_id,
  drop column if exists pagamento_ispb,
  drop column if exists pagamento_instituicao;

notify pgrst, 'reload schema';
