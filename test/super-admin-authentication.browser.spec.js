'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const DB_FILE = path.join(ROOT, 'data', 'edutrack.json');
const BACKUP_FILE = `${DB_FILE}.super-admin-browser-backup`;
const PORT = 3104;
const BASE = `http://127.0.0.1:${PORT}`;
const EMAIL = 'super-admin-browser@example.invalid';
const CURRENT_PASSWORD = 'browser-current-super-admin-password';
const NEW_PASSWORD = 'browser-new-super-admin-password';
const ACCESS_CODE = 'browser-unused-access-code';
const NAME = 'Super Administrator';

function hash(value, salt) { return `${salt}:${crypto.scryptSync(value, salt, 64).toString('hex')}`; }
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function waitForServer(child) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Super Administrator browser server did not start')), 10000);
    child.stdout.on('data', chunk => { if (chunk.toString().includes('EduTrack server listening')) { clearTimeout(timer); resolve(); } });
    child.once('error', reject);
    child.once('exit', code => { if (code !== null) reject(new Error(`server exited with ${code}`)); });
  });
}

async function run() {
  fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
  if (fs.existsSync(DB_FILE)) fs.copyFileSync(DB_FILE, BACKUP_FILE);
  fs.writeFileSync(DB_FILE, JSON.stringify({
    version: 3,
    users: [{ id: 'usr_super_admin_browser', email: EMAIL, passwordHash: hash(CURRENT_PASSWORD, 'browser-password-salt'), accessCodeHash: hash(ACCESS_CODE, 'browser-access-salt'), role: 'SUPER_ADMIN', hierarchy: 'ROOT', scope: ['ROOT'], active: true, failedLoginCount: 0, lockedUntil: null, createdAt: new Date().toISOString() }],
    schools: [], staff: [], subscriptions: [], transactions: [], paymentIntents: [], paymentEvents: [], files: [], sessions: [], passwordResets: [], audit: []
  }, null, 2));

  const server = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT), NODE_ENV: 'development' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let browser;
  try {
    await waitForServer(server);
    browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true });
    const context1 = await browser.newContext({ viewport: { width: 390, height: 844 } });
    context1.setDefaultTimeout(10000);
    const page1 = await context1.newPage();
    await page1.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await page1.locator('#super-admin-login-btn').waitFor({ state: 'visible' });
    await page1.locator('#super-admin-login-btn').click();
    await page1.locator('#admin-login-name').fill(NAME);
    await page1.locator('#admin-login-email').fill(EMAIL);
    await page1.locator('#admin-login-password').fill(CURRENT_PASSWORD);
    await page1.locator('#admin-login-submit-btn').click();
    await page1.locator('#sub-admin-overlay').waitFor({ state: 'visible' });
    await page1.locator('#sa-hamburger').click();
    const passwordMenu = page1.locator('#sa-nav-scroll .sa-item').filter({ hasText: 'Change Super Admin Password' });
    const passwordGroup = page1.locator('#sa-cat-users .sa-group-header');
    await passwordGroup.click();
    await passwordMenu.waitFor({ state: 'visible' });
    assert.equal(await page1.evaluate((secrets) => Object.entries(localStorage).some(([key, value]) => /password|access[_-]?code|token/i.test(key) || secrets.some(secret => secret && String(value).includes(secret))), [CURRENT_PASSWORD, NEW_PASSWORD, ACCESS_CODE]), false, 'browser localStorage must not contain credentials');
    assert.ok((await context1.cookies()).some(item => item.name === 'edutrack_session' && item.httpOnly), 'Super Administrator session must be HttpOnly');

    await passwordMenu.click();
    assert.equal(await page1.locator('#panel-sa-change-password button').getAttribute('onclick'), 'EMS_SUPER_ADMIN_ACCESS.changePassword()');
    const passwordChangeResponse = page1.waitForResponse(response => response.url().endsWith('/api/auth/password-change'));
    await page1.evaluate(({ current, next }) => {
      document.getElementById('sa-current-password').value = current;
      document.getElementById('sa-new-password').value = next;
      document.getElementById('sa-confirm-password').value = next;
      window.EMS_SUPER_ADMIN_ACCESS.changePassword();
    }, { current: CURRENT_PASSWORD, next: NEW_PASSWORD });
    assert.equal((await passwordChangeResponse).status(), 200, 'password-change API should succeed for the authenticated Super Administrator');
    await context1.clearCookies();
    await context1.addInitScript(() => localStorage.clear());
    await page1.reload({ waitUntil: 'domcontentloaded' });
    await page1.locator('#super-admin-login-btn').waitFor({ state: 'visible' });
    await context1.close();

    // A separate browser context starts with empty localStorage and no cookie.
    const context2 = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    context2.setDefaultTimeout(10000);
    const page2 = await context2.newPage();
    await page2.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await page2.locator('#super-admin-login-btn').waitFor({ state: 'visible' });
    await page2.locator('#super-admin-login-btn').click();
    await page2.locator('#admin-login-name').fill(NAME);
    await page2.locator('#admin-login-email').fill(EMAIL);
    await page2.locator('#admin-login-password').fill(NEW_PASSWORD);
    const freshLoginResponse = page2.waitForResponse(response => response.url().endsWith('/api/auth/super-admin-login'));
    await page2.locator('#admin-login-submit-btn').click();
    const freshLoginResult = await freshLoginResponse;
    assert.equal(freshLoginResult.status(), 200, 'fresh-context Super Administrator login should succeed');
    await page2.locator('#sub-admin-overlay').waitFor({ state: 'visible' });
    assert.equal(await page2.evaluate((secrets) => Object.entries(localStorage).some(([key, value]) => /password|access[_-]?code|token/i.test(key) || secrets.some(secret => secret && String(value).includes(secret))), [CURRENT_PASSWORD, NEW_PASSWORD, ACCESS_CODE]), false);

    await context2.close();
    const context3 = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    context3.setDefaultTimeout(10000);
    const page3 = await context3.newPage();
    await page3.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await page3.locator('#super-admin-login-btn').waitFor({ state: 'visible' });
    await page3.locator('#super-admin-login-btn').click();
    await page3.locator('#admin-login-name').fill(NAME);
    await page3.locator('#admin-login-email').fill(EMAIL);
    await page3.locator('#admin-login-password').fill(CURRENT_PASSWORD);
    await page3.locator('#admin-login-submit-btn').click();
    await page3.locator('#admin-login-error').waitFor({ state: 'visible' });
    assert.equal(await page3.locator('#sub-admin-overlay').evaluate(node => getComputedStyle(node).display), 'none');
    assert.equal(await page3.locator('#admin-login-error').textContent(), 'Invalid Super Administrator Credentials');
    await context3.close();

    console.log('Super Administrator browser login, password change, fresh-context persistence, and old-password rejection regression passed.');
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (!server.killed) server.kill('SIGTERM');
    await sleep(100);
    if (fs.existsSync(BACKUP_FILE)) { fs.copyFileSync(BACKUP_FILE, DB_FILE); fs.unlinkSync(BACKUP_FILE); }
  }
}

run().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
