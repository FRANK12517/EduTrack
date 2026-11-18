'use strict';

// Read-only identity probe; deliberately does not import db/relational.
const { Client } = require('pg');
const { poolOptions } = require('../lib/postgres-pool');
const { readonly } = require('../lib/production-preflight-readonly');

function options(env = process.env) {
  if (env.EDUTRACK_PRODUCTION_PREFLIGHT_TARGET !== 'production-read-only') throw new Error('Production target is not explicitly authorized for read-only verification');
  if (!env.SUPABASE_DB_URL) throw new Error('SUPABASE_DB_URL is required for PostgreSQL production verification');
  const result = poolOptions({ ...env, EDUTRACK_DB_POOL_SIZE: '1' });
  if (['localhost', '127.0.0.1', '::1', '[::1]'].includes(new URL(result.connectionString).hostname)) throw new Error('Production identity verification requires a non-local PostgreSQL host');
  return { connectionString: result.connectionString, ssl: result.ssl };
}

async function main() {
  const client = new Client(options());
  await client.connect();
  await client.query('BEGIN READ ONLY');
  const raw = {
    async query(sql, values) { const result = await client.query(sql, values); return [result.rows, result.fields]; },
    async end() { try { await client.query('ROLLBACK'); } finally { await client.end(); } }
  };
  const db = readonly(raw);
  try {
    const [[row]] = await db.query('SELECT current_database() AS database_name');
    if (row.database_name !== new URL(process.env.SUPABASE_DB_URL).pathname.slice(1)) throw new Error('Connected database does not match configured Supabase identity');
    console.log('Supabase PostgreSQL production identity verification passed.');
  } catch (error) {
    console.error(`Supabase PostgreSQL production identity verification failed: ${error.code || 'DATABASE_ERROR'}`);
    process.exitCode = 1;
  } finally { await db.end(); }
}

if (require.main === module) main();
module.exports = { options };
