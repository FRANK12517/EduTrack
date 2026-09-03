const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const port = 3199;
const expected = [
  'Communication Hub',
  'Chat',
  'Multi-School Control Panel',
  'Online Admissions',
  'Transport Management',
  'User Guide',
  'Copyright',
  'Acknowledgement',
  'Developer',
  'Log Out'
];

function chromeExecutable() {
  const root = path.join(process.env.LOCALAPPDATA, 'ms-playwright', 'chromium-1234');
  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    path.join(root, 'chrome-win64', 'chrome.exe'),
    path.join(root, 'chrome-win', 'chrome.exe')
  ];
  return candidates.find(fs.existsSync);
}

function waitForServer(child) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('EduTrack server did not start')), 10000);
    child.stdout.on('data', (chunk) => {
      if (chunk.toString().includes('EduTrack server listening')) {
        clearTimeout(timeout);
        resolve();
      }
    });
    child.once('error', reject);
  });
}

async function verify(page, viewport) {
  const runtimeErrors = [];
  page.on('pageerror', (error) => runtimeErrors.push(error.message));
  await page.setViewportSize(viewport);
  await page.goto(`http://127.0.0.1:${port}`, { waitUntil: 'domcontentloaded' });
  // The unauthenticated landing bootstrap clears role storage. Restore an
  // authorized role and replay module initialization to exercise the same
  // post-login sidebar path without bypassing the module's RBAC condition.
  await page.evaluate(() => {
    const storedGetItem = Storage.prototype.getItem;
    Storage.prototype.getItem = function (key) {
      if (key === 'v43_login_role') return 'HEADTEACHER';
      if (key === 'v43_login_level') return 'SCHOOL';
      if (key === 'v43_school_id') return 'sidebar-test-school';
      return storedGetItem.call(this, key);
    };
    localStorage.setItem('v43_login_role', 'HEADTEACHER');
    localStorage.setItem('v43_login_level', 'SCHOOL');
    localStorage.setItem('v43_school_id', 'sidebar-test-school');
    document.dispatchEvent(new Event('DOMContentLoaded'));
  });
  await page.waitForTimeout(3000);
  const diagnostics = await page.evaluate(() => ({
    role: localStorage.getItem('v43_login_role'),
    transportApi: typeof window.EDUTRACK_TRANSPORT,
    transportScripts: Array.from(document.scripts).map((script) => script.src).filter((src) => src.includes('transport')),
    labels: Array.from(document.querySelectorAll('#sidebarScroll > .nav-item .nav-label')).map((node) => node.textContent.trim())
  }));
  diagnostics.runtimeErrors = runtimeErrors;
  assert.equal(diagnostics.role, 'HEADTEACHER', JSON.stringify(diagnostics));
  assert.equal(diagnostics.transportApi, 'object', JSON.stringify(diagnostics));
  assert.equal(await page.locator('#sidebarScroll > #edutrack-transport-nav').count(), 1, JSON.stringify(diagnostics));
  const labels = await page.locator('#sidebarScroll > .nav-item .nav-label').allTextContents();
  assert.deepEqual(labels.slice(-10).map((label) => label.trim()), expected, JSON.stringify(diagnostics));
  assert.equal(await page.locator('#sidebarScroll > #edutrack-transport-nav').count(), 1);
  await page.locator('#edutrack-transport-nav').evaluate((node) => node.click());
  assert.equal(await page.locator('#page-transport-management').evaluate((node) => node.classList.contains('hidden')), false);
}

(async () => {
  const executablePath = chromeExecutable();
  assert.ok(executablePath, 'Playwright Chromium executable is installed');
  const server = spawn(process.execPath, ['server.js'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let browser;
  try {
    await waitForServer(server);
    browser = await chromium.launch({ executablePath, headless: true });
    const page = await browser.newPage();
    await page.addInitScript(() => {
      localStorage.setItem('v43_login_role', 'HEADTEACHER');
      localStorage.setItem('v43_login_level', 'SCHOOL');
      localStorage.setItem('v43_school_id', 'sidebar-test-school');
    });
    await verify(page, { width: 1440, height: 900 });
    await verify(page, { width: 390, height: 844 });
    console.log('Info & Session desktop/mobile browser regression suite passed.');
  } finally {
    if (browser) await browser.close();
    server.kill();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
