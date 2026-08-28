'use strict';
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const port = 3451;

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
      const page = await browser.newPage({ viewport: { width: 414, height: 302 }, hasTouch: true, isMobile: true });
      const response = await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded' });
      assert.equal(response.status(), 200);
      await page.evaluate(() => window.EMS_PARENT_PORTAL.openModal());
      const button = page.locator('#online-admission-entry');
      await button.waitFor({ state: 'attached', timeout: 5000 });
      assert.equal(await button.getAttribute('type'), 'button');
      assert.equal(await button.getAttribute('aria-label'), 'Open Online Admission');
      assert.equal(await button.getAttribute('title'), 'Open Online Admission');
      await button.click();
      await page.locator('#online-admission-overlay').waitFor({ state: 'attached', timeout: 5000 });
      assert.equal(await page.locator('#oa-type').count(), 1);
      assert.equal(await page.locator('#oa-region').count(), 1);
      console.log('Online Admission button browser regression passed.');
    } finally {
      await browser.close();
    }
  } finally {
    server.kill('SIGTERM');
    await new Promise(resolve => server.once('close', resolve));
  }
})().catch(error => {
  console.error(error.stack || error);
  process.exit(1);
});
