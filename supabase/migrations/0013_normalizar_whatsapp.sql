-- Padroniza clientes.whatsapp para o formato canônico digits-only com DDI
-- (ex: 558185207465). Antes desta migration o campo era texto livre, o que
-- inutilizava o UNIQUE na prática (o mesmo número entrava em formatos
-- diferentes). Esta migration:
--   1. cria public.canonicalizar_whatsapp(text) com o mesmo contrato do TS
--      em src/app/shared/whatsapp.util.ts;
--   2. aborta se houver duplicados após canonicalização (admin resolve manualmente);
--   3. faz backfill das linhas existentes;
--   4. adiciona CHECK que mantém o formato daqui pra frente;
--   5. atualiza lookup_cliente_por_whatsapp para canonicalizar no boundary.

-- =============================================================================
-- canonicalizar_whatsapp: dígitos com DDI. Fallback "55" para 10–11 dígitos
-- (formato BR clássico sem DDI). Erro se ficar fora de 10–15 dígitos (E.164).
-- =============================================================================
create or replace function public.canonicalizar_whatsapp(p_input text)
returns text
language plpgsql
immutable
as $$
declare
  v_digits text;
begin
  if p_input is null then
    return null;
  end if;

  v_digits := regexp_replace(p_input, '\D', '', 'g');

  if length(v_digits) in (10, 11) then
    v_digits := '55' || v_digits;
  end if;

  if length(v_digits) < 10 or length(v_digits) > 15 then
    raise exception 'WhatsApp inválido: "%" canonicalizado para "%" (% dígitos)',
      p_input, v_digits, length(v_digits);
  end if;

  return v_digits;
end;
$$;

comment on function public.canonicalizar_whatsapp(text) is
  'Normaliza WhatsApp para dígitos com DDI (ex: 558185207465). Aplica fallback "55" para entradas com 10–11 dígitos.';

-- =============================================================================
-- Pré-cheque: aborta a migration se canonicalização produzir duplicados.
-- O admin deve resolver manualmente (reapontar atendimentos.cliente_id do
-- duplicado para o principal e DELETE do duplicado) antes de re-aplicar.
-- =============================================================================
do $$
declare
  v_dupes text;
begin
  with normalizado as (
    select id, nome, whatsapp,
           public.canonicalizar_whatsapp(whatsapp) as canonical
    from public.clientes
  )
  select string_agg(
           format('  - %s (id %s) -> %s  [original: %s]',
                  nome, id, canonical, whatsapp),
           E'\n'
           order by canonical, nome
         )
    into v_dupes
    from normalizado
   where canonical in (
     select canonical from normalizado
      group by canonical
     having count(*) > 1
   );

  if v_dupes is not null then
    raise exception E'Migração 0013 abortada: WhatsApps colidem após canonicalização. Resolva antes de aplicar:\n%', v_dupes;
  end if;
end
$$;

-- =============================================================================
-- Backfill
-- =============================================================================
update public.clientes
   set whatsapp = public.canonicalizar_whatsapp(whatsapp);

-- =============================================================================
-- CHECK para garantir formato canônico nas inserções futuras
-- =============================================================================
alter table public.clientes
  add constraint clientes_whatsapp_canonical_chk
    check (whatsapp ~ '^[0-9]{10,15}$');

-- =============================================================================
-- RPC: canonicaliza input no boundary. "(81) 98520-7465" e "558185207465"
-- resolvem o mesmo cliente. Inputs inválidos retornam "não achei" em vez de
-- propagar erro para o caller anon.
-- =============================================================================
create or replace function public.lookup_cliente_por_whatsapp(p_whatsapp text)
returns table (
  cliente_existe boolean,
  ativo boolean,
  nome text,
  instagram text,
  email text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cliente public.clientes%rowtype;
  v_canonical text;
begin
  begin
    v_canonical := public.canonicalizar_whatsapp(p_whatsapp);
  exception when others then
    return query select false, false, null::text, null::text, null::text;
    return;
  end;

  select * into v_cliente
    from public.clientes
   where whatsapp = v_canonical;

  if not found then
    return query select false, false, null::text, null::text, null::text;
  else
    return query select
      true,
      v_cliente.ativo,
      v_cliente.nome,
      v_cliente.instagram,
      v_cliente.email;
  end if;
end;
$$;
