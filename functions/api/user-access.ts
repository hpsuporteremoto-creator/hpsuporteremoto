import type { SupabaseClient } from '@supabase/supabase-js';

export type UserAccessRow = {
  user_id: string;
  device_label: string | null;
  ip_address: string | null;
  country: string | null;
  last_seen_at: string;
};

export type UserAccessRef = {
  last_access_at: string | null;
  last_access_device: string | null;
  last_access_ip: string | null;
  last_access_country: string | null;
};

type DatabaseErrorLike = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
};

export function emptyUserAccess(): UserAccessRef {
  return {
    last_access_at: null,
    last_access_device: null,
    last_access_ip: null,
    last_access_country: null,
  };
}

export function isMissingUserLoginDevicesTable(error: DatabaseErrorLike): boolean {
  const code = error.code ?? '';
  const text = [error.message, error.details, error.hint].filter(Boolean).join(' ').toLowerCase();
  const isMissingTableCode = code === '42P01' || code === 'PGRST205';
  const mentionsAccessTable = text.includes('user_login_devices');
  const isMissingTableMessage =
    text.includes('does not exist') ||
    text.includes('schema cache') ||
    text.includes('could not find') ||
    text.includes('not found');

  return isMissingTableCode || (mentionsAccessTable && isMissingTableMessage);
}

export async function latestAccessByUserIds(
  admin: SupabaseClient,
  userIds: readonly string[],
): Promise<ReadonlyMap<string, UserAccessRef>> {
  if (userIds.length === 0) return new Map();

  const { data, error } = await admin
    .from('user_login_devices')
    .select('user_id, device_label, ip_address, country, last_seen_at')
    .in('user_id', [...new Set(userIds)])
    .order('last_seen_at', { ascending: false });

  if (error) {
    if (isMissingUserLoginDevicesTable(error)) {
      return new Map();
    }
    throw new Error(error.message);
  }

  const latestByUserId = new Map<string, UserAccessRef>();
  for (const row of (data ?? []) as UserAccessRow[]) {
    if (latestByUserId.has(row.user_id)) continue;
    latestByUserId.set(row.user_id, {
      last_access_at: row.last_seen_at,
      last_access_device: row.device_label,
      last_access_ip: row.ip_address,
      last_access_country: row.country,
    });
  }
  return latestByUserId;
}
