const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const DB_FILE = path.join(ROOT, 'data', 'edutrack.json');
const BACKUP_FILE = `${DB_FILE}.part61-private-backup`;
const PORT = 3124;
const BASE = `http://127.0.0.1:${PORT}`;
const EMAIL = 'part61-private@example.invalid';
const PASSWORD = 'part61 private secure password';
const ACCESS = 'part61-private-access';

const policySource = fs.readFileSync(path.join(ROOT, 'app', 'subscription-policy.js'), 'utf8');
const serverSource = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
const relationalSource = fs.readFileSync(path.join(ROOT, 'db', 'relational.js'), 'utf8');
const schemaSource = fs.readFileSync(path.join(ROOT, 'db', 'schema.sql'), 'utf8');
const htmlSource = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
assert.match(policySource, /MAX_PRIVATE_TERM_MONTHS = 4/);
assert.match(policySource, /validatePrivateAcademicYearDates/);
assert.match(serverSource, /Private school has already used all three subscription periods/);
assert.match(serverSource, /Private subscription dates overlap an existing subscription period/);
assert.match(serverSource, /privateSubscriptionCountForAcademicYear/);
assert.match(relationalSource, /private_subscription_year_controls/);
assert.match(schemaSource, /private_subscription_count_for_academic_year/);
assert.match(htmlSource, /edutrack-part61-private-panel/);
assert.match(htmlSource, /subscriptionLabel/);

function cookies(response) { return (response.headers.get('set-cookie') || '').split(';')[0]; }
async function request(url, options = {}) { return fetch(`${BASE}${url}`, { ...options, headers: { ...(options.headers || {}) } }); }
function waitForServer(child) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Part 61 server did not start')), 10000);
    child.stdout.on('data', chunk => { if (chunk.toString().includes('EduTrack server listening')) { clearTimeout(timer); resolve(); } });
    child.once('error', reject);
    child.once('exit', code => { if (code !== null) reject(new Error(`server exited with ${code}`)); });
  });
}

async function run() {
  if (fs.existsSync(DB_FILE)) fs.copyFileSync(DB_FILE, BACKUP_FILE);
  const schoolId = 'part61-private-school';
  const otherSchoolId = 'part61-other-school';
  const tenantId = 'part61-private-tenant';
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify({ version: 3, users: [], schools: [], staff: [], students: [], academicConfigurations: [], subscriptions: [], transactions: [], paymentIntents: [], paymentEvents: [], files: [], sessions: [], passwordResets: [], audit: [], schoolFees: [], schoolFeePayments: [], studentStatusHistory: [], studentPopulationReconciliations: [], subscriptionPopulationCheckpoints: [], subscriptionCarryForwardRecords: [], scores: [], publishedResults: [], classes: [] }, null, 2));
    const provision = spawnSync(process.execPath, ['server.js', '--provision'], { cwd: ROOT, env: { ...process.env, EDUTRACK_DEVELOPER_EMAIL: EMAIL, EDUTRACK_DEVELOPER_PASSWORD: PASSWORD, EDUTRACK_DEVELOPER_ACCESS_CODE: ACCESS, EDUTRACK_SUPER_ADMIN_EMAIL: 'part61-super@example.invalid', EDUTRACK_SUPER_ADMIN_PASSWORD: 'part61 super secure password', EDUTRACK_SUPER_ADMIN_ACCESS_CODE: 'part61-super-access' }, encoding: 'utf8' });
    assert.equal(provision.status, 0, provision.stderr || provision.stdout);
    const fixture = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    const developer = fixture.users.find(user => user.email === EMAIL);
    developer.schoolId = schoolId;
    developer.scope = { schoolId };
    fixture.schools.push({ id: schoolId, tenantId, name: 'Part 61 Private School', ownershipType: 'private', active: true, firstTermFreeUsed: true });
    fixture.schools.push({ id: otherSchoolId, tenantId: 'part61-other-tenant', name: 'Other School', ownershipType: 'private', active: true, firstTermFreeUsed: true });
    fixture.students = Array.from({ length: 325 }, (_, index) => ({ id: `part61-student-${index + 1}`, schoolId, tenantId, status: 'ACTIVE', createdAt: '2026-08-01T09:00:00.000Z' }));
    fixture.students.push({ id: 'part61-other-student', schoolId: otherSchoolId, tenantId: 'part61-other-tenant', status: 'ACTIVE', createdAt: '2026-08-01T09:00:00.000Z' });
    fs.writeFileSync(DB_FILE, JSON.stringify(fixture, null, 2));
    const child = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT) }, stdio: ['ignore', 'pipe', 'pipe'] });
    try {
      await waitForServer(child);
      const login = await request('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', origin: BASE }, body: JSON.stringify({ email: EMAIL, password: PASSWORD, accessCode: ACCESS }) });
      assert.equal(login.status, 200);
      const cookie = cookies(login);
      const headers = { 'content-type': 'application/json', cookie, origin: BASE };
      const init = (body, key) => request('/api/payments/initialize', { method: 'POST', headers: { ...headers, 'x-idempotency-key': key }, body: JSON.stringify(body) });
      const base = { schoolId, schoolType: 'private', planId: 'private', academicYear: '2026/2027', amount: 1, activeStudentCount: 1, currency: 'USD' };
      const first = await init({ ...base, termNumber: 1, reopeningDate: '2026-09-01', closingDate: '2027-01-01' }, 'term-1');
      assert.equal(first.status, 201);
      const firstPayload = await first.json();
      assert.equal(firstPayload.subscriptionSequence, 1);
      assert.equal(firstPayload.amountGhs, 325, 'payment amount is based on authoritative active students');
      assert.equal(firstPayload.amount, 32500);
      const second = await init({ ...base, termNumber: 2, reopeningDate: '2027-01-05', closingDate: '2027-04-20', amount: 1 }, 'term-2');
      assert.equal(second.status, 201);
      assert.equal((await second.json()).subscriptionSequence, 2);
      const third = await init({ ...base, termNumber: 3, reopeningDate: '2027-05-05', closingDate: '2027-08-20' }, 'term-3');
      assert.equal(third.status, 201);
      assert.equal((await third.json()).subscriptionSequence, 3);
      const fourth = await init({ ...base, termNumber: 3, reopeningDate: '2027-09-01', closingDate: '2027-12-20' }, 'term-4');
      assert.equal(fourth.status, 400, 'fourth private subscription in the academic year must be rejected');
      const resetTerm = await init({ ...base, academicYear: '2027/2028', termNumber: 1, reopeningDate: '2027-09-01', closingDate: '2027-12-20' }, 'reset-term-1');
      assert.equal(resetTerm.status, 201, 'new academic year resets the private subscription count');
      const exactFourMonths = await init({ ...base, academicYear: '2028/2029', termNumber: 1, reopeningDate: '2028-09-01', closingDate: '2029-01-01' }, 'exact-four-months');
      assert.equal(exactFourMonths.status, 201, 'a term exactly four calendar months long is accepted');
      const tooLong = await init({ ...base, academicYear: '2029/2030', termNumber: 1, reopeningDate: '2029-09-01', closingDate: '2030-01-02' }, 'too-long');
      assert.equal(tooLong.status, 400);
      const overlapBase = { ...base, academicYear: '2030/2031', termNumber: 1, reopeningDate: '2030-09-01', closingDate: '2030-12-20' };
      assert.equal((await init(overlapBase, 'overlap-term-1')).status, 201);
      const overlap = await init({ ...overlapBase, termNumber: 2, reopeningDate: '2030-12-15', closingDate: '2031-03-15' }, 'overlap-term-2');
      assert.equal(overlap.status, 400, 'overlapping private term dates must be rejected');
      const crossTerm = await init({ ...overlapBase, termNumber: 2, reopeningDate: '2030-11-01', closingDate: '2031-02-01' }, 'cross-term');
      assert.equal(crossTerm.status, 400, 'a private date range spanning an existing academic term must be rejected');
      const privateDashboard = await request(`/api/subscriptions/private-dashboard?schoolId=${schoolId}&academicYear=2026/2027`, { headers: { cookie } });
      assert.equal(privateDashboard.status, 200);
      const dashboard = (await privateDashboard.json()).dashboard;
      assert.equal(dashboard.academicYear, '2026/2027');
      assert.equal(dashboard.privateSubscriptionCountForAcademicYear, 3);
      assert.equal(dashboard.cyclesRemaining, 0);
      assert.equal(dashboard.subscriptions.length, 3);
      assert.equal(dashboard.subscriptions[0].subscriptionLabel, 'Subscription 1/3');
      const crossSchool = await request(`/api/subscriptions/private-dashboard?schoolId=${otherSchoolId}`, { headers: { cookie } });
      assert.equal(crossSchool.status, 200);
      assert.equal((await crossSchool.json()).dashboard.privateSubscriptionCountForAcademicYear, 0, 'private subscription dashboard does not leak another school state');
      const stored = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
      assert.equal(stored.paymentIntents.find(row => row.idempotencyKey === 'term-1').amount, 32500);
    } finally {
      if (!child.killed) child.kill('SIGTERM');
    }
  } finally {
    if (fs.existsSync(BACKUP_FILE)) { fs.copyFileSync(BACKUP_FILE, DB_FILE); fs.unlinkSync(BACKUP_FILE); }
    else if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);
  }
}

run().then(() => console.log('Part 61 private-school three-term subscription regression suite passed.')).catch(error => { console.error(error.stack || error); process.exitCode = 1; });
