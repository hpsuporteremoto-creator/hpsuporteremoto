-- Desconto opcional aplicado ao subtotal dos serviços do atendimento.

alter table public.atendimentos
  add column if not exists desconto_centavos integer not null default 0
    check (desconto_centavos >= 0);
