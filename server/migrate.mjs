import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL não foi configurada.');
}

const schemaUrl = new URL('../database/render_schema.sql', import.meta.url);
const sql = await readFile(schemaUrl, 'utf8');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

try {
  await pool.query(sql);
  console.log('Migração do banco GFP concluída com sucesso.');
} finally {
  await pool.end();
}
