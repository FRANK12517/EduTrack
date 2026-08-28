const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const DB_FILE = path.join(ROOT, 'data', 'edutrack.json');
const BACKUP_FILE = `${DB_FILE}.part63-backup`;
const PORT = 3131;
const BASE = `http://127.0.0.1:${PORT}`;
const EMAIL = 'part63@example.invalid';
const PASSWORD = 'part63 secure password';
const ACCESS = 'part63-access';

const serverSource = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
const htmlSource = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
assert.match(serverSource, /schoolType is required and must be Government or Private/);
assert.match(serverSource, /School type does not match the persistent school record/);
assert.match(htmlSource, /id="subv2-renew-school-type"/);
assert.match(htmlSource, /name="schoolType"/);
assert.match(htmlSource, /option value="government">Government School/);
assert.match(htmlSource, /option value="private">Private School/);
assert.match(htmlSource, /required aria-describedby/);
assert.doesNotMatch(htmlSource, /input id="subv2-renew-school-type"/);

function cookie(response) {
  return (response.headers.get('set-cookie') || '').split(';')[0];
}
async function request(url, options = {}) {
  return fetch(`${BASE}${url}`, options);
}
function waitForServer(child) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('server start timeout')), 10000);
    child.stdout.on('data', buffer => {
      if (buffer.toString().includes('EduTrack server listening')) {
        clearTimeout(timer);
        resolve();
      }
    });
    child.once('error', reject);
    child.once('exit', code => {
      if (code !== null) reject(new Error(`server exited ${code}`));
    });
  });
}

async function run() {
  if (fs.existsSync(DB_FILE)) fs.copyFileSync(DB_FILE, BACKUP_FILE);
  const privateSchoolId = 'part63-private';
  const governmentSchoolId = 'part63-government';
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify({
      version: 3, users: [], schools: [], staff: [], students: [], academicConfigurations: [], governmentAcademicCalendars: [], subscriptions: [], transactions: [], paymentIntents: [], paymentEvents: [], files: [], sessions: [], passwordResets: [], audit: [], schoolFees: [], schoolFeePayments: [], studentStatusHistory: [], studentPopulationReconciliations: [], subscriptionPopulationCheckpoints: [], subscriptionCarryForwardRecords: [], scores: [], publishedResults: [], classes: []
    }, null, 2));

    const provision = spawnSync(process.execPath, ['server.js', '--provision'], {
      cwd: ROOT,
      env: { ...process.env, EDUTRACK_DEVELOPER_EMAIL: EMAIL, EDUTRACK_DEVELOPER_PASSWORD: PASSWORD, EDUTRACK_DEVELOPER_ACCESS_CODE: ACCESS, EDUTRACK_SUPER_ADMIN_EMAIL: 'part63-super@example.invalid', EDUTRACK_SUPER_ADMIN_PASSWORD: 'part63 super secure password', EDUTRACK_SUPER_ADMIN_ACCESS_CODE: 'part63-super-access' },
      encoding: 'utf8'
    });
    assert.equal(provision.status, 0, provision.stderr || provision.stdout);
    const database = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    const user = database.users.find(row => row.email === EMAIL);
    user.schoolId = privateSchoolId;
    user.scope = { schoolId: privateSchoolId };
    database.schools.push(
      { id: privateSchoolId, tenantId: 'tenant-private', name: 'Part 63 Private', ownershipType: 'private', active: true, firstTermFreeUsed: true },
      { id: governmentSchoolId, tenantId: 'tenant-government', name: 'Part 63 Government', ownershipType: 'government', active: true, firstTermFreeUsed: true }
    );
    database.students = Array.from({ length: 3 }, (_, index) => ({ id: `part63-student-${index}`, schoolId: privateSchoolId, status: 'ACTIVE' }));
    database.governmentAcademicCalendars = [{ id: 'part63-gov-t1-v1', academicYear: '2026/2027', termNumber: 1, schoolType: 'government', reopeningDate: '2026-09-01', vacationDate: '2026-12-20', status: 'PUBLISHED', effectiveDate: '2026-01-01', version: 1 }];
    fs.writeFileSync(DB_FILE, JSON.stringify(database, null, 2));

    const child = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT) }, stdio: ['ignore', 'pipe', 'pipe'] });
    try {
      await waitForServer(child);
      const login = await request('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', origin: BASE }, body: JSON.stringify({ email: EMAIL, password: PASSWORD, accessCode: ACCESS }) });
      assert.equal(login.status, 200);
      const headers = { 'content-type': 'application/json', origin: BASE, cookie: cookie(login) };
      const privateBody = { schoolId: privateSchoolId, planId: 'private', academicYear: '2026/2027', termNumber: 1, reopeningDate: '2026-09-01', closingDate: '2027-01-01', amount: 999, currency: 'USD' };

      let response = await request('/api/payments/initialize', { method: 'POST', headers: { ...headers, 'x-idempotency-key': 'part63-no-type' }, body: JSON.stringify(privateBody) });
      assert.equal(response.status, 400, 'missing School Type must be rejected');
      response = await request('/api/payments/initialize', { method: 'POST', headers: { ...headers, 'x-idempotency-key': 'part63-invalid-type' }, body: JSON.stringify({ ...privateBody, schoolType: 'anything' }) });
      assert.equal(response.status, 400, 'invalid School Type must be rejected');
      response = await request('/api/payments/initialize', { method: 'POST', headers: { ...headers, 'x-idempotency-key': 'part63-mismatch' }, body: JSON.stringify({ ...privateBody, schoolType: 'government' }) });
      assert.equal(response.status, 400, 'ownership mismatch must be rejected');
      response = await request('/api/payments/initialize', { method: 'POST', headers: { ...headers, 'x-idempotency-key': 'part63-private-valid' }, body: JSON.stringify({ ...privateBody, schoolType: 'private' }) });
      assert.equal(response.status, 201);
      const privatePayment = await response.json();
      assert.equal(privatePayment.schoolType, 'private');
      assert.equal(privatePayment.activeStudentCount, 3);
      assert.equal(privatePayment.pricePerStudentGhs, 1);
      assert.equal(privatePayment.amountGhs, 3);

      response = await request('/api/payments/initialize', { method: 'POST', headers: { ...headers, 'x-idempotency-key': 'part63-cross-school' }, body: JSON.stringify({ schoolId: governmentSchoolId, schoolType: 'government', planId: 'government', academicYear: '2026/2027', termNumber: 1, amount: 1, currency: 'GHS' }) });
      assert.equal(response.status, 403, 'school-scoped users cannot initialize another school subscription');
      response = await request('/api/payments/paystack/initialize', { method: 'POST', headers: { ...headers, 'x-idempotency-key': 'part63-paystack-no-type' }, body: JSON.stringify(privateBody) });
      assert.equal(response.status, 400, 'Paystack route must also reject omitted School Type');

      const stored = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
      const intent = stored.paymentIntents.find(row => row.idempotencyKey === 'part63-private-valid');
      assert.equal(intent.amount, 300);
    } finally {
      child.kill('SIGTERM');
    }
  } finally {
    if (fs.existsSync(BACKUP_FILE)) {
      fs.copyFileSync(BACKUP_FILE, DB_FILE);
      fs.unlinkSync(BACKUP_FILE);
    } else if (fs.existsSync(DB_FILE)) {
      fs.unlinkSync(DB_FILE);
    }
  }
}

run().then(() => console.log('Part 63 School Type selection regression suite passed.')).catch(error => { console.error(error.stack || error); process.exitCode = 1; });
