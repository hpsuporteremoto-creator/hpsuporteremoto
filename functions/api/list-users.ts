import { createClient } from '@supabase/supabase-js';
import {
  isAdminUser,
  listAllUsers,
  metadataText,
  requireAdmin,
} from './admin-auth';

type Env = {
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
  const { data: profiles, error } = await admin
    .from('profiles')
    .select('id, email, full_name, avatar_url, created_at, updated_at');
  if (error) return json({ error: error.message }, 500);

  const profilesById = new Map(
    ((profiles ?? []) as ProfileRow[]).map((profile) => [profile.id, profile]),
  );

  return json(
    {
      users: users
        .map((user) => {
          const profile = profilesById.get(user.id);
          const email = user.email?.toLowerCase() ?? profile?.email ?? '';
          return {
            id: user.id,
            email,
            full_name:
              profile?.full_name ??
              metadataText(user.user_metadata, 'full_name') ??
              metadataText(user.user_metadata, 'name'),
            avatar_url:
              profile?.avatar_url ?? metadataText(user.user_metadata, 'avatar_url'),
            is_admin: isAdminUser(user),
            created_at: profile?.created_at ?? user.created_at,
            updated_at: profile?.updated_at ?? user.updated_at ?? user.created_at,
          };
        })
        .filter((user) => user.email.length > 0),
    },
    200,
  );
};
