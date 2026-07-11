import { createClient } from '@supabase/supabase-js';
import { and, eq, ilike } from 'drizzle-orm';
import { Resend, type WebhookEventPayload } from 'resend';
import { clientes, marketingCampanhaDestinatarios, marketingCampanhas, marketingEventos } from '../../drizzle/schema';
import { type DatabaseEnv, withDatabase } from '../lib/db';

type Env = DatabaseEnv & {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  RESEND_API_KEY?: string;
  RESEND_WEBHOOK_SECRET?: string;
};

type Context = { request: Request; env: Env };

type MarketingEmailWebhookEvent = Exclude<
  WebhookEventPayload,
  | { type: 'email.received' }
  | { type: 'contact.created' }
  | { type: 'contact.updated' }
  | { type: 'contact.deleted' }
  | { type: 'domain.created' }
  | { type: 'domain.updated' }
  | { type: 'domain.deleted' }
>;

const RECIPIENT_STATUS: Readonly<Record<string, string>> = {
  'email.scheduled': 'agendado',
  'email.sent': 'enviado',
  'email.delivered': 'entregue',
  'email.opened': 'aberto',
  'email.clicked': 'clicado',
  'email.bounced': 'falhou',
  'email.failed': 'falhou',
  'email.suppressed': 'falhou',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const onRequestPost = async ({ request, env }: Context): Promise<Response> => {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY || !env.RESEND_API_KEY) {
    return json({ error: 'Servidor mal configurado' }, 500);
  }
  if (!env.RESEND_WEBHOOK_SECRET) {
    return json({ error: 'Webhook não configurado' }, 503);
  }

  const payload = await request.text();
  const id = request.headers.get('svix-id');
  const timestamp = request.headers.get('svix-timestamp');
  const signature = request.headers.get('svix-signature');
  if (!id || !timestamp || !signature) return json({ error: 'Assinatura ausente' }, 400);

  let event: WebhookEventPayload;
  try {
    event = new Resend(env.RESEND_API_KEY).webhooks.verify({
      payload,
      webhookSecret: env.RESEND_WEBHOOK_SECRET,
      headers: { id, timestamp, signature },
    });
  } catch {
    return json({ error: 'Assinatura inválida' }, 400);
  }

  try {
    if (event.type === 'contact.updated' && event.data.unsubscribed) {
      await withDatabase(env, (db) =>
        db
          .update(clientes)
          .set({ marketingOptIn: false, marketingOptOutAt: new Date().toISOString() })
          .where(ilike(clientes.email, event.data.email)),
      );
      return json({ ok: true });
    }

    if (!isMarketingEmailEvent(event)) return json({ ok: true });
    const broadcastId = event.data.broadcast_id;
    const email = event.data.to[0]?.trim().toLowerCase();
    if (!broadcastId || !email) return json({ ok: true });

    const campaign = await withDatabase(env, async (db) => {
      const [row] = await db
        .select({ id: marketingCampanhas.id })
        .from(marketingCampanhas)
        .where(eq(marketingCampanhas.resendBroadcastId, broadcastId));
      if (!row) return null;
      const status = RECIPIENT_STATUS[event.type];
      if (status) {
        await db
          .update(marketingCampanhaDestinatarios)
          .set({ status })
          .where(and(eq(marketingCampanhaDestinatarios.campanhaId, row.id), ilike(marketingCampanhaDestinatarios.email, email)));
      }
      await db.insert(marketingEventos).values({
        campanhaId: row.id,
        tipo: event.type,
        resendEmailId: event.data.email_id,
        payload: JSON.parse(JSON.stringify(event)) as Record<string, unknown>,
      });
      return row;
    });
    if (!campaign) return json({ ok: true });
    return json({ ok: true });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Erro ao processar webhook' }, 500);
  }
};

function isMarketingEmailEvent(event: WebhookEventPayload): event is MarketingEmailWebhookEvent {
  return event.type.startsWith('email.') && event.type !== 'email.received';
}
