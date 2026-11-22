'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');
const { readonly } = require('../lib/production-preflight-readonly');
const { requireTarget } = require('./production-migration-preflight');

function option(name, fallback) { const i = process.argv.indexOf(name); return i < 0 ? fallback : process.argv[i + 1]; }
function quote(name) { return `"${String(name).replace(/"/g, '""')}"`; }
async function main() {
  const expectedTarget = option('--target', 'disposable-validation');
  requireTarget(process.env, expectedTarget);
  const { poolOptions } = require('../lib/postgres-pool');
  const options = poolOptions({ ...process.env, EDUTRACK_DB_POOL_SIZE: '1' });
  const client = new Client({ connectionString: options.connectionString, ssl: options.ssl }); await client.connect(); await client.query('BEGIN READ ONLY');
  const raw = { async query(sql, values) { const result = await client.query(sql, values); return [result.rows, result.fields]; }, async end() { try { await client.query('ROLLBACK'); } finally { await client.end(); } } };
  const db = readonly(raw);
  try {
    const [tables] = await db.query("SELECT table_name AS \"TABLE_NAME\" FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name");
    const [columns] = await db.query("SELECT table_name AS \"TABLE_NAME\",column_name AS \"COLUMN_NAME\",ordinal_position AS \"ORDINAL_POSITION\",udt_name AS \"COLUMN_TYPE\",is_nullable AS \"IS_NULLABLE\",NULL::text AS \"COLUMN_KEY\" FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position");
    const [foreignKeys] = await db.query("SELECT k.table_name AS \"TABLE_NAME\",k.column_name AS \"COLUMN_NAME\",k.constraint_name AS \"CONSTRAINT_NAME\",c.table_name AS \"REFERENCED_TABLE_NAME\",c.column_name AS \"REFERENCED_COLUMN_NAME\" FROM information_schema.key_column_usage k JOIN information_schema.table_constraints t ON t.constraint_schema=k.constraint_schema AND t.constraint_name=k.constraint_name AND t.constraint_type='FOREIGN KEY' JOIN information_schema.constraint_column_usage c ON c.constraint_schema=k.constraint_schema AND c.constraint_name=k.constraint_name WHERE k.table_schema='public' ORDER BY k.table_name,k.constraint_name,k.ordinal_position");
    const [indexes] = await db.query("SELECT tablename AS \"TABLE_NAME\",indexname AS \"INDEX_NAME\",CASE WHEN indexdef ILIKE '% UNIQUE %' THEN 0 ELSE 1 END AS \"NON_UNIQUE\",NULL::integer AS \"SEQ_IN_INDEX\",NULL::text AS \"COLUMN_NAME\" FROM pg_indexes WHERE schemaname='public' ORDER BY tablename,indexname");
    const rows = {};
    for (const { TABLE_NAME } of tables) { const [[result]] = await db.query(`SELECT COUNT(*) AS count FROM ${quote(TABLE_NAME)}`); rows[TABLE_NAME] = Number(result.count); }
    const [migration] = await db.query("SELECT to_regclass('supabase_migrations.schema_migrations') IS NOT NULL AS present");
    const migrationState = migration[0].present ? Number((await db.query('SELECT COUNT(*) AS count FROM supabase_migrations.schema_migrations'))[0][0].count) : null;
    const normalized = { tables: tables.map(x => x.TABLE_NAME), columns, foreignKeys, indexes, rows, migrationState };
    const sha256 = crypto.createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
    const report = { target: expectedTarget === 'disposable-validation' ? 'DISPOSABLE' : 'PRODUCTION', mode: 'READ_ONLY', sha256, tables: tables.length, columns: columns.length, foreignKeys: foreignKeys.length, indexes: indexes.length, rowCountSignature: crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex'), schemaMigrations: migrationState };
    const output = option('--output', path.join('artifacts', 'preflight-signature.json')); fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, JSON.stringify(report, null, 2), { mode: 0o600 }); console.log(JSON.stringify(report));
  } finally { await db.end(); }
}
if (require.main === module) main().catch(() => { console.error('Read-only database signature failed.'); process.exitCode = 1; });
