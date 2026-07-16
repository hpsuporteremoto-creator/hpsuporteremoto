import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import {
  atendimentos,
  clientes,
  marketingCampanhaDestinatarios,
  marketingCampanhas,
  marketingEventos,
  profiles,
  servicos,
  transacoes,
} from '../../drizzle/schema';
import { requireAdmin } from './admin-auth';
import { type AppDatabase, type DatabaseEnv, withDatabase } from '../lib/db';
import { emailSchema, readJson, uuidSchema, z } from '../lib/validation';

type Env = DatabaseEnv & {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  RESEND_API_KEY?: string;
};

type Context = { request: Request; env: Env };

type ClienteMarketingRow = {
  id: string;
  nome: string;
  email: string | null;
  whatsapp: string;
  marketing_opt_in: boolean;
  marketing_opt_out_at: string | null;
  resend_contact_id: string | null;
};

type AtendimentoClienteRow = { cliente_id: string };

type AudienceRecipient = {
  id: string;
  nome: string;
  email: string;
  whatsapp: string;
  resend_contact_id: string | null;
};

type MarketingCampaignRow = {
  id: string;
  nome: string;
  assunto: string;
  mensagem: string;
  texto_previa: string | null;
  servico_id: string | null;
  somente_vendas_contabilizadas: boolean;
  status: CampaignStatus;
  total_destinatarios: number;
  agendada_para: string | null;
  enviada_em: string | null;
  resend_segment_id: string | null;
  resend_broadcast_id: string | null;
  erro: string | null;
  criado_por_user_id: string | null;
  created_at: string;
  updated_at: string;
  servico?: { id: string; nome: string } | null;
  criado_por?: { id: string; email: string; full_name: string | null } | null;
};

type CampaignStatus = 'rascunho' | 'agendada' | 'enviada' | 'falhou' | 'cancelada';

const DEFAULT_SENDER = 'HP Suporte <contato@hpsuporteremoto.com.br>';
const PAGE_SIZE = 1000;
const IMMEDIATE_CAMPAIGN_SEGMENT_NAME = 'HP Suporte - Campanhas imediatas';
const CONTACT_IMPORT_TIMEOUT_MS = 20_000;
const CONTACT_IMPORT_POLL_INTERVAL_MS = 750;

type CampaignSegment = {
  id: string;
  disposable: boolean;
};

const scheduledAtSchema = z
  .string()
  .trim()
  .nullable()
  .optional()
  .transform((value) => value || null)
  .refine((value) => value === null || (!Number.isNaN(new Date(value).getTime()) && new Date(value).getTime() > Date.now() + 60_000), {
    message: 'Agendamento deve ser uma data futura',
  })
  .transform((value) => (value ? new Date(value).toISOString() : null));

const campaignInputSchema = z.object({
  nome: z.string().trim().min(3).max(120),
  assunto: z.string().trim().min(3).max(180),
  mensagem: z.string().trim().min(3).max(20_000),
  texto_previa: z.string().trim().max(180).nullable().optional().transform((value) => value || null),
  servico_id: uuidSchema.nullable().optional().transform((value) => value ?? null),
  somente_vendas_contabilizadas: z.boolean().optional().default(true),
  agendada_para: scheduledAtSchema,
});

const marketingMutationSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('test'),
    email: emailSchema,
    assunto: z.string().trim().min(3).max(180),
    mensagem: z.string().trim().min(3).max(20_000),
  }),
  z.object({ action: z.literal('create'), ...campaignInputSchema.shape }),
]);

type CampaignInput = z.output<typeof campaignInputSchema>;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const onRequestGet = async (context: Context): Promise<Response> => {
  const { request, env } = context;
  const admin = createAdminClient(env);
  if (!admin) return json({ error: 'Servidor mal configurado (env vars ausentes)' }, 500);

  const adminCheck = await requireAdmin(admin, request);
  if (!adminCheck.ok) return json({ error: adminCheck.error }, adminCheck.status);

  const url = new URL(request.url);
  const action = url.searchParams.get('action') ?? 'overview';
  const servicoId = parseOptionalUuid(url.searchParams.get('servicoId'));
  const somenteContabilizados = url.searchParams.get('somenteContabilizados') !== 'false';

  try {
    if (action === 'campaign') {
      const parsedId = uuidSchema.safeParse(url.searchParams.get('id'));
      if (!parsedId.success) return json({ error: 'Campanha inválida' }, 400);
      const campanha = await withDatabase(env, (db) => getCampaign(db, parsedId.data));
      if (!campanha) return json({ error: 'Campanha não encontrada' }, 404);
      return json({ campanha }, 200);
    }

    const audience = await withDatabase(env, (db) =>
      resolveAudience(db, servicoId, somenteContabilizados),
    );

    if (action === 'download') {
      const field = url.searchParams.get('field');
      if (field !== 'emails' && field !== 'whatsapps') {
        return json({ error: 'Campo de exportação inválido' }, 400);
      }
      return csvDownload(audience, field);
    }

    if (action === 'audience') {
      return json(audienceResponse(audience), 200);
    }

    if (action === 'campaigns') {
      const campanhas = await withDatabase(env, listCampaigns);
      return json({ campanhas }, 200);
    }

    if (action !== 'overview') return json({ error: 'Ação inválida' }, 400);

    const campanhas = await withDatabase(env, listCampaigns);
    return json(
      {
        ...audienceResponse(audience),
        campanhas,
        remetente: DEFAULT_SENDER,
        resendConfigurado: Boolean(env.RESEND_API_KEY),
      },
      200,
    );
  } catch (err) {
    return json({ error: errorMessage(err, 'Erro ao carregar marketing') }, 500);
  }
};

export const onRequestPost = async (context: Context): Promise<Response> => {
  const { request, env } = context;
  const admin = createAdminClient(env);
  if (!admin) return json({ error: 'Servidor mal configurado (env vars ausentes)' }, 500);

  const adminCheck = await requireAdmin(admin, request);
  if (!adminCheck.ok) return json({ error: adminCheck.error }, adminCheck.status);

  const parsed = await readJson(request, marketingMutationSchema);
  if (!parsed.ok) return json({ error: parsed.error }, 400);
  const body = parsed.data;
  if (body.action === 'test') return sendTestEmail(env, body);
  return withDatabase(env, (db) => createCampaign(db, env, adminCheck.user.id, body));
};

function createAdminClient(env: Env): SupabaseClient | null {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return null;
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function sendTestEmail(
  env: Env,
  input: { email: string; assunto: string; mensagem: string },
): Promise<Response> {
  if (!env.RESEND_API_KEY) {
    return json({ error: 'RESEND_API_KEY não foi configurada no Cloudflare Pages.' }, 503);
  }
  const resend = new Resend(env.RESEND_API_KEY);
  const { data, error } = await resend.emails.send({
    from: DEFAULT_SENDER,
    to: [input.email],
    subject: `[Teste] ${input.assunto}`,
    html: renderCampaignHtml(input.mensagem, false),
    text: renderCampaignText(input.mensagem, false),
  });
  if (error) return json({ error: error.message }, 502);
  return json({ id: data?.id ?? null, message: 'Email de teste enviado.' }, 201);
}

async function createCampaign(
  db: AppDatabase,
  env: Env,
  userId: string,
  input: CampaignInput,
): Promise<Response> {
  if (!env.RESEND_API_KEY) {
    return json({ error: 'RESEND_API_KEY não foi configurada no Cloudflare Pages.' }, 503);
  }
  try {
    const recipients = await resolveAudience(
      db,
      input.servico_id,
      input.somente_vendas_contabilizadas,
    );
    if (recipients.length === 0) {
      return json({ error: 'Nenhum cliente com email e consentimento foi encontrado para este público.' }, 400);
    }

    const [campaignRecord] = await db
      .insert(marketingCampanhas)
      .values({
        nome: input.nome,
        assunto: input.assunto,
        mensagem: input.mensagem,
        textoPrevia: input.texto_previa,
        servicoId: input.servico_id,
        somenteVendasContabilizadas: input.somente_vendas_contabilizadas,
        agendadaPara: input.agendada_para,
        status: 'rascunho',
        totalDestinatarios: recipients.length,
        criadoPorUserId: userId,
      })
      .returning();
    if (!campaignRecord) throw new Error('Falha ao criar campanha');
    const campaign = toCampaignRow(campaignRecord);

    let segment: CampaignSegment | null = null;
    let broadcastCreated = false;
    try {
      await insertRecipients(db, campaign.id, recipients);
      const resend = new Resend(env.RESEND_API_KEY);
      segment = input.agendada_para
        ? await createScheduledCampaignSegment(resend, input.nome, campaign.id)
        : await getImmediateCampaignSegment(resend);
      if (!segment.disposable) {
        segment = await resetImmediateCampaignSegment(resend, segment.id);
      }

      const syncResult = await syncRecipientsToSegment(
        resend,
        segment.id,
        recipients,
      );
      if (syncResult.deliverable === 0) {
        const details = syncResult.failures.length
          ? ` ${syncResult.failures.slice(0, 3).join(' | ')}`
          : '';
        throw new Error(`Nenhum destinatário pôde ser sincronizado com o Resend.${details}`);
      }

      const broadcastResult = input.agendada_para
        ? await resend.broadcasts.create({
            name: input.nome,
            segmentId: segment.id,
            from: DEFAULT_SENDER,
            subject: input.assunto,
            previewText: input.texto_previa ?? undefined,
            html: renderCampaignHtml(input.mensagem, true),
            text: renderCampaignText(input.mensagem, true),
            send: true,
            scheduledAt: input.agendada_para,
          })
        : await resend.broadcasts.create({
            name: input.nome,
            segmentId: segment.id,
            from: DEFAULT_SENDER,
            subject: input.assunto,
            previewText: input.texto_previa ?? undefined,
            html: renderCampaignHtml(input.mensagem, true),
            text: renderCampaignText(input.mensagem, true),
            send: true,
          });
      if (broadcastResult.error || !broadcastResult.data) {
        throw new Error(broadcastResult.error?.message ?? 'Falha ao enviar campanha pelo Resend');
      }
      broadcastCreated = true;

      const status: CampaignStatus = input.agendada_para ? 'agendada' : 'enviada';
      const recipientStatus = input.agendada_para ? 'agendado' : 'enviado';
      const now = new Date().toISOString();
      await db
        .update(marketingCampanhas)
        .set({
          status,
          resendSegmentId: segment.id,
          resendBroadcastId: broadcastResult.data.id,
          enviadaEm: input.agendada_para ? null : now,
          erro: null,
        })
        .where(eq(marketingCampanhas.id, campaign.id));
      await db
        .update(marketingCampanhaDestinatarios)
        .set({ status: recipientStatus })
        .where(and(eq(marketingCampanhaDestinatarios.campanhaId, campaign.id), eq(marketingCampanhaDestinatarios.status, 'pendente')));
      await db.insert(marketingEventos).values({
        campanhaId: campaign.id,
        tipo: input.agendada_para ? 'broadcast.agendado' : 'broadcast.enviado',
        payload: {
          resend_broadcast_id: broadcastResult.data.id,
          resend_segment_id: segment.id,
          destinatarios: syncResult.deliverable,
        },
      });

      return json(
        {
          campanha: {
            ...campaign,
            status,
            resend_segment_id: segment.id,
            resend_broadcast_id: broadcastResult.data.id,
            enviada_em: input.agendada_para ? null : now,
          },
          message: input.agendada_para ? 'Campanha agendada.' : 'Campanha enviada.',
        },
        201,
      );
    } catch (err) {
      if (segment?.disposable && !broadcastCreated) {
        await resendDeleteSegment(env.RESEND_API_KEY, segment.id);
      }
      await db
        .update(marketingCampanhas)
        .set({ status: 'falhou', erro: errorMessage(err, 'Falha ao enviar campanha') })
        .where(eq(marketingCampanhas.id, campaign.id));
      return json({ error: errorMessage(err, 'Falha ao enviar campanha'), campanhaId: campaign.id }, 502);
    }
  } catch (err) {
    return json({ error: errorMessage(err, 'Falha ao criar campanha') }, 500);
  }
}

async function createScheduledCampaignSegment(
  resend: Resend,
  campaignName: string,
  campaignId: string,
): Promise<CampaignSegment> {
  const result = await resend.segments.create({
    name: `${safeSegmentName(campaignName)} ${campaignId.slice(0, 8)}`,
  });
  if (result.error || !result.data) {
    throw new Error(segmentErrorMessage(result.error?.message));
  }
  return { id: result.data.id, disposable: true };
}

async function getImmediateCampaignSegment(resend: Resend): Promise<CampaignSegment> {
  const listed = await resend.segments.list({ limit: 100 });
  if (listed.error || !listed.data) {
    throw new Error(listed.error?.message ?? 'Falha ao consultar segmentos no Resend');
  }
  const existing = listed.data.data.find((segment) => segment.name === IMMEDIATE_CAMPAIGN_SEGMENT_NAME);
  if (existing) return { id: existing.id, disposable: false };

  const created = await resend.segments.create({ name: IMMEDIATE_CAMPAIGN_SEGMENT_NAME });
  if (created.error || !created.data) {
    throw new Error(segmentErrorMessage(created.error?.message));
  }
  return { id: created.data.id, disposable: false };
}

async function resetImmediateCampaignSegment(
  resend: Resend,
  segmentId: string,
): Promise<CampaignSegment> {
  const removed = await resend.segments.remove(segmentId);
  if (removed.error) throw new Error(removed.error.message);

  const created = await resend.segments.create({ name: IMMEDIATE_CAMPAIGN_SEGMENT_NAME });
  if (created.error || !created.data) {
    throw new Error(segmentErrorMessage(created.error?.message));
  }
  return { id: created.data.id, disposable: false };
}

async function resendDeleteSegment(apiKey: string, segmentId: string): Promise<void> {
  const deleted = await new Resend(apiKey).segments.remove(segmentId);
  if (deleted.error) {
    console.error(`Não foi possível remover o segmento temporário ${segmentId}: ${deleted.error.message}`);
  }
}

function segmentErrorMessage(error: string | undefined): string {
  if (error?.includes('includes 3 segments')) {
    return 'O limite de segmentos do plano Resend foi atingido. Remova campanhas agendadas antigas ou aguarde a conclusão delas.';
  }
  return error ?? 'Falha ao criar segmento no Resend';
}

async function insertRecipients(
  db: AppDatabase,
  campaignId: string,
  recipients: readonly AudienceRecipient[],
): Promise<void> {
  const rows = recipients.map((recipient) => ({
    campanhaId: campaignId,
    clienteId: recipient.id,
    nome: recipient.nome,
    email: recipient.email,
    whatsapp: recipient.whatsapp || null,
    resendContactId: recipient.resend_contact_id,
  }));
  for (let index = 0; index < rows.length; index += PAGE_SIZE) {
    await db.insert(marketingCampanhaDestinatarios).values(rows.slice(index, index + PAGE_SIZE));
  }
}

async function syncRecipientsToSegment(
  resend: Resend,
  segmentId: string,
  recipients: readonly AudienceRecipient[],
): Promise<{ deliverable: number; failures: string[] }> {
  const imported = await resend.contacts.imports.create({
    file: new Blob([contactImportCsv(recipients)], { type: 'text/csv;charset=utf-8' }),
    columnMap: { email: 'email', firstName: 'first_name' },
    onConflict: 'upsert',
    segments: [{ id: segmentId }],
  });
  if (imported.error || !imported.data) {
    throw new Error(imported.error?.message ?? 'Falha ao iniciar importação de contatos no Resend');
  }
  const result = await waitForContactImport(resend, imported.data.id);
  const deliverable = Math.max(result.counts.created + result.counts.updated, recipients.length - result.counts.failed - result.counts.skipped);
  return {
    deliverable,
    failures: result.counts.failed > 0 ? [`${result.counts.failed} contato(s) recusado(s) pelo Resend`] : [],
  };
}

async function waitForContactImport(
  resend: Resend,
  importId: string,
): Promise<{ counts: { created: number; updated: number; skipped: number; failed: number } }> {
  const deadline = Date.now() + CONTACT_IMPORT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const current = await resend.contacts.imports.get(importId);
    if (current.error || !current.data) {
      throw new Error(current.error?.message ?? 'Falha ao acompanhar importação de contatos no Resend');
    }
    if (current.data.status === 'completed') return current.data;
    if (current.data.status === 'failed') throw new Error('O Resend não concluiu a importação dos contatos');
    await delay(CONTACT_IMPORT_POLL_INTERVAL_MS);
  }
  throw new Error('O Resend ainda está preparando o público. Tente enviar novamente em alguns segundos.');
}

function contactImportCsv(recipients: readonly AudienceRecipient[]): string {
  const rows = recipients.map((recipient) => [recipient.email, firstName(recipient.nome)]);
  return `email,first_name\n${rows.map((row) => row.map(escapeCsv).join(',')).join('\n')}`;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function resolveAudience(
  db: AppDatabase,
  servicoId: string | null,
  somenteContabilizados: boolean,
): Promise<AudienceRecipient[]> {
  const purchasedIds = servicoId
    ? await listPurchasedClientIds(db, servicoId, somenteContabilizados)
    : null;
  if (purchasedIds && purchasedIds.size === 0) return [];

  const clients = await listMarketingClients(db);
  const byEmail = new Map<string, AudienceRecipient>();
  for (const client of clients) {
    if (!client.marketing_opt_in || client.marketing_opt_out_at || !client.email) continue;
    if (purchasedIds && !purchasedIds.has(client.id)) continue;
    const email = normalizeEmail(client.email);
    if (!email || byEmail.has(email)) continue;
    byEmail.set(email, {
      id: client.id,
      nome: client.nome,
      email,
      whatsapp: client.whatsapp,
      resend_contact_id: client.resend_contact_id,
    });
  }
  return [...byEmail.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

async function listMarketingClients(db: AppDatabase): Promise<ClienteMarketingRow[]> {
  return db
    .select({ id: clientes.id, nome: clientes.nome, email: clientes.email, whatsapp: clientes.whatsapp, marketing_opt_in: clientes.marketingOptIn, marketing_opt_out_at: clientes.marketingOptOutAt, resend_contact_id: clientes.resendContactId })
    .from(clientes)
    .where(and(eq(clientes.ativo, true), eq(clientes.marketingOptIn, true), isNull(clientes.marketingOptOutAt)))
    .orderBy(asc(clientes.nome));
}

async function listPurchasedClientIds(
  db: AppDatabase,
  servicoId: string,
  somenteContabilizados: boolean,
): Promise<Set<string>> {
  const query = db
    .selectDistinct({ cliente_id: atendimentos.clienteId })
    .from(atendimentos)
    .where(
      and(
        eq(atendimentos.state, 'concluido'),
        sql`${atendimentos.servicoIds} @> ARRAY[${servicoId}]::uuid[]`,
      ),
    );
  const rows = somenteContabilizados
    ? await query.innerJoin(transacoes, eq(atendimentos.id, transacoes.atendimentoId))
    : await query;
  return new Set(rows.map((row) => row.cliente_id));
}

async function listCampaigns(db: AppDatabase): Promise<MarketingCampaignRow[]> {
  const rows = await db
    .select({ campaign: marketingCampanhas, servico: { id: servicos.id, nome: servicos.nome }, criado_por: { id: profiles.id, email: profiles.email, full_name: profiles.fullName } })
    .from(marketingCampanhas)
    .leftJoin(servicos, eq(marketingCampanhas.servicoId, servicos.id))
    .leftJoin(profiles, eq(marketingCampanhas.criadoPorUserId, profiles.id))
    .orderBy(desc(marketingCampanhas.createdAt))
    .limit(100);
  return rows.map((row) => ({
    ...toCampaignRow(row.campaign),
    servico: row.servico?.id ? row.servico : null,
    criado_por: row.criado_por?.id ? row.criado_por : null,
  }));
}

async function getCampaign(db: AppDatabase, id: string): Promise<MarketingCampaignRow | null> {
  const [row] = await db
    .select({ campaign: marketingCampanhas, servico: { id: servicos.id, nome: servicos.nome }, criado_por: { id: profiles.id, email: profiles.email, full_name: profiles.fullName } })
    .from(marketingCampanhas)
    .leftJoin(servicos, eq(marketingCampanhas.servicoId, servicos.id))
    .leftJoin(profiles, eq(marketingCampanhas.criadoPorUserId, profiles.id))
    .where(eq(marketingCampanhas.id, id))
    .limit(1);
  if (!row) return null;
  return {
    ...toCampaignRow(row.campaign),
    servico: row.servico?.id ? row.servico : null,
    criado_por: row.criado_por?.id ? row.criado_por : null,
  };
}

function toCampaignRow(campaign: typeof marketingCampanhas.$inferSelect): MarketingCampaignRow {
  return {
    id: campaign.id,
    nome: campaign.nome,
    assunto: campaign.assunto,
    mensagem: campaign.mensagem,
    texto_previa: campaign.textoPrevia,
    servico_id: campaign.servicoId,
    somente_vendas_contabilizadas: campaign.somenteVendasContabilizadas,
    status: campaign.status as CampaignStatus,
    total_destinatarios: campaign.totalDestinatarios,
    agendada_para: campaign.agendadaPara,
    enviada_em: campaign.enviadaEm,
    resend_segment_id: campaign.resendSegmentId,
    resend_broadcast_id: campaign.resendBroadcastId,
    erro: campaign.erro,
    criado_por_user_id: campaign.criadoPorUserId,
    created_at: campaign.createdAt,
    updated_at: campaign.updatedAt,
  };
}

function audienceResponse(audience: readonly AudienceRecipient[]): Record<string, unknown> {
  const whatsapp = Array.from(
    new Set(audience.map((recipient) => recipient.whatsapp).filter((value) => value.length > 0)),
  );
  return {
    destinatarios: audience,
    total: audience.length,
    totalEmails: audience.length,
    totalWhatsapps: whatsapp.length,
  };
}

function csvDownload(audience: readonly AudienceRecipient[], field: 'emails' | 'whatsapps'): Response {
  const rows =
    field === 'emails'
      ? [['Nome', 'Email'], ...audience.map((recipient) => [recipient.nome, recipient.email])]
      : [
          ['Nome', 'WhatsApp'],
          ...audience
            .filter((recipient) => recipient.whatsapp.length > 0)
            .map((recipient) => [recipient.nome, `+${recipient.whatsapp}`]),
        ];
  const csv = `\uFEFF${rows.map((row) => row.map(escapeCsv).join(';')).join('\r\n')}\r\n`;
  const filename = field === 'emails' ? 'emails-marketing.csv' : 'whatsapps-marketing.csv';
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}

function normalizeEmail(value: unknown): string | null {
  const parsed = emailSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function parseOptionalUuid(value: string | null): string | null {
  const parsed = uuidSchema.safeParse(value?.trim() ?? '');
  return parsed.success ? parsed.data : null;
}

function renderCampaignHtml(message: string, includeUnsubscribe: boolean): string {
  const paragraphs = message
    .split(/\r?\n\s*\r?\n/g)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\r?\n/g, '<br>')}</p>`)
    .join('');
  const unsubscribe = includeUnsubscribe
    ? '<p style="margin-top:32px;font-size:12px;color:#64748b">Não quer mais receber estas mensagens? <a href="{{{RESEND_UNSUBSCRIBE_URL}}}">Cancelar inscrição</a></p>'
    : '';
  return `<main style="font-family:Arial,sans-serif;line-height:1.6;color:#172033;max-width:640px;margin:0 auto;padding:24px">${paragraphs}${unsubscribe}</main>`;
}

function renderCampaignText(message: string, includeUnsubscribe: boolean): string {
  return includeUnsubscribe
    ? `${message}\n\nNão quer mais receber estas mensagens? {{{RESEND_UNSUBSCRIBE_URL}}}`
    : message;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function escapeCsv(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function firstName(value: string): string {
  return value.trim().split(/\s+/)[0] || 'Cliente';
}

function safeSegmentName(value: string): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, 90);
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}
