'use strict';

// This suite owns its server process and disposable JSON data file.  It therefore
// proves that the direct request and browser use the same test-only fixture.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');

const repo = path.join(__dirname, '..');
const port = 32000 + Math.floor(Math.random() * 2000);
const baseUrl = `http://127.0.0.1:${port}`;
const dataFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'edutrack-school-login-')), 'fixture.json');
const fixture = {
  region: 'WESTERN', district: 'SECONDI TAKORADI METROPOLITAN', role: 'HEADTEACHER',
  accessCode: process.env.EDUTRACK_TEST_SCHOOL_ACCESS_CODE,
  staffId: process.env.EDUTRACK_TEST_SCHOOL_STAFF_ID
};
const viewports = [
  { width: 1920, height: 1080 }, { width: 1366, height: 768 }, { width: 768, height: 1024 },
  { width: 390, height: 844 }, { width: 360, height: 800 }
];

function waitForServer(child) {
  return new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error(`Test server did not start: ${output}`)), 20000);
    const onOutput = chunk => {
      output += chunk.toString();
      if (output.includes(`EduTrack server listening on port ${port}`)) { clearTimeout(timer); resolve(); }
    };
    child.stdout.on('data', onOutput); child.stderr.on('data', onOutput);
    child.once('exit', code => { clearTimeout(timer); reject(new Error(`Test server exited (${code}): ${output}`)); });
  });
}

async function directLogin() {
  const response = await fetch(`${baseUrl}/api/school-login`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(fixture)
  });
  const body = await response.json();
  assert.equal(response.status, 200, `direct login response: ${JSON.stringify(body)}`);
  assert.equal(body.authenticated, true);
  assert.equal(body.user.role, fixture.role);
  assert.match(response.headers.get('set-cookie') || '', /HttpOnly/i, 'authenticated response must set an HttpOnly cookie');
  const rejected = await fetch(`${baseUrl}/api/school-login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...fixture, accessCode: 'wrong-test-code' })
  });
  assert.equal(rejected.status, 401, 'incorrect credentials must remain rejected');
}

async function browserLogin(browser, viewport) {
  const page = await browser.newPage({ viewport });
  const requests = [], pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('request', request => {
    if (!request.url().endsWith('/api/school-login')) return;
    const body = JSON.parse(request.postData() || '{}');
    requests.push({ method: request.method(), url: request.url(), contentType: request.headers()['content-type'], fields: Object.keys(body).sort(), region: body.region, district: body.district, role: body.role, accessCodePresent: Boolean(body.accessCode), staffId: body.staffId });
  });
  const readyAt = Date.now();
  await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForFunction(() => document.documentElement.dataset.appReady === 'true');
  await page.locator('.login-level-btn[data-level="SCHOOL"]').click();
  await page.locator('#v43-region').selectOption({ label: 'Western Region' });
  await page.locator('#v43-district').selectOption({ label: 'Sekondi Takoradi Metro' });
  await page.locator('#v43-role').selectOption({ label: 'Headteacher' });
  await page.locator('#v43-school-access-code').fill(fixture.accessCode);
  await page.locator('#v43-staffId').fill(fixture.staffId);
  const loginAt = Date.now();
  const [response] = await Promise.all([
    page.waitForResponse(response => response.url().endsWith('/api/school-login')),
    page.locator('#v43LoginBtn').click()
  ]);
  const responseBody = await response.json();
  await page.waitForFunction(() => document.documentElement.dataset.schoolDashboardReady === 'true');
  await page.waitForFunction(() => document.documentElement.dataset.schoolGeneralReady === 'true');
  const storedCookies = await page.context().cookies(baseUrl);
  const state = await page.evaluate(() => ({
    dashboardVisible: Boolean(document.querySelector('#page-dashboard')) && getComputedStyle(document.querySelector('#page-dashboard')).display !== 'none',
    loginDisplay: document.querySelector('#login-screen')?.style.display,
    inertScripts: document.querySelectorAll('script[data-edutrack-lazy="true"]').length,
    pageCanReadSessionCookie: document.cookie.includes('edutrack_session='),
    schoolGeneralActivated: Boolean(window.EDUTRACK_SCHOOL_MODULES && window.EDUTRACK_SCHOOL_MODULES.activated('SCHOOL_GENERAL')),
    sidebarVisible: Boolean(document.querySelector('#sg-school-level .school-nav-item')),
    forbiddenOfficerNavigation: /District|Regional|National/.test(document.querySelector('#sg-school-level')?.innerText || ''),
    pageOverflows: document.documentElement.scrollWidth > document.documentElement.clientWidth
  }));
  assert.equal(response.status(), 200, `browser safe response: ${JSON.stringify(responseBody)}`);
  assert.equal(responseBody.authenticated, true);
  assert.deepEqual(requests[0], {
    method: 'POST', url: `${baseUrl}/api/school-login`, contentType: 'application/json',
    fields: ['accessCode', 'district', 'region', 'role', 'staffId'], region: 'Western Region',
    district: 'Sekondi Takoradi Metro', role: 'Headteacher', accessCodePresent: true, staffId: fixture.staffId
  });
  assert.equal(state.dashboardVisible, true); assert.equal(state.loginDisplay, 'none');
  assert.ok(state.inertScripts > 0, 'legacy scripts must remain inert');
  assert.equal(state.schoolGeneralActivated, true, 'SCHOOL_GENERAL must activate exactly once');
  assert.equal(state.sidebarVisible, true, 'School sidebar must be rendered');
  assert.equal(state.forbiddenOfficerNavigation, false, 'School sidebar must not expose officer dashboards');
  assert.equal(state.pageOverflows, false, 'School General must not introduce horizontal overflow');
  assert.ok(storedCookies.some(cookie => cookie.name === 'edutrack_session' && cookie.httpOnly), 'browser must store the HttpOnly authentication cookie');
  assert.equal(state.pageCanReadSessionCookie, false, 'HttpOnly authentication cookie must not be visible to page JavaScript');
  assert.deepEqual(pageErrors, [], `uncaught page errors at ${viewport.width}x${viewport.height}: ${pageErrors.join('; ')}`);
  await page.close();
  return { viewport: `${viewport.width}x${viewport.height}`, schoolFormMs: loginAt - readyAt, dashboardReadyMs: Date.now() - loginAt, inertScripts: state.inertScripts };
}

(async () => {
  assert.ok(fixture.accessCode && fixture.staffId, 'EDUTRACK_TEST_SCHOOL_ACCESS_CODE and EDUTRACK_TEST_SCHOOL_STAFF_ID are required');
  const environment = { ...process.env, PORT: String(port), NODE_ENV: 'test', EDUTRACK_ENABLE_TEST_SCHOOL_FIXTURE: 'true', EDUTRACK_TEST_SCHOOL_ACCESS_CODE: fixture.accessCode, EDUTRACK_TEST_SCHOOL_STAFF_ID: fixture.staffId, EDUTRACK_DATA_FILE: dataFile };
  const server = spawn(process.execPath, ['server.js'], { cwd: repo, env: environment, stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    await waitForServer(server);
    const seeded = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    assert.ok(seeded.schools.some(row => row.id === 'test-school-western-sekondi'));
    assert.ok(seeded.staff.some(row => row.staffId === fixture.staffId));
    await directLogin();
    const browser = await chromium.launch({ headless: true });
    try {
      const results = [];
      for (const viewport of viewports) results.push(await browserLogin(browser, viewport));
      console.log(JSON.stringify({ status: 'PASS', dataFile, directApi: 200, browser: results }));
    } finally { await browser.close(); }
  } finally {
    server.kill();
    fs.rmSync(path.dirname(dataFile), { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
