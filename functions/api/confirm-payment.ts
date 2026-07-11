import { createClient } from '@supabase/supabase-js';
import { getInstitutionByIspb } from '@thiagoprazeres/ispb-participants';
import { parseE2EId } from '@thiagoprazeres/parse-e2eid';
import { eq } from 'drizzle-orm';
import { atendimentos } from '../../drizzle/schema';
import { requireStaff } from './admin-auth';
import { canStaffAccessAtendimento } from './atendimentos-shared';
import { type DatabaseEnv, withDatabase } from '../lib/db';
import { readJson, uuidSchema, z } from '../lib/validation';

type Env = DatabaseEnv & {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
};

type Context = { request: Request; env: Env };

const confirmPaymentSchema = z
  .object({
    atendimento_id: uuidSchema,
    end_to_end_id: z
      .string()
      .trim()
      .max(64)
      .nullable()
      .optional()
      .transform((value) => value?.replace(/\s+/g, '').toUpperCase() || null),
    comprovante_path: z.string().trim().max(512).nullable().optional().transform((value) => value || null),
    comprovante_nome: z.string().trim().max(255).nullable().optional().transform((value) => value || null),
    comprovante_tipo: z.string().trim().max(120).nullable().optional().transform((value) => value || null),
  })
  .refine(
    (value) =>
      !value.comprovante_path ||
      (Boolean(value.comprovante_nome) && Boolean(value.comprovante_tipo)),
    { message: 'Dados do comprovante incompletos', path: ['comprovante_path'] },
  );

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const onRequestPost = async ({ request, env }: Context): Promise<Response> => {
  const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const staffCheck = await requireStaff(admin, request);
  if (!staffCheck.ok) return json({ error: staffCheck.error }, staffCheck.status);

  const parsed = await readJson(request, confirmPaymentSchema);
  if (!parsed.ok) return json({ error: parsed.error }, 400);
  const input = parsed.data;

  let payment: { ispb: string; institution: string | null } | null = null;
  if (input.end_to_end_id) {
    try {
      const parsedE2e = parseE2EId(input.end_to_end_id);
      const institution = getInstitutionByIspb(parsedE2e.ispb);
      payment = { ispb: parsedE2e.ispb, institution: institution?.name ?? null };
    } catch (error) {
      return json(
        { error: error instanceof Error ? `EndToEndId inválido: ${error.message}` : 'EndToEndId inválido' },
        400,
      );
    }
  }

  if (input.comprovante_path && !input.comprovante_path.startsWith(`${input.atendimento_id}/`)) {
    return json({ error: 'Comprovante inválido para este atendimento' }, 400);
  }

  try {
    const result = await withDatabase(env, async (db) => {
      const [atendimento] = await db
        .select({
          state: atendimentos.state,
          criado_por_user_id: atendimentos.criadoPorUserId,
          vendido_por_user_id: atendimentos.vendidoPorUserId,
          atendido_por_user_id: atendimentos.atendidoPorUserId,
        })
        .from(atendimentos)
        .where(eq(atendimentos.id, input.atendimento_id));
      if (!atendimento) return 'not-found' as const;
      if (!canStaffAccessAtendimento(atendimento, staffCheck.role, staffCheck.user.id)) {
        return 'forbidden' as const;
      }
      if (atendimento.state !== 'pagamento') return 'locked' as const;

      await db
        .update(atendimentos)
        .set({
          state: 'concluido',
          pagamentoEndToEndId: input.end_to_end_id,
          pagamentoIspb: payment?.ispb ?? null,
          pagamentoInstituicao: payment?.institution ?? null,
          pagamentoComprovantePath: input.comprovante_path,
          pagamentoComprovanteNome: input.comprovante_nome,
          pagamentoComprovanteTipo: input.comprovante_tipo,
          pagamentoConfirmadoEm: new Date().toISOString(),
          pagamentoConfirmadoPorUserId: staffCheck.user.id,
        })
        .where(eq(atendimentos.id, input.atendimento_id));
      return 'ok' as const;
    });

    if (result === 'not-found') return json({ error: 'Atendimento não encontrado' }, 404);
    if (result === 'forbidden') return json({ error: 'Acesso restrito aos seus atendimentos' }, 403);
    if (result === 'locked') return json({ error: 'Somente atendimentos em pagamento podem ser finalizados' }, 409);
    return json({ ok: true, payment }, 200);
  } catch (error) {
    const candidate = error as { code?: string; message?: string };
    if (candidate.code === '23505') {
      return json({ error: 'Este EndToEndId já foi registrado em outro atendimento' }, 409);
    }
    return json({ error: candidate.message ?? 'Erro ao confirmar pagamento' }, 500);
  }
};
