import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  buildBrCodeRef,
  generateStaticBrCode,
  projectCity,
  projectReceiverName,
} from '@thiagoprazeres/pix-static-brcode';
import { requireStaff } from './admin-auth';

type Env = {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  PIX_KEY?: string;
  PIX_RECEIVER_NAME?: string;
  PIX_RECEIVER_CITY?: string;
};

type Context = { request: Request; env: Env };

type PixReceiverConfig = {
  pixKey: string;
  receiverName: string;
  receiverCity: string;
};

type ServicoItem = {
  servico_id: string;
  quantidade: number;
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const onRequestPost = async (context: Context): Promise<Response> => {
  const { request, env } = context;

  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return json({ error: 'Servidor mal configurado (env vars ausentes)' }, 500);
  }

  const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const staffCheck = await requireStaff(admin, request);
  if (!staffCheck.ok) return json({ error: staffCheck.error }, staffCheck.status);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Corpo JSON inválido' }, 400);
  }

  const {
    atendimento_id,
    servico_id,
    servico_ids,
    servico_itens,
    desconto_centavos,
    descricao_solicitacao,
  } = (body ?? {}) as {
    atendimento_id?: unknown;
    servico_id?: unknown;
    servico_ids?: unknown;
    servico_itens?: unknown;
    desconto_centavos?: unknown;
    descricao_solicitacao?: unknown;
  };

  if (typeof atendimento_id !== 'string' || atendimento_id.length === 0) {
    return json({ error: 'atendimento_id obrigatório' }, 400);
  }
  const servicoItens = normalizeServicoItens(servico_itens, servico_ids, servico_id);
  const servicoIds = expandServicoIds(servicoItens);
  const uniqueServicoIds = Array.from(new Set(servicoItens.map((item) => item.servico_id)));
  if (servicoItens.length === 0) {
    return json({ error: 'servico_ids obrigatório' }, 400);
  }

  const { data: atendimento, error: fetchError } = await admin
    .from('atendimentos')
    .select('id, state, desconto_centavos')
    .eq('id', atendimento_id)
    .maybeSingle();

  if (fetchError) return json({ error: fetchError.message }, 500);
  if (!atendimento) return json({ error: 'Atendimento não encontrado' }, 404);

  if (
    atendimento.state !== 'em_andamento' &&
    atendimento.state !== 'aguardando_confirmacao' &&
    atendimento.state !== 'pagamento'
  ) {
    return json(
      {
        error: `PIX só pode ser gerado quando o atendimento está em em_andamento ou pagamento (state atual: ${atendimento.state})`,
      },
      409,
    );
  }

  const { data: servicosData, error: servicoError } = await admin
    .from('servicos')
    .select('id, nome, valor_centavos, ativo')
    .in('id', uniqueServicoIds);

  if (servicoError) return json({ error: servicoError.message }, 500);

  const servicos = (servicosData ?? []) as {
    id: string;
    nome: string;
    valor_centavos: number;
    ativo: boolean;
  }[];
  const byId = new Map(servicos.map((servico) => [servico.id, servico]));
  const orderedServicos = servicoItens.flatMap((item) => {
    const servico = byId.get(item.servico_id);
    return servico ? [{ ...servico, quantidade: item.quantidade }] : [];
  });

  if (orderedServicos.length !== servicoItens.length) {
    return json({ error: 'Um ou mais serviços não foram encontrados' }, 404);
  }
  const inactive = orderedServicos.find((servico) => !servico.ativo);
  if (inactive) return json({ error: `Serviço inativo: ${inactive.nome}` }, 400);

  const invalid = orderedServicos.find(
    (servico) => typeof servico.valor_centavos !== 'number' || servico.valor_centavos <= 0,
  );
  if (invalid) {
    return json({ error: `Serviço com valor inválido: ${invalid.nome}` }, 400);
  }
  const subtotalCentavos = orderedServicos.reduce(
    (total, servico) => total + servico.valor_centavos * servico.quantidade,
    0,
  );
  const descontoCentavos = normalizeDescontoCentavos(
    desconto_centavos,
    typeof atendimento.desconto_centavos === 'number' ? atendimento.desconto_centavos : 0,
  );
  const descricaoSolicitacao =
    typeof descricao_solicitacao === 'string' && descricao_solicitacao.trim().length > 0
      ? descricao_solicitacao.trim()
      : null;

  if (descontoCentavos < 0) {
    return json({ error: 'Desconto inválido' }, 400);
  }

  if (descontoCentavos >= subtotalCentavos) {
    return json({ error: 'Desconto precisa ser menor que o subtotal' }, 400);
  }

  const totalCentavos = subtotalCentavos - descontoCentavos;
  const receiverConfig = await getPixReceiverConfig(admin, env);
  if ('error' in receiverConfig) return json({ error: receiverConfig.error }, 500);

  let brcode: string;
  try {
    brcode = generateStaticBrCode({
      pixKey: receiverConfig.pixKey,
      receiverName: projectReceiverName(receiverConfig.receiverName),
      receiverCity: projectCity(receiverConfig.receiverCity),
      referenceLabel: buildBrCodeRef(atendimento_id),
      amount: totalCentavos / 100,
    });
  } catch (err) {
    return json(
      {
        error: `Falha ao gerar BR Code: ${err instanceof Error ? err.message : String(err)}`,
      },
      500,
    );
  }

  const { error: updateError } = await admin
    .from('atendimentos')
    .update({
      pix_brcode: brcode,
      valor_centavos: totalCentavos,
      desconto_centavos: descontoCentavos,
      descricao_solicitacao: descricaoSolicitacao,
      servico_id: servicoIds[0],
      servico_ids: servicoIds,
      vendido_por_user_id: staffCheck.user.id,
      atendido_por_user_id: staffCheck.user.id,
      state: 'pagamento',
    })
    .eq('id', atendimento_id);

  if (updateError) return json({ error: updateError.message }, 500);

  return json(
    {
      pix_brcode: brcode,
      subtotal_centavos: subtotalCentavos,
      desconto_centavos: descontoCentavos,
      valor_centavos: totalCentavos,
      state: 'pagamento',
    },
    200,
  );
};

async function getPixReceiverConfig(
  admin: SupabaseClient,
  env: Env,
): Promise<PixReceiverConfig | { error: string }> {
  const { data, error } = await admin
    .from('pix_recebedor_config')
    .select('pix_key, receiver_name, receiver_city')
    .eq('id', 1)
    .maybeSingle<{
      pix_key: string | null;
      receiver_name: string | null;
      receiver_city: string | null;
    }>();

  if (error) return { error: error.message };

  const dbConfig = {
    pixKey: data?.pix_key?.trim() ?? '',
    receiverName: data?.receiver_name?.trim() ?? '',
    receiverCity: data?.receiver_city?.trim() ?? '',
  };
  if (isCompleteReceiverConfig(dbConfig)) return dbConfig;

  const envConfig = {
    pixKey: env.PIX_KEY?.trim() ?? '',
    receiverName: env.PIX_RECEIVER_NAME?.trim() ?? '',
    receiverCity: env.PIX_RECEIVER_CITY?.trim() ?? '',
  };
  if (isCompleteReceiverConfig(envConfig)) return envConfig;

  return {
    error: 'Configure o recebedor PIX em Financeiro > Recebedor PIX antes de gerar cobrança.',
  };
}

function isCompleteReceiverConfig(config: PixReceiverConfig): boolean {
  return (
    config.pixKey.length > 0 && config.receiverName.length > 0 && config.receiverCity.length > 0
  );
}

function normalizeDescontoCentavos(value: unknown, fallback: number): number {
  if (typeof value !== 'number') return Math.max(fallback, 0);
  if (!Number.isInteger(value)) return -1;
  return value;
}

function normalizeServicoItens(
  servicoItens: unknown,
  legacyServicoIds: unknown,
  legacyServicoId: unknown,
): ServicoItem[] {
  if (Array.isArray(servicoItens)) {
    const normalized = servicoItens.flatMap((item): ServicoItem[] => {
      if (!item || typeof item !== 'object') return [];
      const record = item as { servico_id?: unknown; quantidade?: unknown };
      const servicoId = normalizeServicoId(record.servico_id);
      if (!servicoId) return [];
      const quantidade = normalizeQuantidade(record.quantidade);
      return quantidade > 0 ? [{ servico_id: servicoId, quantidade }] : [];
    });
    return mergeServicoItens(normalized);
  }

  const ids = Array.isArray(legacyServicoIds)
    ? legacyServicoIds
    : typeof legacyServicoId === 'string'
      ? [legacyServicoId]
      : [];
  const normalized = ids.flatMap((id): ServicoItem[] => {
    const servicoId = normalizeServicoId(id);
    return servicoId ? [{ servico_id: servicoId, quantidade: 1 }] : [];
  });
  return mergeServicoItens(normalized);
}

function mergeServicoItens(items: ServicoItem[]): ServicoItem[] {
  const byId = new Map<string, number>();
  for (const item of items) {
    byId.set(item.servico_id, (byId.get(item.servico_id) ?? 0) + item.quantidade);
  }
  return Array.from(byId.entries()).map(([servico_id, quantidade]) => ({
    servico_id,
    quantidade,
  }));
}

function expandServicoIds(items: readonly ServicoItem[]): string[] {
  return items.flatMap((item) => Array.from({ length: item.quantidade }, () => item.servico_id));
}

function normalizeServicoId(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function normalizeQuantidade(value: unknown): number {
  const quantidade = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(quantidade) || quantidade < 1) return 0;
  return Math.min(quantidade, 99);
}
