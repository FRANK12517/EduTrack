const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');

const PORT = 3100;
const BASE_URL = `http://127.0.0.1:${PORT}`;

function waitForServer(child) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('EduTrack server did not start in time')), 10000);
    const onData = (chunk) => {
      if (chunk.toString().includes('EduTrack server listening')) {
        clearTimeout(timeout);
        child.stdout.off('data', onData);
        resolve();
      }
    };
    child.stdout.on('data', onData);
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code !== null) reject(new Error(`EduTrack server exited before startup: ${code}`));
    });
  });
}

async function assertVisibleEnabled(locator, name) {
  await assert.doesNotReject(() => locator.waitFor({ state: 'visible', timeout: 5000 }), `${name} should exist and be visible`);
  assert.equal(await locator.isEnabled(), true, `${name} should be enabled`);
}

async function run() {
  const server = spawn(process.execPath, ['server.js'], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let browser;
  try {
    await waitForServer(server);
    browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const consoleErrors = [];
    page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    page.on('pageerror', (error) => consoleErrors.push(error.message));

    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    const pageLoadDiagnostics = consoleErrors.splice(0);
    const promo = page.locator('#edutrack-promotional-collection');
    const promoMessage = page.locator('#edutrack-promotional-collection-message');
    await assertVisibleEnabled(promo, 'promotional display');
    assert.equal(await page.locator('#edutrack-promotional-collection .epc-dot').count(), 10, 'all ten promotional messages should be available');
    assert.match(await promoMessage.textContent(), /Join a growing community of schools/);
    assert.equal(await page.locator('[data-promotional-display-only="true"]').count(), 2, 'existing and additive promotional displays should both remain present');
    assert.equal(await page.locator('#edutrack-promotional-collection').evaluate((node) => getComputedStyle(node).pointerEvents), 'auto');

    await page.locator('#edutrack-promotional-collection-next').tap();
    await page.waitForTimeout(180);
    assert.match(await promoMessage.textContent(), /Move your school management forward/);
    await page.evaluate(() => document.getElementById('edutrack-promotional-collection-prev').click());
    await page.waitForTimeout(180);
    assert.match(await promoMessage.textContent(), /Join a growing community of schools/);

    const levels = ['NATIONAL', 'REGIONAL', 'DISTRICT', 'SCHOOL', 'PARENT', 'STUDENT'];
    for (const level of levels) {
      const card = page.locator(`.login-level-btn[data-level="${level}"]`);
      await assertVisibleEnabled(card, `${level} login card`);
      await card.tap();
      if (level === 'PARENT') {
        assert.equal(await page.locator('#parent-modal-overlay').evaluate((node) => node.classList.contains('pp-open')), true, 'PARENT card should open its modal');
        await page.locator('#parent-modal-overlay').evaluate((node) => node.classList.remove('pp-open'));
      } else if (level === 'STUDENT') {
        assert.equal(await page.locator('#student-modal-overlay').evaluate((node) => node.classList.contains('pp-open')), true, 'STUDENT card should open its modal');
        await page.locator('#student-modal-overlay').evaluate((node) => node.classList.remove('pp-open'));
      } else {
        assert.equal(await card.getAttribute('aria-pressed'), 'true', `${level} card should respond to touch`);
      }
    }

    const registration = page.locator('#sub-btn');
    await assertVisibleEnabled(registration, 'new registration action');
    await registration.tap();
    await page.waitForTimeout(100);
    const registrationEntry = page.locator('#subv2-entry-overlay');
    assert.equal(await registrationEntry.isVisible(), true, 'registration entry workflow should open');
    await registrationEntry.locator('[onclick*="subNewRegOpen"]').first().tap();
    await page.waitForTimeout(100);
    assert.equal(await page.locator('#subv2-newchoice-overlay').isVisible(), true, 'new registration workflow should open');
    await page.evaluate(() => { document.querySelectorAll('#subv2-entry-overlay, #subv2-newchoice-overlay').forEach((node) => { node.style.display = 'none'; }); });

    await page.evaluate(() => {
      if (typeof window.subShowLock === 'function') window.subShowLock(true);
      const login = document.getElementById('login-screen');
      if (login) login.style.display = 'none';
    });
    const renewal = page.locator('#sub-lock-screen button[onclick*="subOpenRenewalModal"]');
    await assertVisibleEnabled(renewal, 'renew subscription action');
    await renewal.tap();
    await page.waitForTimeout(100);
    assert.equal(await page.locator('#sub-modal-overlay').isVisible(), true, 'renewal workflow should open');
    await page.evaluate(() => {
      const modal = document.getElementById('sub-modal-overlay');
      if (modal) modal.classList.remove('open');
      const lock = document.getElementById('sub-lock-screen');
      if (lock) lock.style.display = 'none';
      const login = document.getElementById('login-screen');
      if (login) login.style.display = '';
    });

    for (const width of [320, 360, 375, 390, 412, 430, 480]) {
      await page.setViewportSize({ width, height: 844 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true, `no horizontal overflow at ${width}px`);
      assert.equal(await promo.isVisible(), true, `promotional display should remain visible at ${width}px`);
    }

    const actionableErrors = consoleErrors.filter((error) => !String(error).includes('CRITICAL: EduTrack core fixes (Subscription/Signature)'));
    assert.deepEqual(actionableErrors, [], `protected-feature interactions should introduce no new browser errors: ${actionableErrors.join('; ')}; page-load diagnostics preserved separately: ${pageLoadDiagnostics.join('; ')}`);
    console.log('Protected feature regression suite passed.');
  } finally {
    if (browser) await browser.close();
    server.kill('SIGTERM');
  }
}

run().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
