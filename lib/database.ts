import { Pool, type PoolConfig } from 'pg';
import { supabaseRootCa } from './supabase-ca';
import type { Attempt, StudySet } from './model';
import {
  insertAttempt,
  insertSet,
  mergeSubjects,
  seedSubjects,
  schema,
  seedUsers,
  tables,
} from './records';

const runtime = globalThis as unknown as {
  arinovaDatabase?: Pool;
  arinovaSchema?: Promise<void>;
};

export function databaseUrl() {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL;
}

// pg treats sslmode=require as full verification, and SSL settings in the URL
// replace the ssl option. For Supabase, drop them and verify against its CA.
export function connectionConfig(connectionString: string): PoolConfig {
  const url = new URL(connectionString);
  if (!/(^|\.)supabase\.(com|co)$/.test(url.hostname))
    return { connectionString };
  for (const key of [
    'sslmode',
    'sslrootcert',
    'sslcert',
    'sslkey',
    'uselibpqcompat',
  ])
    url.searchParams.delete(key);
  return {
    connectionString: url.toString(),
    ssl: { ca: supabaseRootCa, rejectUnauthorized: true },
  };
}

async function initialize(pool: Pool) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Serialize first-use setup across concurrent function instances.
    await client.query('SELECT pg_advisory_xact_lock(4206301)');
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.arinova_records (
        id uuid PRIMARY KEY,
        kind text NOT NULL,
        payload jsonb NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await client.query(
      'ALTER TABLE public.arinova_records ENABLE ROW LEVEL SECURITY',
    );
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.arinova_login_limits (
        key text PRIMARY KEY,
        count integer NOT NULL,
        expires bigint NOT NULL
      )
    `);
    await client.query(
      'ALTER TABLE public.arinova_login_limits ENABLE ROW LEVEL SECURITY',
    );
    await client.query(schema);
    for (const table of tables)
      await client.query(
        `ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`,
      );
    await seedUsers(client);
    await mergeSubjects(client);
    await seedSubjects(client);
    // The built-in Taal sample was development data; hide it where it was
    // seeded. Attempts on it are kept, as with any deleted set.
    await client.query(
      `UPDATE public.arinova_tests SET deleted_at = now()
       WHERE is_sample AND deleted_at IS NULL`,
    );
    // Earlier versions kept sets and attempts as JSON documents; copy them
    // once into the relational tables and keep the originals, marked as
    // migrated. Inserts skip ids that already exist.
    const legacy = await client.query(
      `SELECT kind, payload FROM public.arinova_records
       WHERE kind IN ('sets', 'attempts') ORDER BY created_at`,
    );
    for (const row of legacy.rows)
      if (row.kind === 'sets') await insertSet(client, row.payload as StudySet);
    for (const row of legacy.rows)
      if (
        row.kind === 'attempts' &&
        (
          await client.query(
            'SELECT 1 FROM public.arinova_tests WHERE id = $1',
            [row.payload.setId],
          )
        ).rowCount
      )
        await insertAttempt(client, row.payload as Attempt, 'learner');
    await client.query(
      `UPDATE public.arinova_records SET kind = kind || '_migrated'
       WHERE kind IN ('sets', 'attempts')`,
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function database(): Promise<Pool | null> {
  const connectionString = databaseUrl();
  if (!connectionString) {
    if (process.env.VERCEL || process.env.NODE_ENV === 'production')
      throw new Error('DATABASE_URL or POSTGRES_URL is required in production');
    return null;
  }
  const pool = (runtime.arinovaDatabase ??= new Pool({
    ...connectionConfig(connectionString),
    max: 3,
    connectionTimeoutMillis: 10000,
  }));
  await (runtime.arinovaSchema ??= initialize(pool).catch((error) => {
    runtime.arinovaSchema = undefined;
    throw error;
  }));
  return pool;
}
