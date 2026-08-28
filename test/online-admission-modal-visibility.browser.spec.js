'use strict';
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const port = 3452;

(async () => {
  const server = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, NODE_ENV: 'development', PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  try {
    let started = false;
    for (let i = 0; i < 40 && !started; i += 1) {
      try {
        const response = await fetch(`http://127.0.0.1:${port}/api/health`);
        started = response.status < 500;
      } catch {}
      if (!started) await new Promise(resolve => setTimeout(resolve, 150));
    }
    assert.equal(started, true, 'local EduTrack server did not start');

    const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true });
    try {
      for (const viewport of [{ width: 1280, height: 800 }, { width: 414, height: 302 }]) {
        const page = await browser.newPage({ viewport, hasTouch: viewport.width < 600, isMobile: viewport.width < 600 });
        const consoleErrors = [];
        page.on('pageerror', error => consoleErrors.push(error.message));
        page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
        const response = await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded' });
        assert.equal(response.status(), 200);
        await page.evaluate(() => window.EMS_PARENT_PORTAL.openModal());
        const parent = page.locator('#parent-modal-overlay');
        const button = page.locator('#online-admission-entry');
        await button.waitFor({ state: 'visible', timeout: 5000 });
        await button.click();
        const selection = page.locator('#online-admission-overlay');
        await selection.waitFor({ state: 'visible', timeout: 5000 });
        const selectionState = await selection.evaluate(node => { const style = getComputedStyle(node); const rect = node.getBoundingClientRect(); return { display: style.display, visibility: style.visibility, zIndex: style.zIndex, width: rect.width, height: rect.height }; });
        assert.equal(await parent.evaluate(node => node.classList.contains('pp-open')), false);
        assert.equal(selectionState.visibility, 'visible');
        assert.ok(selectionState.width > 0 && selectionState.height > 0);
        await page.locator('#oa-cancel').click();
        assert.equal(await page.locator('#online-admission-overlay').count(), 0);

        await page.evaluate(() => window.EMS_PARENT_PORTAL.openModal());
        await button.waitFor({ state: 'visible', timeout: 5000 });
        await button.focus();
        await page.keyboard.press('Enter');
        await selection.waitFor({ state: 'visible', timeout: 5000 });
        await page.evaluate(() => window.EDUTRACK_ONLINE_ADMISSIONS.openForm({ admissionType: 'NEW', regionId: 'r', districtId: 'd', schoolId: 's', level: 'KG', classId: 'c', className: 'KG1' }));
        const form = page.locator('#oa-form-overlay');
        await form.waitFor({ state: 'visible', timeout: 5000 });
        const formState = await form.evaluate(node => { const style = getComputedStyle(node); const rect = node.getBoundingClientRect(); return { display: style.display, visibility: style.visibility, zIndex: style.zIndex, width: rect.width, height: rect.height }; });
        assert.equal(await page.locator('#online-admission-overlay').count(), 0);
        assert.equal(formState.visibility, 'visible');
        assert.ok(formState.width > 0 && formState.height > 0);
        await page.locator('#oa-form-cancel').click();
        assert.equal(await page.locator('#oa-form-overlay').count(), 0);
        assert.equal(await page.locator('#online-admission-overlay').count(), 0);
        assert.equal(await page.locator('#parent-modal-overlay.pp-open').count(), 0);
        console.log(JSON.stringify({ viewport, selectionState, formState, consoleErrorCount: consoleErrors.length }));
        await page.close();
      }
      console.log('Online Admission modal visibility regression passed.');
    } finally {
      await browser.close();
    }
  } finally {
    server.kill('SIGTERM');
    await new Promise(resolve => server.once('close', resolve));
  }
})().catch(error => { console.error(error.stack || error); process.exit(1); });
