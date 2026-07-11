import { desc, eq, inArray, or, type SQL } from 'drizzle-orm';
import { atendimentos, clientes, pixRecebedores, profiles, servicos, transacoes } from '../../drizzle/schema';
import type { UserRole } from './admin-auth';
import type { AppDatabase } from '../lib/db';

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

type AtendimentoTransacaoRef = { id: string };

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
  pix_recebedor_id: string | null;
  pix_recebedor: { id: string; receiver_name: string; pix_key: string; receiver_city: string } | null;
  pagamento_end_to_end_id: string | null;
  pagamento_ispb: string | null;
  pagamento_instituicao: string | null;
  pagamento_comprovante_nome: string | null;
  pagamento_comprovante_tipo: string | null;
  pagamento_confirmado_em: string | null;
  pagamento_confirmado_por_user_id: string | null;
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
  pagamento_confirmado_por: AtendimentoUserRef | null;
  transacoes?: AtendimentoTransacaoRef[];
  financeiro_contabilizado: boolean;
  financeiro_transacao_id: string | null;
};

export type AtendimentoOwnership = Pick<
  AtendimentoComRelacoes,
  'criado_por_user_id' | 'vendido_por_user_id' | 'atendido_por_user_id'
>;

export function canStaffAccessAtendimento(
  atendimento: AtendimentoOwnership | null | undefined,
  role: UserRole,
  userId: string,
): boolean {
  return Boolean(
    role === 'admin' ||
      (atendimento &&
        (atendimento.criado_por_user_id === userId ||
          atendimento.vendido_por_user_id === userId ||
          atendimento.atendido_por_user_id === userId)),
  );
}

export function atendimentoOwnershipCondition(userId: string): SQL {
  return or(
    eq(atendimentos.criadoPorUserId, userId),
    eq(atendimentos.vendidoPorUserId, userId),
    eq(atendimentos.atendidoPorUserId, userId),
  ) as SQL;
}

export async function listAtendimentosComRelacoes(
  db: AppDatabase,
  condition?: SQL,
): Promise<AtendimentoComRelacoes[]> {
  const baseQuery = db
    .select({
      atendimento: atendimentos,
      cliente: {
        id: clientes.id,
        nome: clientes.nome,
        whatsapp: clientes.whatsapp,
        instagram: clientes.instagram,
        email: clientes.email,
      },
      servico: {
        id: servicos.id,
        nome: servicos.nome,
        valor_centavos: servicos.valorCentavos,
      },
      transacao: { id: transacoes.id },
      pixRecebedor: {
        id: pixRecebedores.id,
        receiverName: pixRecebedores.receiverName,
        pixKey: pixRecebedores.pixKey,
        receiverCity: pixRecebedores.receiverCity,
      },
    })
    .from(atendimentos)
    .innerJoin(clientes, eq(atendimentos.clienteId, clientes.id))
    .leftJoin(servicos, eq(atendimentos.servicoId, servicos.id))
    .leftJoin(transacoes, eq(atendimentos.id, transacoes.atendimentoId))
    .leftJoin(pixRecebedores, eq(atendimentos.pixRecebedorId, pixRecebedores.id))
    .orderBy(desc(atendimentos.createdAt));
  const rows = condition ? await baseQuery.where(condition) : await baseQuery;
  return hydrateServicosSolicitados(
    db,
    rows.map((row) => {
      const atendimento = row.atendimento;
      const transacao = row.transacao?.id ? [{ id: row.transacao.id }] : [];
      return {
        id: atendimento.id,
        cliente_id: atendimento.clienteId,
        servico_id: atendimento.servicoId,
        servico_ids: atendimento.servicoIds,
        desconto_centavos: atendimento.descontoCentavos,
        acrescimo_centavos: atendimento.acrescimoCentavos,
        state: normalizeAtendimentoState(atendimento.state),
        valor_centavos: atendimento.valorCentavos,
        pix_brcode: atendimento.pixBrcode,
        pix_recebedor_id: atendimento.pixRecebedorId,
        pix_recebedor: row.pixRecebedor?.id
          ? {
              id: row.pixRecebedor.id,
              receiver_name: row.pixRecebedor.receiverName,
              pix_key: row.pixRecebedor.pixKey,
              receiver_city: row.pixRecebedor.receiverCity,
            }
          : null,
        pagamento_end_to_end_id: atendimento.pagamentoEndToEndId,
        pagamento_ispb: atendimento.pagamentoIspb,
        pagamento_instituicao: atendimento.pagamentoInstituicao,
        pagamento_comprovante_nome: atendimento.pagamentoComprovanteNome,
        pagamento_comprovante_tipo: atendimento.pagamentoComprovanteTipo,
        pagamento_confirmado_em: atendimento.pagamentoConfirmadoEm,
        pagamento_confirmado_por_user_id: atendimento.pagamentoConfirmadoPorUserId,
        descricao_solicitacao: atendimento.descricaoSolicitacao,
        criado_por_user_id: atendimento.criadoPorUserId,
        vendido_por_user_id: atendimento.vendidoPorUserId,
        atendido_por_user_id: atendimento.atendidoPorUserId,
        created_at: atendimento.createdAt,
        updated_at: atendimento.updatedAt,
        cliente: row.cliente,
        servico: row.servico?.id
          ? { ...row.servico, quantidade: 1, subtotal_centavos: row.servico.valor_centavos ?? 0 }
          : null,
        servicos_solicitados: [],
        criado_por: null,
        vendido_por: null,
        atendido_por: null,
        pagamento_confirmado_por: null,
        transacoes: transacao,
        financeiro_contabilizado: transacao.length > 0,
        financeiro_transacao_id: transacao[0]?.id ?? null,
      };
    }),
  );
}

export async function hydrateServicosSolicitados(
  db: AppDatabase,
  rows: readonly AtendimentoComRelacoes[],
): Promise<AtendimentoComRelacoes[]> {
  const serviceIds = Array.from(new Set(rows.flatMap(getServicoIdsFromRow)));
  const serviceRows = serviceIds.length
    ? await db
        .select({ id: servicos.id, nome: servicos.nome, valor_centavos: servicos.valorCentavos })
        .from(servicos)
        .where(inArray(servicos.id, serviceIds))
    : [];
  const servicesById = new Map(serviceRows.map((servico) => [servico.id, servico]));
  const hydrated = rows.map((row) => {
    const quantities = new Map<string, number>();
    for (const id of getServicoIdsFromRow(row)) quantities.set(id, (quantities.get(id) ?? 0) + 1);
    const servicosSolicitados = Array.from(quantities.entries()).flatMap(([id, quantidade]) => {
      const servico = servicesById.get(id);
      return servico
        ? [
            {
              ...servico,
              quantidade,
              subtotal_centavos: servico.valor_centavos * quantidade,
            },
          ]
        : [];
    });
    return {
      ...row,
      state: normalizeAtendimentoState(row.state),
      servicos_solicitados: servicosSolicitados,
    };
  });
  return hydrateAtendimentoUsers(db, hydrated);
}

async function hydrateAtendimentoUsers(
  db: AppDatabase,
  rows: readonly AtendimentoComRelacoes[],
): Promise<AtendimentoComRelacoes[]> {
  const ids = Array.from(
    new Set(
      rows.flatMap((row) => [
        row.criado_por_user_id,
        row.vendido_por_user_id,
        row.atendido_por_user_id,
        row.pagamento_confirmado_por_user_id,
      ]),
    ),
  ).filter((id): id is string => Boolean(id));
  if (ids.length === 0) return [...rows];
  const users = await db
    .select({ id: profiles.id, email: profiles.email, full_name: profiles.fullName })
    .from(profiles)
    .where(inArray(profiles.id, ids));
  const usersById = new Map(users.map((user) => [user.id, user]));
  return rows.map((row) => ({
    ...row,
    criado_por: row.criado_por_user_id ? (usersById.get(row.criado_por_user_id) ?? null) : null,
    vendido_por: row.vendido_por_user_id ? (usersById.get(row.vendido_por_user_id) ?? null) : null,
    atendido_por: row.atendido_por_user_id ? (usersById.get(row.atendido_por_user_id) ?? null) : null,
    pagamento_confirmado_por: row.pagamento_confirmado_por_user_id
      ? (usersById.get(row.pagamento_confirmado_por_user_id) ?? null)
      : null,
  }));
}

function getServicoIdsFromRow(row: AtendimentoComRelacoes): string[] {
  return row.servico_ids && row.servico_ids.length > 0
    ? row.servico_ids
    : row.servico_id
      ? [row.servico_id]
      : [];
}

function normalizeAtendimentoState(state: string): AtendimentoState {
  if (state === 'aguardando_confirmacao') return 'em_andamento';
  if (state === 'faturamento') return 'pagamento';
  return state as AtendimentoState;
}
