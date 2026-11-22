'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const MODULE_PATH = path.resolve(__dirname, '..', 'ges-teacher-assessment.js');
const HTML_SOURCE = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8').replace(/\r\n/g, '\n');

function extractPrintBuilder(signature, endMarker, exportedName) {
  const start = HTML_SOURCE.indexOf(signature);
  const end = HTML_SOURCE.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, `could locate actual print builder ${signature}`);
  return HTML_SOURCE.slice(start, end).replace(signature, `window.${exportedName} = function() {`);
}

const EXAM_PRINT_BUILDER = extractPrintBuilder(
  'function v83BuildPrintableSlip() {', '\n/**\n * v83: exportSlipPDF', '__edutrackExamPrint'
);
const MOCK_PRINT_BUILDER = extractPrintBuilder(
  'function gmrBuildPrintableSlip() {', '\n  function exportSlipPDF()', '__edutrackMockPrint'
);

function examSlip(student, cls, year, term) {
  return `<div class="result-slip"><div class="slip-info-grid"><div class="slip-info-item">${student}</div><div class="slip-info-item">${cls}</div><div class="slip-info-item">${year}</div><div class="slip-info-item">${term}</div></div>
    <div class="slip-rem-group"><label class="slip-rem-label">Conduct</label><button id="slip-conduct-disp" class="no-print">Choose</button><select id="slip-conduct"><option value=""></option></select></div>
    <div class="slip-rem-group"><label class="slip-rem-label">Interest</label><button id="slip-interest-disp" class="no-print">Choose</button><select id="slip-interest"><option value=""></option></select></div>
    <div class="slip-rem-group"><label class="slip-rem-label">Attitude</label><button id="slip-attitude-disp" class="no-print">Choose</button><select id="slip-attitude"><option value=""></option></select></div>
    <div class="slip-rem-group"><label class="slip-rem-label">Class Teacher</label><button id="slip-ct-remarks-disp" class="no-print">Choose</button><select id="slip-ct-remarks"><option value=""></option></select></div>
    <div class="slip-rem-group"><label class="slip-rem-label">Headteacher</label><button id="slip-ht-remarks-disp" class="no-print">Choose</button><select id="slip-ht-remarks"><option value=""></option></select></div>
    <div class="slip-school">EduTrack School</div><div class="slip-results-section"><table><tr><td>Mathematics</td><td>90</td><td>Grade 1</td></tr></table></div>
    <div class="slip-sig-box"><img alt="signature"></div></div>`;
}

function mockSlip() {
  return `<div class="result-slip"><div class="slip-info-grid">STUDENT MOCK JHS 1 2025/2026 Term 1</div><section class="ges-assessment-print-values"><p>Conduct: <span data-ges-comment="conduct"></span></p><p>Interest: <span data-ges-comment="interest"></span></p><p>Attitude: <span data-ges-comment="attitude"></span></p><p>Class Teacher: <span data-ges-comment="ctRemarks"></span></p><p>Headteacher: <span data-ges-comment="htRemarks"></span></p></section><div>Mathematics 85 Grade 2</div><select id="mock-score"><option>85</option></select><button class="btn no-print">Administrative control</button><div class="slip-sig-box"><img alt="signature"></div></div>`;
}

async function run() {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.EDUTRACK_BROWSER_PATH || (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined), args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    // The test sandbox blocks loopback navigation. Provide the same minimal
    // getItem/setItem storage contract so the actual module can exercise its
    // context-keyed restore behavior without network or database services.
    await page.setContent(`<input id="slip-index"><input id="gmr-year"><input id="gmr-term">
      <div id="exam-wrap"><div id="slip-container"></div></div><div id="mock-wrap"><div id="gmr-slip-container"></div></div>`);
    await page.evaluate(() => {
      const data = new Map();
      Object.defineProperty(window, 'localStorage', { configurable:true, value:{
        getItem(key){ return data.has(String(key)) ? data.get(String(key)) : null; },
        setItem(key,value){ data.set(String(key),String(value)); },
        removeItem(key){ data.delete(String(key)); },
        clear(){ data.clear(); }
      }});
    });
    await page.addScriptTag({ path: MODULE_PATH });
    await page.addScriptTag({ content: `${EXAM_PRINT_BUILDER}\n${MOCK_PRINT_BUILDER}` });

    await page.evaluate(({ html }) => {
      window.examSaved = [];
      window.saveSlipRemarks = (index) => window.examSaved.push({
        index,
        conduct: document.getElementById('slip-conduct')?.value || '',
        interest: document.getElementById('slip-interest')?.value || ''
      });
      document.getElementById('slip-index').value = 'STUDENT-A';
      document.getElementById('slip-container').innerHTML = html;
      window.GES_MOCK_RESULT = { saved: [], saveRemarks() {
        this.saved.push({conduct:document.getElementById('gmr-conduct')?.value||'',interest:document.getElementById('gmr-interest')?.value||''});
      }};
      const host = document.getElementById('gmr-slip-container');
      host.dataset.class = 'JHS 1'; host.dataset.mockType = '1st Mock'; host.dataset.student = 'STUDENT-A';
      document.getElementById('gmr-year').value = '2025/2026'; document.getElementById('gmr-term').value = 'Term 1';
    }, { html: examSlip('STUDENT-A', 'JHS 1', '2025/2026', 'Term 1') });
    // Install the mock slip markup after the assessment script is active.
    await page.evaluate(({ html }) => { document.getElementById('gmr-slip-container').innerHTML = html; }, { html: mockSlip() });
    await page.waitForFunction(() => document.querySelectorAll('[data-comment]').length === 10);

    const examPanel = page.locator('#ges-assessment-panel-exam');
    const mockPanel = page.locator('#ges-assessment-panel-mock');
    assert.equal(await examPanel.locator('[data-comment]').count(), 5);
    assert.equal(await mockPanel.locator('[data-comment]').count(), 5);
    assert.equal(await page.locator('#slip-container .ges-assessment-panel, #gmr-slip-container .ges-assessment-panel').count(), 0, 'controls remain outside printable slip DOM');

    const examConduct = examPanel.locator('[data-comment="conduct"]');
    await examConduct.selectOption({ index: 1 });
    const examA = await examConduct.inputValue();
    assert.ok(examA);
    assert.equal(await page.locator('#slip-container [data-ges-comment="conduct"]').textContent(), examA);
    assert.equal(await page.evaluate(() => window.examSaved.at(-1).conduct), examA, 'exam saves through the existing persistence callback');

    // Same student and result context re-render: the fresh hidden select must
    // be adopted and the next save must still read the current native control.
    await page.evaluate(({ html }) => { document.getElementById('slip-container').innerHTML = html; }, { html: examSlip('STUDENT-A', 'JHS 1', '2025/2026', 'Term 1') });
    await page.waitForFunction(() => document.getElementById('ges-assessment-panel-exam')?.querySelector('#slip-interest') && !document.querySelector('#slip-container #slip-interest'));
    await examPanel.locator('[data-comment="interest"]').selectOption({ index: 1 });
    const examInterestA = await examPanel.locator('[data-comment="interest"]').inputValue();
    assert.equal(await page.evaluate(() => window.examSaved.at(-1).index), 'STUDENT-A');
    assert.equal(await page.evaluate(() => window.examSaved.at(-1).interest), examInterestA, 'rerender uses the current slip select');

    // Student and academic context isolation, with restoration when A returns.
    await page.evaluate(({ html }) => {
      document.getElementById('slip-index').value = 'STUDENT-B';
      document.getElementById('slip-container').innerHTML = html;
    }, { html: examSlip('STUDENT-B', 'JHS 1', '2025/2026', 'Term 1') });
    await page.waitForFunction(() => document.getElementById('ges-assessment-panel-exam')?.dataset.context.includes('STUDENT-B'));
    assert.equal(await examPanel.locator('[data-comment="conduct"]').inputValue(), '', 'student B does not inherit student A comments');
    await page.evaluate(({ html }) => {
      document.getElementById('slip-index').value = 'STUDENT-A';
      document.getElementById('slip-container').innerHTML = html;
    }, { html: examSlip('STUDENT-A', 'JHS 1', '2025/2026', 'Term 1') });
    await page.waitForFunction(() => document.getElementById('ges-assessment-panel-exam')?.dataset.context.includes('STUDENT-A'));
    assert.equal(await examPanel.locator('[data-comment="conduct"]').inputValue(), examA, 'student A assessment restores');
    await page.evaluate(({ html }) => { document.getElementById('slip-container').innerHTML = html; }, { html: examSlip('STUDENT-A', 'JHS 2', '2026/2027', 'Term 2') });
    await page.waitForFunction(() => document.getElementById('ges-assessment-panel-exam')?.dataset.context.includes('JHS 2'));
    assert.equal(await examPanel.locator('[data-comment="conduct"]').inputValue(), '', 'class/year/term result context stays isolated');

    // Sentiment filtering changes the comment bank without printing controls.
    await examPanel.locator('[data-sentiment="attitude"]').selectOption('negative');
    assert.equal(await examPanel.locator('[data-comment="attitude"] option').count(), 16, 'negative choices contain the placeholder plus 15 comments');
    await examPanel.locator('[data-comment="conduct"]').selectOption({ index: 2 });
    const examPrintComment = await examPanel.locator('[data-comment="conduct"]').inputValue();
    const examSelected = { conduct: examPrintComment };
    for (const category of ['interest', 'attitude', 'ctRemarks', 'htRemarks']) {
      const select = examPanel.locator(`[data-comment="${category}"]`);
      await select.selectOption({ index: 1 });
      examSelected[category] = await select.inputValue();
    }

    const mockConduct = mockPanel.locator('[data-comment="conduct"]');
    await mockConduct.selectOption({ index: 2 });
    const mockA = await mockConduct.inputValue();
    assert.equal(await page.locator('#gmr-slip-container [data-ges-comment="conduct"]').textContent(), mockA);
    assert.equal(await page.evaluate(() => window.GES_MOCK_RESULT.saved.at(-1).conduct), mockA, 'mock saves through existing saveRemarks callback');
    const mockPrintText = await page.locator('#gmr-slip-container .result-slip').innerText();
    assert.match(mockPrintText, new RegExp(mockA.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.doesNotMatch(mockPrintText, /Positive|Negative|Shows consistent respect for classmates and staff\./, 'unselected comments and sentiment controls are not printed');
    await page.evaluate(({ html }) => {
      const host = document.getElementById('gmr-slip-container'); host.dataset.student = 'STUDENT-B'; host.innerHTML = html;
    }, { html: mockSlip() });
    await page.waitForFunction(() => document.getElementById('ges-assessment-panel-mock')?.dataset.context.includes('STUDENT-B'));
    assert.equal(await mockPanel.locator('[data-comment="conduct"]').inputValue(), '', 'mock student B does not inherit A comments');
    await page.evaluate(({ html }) => {
      const host = document.getElementById('gmr-slip-container'); host.dataset.student = 'STUDENT-A'; host.innerHTML = html;
    }, { html: mockSlip() });
    await page.waitForFunction(() => document.getElementById('ges-assessment-panel-mock')?.dataset.context.includes('STUDENT-A'));
    assert.equal(await mockPanel.locator('[data-comment="conduct"]').inputValue(), mockA, 'mock student A assessment restores');
    await page.evaluate(({ html }) => {
      const host = document.getElementById('gmr-slip-container'); host.dataset.class = 'JHS 2'; host.dataset.mockType = '2nd Mock';
      document.getElementById('gmr-year').value = '2026/2027'; document.getElementById('gmr-term').value = 'Term 2'; host.innerHTML = html;
    }, { html: mockSlip() });
    await page.waitForFunction(() => document.getElementById('ges-assessment-panel-mock')?.dataset.context.includes('JHS 2|2nd Mock'));
    assert.equal(await mockPanel.locator('[data-comment="conduct"]').inputValue(), '', 'mock class/exam context stays isolated');

    // Restore the saved mock result and select all categories before calling
    // the actual print/PDF preparation functions extracted from index.html.
    await page.evaluate(({ html }) => {
      const host = document.getElementById('gmr-slip-container'); host.dataset.class = 'JHS 1'; host.dataset.mockType = '1st Mock'; host.dataset.student = 'STUDENT-A';
      document.getElementById('gmr-year').value = '2025/2026'; document.getElementById('gmr-term').value = 'Term 1'; host.innerHTML = html;
    }, { html: mockSlip() });
    await page.waitForFunction(() => document.getElementById('ges-assessment-panel-mock')?.dataset.context.includes('JHS 1|1st Mock|STUDENT-A'));
    const mockSelected = {};
    for (const category of ['conduct', 'interest', 'attitude', 'ctRemarks', 'htRemarks']) {
      const select = mockPanel.locator(`[data-comment="${category}"]`);
      if (!await select.inputValue()) await select.selectOption({ index: 1 });
      mockSelected[category] = await select.inputValue();
    }

    await page.emulateMedia({ media: 'print' });
    assert.equal(await examPanel.evaluate((el) => getComputedStyle(el).display), 'none', 'assessment controls are hidden when printing');
    assert.equal(await mockPanel.evaluate((el) => getComputedStyle(el).display), 'none', 'mock assessment controls are hidden when printing');
    const preparedExam = await page.evaluate(() => {
      const clone = window.__edutrackExamPrint();
      return { text:clone.innerText, controls:clone.querySelectorAll('select,input,button,.no-print,[data-comment],.ges-assessment-panel').length, signatures:clone.querySelectorAll('.slip-sig-box img').length };
    });
    const preparedMock = await page.evaluate(() => {
      const clone = window.__edutrackMockPrint();
      return { text:clone.innerText, controls:clone.querySelectorAll('select,input,button,.no-print,[data-comment],.ges-assessment-panel').length, signatures:clone.querySelectorAll('.slip-sig-box img').length };
    });
    for (const comment of Object.values(examSelected)) assert.ok(preparedExam.text.includes(comment), `exam print clone contains selected comment: ${comment}`);
    for (const comment of Object.values(mockSelected)) assert.ok(preparedMock.text.includes(comment), `mock print/PDF clone contains selected comment: ${comment}`);
    assert.equal(preparedExam.controls, 0, 'exam print clone excludes controls and assessment state');
    assert.equal(preparedMock.controls, 0, 'mock print/PDF clone excludes controls and assessment state');
    assert.equal(preparedExam.signatures, 1, 'exam printable clone retains signature');
    assert.equal(preparedMock.signatures, 1, 'mock printable clone retains signature');
    assert.match(preparedExam.text, /STUDENT-A|STUDENT/);
    assert.match(preparedExam.text, /JHS 2|Mathematics|Grade 1/);
    assert.match(preparedMock.text, /Mathematics 85 Grade 2/);
    assert.doesNotMatch(preparedExam.text, /Positive|Negative|Administrative control|Shows consistent respect for classmates and staff\./);
    assert.doesNotMatch(preparedMock.text, /Positive|Negative|Administrative control|Shows consistent respect for classmates and staff\./);
    assert.deepEqual(pageErrors, [], 'no browser runtime errors');
    console.log('GES Teacher Assessment browser integration passed: exam/mock save, restore, context isolation, render rebinding, and actual print/PDF preparation functions.');
  } finally {
    await browser.close();
  }
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
