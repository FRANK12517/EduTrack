'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const policy = require('../app/subscription-policy');

const ROOT = path.resolve(__dirname, '..');
const DB_FILE = path.join(ROOT, 'data', 'edutrack.json');
const BACKUP_FILE = `${DB_FILE}.part57-complete-backup`;
const PORT = 3117;
const BASE = `http://127.0.0.1:${PORT}`;
const EMAIL = 'part57-complete@example.invalid';
const PASSWORD = 'part57 secure password';
const ACCESS = 'part57-access-code';

for (const [count, expected] of [[1, 1], [100, 100], [300, 300], [325, 325]]) {
  const quote = policy.calculateSubscriptionAmount(count);
  assert.equal(quote.amountGhs, expected);
  assert.equal(quote.amountMinor, expected * 100);
  assert.equal(quote.pricePerStudentGhs, 1);
}
assert.equal(policy.normalizeSchoolType('Government School'), 'government');
assert.equal(policy.normalizeSchoolType('Private School'), 'private');
assert.throws(() => policy.validateTermConfiguration({ schoolType: 'private', academicYear: '2026/2027', termNumber: 1, startDate: '2026-09-01', endDate: '2027-02-01' }), /4 months/);
assert.throws(() => policy.validateTermConfiguration({ schoolType: 'private', academicYear: '2026/2027', termNumber: 1, startDate: '2026-09-01', endDate: '2026-09-01' }), /later than/);
assert.throws(() => policy.validateTermConfiguration({ schoolType: 'government', academicYear: '2026/2027', termNumber: 1, governmentTermId: 'central-1', startDate: '2026-09-01' }), /centrally controlled/);

const serverSource = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
const relationalSource = fs.readFileSync(path.join(ROOT, 'db', 'relational.js'), 'utf8');
const schemaSource = fs.readFileSync(path.join(ROOT, 'db', 'schema.sql'), 'utf8');
const htmlSource = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
assert.match(serverSource, /resolvePaymentContext/);
assert.match(serverSource, /No centrally controlled Government academic term/);
assert.match(serverSource, /Private subscription must be sequence/);
assert.match(serverSource, /Only the Super Administrator may manage Government academic-term dates/);
for (const field of ['school_type', 'government_term_reference', 'private_reopening_date', 'private_vacation_date', 'subscription_sequence']) {
  assert.match(schemaSource, new RegExp(field));
  assert.match(relationalSource, new RegExp(field));
}
assert.match(htmlSource, /Select school type/);
assert.match(htmlSource, /Private subscription terms may not exceed 4 months/);
assert.doesNotMatch(htmlSource, /GH₵130|GH₵200/);

function cookies(response) { return (response.headers.get('set-cookie') || '').split(';')[0]; }
async function request(url, options = {}) { return fetch(`${BASE}${url}`, { ...options, headers: { ...(options.headers || {}) } }); }
function waitForServer(child) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Part 57 server did not start')), 10000);
    child.stdout.on('data', chunk => { if (chunk.toString().includes('EduTrack server listening')) { clearTimeout(timer); resolve(); } });
    child.once('error', reject);
    child.once('exit', code => { if (code !== null) reject(new Error(`server exited with ${code}`)); });
  });
}

async function run() {
  if (fs.existsSync(DB_FILE)) fs.copyFileSync(DB_FILE, BACKUP_FILE);
  fs.writeFileSync(DB_FILE, JSON.stringify({ version: 3, users: [], schools: [], staff: [], students: [], academicConfigurations: [], subscriptions: [], transactions: [], paymentIntents: [], paymentEvents: [], files: [], sessions: [], passwordResets: [], audit: [], schoolFees: [], schoolFeePayments: [] }, null, 2));
  const provision = spawnSync(process.execPath, ['server.js', '--provision'], {
    cwd: ROOT,
    env: { ...process.env, EDUTRACK_DEVELOPER_EMAIL: EMAIL, EDUTRACK_DEVELOPER_PASSWORD: PASSWORD, EDUTRACK_DEVELOPER_ACCESS_CODE: ACCESS, EDUTRACK_SUPER_ADMIN_EMAIL: 'part57-super@example.invalid', EDUTRACK_SUPER_ADMIN_PASSWORD: 'part57 super secure password', EDUTRACK_SUPER_ADMIN_ACCESS_CODE: 'part57-super-code' },
    encoding: 'utf8'
  });
  assert.equal(provision.status, 0, provision.stderr || provision.stdout);
  const fixture = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  const schoolId = 'part57-private-school';
  const developer = fixture.users.find(user => user.email === EMAIL);
  developer.schoolId = schoolId;
  developer.scope = { schoolId };
  fixture.schools.push({ id: schoolId, name: 'Part 57 Private School', ownershipType: 'private', active: true, firstTermFreeUsed: true });
  fixture.students = Array.from({ length: 325 }, (_, index) => ({ id: `part57-student-${index + 1}`, schoolId, status: 'ACTIVE' }));
  fs.writeFileSync(DB_FILE, JSON.stringify(fixture, null, 2));
  const child = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT) }, stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    await waitForServer(child);
    const login = await request('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', origin: BASE }, body: JSON.stringify({ email: EMAIL, password: PASSWORD, accessCode: ACCESS }) });
    assert.equal(login.status, 200);
    const cookie = cookies(login);
    const base = { schoolId, schoolType: 'private', planId: 'private', academicYear: '2026/2027', termNumber: 1, reopeningDate: '2026-09-01', closingDate: '2026-12-20', amount: 1, currency: 'USD' };
    const missingType = await request('/api/payments/initialize', { method: 'POST', headers: { 'content-type': 'application/json', cookie, origin: BASE, 'x-idempotency-key': 'missing-type' }, body: JSON.stringify({ ...base, schoolType: undefined }) });
    assert.equal(missingType.status, 400);
    const multipleTypes = await request('/api/payments/initialize', { method: 'POST', headers: { 'content-type': 'application/json', cookie, origin: BASE, 'x-idempotency-key': 'multiple-types' }, body: JSON.stringify({ ...base, schoolType: ['private', 'government'] }) });
    assert.equal(multipleTypes.status, 400);
    const tooLong = await request('/api/payments/initialize', { method: 'POST', headers: { 'content-type': 'application/json', cookie, origin: BASE, 'x-idempotency-key': 'too-long' }, body: JSON.stringify({ ...base, closingDate: '2027-02-01' }) });
    assert.equal(tooLong.status, 400);
    const first = await request('/api/payments/initialize', { method: 'POST', headers: { 'content-type': 'application/json', cookie, origin: BASE, 'x-idempotency-key': 'private-term-1' }, body: JSON.stringify(base) });
    assert.equal(first.status, 201);
    const firstPayload = await first.json();
    assert.equal(firstPayload.amountGhs, 325);
    assert.equal(firstPayload.amount, 32500);
    assert.equal(firstPayload.activeStudentCount, 325);
    assert.equal(firstPayload.schoolType, 'private');
    assert.equal(firstPayload.subscriptionSequence, 1);
    const forged = await request('/api/payments/initialize', { method: 'POST', headers: { 'content-type': 'application/json', cookie, origin: BASE, 'x-idempotency-key': 'private-term-1-forged' }, body: JSON.stringify({ ...base, amount: 1, activeStudentCount: 1, termNumber: 1 }) });
    assert.equal(forged.status, 400, 'a second private term 1 must not bypass sequence enforcement');
    const second = await request('/api/payments/initialize', { method: 'POST', headers: { 'content-type': 'application/json', cookie, origin: BASE, 'x-idempotency-key': 'private-term-2' }, body: JSON.stringify({ ...base, termNumber: 2, reopeningDate: '2027-01-05', closingDate: '2027-04-20' }) });
    assert.equal(second.status, 201);
    assert.equal((await second.json()).subscriptionSequence, 2);
    const third = await request('/api/payments/initialize', { method: 'POST', headers: { 'content-type': 'application/json', cookie, origin: BASE, 'x-idempotency-key': 'private-term-3' }, body: JSON.stringify({ ...base, termNumber: 3, reopeningDate: '2027-05-05', closingDate: '2027-08-20' }) });
    assert.equal(third.status, 201);
    assert.equal((await third.json()).subscriptionSequence, 3);
    const fourth = await request('/api/payments/initialize', { method: 'POST', headers: { 'content-type': 'application/json', cookie, origin: BASE, 'x-idempotency-key': 'private-term-4' }, body: JSON.stringify({ ...base, termNumber: 3, reopeningDate: '2027-09-05', closingDate: '2027-12-20' }) });
    assert.equal(fourth.status, 400);
    const session = await request('/api/auth/session', { headers: { cookie } });
    assert.equal(session.status, 200);
  } finally {
    if (!child.killed) child.kill('SIGTERM');
    if (fs.existsSync(BACKUP_FILE)) { fs.copyFileSync(BACKUP_FILE, DB_FILE); fs.unlinkSync(BACKUP_FILE); }
    else if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);
  }
}

run().then(() => console.log('Part 57 complete subscription regression suite passed.')).catch(error => { console.error(error.stack || error); process.exitCode = 1; });
