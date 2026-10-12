'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const Module = require('node:module');
const path = require('node:path');
const { chromium } = require('playwright');
const jwt = require('jsonwebtoken');

const ROOT = path.resolve(__dirname, '..');
const SCHOOL_CODE = 'disposable-school-code';
const STAFF_ID = 'disposable-school-staff';
const SCHOOL = {
  id: 'school-test-1', school_id: 'school-test-1', school_code: 'SCHOOL-TEST-1',
  school_name: 'EduTrack Disposable Test School', name: 'EduTrack Disposable Test School',
  region: 'WESTERN', district: 'SEKONDI TAKORADI METROPOLITAN',
  access_code: SCHOOL_CODE, access_code_status: 'ACTIVE',
  access_code_expires_at: null, role: 'HEADTEACHER', staff_id: STAFF_ID,
  full_name: 'Disposable Headteacher', assigned_class: null, assigned_form: null
};

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'local-school-login-contract-test-secret';

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === '../server' && parent && parent.filename === path.join(ROOT, 'api', 'index.js')) {
    return { handler: async (_req, res) => { res.writeHead(404); res.end(); } };
  }
  if (request === '../lib/db' && parent && parent.filename === path.join(ROOT, 'api', 'legacy.js')) {
    return {
      async query(sql, params = []) {
        if (sql.includes('FROM schools s') && sql.includes('JOIN users u')) {
          const [code, staffId] = params;
          return code === SCHOOL_CODE && staffId === STAFF_ID ? [SCHOOL] : [];
        }
        if (sql === 'SELECT * FROM schools WHERE school_code = ?') {
          return params[0] === SCHOOL.school_code ? [SCHOOL] : [];
        }
        return [];
      },
      getPool() { throw new Error('Unexpected database pool use in contract test'); }
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

let api;
try { api = require('../api/index.js'); }
finally { Module._load = originalLoad; }

const html = fs.readFileSync(path.join(ROOT, 'index.html'));
const server = http.createServer((req, res) => {
  if (req.url.startsWith('/api/')) return api(req, res);
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
});

function request(pathname, { method = 'GET', body, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const address = server.address();
    const payload = body === undefined ? '' : JSON.stringify(body);
    const req = http.request({ hostname: address.address, port: address.port, path: pathname, method,
      headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...headers } }, res => {
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
    const missing = await request('/api/school-login', { method: 'POST', body: { region: 'Western Region' } });
    assert.equal(missing.status, 400, 'missing credentials must be rejected');

    const invalid = await request('/api/school-login', { method: 'POST', body: {
      region: 'Western Region', district: 'Sekondi Takoradi Metro', role: 'Headteacher',
      accessCode: 'incorrect-disposable-code', staffId: STAFF_ID
    } });
    assert.equal(invalid.status, 401, 'invalid credentials must be rejected');

    const invalidRole = await request('/api/school-login', { method: 'POST', body: {
      region: 'Western Region', district: 'Sekondi Takoradi Metro', role: 'District Director',
      accessCode: SCHOOL_CODE, staffId: STAFF_ID
    } });
    assert.equal(invalidRole.status, 401, 'a non-School role must not authenticate through the School endpoint');

    const mismatchedGeography = await request('/api/school-login', { method: 'POST', body: {
      region: 'Ashanti Region', district: 'Sekondi Takoradi Metro', role: 'Headteacher',
      accessCode: SCHOOL_CODE, staffId: STAFF_ID
    } });
    assert.equal(mismatchedGeography.status, 401, 'a region–district mismatch must be rejected');

    const unauthorized = await request('/api/config?schoolCode=SCHOOL-TEST-1');
    assert.equal(unauthorized.status, 401, 'school data must require a valid School token');

    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    page.setDefaultTimeout(15000);
    const pageErrors = [];
    const consoleErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    await page.route(/^https:\/\//, route => route.abort());
    const schoolRequests = [];
    page.on('request', req => {
      if (req.url().endsWith('/api/school-login')) {
        const data = JSON.parse(req.postData() || '{}');
        schoolRequests.push({ method: req.method(), contentType: req.headers()['content-type'],
          region: data.region, district: data.district, role: data.role,
          accessCodePresent: Boolean(data.accessCode), staffId: data.staffId });
      }
    });

    const base = `http://127.0.0.1:${server.address().port}`;
    await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.evaluate(() => document.querySelector('.login-level-btn[data-level="SCHOOL"]').click());
    if (!await page.locator('#v43-region:visible').count()) {
      const state = await page.evaluate(() => ({
        enhancement: typeof window.EDUTRACK_ENHANCEMENT_PART1,
        selectSchoolLevel: typeof window.EDUTRACK_ENHANCEMENT_PART1?.selectSchoolLevel,
        level: window.v43CurrentLevel || null,
        dynamicFields: document.getElementById('v43DynamicFields')?.innerHTML.slice(0, 200)
      }));
      throw new Error(`School fields did not render: ${JSON.stringify({ state, pageErrors })}`);
    }
    const geographicState = await page.evaluate(() => ({
      regions: Object.keys(window.GH_REGIONS_DISTRICTS || {}).length,
      westernDistricts: (window.GH_REGIONS_DISTRICTS || {})['Western Region'] || [],
      options: Array.from(document.getElementById('v43-region').options).map(option => option.textContent.trim())
    }));
    assert.ok(geographicState.options.includes('Western Region'),
      `static School region selector must expose its authoritative map: ${JSON.stringify(geographicState)}`);
    const cascade = await page.evaluate(() => {
      const region = document.getElementById('v43-region');
      region.value = Array.from(region.options).find(option => option.textContent.trim() === 'Western Region').value;
      region.dispatchEvent(new Event('change', { bubbles: true }));
      const district = document.getElementById('v43-district');
      const westernHasSekondi = Array.from(district.options).some(option => option.textContent.trim() === 'Sekondi Takoradi Metro');
      const sekondi = Array.from(district.options).find(option => option.textContent.trim() === 'Sekondi Takoradi Metro');
      if (sekondi) district.value = sekondi.value;
      district.dispatchEvent(new Event('change', { bubbles: true }));
      region.value = Array.from(region.options).find(option => option.textContent.trim() === 'Ashanti Region').value;
      region.dispatchEvent(new Event('change', { bubbles: true }));
      const changedRegionClearedDistrict = district.value === '';
      const ashantiHasSekondi = Array.from(district.options).some(option => option.textContent.trim() === 'Sekondi Takoradi Metro');
      region.value = Array.from(region.options).find(option => option.textContent.trim() === 'Western Region').value;
      region.dispatchEvent(new Event('change', { bubbles: true }));
      district.value = Array.from(district.options).find(option => option.textContent.trim() === 'Sekondi Takoradi Metro').value;
      district.dispatchEvent(new Event('change', { bubbles: true }));
      const role = document.getElementById('v43-role');
      role.value = Array.from(role.options).find(option => option.textContent.trim() === 'Headteacher').value;
      role.dispatchEvent(new Event('change', { bubbles: true }));
      document.getElementById('v43-school-access-code').value = 'disposable-school-code';
      document.getElementById('v43-school-access-code').dispatchEvent(new Event('input', { bubbles: true }));
      document.getElementById('v43-staffId').value = 'disposable-school-staff';
      document.getElementById('v43-staffId').dispatchEvent(new Event('input', { bubbles: true }));
      return { westernHasSekondi, changedRegionClearedDistrict, ashantiHasSekondi };
    });
    assert.deepEqual(cascade, { westernHasSekondi: true, changedRegionClearedDistrict: true, ashantiHasSekondi: false },
      'the canonical cascade must refresh districts and clear an incompatible prior selection');

    const loginResponsePromise = page.waitForResponse(response => response.url().endsWith('/api/school-login'));
    await page.evaluate(() => window.v43DoLogin());
    const [loginResponse] = await Promise.all([loginResponsePromise]);
    const loginBody = await loginResponse.json();
    assert.equal(loginResponse.status(), 200);
    assert.ok(loginBody.token, 'the tracked production page requires a JWT token');
    assert.equal(loginBody.dashboard, 'school-general');
    assert.equal(loginBody.administrativeLevel, 'SCHOOL');
    assert.equal(loginResponse.headers()['set-cookie'], undefined,
      'the Vercel page uses its established bearer-token contract, not the separate server-shell cookie contract');
    const claims = jwt.verify(loginBody.token, process.env.JWT_SECRET);
    assert.equal(claims.administrativeLevel, 'SCHOOL');
    assert.equal(claims.role, 'HEADTEACHER');
    assert.equal(claims.schoolId, SCHOOL.school_id);
    assert.deepEqual(schoolRequests, [{ method: 'POST', contentType: 'application/json',
      region: 'Western Region', district: 'Sekondi Takoradi Metro', role: 'Headteacher',
      accessCodePresent: true, staffId: STAFF_ID }]);

    await page.waitForFunction(() => localStorage.getItem('edutrack_api_token'));
    await page.waitForFunction(() => {
      const login = document.getElementById('login-screen');
      return login && getComputedStyle(login).display === 'none';
    });
    const dashboard = await page.evaluate(() => ({
      schoolTokenPersisted: Boolean(localStorage.getItem('edutrack_api_token')),
      dashboardVisible: Boolean(document.getElementById('page-dashboard'))
        && !document.getElementById('page-dashboard').classList.contains('hidden'),
      level: localStorage.getItem('v43_login_level'),
      role: localStorage.getItem('v43_login_role')
    }));
    assert.deepEqual(dashboard, { schoolTokenPersisted: true, dashboardVisible: true,
      level: 'SCHOOL', role: 'Headteacher' });

    const token = await page.evaluate(() => localStorage.getItem('edutrack_api_token'));
    const allowed = await request('/api/config?schoolCode=SCHOOL-TEST-1', {
      headers: { authorization: `Bearer ${token}` }
    });
    assert.equal(allowed.status, 200, 'the dashboard token must authorize its protected School API');
    const wrongScope = await request('/api/config?schoolCode=OTHER-SCHOOL', {
      headers: { authorization: `Bearer ${token}` }
    });
    assert.equal(wrongScope.status, 403, 'the School token must not authorize another school');

    await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
    assert.equal(await page.evaluate(() => Boolean(localStorage.getItem('edutrack_api_token'))), true,
      'the existing JWT continuation policy must retain the token on refresh');
    await page.evaluate(async () => {
      try { await window.EDUTRACK_API.logout(); } catch (_) { /* the adapter test double does not implement logout */ }
    });
    assert.equal(await page.evaluate(() => localStorage.getItem('edutrack_api_token')), null,
      'the existing client logout path must clear the School token');
    console.log('Vercel static-page School JWT contract browser integration passed.');
    await page.close();
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });
