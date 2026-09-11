'use strict';

const { chromium } = require('playwright');

const baseUrl = process.env.EDUTRACK_BASE_URL || 'http://127.0.0.1:3102';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const consoleErrors = [], pageErrors = [], failedRequests = [];
  page.on('console', entry => { if (entry.type() === 'error') consoleErrors.push(entry.text()); });
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('requestfailed', request => failedRequests.push({ url: request.url(), error: request.failure() && request.failure().errorText }));
  const startedAt = Date.now();
  try {
    await page.goto(baseUrl + '/', { waitUntil: 'domcontentloaded', timeout: 45000 });
    try { await page.waitForFunction(() => document.documentElement.dataset.appReady === 'true', null, { timeout: 15000 }); } catch (error) { /* state below makes a failed readiness gate diagnosable */ }
    const state = await page.evaluate(() => ({
      readyState: document.readyState,
      appReady: document.documentElement.dataset.appReady,
      schoolCard: Boolean(document.querySelector('.login-level-btn[data-level="SCHOOL"]')),
      studentCard: Boolean(document.querySelector('#sd-login-btn')),
      loginButton: Boolean(document.querySelector('#v43LoginBtn'))
    }));
    if (state.appReady !== 'true' || !state.schoolCard || !state.studentCard || !state.loginButton) throw new Error('The login shell is incomplete: ' + JSON.stringify(state));
    console.log(JSON.stringify({ status: 'PASS', elapsedMs: Date.now() - startedAt, state, consoleErrors, pageErrors, failedRequests }));
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
