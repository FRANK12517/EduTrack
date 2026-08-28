'use strict';

const assert = require('assert');
const { chromium } = require('playwright');

const baseUrl = process.env.EDUTRACK_STAGING_BASE_URL;
if (!baseUrl) {
  console.log('Part 39 staging browser checks: NOT_PROVEN (EDUTRACK_STAGING_BASE_URL is not configured).');
  process.exit(0);
}

const parsed = new URL(baseUrl);
assert.strictEqual(parsed.protocol, 'https:', 'staging verification requires HTTPS');
assert.ok(!['localhost', '127.0.0.1', '::1'].includes(parsed.hostname), 'staging verification must not use localhost');

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const healthResponse = await page.request.get(new URL('/api/health', baseUrl).toString());
    assert.strictEqual(healthResponse.status(), 200);
    const health = await healthResponse.json();
    assert.strictEqual(health.ok, true);

    const sessionResponse = await page.request.get(new URL('/api/auth/session', baseUrl).toString());
    assert.notStrictEqual(sessionResponse.status(), 404);
    assert.ok([200, 401].includes(sessionResponse.status()));

    console.log(`Part 39 staging browser checks passed for ${parsed.origin}.`);
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
