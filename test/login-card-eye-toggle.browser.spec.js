'use strict';

const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const port = 3453;

async function waitForServer() {
  for (let i = 0; i < 40; i += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (response.status < 500) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  throw new Error('local EduTrack server did not start');
}

async function assertInsideField(page, id) {
  const state = await page.locator(`#${id}`).evaluate(input => {
    const wrap = input.closest('.v43-input-toggle-wrap');
    const eye = wrap && wrap.querySelector('.v43-eye-toggle');
    const inputRect = input.getBoundingClientRect();
    const eyeRect = eye && eye.getBoundingClientRect();
    const style = eye && getComputedStyle(eye);
    return {
      hasWrapper: Boolean(wrap),
      hasEye: Boolean(eye),
      inside: Boolean(eyeRect && eyeRect.left >= inputRect.left && eyeRect.right <= inputRect.right && eyeRect.top >= inputRect.top && eyeRect.bottom <= inputRect.bottom),
      position: style && style.position,
      focusable: eye && eye.tagName === 'BUTTON' && !eye.disabled,
      ariaControls: eye && eye.getAttribute('aria-controls'),
      initialType: input.type
    };
  });
  assert.equal(state.hasWrapper, true, `${id} must remain inside the shared input wrapper`);
  assert.equal(state.hasEye, true, `${id} must retain its eye toggle`);
  assert.equal(state.inside, true, `${id} eye toggle must be visually inside the input`);
  assert.equal(state.position, 'absolute', `${id} eye toggle must use absolute inside-field positioning`);
  assert.equal(state.focusable, true, `${id} eye toggle must remain keyboard focusable`);
  assert.equal(state.ariaControls, id, `${id} eye toggle must retain aria-controls`);
  assert.equal(state.initialType, 'password');
}

async function assertTogglePreservesValue(page, id) {
  const input = page.locator(`#${id}`);
  const eye = input.locator('xpath=ancestor::div[contains(@class,"v43-input-toggle-wrap")]//button[contains(@class,"v43-eye-toggle")]');
  await input.fill('EDUTRACK-TEST-VALUE');
  await eye.click();
  assert.equal(await input.getAttribute('type'), 'text', `${id} should reveal its value`);
  assert.equal(await input.inputValue(), 'EDUTRACK-TEST-VALUE');
  assert.match(await eye.getAttribute('aria-label'), /^Hide /);
  await eye.click();
  assert.equal(await input.getAttribute('type'), 'password', `${id} should hide its value again`);
  assert.equal(await input.inputValue(), 'EDUTRACK-TEST-VALUE');
  assert.match(await eye.getAttribute('aria-label'), /^Show /);
}

(async () => {
  const server = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, NODE_ENV: 'development', PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  try {
    await waitForServer();
    const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true });
    try {
      for (const viewport of [{ width: 1280, height: 900 }, { width: 414, height: 896 }]) {
        const page = await browser.newPage({ viewport, hasTouch: viewport.width < 600, isMobile: viewport.width < 600 });
        await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded' });
        await page.locator('#sd-login-btn').waitFor({ state: 'attached', timeout: 5000 });
        const levels = await page.locator('.login-level-btn').evaluateAll(nodes => nodes.map(node => node.dataset.level));
        assert.deepEqual(levels.slice().sort(), ['DISTRICT', 'NATIONAL', 'PARENT', 'REGIONAL', 'SCHOOL', 'STUDENT'], 'all six login cards must remain available');
        assert.equal(await page.locator('.login-level-btn').count(), 6);

        await page.locator('.login-level-btn[data-level="SCHOOL"]').click();
        await page.locator('#v43-school-access-code').waitFor();
        await assertInsideField(page, 'v43-school-access-code');
        await assertInsideField(page, 'v43-staffId');
        await assertTogglePreservesValue(page, 'v43-school-access-code');
        await assertTogglePreservesValue(page, 'v43-staffId');

        await page.locator('.login-level-btn[data-level="DISTRICT"]').click();
        await page.locator('#v43-access-code').waitFor();
        await assertInsideField(page, 'v43-access-code');
        await assertInsideField(page, 'v43-staffId');
        await assertTogglePreservesValue(page, 'v43-access-code');
        await assertTogglePreservesValue(page, 'v43-staffId');
        await page.close();
      }
      console.log('Login-card eye-toggle placement, accessibility, behavior, and six-card preservation regression passed.');
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
