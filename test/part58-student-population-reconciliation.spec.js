'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const DB_FILE = path.join(ROOT, 'data', 'edutrack.json');
const BACKUP_FILE = `${DB_FILE}.part58-reconciliation-backup`;
const PORT = 3121;
const BASE = `http://127.0.0.1:${PORT}`;
const EMAIL = 'part58-reconciliation@example.invalid';
const PASSWORD = 'part58 reconciliation password';
const ACCESS = 'part58-reconciliation-access';

const serverSource = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
const relationalSource = fs.readFileSync(path.join(ROOT, 'db', 'relational.js'), 'utf8');
const schemaSource = fs.readFileSync(path.join(ROOT, 'db', 'schema.sql'), 'utf8');
for (const source of [relationalSource, schemaSource]) {
  assert.match(source, /student_population_reconciliations/);
  assert.match(source, /subscription_timestamp/);
  assert.match(source, /newly_admitted_population/);
  assert.match(source, /withdrawn_population/);
  assert.match(source, /transferred_population/);
  assert.match(source, /stopped_population/);
  assert.match(source, /net_active_difference/);
}
assert.match(serverSource, /reconcileCompatibilityStudentPopulation/);
assert.match(serverSource, /studentStatusHistory/);
assert.match(relationalSource, /reconcileStudentPopulation/);
assert.match(relationalSource, /student_status_history/);
assert.match(serverSource, new RegExp('subscriptions/reconciliation'));

function cookies(response) { return (response.headers.get('set-cookie') || '').split(';')[0]; }
async function request(url, options = {}) { return fetch(`${BASE}${url}`, { ...options, headers: { ...(options.headers || {}) } }); }
function waitForServer(child) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Part 58 server did not start')), 10000);
    child.stdout.on('data', chunk => { if (chunk.toString().includes('EduTrack server listening')) { clearTimeout(timer); resolve(); } });
    child.once('error', reject);
    child.once('exit', code => { if (code !== null) reject(new Error(`server exited with ${code}`)); });
  });
}

async function run() {
  if (fs.existsSync(DB_FILE)) fs.copyFileSync(DB_FILE, BACKUP_FILE);
  const baseline = '2026-09-01T09:00:00.000Z';
  const after = '2026-09-20T09:00:00.000Z';
  fs.writeFileSync(DB_FILE, JSON.stringify({ version: 3, users: [], schools: [], staff: [], students: [], academicConfigurations: [], subscriptions: [], transactions: [], paymentIntents: [], paymentEvents: [], files: [], sessions: [], passwordResets: [], audit: [], schoolFees: [], schoolFeePayments: [], studentStatusHistory: [], studentPopulationReconciliations: [] }, null, 2));
  const provision = spawnSync(process.execPath, ['server.js', '--provision'], {
    cwd: ROOT,
    env: { ...process.env, EDUTRACK_DEVELOPER_EMAIL: EMAIL, EDUTRACK_DEVELOPER_PASSWORD: PASSWORD, EDUTRACK_DEVELOPER_ACCESS_CODE: ACCESS, EDUTRACK_SUPER_ADMIN_EMAIL: 'part58-super@example.invalid', EDUTRACK_SUPER_ADMIN_PASSWORD: 'part58 super secure password', EDUTRACK_SUPER_ADMIN_ACCESS_CODE: 'part58-super-access' },
    encoding: 'utf8'
  });
  assert.equal(provision.status, 0, provision.stderr || provision.stdout);
  const fixture = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  const schoolId = 'part58-reconciliation-school';
  const otherSchoolId = 'part58-other-school';
  const developer = fixture.users.find(user => user.email === EMAIL);
  developer.schoolId = schoolId;
  developer.scope = { schoolId };
  fixture.schools.push({ id: schoolId, name: 'Part 58 Reconciliation School', ownershipType: 'private', active: true, firstTermFreeUsed: true });
  fixture.schools.push({ id: otherSchoolId, name: 'Other Private School', ownershipType: 'private', active: true, firstTermFreeUsed: true });
  fixture.students = [
    { id: 'part58-student-1', schoolId, status: 'WITHDRAWN', createdAt: '2026-08-15T09:00:00.000Z' },
    { id: 'part58-student-2', schoolId, status: 'ACTIVE', createdAt: '2026-08-20T09:00:00.000Z' },
    { id: 'part58-student-3', schoolId, status: 'ACTIVE', createdAt: after },
    { id: 'part58-other-student', schoolId: otherSchoolId, status: 'ACTIVE', createdAt: after }
  ];
  fixture.studentStatusHistory = [{ id: 'part58-status-1', studentId: 'part58-student-1', schoolId, fromStatus: 'ACTIVE', toStatus: 'WITHDRAWN', changedAt: after, createdAt: after }];
  fixture.subscriptions = [{ id: 'part58-subscription-1', userId: developer.id, schoolId, planId: 'private', schoolType: 'private', academicYear: '2026/2027', termNumber: 1, status: 'ACTIVE', startsAt: baseline, expiresAt: '2026-12-20T23:59:59.999Z', createdAt: baseline, activeStudentCountAtSubscription: 2 }];

  const scenarios = [
    { key: 'growth', label: 'Growth', remove: 0, transfer: 0, stop: 0, expectedCurrent: 325, expectedNew: 25, expectedWithdrawn: 0, expectedTransferred: 0, expectedStopped: 0, expectedNet: 25 },
    { key: 'removals', label: 'Removals', remove: 10, transfer: 0, stop: 0, expectedCurrent: 315, expectedNew: 25, expectedWithdrawn: 10, expectedTransferred: 0, expectedStopped: 0, expectedNet: 15 },
    { key: 'flat', label: 'Flat', remove: 0, transfer: 0, stop: 0, expectedCurrent: 300, expectedNew: 0, expectedWithdrawn: 0, expectedTransferred: 0, expectedStopped: 0, expectedNet: 0 },
    { key: 'admission-withdrawal', label: 'Admission followed by withdrawal', remove: 5, transfer: 0, stop: 0, expectedCurrent: 320, expectedNew: 25, expectedWithdrawn: 5, expectedTransferred: 0, expectedStopped: 0, expectedNet: 20 },
    { key: 'terminal-movements', label: 'Transfer and stop', remove: 0, transfer: 1, stop: 1, expectedCurrent: 2, expectedNew: 2, expectedWithdrawn: 0, expectedTransferred: 1, expectedStopped: 1, expectedNet: 0 }
  ];
  for (const scenario of scenarios) {
    const scenarioSchoolId = `part58-${scenario.key}-school`;
    const scenarioSubscriptionId = `part58-${scenario.key}-subscription`;
    fixture.schools.push({ id: scenarioSchoolId, name: `Part 58 ${scenario.label}`, ownershipType: 'private', active: true, firstTermFreeUsed: true });
    const baselineStudents = Array.from({ length: scenario.key === 'terminal-movements' ? 2 : 300 }, (_, index) => ({ id: `${scenario.key}-baseline-${index + 1}`, schoolId: scenarioSchoolId, status: 'ACTIVE', createdAt: '2026-08-01T09:00:00.000Z' }));
    const baselineCount = baselineStudents.length;
    const additions = Array.from({ length: scenario.key === 'flat' ? 0 : scenario.key === 'terminal-movements' ? 2 : 25 }, (_, index) => {
      const status = index < scenario.remove ? 'WITHDRAWN' : index < scenario.remove + scenario.transfer ? 'TRANSFERRED' : index < scenario.remove + scenario.transfer + scenario.stop ? 'STOPPED' : (scenario.key === 'growth' && index === 0 ? 'ADMITTED' : 'ACTIVE');
      return { id: `${scenario.key}-addition-${index + 1}`, schoolId: scenarioSchoolId, status, createdAt: after };
    });
    fixture.students.push(...baselineStudents, ...additions);
    const terminalStatuses = additions.filter(student => ['WITHDRAWN', 'TRANSFERRED', 'STOPPED'].includes(student.status));
    fixture.studentStatusHistory.push(...terminalStatuses.map((student, index) => ({ id: `${scenario.key}-status-${index + 1}`, studentId: student.id, schoolId: scenarioSchoolId, fromStatus: 'ACTIVE', toStatus: student.status, changedAt: after, createdAt: after })));
    fixture.subscriptions.push({ id: scenarioSubscriptionId, userId: developer.id, schoolId: scenarioSchoolId, planId: 'private', schoolType: 'private', academicYear: '2026/2027', termNumber: 1, status: 'ACTIVE', startsAt: baseline, expiresAt: '2026-12-20T23:59:59.999Z', createdAt: baseline, activeStudentCountAtSubscription: baselineCount });
  }
  fs.writeFileSync(DB_FILE, JSON.stringify(fixture, null, 2));
  const child = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT) }, stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    await waitForServer(child);
    const login = await request('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', origin: BASE }, body: JSON.stringify({ email: EMAIL, password: PASSWORD, accessCode: ACCESS }) });
    assert.equal(login.status, 200);
    const cookie = cookies(login);
    const reconcile = await request('/api/subscriptions/reconciliation', { method: 'POST', headers: { 'content-type': 'application/json', cookie, origin: BASE }, body: JSON.stringify({ schoolId, subscriptionId: 'part58-subscription-1', subscriptionPopulation: 999, currentActivePopulation: 999, newlyAdmittedPopulation: 999 }) });
    assert.equal(reconcile.status, 201);
    const payload = await reconcile.json();
    assert.equal(payload.reconciliation.subscriptionPopulation, 2);
    assert.equal(payload.reconciliation.currentActivePopulation, 2);
    assert.equal(payload.reconciliation.newlyAdmittedPopulation, 1);
    assert.equal(payload.reconciliation.withdrawnPopulation, 1);
    assert.equal(payload.reconciliation.transferredPopulation, 0);
    assert.equal(payload.reconciliation.stoppedPopulation, 0);
    assert.equal(payload.reconciliation.netActiveDifference, 0);
    assert.equal(payload.reconciliation.postSubscriptionStudents, 0);
    assert.equal(payload.reconciliation.subscriptionTimestamp, baseline);

    const second = await request('/api/subscriptions/reconciliation', { method: 'POST', headers: { 'content-type': 'application/json', cookie, origin: BASE }, body: JSON.stringify({ schoolId, subscriptionId: 'part58-subscription-1' }) });
    assert.equal(second.status, 201);
    const list = await request(`/api/subscriptions/reconciliation?schoolId=${schoolId}&subscriptionId=part58-subscription-1`, { headers: { cookie } });
    assert.equal(list.status, 200);
    const listPayload = await list.json();
    assert.equal(listPayload.reconciliations.length, 2, 'reconciliation snapshots are append-only');
    assert.equal(listPayload.reconciliations[0].subscriptionPopulation, 2);
    assert.equal(listPayload.reconciliations[1].subscriptionPopulation, 2);

    const studentSnapshotBeforeScenarios = JSON.stringify(JSON.parse(fs.readFileSync(DB_FILE, 'utf8')).students);
    for (const scenario of scenarios) {
      const response = await request('/api/subscriptions/reconciliation', { method: 'POST', headers: { 'content-type': 'application/json', cookie, origin: BASE }, body: JSON.stringify({ schoolId: `part58-${scenario.key}-school`, subscriptionId: `part58-${scenario.key}-subscription`, currentActivePopulation: 999, newlyAdmittedPopulation: 999, withdrawnPopulation: 999 }) });
      assert.equal(response.status, 201, `${scenario.label} reconciliation should succeed`);
      const result = (await response.json()).reconciliation;
      assert.equal(result.currentActivePopulation, scenario.expectedCurrent, scenario.label);
      assert.equal(result.newlyAdmittedPopulation, scenario.expectedNew, scenario.label);
      assert.equal(result.withdrawnPopulation, scenario.expectedWithdrawn, scenario.label);
      assert.equal(result.transferredPopulation, scenario.expectedTransferred, scenario.label);
      assert.equal(result.stoppedPopulation, scenario.expectedStopped, scenario.label);
      assert.equal(result.netActiveDifference, scenario.expectedNet, scenario.label);
      assert.equal(result.postSubscriptionStudents, scenario.expectedNet, scenario.label);
    }
    assert.equal(JSON.stringify(JSON.parse(fs.readFileSync(DB_FILE, 'utf8')).students), studentSnapshotBeforeScenarios, 'reconciliation does not mutate historical student records');

    const crossSchool = await request('/api/subscriptions/reconciliation', { method: 'POST', headers: { 'content-type': 'application/json', cookie, origin: BASE }, body: JSON.stringify({ schoolId: otherSchoolId, subscriptionId: 'part58-subscription-1' }) });
    assert.ok([403, 404].includes(crossSchool.status), 'school-scoped authorization prevents cross-school reconciliation');
  } finally {
    if (!child.killed) child.kill('SIGTERM');
    if (fs.existsSync(BACKUP_FILE)) { fs.copyFileSync(BACKUP_FILE, DB_FILE); fs.unlinkSync(BACKUP_FILE); }
    else if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);
  }
}

run().then(() => console.log('Part 58 student population reconciliation regression suite passed.')).catch(error => { console.error(error.stack || error); process.exitCode = 1; });
