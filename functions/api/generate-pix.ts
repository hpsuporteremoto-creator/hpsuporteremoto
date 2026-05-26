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

  const { atendimento_id, servico_id, servico_ids } = (body ?? {}) as {
    atendimento_id?: unknown;
    servico_id?: unknown;
    servico_ids?: unknown;
  };

  if (typeof atendimento_id !== 'string' || atendimento_id.length === 0) {
    return json({ error: 'atendimento_id obrigatório' }, 400);
  }
  const servicoIds = normalizeServicoIds(servico_ids, servico_id);
  if (servicoIds.length === 0) {
    return json({ error: 'servico_ids obrigatório' }, 400);
  }

  const { data: atendimento, error: fetchError } = await admin
    .from('atendimentos')
    .select('id, state, desconto_centavos')
    .eq('id', atendimento_id)
    .maybeSingle();

  if (fetchError) return json({ error: fetchError.message }, 500);
  if (!atendimento) return json({ error: 'Atendimento não encontrado' }, 404);

  if (atendimento.state !== 'em_andamento') {
    return json(
      {
        error: `PIX só pode ser gerado quando o atendimento está em em_andamento (state atual: ${atendimento.state})`,
      },
      409,
    );
  }

  const { data: servicosData, error: servicoError } = await admin
    .from('servicos')
    .select('id, nome, valor_centavos, ativo')
    .in('id', servicoIds);

  if (servicoError) return json({ error: servicoError.message }, 500);

  const servicos = (servicosData ?? []) as {
    id: string;
    nome: string;
    valor_centavos: number;
    ativo: boolean;
  }[];
  const byId = new Map(servicos.map((servico) => [servico.id, servico]));
  const orderedServicos = servicoIds.flatMap((id) => {
    const servico = byId.get(id);
    return servico ? [servico] : [];
  });

  if (orderedServicos.length !== servicoIds.length) {
    return json({ error: 'Um ou mais serviços não foram encontrados' }, 404);
  }
  const inactive = orderedServicos.find((servico) => !servico.ativo);
  if (inactive) return json({ error: `Serviço inativo: ${inactive.nome}` }, 400);

  const invalid = orderedServicos.find(
    (servico) =>
      typeof servico.valor_centavos !== 'number' || servico.valor_centavos <= 0,
  );
  if (invalid) {
    return json({ error: `Serviço com valor inválido: ${invalid.nome}` }, 400);
  }
  const subtotalCentavos = orderedServicos.reduce(
    (total, servico) => total + servico.valor_centavos,
    0,
  );
  const descontoCentavos =
    typeof atendimento.desconto_centavos === 'number'
      ? atendimento.desconto_centavos
      : 0;

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
      servico_id: servicoIds[0],
      servico_ids: servicoIds,
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
    error:
      'Configure o recebedor PIX em Financeiro > Recebedor PIX antes de gerar cobrança.',
  };
}

function isCompleteReceiverConfig(config: PixReceiverConfig): boolean {
  return (
    config.pixKey.length > 0 &&
    config.receiverName.length > 0 &&
    config.receiverCity.length > 0
  );
}

function normalizeServicoIds(
  servicoIds: unknown,
  legacyServicoId: unknown,
): string[] {
  const ids = Array.isArray(servicoIds)
    ? servicoIds
    : typeof legacyServicoId === 'string'
      ? [legacyServicoId]
      : [];
  return Array.from(
    new Set(
      ids
        .filter(
          (id): id is string => typeof id === 'string' && id.trim().length > 0,
        )
        .map((id) => id.trim()),
    ),
  );
}
