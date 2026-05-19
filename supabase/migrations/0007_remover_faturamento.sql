-- Funil simplificado: faturamento deixa de existir como estado lógico.
-- Qualquer linha presa em 'faturamento' volta pra 'em_andamento' onde o
-- admin escolhe o serviço e cobra direto. O valor 'faturamento' do enum
-- fica órfão (PG não permite drop value), mas nenhum código gera mais
-- essa string.

update public.atendimentos
   set state = 'em_andamento'
 where state = 'faturamento';
