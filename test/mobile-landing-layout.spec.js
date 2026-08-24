'use strict';

const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const width = Number(process.env.EDUTRACK_LAYOUT_WIDTH || 390);
  const height = Number(process.env.EDUTRACK_LAYOUT_HEIGHT || 844);
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1, isMobile: true });
  await page.goto(process.env.EDUTRACK_LAYOUT_URL || 'https://www.edutrackgh.online/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(1500);
  const result = await page.evaluate(() => {
    const selectors = ['html', 'body', '#login-screen', '#login-shell', '.login-card', '.login-level-grid', '.login-level-btn'];
    const read = (selector) => {
      const node = document.querySelector(selector);
      if (!node) return null;
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return {
        selector,
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        clientWidth: node.clientWidth,
        scrollWidth: node.scrollWidth,
        computedWidth: style.width,
        maxWidth: style.maxWidth,
        minWidth: style.minWidth,
        display: style.display,
        flexDirection: style.flexDirection,
        flexShrink: style.flexShrink,
        gridTemplateColumns: style.gridTemplateColumns,
        padding: style.padding,
        margin: style.margin,
        overflowX: style.overflowX,
        overflowY: style.overflowY
      };
    };
    return {
      viewport: { width: innerWidth, height: innerHeight },
      bodyScrollWidth: document.body.scrollWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
      nodes: selectors.map(read),
      directChildren: Array.from(document.querySelector('#login-screen')?.children || []).map((node) => {
        const rect = node.getBoundingClientRect();
        const style = getComputedStyle(node);
        return { tag: node.tagName, id: node.id, className: node.className, rect: { x: rect.x, width: rect.width, height: rect.height }, display: style.display, position: style.position, flex: style.flex, flexShrink: style.flexShrink, width: style.width, maxWidth: style.maxWidth };
      }),
      visibleText: document.querySelector('#login-screen')?.innerText?.slice(0, 240) || ''
    };
  });
  const loginScreen = result.nodes.find((node) => node?.selector === '#login-screen');
  const loginShell = result.nodes.find((node) => node?.selector === '#login-shell');
  const loginCard = result.nodes.find((node) => node?.selector === '.login-card');
  const failures = [];
  if (!loginScreen || loginScreen.rect.width < result.viewport.width - 1) failures.push('#login-screen is not full viewport width');
  const rootHorizontalPadding = loginScreen ? parseFloat(loginScreen.padding.split(' ')[1] || loginScreen.padding) || 0 : 0;
  if (!loginShell || loginShell.rect.width < result.viewport.width - 2 * rootHorizontalPadding - 1) failures.push('#login-shell is not full available mobile width');
  if (!loginCard || loginCard.rect.width < (loginShell?.rect.width || 0) - 1) failures.push('.login-card is narrower than #login-shell');
  if (loginScreen?.flexDirection !== 'column') failures.push('#login-screen is not a single-column flex layout');
  if (result.bodyScrollWidth > result.viewport.width || result.documentScrollWidth > result.viewport.width) failures.push('mobile landing layout overflows horizontally');
  console.log(JSON.stringify({ ...result, regression: { passed: failures.length === 0, failures } }, null, 2));
  await browser.close();
  if (failures.length) process.exitCode = 1;
})();
