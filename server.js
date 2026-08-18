#!/usr/bin/env node
'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const DB_FILE = path.join(DATA_DIR, 'edutrack.json');
const PORT = Number(process.env.PORT || 3000);
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const COOKIE_NAME = 'edutrack_session';

function ensureData() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) {
    saveDb({ version: 1, users: [], schools: [], staff: [], subscriptions: [], transactions: [], sessions: [], audit: [] });
  }
}
function loadDb() {
  ensureData();
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}
function saveDb(db) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(tmp, DB_FILE);
}
function id(prefix) { return `${prefix}_${crypto.randomBytes(12).toString('hex')}`; }
function hashPassword(value, salt = crypto.randomBytes(16).toString('hex')) {
  return `${salt}:${crypto.scryptSync(String(value), salt, 64).toString('hex')}`;
}
function verifyPassword(value, encoded) {
  try {
    const [salt, digest] = String(encoded).split(':');
    const actual = crypto.scryptSync(String(value), salt, 64);
    const expected = Buffer.from(digest, 'hex');
    return expected.length === actual.length && crypto.timingSafeEqual(actual, expected);
  } catch { return false; }
}
function requiredEnv(names) {
  const out = {};
  for (const name of names) {
    if (!process.env[name]) throw new Error(`Missing required bootstrap environment variable: ${name}`);
    out[name] = process.env[name];
  }
  return out;
}
function provisionBootstrapAccounts() {
  const env = requiredEnv([
    'EDUTRACK_DEVELOPER_EMAIL', 'EDUTRACK_DEVELOPER_PASSWORD', 'EDUTRACK_DEVELOPER_ACCESS_CODE',
    'EDUTRACK_SUPER_ADMIN_EMAIL', 'EDUTRACK_SUPER_ADMIN_PASSWORD', 'EDUTRACK_SUPER_ADMIN_ACCESS_CODE'
  ]);
  const db = loadDb();
  const now = new Date().toISOString();
  const accounts = [
    { email: env.EDUTRACK_DEVELOPER_EMAIL, password: env.EDUTRACK_DEVELOPER_PASSWORD, accessCode: env.EDUTRACK_DEVELOPER_ACCESS_CODE, role: 'DEVELOPER_ROOT', hierarchy: 'ALL', scope: ['NATIONAL','REGIONAL','DISTRICT','SCHOOL'] },
    { email: env.EDUTRACK_SUPER_ADMIN_EMAIL, password: env.EDUTRACK_SUPER_ADMIN_PASSWORD, accessCode: env.EDUTRACK_SUPER_ADMIN_ACCESS_CODE, role: 'SUPER_ADMIN', hierarchy: 'ROOT', scope: ['ROOT'] }
  ];
  for (const account of accounts) {
    const existing = db.users.find(u => u.email.toLowerCase() === account.email.toLowerCase());
    const record = { id: existing?.id || id('usr'), email: account.email, passwordHash: hashPassword(account.password), accessCodeHash: hashPassword(account.accessCode), role: account.role, hierarchy: account.hierarchy, scope: account.scope, active: true, updatedAt: now, createdAt: existing?.createdAt || now };
    if (existing) Object.assign(existing, record); else db.users.push(record);
  }
  saveDb(db);
  console.log('Bootstrap accounts provisioned server-side. Plaintext credentials were not stored.');
}
function resetRegisteredData() {
  const db = loadDb();
  const privileged = db.users.filter(u => ['DEVELOPER_ROOT','SUPER_ADMIN'].includes(u.role));
  db.users = privileged;
  db.schools = []; db.staff = []; db.subscriptions = []; db.transactions = []; db.sessions = [];
  db.audit.push({ id: id('audit'), action: 'REGISTERED_DATA_RESET', at: new Date().toISOString() });
  saveDb(db);
  console.log('Registered schools, staff, and dependent application data reset. Privileged accounts retained.');
}
function parseCookies(req) {
  return Object.fromEntries(String(req.headers.cookie || '').split(';').filter(Boolean).map(v => { const i = v.indexOf('='); return [v.slice(0, i).trim(), decodeURIComponent(v.slice(i + 1))]; }));
}
function authUser(req, db) {
  const token = parseCookies(req)[COOKIE_NAME];
  if (!token) return null;
  const session = db.sessions.find(s => s.token === token && new Date(s.expiresAt) > new Date());
  if (!session) return null;
  const user = db.users.find(u => u.id === session.userId && u.active);
  return user ? { user, session } : null;
}
function json(res, status, body, headers = {}) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers }); res.end(JSON.stringify(body)); }
function body(req) { return new Promise((resolve, reject) => { let raw = ''; req.on('data', c => { raw += c; if (raw.length > 1e6) req.destroy(); }); req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch { reject(new Error('Invalid JSON')); } }); req.on('error', reject); }); }
function publicUser(user) { return { id: user.id, email: user.email, role: user.role, hierarchy: user.hierarchy, scope: user.scope }; }
function roleContext(user) { return { role: user.role, hierarchy: user.hierarchy, scope: user.scope, dashboard: user.role === 'DEVELOPER_ROOT' ? 'developer-root' : user.role === 'SUPER_ADMIN' ? 'super-admin' : 'school' }; }
function dashboardAllowed(user, dashboard) { return user.role === 'DEVELOPER_ROOT' || (user.role === 'SUPER_ADMIN' && dashboard === 'super-admin'); }

async function handler(req, res) {
  const db = loadDb();
  if (req.method === 'GET' && req.url === '/api/health') return json(res, 200, { ok: true });
  if (req.method === 'POST' && req.url === '/api/auth/login') {
    let input; try { input = await body(req); } catch { return json(res, 400, { error: 'Invalid request' }); }
    const identifier = String(input.email || input.staffId || '').trim().toLowerCase();
    const password = String(input.password || input.pin || '');
    const accessCode = String(input.accessCode || input.schoolAccessCode || input.pin || '');
    const user = db.users.find(u => u.active && u.email.toLowerCase() === identifier);
    if (!user || !verifyPassword(password, user.passwordHash) || !verifyPassword(accessCode, user.accessCodeHash)) {
      db.audit.push({ id: id('audit'), action: 'LOGIN_REJECTED', at: new Date().toISOString() }); saveDb(db);
      return json(res, 401, { error: 'Authentication failed' });
    }
    const token = crypto.randomBytes(32).toString('base64url');
    db.sessions = db.sessions.filter(s => new Date(s.expiresAt) > new Date());
    db.sessions.push({ token, userId: user.id, createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString() });
    db.audit.push({ id: id('audit'), userId: user.id, action: 'LOGIN_SUCCESS', at: new Date().toISOString() }); saveDb(db);
    return json(res, 200, { user: publicUser(user), authorization: roleContext(user) }, { 'Set-Cookie': `${COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL_MS / 1000}` });
  }
  if (req.method === 'GET' && req.url === '/api/auth/session') {
    const auth = authUser(req, db); if (!auth) return json(res, 401, { error: 'Authentication required' });
    return json(res, 200, { user: publicUser(auth.user), authorization: roleContext(auth.user) });
  }
  if (req.method === 'POST' && req.url === '/api/auth/logout') {
    const token = parseCookies(req)[COOKIE_NAME]; db.sessions = db.sessions.filter(s => s.token !== token); saveDb(db);
    return json(res, 200, { ok: true }, { 'Set-Cookie': `${COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0` });
  }
  if (req.method === 'GET' && req.url === '/api/admin/summary') {
    const auth = authUser(req, db); if (!auth) return json(res, 401, { error: 'Authentication required' });
    if (!dashboardAllowed(auth.user, auth.user.role === 'DEVELOPER_ROOT' ? 'developer-root' : 'super-admin')) return json(res, 403, { error: 'Permission denied' });
    return json(res, 200, { schools: db.schools.length, staff: db.staff.length, students: 0, transactions: db.transactions.length, subscriptions: db.subscriptions.length });
  }
  if (req.method === 'GET' && req.url === '/api/admin/authorized-hierarchies') {
    const auth = authUser(req, db); if (!auth) return json(res, 401, { error: 'Authentication required' });
    if (auth.user.role !== 'DEVELOPER_ROOT') return json(res, 403, { error: 'Permission denied' });
    return json(res, 200, { role: auth.user.role, scope: auth.user.scope });
  }
  if (req.method === 'GET') {
    const file = req.url === '/' ? '/index.html' : req.url.split('?')[0];
    const safe = path.normalize(path.join(ROOT, file));
    if (!safe.startsWith(ROOT) || !fs.existsSync(safe) || fs.statSync(safe).isDirectory()) return json(res, 404, { error: 'Not found' });
    const ext = path.extname(safe); const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript' };
    res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' }); return fs.createReadStream(safe).pipe(res);
  }
  json(res, 404, { error: 'Not found' });
}

ensureData();
if (process.argv.includes('--provision')) provisionBootstrapAccounts();
else if (process.argv.includes('--reset')) resetRegisteredData();
else http.createServer((req, res) => handler(req, res).catch(() => json(res, 500, { error: 'Internal server error' }))).listen(PORT, () => console.log(`EduTrack server listening on port ${PORT}`));
