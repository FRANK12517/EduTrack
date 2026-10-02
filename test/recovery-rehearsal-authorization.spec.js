'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { isAuthorizedRecoveryRehearsalTarget } = require('../scripts/legacy-account-cutover');
const { assertAuthorized, assertStartingState } = require('../scripts/rehearse-production-recovery');
const authorized = { NODE_ENV: 'recovery-rehearsal', EDUTRACK_RECOVERY_REHEARSAL_CONFIRMATION: 'RECOVER_ISOLATED_REHEARSAL_ONLY', EDUTRACK_TIDB_RECOVERY_REHEARSAL_DATABASE_URL: 'mysql://hidden:hidden@example.test/edutrack_dev' };
assert.equal(isAuthorizedRecoveryRehearsalTarget(authorized), true);
for (const key of ['EDUTRACK_DATABASE_URL', 'DATABASE_URL', 'TIDB_HOST', 'TIDB_PASSWORD', 'EDUTRACK_TIDB_RELEASE_GATE_DATABASE_URL', 'EDUTRACK_TIDB_FRESH_TEST_DATABASE_URL']) {
  assert.equal(isAuthorizedRecoveryRehearsalTarget({ ...authorized, [key]: 'forbidden' }), false, key);
}
assert.doesNotThrow(() => assertAuthorized(authorized));
assert.throws(() => assertAuthorized({ ...authorized, EDUTRACK_RECOVERY_REHEARSAL_CONFIRMATION: 'wrong' }));
assert.doesNotThrow(() => assertStartingState({ legacy_schools_archive: 1, legacy_users_archive: 2, legacy_school_identity_map: 1, legacy_account_identity_map: 2, tenants: 0, schools: 0, users: 0, credentials: 0, user_roles: 0, tenant_memberships: 0, staff: 0 }));
assert.throws(() => assertStartingState({ legacy_schools_archive: 1, legacy_users_archive: 2, legacy_school_identity_map: 1, legacy_account_identity_map: 2, tenants: 1, schools: 0, users: 0, credentials: 0, user_roles: 0, tenant_memberships: 0, staff: 0 }));
const workflow = fs.readFileSync('.github/workflows/production-recovery-rehearsal.yml', 'utf8');
assert.match(workflow, /workflow_dispatch/);
assert.match(workflow, /environment: recovery-rehearsal/);
assert.match(workflow, /RECOVER_ISOLATED_REHEARSAL_ONLY/);
assert.match(workflow, /secrets\.EDUTRACK_TIDB_RECOVERY_REHEARSAL_DATABASE_URL/);
assert.doesNotMatch(workflow, new RegExp(`secrets\\.${'TIDB_'}|secrets\\.${'EDUTRACK_DATABASE_URL'}|secrets\\.${'DATABASE_URL'}|secrets\\.${'EDUTRACK_TIDB_RELEASE_GATE_DATABASE_URL'}|secrets\\.${'EDUTRACK_TIDB_FRESH_TEST_DATABASE_URL'}`));
console.log('Recovery rehearsal authorization guards passed.');
