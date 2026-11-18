'use strict';

// Read-only state reconciliation; no migration modules are imported.
const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');
const { poolOptions } = require('../lib/postgres-pool');
const { readonly } = require('../lib/production-preflight-readonly');

function quote(name) { return `"${String(name).replace(/"/g, '""')}"`; }
async function main() {
  if (process.env.EDUTRACK_PRODUCTION_PREFLIGHT_TARGET !== 'production-read-only') throw new Error('Production read-only target is not explicitly authorized');
  const opts = poolOptions({ ...process.env, EDUTRACK_DB_POOL_SIZE: '1' });
  if (['localhost','127.0.0.1','::1','[::1]'].includes(new URL(opts.connectionString).hostname)) throw new Error('Production read-only target cannot be local');
  const client = new Client({ connectionString: opts.connectionString, ssl: opts.ssl }); await client.connect(); await client.query('BEGIN READ ONLY');
  const raw = { async query(sql, values) { const result = await client.query(sql, values); return [result.rows, result.fields]; }, async end() { try { await client.query('ROLLBACK'); } finally { await client.end(); } } }; const db = readonly(raw);
  try {
    const [tables] = await db.query("SELECT table_name AS \"TABLE_NAME\" FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name");
    const [ids] = await db.query("SELECT table_name AS \"TABLE_NAME\",column_name AS \"COLUMN_NAME\",data_type AS \"DATA_TYPE\",udt_name AS \"COLUMN_TYPE\" FROM information_schema.columns WHERE table_schema='public' AND (column_name='id' OR column_name LIKE '%\\_id' ESCAPE '\\\\') ORDER BY table_name,column_name");
    const names = tables.map(row => row.TABLE_NAME); const archives = names.filter(name => /^legacy_.*_archive$/.test(name));
    const counts = {}; for (const name of [...new Set([...archives, 'users', 'schools', 'students', 'schema_migrations'].filter(name => names.includes(name)))]) { const [[row]] = await db.query(`SELECT COUNT(*) AS count FROM public.${quote(name)}`); counts[name] = Number(row.count); }
    const migrations = await db.query("SELECT to_regclass('supabase_migrations.schema_migrations') AS present");
    const history = migrations[0][0].present ? (await db.query('SELECT version::text AS version,name FROM supabase_migrations.schema_migrations ORDER BY version'))[0].map(row => ({ version: row.version, name: row.name })) : [];
    const [identity] = await db.query('SELECT current_database() AS database_name');
    const report = { mode: 'READ_ONLY', target: 'PRODUCTION', database: identity[0].database_name, legacyArchives: archives, canonicalTables: ['users','schools','tenants','credentials','user_roles','tenant_memberships','staff'].filter(name => names.includes(name)), counts, identifierTypes: ids, migrationHistory: history, state: history.length === 3 ? 'SUPABASE_MIGRATIONS_APPLIED' : 'SUPABASE_MIGRATIONS_INCOMPLETE' };
    const out = path.join('artifacts', 'production-state-reconciliation.json'); fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, JSON.stringify(report, null, 2), { mode: 0o600 });
    console.log(`Production state reconciliation complete: ${report.state}`);
  } finally { await db.end(); }
}
if (require.main === module) main().catch(() => { console.error('Production state reconciliation failed.'); process.exitCode = 1; });
