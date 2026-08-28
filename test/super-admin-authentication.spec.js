'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const DB_FILE = path.join(ROOT, 'data', 'edutrack.json');
const BACKUP_FILE = `${DB_FILE}.super-admin-test-backup`;
const PORT = 3103;
const BASE = `http://127.0.0.1:${PORT}`;
const EMAIL = 'super-admin-test@example.invalid';
const NAME = 'Super Administrator';
const OLD_PASSWORD = 'legacy-password-should-not-work';
const CURRENT_PASSWORD = 'current-super-admin-password';
const NEW_PASSWORD = 'new-super-admin-password-123';
const ACCESS_CODE = 'unused-access-code';

function hash(value, salt) {
  return `${salt}:${crypto.scryptSync(value, salt, 64).toString('hex')}`;
}
function cookie(response) {
  return (response.headers.get('set-cookie') || '').split(';')[0];
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

async function run() {
  fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
  if (fs.existsSync(DB_FILE)) fs.copyFileSync(DB_FILE, BACKUP_FILE);
  const db = {
    version: 3,
    users: [{
      id: 'usr_super_admin_test', email: EMAIL,
      passwordHash: hash(CURRENT_PASSWORD, 'super-admin-password-salt'),
      accessCodeHash: hash(ACCESS_CODE, 'super-admin-access-salt'),
      role: 'SUPER_ADMIN', hierarchy: 'ROOT', scope: ['ROOT'], active: true,
      failedLoginCount: 0, lockedUntil: null, createdAt: new Date().toISOString()
    }],
    schools: [], staff: [], subscriptions: [], transactions: [], paymentIntents: [], paymentEvents: [],
    files: [], sessions: [], passwordResets: [], audit: []
  };
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));

  const server = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), NODE_ENV: 'development' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  try {
    await waitForServer(server);

    const oldClientPassword = await request('/api/auth/super-admin-login', {
      method: 'POST', headers: { 'content-type': 'application/json', origin: BASE },
      body: JSON.stringify({ name: NAME, email: EMAIL, password: OLD_PASSWORD })
    });
    assert.equal(oldClientPassword.status, 401, 'a legacy client-only password must not authenticate');

    const login = await request('/api/auth/super-admin-login', {
      method: 'POST', headers: { 'content-type': 'application/json', origin: BASE },
      body: JSON.stringify({ name: NAME, email: EMAIL, password: CURRENT_PASSWORD })
    });
    assert.equal(login.status, 200, 'the server-side Super Administrator password should authenticate');
    const sessionCookie = cookie(login);
    const loginPayload = await json(login);
    assert.equal(loginPayload.authenticated, true);
    assert.equal(loginPayload.user.role, 'SUPER_ADMIN');
    assert.equal(loginPayload.authorization.dashboard, 'super-admin');
    assert.equal(Object.prototype.hasOwnProperty.call(loginPayload.user, 'password'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(loginPayload.user, 'passwordHash'), false);
    assert.ok(sessionCookie.startsWith('edutrack_session='));

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
      body: JSON.stringify({ name: NAME, email: EMAIL, password: NEW_PASSWORD })
    });
    assert.equal(freshClient.status, 200, 'the new password should work from a fresh client context');
    const freshCookie = cookie(freshClient);
    assert.notEqual(freshCookie, sessionCookie);

    const oldPasswordAfterChange = await request('/api/auth/super-admin-login', {
      method: 'POST', headers: { 'content-type': 'application/json', origin: BASE },
      body: JSON.stringify({ name: NAME, email: EMAIL, password: CURRENT_PASSWORD })
    });
    assert.equal(oldPasswordAfterChange.status, 401, 'the previous password must stop working globally');

    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    for (const marker of ['DEFAULT_PASSWORD', 'AUTH_EMAIL', 'AUTH_NAMES', 'ADMIN_PWDS', 'ems_super_admin_active_password_v1']) {
      assert.equal(html.includes(marker), false, `client must not ship ${marker}`);
    }
    assert.equal((html.match(/window\.subAdminLogin\s*=/g) || []).length, 1, 'one client handler owner must remain');
    assert.equal(html.includes('onclick="subAdminLogin()"'), false, 'inline duplicate submit handler must be removed');
    assert.equal(html.includes("onkeydown=\"if(event.key==='Enter')subAdminLogin()\""), false, 'inline duplicate Enter handler must be removed');

    const stored = fs.readFileSync(DB_FILE, 'utf8');
    assert.equal(stored.includes(CURRENT_PASSWORD), false, 'current password must not be persisted in plaintext');
    assert.equal(stored.includes(NEW_PASSWORD), false, 'new password must not be persisted in plaintext');
    assert.equal(stored.includes(OLD_PASSWORD), false, 'legacy password must not be persisted in plaintext');
    assert.match(stored, /SUPER_ADMIN_LOGIN_SUCCESS/);
    assert.match(stored, /SUPER_ADMIN_LOGIN_REJECTED/);
    console.log('Super Administrator server-backed authentication and cross-client password persistence regression passed.');
  } finally {
    server.kill('SIGTERM');
    if (fs.existsSync(BACKUP_FILE)) { fs.copyFileSync(BACKUP_FILE, DB_FILE); fs.unlinkSync(BACKUP_FILE); }
  }
}

run().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
