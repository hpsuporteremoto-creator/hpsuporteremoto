import { drizzle } from 'drizzle-orm/node-postgres';
import { Client } from 'pg';
import * as schema from '../../drizzle/schema';

export type HyperdriveBinding = {
  connectionString: string;
};

export type DatabaseEnv = {
  HYPERDRIVE: HyperdriveBinding;
};

function createDatabase(client: Client) {
  return drizzle(client, { schema });
}

export type AppDatabase = ReturnType<typeof createDatabase>;

/**
 * Opens a short-lived PostgreSQL connection through Cloudflare Hyperdrive.
 * Hyperdrive owns the upstream connection pool, so a client per request keeps
 * Pages Functions predictable without carrying connection state between runs.
 */
export async function withDatabase<T>(
  env: DatabaseEnv,
  operation: (db: AppDatabase) => Promise<T>,
): Promise<T> {
  if (!env.HYPERDRIVE?.connectionString) {
    throw new Error('Binding HYPERDRIVE não configurado');
  }

  const client = new Client({ connectionString: env.HYPERDRIVE.connectionString });
  await client.connect();

  try {
    return await operation(createDatabase(client));
  } finally {
    await client.end();
  }
}
