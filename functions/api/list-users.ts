import { createClient } from '@supabase/supabase-js';
import { profiles } from '../../drizzle/schema';
import { getUserRole, isAdminUser, listAllUsers, metadataText, requireAdmin } from './admin-auth';
import { accessFromMetadata, emptyUserAccess, latestAccessByUserIds } from './user-access';
import { type DatabaseEnv, withDatabase } from '../lib/db';

type Env = DatabaseEnv & {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
};

type Context = { request: Request; env: Env };

type ProfileRow = {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const onRequestGet = async (context: Context): Promise<Response> => {
  const { request, env } = context;

  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return json({ error: 'Servidor mal configurado (env vars ausentes)' }, 500);
  }

  const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const adminCheck = await requireAdmin(admin, request);
  if (!adminCheck.ok) return json({ error: adminCheck.error }, adminCheck.status);

  const users = await listAllUsers(admin);
  const databaseData = await withDatabase(env, async (db) => ({
    profiles: await db
      .select({
        id: profiles.id,
        email: profiles.email,
        full_name: profiles.fullName,
        avatar_url: profiles.avatarUrl,
        created_at: profiles.createdAt,
        updated_at: profiles.updatedAt,
      })
      .from(profiles),
    latestAccessById: await latestAccessByUserIds(
      db,
      users.map((user) => user.id),
    ),
  }));

  const profilesById = new Map(
    (databaseData.profiles as ProfileRow[]).map((profile) => [profile.id, profile]),
  );
  const latestAccessById = databaseData.latestAccessById;

  return json(
    {
      users: users
        .map((user) => {
          const profile = profilesById.get(user.id);
          const email = user.email?.toLowerCase() ?? profile?.email ?? '';
          const access = latestAccessById.get(user.id) ?? emptyUserAccess();
          const metadataAccess = accessFromMetadata(user.app_metadata);
          return {
            id: user.id,
            email,
            full_name:
              profile?.full_name ??
              metadataText(user.user_metadata, 'full_name') ??
              metadataText(user.user_metadata, 'name'),
            avatar_url: profile?.avatar_url ?? metadataText(user.user_metadata, 'avatar_url'),
            role: getUserRole(user),
            is_admin: isAdminUser(user),
            created_at: profile?.created_at ?? user.created_at,
            updated_at: profile?.updated_at ?? user.updated_at ?? user.created_at,
            last_access_at:
              access.last_access_at ??
              metadataAccess.last_access_at ??
              user.last_sign_in_at ??
              null,
            last_access_device: access.last_access_device ?? metadataAccess.last_access_device,
            last_access_ip: access.last_access_ip ?? metadataAccess.last_access_ip,
            last_access_country: access.last_access_country ?? metadataAccess.last_access_country,
          };
        })
        .filter((user) => user.email.length > 0),
    },
    200,
  );
};
