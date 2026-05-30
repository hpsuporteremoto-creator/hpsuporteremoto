-- Acréscimo opcional aplicado ao subtotal dos serviços do atendimento.

alter table public.atendimentos
  add column if not exists acrescimo_centavos integer not null default 0
    check (acrescimo_centavos >= 0);
