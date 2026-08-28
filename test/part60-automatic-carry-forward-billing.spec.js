const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const DB_FILE = path.join(ROOT, 'data', 'edutrack.json');
const BACKUP_FILE = `${DB_FILE}.part60-carry-backup`;
const PORT = 3123;
const BASE = `http://127.0.0.1:${PORT}`;
const EMAIL = 'part60-carry@example.invalid';
const PASSWORD = 'part60 carry secure password';
const ACCESS = 'part60-carry-access';

const serverSource = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
const relationalSource = fs.readFileSync(path.join(ROOT, 'db', 'relational.js'), 'utf8');
const schemaSource = fs.readFileSync(path.join(ROOT, 'db', 'schema.sql'), 'utf8');
const htmlSource = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
assert.match(serverSource, /calculateCarryForwardForSchool/);
assert.match(serverSource, /carry-forward\/calculate/);
assert.match(serverSource, /nextSubscriptionBillablePopulation/);
assert.match(serverSource, /calculateSubscriptionAmount\(context\.activeStudentCount\)/);
assert.match(relationalSource, /subscription_carry_forward_records/);
assert.match(relationalSource, /beginTransaction/);
assert.match(schemaSource, /carry_forward_previous_unique/);
assert.match(htmlSource, /edutrack-part60-carry-panel/);
assert.match(htmlSource, /edutrack-part60-carry-forward-ui/);

function cookies(response) { return (response.headers.get('set-cookie') || '').split(';')[0]; }
async function request(url, options = {}) { return fetch(`${BASE}${url}`, { ...options, headers: { ...(options.headers || {}) } }); }
function waitForServer(child) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Part 60 server did not start')), 10000);
    child.stdout.on('data', chunk => { if (chunk.toString().includes('EduTrack server listening')) { clearTimeout(timer); resolve(); } });
    child.once('error', reject);
    child.once('exit', code => { if (code !== null) reject(new Error(`server exited with ${code}`)); });
  });
}

async function run() {
  if (fs.existsSync(DB_FILE)) fs.copyFileSync(DB_FILE, BACKUP_FILE);
  const schoolId = 'part60-carry-school';
  const tenantId = 'part60-carry-tenant';
  const baseline = '2026-09-01T09:00:00.000Z';
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify({ version: 3, users: [], schools: [], staff: [], students: [], academicConfigurations: [], subscriptions: [], transactions: [], paymentIntents: [], paymentEvents: [], files: [], sessions: [], passwordResets: [], audit: [], schoolFees: [], schoolFeePayments: [], studentStatusHistory: [], studentPopulationReconciliations: [], subscriptionPopulationCheckpoints: [], subscriptionCarryForwardRecords: [], scores: [], publishedResults: [], classes: [] }, null, 2));
    const provision = spawnSync(process.execPath, ['server.js', '--provision'], { cwd: ROOT, env: { ...process.env, EDUTRACK_DEVELOPER_EMAIL: EMAIL, EDUTRACK_DEVELOPER_PASSWORD: PASSWORD, EDUTRACK_DEVELOPER_ACCESS_CODE: ACCESS, EDUTRACK_SUPER_ADMIN_EMAIL: 'part60-super@example.invalid', EDUTRACK_SUPER_ADMIN_PASSWORD: 'part60 super secure password', EDUTRACK_SUPER_ADMIN_ACCESS_CODE: 'part60-super-access' }, encoding: 'utf8' });
    assert.equal(provision.status, 0, provision.stderr || provision.stdout);
    const fixture = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    const developer = fixture.users.find(user => user.email === EMAIL);
    developer.schoolId = schoolId;
    developer.scope = { schoolId };
    fixture.schools.push({ id: schoolId, tenantId, name: 'Part 60 Carry School', ownershipType: 'private', active: true, firstTermFreeUsed: true });
    fixture.classes.push({ id: 'part60-class-a', schoolId, tenantId, name: 'Class A' });
    fixture.students = Array.from({ length: 325 }, (_, index) => ({ id: `part60-student-${index + 1}`, schoolId, tenantId, classId: 'part60-class-a', status: 'ACTIVE', createdAt: index < 300 ? '2026-08-01T09:00:00.000Z' : '2026-09-20T09:00:00.000Z' }));
    fixture.subscriptions.push({ id: 'part60-subscription-1', userId: developer.id, schoolId, tenantId, planId: 'private', schoolType: 'private', academicYear: '2026/2027', termNumber: 1, status: 'ACTIVE', startsAt: baseline, expiresAt: '2026-12-20T23:59:59.999Z', createdAt: baseline, activeStudentCountAtSubscription: 300 });
    fixture.subscriptionPopulationCheckpoints.push({ id: 'part60-checkpoint-1', schoolId, tenantId, subscriptionId: 'part60-subscription-1', checkpointType: 'REPORT_CARD', checkpointTimestamp: '2026-12-10T09:00:00.000Z', currentActivePopulation: 325, subscriptionPopulation: 300, flags: {} });
    fs.writeFileSync(DB_FILE, JSON.stringify(fixture, null, 2));
    const child = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT) }, stdio: ['ignore', 'pipe', 'pipe'] });
    try {
      await waitForServer(child);
      const login = await request('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', origin: BASE }, body: JSON.stringify({ email: EMAIL, password: PASSWORD, accessCode: ACCESS }) });
      assert.equal(login.status, 200);
      const cookie = cookies(login);
      const headers = { 'content-type': 'application/json', cookie, origin: BASE };
      const calculate = await request('/api/subscriptions/carry-forward/calculate', { method: 'POST', headers, body: JSON.stringify({ schoolId, previousSubscriptionId: 'part60-subscription-1', previousEndPopulation: 999, amountDue: 1 }) });
      assert.equal(calculate.status, 400, 'browser cannot submit authoritative carry-forward values');
      const calculated = await request('/api/subscriptions/carry-forward/calculate', { method: 'POST', headers, body: JSON.stringify({ schoolId, previousSubscriptionId: 'part60-subscription-1' }) });
      assert.equal(calculated.status, 201);
      const carry = (await calculated.json()).carryForward;
      assert.equal(carry.previousBaselinePopulation, 300);
      assert.equal(carry.previousEndPopulation, 325);
      assert.equal(carry.verifiedCarryForward, 25);
      assert.equal(carry.nextSubscriptionPopulation, 325);
      const duplicate = await request('/api/subscriptions/carry-forward/calculate', { method: 'POST', headers, body: JSON.stringify({ schoolId, previousSubscriptionId: 'part60-subscription-1' }) });
      assert.equal(duplicate.status, 201);
      assert.equal((await duplicate.json()).carryForward.id, carry.id, 'carry-forward is idempotent and does not create duplicate billing obligations');
      const dashboardResponse = await request(`/api/subscriptions/carry-forward/dashboard?schoolId=${schoolId}&previousSubscriptionId=part60-subscription-1`, { headers: { cookie } });
      assert.equal(dashboardResponse.status, 200);
      const dashboard = (await dashboardResponse.json()).dashboard;
      assert.equal(dashboard.previousSubscriptionPopulation, 300);
      assert.equal(dashboard.verifiedAdditionalStudents, 25);
      assert.equal(dashboard.carryForwardPopulation, 25);
      assert.equal(dashboard.currentActivePopulation, 325);
      assert.equal(dashboard.nextSubscriptionBillablePopulation, 325);
      assert.equal(dashboard.amountDueGhs, 325);
      const stored = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
      assert.equal(stored.subscriptionCarryForwardRecords.length, 1);
      assert.equal(stored.students.length, 325, 'carry-forward calculation does not mutate student records');
    } finally {
      if (!child.killed) child.kill('SIGTERM');
    }
  } finally {
    if (fs.existsSync(BACKUP_FILE)) { fs.copyFileSync(BACKUP_FILE, DB_FILE); fs.unlinkSync(BACKUP_FILE); }
    else if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);
  }
}

run().then(() => console.log('Part 60 automatic carry-forward billing regression suite passed.')).catch(error => { console.error(error.stack || error); process.exitCode = 1; });
