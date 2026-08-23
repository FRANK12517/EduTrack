'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const DB_FILE = path.join(ROOT, 'data', 'edutrack.json');
const PORT = 3418;
const BASE = `http://127.0.0.1:${PORT}`;
const DEV = { email: 'part18-dev@example.invalid', password: 'Part18-Development-Password!', accessCode: 'Part18-Development-Code!' };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
function startServer(env) {
  const child = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: { ...process.env, EDUTRACK_DATABASE_URL: '', DATABASE_URL: '', ...env, PORT: String(PORT), NODE_ENV: 'development' }, stdio: ['ignore', 'pipe', 'pipe'] });
  const logs = []; child.stdout.on('data', (chunk) => logs.push(String(chunk))); child.stderr.on('data', (chunk) => logs.push(String(chunk)));
  return { child, logs };
}
function waitForServer(timeout = 10000) {
  const started = Date.now();
  return new Promise((resolve, reject) => { const poll = () => request('/api/health').then((r) => r.status === 200 ? resolve() : retry()).catch(retry); const retry = () => Date.now() - started > timeout ? reject(new Error('server readiness timeout')) : setTimeout(poll, 100); poll(); });
}
async function provision() {
  const result = spawnSync(process.execPath, ['server.js', '--provision-dev'], { cwd: ROOT, env: { ...process.env, EDUTRACK_DATABASE_URL: '', DATABASE_URL: '', NODE_ENV: 'development', EDUTRACK_ENABLE_DEV_ACCESS: 'true', EDUTRACK_DEV_EMAIL: DEV.email, EDUTRACK_DEV_PASSWORD: DEV.password, EDUTRACK_DEV_ACCESS_CODE: DEV.accessCode }, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  const user = db.users.find((record) => record.email === DEV.email);
  assert.ok(user, 'development fixture must be provisioned');
  assert.equal(user.developmentFixture, true);
  assert.equal(user.passwordHash.includes(DEV.password), false);
  assert.equal(user.accessCodeHash.includes(DEV.accessCode), false);
}
async function main() {
  const original = fs.readFileSync(DB_FILE);
  let server; let browser;
  try {
    const disabled = spawnSync(process.execPath, ['server.js', '--provision-dev'], { cwd: ROOT, env: { ...process.env, EDUTRACK_DATABASE_URL: '', DATABASE_URL: '', NODE_ENV: 'production' }, encoding: 'utf8' });
    assert.notEqual(disabled.status, 0, 'development provisioning must be unavailable in production');
    await provision();
    server = startServer({ EDUTRACK_ENABLE_DEV_ACCESS: 'true' }); await waitForServer();

    const unauthenticated = await request('/api/auth/session');
    assert.equal(unauthenticated.status, 401);
    const denied = await request('/api/admin/summary');
    assert.equal(denied.status, 401);

    const invalid = await request('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: DEV.email, password: 'wrong-password', accessCode: 'wrong-code' }) });
    assert.equal(invalid.status, 401);
    assert.equal(invalid.body.error, 'Authentication failed');
    assert.equal((await request('/api/auth/session')).status, 401);

    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } }); context.setDefaultTimeout(8000); context.setDefaultNavigationTimeout(20000);
    const page = await context.newPage();
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    const developerButton = page.locator('#edutrack-part18-developer-access');
    assert.equal(await developerButton.count(), 1);
    await developerButton.click();
    await page.locator('#edutrack-part18-developer-form input[name="email"]').fill(DEV.email);
    await page.locator('#edutrack-part18-developer-form input[name="password"]').fill(DEV.password);
    await page.locator('#edutrack-part18-developer-form input[name="accessCode"]').fill(DEV.accessCode);
    await page.locator('#edutrack-part18-developer-form button[type="submit"]').click();
    await page.locator('#edutrack-part18-developer-dashboard').waitFor({ state: 'visible' });
    assert.match(await page.locator('#edutrack-part18-identity').textContent(), /DEVELOPER_ROOT/);
    assert.match(await page.locator('#edutrack-part18-authorization').textContent(), /developer-root/);
    assert.match(await page.locator('#edutrack-part18-summary').textContent(), /schools/);
    const cookies = await context.cookies();
    assert.ok(cookies.some((cookie) => cookie.name === 'edutrack_session' && cookie.httpOnly));
    assert.equal(await page.evaluate(() => Object.keys(localStorage).some((key) => /password|access|token|session/i.test(key))), false);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('#edutrack-part18-developer-dashboard').waitFor({ state: 'visible' });
    assert.match(await page.locator('#edutrack-part18-identity').textContent(), /DEVELOPER_ROOT/);
    await page.locator('#edutrack-part18-logout').click();
    await page.locator('#edutrack-part18-developer-dashboard').waitFor({ state: 'detached' });
    assert.equal((await page.evaluate(() => document.getElementById('login-screen')?.style.display || '')).includes('none'), false);
    await page.close(); await context.close();
    const sessionAfterLogout = await request('/api/auth/session'); assert.equal(sessionAfterLogout.status, 401);
    const deniedAfterLogout = await request('/api/admin/summary'); assert.equal(deniedAfterLogout.status, 401);
    console.log('Part 18 authentication foundation suite passed.');
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (server?.child && !server.child.killed) server.child.kill('SIGTERM');
    await sleep(100);
    fs.writeFileSync(DB_FILE, original);
  }
}
main().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
