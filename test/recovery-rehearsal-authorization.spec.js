'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { CONFIRMATION, OFFICE_ROLES, REQUIRED_MIGRATIONS, assertAuthorized, migrationExpectations, clientConfig, preflight } = require('../scripts/rehearse-production-recovery');

const ref = 'abcdefghijklmnopqrst';
const authorized = {
  NODE_ENV: 'recovery-rehearsal',
  EDUTRACK_RECOVERY_REHEARSAL_CONFIRMATION: CONFIRMATION,
  SUPABASE_PROJECT_REF: ref,
  SUPABASE_NEW_PROJECT_REF: ref,
  SUPABASE_URL: `https://${ref}.supabase.co`,
  SUPABASE_DB_URL: `postgresql://postgres:hidden@db.${ref}.supabase.co:5432/postgres`,
  SUPABASE_DB_PASSWORD: 'hidden',
  SUPABASE_ACCESS_TOKEN: 'hidden',
  SUPABASE_ANON_KEY: 'hidden',
  SUPABASE_SERVICE_ROLE_KEY: 'hidden'
};

assert.equal(assertAuthorized(authorized).projectRef, ref);
assert.equal(clientConfig(authorized).ssl.rejectUnauthorized, true);
for (const patch of [
  { NODE_ENV: 'production' },
  { EDUTRACK_RECOVERY_REHEARSAL_CONFIRMATION: 'wrong' },
  { SUPABASE_PROJECT_REF: 'otherprojectref123456' },
  { SUPABASE_NEW_PROJECT_REF: 'otherprojectref123456' },
  { SUPABASE_URL: 'https://otherprojectref123456.supabase.co' },
  { SUPABASE_DB_URL: 'mysql://user:pass@db.example.test/postgres' },
  { SUPABASE_DB_URL: `postgresql://postgres:hidden@db.otherprojectref123456.supabase.co:5432/postgres` },
  { SUPABASE_DB_URL: `postgresql://postgres.wrong:hidden@aws-0-us-east-1.pooler.supabase.com:6543/postgres` },
  { SUPABASE_DB_URL: 'postgresql://postgres:hidden@localhost:5432/postgres' },
  { SUPABASE_ACCESS_TOKEN: '' },
  { SUPABASE_DB_PASSWORD: '' },
  { SUPABASE_ANON_KEY: '' },
  { SUPABASE_SERVICE_ROLE_KEY: '' }
]) assert.throws(() => assertAuthorized({ ...authorized, ...patch }));

const expected = migrationExpectations();
assert.equal(expected.tables.length, 84);
assert.equal(expected.applicationForeignKeys, 156);
assert.equal(expected.foreignKeys, 157);
assert.equal(expected.policies, 23);
assert.deepEqual(REQUIRED_MIGRATIONS, ['20261116000000', '20261116001000', '20261116002000']);
assert.equal(OFFICE_ROLES.length, 15);
assert.equal(new Set(OFFICE_ROLES).size, 15);

function mockPreflight({ publicObjects = 0, migrationTable = true, appliedMigrations = 0 } = {}) {
  return {
    async query(sql) {
      if (sql === 'BEGIN READ ONLY' || sql === 'ROLLBACK') return { rows: [] };
      if (sql.includes('current_database()')) return { rows: [{ database: 'postgres', username: 'postgres' }] };
      if (sql.includes('FROM pg_class')) return { rows: [{ count: publicObjects }] };
      if (sql.includes('to_regclass')) return { rows: [{ migration_table: migrationTable ? 'supabase_migrations.schema_migrations' : null }] };
      if (sql.includes('FROM supabase_migrations.schema_migrations')) return { rows: [{ count: appliedMigrations }] };
      throw new Error(`Unexpected preflight query: ${sql}`);
    }
  };
}
const freshPreflightChecks = Promise.resolve()
  .then(() => preflight(mockPreflight()))
  .then((result) => assert.equal(result.migrationHistory, 'EMPTY', 'empty CLI metadata is allowed for a genuinely fresh target'))
  .then(() => assert.rejects(preflight(mockPreflight({ publicObjects: 1 })), /not a fresh database/))
  .then(() => assert.rejects(preflight(mockPreflight({ appliedMigrations: 1 })), /not a fresh database/));

const workflow = fs.readFileSync('.github/workflows/production-recovery-rehearsal.yml', 'utf8');
assert.match(workflow, /workflow_dispatch/);
assert.match(workflow, /environment: recovery-rehearsal/);
assert.match(workflow, /INITIALIZE_NEW_SUPABASE_DATABASE/);
assert.match(workflow, /secrets\.SUPABASE_NEW_PROJECT_REF/);
assert.match(workflow, /supabase db push --linked --dry-run/);
assert.match(workflow, /supabase db push --linked --yes/);
assert.doesNotMatch(workflow, /supabase db reset/);
assert.doesNotMatch(workflow, /(?:TIDB_|mysql2|legacy-account-cutover|RECOVER_ISOLATED_REHEARSAL_ONLY)/i);
assert.match(workflow, /actions\/upload-artifact@v4[\s\S]*?if: always\(\)/);

for (const script of ['scripts/legacy-account-cutover.js', 'scripts/audit-user-id-contract.js', 'scripts/verify-fresh-legacy-baseline.js']) {
  assert.equal(fs.existsSync(script), false, `${script} remains an obsolete cutover utility`);
}
freshPreflightChecks.then(() => console.log('Fresh Supabase recovery authorization and schema contract guards passed.')).catch((error) => { console.error(error); process.exitCode = 1; });
