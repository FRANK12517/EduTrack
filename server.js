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
const RESET_TTL_MS = 15 * 60 * 1000;
const COOKIE_NAME = 'edutrack_session';
const CSRF_HEADER = 'x-csrf-token';
const GENERIC_AUTH_ERROR = 'Authentication failed';
const GENERIC_RESET_MESSAGE = 'If the account is eligible, reset instructions will be sent.';
const LOGIN_LIMIT = { windowMs: 15 * 60 * 1000, maxFailures: 8, blockMs: 15 * 60 * 1000 };
const RESET_LIMIT = { windowMs: 15 * 60 * 1000, maxRequests: 5, blockMs: 15 * 60 * 1000 };
const requestLimits = new Map();

function ensureData() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) saveDb({ version: 2, users: [], schools: [], staff: [], subscriptions: [], transactions: [], sessions: [], passwordResets: [], audit: [] });
}
function loadDb() {
  ensureData();
  const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  db.users ||= []; db.schools ||= []; db.staff ||= []; db.subscriptions ||= []; db.transactions ||= [];
  db.sessions ||= []; db.passwordResets ||= []; db.audit ||= [];
  return db;
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
    if (!salt || !digest) return false;
    const actual = crypto.scryptSync(String(value), salt, 64);
    const expected = Buffer.from(digest, 'hex');
    return expected.length === actual.length && crypto.timingSafeEqual(actual, expected);
  } catch { return false; }
}
function tokenHash(value) { return crypto.createHash('sha256').update(String(value)).digest('hex'); }
function randomToken(bytes = 32) { return crypto.randomBytes(bytes).toString('base64url'); }
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
    const record = { id: existing?.id || id('usr'), email: account.email, passwordHash: hashPassword(account.password), accessCodeHash: hashPassword(account.accessCode), role: account.role, hierarchy: account.hierarchy, scope: account.scope, active: true, failedLoginCount: 0, lockedUntil: null, updatedAt: now, createdAt: existing?.createdAt || now };
    if (existing) Object.assign(existing, record); else db.users.push(record);
  }
  saveDb(db);
  console.log('Bootstrap accounts provisioned server-side. Plaintext credentials were not stored.');
}
function resetRegisteredData() {
  const db = loadDb();
  const privileged = db.users.filter(u => ['DEVELOPER_ROOT','SUPER_ADMIN'].includes(u.role));
  db.users = privileged; db.schools = []; db.staff = []; db.subscriptions = []; db.transactions = []; db.sessions = []; db.passwordResets = [];
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
  const hash = tokenHash(token);
  const session = db.sessions.find(s => s.tokenHash === hash && new Date(s.expiresAt) > new Date());
  if (!session) return null;
  const user = db.users.find(u => u.id === session.userId && u.active);
  return user ? { user, session } : null;
}
function json(res, status, body, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'same-origin', ...headers });
  res.end(JSON.stringify(body));
}
function body(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', c => { raw += c; if (raw.length > 1e6) { req.destroy(); reject(new Error('Payload too large')); } });
    req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch { reject(new Error('Invalid JSON')); } });
    req.on('error', reject);
  });
}
function publicUser(user) { return { id: user.id, email: user.email, role: user.role, hierarchy: user.hierarchy, scope: user.scope }; }
function roleContext(user) { return { role: user.role, hierarchy: user.hierarchy, scope: user.scope, dashboard: user.role === 'DEVELOPER_ROOT' ? 'developer-root' : user.role === 'SUPER_ADMIN' ? 'super-admin' : 'school' }; }
function dashboardAllowed(user, dashboard) { return user.role === 'DEVELOPER_ROOT' || (user.role === 'SUPER_ADMIN' && dashboard === 'super-admin'); }
function clientIp(req) { return String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim(); }
function limitKey(req, suffix) { return `${clientIp(req)}:${suffix}`; }
function checkLimit(key, config) {
  const now = Date.now();
  const entry = requestLimits.get(key) || { failures: 0, firstAt: now, blockedUntil: 0 };
  if (entry.blockedUntil > now) return { blocked: true, retryAfter: Math.ceil((entry.blockedUntil - now) / 1000) };
  if (now - entry.firstAt > config.windowMs) { entry.failures = 0; entry.firstAt = now; entry.blockedUntil = 0; }
  return { blocked: false, entry };
}
function registerFailure(key, config) {
  const state = checkLimit(key, config); state.entry.failures += 1;
  if (state.entry.failures >= (config.maxFailures || config.maxRequests)) state.entry.blockedUntil = Date.now() + config.blockMs;
  requestLimits.set(key, state.entry); return state.entry;
}
function clearLimit(key) { requestLimits.delete(key); }
function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try { const expected = `${process.env.NODE_ENV === 'production' ? 'https' : 'http'}://${req.headers.host}`; return origin === expected; } catch { return false; }
}
function requireSameOrigin(req, res) { if (!sameOrigin(req)) { json(res, 403, { error: 'Request origin rejected' }); return false; } return true; }
function cookie(name, value, maxAge) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${name}=${encodeURIComponent(value)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${secure}`;
}
function invalidateSessions(db, userId) { db.sessions = db.sessions.filter(s => s.userId !== userId); }
function cleanup(db) {
  const now = Date.now();
  db.sessions = db.sessions.filter(s => new Date(s.expiresAt).getTime() > now);
  db.passwordResets = db.passwordResets.filter(r => !r.usedAt && new Date(r.expiresAt).getTime() > now);
}
function resetRecord(db, token) { return db.passwordResets.find(r => r.tokenHash === tokenHash(token) && !r.usedAt && new Date(r.expiresAt) > new Date()); }

async function handler(req, res) {
  const db = loadDb(); cleanup(db);
  if (req.method === 'GET' && req.url === '/api/health') return json(res, 200, { ok: true });
  if (req.method === 'POST' && req.url === '/api/auth/login') {
    let input; try { input = await body(req); } catch { return json(res, 400, { error: 'Invalid request' }); }
    const identifier = String(input.email || input.staffId || '').trim().toLowerCase();
    const password = String(input.password || input.pin || '');
    const accessCode = String(input.accessCode || input.schoolAccessCode || input.pin || '');
    const ipState = checkLimit(limitKey(req, 'login'), LOGIN_LIMIT);
    const accountKey = limitKey(req, `account:${identifier || 'unknown'}`);
    const accountState = checkLimit(accountKey, LOGIN_LIMIT);
    if (ipState.blocked || accountState.blocked) return json(res, 429, { error: GENERIC_AUTH_ERROR, retryAfter: Math.max(ipState.retryAfter || 0, accountState.retryAfter || 0) }, { 'Retry-After': String(Math.max(ipState.retryAfter || 1, accountState.retryAfter || 1)) });
    const user = db.users.find(u => u.active && u.email.toLowerCase() === identifier);
    const locked = user && user.lockedUntil && new Date(user.lockedUntil) > new Date();
    const valid = !!user && !locked && verifyPassword(password, user.passwordHash) && verifyPassword(accessCode, user.accessCodeHash);
    if (!valid) {
      registerFailure(limitKey(req, 'login'), LOGIN_LIMIT); registerFailure(accountKey, LOGIN_LIMIT);
      if (user) { user.failedLoginCount = (user.failedLoginCount || 0) + 1; if (user.failedLoginCount >= LOGIN_LIMIT.maxFailures) user.lockedUntil = new Date(Date.now() + LOGIN_LIMIT.blockMs).toISOString(); }
      db.audit.push({ id: id('audit'), action: 'LOGIN_REJECTED', at: new Date().toISOString(), ip: clientIp(req) }); saveDb(db);
      return json(res, 401, { error: GENERIC_AUTH_ERROR });
    }
    clearLimit(limitKey(req, 'login')); clearLimit(accountKey); user.failedLoginCount = 0; user.lockedUntil = null;
    const rawToken = randomToken(); const now = new Date();
    db.sessions.push({ id: id('ses'), tokenHash: tokenHash(rawToken), userId: user.id, createdAt: now.toISOString(), expiresAt: new Date(now.getTime() + SESSION_TTL_MS).toISOString() });
    db.audit.push({ id: id('audit'), userId: user.id, action: 'LOGIN_SUCCESS', at: now.toISOString(), ip: clientIp(req) }); saveDb(db);
    return json(res, 200, { user: publicUser(user), authorization: roleContext(user) }, { 'Set-Cookie': cookie(COOKIE_NAME, rawToken, SESSION_TTL_MS / 1000) });
  }
  if (req.method === 'GET' && req.url === '/api/auth/session') {
    const auth = authUser(req, db); if (!auth) return json(res, 401, { error: 'Authentication required' });
    return json(res, 200, { user: publicUser(auth.user), authorization: roleContext(auth.user) });
  }
  if (req.method === 'GET' && req.url === '/api/auth/csrf') {
    const auth = authUser(req, db); if (!auth) return json(res, 401, { error: 'Authentication required' });
    const token = randomToken(24); auth.session.csrfTokenHash = tokenHash(token); saveDb(db); return json(res, 200, { token });
  }
  if (req.method === 'POST' && req.url === '/api/auth/logout') {
    if (!requireSameOrigin(req, res)) return;
    const token = parseCookies(req)[COOKIE_NAME]; db.sessions = db.sessions.filter(s => s.tokenHash !== tokenHash(token)); saveDb(db);
    return json(res, 200, { ok: true }, { 'Set-Cookie': cookie(COOKIE_NAME, '', 0) });
  }
  if (req.method === 'POST' && req.url === '/api/auth/password-reset/request') {
    if (!requireSameOrigin(req, res)) return;
    const key = limitKey(req, 'password-reset'); const state = checkLimit(key, RESET_LIMIT);
    if (state.blocked) return json(res, 429, { message: GENERIC_RESET_MESSAGE }, { 'Retry-After': String(state.retryAfter) });
    let input; try { input = await body(req); } catch { return json(res, 400, { message: GENERIC_RESET_MESSAGE }); }
    registerFailure(key, RESET_LIMIT);
    const identifier = String(input.email || '').trim().toLowerCase(); const user = db.users.find(u => u.active && u.email.toLowerCase() === identifier);
    if (user) { const raw = randomToken(); db.passwordResets.push({ id: id('rst'), userId: user.id, tokenHash: tokenHash(raw), createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + RESET_TTL_MS).toISOString(), usedAt: null }); }
    saveDb(db); return json(res, 202, { message: GENERIC_RESET_MESSAGE });
  }
  if (req.method === 'POST' && req.url === '/api/auth/password-reset/confirm') {
    if (!requireSameOrigin(req, res)) return;
    let input; try { input = await body(req); } catch { return json(res, 400, { error: 'Invalid request' }); }
    const record = resetRecord(db, String(input.token || '')); const password = String(input.password || '');
    if (!record || password.length < 12) return json(res, 400, { error: 'Password reset could not be completed' });
    const user = db.users.find(u => u.id === record.userId && u.active); if (!user) return json(res, 400, { error: 'Password reset could not be completed' });
    user.passwordHash = hashPassword(password); user.failedLoginCount = 0; user.lockedUntil = null; record.usedAt = new Date().toISOString(); invalidateSessions(db, user.id); db.audit.push({ id: id('audit'), userId: user.id, action: 'PASSWORD_RESET_COMPLETED', at: new Date().toISOString() }); saveDb(db);
    return json(res, 200, { ok: true });
  }
  if (req.method === 'POST' && req.url === '/api/auth/password-change') {
    if (!requireSameOrigin(req, res)) return;
    const auth = authUser(req, db); if (!auth) return json(res, 401, { error: GENERIC_AUTH_ERROR });
    let input; try { input = await body(req); } catch { return json(res, 400, { error: 'Invalid request' }); }
    if (!verifyPassword(String(input.currentPassword || ''), auth.user.passwordHash) || String(input.newPassword || '').length < 12) return json(res, 400, { error: 'Password change could not be completed' });
    auth.user.passwordHash = hashPassword(String(input.newPassword)); invalidateSessions(db, auth.user.id); db.audit.push({ id: id('audit'), userId: auth.user.id, action: 'PASSWORD_CHANGED', at: new Date().toISOString() }); saveDb(db);
    return json(res, 200, { ok: true }, { 'Set-Cookie': cookie(COOKIE_NAME, '', 0) });
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
    const file = req.url === '/' ? '/index.html' : req.url.split('?')[0]; const safe = path.normalize(path.join(ROOT, file));
    if (!safe.startsWith(ROOT) || !fs.existsSync(safe) || fs.statSync(safe).isDirectory()) return json(res, 404, { error: 'Not found' });
    const ext = path.extname(safe); const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript' };
    res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'same-origin', 'Content-Security-Policy': "default-src 'self' 'unsafe-inline' https: data:; frame-ancestors 'none'" }); return fs.createReadStream(safe).pipe(res);
  }
  json(res, 404, { error: 'Not found' });
}

ensureData();
if (process.argv.includes('--provision')) provisionBootstrapAccounts();
else if (process.argv.includes('--reset')) resetRegisteredData();
else http.createServer((req, res) => handler(req, res).catch(() => json(res, 500, { error: 'Internal server error' }))).listen(PORT, () => console.log(`EduTrack server listening on port ${PORT}`));
