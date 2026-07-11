import { asc, and, eq } from 'drizzle-orm';
import { servicoCategorias, servicos } from '../../drizzle/schema';
import { type DatabaseEnv, withDatabase } from '../lib/db';

type Context = { request: Request; env: DatabaseEnv };

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const onRequestGet = async ({ env }: Context): Promise<Response> => {
  try {
    const servicosDaVitrine = await withDatabase(env, async (db) => {
      const rows = await db
        .select({
          id: servicos.id,
          nome: servicos.nome,
          categoria_id: servicos.categoriaId,
          descricao: servicos.descricao,
          imagem_url: servicos.imagemUrl,
          valor_centavos: servicos.valorCentavos,
          ativo: servicos.ativo,
          vitrine: servicos.vitrine,
          created_at: servicos.createdAt,
          categoria: {
            id: servicoCategorias.id,
            nome: servicoCategorias.nome,
            descricao: servicoCategorias.descricao,
            ativo: servicoCategorias.ativo,
          },
        })
        .from(servicos)
        .leftJoin(servicoCategorias, eq(servicos.categoriaId, servicoCategorias.id))
        .where(and(eq(servicos.ativo, true), eq(servicos.vitrine, true)))
        .orderBy(asc(servicos.nome));

      return rows.map((row) => ({
        ...row,
        categoria: row.categoria?.id ? row.categoria : null,
      }));
    });
    return json({ servicos: servicosDaVitrine }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao carregar catálogo';
    return json({ error: message }, 500);
  }
};
