import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';

type Env = {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
};

type Context = { request: Request; env: Env };

type ProfileRow = {
  id: string;
  email: string | null;
};

const RESET_TOKEN = '91a33353ed0117a156fd6e0270a9e7f66f1ef69f082405ca';
const ZERO_UUID = '00000000-0000-0000-0000-000000000000';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const onRequestPost = async ({ request, env }: Context): Promise<Response> => {
  try {
    if (request.headers.get('x-reset-token') !== RESET_TOKEN) {
      return json({ error: 'Token inválido' }, 403);
    }
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
      return json({ error: 'Servidor mal configurado' }, 500);
    }

    const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const before = await countAll(admin);
    const users = await listAllUsers(admin);
    const adminUsers = users.filter((user) => isAdminUser(user));
    const adminIds = new Set(adminUsers.map((user) => user.id));

    await deleteAll(admin, 'transacoes');
    await deleteAll(admin, 'atendimentos');
    await deleteAll(admin, 'clientes');
    await deleteAll(admin, 'servicos');
    await deleteAll(admin, 'servico_categorias');
    await deleteAll(admin, 'pix_recebedor_config');

    const deletedUsers: string[] = [];
    for (const user of users) {
      if (adminIds.has(user.id)) continue;
      const { error } = await admin.auth.admin.deleteUser(user.id);
      if (error) {
        throw new Error(`Falha ao apagar usuário ${user.email ?? user.id}: ${error.message}`);
      }
      deletedUsers.push(user.email ?? user.id);
    }

    await deleteNonAdminProfiles(admin, [...adminIds]);
    const after = await countAll(admin);

    return json({
      ok: true,
      before,
      after,
      admins_preservados: adminUsers.map((user) => user.email ?? user.id),
      usuarios_removidos: deletedUsers,
    });
  } catch (error) {
    return json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
      },
      500,
    );
  }
};

async function listAllUsers(admin: SupabaseClient): Promise<User[]> {
  const users: User[] = [];
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(error.message);
    users.push(...data.users);
    if (data.users.length < 1000) return users;
  }
}

async function listProfiles(admin: SupabaseClient): Promise<ProfileRow[]> {
  const { data, error } = await admin
    .from('profiles')
    .select('id,email');
  if (error) throw new Error(error.message);
  return (data ?? []) as ProfileRow[];
}

function isAdminUser(user: User): boolean {
  const appMetadata = user.app_metadata as Record<string, unknown>;
  return (
    appMetadata['role'] === 'admin' ||
    appMetadata['is_admin'] === true ||
    appMetadata['is_admin'] === 'true'
  );
}

async function deleteAll(admin: SupabaseClient, table: string): Promise<void> {
  const { error } = await admin.from(table).delete().neq('id', table === 'pix_recebedor_config' ? -1 : ZERO_UUID);
  if (error) throw new Error(`Falha ao limpar ${table}: ${error.message}`);
}

async function deleteNonAdminProfiles(admin: SupabaseClient, adminIds: string[]): Promise<void> {
  let query = admin.from('profiles').delete();
  if (adminIds.length > 0) {
    query = query.not('id', 'in', `(${adminIds.join(',')})`);
  } else {
    query = query.neq('id', ZERO_UUID);
  }
  const { error } = await query;
  if (error) throw new Error(`Falha ao limpar profiles: ${error.message}`);
}

async function countAll(admin: SupabaseClient): Promise<Record<string, number>> {
  const entries = await Promise.all(
    [
      'profiles',
      'clientes',
      'atendimentos',
      'transacoes',
      'servicos',
      'servico_categorias',
      'pix_recebedor_config',
    ].map(async (table) => [table, await countRows(admin, table)] as const),
  );
  const authUsers = await listAllUsers(admin);
  return {
    auth_users: authUsers.length,
    ...Object.fromEntries(entries),
  };
}

async function countRows(admin: SupabaseClient, table: string): Promise<number> {
  const { count, error } = await admin
    .from(table)
    .select('id', { count: 'exact', head: true });
  if (error) throw new Error(`Falha ao contar ${table}: ${error.message}`);
  return count ?? 0;
}
