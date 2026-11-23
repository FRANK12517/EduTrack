'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const TEST_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'edutrack-super-admin-test-'));
const DB_FILE = path.join(TEST_DIR, 'edutrack.json');
process.env.EDUTRACK_DATA_FILE = DB_FILE;
const { createSuperAdminFixture, relational } = require('./super-admin-auth-fixture');
const PORT = 3103;
const BASE = `http://127.0.0.1:${PORT}`;
const NAME = 'Super Administrator';
const OLD_PASSWORD = 'legacy-password-should-not-work';
const CURRENT_PASSWORD = 'current-super-admin-password';
const NEW_PASSWORD = 'new-super-admin-password-123';
const ACCESS_CODE = 'unused-access-code';

function cookie(response) {
  const entries = typeof response.headers.getSetCookie === 'function'
    ? response.headers.getSetCookie()
    : String(response.headers.get('set-cookie') || '').split(/,\s*(?=[^;,]+=)/).filter(Boolean);
  return entries.map(value => value.split(';', 1)[0]).join('; ');
}
async function request(url, options = {}) {
  return fetch(`${BASE}${url}`, { ...options, headers: { ...(options.headers || {}) } });
}
async function json(response) {
  return response.json();
}
function waitForServer(child) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Super Administrator test server did not start')), 10000);
    child.stdout.on('data', chunk => {
      if (chunk.toString().includes('EduTrack server listening')) { clearTimeout(timer); resolve(); }
    });
    child.once('error', reject);
    child.once('exit', code => { if (code !== null) reject(new Error(`server exited with ${code}`)); });
  });
}
function stopServer(child) {
  if (!child || child.exitCode !== null) return Promise.resolve();
  return new Promise(resolve => {
    const timer = setTimeout(resolve, 5000);
    child.once('exit', () => { clearTimeout(timer); resolve(); });
    child.kill('SIGTERM');
  });
}

async function run() {
  fs.mkdirSync(TEST_DIR, { recursive: true });
  let fixture;
  let server;
  let auditSince;
  try {
    fixture = await createSuperAdminFixture({ password: CURRENT_PASSWORD });
    server = spawn(process.execPath, ['server.js'], {
      cwd: ROOT,
      env: { ...process.env, EDUTRACK_DATA_FILE: DB_FILE, PORT: String(PORT), NODE_ENV: 'development' },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    await waitForServer(server);
    auditSince = new Date(Date.now() - 1000).toISOString();

    const oldClientPassword = await request('/api/auth/super-admin-login', {
      method: 'POST', headers: { 'content-type': 'application/json', origin: BASE },
      body: JSON.stringify({ name: NAME, email: fixture.email, password: OLD_PASSWORD })
    });
    assert.equal(oldClientPassword.status, 401, 'a legacy client-only password must not authenticate');

    const login = await request('/api/auth/super-admin-login', {
      method: 'POST', headers: { 'content-type': 'application/json', origin: BASE },
      body: JSON.stringify({ name: NAME, email: fixture.email, password: CURRENT_PASSWORD })
    });
    assert.equal(login.status, 200, 'the server-side Super Administrator password should authenticate');
    const sessionCookie = cookie(login);
    const loginPayload = await json(login);
    assert.equal(loginPayload.authenticated, true);
    assert.equal(loginPayload.user.role, 'SUPER_ADMIN');
    assert.equal(loginPayload.authorization.dashboard, 'super-admin');
    assert.equal(Object.prototype.hasOwnProperty.call(loginPayload.user, 'password'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(loginPayload.user, 'passwordHash'), false);
    for (const cookieName of ['edutrack_session=', 'edutrack_supabase_access=', 'edutrack_supabase_refresh=']) {
      assert.ok(sessionCookie.includes(cookieName), `login must issue ${cookieName} cookie`);
    }

    const session = await request('/api/auth/session', { headers: { cookie: sessionCookie } });
    assert.equal(session.status, 200);
    assert.equal((await json(session)).user.role, 'SUPER_ADMIN');

    const changed = await request('/api/auth/password-change', {
      method: 'POST', headers: { cookie: sessionCookie, origin: BASE, 'content-type': 'application/json' },
      body: JSON.stringify({ currentPassword: CURRENT_PASSWORD, newPassword: NEW_PASSWORD })
    });
    assert.equal(changed.status, 200, 'authenticated Super Administrator should be able to change the password');
    assert.equal((await request('/api/auth/session', { headers: { cookie: sessionCookie } })).status, 401, 'password change should invalidate the old session');

    // A fresh client context has no localStorage or prior cookie. This proves
    // persistence is server-side rather than tied to the original browser.
    const freshClient = await request('/api/auth/super-admin-login', {
      method: 'POST', headers: { 'content-type': 'application/json', origin: BASE },
      body: JSON.stringify({ name: NAME, email: fixture.email, password: NEW_PASSWORD })
    });
    assert.equal(freshClient.status, 200, 'the new password should work from a fresh client context');
    const freshCookie = cookie(freshClient);
    assert.notEqual(freshCookie, sessionCookie);

    const oldPasswordAfterChange = await request('/api/auth/super-admin-login', {
      method: 'POST', headers: { 'content-type': 'application/json', origin: BASE },
      body: JSON.stringify({ name: NAME, email: fixture.email, password: CURRENT_PASSWORD })
    });
    assert.equal(oldPasswordAfterChange.status, 401, 'the previous password must stop working globally');

    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    for (const marker of ['DEFAULT_PASSWORD', 'AUTH_EMAIL', 'AUTH_NAMES', 'ADMIN_PWDS', 'ems_super_admin_active_password_v1']) {
      assert.equal(html.includes(marker), false, `client must not ship ${marker}`);
    }
    assert.equal((html.match(/window\.subAdminLogin\s*=/g) || []).length, 1, 'one client handler owner must remain');
    assert.equal(html.includes('onclick="subAdminLogin()"'), false, 'inline duplicate submit handler must be removed');
    assert.equal(html.includes("onkeydown=\"if(event.key==='Enter')subAdminLogin()\""), false, 'inline duplicate Enter handler must be removed');

    const stored = await relational.domainRows(
      'SELECT u.email,u.status,u.active,u.development_fixture,u.supabase_auth_user_id,c.access_code_hash,c.status AS credential_status FROM users u LEFT JOIN credentials c ON c.user_id=u.id WHERE u.id=?',
      [fixture.userId]
    );
    assert.equal(stored.length, 1, 'the Super Administrator test identity must be stored in the relational database');
    const storedText = JSON.stringify(stored);
    for (const secret of [CURRENT_PASSWORD, NEW_PASSWORD, OLD_PASSWORD, ACCESS_CODE]) {
      assert.equal(storedText.includes(secret), false, 'passwords and access codes must not be persisted in plaintext');
    }
    const audit = await relational.domainRows(
      "SELECT event_type,actor_user_id FROM audit_events WHERE actor_user_id=? OR (event_type='SUPER_ADMIN_LOGIN_REJECTED' AND occurred_at>=?)",
      [fixture.userId, auditSince]
    );
    assert.ok(audit.some(event => event.event_type === 'SUPER_ADMIN_LOGIN_SUCCESS' && event.actor_user_id === fixture.userId));
    assert.ok(audit.filter(event => event.event_type === 'SUPER_ADMIN_LOGIN_REJECTED').length >= 2);
    console.log('Super Administrator server-backed authentication and cross-client password persistence regression passed.');
  } finally {
    await stopServer(server);
    if (fixture) await fixture.cleanup(auditSince);
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  }
}

run().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
