'use strict';

const assert = require('assert');
const path = require('path');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.EDUTRACK_BROWSER_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  });
  const page = await browser.newPage();
  await page.setContent(`<!doctype html><html><head><style>
    *{box-sizing:border-box}html,body{margin:0}.result-slip{width:650px;height:1000px}
    .slip-watermark img{opacity:.08}.tbl-wrap{width:100%}.gw-pa-box{width:22px;height:22px}
  </style></head><body>
    <main id="host"><div class="result-slip"><div class="slip-watermark"><img src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=="></div></div></main>
    <section id="page-fms-receipts"><div class="tbl-wrap"><table><tr>${'<td>Financial column</td>'.repeat(12)}</tr></table></div></section>
    <section id="page-pupils"><div class="gw-table-wrap"><table class="gw-table"><tr><td class="left">Student Name</td><td><button class="gw-pa-box">P</button></td></tr></table><div class="gw-submit-bar"><button class="gw-submit-btn">Submit</button></div></div></section>
  </body></html>`);
  await page.addScriptTag({ path: path.join(__dirname, '..', 'individual-result-slip-fix.js') });

  for (const width of [320, 360, 375, 390, 412, 430]) {
    await page.setViewportSize({ width, height: 800 });
    await page.evaluate(() => window.EDUTRACK_RESIZE_RESULT_SLIPS());
    const box = await page.locator('.result-slip').boundingBox();
    assert.ok(box.width <= width + 0.5, `slip fits ${width}px viewport`);
    assert.ok(box.x >= -0.5 && box.x + box.width <= width + 0.5, `slip is not clipped at ${width}px`);
  }

  const touch = await page.locator('.gw-pa-box').boundingBox();
  assert.ok(touch.width >= 44 && touch.height >= 44, 'attendance control has a 44px touch target');
  const feeOverflow = await page.locator('#page-fms-receipts .tbl-wrap').evaluate(el => ({ client: el.clientWidth, scroll: el.scrollWidth, overflow: getComputedStyle(el).overflowX }));
  assert.strictEqual(feeOverflow.overflow, 'auto', 'Fee Hub table wrapper scrolls horizontally');
  assert.ok(feeOverflow.scroll >= feeOverflow.client, 'Fee Hub retains its wide table content');
  const opacity = await page.locator('.slip-watermark img').evaluate(el => getComputedStyle(el).opacity);
  assert.strictEqual(opacity, '0.14', 'watermark is identifiable in screen preview');

  await page.emulateMedia({ media: 'print' });
  const print = await page.locator('.result-slip').evaluate(el => ({ transform: getComputedStyle(el).transform, color: getComputedStyle(el).color }));
  assert.strictEqual(print.transform, 'none', 'print output does not retain mobile transform');
  assert.strictEqual(print.color, 'rgb(0, 0, 0)', 'official print text is black');

  await browser.close();
  console.log('PASS part67 browser viewports 320, 360, 375, 390, 412, and 430');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
