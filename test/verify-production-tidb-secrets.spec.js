'use strict';
const assert = require('node:assert/strict');
const { options } = require('../scripts/verify-production-tidb-secrets');
const env = { EDUTRACK_PRODUCTION_PREFLIGHT_TARGET: 'production-read-only', TIDB_HOST: 'hidden', TIDB_PORT: '4000', TIDB_USER: 'hidden', TIDB_PASSWORD: 'hidden', TIDB_DATABASE: 'edutrack_dev', TIDB_CA_CERT: 'hidden' };
assert.equal(options(env).ssl.rejectUnauthorized, true);
for (const key of ['TIDB_HOST', 'TIDB_PORT', 'TIDB_USER', 'TIDB_PASSWORD', 'TIDB_DATABASE', 'TIDB_CA_CERT']) { const copy = { ...env }; delete copy[key]; assert.throws(() => options(copy)); }
assert.throws(() => options({ ...env, EDUTRACK_PRODUCTION_PREFLIGHT_TARGET: 'disposable-validation' }));
assert.throws(() => options({ ...env, TIDB_DATABASE: 'other' }));
assert.throws(() => options({ ...env, TIDB_PORT: '3306' }));
console.log('Production TiDB secret verification guard passed.');
