const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const auth = fs.readFileSync(path.join(root, 'privileged-auth.js'), 'utf8');
const dashboards = fs.readFileSync(path.join(root, 'admin-dashboard-separation.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

assert.match(auth, /timeoutMs:\s*5000/, 'developer probe must not leave ordinary login authenticating forever');
assert.match(auth, /AbortController/, 'authentication probe must be cancellable');
assert.match(auth, /error\.name === 'AbortError'/, 'a timed-out optional developer probe must fall back to ordinary login');

for (const level of ['DISTRICT', 'REGIONAL', 'NATIONAL']) {
  assert.match(dashboards, new RegExp(`${level}:\\[`), `${level} general dashboard configuration is missing`);
}
assert.match(dashboards, /current&&current!==['"]SCHOOL['"]\)return render/, 'upper-level logins must route to their general dashboard');
assert.match(html, /emsRouteAfterLogin\('SCHOOL'/, 'school login must route through the shared dashboard dispatcher');
assert.match(html, /showPageById\('dashboard'\)/, 'school routing must open the general dashboard');

console.log('Login timeout and level-specific dashboard routing regression suite passed.');
