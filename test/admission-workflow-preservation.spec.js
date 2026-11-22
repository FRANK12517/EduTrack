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
assert.match(relational, /isHeadteacherEquivalent\(actorRole\)/, 'admission finalization uses the shared Headteacher-equivalence policy');
assert.match(relational, /includes\('admissions\.finalize'\)/, 'admission finalization requires its effective permission');
assert.match(relational, /permissionSourceRole\(role\)/, 'the operation resolves grants from the canonical source role');
assert.match(relational, /student_identifier/);
assert.match(relational, /permanent_student_id/);

assert.match(server, /\/api\/admissions\/applications/);
assert.ok(server.includes("roles:input.action==='FINALIZE_ADMISSION'?['HEADTEACHER']:[]"), 'finalization must require the Headteacher role');
assert.match(server, /admissions\.finalize/);
assert.match(server, /admissions\.review/);
assert.match(auth, /ASSISTANT_HEADTEACHER/);
const authorization=require('../app/auth/authorization');
const assistant={user:{id:'assistant',active:true,status:'ACTIVE'},roles:['ASSISTANT_HEADTEACHER'],permissions:[],rolePermissions:{ASSISTANT_HEADTEACHER:['admissions.finalize']},memberships:[{scope:{schoolIds:['school-1']}}]};
assert.equal(authorization.evaluate(assistant,{permission:'admissions.finalize',scope:{schoolId:'school-1'}}).allowed,true,'Assistant inherits the Headteacher admission grant');
assert.equal(authorization.evaluate(assistant,{roles:['HEADTEACHER'],permission:'admissions.finalize',scope:{schoolId:'school-1'}}).allowed,true,'Assistant is accepted by Headteacher-equivalent endpoint role guards');
assert.equal(authorization.evaluate({...assistant,rolePermissions:{}},{permission:'admissions.finalize',scope:{schoolId:'school-1'}}).allowed,false,'missing inherited authorization fails closed');

for (const roleCard of ['SCHOOL', 'DISTRICT', 'REGIONAL', 'NATIONAL', 'PARENT', 'STUDENT']) {
  assert.match(html, new RegExp(roleCard), `login-card role must remain present: ${roleCard}`);
}

console.log('Admission workflow preservation and Headteacher-equivalent ID regression passed.');
