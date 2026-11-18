'use strict';

const { Pool } = require('pg');

let pool;

function poolOptions(env = process.env) {
  const connectionString = String(env.SUPABASE_DB_URL || '').trim();
  if (!connectionString) throw new Error('SUPABASE_DB_URL is required for PostgreSQL persistence');

  let parsed;
  try { parsed = new URL(connectionString); }
  catch { throw new Error('SUPABASE_DB_URL must be a valid PostgreSQL connection URL'); }
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    throw new Error('SUPABASE_DB_URL must use the postgres or postgresql protocol');
  }

  const localHost = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(parsed.hostname);
  const max = Number(env.EDUTRACK_DB_POOL_SIZE || 5);
  if (!Number.isSafeInteger(max) || max < 1 || max > 50) {
    throw new Error('EDUTRACK_DB_POOL_SIZE must be an integer between 1 and 50');
  }

  return {
    connectionString,
    max,
    idleTimeoutMillis: 60_000,
    connectionTimeoutMillis: 10_000,
    ssl: localHost ? false : { rejectUnauthorized: true }
  };
}

function getPool() {
  if (!pool) pool = new Pool(poolOptions());
  return pool;
}

async function closePool() {
  if (!pool) return;
  const current = pool;
  pool = undefined;
  await current.end();
}

module.exports = { poolOptions, getPool, closePool };
