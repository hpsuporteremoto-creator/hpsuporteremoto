import { createClient } from '@supabase/supabase-js';
import { userLoginDevices } from '../../drizzle/schema';
import { mergeAppMetadata } from './admin-auth';
import { type DatabaseEnv, withDatabase } from '../lib/db';

type Env = DatabaseEnv & {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
};

type Context = { request: Request; env: Env };

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

  const token = extractBearerToken(request);
  if (!token) return json({ error: 'Authorization Bearer token ausente' }, 401);

  const {
    data: { user },
    error: authError,
  } = await admin.auth.getUser(token);
  if (authError || !user?.id) return json({ error: 'Token inválido' }, 401);

  const userAgent = normalizeHeader(request.headers.get('user-agent'), 900);
  const deviceLabel = describeDevice(userAgent);
  const ipAddress = normalizeIp(
    request.headers.get('cf-connecting-ip') ?? request.headers.get('x-forwarded-for'),
  );
  const country = normalizeHeader(request.headers.get('cf-ipcountry'), 8);
  const now = new Date().toISOString();

  const { error: metadataError } = await admin.auth.admin.updateUserById(user.id, {
    app_metadata: mergeAppMetadata(user.app_metadata, {
      last_access_at: now,
      last_access_device: deviceLabel,
      last_access_ip: ipAddress,
      last_access_country: country,
    }),
  });

  if (metadataError) {
    return json({ error: metadataError.message }, 500);
  }

  try {
    await withDatabase(env, (db) =>
      db
        .insert(userLoginDevices)
        .values({
          userId: user.id,
          email: user.email?.toLowerCase() ?? null,
          deviceHash: hashDevice(userAgent || deviceLabel),
          deviceLabel,
          userAgent,
          ipAddress,
          country,
          firstSeenAt: now,
          lastSeenAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [userLoginDevices.userId, userLoginDevices.deviceHash],
          set: { email: user.email?.toLowerCase() ?? null, deviceLabel, userAgent, ipAddress, country, lastSeenAt: now, updatedAt: now },
        }),
    );
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Erro ao registrar acesso' }, 500);
  }

  return json({ ok: true }, 200);
};

function extractBearerToken(request: Request): string | null {
  const authHeader = request.headers.get('authorization') ?? '';
  if (!authHeader.toLowerCase().startsWith('bearer ')) return null;
  const token = authHeader.slice('bearer '.length).trim();
  return token.length > 0 ? token : null;
}

function normalizeHeader(value: string | null, maxLength: number): string | null {
  const normalized = value?.trim().replace(/\s+/g, ' ') ?? '';
  return normalized.length > 0 ? normalized.slice(0, maxLength) : null;
}

function normalizeIp(value: string | null): string | null {
  const first = value?.split(',')[0]?.trim() ?? '';
  return first.length > 0 ? first.slice(0, 80) : null;
}

function describeDevice(userAgent: string | null): string {
  const ua = userAgent ?? '';
  const browser = detectBrowser(ua);
  const os = detectOs(ua);
  const type = /Mobile|Android|iPhone|iPod/i.test(ua)
    ? 'Celular'
    : /Tablet|iPad/i.test(ua)
      ? 'Tablet'
      : 'Desktop';
  return [browser, os, type].filter(Boolean).join(' · ') || 'Dispositivo desconhecido';
}

function detectBrowser(ua: string): string {
  if (/Edg\//i.test(ua)) return 'Edge';
  if (/OPR\//i.test(ua)) return 'Opera';
  if (/Firefox\//i.test(ua)) return 'Firefox';
  if (/CriOS\//i.test(ua)) return 'Chrome iOS';
  if (/Chrome\//i.test(ua)) return 'Chrome';
  if (/Safari\//i.test(ua)) return 'Safari';
  return 'Navegador';
}

function detectOs(ua: string): string {
  if (/Windows NT/i.test(ua)) return 'Windows';
  if (/Android/i.test(ua)) return 'Android';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'iOS';
  if (/Mac OS X|Macintosh/i.test(ua)) return 'macOS';
  if (/Linux/i.test(ua)) return 'Linux';
  return 'Sistema';
}

function hashDevice(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
