'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const ui = fs.readFileSync(path.join(root, 'online-admission.js'), 'utf8');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const relational = fs.readFileSync(path.join(root, 'db', 'relational.js'), 'utf8');
const auth = fs.readFileSync(path.join(root, 'app', 'auth', 'authorization.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

for (const marker of [
  'NEW_ADMISSION_FORM', 'TRANSFER_ADMISSION_FORM', 'oa-application-form',
  'applicantName', 'dateOfBirth', 'guardianName', 'guardianPhone', 'guardianEmail',
  'previousSchool', 'previousClass', 'transferReason', 'documents',
  'SUBMIT ADMISSION APPLICATION', '/api/admissions/applications'
]) assert.match(ui, new RegExp(marker.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')), `online form contract missing ${marker}`);

for (const status of ['PENDING_REVIEW', 'CORRECTION_REQUIRED', 'RESUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'ADMITTED']) {
  assert.match(relational, new RegExp(status), `admission status missing ${status}`);
}
assert.match(relational, /async function submitPendingAdmission/);
assert.match(relational, /pending_admission_applications/);
assert.match(relational, /Only a Headteacher can generate a Permanent Student ID/);
assert.match(relational, /r\.name='HEADTEACHER'/);
assert.match(relational, /student_identifier/);
assert.match(relational, /permanent_student_id/);

assert.match(server, /\/api\/admissions\/applications/);
assert.ok(server.includes("roles:input.action==='FINALIZE_ADMISSION'?['HEADTEACHER']:[]"), 'finalization must require the Headteacher role');
assert.match(server, /admissions\.finalize/);
assert.match(server, /admissions\.review/);
assert.match(auth, /HEADTEACHER/);

for (const roleCard of ['SCHOOL', 'DISTRICT', 'REGIONAL', 'NATIONAL', 'PARENT', 'STUDENT']) {
  assert.match(html, new RegExp(roleCard), `login-card role must remain present: ${roleCard}`);
}

console.log('Admission workflow preservation and Headteacher-only ID regression passed.');
