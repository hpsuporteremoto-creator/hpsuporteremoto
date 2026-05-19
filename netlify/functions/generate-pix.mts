import type { Context } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';
import {
  buildBrCodeRef,
  generateStaticBrCode,
  projectCity,
  projectReceiverName,
} from '@thiagoprazeres/pix-static-brcode';

// Mantenha sincronizado com src/app/core/auth/admin-emails.ts
const ADMIN_EMAILS = [
  'heriveltonpiresalves@gmail.com',
  'hpsuporteremoto@gmail.com',
];

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export default async (req: Request, _context: Context): Promise<Response> => {
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const pixKey = process.env.PIX_KEY;
  const receiverNameRaw = process.env.PIX_RECEIVER_NAME;
  const receiverCityRaw = process.env.PIX_RECEIVER_CITY;

  if (
    !supabaseUrl ||
    !serviceRoleKey ||
    !pixKey ||
    !receiverNameRaw ||
    !receiverCityRaw
  ) {
    return json({ error: 'Servidor mal configurado (env vars ausentes)' }, 500);
  }

  const authHeader = req.headers.get('authorization') ?? '';
  if (!authHeader.toLowerCase().startsWith('bearer ')) {
    return json({ error: 'Authorization Bearer token ausente' }, 401);
  }
  const token = authHeader.slice('bearer '.length).trim();

  const admin = createClient(supabaseUrl, serviceRoleKey, {
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
    body = await req.json();
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
      pixKey,
      receiverName: projectReceiverName(receiverNameRaw),
      receiverCity: projectCity(receiverCityRaw),
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

export const config = { path: '/api/generate-pix' };
