'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');
const { poolOptions } = require('../lib/postgres-pool');
const { readonly } = require('../lib/production-preflight-readonly');

const INITIAL_SCHEMA = path.resolve(__dirname, '../supabase/migrations/20261116000000_initial_schema.sql');
const EXPECTED_TABLES = [...new Set([...fs.readFileSync(INITIAL_SCHEMA, 'utf8').matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?public\.([a-zA-Z_][\w]*)/gi)].map((match) => match[1]))]
  .filter((table) => table !== 'schema_migrations').sort();
const EXPECTED_APPLICATION_FOREIGN_KEYS = 156;
const EXPECTED_DATABASE_FOREIGN_KEYS = EXPECTED_APPLICATION_FOREIGN_KEYS + 1; // Supabase Auth identity mapping.
const REQUIRED_MIGRATIONS = ['20261116000000','20261116001000','20261116002000'];
const FORBIDDEN_ENV = [
  'SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'DATABASE_URL',
  'EDUTRACK_DATABASE_URL', 'EDUTRACK_PRODUCTION_DATABASE_URL', 'TIDB_HOST', 'TIDB_PASSWORD'
];
function config(env = process.env) {
  if (env.EDUTRACK_PRODUCTION_PREFLIGHT_TARGET !== 'production-read-only' || !env.SUPABASE_DB_URL || FORBIDDEN_ENV.some((key) => env[key])) {
    throw new Error('Supabase production baseline target is not explicitly authorized for read-only verification');
  }
  const options=poolOptions({...env,EDUTRACK_DB_POOL_SIZE:'1'});if(['localhost','127.0.0.1','::1','[::1]'].includes(new URL(options.connectionString).hostname))throw new Error('Production baseline verification requires a remote PostgreSQL target');
  return { connectionString:options.connectionString,ssl:options.ssl };
}
function q(value) { return `"${String(value).replace(/"/g, '""')}"`; }
function classify(report) {
  const complete=report.tableCount===EXPECTED_TABLES.length+1&&report.applicationTableCount===EXPECTED_TABLES.length
    &&report.missingApplicationTables.length===0&&report.unexpectedApplicationTables.length===0
    &&report.requiredMigrations.every(version=>report.appliedMigrations.includes(version))
    &&report.schemaMigrationCount===REQUIRED_MIGRATIONS.length&&report.rowLevelSecurityTableCount===EXPECTED_TABLES.length
    &&report.authIdentityMappingPresent&&report.foreignKeyCount===EXPECTED_DATABASE_FOREIGN_KEYS;
  return complete?'SUPABASE_PRODUCTION_SCHEMA_READY':'SUPABASE_PRODUCTION_SCHEMA_INCOMPLETE';
}
function write(report) {
  fs.mkdirSync('artifacts', { recursive: true });
  fs.writeFileSync(path.join('artifacts', 'pre-recovery-baseline-validation.json'), JSON.stringify(report, null, 2), { mode: 0o600 });
}
async function inspect(db) {
  const [tables] = await db.query("SELECT table_name AS \"TABLE_NAME\" FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name");
  const names = tables.map((row) => row.TABLE_NAME);
  const [keys] = await db.query("SELECT count(*)::int AS count FROM information_schema.table_constraints WHERE constraint_schema='public' AND constraint_type='FOREIGN KEY'");
  const [rls] = await db.query("SELECT count(*) FILTER (WHERE c.relrowsecurity)::int AS protected FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND c.relname<>'schema_migrations'");
  const [migrations] = await db.query('SELECT version::text AS version FROM supabase_migrations.schema_migrations ORDER BY version');
  const [identity] = await db.query("SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='users' AND column_name='supabase_auth_user_id' AND data_type='uuid') AS present");
  const missingApplicationTables=EXPECTED_TABLES.filter(table=>!names.includes(table));
  const unexpectedApplicationTables=names.filter(name=>name!=='schema_migrations'&&!EXPECTED_TABLES.includes(name));
  const report = {
    mode:'READ_ONLY',target:'SUPABASE_PRODUCTION',tableCount:names.length,applicationTableCount:names.filter(name=>name!=='schema_migrations').length,
    missingApplicationTables,unexpectedApplicationTables,foreignKeyCount:Number(keys[0].count),rowLevelSecurityTableCount:Number(rls[0].protected),
    schemaMigrationCount:migrations.length,requiredMigrations:REQUIRED_MIGRATIONS,appliedMigrations:migrations.map(row=>row.version),authIdentityMappingPresent:Boolean(identity[0].present)
  };
  report.classification = classify(report);
  return report;
}
async function main() {
  const client=new Client(config());await client.connect();await client.query('BEGIN READ ONLY');const raw={async query(sql,values){const result=await client.query(sql,values);return[result.rows,result.fields]},async end(){try{await client.query('ROLLBACK')}finally{await client.end()}}};const db=readonly(raw);
  try { const report = await inspect(db); write(report); console.log(report.classification); if(report.classification!=='SUPABASE_PRODUCTION_SCHEMA_READY')process.exitCode=1; }
  finally { await db.end(); }
}
if (require.main === module) main().catch((error) => { write({ mode:'READ_ONLY',target:'SUPABASE_PRODUCTION',classification:'BASELINE_IDENTITY_NOT_PROVABLE',error:error.code||'DATABASE_ERROR' }); console.log('BASELINE_IDENTITY_NOT_PROVABLE'); process.exitCode = 1; });
module.exports = { EXPECTED_TABLES, EXPECTED_APPLICATION_FOREIGN_KEYS, EXPECTED_DATABASE_FOREIGN_KEYS, REQUIRED_MIGRATIONS, FORBIDDEN_ENV, config, classify, inspect };
