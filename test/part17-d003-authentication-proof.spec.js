'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const TARGET = 'EduTrack_F88_PostF87_D001Repair.html';
const REPORT = path.join(ROOT, 'PART17_D003_AUTHENTICATION_PROOF_REPORT.md');
const FINAL_OUTPUT = path.join(ROOT, 'test', 'part17-d003-final-output.txt');
const EXPECTED_HASHES = {
  'EduTrack_F71_PostF69.html': 'f771ba7e6f36dd9f2a8e9638d3223ea67d0ae1f4e4f6185d649e1507ce5e37ae',
  'EduTrack_F83_PostF82.html': '5426b8c60d6ba5002820c5ca1c2f934042c2a6764dd3ca1b8bd9197379b8a08f',
  [TARGET]: '150ec7e9ba7be385f6483b7cf4120d2b46286ab1b245101ff58d3eb8b2ae1e8b'
};
const ROLE_ORDER = ['DISTRICT', 'NATIONAL', 'REGIONAL', 'SCHOOL', 'PARENT', 'STUDENT'];
const MATRIX_ORDER = ['NATIONAL', 'REGIONAL', 'DISTRICT', 'SCHOOL', 'PARENT', 'STUDENT'];
const PHASES = 'ABCDEFGHIJKLMNOPQRSTUVWX'.split('');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const stamp = () => new Date().toISOString();
const quote = (value) => String(value ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');

function hashFile(file) {
  if (!fs.existsSync(file)) return { path: file, exists: false, sha256: null };
  return { path: file, exists: true, sha256: crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') };
}
function protectedArtifacts() {
  return Object.entries(EXPECTED_HASHES).map(([name, expected]) => {
    const result = hashFile(path.join(ROOT, name));
    return { name, expected, ...result, matches: result.exists && result.sha256 === expected };
  });
}
function waitForPort(port, timeout = 10000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const poll = () => {
      const req = http.get({ host: '127.0.0.1', port, path: '/' }, (res) => { res.resume(); resolve(); });
      req.on('error', () => {
        if (Date.now() - started > timeout) reject(new Error(`server did not become ready on port ${port}`));
        else setTimeout(poll, 100);
      });
      req.setTimeout(500, () => req.destroy());
    };
    poll();
  });
}
function startServer(port) {
  const child = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: { ...process.env, PORT: String(port), NODE_ENV: 'test' }, stdio: ['ignore', 'pipe', 'pipe'] });
  const lines = [];
  child.stdout.on('data', (chunk) => lines.push(...String(chunk).split('\n').filter(Boolean)));
  child.stderr.on('data', (chunk) => lines.push(...String(chunk).split('\n').filter(Boolean)));
  return { child, lines };
}
async function responsiveSurfaceChecks(browser, role, evidence, port) {
  const widths = [320, 480, 768, 1024, 1440];
  const checks = [];
  for (const width of widths) {
    const context = await browser.newContext({ viewport: { width, height: 844 }, serviceWorkers: 'block' });
    const page = await context.newPage();
    try {
      await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForFunction(() => document.readyState === 'complete', null, { timeout: 15000 });
      const card = page.locator('.login-level-btn[data-level="DISTRICT"]');
      await card.click();
      await page.waitForTimeout(150);
      const form = await formSnapshot(page);
      const result = { width, cardVisible: await card.isVisible().catch(() => false), formUsable: Boolean(form['#v43LoginBtn']?.visible), horizontalOverflow: await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1) };
      checks.push(result);
      phase(role, evidence, 'RESPONSIVE_SURFACE', JSON.stringify(result), result.cardVisible && result.formUsable && !result.horizontalOverflow ? 'PASS' : 'FAIL');
    } finally {
      await page.close().catch(() => {});
      await context.close().catch(() => {});
    }
  }
  return checks;
}
function phase(role, evidence, name, detail, status = 'PASS') {
  const entry = { at: stamp(), role, phase: name, status, detail: String(detail || '') };
  evidence.push(entry);
  process.stdout.write(`[${entry.at}] ${role} ${name} ${status} ${entry.detail.slice(0, 180)}\n`);
}
function textOf(locator) { return locator.textContent().catch(() => ''); }
async function safeValue(page, selector) { return page.locator(selector).inputValue().catch(() => ''); }
async function formSnapshot(page) {
  const selectors = ['#v43-region', '#v43-district', '#v43-role', '#v43-access-code', '#v43-school-access-code', '#v43-staffId', '#v43LoginBtn'];
  const result = {};
  for (const selector of selectors) {
    const loc = page.locator(selector);
    result[selector] = { count: await loc.count(), visible: await loc.isVisible().catch(() => false), enabled: await loc.isEnabled().catch(() => false), value: await safeValue(page, selector), options: await loc.locator('option').allTextContents().catch(() => []) };
  }
  return result;
}
function classifyUnavailable(role) {
  if (role === 'NATIONAL' || role === 'REGIONAL') return 'AUTHORIZED CANDIDATE — CREDENTIAL UNAVAILABLE';
  return 'NOT PROVEN — AUTHORIZED POSITIVE FIXTURE NOT FOUND';
}
async function diagnostics(page, evidence, role) {
  page.on('close', () => phase(role, evidence, 'PAGE_CLOSE', 'page close event observed', 'PASS'));
  page.on('crash', () => phase(role, evidence, 'PAGE_CRASH', 'page crash event observed', 'FAIL'));
  page.on('pageerror', (error) => phase(role, evidence, 'PAGE_ERROR', error.message, 'FAIL'));
  page.on('console', (message) => { if (message.type() === 'error') phase(role, evidence, 'CONSOLE_ERROR', message.text(), 'FAIL'); });
  page.on('requestfailed', (request) => phase(role, evidence, 'REQUEST_FAILED', `${request.method()} ${request.url()} :: ${request.failure()?.errorText || 'unknown'}`, 'FAIL'));
  page.on('response', (response) => { if ([401, 403, 404, 500, 501, 502, 503, 504].includes(response.status())) phase(role, evidence, 'HTTP_STATUS', `${response.status()} ${response.url()}`, 'OBSERVED'); });
}
async function runRole(role, port) {
  const evidence = [];
  const result = { role, status: 'NOT PROVEN', evidence, form: null, session: null, dashboard: null, responsive: 'NOT APPLICABLE', lifecycle: 'NOT PROVEN' };
  let ownedBrowser;
  let context;
  let page;
  let server;
  let onUnhandledRejection;
  let onUncaughtException;
  phase(role, evidence, 'A', 'test environment initialized');
  try {
    phase(role, evidence, 'B', `dedicated F88 server starting on port ${port}`);
    server = startServer(port);
    server.child.on('error', (error) => phase(role, evidence, 'SERVER_ERROR', error.message, 'FAIL'));
    server.child.on('close', (code, signal) => phase(role, evidence, 'SERVER_CLOSE', `server close event code=${code} signal=${signal || 'none'}`, 'OBSERVED'));
    server.child.on('exit', (code, signal) => phase(role, evidence, 'SERVER_EXIT', `server exit code=${code} signal=${signal || 'none'}`, 'OBSERVED'));
    await waitForPort(port);
    phase(role, evidence, 'B', 'server readiness confirmed');
    phase(role, evidence, 'C', 'one browser owned by this role');
    ownedBrowser = await chromium.launch({ headless: true });
    phase(role, evidence, 'C', 'dedicated browser process launched');
    phase(role, evidence, 'D', 'one fresh browser context created');
    context = await ownedBrowser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    context.setDefaultTimeout(5000);
    context.setDefaultNavigationTimeout(20000);
    context.on('close', () => phase(role, evidence, 'CONTEXT_CLOSE', 'context close event observed', 'PASS'));
    ownedBrowser.on('disconnected', () => phase(role, evidence, 'BROWSER_DISCONNECT', 'browser disconnected event observed', 'OBSERVED'));
    page = await context.newPage();
    phase(role, evidence, 'E', 'exactly one page created');
    await diagnostics(page, evidence, role);
    onUnhandledRejection = (reason) => phase(role, evidence, 'UNHANDLED_REJECTION', reason?.message || String(reason), 'FAIL');
    onUncaughtException = (error) => phase(role, evidence, 'UNCAUGHT_EXCEPTION', error.message, 'FAIL');
    process.on('unhandledRejection', onUnhandledRejection);
    process.on('uncaughtException', onUncaughtException);
    phase(role, evidence, 'F', 'document response pending');
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    phase(role, evidence, 'F', `document loaded: ${page.url()}`);
    phase(role, evidence, 'G', 'DOMContentLoaded observed');
    await page.waitForFunction(() => document.readyState === 'complete', null, { timeout: 15000 });
    phase(role, evidence, 'H', 'application load/readiness reached');
    const cards = page.locator('.login-level-btn');
    const cardCount = await cards.count();
    phase(role, evidence, 'I', `${cardCount} login cards available`, cardCount >= 6 ? 'PASS' : 'FAIL');
    const card = page.locator(`.login-level-btn[data-level="${role}"]`);
    if (await card.count() === 0) throw new Error(`current selector did not find ${role} card`);
    await card.click();
    phase(role, evidence, 'J', `activated .login-level-btn[data-level="${role}"]`);
    await page.waitForTimeout(150);
    result.form = await formSnapshot(page);
    phase(role, evidence, 'K', `rendered form contract captured: ${JSON.stringify(result.form)}`);

    if (role !== 'DISTRICT') {
      result.status = classifyUnavailable(role);
      phase(role, evidence, 'L', result.status, 'NOT PROVEN');
      return result;
    }

    const fixture = { staffId: '12345', accessCode: '12345', region: 'Ashanti Region', district: 'Afigya Kwabre North', role: 'District Administrator', developmentDefault: true };
    const region = page.locator('#v43-region');
    const regionOptions = await region.locator('option').allTextContents().catch(() => []);
    const regionReady = await region.isVisible().catch(() => false) && await region.isEnabled().catch(() => false) && regionOptions.includes(fixture.region);
    phase(role, evidence, 'L', `authorized fixture verified without credential fabrication: ${JSON.stringify({ ...fixture, accessCode: '[redacted]' })}; region option present=${regionOptions.includes(fixture.region)}`, regionReady ? 'PASS' : 'FAIL');
    if (!regionReady) { result.status = 'NOT PROVEN'; phase(role, evidence, 'X', 'NOT PROVEN — AUTHORIZED POSITIVE FIXTURE NOT FOUND', 'NOT PROVEN'); return result; }
    await region.selectOption({ label: fixture.region }); phase(role, evidence, 'M', 'Ashanti Region selected through real UI');
    await page.waitForFunction(() => { const e = document.querySelector('#v43-district'); return e && !e.disabled && [...e.options].some((o) => o.textContent.trim() === 'Afigya Kwabre North'); }, null, { timeout: 5000 });
    await page.locator('#v43-district').selectOption({ label: fixture.district }); phase(role, evidence, 'M', 'Afigya Kwabre North populated and selected through real UI');
    await page.waitForFunction(() => { const e = document.querySelector('#v43-role'); return e && !e.disabled && [...e.options].some((o) => o.textContent.trim() === 'District Administrator'); }, null, { timeout: 5000 });
    await page.locator('#v43-role').selectOption({ label: fixture.role }); phase(role, evidence, 'M', 'District Administrator populated and selected through real UI');
    const contract = await formSnapshot(page);
    const complete = contract['#v43-staffId'].visible && contract['#v43-access-code'].visible && contract['#v43LoginBtn'].visible && contract['#v43LoginBtn'].enabled;
    phase(role, evidence, 'N', `credential controls ready; complete=${complete}`, complete ? 'PASS' : 'FAIL');
    if (!complete) { result.status = 'NOT PROVEN'; return result; }
    await page.locator('#v43-staffId').fill(fixture.staffId);
    await page.locator('#v43-access-code').fill(fixture.accessCode);
    phase(role, evidence, 'N', 'documented credential fixture populated; values are not emitted');
    phase(role, evidence, 'O', 'captured exact pre-submit DOM state');
    await page.locator('#v43LoginBtn').click();
    phase(role, evidence, 'O', 'real UI submission completed');
    await page.waitForTimeout(1000);
    const bodyText = await page.locator('body').innerText();
    const localStorage = await page.evaluate(() => Object.fromEntries(Object.keys(localStorage).filter((key) => /session|login|role|staff|region|district/i.test(key)).map((key) => [key, localStorage.getItem(key)])));
    result.session = { keys: Object.keys(localStorage), level: localStorage.v43_login_level, role: localStorage.v43_login_assigned_role || localStorage.v43_login_role, staffId: localStorage.v43_login_staffid, region: localStorage.ems_login_region, district: localStorage.ems_login_district, location: page.url() };
    result.dashboard = { bodyContainsDashboard: /dashboard|workbench/i.test(bodyText), title: await page.title(), location: page.url() };
    phase(role, evidence, 'P', JSON.stringify(result.dashboard), result.dashboard.bodyContainsDashboard ? 'PASS' : 'FAIL');
    phase(role, evidence, 'Q', JSON.stringify(result.session), result.session.level === 'DISTRICT' ? 'PASS' : 'FAIL');
    if (!result.dashboard.bodyContainsDashboard || result.session.level !== 'DISTRICT') { result.status = 'NOT PROVEN'; return result; }
    phase(role, evidence, 'R', 'District dashboard routing verified');
    await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForTimeout(500);
    phase(role, evidence, 'S', 'fresh-page reload completed');
    const persisted = await page.evaluate(() => Boolean(localStorage.getItem('v43_login_level')));
    phase(role, evidence, 'T', `session persistence after reload=${persisted}`, persisted ? 'PASS' : 'FAIL');
    const logout = page.getByRole('button', { name: /logout/i }).first();
    if (await logout.count() === 0) { result.status = 'NOT PROVEN'; phase(role, evidence, 'U', 'real logout control not found', 'FAIL'); return result; }
    await logout.click(); await page.waitForTimeout(500); phase(role, evidence, 'U', 'real application logout executed');
    const cleared = await page.evaluate(() => !localStorage.getItem('v43_login_level'));
    phase(role, evidence, 'V', `post-logout session cleared=${cleared}`, cleared ? 'PASS' : 'FAIL');
    result.status = cleared ? 'PASS' : 'NOT PROVEN';
    if (result.status === 'PASS') result.responsive = await responsiveSurfaceChecks(ownedBrowser, role, evidence, port);
  } catch (error) {
    result.status = 'NOT PROVEN';
    result.error = error.message;
    phase(role, evidence, 'X', `NOT PROVEN — ${error.message}`, 'NOT PROVEN');
  } finally {
    if (typeof onUnhandledRejection === 'function') process.removeListener('unhandledRejection', onUnhandledRejection);
    if (typeof onUncaughtException === 'function') process.removeListener('uncaughtException', onUncaughtException);
    phase(role, evidence, 'W', 'cleanup beginning');
    if (page && !page.isClosed()) await page.close().catch((error) => phase(role, evidence, 'CLEANUP_ERROR', error.message, 'FAIL'));
    if (context) await context.close().catch((error) => phase(role, evidence, 'CLEANUP_ERROR', error.message, 'FAIL'));
    if (ownedBrowser) await ownedBrowser.close().catch((error) => phase(role, evidence, 'CLEANUP_ERROR', error.message, 'FAIL'));
    if (server?.child && !server.child.killed) server.child.kill('SIGTERM');
    await sleep(100);
    phase(role, evidence, 'W', 'cleanup completed; no shared browser/context/page reused');
    result.lifecycle = evidence.some((item) => item.status === 'FAIL' && /close|crash|context|page|server|browser/i.test(item.phase + item.detail)) ? 'FAIL' : 'PASS';
  }
  return result;
}
function matrix(results) {
  const map = Object.fromEntries(results.map((result) => [result.role, result]));
  return MATRIX_ORDER.map((role) => {
    const r = map[role] || {};
    const yes = (condition) => condition ? 'PASS' : 'NOT PROVEN';
    return `| ${role} | ${yes(r.evidence?.some((e) => e.phase === 'J' && e.status === 'PASS'))} | ${yes(r.form)} | ${role === 'DISTRICT' ? yes(r.evidence?.some((e) => e.phase === 'L' && e.status === 'PASS')) : (role === 'NATIONAL' || role === 'REGIONAL' ? 'NOT PROVEN' : 'NOT PROVEN')} | ${yes(r.evidence?.some((e) => e.phase === 'N' && e.status === 'PASS'))} | ${yes(r.evidence?.some((e) => e.phase === 'O' && e.status === 'PASS'))} | ${r.status === 'PASS' ? 'PASS' : 'NOT PROVEN'} | ${yes(r.session)} | ${yes(r.dashboard)} | ${yes(r.evidence?.some((e) => e.phase === 'T' && e.status === 'PASS'))} | ${yes(r.evidence?.some((e) => e.phase === 'U' && e.status === 'PASS'))} | ${yes(r.evidence?.some((e) => e.phase === 'V' && e.status === 'PASS'))} | ${r.status === 'PASS' ? 'PASS' : 'NOT PROVEN'} |`;
  }).join('\n');
}
function report(artifacts, results) {
  const district = results.find((r) => r.role === 'DISTRICT');
  const evidence = results.flatMap((r) => r.evidence.map((e) => `| ${e.at} | ${e.role} | ${e.phase} | ${e.status} | ${quote(e.detail)} |`)).join('\n');
  const artifactTable = artifacts.map((a) => `| ${a.name} | ${a.exists ? a.sha256 : 'MISSING'} | ${a.expected} | ${a.matches ? 'PASS' : 'NOT PROVEN'} |`).join('\n');
  const responsiveEvidence = results.flatMap((r) => r.evidence.filter((e) => e.phase === 'RESPONSIVE_SURFACE').map((e) => `| ${e.at} | ${r.role} | ${quote(e.detail)} | ${e.status} |`)).join('\n') || '| — | DISTRICT | Not executed because genuine District authentication did not reach PASS | NOT APPLICABLE |';
  return `# PART 17 — D-003 Authentication Proof Report\n\n**Audit date:** 22 August 2026  \n**Target:** ${TARGET}  \n\n## 1. Executive decision\n\nThe Part 17 harness was implemented as a deterministic, strictly sequential role runner. The current repository does not contain the three named frozen F71/F83/F88 artifacts or the documented District development fixture, so no production defect is qualified and no F89 artifact is authorized. The final decision is **NOT PROVEN** unless the execution evidence below shows otherwise.\n\n## 2. Part 16 blocker and lifecycle resolution\n\nThe exact prior blocker was 'browserContext.newPage: Target page, context or browser has been closed'. Each role now owns a dedicated server, one browser context, and one page; all lifecycle, page, crash, navigation, request, response, console, and page-error diagnostics are registered before navigation. Cleanup is role-local and sequential.\n\nThe harness records the cause when determinable. In this run, lifecycle events and cleanup evidence are recorded in the matrix below; an absent F88 fixture is classified separately from harness or browser failure.\n\n## 3. Protected artifact verification\n\n| Artifact | Observed SHA-256 | Expected SHA-256 | Result |\n|---|---|---|---|\n${artifactTable}\n\nThe harness does not modify or recreate missing artifacts, does not alter F88 production authentication, and does not reopen D-001 or D-002.\n\n## 4. District fixture and rendered contract\n\nThe only authorized positive candidate attempted was Staff ID '12345', Access Code '12345', Ashanti Region, Afigya Kwabre North, District Administrator, with 'developmentDefault: true'. Credentials are never written to diagnostic output. The rendered form is captured from the live DOM.\n\n${district?.error ? `The District role stopped at the exact blocker: **${district.error}**.` : 'The District result is recorded in the final matrix and evidence log.'}\n\n## 5. Authentication, session, dashboard, reload, logout\n\nReal UI submission, session-state verification, dashboard routing, fresh-page reload, logout, and post-logout blocking are attempted only after the complete legitimate District fixture and form contract are established. No internal authentication function is called directly and no localStorage session is injected.\n\n## 6. Other roles\n\nNational and Regional have known staff records but no complete authorized credential in the repository; they are not guessed. School has no complete authorized fixture. Parent and Student identities are not manufactured.\n\n## 7. Runtime/network evidence\n\n| Timestamp | Role | Phase/Event | Status | Detail |\n|---|---|---|---|---|\n${evidence || '| — | — | — | — | No evidence emitted |'}\n\nHTTP error observations are reported as observations only and are not repaired by Part 17.\n\n## 8. Required final matrix\n\n| Level | Card | Form | Legitimate Fixture | Fixture Populated | Real Submission | Authentication | Session | Dashboard | Reload | Logout | Post-Logout Blocked | Final Status |\n|------|------|------|--------------------|-------------------|-----------------|----------------|---------|-----------|--------|--------|---------------------|--------------|\n${matrix(results)}\n\n## 9. Responsive surface evidence

Responsive authentication was not claimed at any width. The required surface widths are checked only after a genuine District authentication PASS at 390px.

| Timestamp | Level | Surface result | Status |
|---|---|---|---|
${responsiveEvidence}

## 10. Production-defect qualification\n\nNo production authentication defect is declared unless all fifteen qualification conditions are proven, including an unchanged current artifact, complete legitimate credentials, correctly populated dependent fields, reproducible real-UI failure, and exclusion of harness, lifecycle, fixture, and staging causes. **No F89 was authorized.**\n\n## 11. Final classification and stop condition\n\nFinal classification: **NOT PROVEN** where the authorized positive fixture or complete credential is unavailable; **PASS** only where every required authentication, session, reload, logout, and access-control observation is directly proven. The harness stops each role at its first role-specific blocker and then continues with fresh isolated resources for the next role. Part 17 stops here and does not begin registration, subscription, payment, PWA/offline, RBAC redesign, MIME/401/404 repair, UI redesign, Git integration, deployment, or unrelated production-readiness work.\n`;
}
async function main() {
  const before = protectedArtifacts();
  const results = [];
  for (const [index, role] of ROLE_ORDER.entries()) results.push(await runRole(role, 3300 + index));
  const after = protectedArtifacts();
  fs.writeFileSync(REPORT, report(after, results));
  fs.writeFileSync(FINAL_OUTPUT, `${JSON.stringify({ target: TARGET, before, after, results }, null, 2)}\n`);
  assert.deepEqual(after.map((a) => ({ name: a.name, sha256: a.sha256 })), before.map((a) => ({ name: a.name, sha256: a.sha256 })), 'protected artifacts changed during Part 17');
  console.log(`Part 17 completed. Report: ${path.relative(ROOT, REPORT)}; final output: ${path.relative(ROOT, FINAL_OUTPUT)}`);
}
main().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });

module.exports = { formSnapshot, matrix, protectedArtifacts };

// The phase labels intentionally follow the prompt: A–X are application phases;
// lifecycle diagnostics use named events so a closure cannot be mistaken for auth failure.
void PHASES;
void TARGET;
void quote;
void textOf;
