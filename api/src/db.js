import pg from 'pg';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const { Pool } = pg;
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000
});

export async function query(text, params = []) {
  return pool.query(text, params);
}

export async function transaction(work) {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const result = await work(client);
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

export async function migrate() {
  const migrationPath = fileURLToPath(new URL('../sql/001_initial.sql', import.meta.url));
  const sql = await readFile(migrationPath, 'utf8');
  await pool.query(sql);
}
