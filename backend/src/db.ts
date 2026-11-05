import pg from 'pg';

export interface Database {
  query<T extends pg.QueryResultRow = pg.QueryResultRow>(text: string, values?: unknown[]): Promise<T[]>;
  transaction<T>(run: (db: Database) => Promise<T>): Promise<T>;
}

let pool: pg.Pool | undefined;
function getPool() {
  if (!process.env.DATABASE_URL) throw new Error('Configure DATABASE_URL para conectar ao Supabase');
  return pool ??= new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max: 3, idleTimeoutMillis: 10000, connectionTimeoutMillis: 10000,
  });
}
function connection(client: pg.PoolClient): Database {
  return {
    query: async <T extends pg.QueryResultRow>(text: string, values?: unknown[]) => (await client.query<T>(text, values)).rows,
    transaction: async run => run(connection(client)),
  };
}
export const database: Database = {
  query: async <T extends pg.QueryResultRow>(text: string, values?: unknown[]) => (await getPool().query<T>(text, values)).rows,
  async transaction(run) {
    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      const result = await run(connection(client));
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  },
};
export async function closeDatabase() { await pool?.end(); pool = undefined; }
