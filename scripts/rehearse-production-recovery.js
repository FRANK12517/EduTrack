'use strict';

// Protected fresh-project recovery validation. This script never resets a
// database and never imports data: it refuses any target with public objects.
const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');

const ROOT = path.resolve(__dirname, '..');
const MIGRATIONS_DIR = path.join(ROOT, 'supabase', 'migrations');
const REQUIRED_MIGRATIONS = ['20261116000000', '20261116001000', '20261116002000'];
const OFFICE_ROLES = [
  'DISTRICT_DIRECTOR_OF_EDUCATION', 'DISTRICT_ADMIN', 'DISTRICT_SISO', 'DISTRICT_EXAMINATION_OFFICER', 'DISTRICT_SPORTS_OFFICER',
  'REGIONAL_DIRECTOR_OF_EDUCATION', 'REGIONAL_ADMIN', 'REGIONAL_SISO', 'REGIONAL_EXAMINATION_OFFICER', 'REGIONAL_SPORTS_OFFICER',
  'NATIONAL_DIRECTOR_OF_EDUCATION', 'NATIONAL_ADMIN', 'NATIONAL_SISO', 'NATIONAL_EXAMINATION_OFFICER', 'NATIONAL_SPORTS_OFFICER'
];
const CONFIRMATION = 'INITIALIZE_NEW_SUPABASE_DATABASE';
const AUTHORIZATION_HELPERS = ['edutrack_user_id', 'edutrack_has_permission', 'edutrack_school_scope', 'edutrack_class_scope', 'edutrack_student_scope', 'edutrack_student_link'];

function assertAuthorized(env = process.env) {
  if (env.NODE_ENV !== 'recovery-rehearsal') throw new Error('Protected recovery environment is required');
  if (env.EDUTRACK_RECOVERY_REHEARSAL_CONFIRMATION !== CONFIRMATION) throw new Error('Exact fresh-database confirmation is required');
  const ref = env.SUPABASE_PROJECT_REF;
  if (!ref || !/^[a-z0-9]{20}$/.test(ref) || ref !== env.SUPABASE_NEW_PROJECT_REF) throw new Error('Target project does not match the protected new-project reference');
  if (env.SUPABASE_URL !== `https://${ref}.supabase.co`) throw new Error('Supabase API URL does not match the protected target project');
  if (!env.SUPABASE_DB_URL || !env.SUPABASE_ACCESS_TOKEN || !env.SUPABASE_DB_PASSWORD
    || !env.SUPABASE_ANON_KEY || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Protected Supabase credentials are incomplete');
  const dbUrl = new URL(env.SUPABASE_DB_URL);
  if (!['postgres:', 'postgresql:'].includes(dbUrl.protocol) || !dbUrl.password || dbUrl.pathname !== '/postgres') throw new Error('A PostgreSQL postgres database URL is required');
  const host = dbUrl.hostname.toLowerCase();
  const direct = host === `db.${ref}.supabase.co`;
  const pooler = host.endsWith('.pooler.supabase.com') && decodeURIComponent(dbUrl.username) === `postgres.${ref}`;
  if (!direct && !pooler) throw new Error('Database endpoint does not identify the protected Supabase project');
  if (['localhost', '127.0.0.1', '::1'].includes(host)) throw new Error('Recovery requires the protected remote Supabase project');
  return { projectRef: ref, databaseUrl: dbUrl };
}

function migrationExpectations() {
  const files = fs.readdirSync(MIGRATIONS_DIR).filter((name) => name.endsWith('.sql')).sort();
  const versions = files.map((name) => name.match(/^(\d{14})_/)).filter(Boolean).map((match) => match[1]);
  if (JSON.stringify(versions) !== JSON.stringify(REQUIRED_MIGRATIONS)) throw new Error('Committed Supabase migration set is incomplete or unexpected');
  const sources = files.map((name) => fs.readFileSync(path.join(MIGRATIONS_DIR, name), 'utf8'));
  const initial = sources[0];
  const sql = sources.join('\n');
  const appTables = [...sql.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?public\.([a-zA-Z_][\w]*)/gi)].map((match) => match[1]);
  const tables = [...new Set(appTables)].filter((name) => name !== 'schema_migrations').sort();
  // The reviewed application FK contract excludes the separate Auth.users FK.
  // Keep the Auth mapping FK explicit in the expected total for catalog checks.
  const applicationForeignKeys = (initial.match(/\bFOREIGN\s+KEY\b/gi) || []).length + (initial.match(/\bREFERENCES\s+public\./gi) || []).length;
  const authForeignKeys = (initial.match(/\bREFERENCES\s+auth\.users\s*\(/gi) || []).length;
  const foreignKeys = applicationForeignKeys + authForeignKeys;
  const policies = (sql.match(/\bCREATE\s+POLICY\b/gi) || []).length;
  const indexes = (sql.match(/\bCREATE\s+(?:UNIQUE\s+)?INDEX\b/gi) || []).length;
  const indexNames = [...sql.matchAll(/\bCREATE\s+(?:UNIQUE\s+)?INDEX(?:\s+IF\s+NOT\s+EXISTS)?\s+([a-zA-Z_][\w]*)/gi)].map((match) => match[1]);
  if (tables.length !== 84 || applicationForeignKeys !== 156 || authForeignKeys !== 1 || policies < 1 || indexes < 1) throw new Error('Committed schema contract does not match the reviewed fresh-database requirements');
  return { files, tables, applicationForeignKeys, authForeignKeys, foreignKeys, policies, indexes, indexNames };
}

function clientConfig(env = process.env) {
  const { databaseUrl } = assertAuthorized(env);
  return { connectionString: databaseUrl.toString(), ssl: { rejectUnauthorized: true }, connectionTimeoutMillis: 15000, statement_timeout: 30000 };
}

async function readOnlyTransaction(client, fn) {
  await client.query('BEGIN READ ONLY');
  try { return await fn(); } finally { await client.query('ROLLBACK'); }
}

async function preflight(client) {
  return readOnlyTransaction(client, async () => {
    const identity = await client.query('SELECT current_database() AS database, current_user AS username');
    if (identity.rows[0].database !== 'postgres') throw new Error('Target database is not the expected Supabase postgres database');
    const objects = await client.query(`SELECT count(*)::int AS count
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','S','f')`);
    const history = await client.query(`SELECT to_regclass('supabase_migrations.schema_migrations') AS migration_table`);
    const migrationRows = history.rows[0].migration_table
      ? await client.query('SELECT count(*)::int AS count FROM supabase_migrations.schema_migrations')
      : { rows: [{ count: 0 }] };
    if (Number(objects.rows[0].count) !== 0 || Number(migrationRows.rows[0].count) !== 0) {
      throw new Error('Target is not a fresh database: public application objects or applied migrations already exist');
    }
    return { target: 'FRESH_SUPABASE_PROJECT', database: identity.rows[0].database, publicObjects: 0, migrationHistory: 'EMPTY' };
  });
}

async function validate(client) {
  const expected = migrationExpectations();
  return readOnlyTransaction(client, async () => {
    const relations = await client.query(`SELECT c.relname AS name, c.relkind AS kind, c.relrowsecurity AS rls
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','S','f')`);
    const applicationTables = relations.rows.filter((row) => ['r', 'p'].includes(row.kind) && row.name !== 'schema_migrations').map((row) => row.name).sort();
    const expectedRelations = [...expected.tables, 'schema_migrations'].sort();
    const actualRelations = relations.rows.filter((row) => ['r', 'p'].includes(row.kind)).map((row) => row.name).sort();
    if (JSON.stringify(actualRelations) !== JSON.stringify(expectedRelations)) throw new Error('Public application table set differs from the committed schema');
    const fkResult = await client.query(`SELECT count(*)::int AS count FROM pg_constraint c
      JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='public' AND c.contype='f'`);
    const constraints = await client.query(`SELECT count(*) FILTER (WHERE c.contype='p')::int AS primary_keys,
      count(*) FILTER (WHERE c.contype='u')::int AS unique_constraints FROM pg_constraint c
      JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='public'`);
    const indexResult = await client.query('SELECT indexname FROM pg_indexes WHERE schemaname=\'public\'');
    const actualIndexes = indexResult.rows.map((row) => row.indexname);
    const rlsResult = await client.query(`SELECT count(*)::int AS count FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relkind IN ('r','p') AND c.relname <> 'schema_migrations' AND c.relrowsecurity`);
    const policyResult = await client.query(`SELECT count(*)::int AS count FROM pg_policies WHERE schemaname='public'`);
    const versions = await client.query('SELECT version::text AS version FROM supabase_migrations.schema_migrations ORDER BY version');
    const identity = await client.query(`SELECT EXISTS (
      SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace
      JOIN pg_attribute a ON a.attrelid=t.oid AND a.attnum=ANY(c.conkey)
      JOIN pg_class p ON p.oid=c.confrelid JOIN pg_namespace pn ON pn.oid=p.relnamespace
      WHERE n.nspname='public' AND t.relname='users' AND a.attname='supabase_auth_user_id'
        AND pn.nspname='auth' AND p.relname='users' AND c.contype='f') AS present`);
    const roles = await client.query('SELECT name FROM public.roles WHERE name = ANY($1::text[]) ORDER BY name', [OFFICE_ROLES]);
    const permissions = await client.query(`SELECT r.name, count(rp.permission_id)::int AS permission_count
      FROM public.roles r LEFT JOIN public.role_permissions rp ON rp.role_id=r.id
      WHERE r.name = ANY($1::text[]) GROUP BY r.name`, [OFFICE_ROLES]);
    const helperFunctions = await client.query(`SELECT p.proname AS name FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='private' AND p.proname = ANY($1::text[])`, [['edutrack_user_id','edutrack_has_permission','edutrack_school_scope','edutrack_class_scope','edutrack_student_scope','edutrack_student_link']]);
    const missing = expected.tables.filter((name) => !applicationTables.includes(name));
    const missingRoles = OFFICE_ROLES.filter((name) => !roles.rows.some((row) => row.name === name));
    const ungrantedRoles = permissions.rows.filter((row) => Number(row.permission_count) < 1).map((row) => row.name);
    const applied = versions.rows.map((row) => row.version);
    const result = {
      target: 'FRESH_SUPABASE_PROJECT',
      applicationTables: applicationTables.length,
      expectedApplicationTables: expected.tables.length,
      missingTables: missing,
      foreignKeys: Number(fkResult.rows[0].count),
      expectedForeignKeys: expected.foreignKeys,
      applicationForeignKeys: expected.applicationForeignKeys,
      primaryKeys: Number(constraints.rows[0].primary_keys),
      expectedPrimaryKeys: expected.tables.length + 1,
      uniqueConstraints: Number(constraints.rows[0].unique_constraints),
      publicIndexes: actualIndexes.length,
      expectedDeclaredIndexes: expected.indexes,
      missingIndexes: expected.indexNames.filter((name) => !actualIndexes.includes(name)),
      rlsEnabledApplicationTables: Number(rlsResult.rows[0].count),
      expectedPolicies: expected.policies,
      actualPolicies: Number(policyResult.rows[0].count),
      appliedMigrations: applied,
      authIdentityForeignKeyPresent: identity.rows[0].present,
      officeRoleCount: roles.rows.length,
      missingOfficeRoles: missingRoles,
      officeRolesWithoutPermissions: ungrantedRoles,
      privateAuthorizationHelpers: helperFunctions.rows.map((row) => row.name).sort(),
      expectedAuthorizationHelpers: [...AUTHORIZATION_HELPERS].sort()
    };
    if (missing.length || result.foreignKeys !== expected.foreignKeys || result.publicIndexes < expected.indexes
      || result.primaryKeys !== result.expectedPrimaryKeys || result.missingIndexes.length
      || result.rlsEnabledApplicationTables !== expected.tables.length || result.actualPolicies !== expected.policies
      || JSON.stringify(applied) !== JSON.stringify(REQUIRED_MIGRATIONS) || !result.authIdentityForeignKeyPresent
      || missingRoles.length || ungrantedRoles.length || JSON.stringify(result.privateAuthorizationHelpers) !== JSON.stringify(result.expectedAuthorizationHelpers)) {
      throw new Error('Fresh Supabase schema, migration, RBAC, or RLS validation failed');
    }
    return result;
  });
}

async function recordAudit(client, env, validation) {
  const run = String(env.GITHUB_RUN_ID || 'manual').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40) || 'manual';
  const attempt = String(env.GITHUB_RUN_ATTEMPT || '1').replace(/[^0-9]/g, '').slice(0, 4) || '1';
  const metadata = { projectRef: env.SUPABASE_PROJECT_REF, migrations: validation.appliedMigrations, tables: validation.applicationTables, foreignKeys: validation.foreignKeys, policies: validation.actualPolicies };
  await client.query(`INSERT INTO public.audit_events (id,event_type,occurred_at,correlation_id,metadata_json)
    VALUES ($1,$2,now(),$3,$4::jsonb)`, [`recovery_${run}_${attempt}`, 'SUPABASE_DATABASE_RECOVERY_VALIDATED', run, JSON.stringify(metadata)]);
}

function writeReport(report) {
  const target = path.join(ROOT, 'artifacts', 'recovery-rehearsal-report.json');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
}

async function runStage(stage, env = process.env) {
  if (stage === 'report') {
    const previousPath = path.join(ROOT, 'artifacts', 'recovery-rehearsal-report.json');
    let previous = {};
    try { previous = JSON.parse(fs.readFileSync(previousPath, 'utf8')); } catch { /* first-stage failure */ }
    return {
      ...previous,
      stageOutcomes: {
        authorization: env.EDUTRACK_RECOVERY_AUTHORIZATION_OUTCOME || 'unknown',
        preflight: env.EDUTRACK_RECOVERY_PREFLIGHT_OUTCOME || 'unknown',
        migrationDryRun: env.EDUTRACK_RECOVERY_DRY_RUN_OUTCOME || 'unknown',
        migrationApply: env.EDUTRACK_RECOVERY_MIGRATION_OUTCOME || 'unknown',
        securityIntegration: env.EDUTRACK_RECOVERY_SECURITY_OUTCOME || 'unknown',
        databaseIntegration: env.EDUTRACK_RECOVERY_PARTS_OUTCOME || 'unknown',
        applicationRegression: env.EDUTRACK_RECOVERY_REGRESSION_OUTCOME || 'unknown',
        finalValidation: env.EDUTRACK_RECOVERY_VALIDATION_OUTCOME || 'unknown'
      }
    };
  }
  assertAuthorized(env);
  migrationExpectations();
  const client = new Client(clientConfig(env));
  await client.connect();
  try {
    if (stage === 'preflight') return await preflight(client);
    if (stage === 'validate') {
      const validation = await validate(client);
      await recordAudit(client, env, validation);
      return validation;
    }
    throw new Error('Unknown recovery validation stage');
  } finally { await client.end(); }
}

async function main() {
  const stage = process.argv[2];
  let report = { status: 'FAILED', stage: stage || 'UNSPECIFIED', projectRef: process.env.SUPABASE_PROJECT_REF || null };
  try {
    const result = await runStage(stage);
    if (stage === 'report') report = { ...result, status: Object.values(result.stageOutcomes).every((status) => status === 'success') ? 'PASSED' : 'INCOMPLETE' };
    else { report.result = result; report.status = 'PASSED'; }
  } catch (error) {
    report.error = { message: error.message, code: error.code || 'VALIDATION_ERROR' };
    process.exitCode = 1;
  } finally {
    writeReport(report);
    console.log(`RECOVERY_VALIDATION_${report.status}`);
    if (report.status === 'FAILED') console.error(`${report.stage}: ${report.error.code}: ${report.error.message}`);
  }
}

if (require.main === module) main();
module.exports = { CONFIRMATION, REQUIRED_MIGRATIONS, OFFICE_ROLES, assertAuthorized, migrationExpectations, clientConfig, preflight, validate, runStage };
