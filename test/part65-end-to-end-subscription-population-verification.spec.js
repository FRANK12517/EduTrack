const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const ROOT = path.resolve(__dirname, '..');
const DB = path.join(ROOT, 'data', 'edutrack.json');
const BACKUP = `${DB}.part65-backup`;
const PORT = 3133;
const BASE = `http://127.0.0.1:${PORT}`;
const EMAIL = 'part65@example.com';
const PASSWORD = 'part65 secure password';
const ACCESS = 'part65-access';
const schema = fs.readFileSync(path.join(ROOT, 'db', 'schema.sql'), 'utf8');
const relational = fs.readFileSync(path.join(ROOT, 'db', 'relational.js'), 'utf8');
const server = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
assert.doesNotMatch(schema, /DROP\s+TABLE|TRUNCATE\s+TABLE/i);
assert.doesNotMatch(relational, /DROP\s+TABLE|TRUNCATE\s+TABLE/i);
assert.match(server, /calculateSubscriptionAmount/);
assert.match(server, /getPopulationDashboard|compatibilityPopulationDashboard/);
assert.match(server, /governmentAcademicCalendar|centralizedGovernmentTerm/);
assert.match(server, /subscriptionCarryForwardRecords|calculateCarryForward/);
assert.match(html, /edutrack-part64-population-notification/);
assert.match(html, /GH₵/);
assert.match(html, /Class-by-class reconciliation/);
function cookie(response) { return (response.headers.get('set-cookie') || '').split(';')[0]; }
async function request(url, options = {}) { return fetch(`${BASE}${url}`, options); }
function waitForServer(child) { return new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error('server start timeout')), 10000); child.stdout.on('data', buffer => { if (buffer.toString().includes('EduTrack server listening')) { clearTimeout(timer); resolve(); } }); child.once('error', reject); child.once('exit', code => { if (code !== null) reject(new Error(`server exited ${code}`)); }); }); }
function emptyDb() { return { version: 3, users: [], schools: [], staff: [], students: [], academicConfigurations: [], governmentAcademicCalendars: [], subscriptions: [], transactions: [], paymentIntents: [], paymentEvents: [], files: [], sessions: [], passwordResets: [], audit: [], schoolFees: [], schoolFeePayments: [], studentStatusHistory: [], studentPopulationReconciliations: [], subscriptionPopulationCheckpoints: [], subscriptionCarryForwardRecords: [], scores: [], publishedResults: [], classes: [] }; }
async function run() {
  if (fs.existsSync(DB)) fs.copyFileSync(DB, BACKUP);
  const schoolId = 'part65-school';
  const otherSchoolId = 'part65-other';
  try {
    fs.writeFileSync(DB, JSON.stringify(emptyDb(), null, 2));
    const provision = spawnSync(process.execPath, ['server.js', '--provision'], { cwd: ROOT, env: { ...process.env, EDUTRACK_DEVELOPER_EMAIL: EMAIL, EDUTRACK_DEVELOPER_PASSWORD: PASSWORD, EDUTRACK_DEVELOPER_ACCESS_CODE: ACCESS, EDUTRACK_SUPER_ADMIN_EMAIL: 'part65-super@example.invalid', EDUTRACK_SUPER_ADMIN_PASSWORD: 'part65 super password', EDUTRACK_SUPER_ADMIN_ACCESS_CODE: 'part65-super-access' }, encoding: 'utf8' });
    assert.equal(provision.status, 0, provision.stderr || provision.stdout);
    const database = JSON.parse(fs.readFileSync(DB, 'utf8'));
    const provisionedUser = database.users.find(row => row.email === EMAIL);
    provisionedUser.schoolId = schoolId;
    provisionedUser.scope = { schoolId };
    database.schools.push({ id: schoolId, tenantId: 'tenant65', name: 'Part 65 School', ownershipType: 'private', active: true, firstTermFreeUsed: true }, { id: otherSchoolId, tenantId: 'other-tenant65', name: 'Other School', ownershipType: 'private', active: true });
    database.subscriptions.push({ id: 'sub65-1', schoolId, tenantId: 'tenant65', status: 'ACTIVE', active: true, createdAt: '2026-01-01T00:00:00Z', activeStudentCountAtSubscription: 300, subscriptionAmount: 300, schoolType: 'private', academicYear: '2026/2027', termNumber: 1, termStartDate: '2026-09-01', termEndDate: '2026-12-31' });
    database.students = Array.from({ length: 300 }, (_, index) => ({ id: `part65-student-${index}`, schoolId, status: 'ACTIVE' }));
    database.subscriptionPopulationCheckpoints.push({ id: 'exam65', schoolId, tenantId: 'tenant65', subscriptionId: 'sub65-1', checkpointType: 'EXAM_INPUT', checkpointTimestamp: '2026-12-10T00:00:00Z', subscriptionPopulation: 300, currentActivePopulation: 325, newlyAdmittedPopulation: 25, examinationPopulation: 325, netAdditionalStudents: 25, carryForwardStudents: 25, classRows: [{ classId: 'class65', className: 'Class 65', subscriptionPopulation: 300, currentActive: 325, examInput: 325, newAdmissions: 25, withdrawalsTransfersStoppages: 0 }] });
    database.subscriptionPopulationCheckpoints.push({ id: 'report65', schoolId, tenantId: 'tenant65', subscriptionId: 'sub65-1', checkpointType: 'REPORT_CARD', checkpointTimestamp: '2026-12-11T00:00:00Z', subscriptionPopulation: 300, currentActivePopulation: 325, reportCardPopulation: 325, netAdditionalStudents: 25, carryForwardStudents: 25, classRows: [{ classId: 'class65', className: 'Class 65', subscriptionPopulation: 300, currentActive: 325, examInput: 325, reportCards: 325, newAdmissions: 25, withdrawalsTransfersStoppages: 0 }] });
    fs.writeFileSync(DB, JSON.stringify(database, null, 2));
    const child = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT), PAYSTACK_SECRET_KEY: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
    try {
      await waitForServer(child);
      const health = await request('/api/health'); assert.equal(health.status, 200); assert.equal((await health.json()).ok, true);
      const plans = await request('/api/subscriptions/plans'); assert.equal(plans.status, 200); const catalog = await plans.json(); assert.equal(catalog.pricing.pricePerStudentGhs, 1); assert.equal(catalog.pricing.currency, 'GHS'); assert.equal(catalog.pricing.billingPeriod, 'term');
      const login = await request('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', origin: BASE }, body: JSON.stringify({ email: EMAIL, password: PASSWORD, accessCode: ACCESS }) }); assert.equal(login.status, 200);
      const headers = { cookie: cookie(login), origin: BASE, 'content-type': 'application/json' };
      let response = await request(`/api/subscriptions/population-dashboard?schoolId=${schoolId}`, { headers }); assert.equal(response.status, 200); let dashboard = (await response.json()).dashboard;
      assert.equal(dashboard.summary.subscriptionPopulation, 300); assert.equal(dashboard.summary.currentActivePopulation, 325); assert.equal(dashboard.summary.netAdditionalStudents, 25); assert.equal(dashboard.summary.carryForwardStudents, 25); assert.equal(dashboard.summary.nextSubscriptionAmountGhs, 325); assert.equal(dashboard.notification.message, '25 additional active students detected.'); assert.equal(dashboard.reportCardCheck.status, 'matched'); assert.equal(dashboard.reportCardCheck.difference, 0);
      assert.equal(dashboard.classes[0].newAdmissions, 25); assert.equal(dashboard.classes[0].withdrawalsTransfersStoppages, 0); assert.equal(dashboard.classes[0].netDifference, 25);
      let payment = await request('/api/payments/initialize', { method: 'POST', headers: { ...headers, 'x-idempotency-key': 'part65-next-325' }, body: JSON.stringify({ schoolId, schoolType: 'private', planId: 'private', academicYear: '2026/2027', termNumber: 2, reopeningDate: '2027-01-01', closingDate: '2027-04-30', amount: 999999, currency: 'USD' }) }); const paymentText = await payment.text(); assert.equal(payment.status, 201, paymentText); const paymentBody = JSON.parse(paymentText); assert.equal(paymentBody.amountGhs, 300, 'the fixture has 300 authoritative students until the next-term population is applied'); assert.equal(paymentBody.pricePerStudentGhs, 1);
      const changed = JSON.parse(fs.readFileSync(DB, 'utf8')); changed.students = Array.from({ length: 325 }, (_, index) => ({ id: `part65-next-student-${index}`, schoolId, status: 'ACTIVE' })); changed.subscriptions.push({ id: 'sub65-2', schoolId, tenantId: 'tenant65', status: 'ACTIVE', active: true, createdAt: '2027-01-01T00:00:00Z', activeStudentCountAtSubscription: 325, subscriptionAmount: 325, schoolType: 'private', academicYear: '2026/2027', termNumber: 2, termStartDate: '2027-01-01', termEndDate: '2027-04-30' }); changed.subscriptionPopulationCheckpoints.push({ id: 'report65-2', schoolId, tenantId: 'tenant65', subscriptionId: 'sub65-2', checkpointType: 'REPORT_CARD', checkpointTimestamp: '2027-04-20T00:00:00Z', subscriptionPopulation: 325, currentActivePopulation: 325, reportCardPopulation: 325, netAdditionalStudents: 0, carryForwardStudents: 0, classRows: [{ classId: 'class65', className: 'Class 65', subscriptionPopulation: 325, currentActive: 325, reportCards: 325, newAdmissions: 0, withdrawalsTransfersStoppages: 0 }] }); fs.writeFileSync(DB, JSON.stringify(changed, null, 2));
      response = await request(`/api/subscriptions/population-dashboard?schoolId=${schoolId}&subscriptionId=sub65-2`, { headers }); assert.equal(response.status, 200); dashboard = (await response.json()).dashboard; assert.equal(dashboard.notification.state, 'no_difference'); assert.equal(dashboard.summary.subscriptionPopulation, 325); assert.equal(dashboard.summary.currentActivePopulation, 325); assert.equal(dashboard.notification.nextSubscriptionAmountGhs, 325);
      const third = JSON.parse(fs.readFileSync(DB, 'utf8')); third.students = Array.from({ length: 350 }, (_, index) => ({ id: `part65-third-student-${index}`, schoolId, status: 'ACTIVE' })); third.subscriptionPopulationCheckpoints.push({ id: 'report65-3', schoolId, tenantId: 'tenant65', subscriptionId: 'sub65-2', checkpointType: 'REPORT_CARD', checkpointTimestamp: '2027-04-21T00:00:00Z', subscriptionPopulation: 325, currentActivePopulation: 350, reportCardPopulation: 350, netAdditionalStudents: 25, carryForwardStudents: 25, classRows: [{ classId: 'class65', className: 'Class 65', subscriptionPopulation: 325, currentActive: 350, reportCards: 350, newAdmissions: 25, withdrawalsTransfersStoppages: 0 }] }); fs.writeFileSync(DB, JSON.stringify(third, null, 2));
      response = await request(`/api/subscriptions/population-dashboard?schoolId=${schoolId}&subscriptionId=sub65-2`, { headers }); assert.equal(response.status, 200); dashboard = (await response.json()).dashboard; assert.equal(dashboard.summary.currentActivePopulation, 350); assert.equal(dashboard.summary.netAdditionalStudents, 25); assert.equal(dashboard.summary.carryForwardStudents, 25); assert.equal(dashboard.summary.nextSubscriptionAmountGhs, 350); assert.equal(dashboard.notification.message, '25 additional active students detected.');
      response = await request(`/api/subscriptions/population-dashboard?schoolId=${otherSchoolId}`, { headers }); assert.equal(response.status, 200); const other = (await response.json()).dashboard; assert.equal(other.summary.subscriptionPopulation, 0); assert.equal(other.classes.length, 0);
      response = await request(`/api/subscriptions/population-dashboard?schoolId=${schoolId}`, { headers: { origin: BASE } }); assert.equal(response.status, 401);
      response = await request('/api/payments/paystack/initialize', { method: 'POST', headers: { ...headers, 'x-idempotency-key': 'part65-paystack' }, body: JSON.stringify({ schoolId, schoolType: 'private', planId: 'private', academicYear: '2027/2028', termNumber: 1, reopeningDate: '2027-09-01', closingDate: '2027-12-31', email: EMAIL }) }); const paystackText = await response.text(); assert.equal(response.status, 503, paystackText);
      const after = JSON.parse(fs.readFileSync(DB, 'utf8')); assert.equal(after.subscriptions.find(row => row.id === 'sub65-1').activeStudentCountAtSubscription, 300); assert.equal(after.subscriptions.find(row => row.id === 'sub65-2').activeStudentCountAtSubscription, 325);
    } finally { child.kill('SIGTERM'); }
  } finally { if (fs.existsSync(BACKUP)) { fs.copyFileSync(BACKUP, DB); fs.unlinkSync(BACKUP); } else if (fs.existsSync(DB)) fs.unlinkSync(DB); }
}
run().then(() => console.log('Part 65 end-to-end subscription/population verification suite passed.')).catch(error => { console.error(error.stack || error); process.exitCode = 1; });
