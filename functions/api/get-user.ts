import { createClient } from '@supabase/supabase-js';
import { getUserRole, isAdminUser, metadataText, requireAdmin } from './admin-auth';
import { emptyUserAccess, latestAccessByUserIds } from './user-access';

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

  const url = new URL(request.url);
  const userId = url.searchParams.get('id')?.trim() ?? '';
  if (!userId) return json({ error: 'id obrigatório' }, 400);

  const { data: target, error: targetError } = await admin.auth.admin.getUserById(userId);
  if (targetError || !target?.user) {
    return json({ error: 'Usuário não encontrado no Auth' }, 404);
  }

  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('id, email, full_name, avatar_url, created_at, updated_at')
    .eq('id', userId)
    .maybeSingle<ProfileRow>();
  if (profileError) return json({ error: profileError.message }, 500);

  const user = target.user;
  const email = user.email?.toLowerCase() ?? profile?.email ?? '';
  if (!email) return json({ error: 'Usuário sem email cadastrado' }, 404);
  const accessById = await latestAccessByUserIds(admin, [user.id]);
  const access = accessById.get(user.id) ?? emptyUserAccess();

  return json(
    {
      user: {
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
        last_access_at: access.last_access_at ?? user.last_sign_in_at ?? null,
        last_access_device: access.last_access_device,
        last_access_ip: access.last_access_ip,
        last_access_country: access.last_access_country,
      },
    },
    200,
  );
};
