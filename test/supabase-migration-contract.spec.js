'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const administrativeScope = require('../app/auth/administrative-scope');

const root = path.join(__dirname, '..');
const initial = fs.readFileSync(path.join(root, 'supabase/migrations/20261116000000_initial_schema.sql'), 'utf8');
const rls = fs.readFileSync(path.join(root, 'supabase/migrations/20261116001000_auth_identity_and_rls.sql'), 'utf8');
const seed = fs.readFileSync(path.join(root, 'supabase/migrations/20261116002000_verified_system_rbac_seed.sql'), 'utf8');
const runtimeDdl = fs.readFileSync(path.join(root, 'db/relational.js'), 'utf8');
const runtimeTableContract = JSON.parse(fs.readFileSync(path.join(root, 'db/runtime-table-contract.json'), 'utf8'));
const schemaDdl = require('./schema-source').read();
const legacyCloudApi = fs.readFileSync(path.join(root, 'api/legacy.js'), 'utf8');

function names(source, pattern) {
  return [...source.matchAll(pattern)].map((match) => match[1]);
}

const sourceTables = new Set([
  ...runtimeTableContract.tables,
  ...names(schemaDdl, /CREATE TABLE IF NOT EXISTS ([a-z][a-z0-9_]*)/g),
  ...['term_records', 'subject_scores'].filter((table) => new RegExp(`(?:INSERT INTO|FROM|JOIN) ${table}\\b`, 'i').test(legacyCloudApi))
]);
const migratedTables = new Set(names(initial, /CREATE TABLE(?: IF NOT EXISTS)? public\.([a-z][a-z0-9_]*)/g).filter(table => table !== 'schema_migrations'));
for (const table of sourceTables) assert.ok(migratedTables.has(table), `fresh migration includes source table ${table}`);
for (const table of migratedTables) {
  if (table !== 'schema_migrations') assert.ok(sourceTables.has(table), `migration table ${table} is grounded in a current schema source`);
}
assert.equal(sourceTables.size, 84, 'the source includes all application tables and active legacy School cloud tables');
assert.equal(migratedTables.size, 84, 'the fresh migration covers every runtime and SQL source table');

assert.doesNotMatch(initial, /ENGINE\s*=|AUTO_INCREMENT|ON DUPLICATE KEY|INSERT IGNORE|`[^`]+`/i, 'fresh schema contains no MySQL DDL syntax');
assert.match(initial, /supabase_auth_user_id uuid UNIQUE REFERENCES auth\.users\(id\)/i, 'EduTrack identities map to Supabase Auth UUIDs');
assert.equal(names(initial, /FOREIGN KEY/g).length + names(initial, /REFERENCES public\./g).length, 156, 'the reconciled migration retains all reviewed source foreign keys');

const canonicalRoles = [
  'DISTRICT_DIRECTOR_OF_EDUCATION','DISTRICT_ADMIN','DISTRICT_SISO','DISTRICT_EXAMINATION_OFFICER','DISTRICT_SPORTS_OFFICER',
  'REGIONAL_DIRECTOR_OF_EDUCATION','REGIONAL_ADMIN','REGIONAL_SISO','REGIONAL_EXAMINATION_OFFICER','REGIONAL_SPORTS_OFFICER',
  'NATIONAL_DIRECTOR_OF_EDUCATION','NATIONAL_ADMIN','NATIONAL_SISO','NATIONAL_EXAMINATION_OFFICER','NATIONAL_SPORTS_OFFICER'
];
for (const role of canonicalRoles) assert.match(seed, new RegExp(`\\('${role}'\\s*,`), `verified permission mapping exists for ${role}`);

const permissionSeedSource = runtimeDdl.match(/const PERMISSION_SEED = (\[[\s\S]*?\]);/)?.[1];
const rolePermissionSource = runtimeDdl.match(/const ROLE_PERMISSION_SEED = (\{[\s\S]*?\n\});/)?.[1];
assert.ok(permissionSeedSource && rolePermissionSource, 'existing application permission matrix is available for comparison');
const basePermissions = vm.runInNewContext(permissionSeedSource);
const applicationGrants = vm.runInNewContext(`(${rolePermissionSource})`, { PERMISSION_SEED: basePermissions });
const migrationGrants = new Map();
for (const match of seed.matchAll(/^\s*\('([A-Z_]+)', ARRAY\[(.*?)\]::text\[\]\),?$/gm)) {
  const existing = migrationGrants.get(match[1]) || new Set();
  for (const permission of match[2].matchAll(/'([^']+)'/g)) existing.add(permission[1]);
  migrationGrants.set(match[1], existing);
}
const expectedGrants = new Map(Object.entries(applicationGrants).map(([role, grants]) => [role, new Set(grants)]));
for (const [role, grants] of Object.entries(administrativeScope.DISTRICT_PERMISSIONS)) {
  const merged = expectedGrants.get(role) || new Set();
  for (const grant of grants) merged.add(grant);
  expectedGrants.set(role, merged);
}
for (const [role, grants] of Object.entries(administrativeScope.UPPER_PERMISSIONS)) {
  const merged = expectedGrants.get(role) || new Set();
  for (const grant of grants) merged.add(grant);
  expectedGrants.set(role, merged);
}
for (const [role, grants] of expectedGrants) {
  assert.deepEqual([...migrationGrants.get(role) || []].sort(), [...grants].sort(), `migration permissions exactly match the verified matrix for ${role}`);
}
assert.deepEqual([...migrationGrants.keys()].sort(), [...expectedGrants.keys()].sort(), 'migration introduces no unverified role permission sets');

assert.match(rls, /supabase_auth_user_id\s*=\s*auth\.uid\(\)/i, 'RLS identity resolution is server-trusted through auth.uid');
assert.match(rls, /ENABLE ROW LEVEL SECURITY/i, 'RLS is enabled for discovered application tables');
assert.match(rls, /private\.edutrack_school_scope/i, 'school access requires the server-backed role and scope helper');
assert.match(rls, /private\.edutrack_student_link/i, 'parent access is constrained to explicitly linked students');
assert.match(rls, /r\.name = 'ASSISTANT_HEADTEACHER' THEN 'HEADTEACHER'/, 'Assistant Headteacher RLS grants inherit only the existing Headteacher permission set');
assert.match(rls, /Tables without an explicit policy[\s\S]*default deny/i, 'unmapped tables remain default-deny');
assert.match(rls, /ASSISTANT_HEADTEACHER/,'the application preserves the distinct Assistant Headteacher role catalog');
console.log('Supabase migration contract passed: 84 application tables plus schema tracking, 156 foreign keys, Auth mapping, RLS defaults, and 15 canonical administrative roles.');
