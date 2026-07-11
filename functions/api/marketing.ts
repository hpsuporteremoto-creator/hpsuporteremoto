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

type CampaignInput = {
  nome: string;
  assunto: string;
  mensagem: string;
  texto_previa: string | null;
  servico_id: string | null;
  somente_vendas_contabilizadas: boolean;
  agendada_para: string | null;
};

const DEFAULT_SENDER = 'HP Suporte <contato@hpsuporteremoto.com.br>';
const EMAIL_REGEX = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const PAGE_SIZE = 1000;

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
  const servicoId = normalizeUuid(url.searchParams.get('servicoId'));
  const somenteContabilizados = url.searchParams.get('somenteContabilizados') !== 'false';

  try {
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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Corpo JSON inválido' }, 400);
  }

  const record = toRecord(body);
  const action = typeof record['action'] === 'string' ? record['action'] : '';

  if (action === 'test') {
    return sendTestEmail(env, record);
  }
  if (action === 'create') {
    return withDatabase(env, (db) => createCampaign(db, env, adminCheck.user.id, record));
  }
  return json({ error: 'Ação inválida' }, 400);
};

function createAdminClient(env: Env): SupabaseClient | null {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return null;
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function sendTestEmail(env: Env, record: Record<string, unknown>): Promise<Response> {
  if (!env.RESEND_API_KEY) {
    return json({ error: 'RESEND_API_KEY não foi configurada no Cloudflare Pages.' }, 503);
  }
  const email = normalizeEmail(record['email']);
  const assunto = normalizeText(record['assunto'], 3, 180);
  const mensagem = normalizeText(record['mensagem'], 3, 20_000);
  if (!email || !assunto || !mensagem) {
    return json({ error: 'Informe email, assunto e mensagem para o teste.' }, 400);
  }

  const resend = new Resend(env.RESEND_API_KEY);
  const { data, error } = await resend.emails.send({
    from: DEFAULT_SENDER,
    to: [email],
    subject: `[Teste] ${assunto}`,
    html: renderCampaignHtml(mensagem, false),
    text: renderCampaignText(mensagem, false),
  });
  if (error) return json({ error: error.message }, 502);
  return json({ id: data?.id ?? null, message: 'Email de teste enviado.' }, 201);
}

async function createCampaign(
  db: AppDatabase,
  env: Env,
  userId: string,
  record: Record<string, unknown>,
): Promise<Response> {
  if (!env.RESEND_API_KEY) {
    return json({ error: 'RESEND_API_KEY não foi configurada no Cloudflare Pages.' }, 503);
  }
  const input = parseCampaignInput(record);
  if (!input) return json({ error: 'Dados da campanha inválidos.' }, 400);

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

    try {
      await insertRecipients(db, campaign.id, recipients);
      const resend = new Resend(env.RESEND_API_KEY);
      const segmentResult = await resend.segments.create({
        name: `${safeSegmentName(input.nome)} ${campaign.id.slice(0, 8)}`,
      });
      if (segmentResult.error || !segmentResult.data) {
        throw new Error(segmentResult.error?.message ?? 'Falha ao criar segmento no Resend');
      }

      const deliverable = await syncRecipientsToSegment(
        db,
        resend,
        campaign.id,
        segmentResult.data.id,
        recipients,
      );
      if (deliverable === 0) {
        throw new Error('Nenhum destinatário pôde ser sincronizado com o Resend.');
      }

      const broadcastResult = input.agendada_para
        ? await resend.broadcasts.create({
            name: input.nome,
            segmentId: segmentResult.data.id,
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
            segmentId: segmentResult.data.id,
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

      const status: CampaignStatus = input.agendada_para ? 'agendada' : 'enviada';
      const recipientStatus = input.agendada_para ? 'agendado' : 'enviado';
      const now = new Date().toISOString();
      await db
        .update(marketingCampanhas)
        .set({
          status,
          resendSegmentId: segmentResult.data.id,
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
          resend_segment_id: segmentResult.data.id,
          destinatarios: deliverable,
        },
      });

      return json(
        {
          campanha: {
            ...campaign,
            status,
            resend_segment_id: segmentResult.data.id,
            resend_broadcast_id: broadcastResult.data.id,
            enviada_em: input.agendada_para ? null : now,
          },
          message: input.agendada_para ? 'Campanha agendada.' : 'Campanha enviada.',
        },
        201,
      );
    } catch (err) {
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
  db: AppDatabase,
  resend: Resend,
  campaignId: string,
  segmentId: string,
  recipients: readonly AudienceRecipient[],
): Promise<number> {
  let deliverable = 0;
  for (const recipient of recipients) {
    try {
      const contact = await ensureResendContact(resend, recipient);
      if (contact.unsubscribed) {
        await markRecipient(db, campaignId, recipient, 'descadastrado');
        await db
          .update(clientes)
          .set({ marketingOptIn: false, marketingOptOutAt: new Date().toISOString() })
          .where(eq(clientes.id, recipient.id));
        continue;
      }

      const membership = await resend.contacts.segments.add({
        contactId: contact.id,
        segmentId,
      });
      if (membership.error) throw new Error(membership.error.message);

      await markRecipient(db, campaignId, recipient, 'pendente', null, contact.id);
      await db.update(clientes).set({ resendContactId: contact.id }).where(eq(clientes.id, recipient.id));
      deliverable += 1;
    } catch (err) {
      await markRecipient(db, campaignId, recipient, 'falhou', errorMessage(err, 'Falha no Resend'));
    }
  }
  return deliverable;
}

async function ensureResendContact(
  resend: Resend,
  recipient: AudienceRecipient,
): Promise<{ id: string; unsubscribed: boolean }> {
  const current = recipient.resend_contact_id
    ? await resend.contacts.get({ id: recipient.resend_contact_id })
    : await resend.contacts.get({ email: recipient.email });
  if (current.data) {
    return { id: current.data.id, unsubscribed: current.data.unsubscribed };
  }

  const created = await resend.contacts.create({
    email: recipient.email,
    firstName: firstName(recipient.nome),
    properties: { CLIENTE_ID: recipient.id },
  });
  if (created.data) return { id: created.data.id, unsubscribed: false };

  const retried = await resend.contacts.get({ email: recipient.email });
  if (retried.data) return { id: retried.data.id, unsubscribed: retried.data.unsubscribed };
  throw new Error(created.error?.message ?? retried.error?.message ?? 'Contato não pôde ser criado');
}

async function markRecipient(
  db: AppDatabase,
  campaignId: string,
  recipient: AudienceRecipient,
  status: string,
  erro: string | null = null,
  resendContactId: string | null = null,
): Promise<void> {
  await db
    .update(marketingCampanhaDestinatarios)
    .set({ status, erro, ...(resendContactId ? { resendContactId } : {}) })
    .where(and(eq(marketingCampanhaDestinatarios.campanhaId, campaignId), eq(marketingCampanhaDestinatarios.email, recipient.email)));
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

function parseCampaignInput(record: Record<string, unknown>): CampaignInput | null {
  const nome = normalizeText(record['nome'], 3, 120);
  const assunto = normalizeText(record['assunto'], 3, 180);
  const mensagem = normalizeText(record['mensagem'], 3, 20_000);
  const textoPrevia = normalizeOptionalText(record['texto_previa'], 180);
  const servicoId = normalizeUuid(record['servico_id']);
  const somenteContabilizados = record['somente_vendas_contabilizadas'] !== false;
  const agendadaPara = normalizeSchedule(record['agendada_para']);
  if (!nome || !assunto || !mensagem) return null;
  if (record['agendada_para'] !== null && record['agendada_para'] !== undefined && !agendadaPara) {
    return null;
  }
  return {
    nome,
    assunto,
    mensagem,
    texto_previa: textoPrevia,
    servico_id: servicoId,
    somente_vendas_contabilizadas: somenteContabilizados,
    agendada_para: agendadaPara,
  };
}

function normalizeSchedule(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim().length === 0) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date.getTime() <= Date.now() + 60_000) return null;
  return date.toISOString();
}

function normalizeText(value: unknown, minLength: number, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text.length >= minLength && text.length <= maxLength ? text : null;
}

function normalizeOptionalText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text.length > 0 && text.length <= maxLength ? text : null;
}

function normalizeEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  return EMAIL_REGEX.test(email) ? email : null;
}

function normalizeUuid(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value.trim(),
  )
    ? value.trim()
    : null;
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

function toRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}
