import { createClient } from '@supabase/supabase-js';
import {
  buildBrCodeRef,
  generateStaticBrCode,
  projectCity,
  projectReceiverName,
} from '@thiagoprazeres/pix-static-brcode';

type Env = {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  PIX_KEY: string;
  PIX_RECEIVER_NAME: string;
  PIX_RECEIVER_CITY: string;
};

type Context = { request: Request; env: Env };

const ADMIN_EMAILS = [
  'heriveltonpiresalves@gmail.com',
  'hpsuporteremoto@gmail.com',
  'thiagoprazeres@gmail.com',
];

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const onRequestPost = async (context: Context): Promise<Response> => {
  const { request, env } = context;

  if (
    !env.SUPABASE_URL ||
    !env.SUPABASE_SERVICE_ROLE_KEY ||
    !env.PIX_KEY ||
    !env.PIX_RECEIVER_NAME ||
    !env.PIX_RECEIVER_CITY
  ) {
    return json({ error: 'Servidor mal configurado (env vars ausentes)' }, 500);
  }

  const authHeader = request.headers.get('authorization') ?? '';
  if (!authHeader.toLowerCase().startsWith('bearer ')) {
    return json({ error: 'Authorization Bearer token ausente' }, 401);
  }
  const token = authHeader.slice('bearer '.length).trim();

  const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const {
    data: { user: caller },
    error: callerError,
  } = await admin.auth.getUser(token);

  if (callerError || !caller?.email) {
    return json({ error: 'Token inválido' }, 401);
  }
  if (!ADMIN_EMAILS.includes(caller.email.toLowerCase())) {
    return json({ error: 'Acesso restrito a administradores' }, 403);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Corpo JSON inválido' }, 400);
  }

  const { atendimento_id, servico_id } = (body ?? {}) as {
    atendimento_id?: unknown;
    servico_id?: unknown;
  };

  if (typeof atendimento_id !== 'string' || atendimento_id.length === 0) {
    return json({ error: 'atendimento_id obrigatório' }, 400);
  }
  if (typeof servico_id !== 'string' || servico_id.length === 0) {
    return json({ error: 'servico_id obrigatório' }, 400);
  }

  const { data: atendimento, error: fetchError } = await admin
    .from('atendimentos')
    .select('id, state')
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

  const { data: servico, error: servicoError } = await admin
    .from('servicos')
    .select('id, nome, valor_centavos, ativo')
    .eq('id', servico_id)
    .maybeSingle();

  if (servicoError) return json({ error: servicoError.message }, 500);
  if (!servico) return json({ error: 'Serviço não encontrado' }, 404);
  if (!servico.ativo) return json({ error: 'Serviço inativo' }, 400);
  if (
    typeof servico.valor_centavos !== 'number' ||
    servico.valor_centavos <= 0
  ) {
    return json({ error: 'Serviço com valor inválido' }, 400);
  }

  let brcode: string;
  try {
    brcode = generateStaticBrCode({
      pixKey: env.PIX_KEY,
      receiverName: projectReceiverName(env.PIX_RECEIVER_NAME),
      receiverCity: projectCity(env.PIX_RECEIVER_CITY),
      referenceLabel: buildBrCodeRef(atendimento_id),
      amount: servico.valor_centavos / 100,
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
      valor_centavos: servico.valor_centavos,
      servico_id,
      state: 'pagamento',
    })
    .eq('id', atendimento_id);

  if (updateError) return json({ error: updateError.message }, 500);

  return json(
    {
      pix_brcode: brcode,
      valor_centavos: servico.valor_centavos,
      state: 'pagamento',
    },
    200,
  );
};
