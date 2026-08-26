'use strict';
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const port = 3455;

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
      const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
      await page.route('**/api/admissions/options**', async route => {
        const url = new URL(route.request().url());
        if (url.searchParams.has('schoolId')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ classes: [{ id: 'class-kg1', name: 'KG 1' }] }) });
        if (url.searchParams.has('districtId')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ schools: [{ id: 'school-1', name: 'Demo Registered School' }] }) });
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ regions: [{ id: 'Ahafo', name: 'Ahafo' }], districts: [{ id: 'district-1', name: 'Asunafo North', region_id: 'Ahafo' }] }) });
      });
      await page.route('**/api/admissions/selection/validate', async route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ valid: true, context: { admissionType: 'NEW', regionId: 'Ahafo', districtId: 'district-1', schoolId: 'school-1', level: 'KG', classId: 'class-kg1', className: 'KG 1', nextStage: 'NEW_ADMISSION_FORM' } }) }));
      await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded' });
      await page.evaluate(() => window.EMS_PARENT_PORTAL.openModal());
      await page.locator('#online-admission-entry').click();
      await page.locator('#oa-region').waitFor({ state: 'visible' });
      await page.locator('#oa-type').selectOption('NEW');
      await page.locator('#oa-region').selectOption('Ahafo');
      await page.locator('#oa-district').selectOption('district-1');
      await page.locator('#oa-school').selectOption('school-1');
      await page.locator('#oa-level').selectOption('KG');
      await page.locator('#oa-class').selectOption('class-kg1');
      await page.locator('#oa-continue').waitFor({ state: 'visible' });
      assert.equal(await page.locator('#oa-continue').isDisabled(), false, 'Continue should be enabled for a complete valid selection');
      await page.locator('#oa-continue').click();
      await page.locator('#oa-form-overlay').waitFor({ state: 'visible' });
      assert.equal(await page.locator('#online-admission-overlay').count(), 0, 'selection overlay should close before the next form opens');
      assert.match(await page.locator('#oa-form-overlay').textContent(), /New Admission Application/);
      await page.locator('#oa-form-cancel').click();
      assert.equal(await page.locator('#oa-form-overlay').count(), 0, 'cancel should close the next admission form');
      console.log('Online Admission Continue → next form regression passed.');
    } finally { await browser.close(); }
  } finally {
    server.kill('SIGTERM');
    await new Promise(resolve => server.once('close', resolve));
  }
})().catch(error => { console.error(error.stack || error); process.exit(1); });
