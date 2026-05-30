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
  quantidade: number;
  subtotal_centavos: number;
};

export type AtendimentoUserRef = {
  id: string;
  email: string;
  full_name: string | null;
};

type AtendimentoTransacaoRef = {
  id: string;
};

export type AtendimentoComRelacoes = {
  id: string;
  cliente_id: string;
  servico_id: string | null;
  servico_ids: string[] | null;
  desconto_centavos: number;
  acrescimo_centavos: number;
  state: AtendimentoState;
  valor_centavos: number | null;
  pix_brcode: string | null;
  descricao_solicitacao: string | null;
  criado_por_user_id: string | null;
  vendido_por_user_id: string | null;
  atendido_por_user_id: string | null;
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
  criado_por: AtendimentoUserRef | null;
  vendido_por: AtendimentoUserRef | null;
  atendido_por: AtendimentoUserRef | null;
  transacoes?: AtendimentoTransacaoRef[] | AtendimentoTransacaoRef | null;
  financeiro_contabilizado: boolean;
  financeiro_transacao_id: string | null;
};

export const ATENDIMENTO_SELECT = `
  id, cliente_id, servico_id, servico_ids, desconto_centavos, acrescimo_centavos,
  state, valor_centavos, pix_brcode, descricao_solicitacao,
  criado_por_user_id, vendido_por_user_id, atendido_por_user_id,
  created_at, updated_at,
  cliente:clientes ( id, nome, whatsapp, instagram, email ),
  servico:servicos ( id, nome, valor_centavos ),
  transacoes ( id )
`;

export async function hydrateServicosSolicitados(
  admin: SupabaseClient,
  rows: AtendimentoComRelacoes[],
): Promise<AtendimentoComRelacoes[]> {
  const ids = Array.from(
    new Set(
      rows.flatMap((row) => {
        return getServicoIdsFromRow(row);
      }),
    ),
  );
  if (ids.length === 0) {
    return hydrateAtendimentoUsers(
      admin,
      rows.map((row) => ({
        ...row,
        state: normalizeAtendimentoState(row.state),
        ...getFinanceiroStatus(row),
        servicos_solicitados: [],
      })),
    );
  }

  const { data, error } = await admin
    .from('servicos')
    .select('id, nome, valor_centavos')
    .in('id', ids);
  if (error) throw new Error(error.message);

  const byId = new Map(
    ((data ?? []) as Array<Omit<AtendimentoServicoRef, 'quantidade' | 'subtotal_centavos'>>).map(
      (servico) => [servico.id, servico],
    ),
  );
  const hydratedRows = rows.map((row) => {
    const rowIds = getServicoIdsFromRow(row);
    const quantities = new Map<string, number>();
    for (const id of rowIds) {
      quantities.set(id, (quantities.get(id) ?? 0) + 1);
    }

    return {
      ...row,
      state: normalizeAtendimentoState(row.state),
      ...getFinanceiroStatus(row),
      servicos_solicitados: Array.from(quantities.entries()).flatMap(([id, quantidade]) => {
        const servico = byId.get(id);
        return servico
          ? [
              {
                ...servico,
                quantidade,
                subtotal_centavos: servico.valor_centavos * quantidade,
              },
            ]
          : [];
      }),
    };
  });
  return hydrateAtendimentoUsers(admin, hydratedRows);
}

async function hydrateAtendimentoUsers(
  admin: SupabaseClient,
  rows: AtendimentoComRelacoes[],
): Promise<AtendimentoComRelacoes[]> {
  const ids = Array.from(
    new Set(
      rows.flatMap((row) => [
        row.criado_por_user_id,
        row.vendido_por_user_id,
        row.atendido_por_user_id,
      ]),
    ),
  ).filter((id): id is string => typeof id === 'string' && id.length > 0);

  if (ids.length === 0) {
    return rows.map((row) => ({
      ...row,
      criado_por: null,
      vendido_por: null,
      atendido_por: null,
    }));
  }

  const { data, error } = await admin.from('profiles').select('id, email, full_name').in('id', ids);
  if (error) throw new Error(error.message);

  const usersById = new Map(((data ?? []) as AtendimentoUserRef[]).map((user) => [user.id, user]));
  return rows.map((row) => ({
    ...row,
    criado_por: row.criado_por_user_id ? (usersById.get(row.criado_por_user_id) ?? null) : null,
    vendido_por: row.vendido_por_user_id ? (usersById.get(row.vendido_por_user_id) ?? null) : null,
    atendido_por: row.atendido_por_user_id
      ? (usersById.get(row.atendido_por_user_id) ?? null)
      : null,
  }));
}

function getFinanceiroStatus(row: AtendimentoComRelacoes): {
  financeiro_contabilizado: boolean;
  financeiro_transacao_id: string | null;
} {
  const transacoes = Array.isArray(row.transacoes)
    ? row.transacoes
    : row.transacoes
      ? [row.transacoes]
      : [];
  const transacao = transacoes[0] ?? null;
  return {
    financeiro_contabilizado: Boolean(transacao),
    financeiro_transacao_id: transacao?.id ?? null,
  };
}

function getServicoIdsFromRow(row: AtendimentoComRelacoes): string[] {
  if (row.servico_ids && row.servico_ids.length > 0) return row.servico_ids;
  return row.servico_id ? [row.servico_id] : [];
}

function normalizeAtendimentoState(state: AtendimentoState): AtendimentoState {
  return state === 'aguardando_confirmacao' ? 'em_andamento' : state;
}
