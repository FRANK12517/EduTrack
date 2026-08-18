const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn, spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const DB_FILE = path.join(ROOT, 'data', 'edutrack.json');
const BACKUP_FILE = `${DB_FILE}.security-test-backup`;
const PORT = 3101;
const BASE = `http://127.0.0.1:${PORT}`;
const EMAIL = 'security-test@example.invalid';
const PASSWORD = 'correct horse battery staple';
const ACCESS = 'security-access-code';

function hash(value, salt) { return `${salt}:${crypto.scryptSync(value, salt, 64).toString('hex')}`; }
function tokenHash(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function waitForServer(child) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Security-test server did not start')), 10000);
    child.stdout.on('data', (chunk) => {
      if (chunk.toString().includes('EduTrack server listening')) { clearTimeout(timer); resolve(); }
    });
    child.once('error', reject);
    child.once('exit', (code) => { if (code !== null) reject(new Error(`server exited with ${code}`)); });
  });
}
function cookies(response) {
  return (response.headers.get('set-cookie') || '').split(';')[0];
}
async function request(url, options = {}) {
  return fetch(`${BASE}${url}`, { ...options, headers: { ...(options.headers || {}) } });
}
async function jsonResponse(response) { return response.json(); }

async function run() {
  fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
  if (fs.existsSync(DB_FILE)) fs.copyFileSync(DB_FILE, BACKUP_FILE);
  fs.writeFileSync(DB_FILE, JSON.stringify({ version: 2, users: [], schools: [], staff: [], subscriptions: [], transactions: [], sessions: [], passwordResets: [], audit: [] }, null, 2));
  const provision = spawnSync(process.execPath, ['server.js', '--provision'], {
    cwd: ROOT,
    env: { ...process.env, EDUTRACK_DEVELOPER_EMAIL: EMAIL, EDUTRACK_DEVELOPER_PASSWORD: PASSWORD, EDUTRACK_DEVELOPER_ACCESS_CODE: ACCESS, EDUTRACK_SUPER_ADMIN_EMAIL: 'admin@example.invalid', EDUTRACK_SUPER_ADMIN_PASSWORD: 'another secure password', EDUTRACK_SUPER_ADMIN_ACCESS_CODE: 'another access code' },
    encoding: 'utf8'
  });
  assert.equal(provision.status, 0, provision.stderr || provision.stdout);
  const server = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT) }, stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    await waitForServer(server);
    const login = await request('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', origin: BASE }, body: JSON.stringify({ email: EMAIL, password: PASSWORD, accessCode: ACCESS }) });
    assert.equal(login.status, 200);
    const sessionCookie = cookies(login);
    const setCookie = login.headers.get('set-cookie');
    assert.match(setCookie, /HttpOnly/);
    assert.match(setCookie, /SameSite=Lax/);
    assert.match(setCookie, /Path=\//);
    assert.doesNotMatch(setCookie, /edutrack_session=[^;]+\.[^;]+/);

    const session = await request('/api/auth/session', { headers: { cookie: sessionCookie } });
    assert.equal(session.status, 200);
    const summary = await request('/api/admin/summary', { headers: { cookie: sessionCookie } });
    assert.equal(summary.status, 200);
    const forbidden = await request('/api/admin/summary', { headers: { cookie: 'edutrack_session=invalid' } });
    assert.equal(forbidden.status, 401);
    const corsRejected = await request('/api/health', { headers: { origin: 'https://attacker.invalid' } });
    assert.equal(corsRejected.status, 403);
    assert.equal(corsRejected.headers.get('access-control-allow-origin'), null);
    const preflight = await request('/api/auth/login', { method: 'OPTIONS', headers: { origin: BASE, 'access-control-request-method': 'POST' } });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get('access-control-allow-origin'), BASE);
    const methodRejected = await request('/api/auth/login', { method: 'PUT', headers: { origin: BASE } });
    assert.equal(methodRejected.status, 405);
    const traversal = await request('/.git/config');
    assert.equal(traversal.status, 404);
    const oversized = await request('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'x'.repeat(9000), password: 'x', accessCode: 'x' }) });
    assert.equal(oversized.status, 400);
    const malformed = await request('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'not-an-email', password: 'x', accessCode: 'x' }) });
    assert.equal(malformed.status, 400);
    assert.equal((await jsonResponse(session)).user.role, 'DEVELOPER_ROOT');

    const csrf = await request('/api/auth/csrf', { headers: { cookie: sessionCookie } });
    assert.equal(csrf.status, 200);
    const csrfToken = (await jsonResponse(csrf)).token;
    assert.ok(csrfToken.length >= 32);

    const crossOriginLogout = await request('/api/auth/logout', { method: 'POST', headers: { cookie: sessionCookie, origin: 'https://attacker.invalid' } });
    assert.equal(crossOriginLogout.status, 403);
    const sameOriginLogout = await request('/api/auth/logout', { method: 'POST', headers: { cookie: sessionCookie, origin: BASE } });
    assert.equal(sameOriginLogout.status, 200);
    assert.equal((await request('/api/auth/session', { headers: { cookie: sessionCookie } })).status, 401);

    const unknown = await request('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'missing@example.invalid', password: 'bad', accessCode: 'bad' }) });
    const wrong = await request('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: EMAIL, password: 'bad', accessCode: 'bad' }) });
    assert.equal(unknown.status, wrong.status);
    assert.deepEqual(await unknown.json(), await wrong.json());

    let limited;
    for (let i = 0; i < 9; i++) limited = await request('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': '198.51.100.20' }, body: JSON.stringify({ email: 'rate-limit@example.invalid', password: 'bad', accessCode: 'bad' }) });
    assert.equal(limited.status, 429);
    assert.ok(limited.headers.get('retry-after'));

    const resetUnknown = await request('/api/auth/password-reset/request', { method: 'POST', headers: { 'content-type': 'application/json', origin: BASE }, body: JSON.stringify({ email: 'unknown@example.invalid' }) });
    const resetKnown = await request('/api/auth/password-reset/request', { method: 'POST', headers: { 'content-type': 'application/json', origin: BASE }, body: JSON.stringify({ email: EMAIL }) });
    assert.equal(resetUnknown.status, 202);
    assert.equal(resetKnown.status, 202);
    assert.deepEqual(await resetUnknown.json(), await resetKnown.json());
    const dbAfterReset = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    assert.ok(dbAfterReset.passwordResets.every((record) => !record.token));

    const passwordChangeLogin = await request('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: EMAIL, password: PASSWORD, accessCode: ACCESS }) });
    const passwordChangeCookie = cookies(passwordChangeLogin);
    const changed = await request('/api/auth/password-change', { method: 'POST', headers: { 'content-type': 'application/json', cookie: passwordChangeCookie, origin: BASE }, body: JSON.stringify({ currentPassword: PASSWORD, newPassword: 'new correct password' }) });
    assert.equal(changed.status, 200);
    assert.equal((await request('/api/auth/session', { headers: { cookie: passwordChangeCookie } })).status, 401);
    const auditDb = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    assert.ok(auditDb.audit.some((event) => event.action === 'UNAUTHORIZED_API_ACCESS'));
    assert.ok(auditDb.audit.some((event) => event.action === 'CORS_REJECTED'));

    const dbForReset = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    const user = dbForReset.users.find((record) => record.email === EMAIL);
    const rawReset = 'known-only-to-test';
    dbForReset.passwordResets.push({ id: 'test-reset', userId: user.id, tokenHash: tokenHash(rawReset), createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60000).toISOString(), usedAt: null });
    fs.writeFileSync(DB_FILE, JSON.stringify(dbForReset, null, 2));
    const confirmed = await request('/api/auth/password-reset/confirm', { method: 'POST', headers: { 'content-type': 'application/json', origin: BASE }, body: JSON.stringify({ token: rawReset, password: 'reset secure password' }) });
    assert.equal(confirmed.status, 200);
    const reused = await request('/api/auth/password-reset/confirm', { method: 'POST', headers: { 'content-type': 'application/json', origin: BASE }, body: JSON.stringify({ token: rawReset, password: 'reset secure password' }) });
    assert.equal(reused.status, 400);
    console.log('Security hardening suite passed.');
  } finally {
    server.kill('SIGTERM');
    if (fs.existsSync(BACKUP_FILE)) { fs.copyFileSync(BACKUP_FILE, DB_FILE); fs.unlinkSync(BACKUP_FILE); }
  }
}

run().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
