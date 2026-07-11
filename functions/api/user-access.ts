import { desc, inArray } from 'drizzle-orm';
import { userLoginDevices } from '../../drizzle/schema';
import type { AppDatabase } from '../lib/db';

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

export function accessFromMetadata(metadata: unknown): UserAccessRef {
  const record = toRecord(metadata);
  return {
    last_access_at: metadataString(record, 'last_access_at'),
    last_access_device: metadataString(record, 'last_access_device'),
    last_access_ip: metadataString(record, 'last_access_ip'),
    last_access_country: metadataString(record, 'last_access_country'),
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
  db: AppDatabase,
  userIds: readonly string[],
): Promise<ReadonlyMap<string, UserAccessRef>> {
  if (userIds.length === 0) return new Map();
  const rows = await db
    .select({
      user_id: userLoginDevices.userId,
      device_label: userLoginDevices.deviceLabel,
      ip_address: userLoginDevices.ipAddress,
      country: userLoginDevices.country,
      last_seen_at: userLoginDevices.lastSeenAt,
    })
    .from(userLoginDevices)
    .where(inArray(userLoginDevices.userId, [...new Set(userIds)]))
    .orderBy(desc(userLoginDevices.lastSeenAt));

  const latestByUserId = new Map<string, UserAccessRef>();
  for (const row of rows as UserAccessRow[]) {
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

function metadataString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function toRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}
