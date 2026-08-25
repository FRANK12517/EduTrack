const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const authorization = require('../app/auth/authorization');

const serverSource = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const indexSource = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

function authz(role, permissions = ['ai.use'], memberships = []) {
  return { user: { id: `${role.toLowerCase()}-1`, active: true, status: 'ACTIVE' }, roles: [role], permissions, memberships };
}

function run() {
  const allowedRoles = ['DEVELOPER_ROOT', 'SUPER_ADMIN', 'NATIONAL_ADMIN', 'REGIONAL_ADMIN', 'DISTRICT_ADMIN', 'HEADTEACHER'];
  for (const role of allowedRoles) assert.equal(authorization.evaluate(authz(role), { permission: 'ai.use', roles: allowedRoles }).allowed, true, `${role} should be allowed`);
  for (const role of ['SCHOOL_ACCOUNTANT', 'ACCOUNTANT', 'TEACHER', 'PARENT', 'STUDENT']) assert.equal(authorization.evaluate(authz(role), { permission: 'ai.use', roles: allowedRoles }).allowed, false, `${role} should be denied`);
  assert.equal(authorization.evaluate(authz('HEADTEACHER', ['ai.use'], [{ scope: { schoolIds: ['school-1'] } }]), { permission: 'ai.use', roles: allowedRoles, scope: { schoolId: 'school-2' } }).allowed, false);
  assert.equal(authorization.evaluate(authz('DISTRICT_ADMIN', ['ai.use'], [{ scope: { districtIds: ['district-1'] } }]), { permission: 'ai.use', roles: allowedRoles, scope: { districtId: 'district-1' } }).allowed, true);
  assert.match(serverSource, /const AI_ADMIN_ROLES = Object\.freeze/);
  assert.match(serverSource, /req\.url === '\/api\/ai\/briefing'/);
  assert.match(serverSource, /AI_SCOPED_REQUEST/);
  assert.match(serverSource, /AI_EXECUTIVE_BRIEFING/);
  assert.match(serverSource, /containsPromptInjection/);
  assert.match(serverSource, /AI service unavailable; authorized facts were not exposed/);
  assert.match(serverSource, /EDUTRACK_AI_API_KEY \|\| process\.env\.OPENAI_API_KEY \|\| process\.env\.BUILT_IN_FORGE_API_KEY/);
  assert.doesNotMatch(indexSource, /EDUTRACK_AI_API_KEY|OPENAI_API_KEY|BUILT_IN_FORGE_API_KEY/);
  assert.match(indexSource, /id="page-ai-intelligence"/);
  assert.match(indexSource, /credentials:'same-origin'/);
  console.log('AI Intelligence authorization and safety suite passed.');
}

run();
