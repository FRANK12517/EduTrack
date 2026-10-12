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
  region: 'Western Region', district: 'Sekondi Takoradi Metro', role: 'HEADTEACHER',
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
  page.on('pageerror', error => pageErrors.push(error.stack || error.message));
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
  if(process.env.EDUTRACK_SCHOOL_ROUTE_AUDIT==='1') {
    const audit=await page.evaluate(async()=>{
      const out=[];
      for(const parent of document.querySelectorAll('#sg-school-level .nav-group-header')){parent.click();parent.click();}
      const leaves=Array.from(document.querySelectorAll('#sg-school-level .school-nav-item'));
      for(const leaf of leaves){
        const target=leaf.dataset.schoolTarget;if(target==='session:logout')continue;
        const before=document.querySelector('.page:not(.hidden)')?.id;
        try{leaf.click();const until=Date.now()+5000;while(leaf.dataset.routing==='true'&&Date.now()<until)await new Promise(r=>setTimeout(r,50));
          let available=true;
          if(target.startsWith('page:')){const panel=document.getElementById('page-'+target.slice(5));available=!!panel&&getComputedStyle(panel).display!=='none';}
          if(target.startsWith('api:'))available=typeof target.slice(4).split('.').reduce((v,k)=>v&&v[k],window)==='function';
          if(target.startsWith('fms:'))available=typeof window.fmsShowPage==='function';
          if(target.startsWith('workflow:'))available=typeof window.EMS_GNSIS_LIFE?.open==='function';
          if(target.startsWith('section:'))available=typeof window.EMS_SLD?.openSection==='function';
          out.push({label:leaf.dataset.schoolNav,target,available,panel:target.startsWith('page:')?document.getElementById('page-'+target.slice(5))?.getAttribute('class'):undefined,role:localStorage.getItem('v43_login_role'),routing:leaf.dataset.routing,routeError:leaf.dataset.routeError,error:document.getElementById('v43LoginError')?.textContent,before,after:document.querySelector('.page:not(.hidden)')?.id});
        }catch(error){out.push({label:leaf.dataset.schoolNav,target,available:false,error:error.message});}
      }return out;
    });
    fs.mkdirSync(path.join(repo,'artifacts'),{recursive:true});fs.writeFileSync(path.join(repo,'artifacts','part5-school-live-routes-'+viewport.width+'.json'),JSON.stringify(audit,null,2));
    assert.deepEqual(audit.filter(x=>!x.available),[],'Every real School sidebar component must be available');
    page.once('dialog',dialog=>dialog.accept());
    const logoutResponse=page.waitForResponse(response=>response.url().endsWith('/api/auth/logout'));
    await page.locator('[data-school-logout]').evaluate(node=>node.click());
    assert.equal((await logoutResponse).status(),200,'School logout must invalidate the server session');
    await page.locator('#login-screen').waitFor({state:'visible'});
    assert.equal((await page.context().request.get(baseUrl+'/api/auth/session')).status(),401);
    console.log('PASS live School routes '+viewport.width+'px: '+audit.length+' entries, parent toggles and server logout');
  }
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
    const browser = await chromium.launch({ headless: true, executablePath: process.env.EDUTRACK_BROWSER_PATH || (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : '/usr/bin/chromium') });
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
