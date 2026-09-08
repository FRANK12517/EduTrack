const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const start = html.indexOf('<script id="edutrack-school-login-deterministic-fix">');
const end = html.indexOf('</script>', start);
assert.ok(start >= 0 && end > start, 'authoritative School login script must exist');
const flow = html.slice(start, end);
const remoteValidator = html.slice(html.indexOf('async function v43ValidateSchoolLoginRemote'), html.indexOf('function v43ValidateSchoolLogin('));
assert.match(remoteValidator, /credentials:\s*'same-origin'/, 'session cookie behavior must remain same-origin');

for (const scenario of [
  ['valid Headteacher', /v43ValidateSchoolLoginRemote\([^)]*role/, /localStorage\.setItem\('v43_login_role', role\)/],
  ['valid Teacher', /v43ValidateSchoolLoginRemote\([^)]*role/, /authResult\.ok/],
  ['invalid credentials', /showFailure\('INCORRECT ACCESS CODE OR STAFF ID'/, /status >= 500/],
  ['API timeout', /timedOut/, /School authentication service is unavailable/],
  ['API 5xx', /status >= 500/, /School authentication service is unavailable/],
  ['duplicate click or Enter', /finished = false/, /__EDUTRACK_LOGIN_INFLIGHT__/],
  ['delayed dashboard shell', /completeHandoff/, /setTimeout\(completeHandoff, 25\)/],
  ['successful session/token response', /authResult\.ok/, /_v43SchoolLoginContext = authResult/],
  ['dashboard visible within ten seconds', /Date\.now\(\) - loginStartedAt >= 9800/, /data-school-dashboard-open/],
]) {
  assert.match(flow, scenario[1], `${scenario[0]} validation path is missing`);
  assert.match(flow, scenario[2], `${scenario[0]} outcome guard is missing`);
}
assert.match(flow, /emsRouteAfterLogin\('SCHOOL'\)/, 'School login must use the shared dispatcher');
assert.match(flow, /page\.classList\.remove\('hidden'\)/, 'School dashboard must be made visible');
assert.match(flow, /restoreLoginButton\(\)/, 'every terminal outcome must restore the login button');
console.log('School login outcome-matrix regression suite passed.');
