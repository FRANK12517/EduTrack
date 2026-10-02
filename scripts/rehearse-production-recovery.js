'use strict';

// This is intentionally a rehearsal-only resumption.  It never archives or
// renames legacy tables: those artifacts and their deterministic identity maps
// are the required source for the first unfinished canonical phase.
const fs = require('node:fs');
const path = require('node:path');
const relational = require('../db/relational');
const cutover = require('./legacy-account-cutover');

function assertAuthorized(env = process.env) {
  if (!cutover.isAuthorizedRecoveryRehearsalTarget(env)) {
    throw new Error('Recovery rehearsal target is not explicitly authorized');
  }
}
function q(value) { return `\`${String(value).replace(/`/g, '``')}\``; }
async function count(db, table) {
  const [[row]] = await db.query(`SELECT COUNT(*) AS count FROM ${q(table)}`);
  return Number(row.count);
}
async function tableSet(db) {
  const [rows] = await db.query('SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE()');
  return new Set(rows.map((row) => row.TABLE_NAME));
}
async function state(db) {
  const tables = await tableSet(db);
  const required = ['legacy_schools_archive', 'legacy_users_archive', 'legacy_school_identity_map', 'legacy_account_identity_map', 'tenants', 'schools', 'users', 'credentials', 'roles', 'user_roles', 'tenant_memberships', 'staff', 'schema_migrations'];
  if (!required.every((table) => tables.has(table))) throw new Error('Recovery rehearsal schema is incomplete or unexpected');
  const values = {};
  for (const table of required) values[table] = await count(db, table);
  return values;
}
function assertStartingState(values) {
  if (values.legacy_schools_archive !== values.legacy_school_identity_map || values.legacy_users_archive !== values.legacy_account_identity_map) {
    throw new Error('Archive and canonical identity mapping counts do not agree');
  }
  if ([values.tenants, values.schools, values.users, values.credentials, values.user_roles, values.tenant_memberships, values.staff].some(Boolean)) {
    throw new Error('Canonical identity population is not empty; targeted recovery requires manual review');
  }
}
async function foreignKeyOrphans(db) {
  const [keys] = await db.query(`SELECT TABLE_NAME,COLUMN_NAME,REFERENCED_TABLE_NAME,REFERENCED_COLUMN_NAME
    FROM information_schema.KEY_COLUMN_USAGE
    WHERE TABLE_SCHEMA=DATABASE() AND REFERENCED_TABLE_NAME IS NOT NULL`);
  let total = 0;
  for (const key of keys) {
    const [[row]] = await db.query(`SELECT COUNT(*) AS count FROM ${q(key.TABLE_NAME)} c
      LEFT JOIN ${q(key.REFERENCED_TABLE_NAME)} p ON c.${q(key.COLUMN_NAME)}=p.${q(key.REFERENCED_COLUMN_NAME)}
      WHERE c.${q(key.COLUMN_NAME)} IS NOT NULL AND p.${q(key.REFERENCED_COLUMN_NAME)} IS NULL`);
    total += Number(row.count);
  }
  return { definitions: keys.length, orphans: total };
}
async function validate(db) {
  const values = await state(db);
  const [[migration]] = await db.query('SELECT COUNT(*) AS count FROM schema_migrations');
  const [[unmigratedAccounts]] = await db.query("SELECT COUNT(*) AS count FROM legacy_account_identity_map WHERE migration_status <> 'MIGRATED'");
  const [[unmigratedSchools]] = await db.query("SELECT COUNT(*) AS count FROM legacy_school_identity_map WHERE migration_status <> 'MIGRATED'");
  const [[duplicateStaff]] = await db.query('SELECT COUNT(*) AS count FROM (SELECT staff_identifier FROM staff GROUP BY staff_identifier HAVING COUNT(*) > 1) duplicates');
  const foreignKeys = await foreignKeyOrphans(db);
  const matches = values.legacy_schools_archive === values.schools && values.legacy_users_archive === values.users
    && values.users === values.credentials && values.users === values.user_roles && values.users === values.tenant_memberships && values.users === values.staff;
  if (!matches || !Number(migration.count) || Number(unmigratedAccounts.count) || Number(unmigratedSchools.count) || Number(duplicateStaff.count) || foreignKeys.orphans) {
    throw new Error('Recovered canonical state failed integrity validation');
  }
  return { canonical: { tenants: values.tenants, schools: values.schools, users: values.users, credentials: values.credentials, roles: values.roles, userRoles: values.user_roles, memberships: values.tenant_memberships, staff: values.staff }, archive: { schools: values.legacy_schools_archive, users: values.legacy_users_archive }, migrationHistory: Number(migration.count), mappings: { schools: values.legacy_school_identity_map, accounts: values.legacy_account_identity_map }, foreignKeys };
}
async function main() {
  assertAuthorized();
  console.log('TARGET=RECOVERY_REHEARSAL');
  const db = relational.getPool();
  try {
    const before = await state(db); assertStartingState(before);
    // Canonical DDL/role seeding is the established migration implementation.
    await relational.migrate();
    await cutover.materialize();
    const first = await validate(db);
    // The same completion path must be safe to run again without duplication.
    await relational.migrate();
    await cutover.materialize();
    const second = await validate(db);
    const report = { target: 'RECOVERY_REHEARSAL', startingState: 'PARTIAL_MIGRATION_RECOVERY_REQUIRED', recoveryPhase: 'CANONICAL_IDENTITY_POPULATION', validation: second, idempotency: JSON.stringify(first) === JSON.stringify(second) ? 'PASS' : 'FAILED', authenticationCompatibility: 'RESET_REQUIRED_CREDENTIALS', schoolLoginSmokeTest: 'NOT_RUN_RESET_REQUIRED_CREDENTIALS' };
    if (report.idempotency !== 'PASS') throw new Error('Recovery rehearsal idempotency validation failed');
    fs.mkdirSync('artifacts', { recursive: true });
    fs.writeFileSync(path.join('artifacts', 'recovery-rehearsal-report.json'), JSON.stringify(report, null, 2), { mode: 0o600 });
    console.log('RECOVERY_REHEARSAL_PASS');
  } finally { await relational.close(); }
}
if (require.main === module) main().catch((error) => { console.error(`RECOVERY_REHEARSAL_FAILED: ${error.message}`); process.exitCode = 1; });
module.exports = { assertAuthorized, assertStartingState };
