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
    await page.waitForFunction(() => Array.isArray(window.__schoolRoute));
    const state = await page.evaluate(() => ({
      loginDisplay: document.getElementById('login-screen').style.display,
      overlayActive: document.getElementById('loginSuccessOverlay').classList.contains('show'),
      route: window.__schoolRoute,
      upperHidden: window.__upperHidden,
      scopeActivated: window.__scopeActivated
    }));
    assert.equal(state.loginDisplay, 'none');
    assert.equal(state.overlayActive, false);
    assert.deepEqual(state.route, ['SCHOOL', 'Headteacher', 'Western', 'Sekondi-Takoradi Metropolitan']);
    assert.equal(state.upperHidden, true);
    assert.equal(state.scopeActivated, true);
    await page.close();
    console.log('School authenticated refresh restoration regression suite passed.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
