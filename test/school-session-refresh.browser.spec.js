'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.EDUTRACK_BROWSER_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.route('http://school-refresh.test/', route => route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><html><body><div id="login-screen"><div id="loginSuccessOverlay" class="show"></div><button id="v43LoginBtn"></button></div><div class="topbar"></div><div class="shell"></div><div id="upper-level-dashboard"></div><div id="sg-school-level"></div></body></html>'
    }));
    await page.route('**/api/auth/session', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ authenticated: true, user: { id: 'TEST-USER', role: 'HEADTEACHER', staffId: 'SERVER-STAFF' }, authorization: { administrativeLevel: 'SCHOOL', permissions:['schools.manage','reporting.read'], loginScope: { level: 'SCHOOL', role: 'HEADTEACHER', schoolId: 'SERVER-SCHOOL', region: 'Ashanti', district: 'Kumasi Metro' } } })
    }));
    await page.goto('http://school-refresh.test/');
    await page.evaluate(() => {
      localStorage.setItem('v43_login_level', 'SCHOOL');
      localStorage.setItem('v43_login_role', 'Headteacher');
      localStorage.setItem('v43_login_staffid', 'TEST-STAFF');
      localStorage.setItem('ems_login_region', 'Western');
      localStorage.setItem('ems_login_district', 'Sekondi-Takoradi Metropolitan');
      window.emsHideUpperLevelDashboard = () => { window.__upperHidden = true; };
      window.emsRouteAfterLogin = (...args) => { window.__schoolRoute = args; };
      window.EDUTRACK_SCHOOL_SIDEBAR = { activateScope: () => { window.__scopeActivated = true; } };
    });
    await page.addScriptTag({ path: path.join(__dirname, '..', 'privileged-auth.js') });
    await page.waitForFunction(() => window.__EDUTRACK_SCHOOL_SESSION_AUTHORIZED__ === true && Array.isArray(window.__schoolRoute) && window.__scopeActivated === true);
    const state = await page.evaluate(() => ({
      loginDisplay: document.getElementById('login-screen').style.display,
      overlayActive: document.getElementById('loginSuccessOverlay').classList.contains('show'),
      route: window.__schoolRoute,
      upperHidden: window.__upperHidden,
      scopeActivated: window.__scopeActivated,
      staffId: localStorage.getItem('v43_login_staffid'),
      authorized: window.__EDUTRACK_SCHOOL_SESSION_AUTHORIZED__ === true
    }));
    assert.equal(state.loginDisplay, 'none');
    assert.equal(state.overlayActive, false);
    assert.deepEqual(state.route, ['SCHOOL', 'HEADTEACHER', 'Ashanti', 'Kumasi Metro']);
    assert.equal(state.staffId, 'SERVER-STAFF');
    assert.equal(state.authorized, true);
    assert.equal(state.upperHidden, true);
    assert.equal(state.scopeActivated, true);
    await page.close();
    const forged = await browser.newPage();
    await forged.route('http://school-refresh.test/', route => route.fulfill({ contentType:'text/html', body:'<!doctype html><html><body><div id="login-screen"></div><div id="loginSuccessOverlay"></div><div id="sg-school-level"></div></body></html>' }));
    await forged.route('**/api/auth/session', route => route.fulfill({ status:401, contentType:'application/json', body:JSON.stringify({error:'Authentication required'}) }));
    await forged.goto('http://school-refresh.test/');
    await forged.evaluate(() => { localStorage.setItem('v43_login_level','SCHOOL');localStorage.setItem('v43_login_role','HEADTEACHER');localStorage.setItem('v43_login_staffid','FORGED'); });
    await forged.addScriptTag({path:path.join(__dirname,'..','privileged-auth.js')});
    await forged.waitForFunction(() => localStorage.getItem('v43_login_level') === null);
    assert.equal(await forged.locator('#login-screen').evaluate(node => node.style.display), 'flex');
    assert.equal(await forged.evaluate(() => window.__EDUTRACK_SCHOOL_SESSION_AUTHORIZED__), false);
    await forged.close();
    console.log('School server-authoritative session restoration and tamper rejection regression suite passed.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
