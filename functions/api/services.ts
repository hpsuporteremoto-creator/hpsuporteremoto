import { and, asc, count, eq, inArray, type SQL } from 'drizzle-orm';
import { createClient } from '@supabase/supabase-js';
import { servicoCategorias, servicos } from '../../drizzle/schema';
import { requireStaff } from './admin-auth';
import { type AppDatabase, type DatabaseEnv, withDatabase } from '../lib/db';
import { readJson, uuidSchema, z } from '../lib/validation';

type Env = DatabaseEnv & {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
};

type Context = { request: Request; env: Env };

type ServicoInput = {
  nome: string;
  categoriaId: string | null;
  descricao: string | null;
  imagemUrl: string | null;
  valorCentavos: number;
  ativo: boolean;
  vitrine: boolean;
};

const servicoDataFields = z.object({
  nome: z.string().trim().min(2, 'Nome deve ter ao menos 2 caracteres'),
  categoria_id: uuidSchema.nullable().optional().transform((value) => value ?? null),
  descricao: z.string().trim().max(20_000).nullable().optional().transform((value) => value || null),
  imagem_url: z.string().trim().url('URL da imagem inválida').max(2_048).nullable().optional().transform((value) => value || null),
  valor_centavos: z.number().int().nonnegative('Valor inválido'),
  ativo: z.boolean().optional().default(true),
  vitrine: z.boolean().optional().default(true),
});

const servicoDataSchema = servicoDataFields.transform((value): ServicoInput => ({
  nome: value.nome,
  categoriaId: value.categoria_id,
  descricao: value.descricao,
  imagemUrl: value.imagem_url,
  valorCentavos: value.valor_centavos,
  ativo: value.ativo,
  vitrine: value.vitrine,
}));

const servicoMutationSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('create'), ...servicoDataFields.shape }),
  z.object({ action: z.literal('update'), id: uuidSchema, ...servicoDataFields.shape }),
  z.object({ action: z.literal('toggle'), id: uuidSchema, ativo: z.boolean() }),
]);

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const onRequestGet = async (context: Context): Promise<Response> => {
  const { request, env } = context;
  const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const staffCheck = await requireStaff(admin, request);
  if (!staffCheck.ok) return json({ error: staffCheck.error }, staffCheck.status);

  try {
    const url = new URL(request.url);
    const id = url.searchParams.get('id')?.trim();
    const ativoParam = url.searchParams.get('ativo');
    const ids = (url.searchParams.get('ids') ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);

    const result = await withDatabase(env, async (db) => {
      if (id) return { servico: await findServico(db, id) };

      const ativo = ativoParam === 'true' || ativoParam === 'false' ? ativoParam === 'true' : null;
      if (ids.length > 0) {
        const condition = ativo === null
          ? inArray(servicos.id, ids)
          : and(inArray(servicos.id, ids), eq(servicos.ativo, ativo));
        const lista = await selectServicos(db, condition);
        const byId = new Map(lista.map((servico) => [servico.id, servico]));
        return { servicos: ids.flatMap((servicoId) => byId.get(servicoId) ?? []) };
      }
      const [lista, ativos, inativos] = await Promise.all([
        listServicos(db, ativo),
        db.select({ total: count() }).from(servicos).where(eq(servicos.ativo, true)),
        db.select({ total: count() }).from(servicos).where(eq(servicos.ativo, false)),
      ]);
      return {
        servicos: lista,
        counts: {
          ativos: ativos[0]?.total ?? 0,
          inativos: inativos[0]?.total ?? 0,
        },
      };
    });

    return json(result, 200);
  } catch (error) {
    return json({ error: databaseErrorMessage(error) }, 500);
  }
};

export const onRequestPost = async (context: Context): Promise<Response> => {
  const { request, env } = context;
  const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const staffCheck = await requireStaff(admin, request);
  if (!staffCheck.ok) return json({ error: staffCheck.error }, staffCheck.status);

  const parsed = await readJson(request, servicoMutationSchema);
  if (!parsed.ok) return json({ error: parsed.error }, 400);
  const body = parsed.data;

  try {
    if (body.action === 'toggle') {
      await withDatabase(env, (db) =>
        db.update(servicos).set({ ativo: body.ativo }).where(eq(servicos.id, body.id)),
      );
      return json({ ok: true }, 200);
    }

    const input = servicoDataSchema.parse(body);

    const servico = await withDatabase(env, async (db) => {
      if (body.action === 'update') {
        const [updated] = await db
          .update(servicos)
          .set(input)
          .where(eq(servicos.id, body.id))
          .returning({ id: servicos.id });
        return updated ? findServico(db, updated.id) : null;
      }

      const [created] = await db.insert(servicos).values(input).returning({ id: servicos.id });
      return created ? findServico(db, created.id) : null;
    });

    if (!servico) return json({ error: 'Serviço não encontrado' }, 404);
    return json({ servico }, body.action === 'update' ? 200 : 201);
  } catch (error) {
    return json({ error: databaseErrorMessage(error) }, 400);
  }
};

async function findServico(
  db: AppDatabase,
  id: string,
): Promise<ServicoResponse | null> {
  const rows = await selectServicos(db, eq(servicos.id, id));
  return rows[0] ?? null;
}

async function listServicos(
  db: AppDatabase,
  ativo: boolean | null,
): Promise<ServicoResponse[]> {
  return selectServicos(db, ativo === null ? undefined : eq(servicos.ativo, ativo));
}

type ServicoResponse = {
  id: string;
  nome: string;
  categoria_id: string | null;
  descricao: string | null;
  imagem_url: string | null;
  valor_centavos: number;
  ativo: boolean;
  vitrine: boolean;
  created_at: string;
  categoria: { id: string; nome: string; descricao: string | null; ativo: boolean } | null;
};

async function selectServicos(
  db: AppDatabase,
  condition?: SQL,
): Promise<ServicoResponse[]> {
  const query = db
    .select({
      id: servicos.id,
      nome: servicos.nome,
      categoriaId: servicos.categoriaId,
      descricao: servicos.descricao,
      imagemUrl: servicos.imagemUrl,
      valorCentavos: servicos.valorCentavos,
      ativo: servicos.ativo,
      vitrine: servicos.vitrine,
      createdAt: servicos.createdAt,
      categoria: {
        id: servicoCategorias.id,
        nome: servicoCategorias.nome,
        descricao: servicoCategorias.descricao,
        ativo: servicoCategorias.ativo,
      },
    })
    .from(servicos)
    .leftJoin(servicoCategorias, eq(servicos.categoriaId, servicoCategorias.id));
  const rows = condition ? await query.where(condition).orderBy(asc(servicos.nome)) : await query.orderBy(asc(servicos.nome));
  return rows.map((row) => ({
    id: row.id,
    nome: row.nome,
    categoria_id: row.categoriaId,
    descricao: row.descricao,
    imagem_url: row.imagemUrl,
    valor_centavos: row.valorCentavos,
    ativo: row.ativo,
    vitrine: row.vitrine,
    created_at: row.createdAt,
    categoria: row.categoria?.id
      ? {
          id: row.categoria.id,
          nome: row.categoria.nome ?? '',
          descricao: row.categoria.descricao,
          ativo: row.categoria.ativo ?? false,
        }
      : null,
  }));
}

function databaseErrorMessage(error: unknown): string {
  const candidate = error as { code?: string; message?: string };
  if (candidate.code === '23503') return 'A categoria selecionada não existe.';
  if (typeof candidate.message === 'string') return candidate.message;
  return 'Erro ao salvar serviço';
}
