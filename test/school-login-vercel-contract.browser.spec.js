'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'dist');
const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'edutrack-vercel-school-contract-'));
const fixture = {
  region: 'Western Region',
  district: 'Sekondi Takoradi Metro',
  role: 'Headteacher',
  staffId: 'disposable-vercel-school-staff',
  accessCode: 'disposable-vercel-school-code'
};

process.env.NODE_ENV = 'test';
process.env.EDUTRACK_DATA_FILE = path.join(fixtureDir, 'fixture.json');
process.env.EDUTRACK_ENABLE_TEST_SCHOOL_FIXTURE = 'true';
process.env.EDUTRACK_TEST_SCHOOL_ACCESS_CODE = fixture.accessCode;
process.env.EDUTRACK_TEST_SCHOOL_STAFF_ID = fixture.staffId;

const api = require('../api/index.js');

const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml'
};

const server = http.createServer((req, res) => {
  if (req.url.startsWith('/api/')) return api(req, res);

  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const file = path.resolve(PUBLIC_DIR, relative);
  if (file !== PUBLIC_DIR && !file.startsWith(PUBLIC_DIR + path.sep)) {
    res.writeHead(403); return res.end();
  }
  fs.readFile(file, (error, content) => {
    if (error) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': mimeTypes[path.extname(file)] || 'application/octet-stream' });
    res.end(content);
  });
});

function request(base, pathname, { method = 'GET', body, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const address = new URL(base);
    const payload = body === undefined ? '' : JSON.stringify(body);
    const req = http.request({ hostname: address.hostname, port: address.port, path: pathname, method,
      headers: { origin: base, ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...headers } }, res => {
      let raw = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { raw += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: raw }));
    });
    req.on('error', reject);
    req.end(payload);
  });
}

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const missing = await request(base, '/api/school-login', { method: 'POST', body: { region: fixture.region } });
    assert.equal(missing.status, 400, 'missing credentials must be rejected');

    const invalid = await request(base, '/api/school-login', { method: 'POST', body: {
      ...fixture, accessCode: 'incorrect-disposable-code'
    } });
    assert.equal(invalid.status, 401, 'invalid credentials must be rejected');

    const invalidRole = await request(base, '/api/school-login', { method: 'POST', body: {
      ...fixture, role: 'District Administrator'
    } });
    assert.ok([400, 401].includes(invalidRole.status), 'macro roles must not authenticate through the School endpoint');

    const mismatchedGeography = await request(base, '/api/school-login', { method: 'POST', body: {
      ...fixture, region: 'Ashanti Region'
    } });
    assert.ok([400, 401].includes(mismatchedGeography.status), 'an invalid region–district pair must be rejected');

    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    page.setDefaultTimeout(45000);
    const pageErrors = [];
    const schoolRequests = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('request', req => {
      if (!req.url().endsWith('/api/school-login')) return;
      const data = JSON.parse(req.postData() || '{}');
      schoolRequests.push({ method: req.method(), region: data.region, district: data.district,
        role: data.role, staffId: data.staffId, hasAccessCode: Boolean(data.accessCode) });
    });
    await page.route(/^https:\/\//, route => route.abort());
    await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForFunction(() => document.documentElement.dataset.appReady === 'true');
    await page.locator('.login-level-btn[data-level="SCHOOL"]').click();

    const initialMap = await page.evaluate(() => ({
      regions: Object.keys(window.GH_REGIONS_DISTRICTS || {}),
      westernDistricts: (window.GH_REGIONS_DISTRICTS || {})['Western Region'] || []
    }));
    assert.ok(initialMap.regions.includes('Western Region'), 'the centralized map must retain canonical region names');
    assert.ok(initialMap.westernDistricts.includes('Sekondi Takoradi Metro'), 'Western Region must expose Sekondi Takoradi Metro');

    await page.locator('#v43-region').selectOption({ label: fixture.region });
    await page.locator('#v43-district').selectOption({ label: fixture.district });
    await page.locator('#v43-region').selectOption({ label: 'Ashanti Region' });
    const changedDistricts = await page.locator('#v43-district option').allTextContents();
    assert.equal(await page.locator('#v43-district').inputValue(), '', 'changing region must clear an incompatible district');
    assert.ok(!changedDistricts.includes(fixture.district), 'Sekondi Takoradi Metro must not appear under Ashanti Region');
    await page.locator('#v43-region').selectOption({ label: fixture.region });
    await page.locator('#v43-district').selectOption({ label: fixture.district });
    await page.locator('#v43-role').selectOption({ label: fixture.role });
    await page.locator('#v43-school-access-code').fill(fixture.accessCode);
    await page.locator('#v43-staffId').fill(fixture.staffId);

    const [login] = await Promise.all([
      page.waitForResponse(response => response.url().endsWith('/api/school-login')),
      page.locator('#v43LoginBtn').click()
    ]);
    const loginBody = await login.json();
    assert.equal(login.status(), 200);
    assert.equal(loginBody.authenticated, true);
    assert.equal(loginBody.dashboard, 'school-general');
    assert.deepEqual(schoolRequests, [{ method: 'POST', region: fixture.region, district: fixture.district,
      role: fixture.role, staffId: fixture.staffId, hasAccessCode: true }]);

    const cookies = await page.context().cookies(base);
    const sessionCookie = cookies.find(cookie => cookie.name === 'edutrack_session');
    assert.ok(sessionCookie && sessionCookie.httpOnly, 'the School login must establish an HttpOnly session cookie');
    assert.equal(await page.evaluate(() => document.cookie.includes('edutrack_session=')), false,
      'the browser page must not be able to read the session cookie');

    await page.waitForFunction(() => document.documentElement.dataset.schoolGeneralReady === 'true');
    const postActivationMap = await page.evaluate(() => ({
      regions: Object.keys(window.GH_REGIONS_DISTRICTS || {}),
      westernDistricts: (window.GH_REGIONS_DISTRICTS || {})['Western Region'] || [],
      dashboardVisible: getComputedStyle(document.querySelector('#page-dashboard')).display !== 'none'
    }));
    assert.ok(postActivationMap.regions.includes('Western Region'), 'lazy V67 startup must not replace canonical region keys');
    assert.ok(postActivationMap.westernDistricts.includes('Sekondi Takoradi Metro'), 'lazy V67 startup must preserve Western districts');
    assert.equal(postActivationMap.dashboardVisible, true, 'Headteacher login must reach School General');
    assert.deepEqual(pageErrors, [], `the browser must not report uncaught errors: ${pageErrors.join('; ')}`);

    const cookieHeader = `${sessionCookie.name}=${encodeURIComponent(sessionCookie.value)}`;
    const session = await request(base, '/api/auth/session', { headers: { cookie: cookieHeader } });
    assert.equal(session.status, 200);
    const sessionBody = JSON.parse(session.body);
    assert.equal(sessionBody.authorization.loginScope.level, 'SCHOOL');
    assert.equal(sessionBody.authorization.loginScope.role, 'HEADTEACHER');
    assert.equal(sessionBody.authorization.loginScope.schoolId, 'test-school-western-sekondi');

    const forbiddenMacro = await request(base, '/api/control-panel/regional?view=context', {
      headers: { cookie: cookieHeader }
    });
    assert.equal(forbiddenMacro.status, 403, 'the School session must not grant Regional access');

    const logout = await request(base, '/api/auth/logout', { method: 'POST', headers: { cookie: cookieHeader } });
    assert.equal(logout.status, 200);
    const afterLogout = await request(base, '/api/auth/session', { headers: { cookie: cookieHeader } });
    assert.equal(afterLogout.status, 401, 'logout must revoke the session at the API');

    console.log('Vercel built-shell School cookie contract browser integration passed.');
    await page.close();
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(fixtureDir, { recursive: true, force: true });
  }
})().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });
