'use strict';
const assert = require('assert');
const { chromium } = require('playwright');
const base = process.env.EDUTRACK_STAGING_BASE_URL;
if (!base) { console.log('Part 43 staging browser: BLOCKED (authorized staging URL unavailable).'); process.exit(0); }
const url = new URL(base);
assert.strictEqual(url.protocol, 'https:');
assert.ok(!/^(localhost|127\.0\.0\.1|::1)$/.test(url.hostname));
(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const response = await page.request.get(new URL('/api/health', base).toString());
    assert.strictEqual(response.status(), 200);
    assert.strictEqual((await response.json()).ok, true);
    console.log(`Part 43 staging health passed for ${url.origin}.`);
  } finally { await browser.close(); }
})().catch((error) => { console.error(error.stack); process.exitCode = 1; });
