const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const DB_FILE = path.join(ROOT, 'data', 'edutrack.json');
const BACKUP_FILE = `${DB_FILE}.developer-test-backup`;
const PORT = 3102;
const BASE = `http://127.0.0.1:${PORT}`;
const DEVELOPER_STAFF_ID = '12345';
const DEVELOPER_ACCESS_CODE = 'developer-test-access-code';
const ORDINARY_EMAIL = 'ordinary-user@example.invalid';
const ORDINARY_PASSWORD = 'ordinary secure password';
const ORDINARY_ACCESS_CODE = 'ordinary-access-code';

function hash(value, salt) {
  return `${salt}:${crypto.scryptSync(value, salt, 64).toString('hex')}`;
}
function cookies(response) {
  return (response.headers.get('set-cookie') || '').split(';')[0];
}
function waitForServer(child) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Developer-access server did not start')), 10000);
    child.stdout.on('data', (chunk) => {
      if (chunk.toString().includes('EduTrack server listening')) { clearTimeout(timer); resolve(); }
    });
    child.once('error', reject);
    child.once('exit', (code) => { if (code !== null) reject(new Error(`server exited with ${code}`)); });
  });
}
async function request(url, options = {}) {
  return fetch(`${BASE}${url}`, { ...options, headers: { ...(options.headers || {}) } });
}
async function json(response) { return response.json(); }

async function run() {
  fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
  if (fs.existsSync(DB_FILE)) fs.copyFileSync(DB_FILE, BACKUP_FILE);
  const db = {
    version: 3, users: [{
      id: 'usr_ordinary', email: ORDINARY_EMAIL,
      passwordHash: hash(ORDINARY_PASSWORD, 'ordinary-password-salt'),
      accessCodeHash: hash(ORDINARY_ACCESS_CODE, 'ordinary-access-salt'),
      role: 'SCHOOL', hierarchy: 'SCHOOL', scope: ['SCHOOL'], active: true,
      failedLoginCount: 0, lockedUntil: null, createdAt: new Date().toISOString()
    }],
    schools: [], staff: [], subscriptions: [], transactions: [], paymentIntents: [], paymentEvents: [],
    files: [], sessions: [], passwordResets: [], audit: []
  };
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
  const server = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      EDUTRACK_DEVELOPER_STAFF_ID: DEVELOPER_STAFF_ID,
      EDUTRACK_DEVELOPER_ACCESS_CODE_HASH: hash(DEVELOPER_ACCESS_CODE, 'developer-access-salt')
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  try {
    await waitForServer(server);
    const cases = [
      ['SCHOOL', 'Headteacher', 'Greater Accra Region', 'Accra'],
      ['DISTRICT', 'District Director', 'Greater Accra Region', 'Accra'],
      ['REGIONAL', 'Regional Director', 'Greater Accra Region', ''],
      ['NATIONAL', 'Director-General', '', '']
    ];
    for (const [level, role, region, district] of cases) {
      const login = await request('/api/auth/developer-login', {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: BASE },
        body: JSON.stringify({ staffId: DEVELOPER_STAFF_ID, accessCode: DEVELOPER_ACCESS_CODE, level, role, region, district })
      });
      assert.equal(login.status, 200, `${level} developer login should succeed`);
      const sessionCookie = cookies(login);
      const payload = await json(login);
      assert.equal(payload.user.authMode, 'developer');
      assert.equal(payload.user.isDeveloper, true);
      assert.equal(payload.user.developerStaffId, DEVELOPER_STAFF_ID);
      assert.equal(payload.user.developerLevel, level);
      assert.equal(payload.user.developerRole, role);
      assert.equal(payload.authorization.dashboard, level.toLowerCase());
      assert.equal(Object.prototype.hasOwnProperty.call(payload.user, 'accessCode'), false);
      assert.equal(Object.prototype.hasOwnProperty.call(payload.authorization, 'accessCode'), false);

      const session = await request('/api/auth/session', { headers: { cookie: sessionCookie } });
      assert.equal(session.status, 200);
      assert.equal((await json(session)).authorization.developerLevel, level);

      const summary = await request('/api/admin/summary', { headers: { cookie: sessionCookie } });
      assert.equal(summary.status, 200, `${level} developer session should authorize protected APIs`);

      const logout = await request('/api/auth/logout', {
        method: 'POST', headers: { cookie: sessionCookie, origin: BASE }
      });
      assert.equal(logout.status, 200);
      assert.equal((await request('/api/auth/session', { headers: { cookie: sessionCookie } })).status, 401);
    }

    const invalidCode = await request('/api/auth/developer-login', {
      method: 'POST', headers: { 'content-type': 'application/json', origin: BASE },
      body: JSON.stringify({ staffId: DEVELOPER_STAFF_ID, accessCode: 'wrong', level: 'SCHOOL', role: 'Headteacher' })
    });
    const invalidStaff = await request('/api/auth/developer-login', {
      method: 'POST', headers: { 'content-type': 'application/json', origin: BASE },
      body: JSON.stringify({ staffId: 'wrong', accessCode: DEVELOPER_ACCESS_CODE, level: 'SCHOOL', role: 'Headteacher' })
    });
    assert.equal(invalidCode.status, 401);
    assert.equal(invalidStaff.status, 401);
    assert.deepEqual(await json(invalidCode), await json(invalidStaff));

    const directApi = await request('/api/admin/summary');
    assert.equal(directApi.status, 401, 'direct API navigation must not create developer privileges');
    assert.equal((await request('/dashboard')).status, 404, 'direct dashboard navigation must not expose a protected server route');

    const ordinaryLogin = await request('/api/auth/login', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: ORDINARY_EMAIL, password: ORDINARY_PASSWORD, accessCode: ORDINARY_ACCESS_CODE })
    });
    assert.equal(ordinaryLogin.status, 200);
    const ordinaryPayload = await json(ordinaryLogin);
    assert.equal(ordinaryPayload.user.role, 'SCHOOL');
    assert.equal(Object.prototype.hasOwnProperty.call(ordinaryPayload.user, 'isDeveloper'), false);

    const dbAfter = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    assert.equal(dbAfter.users.some((user) => user.id.startsWith('dev_')), false, 'developer access must not create database users');
    assert.ok(dbAfter.audit.some((event) => event.action === 'developer_login'));
    assert.ok(dbAfter.audit.every((event) => !JSON.stringify(event).includes(DEVELOPER_ACCESS_CODE)));
    assert.ok(dbAfter.sessions.every((session) => session.authMode !== 'developer'), 'developer logout must invalidate developer sessions');
    console.log('Developer access regression suite passed.');
  } finally {
    server.kill('SIGTERM');
    if (fs.existsSync(BACKUP_FILE)) { fs.copyFileSync(BACKUP_FILE, DB_FILE); fs.unlinkSync(BACKUP_FILE); }
  }
}

run().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
