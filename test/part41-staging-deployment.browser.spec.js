'use strict';
const assert = require('assert');
const { chromium } = require('playwright');
const baseUrl = process.env.EDUTRACK_STAGING_BASE_URL;
if (!baseUrl) {
  console.log('Part 41 staging browser checks: BLOCKED (EDUTRACK_STAGING_BASE_URL is not configured).');
  process.exit(0);
}
const url = new URL(baseUrl);
assert.strictEqual(url.protocol, 'https:');
assert.ok(!['localhost', '127.0.0.1', '::1'].includes(url.hostname));
(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const health = await page.request.get(new URL('/api/health', baseUrl).toString());
    assert.strictEqual(health.status(), 200);
    const json = await health.json();
    assert.strictEqual(json.ok, true);
    const session = await page.request.get(new URL('/api/auth/session', baseUrl).toString());
    assert.notStrictEqual(session.status(), 404);
    assert.notStrictEqual(session.status(), 500);
    console.log(`Part 41 staging browser checks passed for ${url.origin}.`);
  } finally { await browser.close(); }
})().catch((error) => { console.error(error.stack); process.exitCode = 1; });
