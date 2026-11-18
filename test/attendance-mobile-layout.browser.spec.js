'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

async function main() {
  const browserOptions = { headless: true };
  if (process.env.EDUTRACK_BROWSER_PATH) browserOptions.executablePath = process.env.EDUTRACK_BROWSER_PATH;
  const browser = await chromium.launch(browserOptions);
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    const rendererStart = html.indexOf('function v84RenderEnhancedRegister() {');
    const rendererEnd = html.indexOf('\n// ── PAGE OBSERVER:', rendererStart);
    assert.ok(rendererStart >= 0 && rendererEnd > rendererStart, 'actual v84 attendance renderer exists');
    const renderer = html.slice(rendererStart, rendererEnd);
    const mobileStyleStart = html.indexOf('.v84-mobile-records { display:none }');
    assert.ok(mobileStyleStart >= 0, 'attendance mobile layout contract styles exist');
    const styleStart = html.lastIndexOf('<style', mobileStyleStart);
    const styleEnd = html.indexOf('</style>', mobileStyleStart);
    const attendanceStyles = html.slice(html.indexOf('>', styleStart) + 1, styleEnd);
    const statusSelect = html.match(/<select id="v84-att-status">[\s\S]*?<\/select>/);
    assert.ok(statusSelect, 'actual v84 single-select control exists');
    assert.match(html, /<label for="v84-att-status">Attendance Status/, 'status dropdown has an associated accessible label');
    await page.setContent(`<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>
      :root{--navy:#17324d;--white:#fff;--teal:#0b7285;--muted:#607286;--border:#dbe5ec}
      *{box-sizing:border-box}html,body{margin:0;width:100%;font:16px Arial,sans-serif}
      #page-teachers{width:100%;padding:12px}.attend-table-wrap{overflow-x:auto}
      .v84-attend-table{min-width:900px;width:100%}.v84-status-badge{display:inline-flex;align-items:center;justify-content:center;border:1px solid #789;border-radius:8px;min-width:38px;min-height:38px;background:#edf3f8;cursor:pointer}
      ${attendanceStyles}
    </style></head><body><main id="page-teachers"><div id="v84-enhanced-register"></div><div>${statusSelect[0]}</div></main></body></html>`);
    await page.evaluate(() => {
      window.v84OpenDetail = (index, date) => { window.lastOpenedAttendance = [index, date]; };
    });
    await page.evaluate(({ renderer }) => {
      const teachers = [
        { name: 'Alpha Long Name', staffId: 'STAFF-0000000000000000000001', designation: 'Class Teacher' },
        { name: 'Beta Teacher', staffId: 'STAFF-0002', designation: 'Head Teacher' },
        { name: 'Gamma Teacher', staffId: 'STAFF-0003', designation: 'Assistant' }
      ];
      const details = {
        'v84_detail|0|2026-10-05': { status: 'P', timeIn: '07:30', timeOut: '15:00', reasonLate: 'Roadworks' },
        'v84_detail|1|2026-10-05': { status: 'AB' }
      };
      const statuses = {
        P:{label:'Present',short:'P'},AB:{label:'Absent',short:'AB'},EX:{label:'Excused',short:'EX'},SL:{label:'Sick Leave',short:'SL'},
        SDL:{label:'Study Leave',short:'SDL'},OD:{label:'Official Duty',short:'OD'},ML:{label:'Maternity Leave',short:'ML'},
        PL:{label:'Paternity Leave',short:'PL'},AL:{label:'Annual Leave',short:'AL'},LT:{label:'Late',short:'LT'}
      };
      const escapeHtml = value => String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
      const render = new Function('TEACHERS','currentWeekStart','v84DetailData','v84TeachersExt','v84DetailKey','V84_STATUSES','dateToStr','esc','v84LegacyStatus', renderer + '; return v84RenderEnhancedRegister;')(
        teachers,new Date(2026,9,5),details,{},(index,date)=>'v84_detail|'+index+'|'+date,statuses,
        date=>date.toISOString().slice(0,10),escapeHtml,legacy=>legacy==='AW'?'EX':legacy);
      render();
    }, { renderer });

    const mobileWidths = [320, 360, 375, 390, 430];
    const allWidths = [...mobileWidths, 768, 1024, 1280];
    const widthResults = [];
    for (const width of allWidths) {
      await page.setViewportSize({ width, height: 844 });
      const measurements = await page.evaluate(() => {
        const root = document.getElementById('page-teachers');
        const wrap = document.querySelector('#v84-enhanced-register .attend-table-wrap');
        const cards = [...document.querySelectorAll('.v84-mobile-record')];
        return {
          docWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
          pageWidth: root.scrollWidth,
          cardsVisible: getComputedStyle(document.querySelector('.v84-mobile-records')).display !== 'none',
          wrapVisible: getComputedStyle(wrap).display !== 'none',
          cardWidths: cards.map(card => ({ scroll: card.scrollWidth, client: card.clientWidth })),
          order: cards.map(card => card.dataset.teacherIndex),
          labels: cards[0] ? [...cards[0].querySelectorAll('.v84-mobile-field-label')].map(node => node.textContent) : []
        };
      });
      assert.ok(measurements.docWidth <= measurements.clientWidth, `${width}px: document overflows horizontally (${measurements.docWidth}/${measurements.clientWidth})`);
      widthResults.push(`${width}px ${measurements.docWidth}/${measurements.clientWidth}`);
      assert.deepEqual(measurements.order, ['0', '1', '2'], `${width}px: staff order remains stable`);
      if (width <= 600) {
        assert.equal(measurements.cardsVisible, true, `${width}px: mobile cards are visible`);
        assert.equal(measurements.wrapVisible, false, `${width}px: matrix is replaced visually`);
        assert.deepEqual(measurements.labels, ['STAFF ID', 'STAFF NAME/MEMBER', 'POSITION/ROLE', 'ATTENDANCE STATUS', 'REPORTING TIME', 'REASONS/REMARKS']);
        assert.ok(measurements.cardWidths.every(item => item.scroll <= item.client), `${width}px: cards fit their container`);
      } else {
        assert.equal(measurements.cardsVisible, false, `${width}px: desktop matrix remains visible without mobile cards`);
        assert.equal(measurements.wrapVisible, true, `${width}px: desktop matrix remains available`);
      }
    }

    await page.setViewportSize({ width: 844, height: 390 });
    const landscape = await page.evaluate(() => ({
      documentWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      cardsVisible: getComputedStyle(document.querySelector('.v84-mobile-records')).display !== 'none',
      cardWidths: [...document.querySelectorAll('.v84-mobile-record')].map(card => card.scrollWidth <= card.clientWidth)
    }));
    assert.ok(landscape.cardsVisible, 'phone landscape retains the vertical record cards');
    assert.ok(landscape.documentWidth <= landscape.clientWidth, 'phone landscape has no horizontal page overflow');
    assert.ok(landscape.cardWidths.every(Boolean), 'phone landscape cards fit without nested horizontal scrolling');

    await page.setViewportSize({ width: 320, height: 844 });
    await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
    const enlargedText = await page.evaluate(() => ({
      documentWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      cardWidths: [...document.querySelectorAll('.v84-mobile-record')].map(card => card.scrollWidth <= card.clientWidth)
    }));
    assert.ok(enlargedText.documentWidth <= enlargedText.clientWidth, '200% text reflow has no horizontal page overflow');
    assert.ok(enlargedText.cardWidths.every(Boolean), '200% text reflows within every card');

    await page.setViewportSize({ width: 320, height: 844 });
    const fixtureValues = await page.locator('.v84-mobile-record').evaluateAll(cards => cards.map(card => card.innerText));
    assert.match(fixtureValues[0], /STAFF-0000000000000000000001[\s\S]*Alpha Long Name[\s\S]*P[\s\S]*07:30–15:00[\s\S]*Roadworks/, 'first staff values stay associated in their record');
    assert.match(fixtureValues[1], /STAFF-0002[\s\S]*Beta Teacher[\s\S]*AB/, 'second staff status stays associated with the second record');
    await page.locator('body').press('Tab');
    const focusedControl = await page.evaluate(() => ({
      label: document.activeElement.getAttribute('aria-label'),
      outline: getComputedStyle(document.activeElement).outlineStyle
    }));
    assert.match(focusedControl.label || '', /Present for 2026-10-05/, 'keyboard focus begins on the first record control');
    assert.equal(focusedControl.outline, 'solid', 'keyboard focus has a visible outline');
    await page.keyboard.press('Enter');
    assert.deepEqual(await page.evaluate(() => window.lastOpenedAttendance), [0, '2026-10-05'], 'status action retains its teacher and date association');
    const statuses = await page.locator('#v84-att-status option').evaluateAll(options => options.map(option => ({ value: option.value, label: option.textContent.trim() })));
    assert.equal(await page.locator('#v84-att-status').evaluate(select => select.multiple), false, 'attendance status remains single-selection');
    assert.deepEqual(statuses.map(option => option.value), ['', 'P', 'AB', 'EX', 'SL', 'SDL', 'OD', 'ML', 'PL', 'AL', 'LT'], 'the full canonical status option set is preserved');
    assert.equal(await page.locator('.v84-mobile-records .v84-mobile-record').count(), 3, 'all fixture records remain accessible below the fold');
    const lastRecord = page.locator('.v84-mobile-record').last();
    await lastRecord.scrollIntoViewIfNeeded();
    assert.ok(await lastRecord.evaluate(node => { const rect=node.getBoundingClientRect();return rect.top<innerHeight&&rect.bottom>0; }), 'the last record is reachable by vertical scrolling');
    assert.ok(pageErrors.every(error => !/TypeError|ReferenceError/.test(error)), `no attendance runtime errors: ${pageErrors.join('; ')}`);
    console.log(`PASS attendance mobile layout: ${widthResults.join(', ')}; phone landscape; 200% text; keyboard focus; six-field order; record association and vertical access`);
    await context.close();
  } finally {
    await browser.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
