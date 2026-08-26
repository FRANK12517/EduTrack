'use strict';
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const port = 3453;

(async () => {
  const server = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: { ...process.env, NODE_ENV: 'development', PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    let started = false;
    for (let i = 0; i < 40 && !started; i += 1) {
      try { const response = await fetch(`http://127.0.0.1:${port}/api/health`); started = response.status < 500; } catch {}
      if (!started) await new Promise(resolve => setTimeout(resolve, 150));
    }
    assert.equal(started, true, 'local EduTrack server did not start');
    const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 414, height: 693 }, hasTouch: true, isMobile: true });
      await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded' });
      await page.evaluate(() => window.EMS_PARENT_PORTAL.openModal());
      await page.locator('#online-admission-entry').click();
      await page.locator('#online-admission-overlay').waitFor({ state: 'visible' });
      await page.waitForTimeout(250);
      const state = await page.evaluate(() => {
        const map = window.GH_REGIONS_DISTRICTS || {};
        const region = document.getElementById('oa-region');
        const district = document.getElementById('oa-district');
        const error = document.getElementById('oa-error');
        const firstRegion = Object.keys(map).sort()[0];
        region.value = firstRegion || '';
        region.dispatchEvent(new Event('change', { bubbles: true }));
        return {
          firstRegion,
          regionOptions: Array.from(region.options).map(option => option.value).filter(Boolean),
          expectedDistricts: (map[firstRegion] || []).slice().sort(),
          districtOptions: Array.from(district.options).map(option => option.value).filter(Boolean),
          districtDisabled: district.disabled,
          errorText: error.textContent.trim()
        };
      });
      assert.ok(state.firstRegion, 'shared login region map is unavailable');
      assert.deepEqual(state.regionOptions, Object.keys(await page.evaluate(() => window.GH_REGIONS_DISTRICTS)).sort());
      assert.deepEqual(state.districtOptions, state.expectedDistricts);
      assert.equal(state.districtDisabled, false);
      assert.equal(state.errorText, '');
      await page.locator('#oa-cancel').click();
      assert.equal(await page.locator('#online-admission-overlay').count(), 0);
      console.log(JSON.stringify(state));
      console.log('Online Admission Region → District cascade regression passed.');
    } finally { await browser.close(); }
  } finally {
    server.kill('SIGTERM');
    await new Promise(resolve => server.once('close', resolve));
  }
})().catch(error => { console.error(error.stack || error); process.exit(1); });
