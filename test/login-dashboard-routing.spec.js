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

assert.match(dashboards, /ADMIN_LEVELS=\['DISTRICT','REGIONAL','NATIONAL'\]/, 'three shared administrative destinations must be supported');
assert.match(dashboards, /function openDistrict\(level\)/, 'all administrative roles must enter the level dashboard');
assert.ok(dashboards.includes("api('/api/control-panel/'+level.toLowerCase()+'?view=context')"), 'dashboard context must come from the server');
assert.match(dashboards, /configureGroups\(level\)/, 'navigation must be based on the shared level shell and resolved permissions');
assert.doesNotMatch(dashboards, /Officer Workspace/, 'obsolete officer workspaces must stay removed');
assert.match(html, /emsRouteAfterLogin\('SCHOOL'/, 'school login must route through the shared dashboard dispatcher');
assert.match(html, /showPageById\('dashboard'\)/, 'school routing must open the general dashboard');

console.log('Login timeout and level-specific dashboard routing regression suite passed.');
