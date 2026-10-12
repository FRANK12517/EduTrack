'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const Module = require('node:module');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'edutrack-school-login-relational-session-'));
const sessionStore = new Map();
let rejectNextSessionWrite = false;

process.env.NODE_ENV = 'test';
process.env.EDUTRACK_DATA_FILE = path.join(fixtureDir, 'fixture.json');
process.env.EDUTRACK_ENABLE_TEST_SCHOOL_FIXTURE = 'true';
process.env.EDUTRACK_TEST_SCHOOL_ACCESS_CODE = 'disposable-school-login-code';
process.env.EDUTRACK_TEST_SCHOOL_STAFF_ID = 'disposable-school-login-staff';
process.env.EDUTRACK_DATABASE_URL = '';
process.env.DATABASE_URL = '';

const relationalMock = {
  isConfigured: () => true,
  async hydrateAuthState(db) {
    const now = Date.now();
    db.sessions = [...sessionStore.values()]
      .filter(session => !session.revokedAt && new Date(session.expiresAt).getTime() > now)
      .map(session => ({ ...session }));
    return db;
  },
  async createSession(session) {
    if (rejectNextSessionWrite) {
      rejectNextSessionWrite = false;
      throw new Error('Disposable relational session write failure');
    }
    sessionStore.set(session.id, { ...session });
  },
  async revokeSessionByHash(tokenHash) {
    for (const [id, session] of sessionStore) {
      if (session.tokenHash === tokenHash && !session.revokedAt) {
        sessionStore.set(id, { ...session, revokedAt: new Date().toISOString() });
      }
    }
  },
  async appendAudit() {}
};

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === './db/relational' && parent && parent.filename === path.join(ROOT, 'server.js')) {
    return relationalMock;
  }
  return originalLoad.call(this, request, parent, isMain);
};

let api;
try {
  api = require('../api/index.js');
} finally {
  Module._load = originalLoad;
}

function request(handler, pathName, { method = 'GET', body, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(handler);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const payload = body === undefined ? '' : JSON.stringify(body);
      const req = http.request({
        hostname: address.address,
        port: address.port,
        path: pathName,
        method,
        headers: {
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
          ...headers
        }
      }, res => {
        let raw = '';
        res.setEncoding('utf8');
        res.on('data', chunk => { raw += chunk; });
        res.on('end', () => server.close(() => resolve({
          status: res.statusCode,
          headers: res.headers,
          body: raw
        })));
      });
      req.on('error', error => server.close(() => reject(error)));
      req.end(payload);
    });
  });
}

function sessionCookie(response) {
  const value = String(response.headers['set-cookie'] || '').split(';')[0];
  assert.ok(value.includes('='), 'successful login must set a session cookie');
  return value;
}

function tokenFrom(cookie) {
  return decodeURIComponent(cookie.slice(cookie.indexOf('=') + 1));
}

function tokenHash(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

(async () => {
  assert.equal(typeof api, 'function', 'Vercel adapter must expose a request handler');
  const credentials = {
    region: 'WESTERN',
    district: 'SEKONDI TAKORADI METROPOLITAN',
    role: 'HEADTEACHER',
    accessCode: process.env.EDUTRACK_TEST_SCHOOL_ACCESS_CODE,
    staffId: process.env.EDUTRACK_TEST_SCHOOL_STAFF_ID
  };

  const success = await request(api, '/api/school-login', { method: 'POST', body: credentials });
  assert.equal(success.status, 200, success.body);
  const successBody = JSON.parse(success.body);
  assert.equal(successBody.authenticated, true);
  assert.ok(successBody.user && successBody.school, 'school login response shape must remain unchanged');
  const cookie = sessionCookie(success);
  const rawToken = tokenFrom(cookie);
  const durableSession = [...sessionStore.values()].find(session => session.userId === successBody.user.id);
  assert.ok(durableSession, 'school login must write a durable relational session');
  assert.equal(durableSession.tokenHash, tokenHash(rawToken), 'stored session value must be the SHA-256 token hash');
  assert.notEqual(durableSession.tokenHash, rawToken, 'raw cookie token must not be stored as the hash');
  assert.ok(new Date(durableSession.expiresAt).getTime() > Date.now(), 'session expiry must be in the future');
  assert.match(String(success.headers['set-cookie']), /HttpOnly/i);
  assert.match(String(success.headers['set-cookie']), /SameSite=Lax/i);
  assert.match(String(success.headers['set-cookie']), /Path=\//i);
  assert.match(String(success.headers['set-cookie']), /Max-Age=\d+/i);
  assert.doesNotMatch(String(success.headers['set-cookie']), /Secure/i, 'test-mode cookies must retain the existing non-production attributes');

  const confirmed = await request(api, '/api/auth/session', { headers: { cookie } });
  assert.equal(confirmed.status, 200, confirmed.body);
  assert.equal(JSON.parse(confirmed.body).authenticated, true, 'separate request must find the hydrated relational session');

  const expiredToken = 'disposable-expired-session-token';
  sessionStore.set('expired-session', {
    id: 'expired-session', tokenHash: tokenHash(expiredToken), userId: successBody.user.id,
    createdAt: new Date(Date.now() - 120_000).toISOString(), expiresAt: new Date(Date.now() - 60_000).toISOString()
  });
  const expired = await request(api, '/api/auth/session', {
    headers: { cookie: `edutrack_session=${encodeURIComponent(expiredToken)}` }
  });
  assert.equal(expired.status, 401, 'expired sessions must be excluded during relational hydration');

  const revokedToken = 'disposable-revoked-session-token';
  sessionStore.set('revoked-session', {
    id: 'revoked-session', tokenHash: tokenHash(revokedToken), userId: successBody.user.id,
    createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60_000).toISOString(),
    revokedAt: new Date().toISOString()
  });
  const revoked = await request(api, '/api/auth/session', {
    headers: { cookie: `edutrack_session=${encodeURIComponent(revokedToken)}` }
  });
  assert.equal(revoked.status, 401, 'revoked sessions must be excluded during relational hydration');

  const beforeRejected = sessionStore.size;
  const invalidCode = await request(api, '/api/school-login', {
    method: 'POST', body: { ...credentials, accessCode: 'disposable-incorrect-code' }
  });
  assert.equal(invalidCode.status, 401);
  const invalidRole = await request(api, '/api/school-login', {
    method: 'POST', body: { ...credentials, role: 'DISTRICT DIRECTOR' }
  });
  assert.equal(invalidRole.status, 401);
  assert.equal(sessionStore.size, beforeRejected, 'rejected credentials and roles must not create sessions');

  rejectNextSessionWrite = true;
  const failedWrite = await request(api, '/api/school-login', { method: 'POST', body: credentials });
  assert.equal(failedWrite.status, 500, 'session write failure must not return an authenticated success');
  assert.equal(failedWrite.headers['set-cookie'], undefined, 'session write failure must not issue a session cookie');

  const logout = await request(api, '/api/auth/logout', { method: 'POST', headers: { cookie } });
  assert.equal(logout.status, 200);
  const afterLogout = await request(api, '/api/auth/session', { headers: { cookie } });
  assert.equal(afterLogout.status, 401, 'relational revocation must prevent subsequent authentication');

  console.log('School-login relational session contract passed using an isolated in-memory store.');
})().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
}).finally(() => {
  Module._load = originalLoad;
  fs.rmSync(fixtureDir, { recursive: true, force: true });
});
