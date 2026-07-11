import { and, asc, count, eq, inArray, type SQL } from 'drizzle-orm';
import { createClient } from '@supabase/supabase-js';
import { servicoCategorias, servicos } from '../../drizzle/schema';
import { requireStaff } from './admin-auth';
import { type AppDatabase, type DatabaseEnv, withDatabase } from '../lib/db';

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

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: 'Corpo JSON inválido' }, 400);
  }

  const action = body['action'];
  const id = typeof body['id'] === 'string' ? body['id'] : null;
  if ((action === 'update' || action === 'toggle') && !id) {
    return json({ error: 'id obrigatório' }, 400);
  }

  try {
    if (action === 'toggle') {
      if (!id) return json({ error: 'id obrigatório' }, 400);
      await withDatabase(env, (db) =>
        db.update(servicos).set({ ativo: body['ativo'] === true }).where(eq(servicos.id, id)),
      );
      return json({ ok: true }, 200);
    }

    const input = buildServicoInput(body);
    if ('error' in input) return json({ error: input.error }, 400);

    const servico = await withDatabase(env, async (db) => {
      if (action === 'update') {
        if (!id) return null;
        const [updated] = await db
          .update(servicos)
          .set(input)
          .where(eq(servicos.id, id))
          .returning({ id: servicos.id });
        return updated ? findServico(db, updated.id) : null;
      }

      const [created] = await db.insert(servicos).values(input).returning({ id: servicos.id });
      return created ? findServico(db, created.id) : null;
    });

    if (!servico) return json({ error: 'Serviço não encontrado' }, 404);
    return json({ servico }, action === 'update' ? 200 : 201);
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

function buildServicoInput(body: Record<string, unknown>): ServicoInput | { error: string } {
  const nome = typeof body['nome'] === 'string' ? body['nome'].trim() : '';
  const valorCentavos = body['valor_centavos'];
  if (nome.length < 2) return { error: 'Nome obrigatório' };
  if (typeof valorCentavos !== 'number' || !Number.isInteger(valorCentavos) || valorCentavos < 0) {
    return { error: 'Valor inválido' };
  }
  return {
    nome,
    categoriaId: typeof body['categoria_id'] === 'string' ? body['categoria_id'] : null,
    descricao: normalizeOptionalText(body['descricao']),
    imagemUrl: normalizeOptionalText(body['imagem_url']),
    valorCentavos,
    ativo: body['ativo'] !== false,
    vitrine: body['vitrine'] !== false,
  };
}

function normalizeOptionalText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text.length > 0 ? text : null;
}

function databaseErrorMessage(error: unknown): string {
  const candidate = error as { code?: string; message?: string };
  if (candidate.code === '23503') return 'A categoria selecionada não existe.';
  if (typeof candidate.message === 'string') return candidate.message;
  return 'Erro ao salvar serviço';
}
