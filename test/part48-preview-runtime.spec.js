'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
// Synthetic configuration and stubbed services: never connect to a real database or bucket.
process.env.NODE_ENV = 'production';
process.env.VERCEL = '1';
process.env.EDUTRACK_ENABLE_DEV_ACCESS = 'false';
process.env.EDUTRACK_ALLOWED_ORIGINS = 'https://preview.edutrack.test';
process.env.SUPABASE_URL = 'https://fixture.supabase.test';
process.env.SUPABASE_ANON_KEY = 'fixture-anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fixture-service-role-key';
process.env.EDUTRACK_STORAGE_MODE = 's3';
process.env.EDUTRACK_STORAGE_BUCKET = 'isolated-validation-only';
const relational = require('../db/relational');
const api = require('../api/index');
const roles = require('../app/auth/administrative-scope').CORE_ROLES;
const loginHierarchy = require('../app/auth/login-hierarchy');
const vercel = require('../vercel.json');
let configured = true;
let databaseFailure = false;
let databaseChecks = 0;
relational.isConfigured = () => configured;
relational.ensureInitialized = async () => {
  databaseChecks += 1;
  if (databaseFailure) throw new Error('sensitive-connection-detail-must-stay-private');
};
relational.hydrateAuthState = async () => { throw new Error('Public endpoints must not hydrate accounts'); };
const originalMkdir = fs.mkdirSync;
const originalError = console.error;
const runtimeLogs = [];
console.error = (...args) => runtimeLogs.push(args.join(' '));
fs.mkdirSync = () => { throw new Error('EROFS: simulated immutable deployment filesystem'); };
async function request(url, origin) {
  const response = { statusCode: 0, headers: {}, body: '', headersSent: false };
  response.setHeader = (name, value) => { response.headers[name.toLowerCase()] = value; };
  response.writeHead = (status, headers) => {
    response.statusCode = status;
    for (const [name, value] of Object.entries(headers)) response.setHeader(name, value);
    response.headersSent = true;
  };
  response.end = (body = '') => { response.body += body; };
  await api({ method: 'GET', url, headers: origin ? { origin } : {} }, response);
  return response;
}
(async () => {
  for (const environment of ['preview', 'production']) {
    process.env.VERCEL_ENV = environment;
    const beforeOptions = databaseChecks;
    const options = await request('/api/auth/login-options');
    assert.equal(options.statusCode, 200, environment);
    assert.deepEqual(JSON.parse(options.body).roles, roles);
    for (const level of ['NATIONAL','REGIONAL','DISTRICT']) {
      const suffixes = ['DIRECTOR_OF_EDUCATION','ADMIN','SISO','EXAMINATION_OFFICER','SPORTS_OFFICER'];
      const ids = Object.entries(JSON.parse(options.body).roles).filter(([, item]) => item.level === level).map(([key]) => key);
      assert.equal(ids.length, 5, level + ' exposes exactly five roles');
      assert.deepEqual(ids, suffixes.map(suffix => level + '_' + suffix), level + ' role identifiers match login authentication');
      for (const role of ids) {
        const input = { administrativeLevel: level, role, ...(level !== 'NATIONAL' ? { region: 'Central Region' } : {}), ...(level === 'DISTRICT' ? { district: 'Cape Coast Metro' } : {}) };
        assert.equal(loginHierarchy.validSelection(input), true, role + ' accepted with its required jurisdiction fields');
      }
      if (level === 'NATIONAL') assert.equal(loginHierarchy.validSelection({ administrativeLevel: level, role: ids[0], region: 'Central Region' }), false, 'National does not accept Region or District');
      if (level === 'REGIONAL') assert.equal(loginHierarchy.validSelection({ administrativeLevel: level, role: ids[0], region: 'Central Region', district: 'Cape Coast Metro' }), false, 'Regional does not accept District');
    }
    for (const variable of ['SUPABASE_URL','SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY']) {
      const previous = process.env[variable];
      delete process.env[variable];
      assert.equal((await request('/api/auth/login-options')).statusCode, 200, 'role metadata loads without ' + variable);
      process.env[variable] = previous;
    }
    assert.equal(databaseChecks, beforeOptions, 'Static roles must not initialize the database');
    const health = await request('/api/health?probe=1', 'https://preview.edutrack.test');
    assert.equal(health.statusCode, 200);
    assert.deepEqual(JSON.parse(health.body), { ok: true, persistence: 'supabase-postgresql' });
    assert.equal(databaseChecks, beforeOptions + 1);
    assert.equal(health.headers['access-control-allow-origin'], 'https://preview.edutrack.test');
    assert.equal(health.headers['x-content-type-options'], 'nosniff');
    assert.ok(health.headers['x-request-id']);
    for (const url of ['/api/health', '/api/auth/login-options']) {
      assert.equal((await request(url, 'https://attacker.invalid')).statusCode, 403);
      configured = false;
      assert.equal((await request(url)).statusCode, url === '/api/auth/login-options' ? 200 : 503, 'Static login metadata stays public while health fails closed without database configuration');
      configured = true;
      process.env.EDUTRACK_STORAGE_MODE = 'local';
      assert.equal((await request(url)).statusCode, url === '/api/auth/login-options' ? 200 : 503, 'Login metadata is independent of storage configuration');
      process.env.EDUTRACK_STORAGE_MODE = 's3';
      process.env.EDUTRACK_STORAGE_BUCKET = '';
      assert.equal((await request(url)).statusCode, url === '/api/auth/login-options' ? 200 : 503);
      process.env.EDUTRACK_STORAGE_BUCKET = 'isolated-validation-only';
      process.env.EDUTRACK_ENABLE_DEV_ACCESS = 'true';
      assert.equal((await request(url)).statusCode, url === '/api/auth/login-options' ? 200 : 503);
      process.env.EDUTRACK_ENABLE_DEV_ACCESS = 'false';
    }
    databaseFailure = true;
    const unavailable = await request('/api/health');
    assert.equal(unavailable.statusCode, 503);
    assert.doesNotMatch(unavailable.body, /sensitive-connection/);
    databaseFailure = false;
    configured = false;
    const retiredDiagnostic = await request('/api/debug-db');
    assert.equal(retiredDiagnostic.statusCode, 503, 'Removed diagnostic must use the canonical guard');
    assert.doesNotMatch(retiredDiagnostic.body, /envVarUsed|database/);
    configured = true;
  }
  assert.equal(vercel.outputDirectory, 'dist');
  assert.ok(vercel.rewrites.some(rule => rule.source === '/api/:path*' && rule.destination === '/api/index.js'));
  for (const code of ['DATABASE_CONFIGURATION_MISSING', 'STORAGE_MODE_NOT_DURABLE', 'STORAGE_BUCKET_MISSING', 'DEVELOPMENT_ACCESS_ENABLED', 'DATABASE_UNAVAILABLE']) {
    assert.ok(runtimeLogs.some(entry => entry.includes(code)), `Missing safe diagnostic: ${code}`);
  }
  assert.doesNotMatch(runtimeLogs.join('\n'), /sensitive-connection|isolated-validation-only|preview\.edutrack\.test/);
  console.log('PASS: public API on immutable filesystem; Preview/Production guards; CORS; database failure; retired diagnostic.');
})().catch(error => { originalError(error); process.exitCode = 1; }).finally(() => { fs.mkdirSync = originalMkdir; console.error = originalError; });
