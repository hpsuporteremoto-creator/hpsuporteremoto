import type { SupabaseClient, User } from '@supabase/supabase-js';

export type AdminCheckResult =
  | { ok: true; user: User }
  | { ok: false; status: number; error: string };

export async function requireAdmin(
  admin: SupabaseClient,
  request: Request,
): Promise<AdminCheckResult> {
  const authHeader = request.headers.get('authorization') ?? '';
  if (!authHeader.toLowerCase().startsWith('bearer ')) {
    return { ok: false, status: 401, error: 'Authorization Bearer token ausente' };
  }
  const token = authHeader.slice('bearer '.length).trim();

  const {
    data: { user },
    error,
  } = await admin.auth.getUser(token);

  if (error || !user?.email) {
    return { ok: false, status: 401, error: 'Token inválido' };
  }
  if (!isAdminUser(user)) {
    return { ok: false, status: 403, error: 'Acesso restrito a administradores' };
  }

  return { ok: true, user };
}

export function isAdminUser(user: Pick<User, 'app_metadata'> | null | undefined): boolean {
  return getMetadataBoolean(user?.app_metadata, 'is_admin');
}

export function mergeAppMetadata(
  metadata: unknown,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...toRecord(metadata),
    ...patch,
  };
}

export function metadataText(metadata: unknown, key: string): string | null {
  const value = toRecord(metadata)[key];
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

export async function listAllUsers(admin: SupabaseClient): Promise<User[]> {
  const users: User[] = [];
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 1000,
    });
    if (error) throw new Error(error.message);
    users.push(...data.users);
    if (data.users.length < 1000) return users;
  }
}

function getMetadataBoolean(metadata: unknown, key: string): boolean {
  const value = toRecord(metadata)[key];
  return value === true || value === 'true';
}

function toRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : {};
}
