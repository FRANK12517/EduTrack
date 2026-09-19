'use strict';

const assert = require('node:assert/strict');
const { isAuthorizedIsolatedMigrationTarget } = require('../scripts/legacy-account-cutover');

const cases = [
  ['existing isolated-test authorization', {
    NODE_ENV: 'test',
    EDUTRACK_ALLOW_ISOLATED_LEGACY_ACCOUNT_CUTOVER: 'true'
  }, true],
  ['isolated release-gate authorization', {
    NODE_ENV: 'test',
    EDUTRACK_RELEASE_GATE_TARGET: 'isolated-release-gate'
  }, true],
  ['missing authorization', { NODE_ENV: 'test' }, false],
  ['incorrect release-gate marker', {
    NODE_ENV: 'test',
    EDUTRACK_RELEASE_GATE_TARGET: 'other-target'
  }, false],
  ['production marker', {
    NODE_ENV: 'production',
    EDUTRACK_RELEASE_GATE_TARGET: 'isolated-release-gate'
  }, false],
  ['NODE_ENV test alone', { NODE_ENV: 'test' }, false],
  ['ordinary database URL alone', {
    NODE_ENV: 'test',
    EDUTRACK_DATABASE_URL: 'mysql://user:password@example.test:4000/edutrack'
  }, false]
];

for (const [name, env, expected] of cases) {
  assert.equal(isAuthorizedIsolatedMigrationTarget(env), expected, name);
}

console.log(`Legacy account cutover authorization passed ${cases.length} cases.`);
