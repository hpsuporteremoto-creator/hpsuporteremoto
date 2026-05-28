import { createClient } from '@supabase/supabase-js';
import { requireAdmin } from './admin-auth';

type Env = {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
};

type Context = { request: Request; env: Env };

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

  const adminCheck = await requireAdmin(admin, request);
  if (!adminCheck.ok) return json({ error: adminCheck.error }, adminCheck.status);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Corpo JSON inválido' }, 400);
  }

  const { id, contabilizar } = (body ?? {}) as {
    id?: unknown;
    contabilizar?: unknown;
  };
  if (!isUuidString(id)) return json({ error: 'id inválido' }, 400);
  if (typeof contabilizar !== 'boolean') {
    return json({ error: 'contabilizar deve ser booleano' }, 400);
  }

  const { data: atendimento, error: atendimentoError } = await admin
    .from('atendimentos')
    .select('id, state, valor_centavos')
    .eq('id', id)
    .maybeSingle<{ id: string; state: string; valor_centavos: number | null }>();
  if (atendimentoError) return json({ error: atendimentoError.message }, 500);
  if (!atendimento) return json({ error: 'Atendimento não encontrado' }, 404);
  if (atendimento.state !== 'concluido') {
    return json({ error: 'Somente pedidos finalizados podem ser desabilitados' }, 409);
  }

  const { data: transacao, error: transacaoError } = await admin
    .from('transacoes')
    .select('id')
    .eq('atendimento_id', id)
    .maybeSingle<{ id: string }>();
  if (transacaoError) return json({ error: transacaoError.message }, 500);

  if (transacao) {
    if (!contabilizar) {
      const { error } = await admin.from('transacoes').delete().eq('id', transacao.id);
      if (error) return json({ error: error.message }, 500);
    }
    return json({ ok: true, contabilizar }, 200);
  }

  if (!contabilizar) {
    return json({ ok: true, contabilizar: false }, 200);
  }

  if (!atendimento.valor_centavos || atendimento.valor_centavos <= 0) {
    return json({ error: 'Atendimento não tem valor financeiro para reabilitar' }, 400);
  }

  const { error } = await admin.from('transacoes').insert({
    tipo: 'entrada',
    valor_centavos: atendimento.valor_centavos,
    descricao: `Atendimento #${id.slice(0, 8)}`,
    atendimento_id: id,
  });
  if (error) return json({ error: error.message }, 500);

  return json({ ok: true, contabilizar: true }, 200);
};

function isUuidString(value: unknown): value is string {
  return typeof value === 'string' && UUID_REGEX.test(value);
}
