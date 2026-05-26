import type { SupabaseClient } from '@supabase/supabase-js';

export type AtendimentoState =
  | 'aguardando_confirmacao'
  | 'recusado'
  | 'em_andamento'
  | 'pagamento'
  | 'concluido';

export type AtendimentoServicoRef = {
  id: string;
  nome: string;
  valor_centavos: number;
};

export type AtendimentoComRelacoes = {
  id: string;
  cliente_id: string;
  servico_id: string | null;
  servico_ids: string[] | null;
  desconto_centavos: number;
  state: AtendimentoState;
  valor_centavos: number | null;
  pix_brcode: string | null;
  descricao_solicitacao: string | null;
  created_at: string;
  updated_at: string;
  cliente: {
    id: string;
    nome: string;
    whatsapp: string;
    instagram: string | null;
    email: string | null;
  };
  servico: AtendimentoServicoRef | null;
  servicos_solicitados: AtendimentoServicoRef[];
};

export const ATENDIMENTO_SELECT = `
  id, cliente_id, servico_id, servico_ids, desconto_centavos,
  state, valor_centavos, pix_brcode, descricao_solicitacao,
  created_at, updated_at,
  cliente:clientes ( id, nome, whatsapp, instagram, email ),
  servico:servicos ( id, nome, valor_centavos )
`;

export async function hydrateServicosSolicitados(
  admin: SupabaseClient,
  rows: AtendimentoComRelacoes[],
): Promise<AtendimentoComRelacoes[]> {
  const ids = Array.from(
    new Set(
      rows.flatMap((row) => {
        const ids = row.servico_ids ?? [];
        return ids.length > 0 ? ids : row.servico_id ? [row.servico_id] : [];
      }),
    ),
  );
  if (ids.length === 0) {
    return rows.map((row) => ({ ...row, servicos_solicitados: [] }));
  }

  const { data, error } = await admin
    .from('servicos')
    .select('id, nome, valor_centavos')
    .in('id', ids);
  if (error) throw new Error(error.message);

  const byId = new Map(
    ((data ?? []) as AtendimentoServicoRef[]).map((servico) => [
      servico.id,
      servico,
    ]),
  );
  return rows.map((row) => {
    const rowIds =
      row.servico_ids && row.servico_ids.length > 0
        ? row.servico_ids
        : row.servico_id
          ? [row.servico_id]
          : [];
    return {
      ...row,
      servicos_solicitados: rowIds.flatMap((id) => {
        const servico = byId.get(id);
        return servico ? [servico] : [];
      }),
    };
  });
}
