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
const MAX_BODY_BYTES = 1024 * 1024;
const MAX_URL_BYTES = 8192;
const ALLOWED_METHODS = new Set(['GET', 'POST', 'OPTIONS']);
const SAFE_PUBLIC_FILES = new Set(['index.html', 'privileged-auth.js']);
const ALLOWED_ORIGINS = new Set(String(process.env.EDUTRACK_ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean));
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const UPLOAD_LIMITS = Object.freeze({ passport: 5 * 1024 * 1024, profile: 5 * 1024 * 1024, document: 15 * 1024 * 1024, report: 25 * 1024 * 1024 });
const PAYMENT_PLANS = Object.freeze(parsePaymentPlans());
function parsePaymentPlans() {
  try {
    const configured = process.env.EDUTRACK_PAYMENT_PLANS ? JSON.parse(process.env.EDUTRACK_PAYMENT_PLANS) : null;
    if (configured && typeof configured === 'object') return configured;
  } catch {}
  return {};
}
const requestLimits = new Map();
const aiUsage = new Map();
const AI_ROLE_LIMITS = Object.freeze({ DEVELOPER_ROOT: 60, SUPER_ADMIN: 30, NATIONAL: 20, REGIONAL: 15, DISTRICT: 12, SCHOOL: 10, TEACHER: 8, PARENT: 5, STUDENT: 5 });
const AI_MAX_PROMPT_CHARS = 12000;
const AI_MAX_CONTEXT_ITEMS = 5;
const PROMPT_INJECTION_PATTERNS = Object.freeze([/ignore\s+(all|any|the|previous)\s+instructions/i, /reveal\s+(the\s+)?system\s+prompt/i, /act\s+as\s+(an?\s+)?administrator/i, /disable\s+security/i, /call\s+(this\s+)?function\s+without\s+authorization/i, /override\s+(system|developer)\s+instructions/i]);

function ensureData() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) saveDb({ version: 3, users: [], schools: [], staff: [], subscriptions: [], transactions: [], paymentIntents: [], paymentEvents: [], files: [], sessions: [], passwordResets: [], audit: [] });
}
function loadDb() {
  ensureData();
  const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  db.users ||= []; db.schools ||= []; db.staff ||= []; db.subscriptions ||= []; db.transactions ||= [];
  db.paymentIntents ||= []; db.paymentEvents ||= []; db.files ||= []; db.sessions ||= []; db.passwordResets ||= []; db.audit ||= [];
  return db;
}
function saveDb(db) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(UPLOAD_DIR, { recursive: true, mode: 0o700 });
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
  db.users = privileged; db.schools = []; db.staff = []; db.subscriptions = []; db.transactions = []; db.paymentIntents = []; db.paymentEvents = []; db.files = []; db.sessions = []; db.passwordResets = [];
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
function securityHeaders() {
  const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'same-origin', 'Permissions-Policy': 'camera=(), microphone=(), geolocation=()', 'Content-Security-Policy': "default-src 'self' 'unsafe-inline' https: data:; frame-ancestors 'none'" };
  if (process.env.NODE_ENV === 'production') headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains';
  return headers;
}
function json(res, status, body, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...securityHeaders(), ...headers });
  res.end(JSON.stringify(body));
}
function rawBody(req, limit = MAX_BODY_BYTES) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', c => { raw += c; if (Buffer.byteLength(raw) > limit) { reject(new Error('Payload too large')); req.destroy(); } });
    req.on('end', () => resolve(raw));
    req.on('error', reject);
  });
}
async function body(req, limit = MAX_BODY_BYTES) {
  const raw = await rawBody(req, limit);
  try { return raw ? JSON.parse(raw) : {}; } catch { throw new Error('Invalid JSON'); }
}
function publicUser(user) { return { id: user.id, email: user.email, role: user.role, hierarchy: user.hierarchy, scope: user.scope }; }
function roleContext(user) { return { role: user.role, hierarchy: user.hierarchy, scope: user.scope, dashboard: user.role === 'DEVELOPER_ROOT' ? 'developer-root' : user.role === 'SUPER_ADMIN' ? 'super-admin' : 'school' }; }
function dashboardAllowed(user, dashboard) {
  if (!user || !user.active) return false;
  if (user.role === 'DEVELOPER_ROOT') return ['developer-root', 'super-admin'].includes(dashboard);
  return user.role === 'SUPER_ADMIN' && dashboard === 'super-admin';
}
function validateText(value, { required = false, max = 200, pattern = null } = {}) {
  if (value === undefined || value === null || value === '') return required ? null : '';
  const text = String(value).trim();
  if (!text || text.length > max || (pattern && !pattern.test(text))) return null;
  return text;
}
function correlationId(req) { return req.correlationId || (req.correlationId = randomToken(16)); }
function auditSecurityEvent(db, action, req, extra = {}) {
  const safe = { id: id('audit'), action, severity: extra.severity || 'medium', at: new Date().toISOString(), correlationId: correlationId(req), ip: clientIp(req), userAgent: String(req.headers['user-agent'] || '').slice(0, 300), ...extra };
  delete safe.password; delete safe.token; delete safe.secret; delete safe.apiKey; delete safe.contentBase64; delete safe.prompt;
  db.audit.push(safe);
}
function aiQuotaState(user) {
  const key = user.id; const now = Date.now(); const existing = aiUsage.get(key);
  if (!existing || now - existing.startedAt >= 60 * 60 * 1000) { const state = { startedAt: now, count: 0 }; aiUsage.set(key, state); return state; }
  return existing;
}
function consumeAiQuota(user) {
  const state = aiQuotaState(user); const limit = AI_ROLE_LIMITS[user.role] || 5;
  if (state.count >= limit) return { allowed: false, limit };
  state.count += 1; return { allowed: true, limit };
}
function containsPromptInjection(text) { return PROMPT_INJECTION_PATTERNS.some(pattern => pattern.test(String(text || ''))); }
function allowedOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return null;
  if (ALLOWED_ORIGINS.has(origin)) return origin;
  if (process.env.NODE_ENV !== 'production') {
    try { const parsed = new URL(origin); if (['http:', 'https:'].includes(parsed.protocol) && ['localhost', '127.0.0.1'].includes(parsed.hostname)) return origin; } catch {}
  }
  return null;
}
function applyCors(req, res) {
  const origin = allowedOrigin(req);
  if (req.headers.origin && !origin) return false;
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-CSRF-Token');
  }
  return true;
}
function authorize(req, res, db, { roles = [], dashboard = null } = {}) {
  const auth = authUser(req, db);
  if (!auth) { auditSecurityEvent(db, 'UNAUTHORIZED_API_ACCESS', req, { endpoint: req.url }); saveDb(db); json(res, 401, { error: 'Authentication required' }); return null; }
  if (!auth.user.active || (roles.length && !roles.includes(auth.user.role)) || (dashboard && !dashboardAllowed(auth.user, dashboard))) {
    auditSecurityEvent(db, 'FORBIDDEN_API_ACCESS', req, { userId: auth.user.id, endpoint: req.url, role: auth.user.role }); saveDb(db); json(res, 403, { error: 'Permission denied' }); return null;
  }
  return auth;
}
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
function parseDataFile(input) {
  const value = validateText(input, { required: true, max: 40 * 1024 * 1024 });
  if (!value || !value.startsWith('data:')) return null;
  const match = value.match(/^data:([^;]+);base64,([A-Za-z0-9+/=]+)$/);
  if (!match) return null;
  try { return { declaredMime: match[1].toLowerCase(), buffer: Buffer.from(match[2], 'base64') }; } catch { return null; }
}
function inspectUpload(input) {
  const category = validateText(input.category, { required: true, max: 20, pattern: /^(passport|profile|document|report)$/ });
  const filename = validateText(input.filename, { required: true, max: 180, pattern: /^[^\\/\\\\\\0]+$/ });
  const parsed = parseDataFile(input.contentBase64);
  if (!category || !filename || !parsed) return { error: 'invalid_metadata' };
  const ext = path.extname(filename).toLowerCase();
  const signatures = [
    { mime: 'image/jpeg', ext: '.jpg', ok: parsed.buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])) },
    { mime: 'image/png', ext: '.png', ok: parsed.buffer.subarray(0, 8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])) },
    { mime: 'image/webp', ext: '.webp', ok: parsed.buffer.subarray(0, 4).toString() === 'RIFF' && parsed.buffer.subarray(8, 12).toString() === 'WEBP' },
    { mime: 'application/pdf', ext: '.pdf', ok: parsed.buffer.subarray(0, 5).toString() === '%PDF-' }
  ];
  const detected = signatures.find(signature => signature.ok);
  const allowed = category === 'passport' || category === 'profile' ? signatures.slice(0, 3) : signatures;
  if (!detected || !allowed.some(signature => signature.mime === detected.mime) || parsed.declaredMime !== detected.mime || ext !== detected.ext) return { error: 'file_type_mismatch' };
  const limit = UPLOAD_LIMITS[category];
  if (!limit || parsed.buffer.length === 0 || parsed.buffer.length > limit) return { error: 'file_too_large_or_empty' };
  return { category, mimeType: detected.mime, extension: detected.ext, buffer: parsed.buffer };
}
function storePrivateFile(file, owner) {
  const storageName = `${randomToken(24)}${file.extension}`;
  const target = path.join(UPLOAD_DIR, storageName);
  fs.writeFileSync(target, file.buffer, { mode: 0o600, flag: 'wx' });
  return { id: id('file'), storageName, originalName: path.basename(file.originalName || 'upload'), mimeType: file.mimeType, size: file.buffer.length, category: file.category, ownerUserId: owner.user.id, schoolId: owner.user.schoolId || null, createdAt: new Date().toISOString() };
}
function planFor(planId) {
  const plan = PAYMENT_PLANS[planId];
  if (!plan || !Number.isInteger(plan.amount) || plan.amount <= 0 || typeof plan.currency !== 'string' || !Number.isInteger(plan.durationDays) || plan.durationDays <= 0) return null;
  return { id: planId, amount: plan.amount, currency: plan.currency, durationDays: plan.durationDays };
}
function paymentRef(input) { return validateText(input, { required: true, max: 120, pattern: /^[A-Za-z0-9._-]+$/ }); }
function applyTrustedPayment(db, { reference, user, plan, amount, currency, eventId = null }) {
  if (db.transactions.some(tx => tx.reference === reference) || (eventId && db.paymentEvents.some(event => event.eventId === eventId))) return { duplicate: true };
  const now = new Date(); const subscription = db.subscriptions.find(s => s.userId === user.id && s.active);
  const start = subscription && new Date(subscription.expiresAt) > now ? new Date(subscription.expiresAt) : now;
  const expiresAt = new Date(start.getTime() + plan.durationDays * 86400000).toISOString();
  const transaction = { id: id('txn'), reference, userId: user.id, amount, currency, planId: plan.id, status: 'success', createdAt: now.toISOString(), eventId };
  db.transactions.push(transaction);
  if (subscription) Object.assign(subscription, { planId: plan.id, expiresAt, active: true, lastTransactionId: transaction.id });
  else db.subscriptions.push({ id: id('sub'), userId: user.id, planId: plan.id, active: true, startsAt: now.toISOString(), expiresAt, lastTransactionId: transaction.id });
  if (eventId) db.paymentEvents.push({ eventId, reference, processedAt: now.toISOString() });
  return { transaction, subscription: subscription || db.subscriptions.at(-1) };
}

async function handler(req, res) {
  const db = loadDb(); cleanup(db);
  res.setHeader('X-Request-ID', correlationId(req));
  if (Buffer.byteLength(String(req.url || '')) > MAX_URL_BYTES) return json(res, 414, { error: 'Request URI too long' });
  if (!ALLOWED_METHODS.has(req.method)) return json(res, 405, { error: 'Method not allowed' }, { Allow: 'GET, POST, OPTIONS' });
  if (!applyCors(req, res)) { auditSecurityEvent(db, 'CORS_REJECTED', req, { endpoint: req.url }); saveDb(db); return json(res, 403, { error: 'Origin not allowed' }); }
  if (req.method === 'OPTIONS') { res.writeHead(204, securityHeaders()); return res.end(); }
  if (req.method === 'GET' && req.url === '/api/health') return json(res, 200, { ok: true });
  if (req.method === 'POST' && req.url === '/api/auth/login') {
    let input; try { input = await body(req); } catch { return json(res, 400, { error: 'Invalid request' }); }
    const identifier = validateText(input.email || input.staffId, { required: true, max: 254, pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ });
    const password = validateText(input.password || input.pin, { required: true, max: 256 });
    const accessCode = validateText(input.accessCode || input.schoolAccessCode || input.pin, { required: true, max: 256 });
    if (!identifier || !password || !accessCode) return json(res, 400, { error: GENERIC_AUTH_ERROR });
    const ipState = checkLimit(limitKey(req, 'login'), LOGIN_LIMIT);
    const accountKey = limitKey(req, `account:${identifier || 'unknown'}`);
    const accountState = checkLimit(accountKey, LOGIN_LIMIT);
    if (ipState.blocked || accountState.blocked) return json(res, 429, { error: GENERIC_AUTH_ERROR, retryAfter: Math.max(ipState.retryAfter || 0, accountState.retryAfter || 0) }, { 'Retry-After': String(Math.max(ipState.retryAfter || 1, accountState.retryAfter || 1)) });
    const user = db.users.find(u => u.active && u.email.toLowerCase() === identifier);
    const locked = user && user.lockedUntil && new Date(user.lockedUntil) > new Date();
    const valid = !!user && !locked && verifyPassword(password, user.passwordHash) && verifyPassword(accessCode, user.accessCodeHash);
    if (!valid) {
      registerFailure(limitKey(req, 'login'), LOGIN_LIMIT); registerFailure(accountKey, LOGIN_LIMIT);
      if (user) { user.failedLoginCount = (user.failedLoginCount || 0) + 1; if (user.failedLoginCount >= LOGIN_LIMIT.maxFailures) { user.lockedUntil = new Date(Date.now() + LOGIN_LIMIT.blockMs).toISOString(); auditSecurityEvent(db, 'ACCOUNT_LOCKOUT', req, { userId: user.id, severity: 'high' }); } }
      auditSecurityEvent(db, 'LOGIN_REJECTED', req, { severity: 'medium' }); saveDb(db);
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
    const token = parseCookies(req)[COOKIE_NAME]; db.sessions = db.sessions.filter(s => s.tokenHash !== tokenHash(token)); auditSecurityEvent(db, 'LOGOUT', req, { result: 'success' }); saveDb(db);
    return json(res, 200, { ok: true }, { 'Set-Cookie': cookie(COOKIE_NAME, '', 0) });
  }
  if (req.method === 'POST' && req.url === '/api/auth/password-reset/request') {
    if (!requireSameOrigin(req, res)) return;
    const key = limitKey(req, 'password-reset'); const state = checkLimit(key, RESET_LIMIT);
    if (state.blocked) return json(res, 429, { message: GENERIC_RESET_MESSAGE }, { 'Retry-After': String(state.retryAfter) });
    let input; try { input = await body(req); } catch { return json(res, 400, { message: GENERIC_RESET_MESSAGE }); }
    registerFailure(key, RESET_LIMIT);
    const identifier = validateText(input.email, { required: true, max: 254, pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ }); const user = identifier && db.users.find(u => u.active && u.email.toLowerCase() === identifier);
    if (user) { const raw = randomToken(); db.passwordResets.push({ id: id('rst'), userId: user.id, tokenHash: tokenHash(raw), createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + RESET_TTL_MS).toISOString(), usedAt: null }); }
    saveDb(db); return json(res, 202, { message: GENERIC_RESET_MESSAGE });
  }
  if (req.method === 'POST' && req.url === '/api/auth/password-reset/confirm') {
    if (!requireSameOrigin(req, res)) return;
    let input; try { input = await body(req); } catch { return json(res, 400, { error: 'Invalid request' }); }
    const resetToken = validateText(input.token, { required: true, max: 512 }); const record = resetRecord(db, resetToken || ''); const password = validateText(input.password, { required: true, max: 256 }) || '';
    if (!record || password.length < 12) return json(res, 400, { error: 'Password reset could not be completed' });
    const user = db.users.find(u => u.id === record.userId && u.active); if (!user) return json(res, 400, { error: 'Password reset could not be completed' });
    user.passwordHash = hashPassword(password); user.failedLoginCount = 0; user.lockedUntil = null; record.usedAt = new Date().toISOString(); invalidateSessions(db, user.id); db.audit.push({ id: id('audit'), userId: user.id, action: 'PASSWORD_RESET_COMPLETED', at: new Date().toISOString() }); saveDb(db);
    return json(res, 200, { ok: true });
  }
  if (req.method === 'POST' && req.url === '/api/auth/password-change') {
    if (!requireSameOrigin(req, res)) return;
    const auth = authUser(req, db); if (!auth) return json(res, 401, { error: GENERIC_AUTH_ERROR });
    let input; try { input = await body(req); } catch { return json(res, 400, { error: 'Invalid request' }); }
    const currentPassword = validateText(input.currentPassword, { required: true, max: 256 }) || '';
    const newPassword = validateText(input.newPassword, { required: true, max: 256 }) || '';
    if (!verifyPassword(currentPassword, auth.user.passwordHash) || newPassword.length < 12) return json(res, 400, { error: 'Password change could not be completed' });
    auth.user.passwordHash = hashPassword(newPassword); invalidateSessions(db, auth.user.id); db.audit.push({ id: id('audit'), userId: auth.user.id, action: 'PASSWORD_CHANGED', at: new Date().toISOString() }); saveDb(db);
    return json(res, 200, { ok: true }, { 'Set-Cookie': cookie(COOKIE_NAME, '', 0) });
  }
  if (req.method === 'POST' && req.url === '/api/files/upload') {
    if (!requireSameOrigin(req, res)) return;
    const auth = authorize(req, res, db); if (!auth) return;
    let input; try { input = await body(req, Math.min(MAX_BODY_BYTES * 30, 30 * 1024 * 1024)); } catch { auditSecurityEvent(db, 'UPLOAD_REJECTED', req, { userId: auth.user.id, reason: 'payload_invalid' }); saveDb(db); return json(res, 400, { error: 'Upload rejected' }); }
    const inspected = inspectUpload(input); if (inspected.error) { auditSecurityEvent(db, 'UPLOAD_REJECTED', req, { userId: auth.user.id, category: input.category || null, reason: inspected.error }); saveDb(db); return json(res, 400, { error: 'Upload rejected' }); }
    inspected.originalName = path.basename(input.filename);
    const record = storePrivateFile(inspected, auth); db.files.push(record); auditSecurityEvent(db, 'UPLOAD_ACCEPTED', req, { userId: auth.user.id, fileId: record.id, category: record.category, size: record.size }); saveDb(db);
    return json(res, 201, { id: record.id, category: record.category, mimeType: record.mimeType, size: record.size });
  }
  if (req.method === 'GET' && /^\/api\/files\/[A-Za-z0-9_-]+$/.test(req.url)) {
    const auth = authorize(req, res, db); if (!auth) return;
    const fileId = req.url.slice('/api/files/'.length); const record = db.files.find(file => file.id === fileId);
    if (!record || (auth.user.role !== 'DEVELOPER_ROOT' && auth.user.role !== 'SUPER_ADMIN' && record.ownerUserId !== auth.user.id)) { auditSecurityEvent(db, 'FILE_ACCESS_DENIED', req, { userId: auth.user.id, fileId }); saveDb(db); return json(res, 404, { error: 'File not found' }); }
    const target = path.resolve(UPLOAD_DIR, record.storageName); if (path.dirname(target) !== path.resolve(UPLOAD_DIR) || !fs.existsSync(target)) return json(res, 404, { error: 'File not found' });
    res.writeHead(200, { 'Content-Type': record.mimeType, 'Content-Disposition': `attachment; filename="${record.id}${path.extname(record.storageName)}"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', ...securityHeaders() }); return fs.createReadStream(target).pipe(res);
  }
  if (req.method === 'POST' && req.url === '/api/payments/initialize') {
    if (!requireSameOrigin(req, res)) return;
    const auth = authorize(req, res, db); if (!auth) return;
    const idempotencyKey = validateText(req.headers['x-idempotency-key'], { max: 120, pattern: /^[A-Za-z0-9._-]+$/ });
    if (!idempotencyKey) return json(res, 400, { error: 'A valid idempotency key is required' });
    const existing = db.paymentIntents.find(intent => intent.userId === auth.user.id && intent.idempotencyKey === idempotencyKey); if (existing) return json(res, 200, { reference: existing.reference, amount: existing.amount, currency: existing.currency, planId: existing.planId });
    let input; try { input = await body(req); } catch { return json(res, 400, { error: 'Invalid payment request' }); }
    const planId = validateText(input.planId, { required: true, max: 80, pattern: /^[A-Za-z0-9._-]+$/ }); const plan = planFor(planId); if (!plan) return json(res, 400, { error: 'Unsupported payment plan' });
    const reference = `EDU_${randomToken(18)}`; db.paymentIntents.push({ reference, idempotencyKey, userId: auth.user.id, planId: plan.id, amount: plan.amount, currency: plan.currency, status: 'initialized', createdAt: new Date().toISOString() }); saveDb(db);
    return json(res, 201, { reference, amount: plan.amount, currency: plan.currency, planId: plan.id });
  }
  if (req.method === 'POST' && req.url === '/api/payments/verify') {
    if (!requireSameOrigin(req, res)) return;
    const auth = authorize(req, res, db); if (!auth) return;
    let input; try { input = await body(req); } catch { return json(res, 400, { error: 'Invalid payment request' }); }
    const reference = paymentRef(input.reference); const intent = reference && db.paymentIntents.find(item => item.reference === reference && item.userId === auth.user.id); if (!intent) return json(res, 404, { error: 'Payment not found' });
    if (db.transactions.some(tx => tx.reference === reference)) return json(res, 200, { ok: true, reference, status: 'already_processed' });
    if (!process.env.PAYSTACK_SECRET_KEY) return json(res, 503, { error: 'Payment verification unavailable' });
    const response = await fetch(`${process.env.PAYSTACK_API_URL || 'https://api.paystack.co'}/transaction/verify/${encodeURIComponent(reference)}`, { headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` } });
    if (!response.ok) return json(res, 502, { error: 'Payment verification unavailable' });
    const result = await response.json(); const data = result && result.data;
    const customerEmail = data && data.customer && String(data.customer.email || '').toLowerCase();
    if (!result.status || !data || data.status !== 'success' || Number(data.amount) !== intent.amount || String(data.currency).toUpperCase() !== String(intent.currency).toUpperCase() || (customerEmail && customerEmail !== auth.user.email.toLowerCase())) return json(res, 400, { error: 'Payment verification failed' });
    intent.status = 'verified'; const applied = applyTrustedPayment(db, { reference, user: auth.user, plan: planFor(intent.planId), amount: intent.amount, currency: intent.currency }); auditSecurityEvent(db, 'PAYMENT_VERIFIED', req, { userId: auth.user.id, reference, result: 'success' }); auditSecurityEvent(db, applied.duplicate ? 'PAYMENT_DUPLICATE' : 'SUBSCRIPTION_ACTIVATED', req, { userId: auth.user.id, reference }); saveDb(db); return json(res, 200, { ok: true, reference, status: applied.duplicate ? 'already_processed' : 'verified' });
  }
  if (req.method === 'POST' && req.url === '/api/payments/paystack/webhook') {
    const secret = process.env.PAYSTACK_WEBHOOK_SECRET || process.env.PAYSTACK_SECRET_KEY; const signature = String(req.headers['x-paystack-signature'] || ''); if (!secret || !signature) return json(res, 503, { error: 'Webhook verification unavailable' });
    let raw; try { raw = await rawBody(req, MAX_BODY_BYTES); } catch { return json(res, 400, { error: 'Invalid webhook' }); }
    const expected = crypto.createHmac('sha512', secret).update(raw).digest('hex'); if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) { auditSecurityEvent(db, 'PAYMENT_WEBHOOK_REJECTED', req, { reason: 'signature' }); saveDb(db); return json(res, 401, { error: 'Webhook rejected' }); }
    let event; try { event = JSON.parse(raw); } catch { return json(res, 400, { error: 'Invalid webhook' }); }
    if (event.event !== 'charge.success' || !event.data || !paymentRef(event.data.reference)) return json(res, 400, { error: 'Invalid webhook' });
    const reference = event.data.reference; const intent = db.paymentIntents.find(item => item.reference === reference); if (!intent) return json(res, 404, { error: 'Payment intent not found' });
    if (db.paymentEvents.some(item => item.eventId === event.id || item.reference === reference) || db.transactions.some(tx => tx.reference === reference)) return json(res, 200, { ok: true, status: 'already_processed' });
    const user = db.users.find(item => item.id === intent.userId && item.active); const plan = planFor(intent.planId);
    if (!user || !plan || Number(event.data.amount) !== plan.amount || String(event.data.currency).toUpperCase() !== String(plan.currency).toUpperCase()) return json(res, 400, { error: 'Payment verification failed' });
    applyTrustedPayment(db, { reference, user, plan, amount: plan.amount, currency: plan.currency, eventId: validateText(event.id, { max: 160, pattern: /^[A-Za-z0-9._:-]+$/ }) || reference }); auditSecurityEvent(db, 'PAYMENT_WEBHOOK_ACCEPTED', req, { userId: user.id, reference, result: 'success' }); auditSecurityEvent(db, 'SUBSCRIPTION_RENEWED', req, { userId: user.id, reference }); saveDb(db); return json(res, 200, { ok: true });
  }
  if (req.method === 'POST' && req.url === '/api/ai/request') {
    if (!requireSameOrigin(req, res)) return;
    const auth = authorize(req, res, db); if (!auth) return;
    let input; try { input = await body(req, 256 * 1024); } catch { auditSecurityEvent(db, 'AI_REQUEST_REJECTED', req, { userId: auth.user.id, reason: 'invalid_payload' }); saveDb(db); return json(res, 400, { error: 'AI request rejected' }); }
    const keys = Object.keys(input || {}); const allowedKeys = new Set(['prompt', 'context']); if (keys.some(key => !allowedKeys.has(key))) { auditSecurityEvent(db, 'AI_REQUEST_REJECTED', req, { userId: auth.user.id, reason: 'unknown_parameter' }); saveDb(db); return json(res, 400, { error: 'AI request rejected' }); }
    const prompt = validateText(input.prompt, { required: true, max: AI_MAX_PROMPT_CHARS }); const context = Array.isArray(input.context) ? input.context : [];
    if (!prompt || context.length > AI_MAX_CONTEXT_ITEMS || context.some(item => typeof item !== 'string' || item.length > 20000) || containsPromptInjection([prompt, ...context].join('\\n'))) { auditSecurityEvent(db, 'AI_PROMPT_INJECTION', req, { userId: auth.user.id, severity: 'high', reason: 'untrusted_instruction_detected' }); saveDb(db); return json(res, 400, { error: 'AI request rejected' }); }
    const quota = consumeAiQuota(auth.user); if (!quota.allowed) { auditSecurityEvent(db, 'AI_QUOTA_VIOLATION', req, { userId: auth.user.id, severity: 'high', role: auth.user.role }); saveDb(db); return json(res, 429, { error: 'AI request limit reached' }, { 'Retry-After': '3600' }); }
    auditSecurityEvent(db, 'AI_REQUEST', req, { userId: auth.user.id, role: auth.user.role, contextItems: context.length }); saveDb(db);
    if (!process.env.EDUTRACK_AI_PROVIDER) return json(res, 503, { error: 'AI service unavailable' });
    return json(res, 503, { error: 'AI service unavailable' });
  }
  if (req.method === 'POST' && req.url === '/api/ai/tool') {
    if (!requireSameOrigin(req, res)) return;
    const auth = authorize(req, res, db); if (!auth) return;
    let input; try { input = await body(req, 64 * 1024); } catch { return json(res, 400, { error: 'Tool request rejected' }); }
    const keys = Object.keys(input || {}); if (keys.some(key => !['tool', 'arguments'].includes(key)) || typeof input.tool !== 'string' || !input.arguments || Array.isArray(input.arguments)) { auditSecurityEvent(db, 'AI_TOOL_AUTHORIZATION_FAILURE', req, { userId: auth.user.id, severity: 'high', reason: 'invalid_schema' }); saveDb(db); return json(res, 400, { error: 'Tool request rejected' }); }
    auditSecurityEvent(db, 'AI_TOOL_AUTHORIZATION_FAILURE', req, { userId: auth.user.id, severity: 'high', reason: 'no_tools_enabled' }); saveDb(db); return json(res, 403, { error: 'Tool not permitted' });
  }
  if (req.method === 'GET' && req.url === '/api/admin/security-audit') {
    const auth = authorize(req, res, db, { roles: ['DEVELOPER_ROOT'] }); if (!auth) return;
    return json(res, 200, { events: db.audit.slice(-500).map(event => ({ id: event.id, action: event.action, severity: event.severity, at: event.at, correlationId: event.correlationId, userId: event.userId || null, role: event.role || null, result: event.result || null })) });
  }
  if (req.method === 'GET' && req.url === '/api/admin/summary') {
    const auth = authorize(req, res, db, { roles: ['DEVELOPER_ROOT', 'SUPER_ADMIN'], dashboard: 'super-admin' });
    if (!auth) return;
    return json(res, 200, { schools: db.schools.length, staff: db.staff.length, students: 0, transactions: db.transactions.length, subscriptions: db.subscriptions.length });
  }
  if (req.method === 'GET' && req.url === '/api/admin/authorized-hierarchies') {
    const auth = authorize(req, res, db, { roles: ['DEVELOPER_ROOT'] });
    if (!auth) return;
    return json(res, 200, { role: auth.user.role, scope: auth.user.scope });
  }
  if (req.method === 'GET') {
    const requested = req.url === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '');
    const safe = path.resolve(ROOT, requested);
    const relative = path.relative(ROOT, safe);
    if (relative.startsWith('..') || path.isAbsolute(relative) || requested.includes('\\0') || requested.split('/').some(part => part.startsWith('.')) || !SAFE_PUBLIC_FILES.has(relative) || !fs.existsSync(safe) || fs.statSync(safe).isDirectory()) return json(res, 404, { error: 'Not found' });
    const ext = path.extname(safe); const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };
    res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream', ...securityHeaders() }); return fs.createReadStream(safe).pipe(res);
  }
  json(res, 404, { error: 'Not found' });
}

ensureData();
if (process.argv.includes('--provision')) provisionBootstrapAccounts();
else if (process.argv.includes('--reset')) resetRegisteredData();
else http.createServer((req, res) => handler(req, res).catch(() => json(res, 500, { error: 'Internal server error' }))).listen(PORT, () => console.log(`EduTrack server listening on port ${PORT}`));
