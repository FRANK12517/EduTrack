'use strict';

const assert = require('node:assert/strict');
const { poolOptions } = require('../lib/postgres-pool');

assert.throws(() => poolOptions({}), /SUPABASE_DB_URL is required/, 'no legacy database URL may silently select a backend');
assert.throws(() => poolOptions({ DATABASE_URL: 'postgres://user:pass@localhost/db' }), /SUPABASE_DB_URL is required/);
assert.throws(() => poolOptions({ EDUTRACK_DATABASE_URL: 'mysql://user:pass@localhost/db' }), /SUPABASE_DB_URL is required/);
assert.throws(() => poolOptions({ SUPABASE_DB_URL: 'mysql://user:pass@localhost/db' }), /postgres or postgresql protocol/);

assert.deepEqual(poolOptions({ SUPABASE_DB_URL: 'postgresql://user:pass@localhost:54322/postgres' }), {
  connectionString: 'postgresql://user:pass@localhost:54322/postgres',
  max: 5,
  idleTimeoutMillis: 60_000,
  connectionTimeoutMillis: 10_000,
  ssl: false
});
assert.deepEqual(poolOptions({ SUPABASE_DB_URL: 'postgres://user:pass@db.example.test:5432/postgres', EDUTRACK_DB_POOL_SIZE: '12' }), {
  connectionString: 'postgres://user:pass@db.example.test:5432/postgres',
  max: 12,
  idleTimeoutMillis: 60_000,
  connectionTimeoutMillis: 10_000,
  ssl: { rejectUnauthorized: true }
});
assert.throws(() => poolOptions({ SUPABASE_DB_URL: 'postgres://user:pass@localhost/db', EDUTRACK_DB_POOL_SIZE: '0' }), /integer between 1 and 50/);

console.log('PostgreSQL pool configuration passed: Supabase URL is mandatory, MySQL/TiDB URL fallbacks are rejected, and non-local TLS verification is enabled.');
