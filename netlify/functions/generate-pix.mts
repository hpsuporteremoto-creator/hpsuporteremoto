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

  const { atendimento_id, valor_centavos } = (body ?? {}) as {
    atendimento_id?: unknown;
    valor_centavos?: unknown;
  };

  if (typeof atendimento_id !== 'string' || atendimento_id.length === 0) {
    return json({ error: 'atendimento_id obrigatório' }, 400);
  }
  if (
    typeof valor_centavos !== 'number' ||
    !Number.isInteger(valor_centavos) ||
    valor_centavos <= 0
  ) {
    return json(
      { error: 'valor_centavos deve ser inteiro positivo' },
      400,
    );
  }

  const { data: atendimento, error: fetchError } = await admin
    .from('atendimentos')
    .select('id, state')
    .eq('id', atendimento_id)
    .maybeSingle();

  if (fetchError) return json({ error: fetchError.message }, 500);
  if (!atendimento) return json({ error: 'Atendimento não encontrado' }, 404);

  const brcode = generateStaticBrCode({
    pixKey,
    receiverName: projectReceiverName(receiverNameRaw),
    receiverCity: projectCity(receiverCityRaw),
    referenceLabel: buildBrCodeRef(atendimento_id),
    amount: valor_centavos / 100,
  });

  const { error: updateError } = await admin
    .from('atendimentos')
    .update({
      pix_brcode: brcode,
      valor_centavos,
      state: 'liquidacao',
    })
    .eq('id', atendimento_id);

  if (updateError) return json({ error: updateError.message }, 500);

  return json(
    {
      pix_brcode: brcode,
      valor_centavos,
      state: 'liquidacao',
    },
    200,
  );
};

export const config = { path: '/api/generate-pix' };
