'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const mysql = require('mysql2/promise');

const ROOT = path.resolve(__dirname, '..');
const DB_FILE = path.join(ROOT, 'data', 'edutrack.json');
const PORT = 3419;
const BASE = `http://127.0.0.1:${PORT}`;
const DATABASE_URL = process.env.EDUTRACK_DATABASE_URL || 'mysql://edutrack_test:part19_test_password@127.0.0.1:3306/edutrack_part19_test';
const DEV = { email: 'part19-db-dev@example.invalid', password: 'Part19-Database-Password!', accessCode: 'Part19-Database-Code!' };

function request(pathname, options = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(`${BASE}${pathname}`, { method: options.method || 'GET', headers: options.headers || {} }, (res) => {
      let raw = ''; res.setEncoding('utf8'); res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => { let body = {}; try { body = raw ? JSON.parse(raw) : {}; } catch {} resolve({ status: res.statusCode, headers: res.headers, body }); });
    });
    req.on('error', reject); if (options.body) req.write(options.body); req.end();
  });
}
function cookieFrom(response) { return Array.isArray(response.headers['set-cookie']) ? response.headers['set-cookie'][0].split(';')[0] : ''; }
function waitForServer() {
  const started = Date.now();
  return new Promise((resolve, reject) => { const poll = () => request('/api/health').then((r) => r.status === 200 ? resolve() : retry()).catch(retry); const retry = () => Date.now() - started > 10000 ? reject(Error('server readiness timeout')) : setTimeout(poll, 100); poll(); });
}
async function main() {
  const originalJson = fs.readFileSync(DB_FILE);
  const db = await mysql.createConnection(DATABASE_URL);
  let server;
  try {
    const tables = ['payment_events','subscriptions','payment_transactions','payment_intents','file_records','password_reset_records','audit_events','server_sessions','tenant_memberships','user_roles','credentials','users','role_permissions','permissions','schools','districts','regions','tenants','roles','schema_migrations'];
    await db.query('SET FOREIGN_KEY_CHECKS=0');
    for (const table of tables) await db.query(`TRUNCATE TABLE ${table}`).catch(() => {});
    await db.query('SET FOREIGN_KEY_CHECKS=1');

    const migrationEnv = { ...process.env, EDUTRACK_DATABASE_URL: DATABASE_URL };
    const first = spawnSync(process.execPath, ['scripts/migrate-db.js'], { cwd: ROOT, env: migrationEnv, encoding: 'utf8' });
    assert.equal(first.status, 0, first.stderr || first.stdout);
    const second = spawnSync(process.execPath, ['scripts/migrate-db.js'], { cwd: ROOT, env: migrationEnv, encoding: 'utf8' });
    assert.equal(second.status, 0, second.stderr || second.stdout);
    const [migrationRows] = await db.query('SELECT version,name FROM schema_migrations');
    assert.deepEqual(migrationRows.map((row) => row.version), [8]);
    const required = ['users','credentials','roles','permissions','role_permissions','user_roles','tenants','tenant_memberships','regions','districts','schools','server_sessions','audit_events','payment_intents','payment_transactions','subscriptions','payment_events','password_reset_records','file_records'];
    for (const table of required) { const [rows] = await db.query(`SELECT COUNT(*) AS count FROM ${table}`); const expected = table === 'roles' ? 9 : table === 'permissions' ? 23 : table === 'role_permissions' ? 109 : 0; assert.equal(Number(rows[0].count), expected, `${table} should initialize deterministically`); }

    const provision = spawnSync(process.execPath, ['server.js', '--provision-dev'], { cwd: ROOT, env: { ...migrationEnv, NODE_ENV: 'development', EDUTRACK_ENABLE_DEV_ACCESS: 'true', EDUTRACK_DEV_EMAIL: DEV.email, EDUTRACK_DEV_PASSWORD: DEV.password, EDUTRACK_DEV_ACCESS_CODE: DEV.accessCode }, encoding: 'utf8' });
    assert.equal(provision.status, 0, provision.stderr || provision.stdout);
    const [identityRows] = await db.query('SELECT u.*, c.password_hash, c.access_code_hash, r.name AS role_name FROM users u JOIN credentials c ON c.user_id=u.id JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id WHERE u.email=?', [DEV.email]);
    assert.equal(identityRows.length, 1); assert.equal(identityRows[0].development_fixture, 1); assert.equal(identityRows[0].role_name, 'DEVELOPER_ROOT');
    assert.equal(identityRows[0].password_hash.includes(DEV.password), false); assert.equal(identityRows[0].access_code_hash.includes(DEV.accessCode), false);

    server = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: { ...migrationEnv, NODE_ENV: 'development', EDUTRACK_ENABLE_DEV_ACCESS: 'true', PORT: String(PORT) }, stdio: ['ignore','pipe','pipe'] });
    await waitForServer();
    const invalid = await request('/api/auth/login', { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({ email:DEV.email, password:'bad', accessCode:'bad' }) });
    const unknown = await request('/api/auth/login', { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({ email:'unknown@example.invalid', password:'bad', accessCode:'bad' }) });
    assert.equal(invalid.status, 401); assert.deepEqual(invalid.body, unknown.body);
    const login = await request('/api/auth/login', { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(DEV) });
    assert.equal(login.status, 200); assert.equal(login.body.authenticated, true); assert.equal(login.body.user.role, 'DEVELOPER_ROOT');
    const sessionCookie = cookieFrom(login); assert.match(sessionCookie, /^edutrack_session=/); assert.equal(sessionCookie.includes(login.body.user.id), false);
    const [sessionRows] = await db.query('SELECT * FROM server_sessions'); assert.equal(sessionRows.length, 1); assert.equal(sessionRows[0].token_hash.length, 64); assert.equal(sessionRows[0].token_hash.includes(sessionCookie.split('=')[1]), false);
    const session = await request('/api/auth/session', { headers:{cookie:sessionCookie} }); assert.equal(session.status, 200); assert.equal(session.body.user.email, DEV.email);
    const protectedResponse = await request('/api/admin/summary', { headers:{cookie:sessionCookie} }); assert.equal(protectedResponse.status, 200);
    const logout = await request('/api/auth/logout', { method:'POST', headers:{cookie:sessionCookie, origin:BASE} }); assert.equal(logout.status, 200);
    assert.equal((await request('/api/auth/session', { headers:{cookie:sessionCookie} })).status, 401);
    const [revokedRows] = await db.query('SELECT revoked_at FROM server_sessions WHERE token_hash=?', [sessionRows[0].token_hash]); assert.equal(revokedRows.length, 1); assert.ok(revokedRows[0].revoked_at);
    const [auditRows] = await db.query("SELECT event_type FROM audit_events WHERE event_type IN ('LOGIN_SUCCESS','LOGOUT')"); assert.deepEqual(new Set(auditRows.map((row) => row.event_type)), new Set(['LOGIN_SUCCESS','LOGOUT']));
    console.log('Part 19 database foundation suite passed.');
  } finally {
    if (server && !server.killed) server.kill('SIGTERM');
    await db.query('SET FOREIGN_KEY_CHECKS=0');
    for (const table of ['audit_events','server_sessions','user_roles','credentials','users']) await db.query(`TRUNCATE TABLE ${table}`).catch(() => {});
    await db.query('SET FOREIGN_KEY_CHECKS=1'); await db.end(); fs.writeFileSync(DB_FILE, originalJson);
  }
}
main().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
