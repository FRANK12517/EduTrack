const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const ROOT = path.resolve(__dirname, '..');
const DB = path.join(ROOT, 'data', 'edutrack.json');
const BACKUP = `${DB}.part64-backup`;
const PORT = 3132;
const BASE = `http://127.0.0.1:${PORT}`;
const EMAIL = 'part64@example.invalid';
const PASSWORD = 'part64 secure password';
const ACCESS = 'part64-access';
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const server = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
assert.match(server, /notificationState/);
assert.match(server, /reportCardStatus/);
assert.match(server, /carryForwardStudents/);
assert.match(html, /edutrack-part64-population-notification/);
assert.match(html, /Class-by-class reconciliation/);
assert.match(html, /overflow-x:auto/);
assert.match(html, /Withdrawals\/Transfers\/Stoppages/);
assert.match(html, /Next subscription amount/);
assert.match(html, /meta name="viewport"/);
function cookie(response) { return (response.headers.get('set-cookie') || '').split(';')[0]; }
async function request(url, options = {}) { return fetch(`${BASE}${url}`, options); }
function waitForServer(child) { return new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error('server start timeout')), 10000); child.stdout.on('data', buffer => { if (buffer.toString().includes('EduTrack server listening')) { clearTimeout(timer); resolve(); } }); child.once('error', reject); child.once('exit', code => { if (code !== null) reject(new Error(`server exited ${code}`)); }); }); }
async function run() {
  if (fs.existsSync(DB)) fs.copyFileSync(DB, BACKUP);
  const schoolId = 'part64-school';
  const otherId = 'part64-other';
  try {
    fs.writeFileSync(DB, JSON.stringify({ version: 3, users: [], schools: [], staff: [], students: [], academicConfigurations: [], governmentAcademicCalendars: [], subscriptions: [], transactions: [], paymentIntents: [], paymentEvents: [], files: [], sessions: [], passwordResets: [], audit: [], schoolFees: [], schoolFeePayments: [], studentStatusHistory: [], studentPopulationReconciliations: [], subscriptionPopulationCheckpoints: [], subscriptionCarryForwardRecords: [], scores: [], publishedResults: [], classes: [] }, null, 2));
    const provision = spawnSync(process.execPath, ['server.js', '--provision'], { cwd: ROOT, env: { ...process.env, EDUTRACK_DEVELOPER_EMAIL: EMAIL, EDUTRACK_DEVELOPER_PASSWORD: PASSWORD, EDUTRACK_DEVELOPER_ACCESS_CODE: ACCESS, EDUTRACK_SUPER_ADMIN_EMAIL: 'part64-super@example.invalid', EDUTRACK_SUPER_ADMIN_PASSWORD: 'part64 super password', EDUTRACK_SUPER_ADMIN_ACCESS_CODE: 'part64-super-access' }, encoding: 'utf8' });
    assert.equal(provision.status, 0, provision.stderr || provision.stdout);
    const database = JSON.parse(fs.readFileSync(DB, 'utf8'));
    database.schools.push({ id: schoolId, tenantId: 'tenant64', name: 'Part 64 School', ownershipType: 'private', active: true }, { id: otherId, tenantId: 'other-tenant64', name: 'Other School', ownershipType: 'private', active: true });
    database.subscriptions.push({ id: 'sub64', schoolId, tenantId: 'tenant64', status: 'ACTIVE', active: true, createdAt: '2026-01-01T00:00:00Z', activeStudentCountAtSubscription: 300 });
    database.subscriptionPopulationCheckpoints.push({ id: 'exam64', schoolId, tenantId: 'tenant64', subscriptionId: 'sub64', checkpointType: 'EXAM_INPUT', checkpointTimestamp: '2026-06-01T00:00:00Z', subscriptionPopulation: 300, currentActivePopulation: 325, newlyAdmittedPopulation: 25, examinationPopulation: 325, netAdditionalStudents: 25, carryForwardStudents: 25, classRows: [{ classId: 'c1', className: 'Class 1', subscriptionPopulation: 150, currentActive: 160, examInput: 160, newAdmissions: 12, withdrawalsTransfersStoppages: 2 }], flags: {} });
    database.subscriptionPopulationCheckpoints.push({ id: 'report64', schoolId, tenantId: 'tenant64', subscriptionId: 'sub64', checkpointType: 'REPORT_CARD', checkpointTimestamp: '2026-06-02T00:00:00Z', subscriptionPopulation: 300, currentActivePopulation: 325, reportCardPopulation: 320, netAdditionalStudents: 25, carryForwardStudents: 25, activeWithoutReportCards: 5, classRows: [{ classId: 'c1', className: 'Class 1', subscriptionPopulation: 150, currentActive: 160, examInput: 160, reportCards: 158, newAdmissions: 12, withdrawalsTransfersStoppages: 2 }], flags: { activeWithoutReportCards: 5 } });
    fs.writeFileSync(DB, JSON.stringify(database, null, 2));
    const child = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT) }, stdio: ['ignore', 'pipe', 'pipe'] });
    try {
      await waitForServer(child);
      const login = await request('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', origin: BASE }, body: JSON.stringify({ email: EMAIL, password: PASSWORD, accessCode: ACCESS }) });
      assert.equal(login.status, 200);
      const headers = { cookie: cookie(login), origin: BASE };
      let response = await request(`/api/subscriptions/population-dashboard?schoolId=${schoolId}`, { headers });
      assert.equal(response.status, 200);
      let dashboard = (await response.json()).dashboard;
      assert.equal(dashboard.notification.state, 'positive_difference');
      assert.equal(dashboard.notification.message, '25 additional active students detected.');
      assert.equal(dashboard.notification.blocking, false);
      assert.equal(dashboard.notification.subscriptionPopulation, 300);
      assert.equal(dashboard.notification.newActiveStudents, 25);
      assert.equal(dashboard.notification.currentActiveStudents, 325);
      assert.equal(dashboard.notification.carryForwardStudents, 25);
      assert.equal(dashboard.notification.nextSubscriptionAmountGhs, 325);
      assert.equal(dashboard.reportCardCheck.status, 'discrepancy');
      assert.equal(dashboard.reportCardCheck.difference, 5);
      assert.equal(dashboard.classes.length, 1);
      assert.equal(dashboard.totals.currentActive, 160);
      assert.equal(dashboard.totals.netDifference, 10);
      assert.equal(dashboard.classes[0].newAdmissions, 12);
      assert.equal(dashboard.classes[0].withdrawalsTransfersStoppages, 2);
      const mutated = JSON.parse(fs.readFileSync(DB, 'utf8'));
      const report = mutated.subscriptionPopulationCheckpoints.find(row => row.id === 'report64');
      report.currentActivePopulation = 300;
      report.reportCardPopulation = 300;
      report.classRows[0].currentActive = 150;
      report.classRows[0].reportCards = 150;
      mutated.subscriptionPopulationCheckpoints = mutated.subscriptionPopulationCheckpoints.filter(row => row.id !== 'exam64');
      fs.writeFileSync(DB, JSON.stringify(mutated, null, 2));
      response = await request(`/api/subscriptions/population-dashboard?schoolId=${schoolId}`, { headers });
      dashboard = (await response.json()).dashboard;
      assert.equal(dashboard.notification.state, 'no_difference');
      assert.equal(dashboard.notification.message, 'Your subscription population matches the current active population.');
      report.currentActivePopulation = 290;
      report.reportCardPopulation = 290;
      report.classRows[0].currentActive = 145;
      report.classRows[0].reportCards = 145;
      fs.writeFileSync(DB, JSON.stringify(mutated, null, 2));
      response = await request(`/api/subscriptions/population-dashboard?schoolId=${schoolId}`, { headers });
      dashboard = (await response.json()).dashboard;
      assert.equal(dashboard.notification.state, 'negative_difference');
      assert.equal(dashboard.notification.message, '10 fewer active students than at subscription.');
      assert.equal(dashboard.notification.nextSubscriptionAmountGhs, 290);
      response = await request(`/api/subscriptions/population-dashboard?schoolId=${otherId}`, { headers });
      assert.equal(response.status, 200, 'the existing developer fixture may request an explicitly selected school');
      const otherDashboard = (await response.json()).dashboard;
      assert.equal(otherDashboard.summary.subscriptionPopulation, 0, 'another school must not receive this school\'s subscription population');
      assert.equal(otherDashboard.classes.length, 0, 'another school must not receive this school\'s class rows');
      const unauthenticated = await request(`/api/subscriptions/population-dashboard?schoolId=${schoolId}`, { headers: { origin: BASE } });
      assert.equal(unauthenticated.status, 401);
    } finally {
      child.kill('SIGTERM');
    }
  } finally {
    if (fs.existsSync(BACKUP)) { fs.copyFileSync(BACKUP, DB); fs.unlinkSync(BACKUP); }
    else if (fs.existsSync(DB)) fs.unlinkSync(DB);
  }
}
run().then(() => console.log('Part 64 population reconciliation notification regression suite passed.')).catch(error => { console.error(error.stack || error); process.exitCode = 1; });
