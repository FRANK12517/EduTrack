'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const DB_FILE = path.join(ROOT, 'data', 'edutrack.json');
const BACKUP_FILE = `${DB_FILE}.part59-population-backup`;
const PORT = 3122;
const BASE = `http://127.0.0.1:${PORT}`;
const EMAIL = 'part59-population@example.invalid';
const PASSWORD = 'part59 population secure password';
const ACCESS = 'part59-population-access';

const serverSource = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
const relationalSource = fs.readFileSync(path.join(ROOT, 'db', 'relational.js'), 'utf8');
const schemaSource = fs.readFileSync(path.join(ROOT, 'db', 'schema.sql'), 'utf8');
const htmlSource = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
assert.match(serverSource, /population-checkpoints/);
assert.match(serverSource, /recordPopulationCheckpointIfSubscription/);
assert.match(serverSource, /Population counts are server-generated/);
assert.match(relationalSource, /subscription_population_checkpoints/);
assert.match(schemaSource, /subscription_population_checkpoints/);
assert.match(htmlSource, /edutrack-part59-population-panel/);
assert.match(htmlSource, /overflow-x:auto/);

function cookies(response) { return (response.headers.get('set-cookie') || '').split(';')[0]; }
async function request(url, options = {}) { return fetch(`${BASE}${url}`, { ...options, headers: { ...(options.headers || {}) } }); }
function waitForServer(child) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Part 59 server did not start')), 10000);
    child.stdout.on('data', chunk => { if (chunk.toString().includes('EduTrack server listening')) { clearTimeout(timer); resolve(); } });
    child.once('error', reject);
    child.once('exit', code => { if (code !== null) reject(new Error(`server exited with ${code}`)); });
  });
}

async function run() {
  if (fs.existsSync(DB_FILE)) fs.copyFileSync(DB_FILE, BACKUP_FILE);
  const baseline = '2026-09-01T09:00:00.000Z';
  const after = '2026-09-20T09:00:00.000Z';
  const schoolId = 'part59-population-school';
  const otherSchoolId = 'part59-other-school';
  const tenantId = 'part59-tenant';
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify({ version: 3, users: [], schools: [], staff: [], students: [], academicConfigurations: [], subscriptions: [], transactions: [], paymentIntents: [], paymentEvents: [], files: [], sessions: [], passwordResets: [], audit: [], schoolFees: [], schoolFeePayments: [], studentStatusHistory: [], studentPopulationReconciliations: [], subscriptionPopulationCheckpoints: [], scores: [], publishedResults: [], classes: [] }, null, 2));
    const provision = spawnSync(process.execPath, ['server.js', '--provision'], { cwd: ROOT, env: { ...process.env, EDUTRACK_DEVELOPER_EMAIL: EMAIL, EDUTRACK_DEVELOPER_PASSWORD: PASSWORD, EDUTRACK_DEVELOPER_ACCESS_CODE: ACCESS, EDUTRACK_SUPER_ADMIN_EMAIL: 'part59-super@example.invalid', EDUTRACK_SUPER_ADMIN_PASSWORD: 'part59 super secure password', EDUTRACK_SUPER_ADMIN_ACCESS_CODE: 'part59-super-access' }, encoding: 'utf8' });
    assert.equal(provision.status, 0, provision.stderr || provision.stdout);
    const fixture = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    const developer = fixture.users.find(user => user.email === EMAIL);
    developer.schoolId = schoolId;
    developer.scope = { schoolId };
    fixture.schools.push({ id: schoolId, tenantId, name: 'Part 59 Population School', ownershipType: 'private', active: true, firstTermFreeUsed: true });
    fixture.schools.push({ id: otherSchoolId, tenantId: 'other-tenant', name: 'Other School', ownershipType: 'private', active: true, firstTermFreeUsed: true });
    fixture.classes.push({ id: 'part59-class-a', schoolId, tenantId, name: 'Class A' }, { id: 'part59-class-b', schoolId, tenantId, name: 'Class B' });
    fixture.students = Array.from({ length: 300 }, (_, index) => ({ id: `part59-base-${index + 1}`, schoolId, tenantId, classId: index < 150 ? 'part59-class-a' : 'part59-class-b', status: 'ACTIVE', createdAt: '2026-08-01T09:00:00.000Z' }));
    fixture.students.push({ id: 'part59-pre-inactive', schoolId, tenantId, classId: 'part59-class-b', status: 'INACTIVE', createdAt: '2026-08-15T09:00:00.000Z' });
    fixture.students.push(...Array.from({ length: 25 }, (_, index) => ({ id: `part59-new-${index + 1}`, schoolId, tenantId, classId: 'part59-class-a', status: 'ACTIVE', createdAt: after })));
    fixture.students.push({ id: 'part59-other-student', schoolId: otherSchoolId, tenantId: 'other-tenant', classId: 'other-class', status: 'ACTIVE', createdAt: after });
    fixture.studentStatusHistory.push({ id: 'part59-inactive-status', studentId: 'part59-pre-inactive', schoolId, fromStatus: 'ACTIVE', toStatus: 'INACTIVE', changedAt: after, createdAt: after });
    fixture.subscriptions.push({ id: 'part59-subscription', userId: developer.id, schoolId, tenantId, planId: 'private', schoolType: 'private', academicYear: '2026/2027', termNumber: 1, status: 'ACTIVE', startsAt: baseline, expiresAt: '2026-12-20T23:59:59.999Z', createdAt: baseline, activeStudentCountAtSubscription: 300 });
    fixture.scores = fixture.students.filter(student => student.schoolId === schoolId && student.status === 'ACTIVE').map((student, index) => ({ id: `part59-score-${index + 1}`, studentId: student.id, schoolId, tenantId, classId: student.classId, examinationId: 'part59-exam' }));
    const activeStudents = fixture.students.filter(student => student.schoolId === schoolId && student.status === 'ACTIVE');
    fixture.publishedResults = activeStudents.slice(0, 324).map((student, index) => ({ id: `part59-result-${index + 1}`, studentId: student.id, schoolId, tenantId, classId: student.classId, examinationId: 'part59-exam', publicationStatus: 'PUBLISHED' }));
    fixture.publishedResults.push({ id: 'part59-inactive-result', studentId: 'part59-pre-inactive', schoolId, tenantId, classId: 'part59-class-b', examinationId: 'part59-exam', publicationStatus: 'PUBLISHED' });
    fixture.publishedResults.push({ id: 'part59-outside-result', studentId: 'part59-other-student', schoolId: otherSchoolId, tenantId: 'other-tenant', classId: 'other-class', examinationId: 'part59-exam', publicationStatus: 'PUBLISHED' });
    fs.writeFileSync(DB_FILE, JSON.stringify(fixture, null, 2));
    const studentsBefore = JSON.stringify(fixture.students);
    const child = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT) }, stdio: ['ignore', 'pipe', 'pipe'] });
    try {
      await waitForServer(child);
      const login = await request('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', origin: BASE }, body: JSON.stringify({ email: EMAIL, password: PASSWORD, accessCode: ACCESS }) });
      assert.equal(login.status, 200);
      const cookie = cookies(login);
      const post = (body) => request('/api/subscriptions/population-checkpoints', { method: 'POST', headers: { 'content-type': 'application/json', cookie, origin: BASE }, body: JSON.stringify(body) });
      const examResponse = await post({ schoolId, subscriptionId: 'part59-subscription', checkpointType: 'EXAM_INPUT', examinationId: 'part59-exam', activeStudentCount: 999, studentCount: 999 });
      assert.equal(examResponse.status, 400, 'browser counts must be rejected');
      const exam = await post({ schoolId, subscriptionId: 'part59-subscription', checkpointType: 'EXAM_INPUT', examinationId: 'part59-exam' });
      assert.equal(exam.status, 201);
      const examCheckpoint = (await exam.json()).checkpoint;
      assert.equal(examCheckpoint.subscriptionPopulation, 300);
      assert.equal(examCheckpoint.currentActivePopulation, 325);
      assert.equal(examCheckpoint.examinationPopulation, 325);
      assert.equal(examCheckpoint.netAdditionalStudents, 25);
      assert.equal(examCheckpoint.carryForwardStudents, 25);
      assert.equal(examCheckpoint.classRows.length, 2);
      assert.ok(examCheckpoint.classRows.every(row => Object.hasOwn(row, 'activeAtSubscription') && Object.hasOwn(row, 'examInput')));

      const report = await post({ schoolId, subscriptionId: 'part59-subscription', checkpointType: 'REPORT_CARD', examinationId: 'part59-exam', reportType: 'REPORT_CARD', currentActivePopulation: 1 });
      assert.equal(report.status, 400, 'client current population must be rejected');
      const reportOk = await post({ schoolId, subscriptionId: 'part59-subscription', checkpointType: 'REPORT_CARD', examinationId: 'part59-exam', reportType: 'REPORT_CARD' });
      assert.equal(reportOk.status, 201);
      const reportCheckpoint = (await reportOk.json()).checkpoint;
      assert.equal(reportCheckpoint.currentActivePopulation, 325);
      assert.equal(reportCheckpoint.reportCardPopulation, 324);
      assert.equal(reportCheckpoint.activeWithoutReportCards, 1);
      assert.equal(reportCheckpoint.reportCardsForInactiveStudents, 1);
      assert.equal(reportCheckpoint.reportCardsOutsideSchoolTenant, 1);
      assert.equal(reportCheckpoint.flags.studentsAdmittedAfterSubscription, 25);
      assert.equal(reportCheckpoint.populationDiscrepancy, true);

      const dashboardResponse = await request(`/api/subscriptions/population-dashboard?schoolId=${schoolId}&subscriptionId=part59-subscription`, { headers: { cookie } });
      assert.equal(dashboardResponse.status, 200);
      const dashboard = (await dashboardResponse.json()).dashboard;
      assert.equal(dashboard.summary.subscriptionPopulation, 300);
      assert.equal(dashboard.summary.currentActivePopulation, 325);
      assert.equal(dashboard.summary.newAdmissionsAfterSubscription, 25);
      assert.equal(dashboard.summary.examinationPopulation, 325);
      assert.equal(dashboard.summary.reportCardPopulation, 324);
      assert.equal(dashboard.summary.carryForwardStudents, 25);
      assert.ok(dashboard.classes.some(row => row.difference === 1));

      const list = await request(`/api/subscriptions/population-checkpoints?schoolId=${schoolId}&subscriptionId=part59-subscription`, { headers: { cookie } });
      assert.equal(list.status, 200);
      assert.equal((await list.json()).checkpoints.length, 2, 'checkpoint snapshots are append-only');
      const crossSchool = await request(`/api/subscriptions/population-dashboard?schoolId=${otherSchoolId}`, { headers: { cookie } });
      assert.equal(crossSchool.status, 200, 'global developer role may query an empty school scope');
      const crossSchoolDashboard = (await crossSchool.json()).dashboard;
      assert.equal(crossSchoolDashboard.summary.currentActivePopulation, 0, 'cross-school dashboard does not leak the authorized school population');
      assert.equal(JSON.stringify(JSON.parse(fs.readFileSync(DB_FILE, 'utf8')).students), studentsBefore, 'checkpointing does not mutate students');
    } finally {
      if (!child.killed) child.kill('SIGTERM');
    }
  } finally {
    if (fs.existsSync(BACKUP_FILE)) { fs.copyFileSync(BACKUP_FILE, DB_FILE); fs.unlinkSync(BACKUP_FILE); }
    else if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);
  }
}

run().then(() => console.log('Part 59 examination/report-card population regression suite passed.')).catch(error => { console.error(error.stack || error); process.exitCode = 1; });
