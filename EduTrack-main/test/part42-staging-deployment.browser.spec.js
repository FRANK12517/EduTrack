'use strict';
const assert = require('assert');
const { chromium } = require('playwright');
const base = process.env.EDUTRACK_STAGING_BASE_URL;
if (!base) {
  console.log('Part 42 staging browser: BLOCKED (EDUTRACK_STAGING_BASE_URL is unavailable).');
  process.exit(0);
}
const url = new URL(base);
assert.strictEqual(url.protocol, 'https:');
assert.ok(!['localhost', '127.0.0.1', '::1'].includes(url.hostname));
(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const response = await browser.newPage().then((page) => page.request.get(new URL('/api/health', base).toString()));
    assert.strictEqual(response.status(), 200);
    assert.strictEqual((await response.json()).ok, true);
    console.log(`Part 42 staging browser health passed for ${url.origin}.`);
  } finally { await browser.close(); }
})().catch((error) => { console.error(error.stack); process.exitCode = 1; });
