-- RPC pública: anon pode consultar 1 cliente pelo WhatsApp sem ter acesso
-- direto à tabela clientes (RLS bloqueia anon). security definer permite
-- ler 1 linha controlada — sem vazamento de dados de outros clientes.

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
begin
  select * into v_cliente
  from public.clientes
  where whatsapp = trim(p_whatsapp);

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

grant execute on function public.lookup_cliente_por_whatsapp(text)
  to anon, authenticated;
