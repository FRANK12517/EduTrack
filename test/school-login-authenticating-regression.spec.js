const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'latin1');
const remoteValidator = html.match(/async function v43ValidateSchoolLoginRemote[\s\S]*?\r?\n}/);
assert.ok(remoteValidator, 'remote school-login validator must exist');
assert.match(remoteValidator[0], /AbortController/, 'school authentication request must be cancellable');
assert.match(remoteValidator[0], /controller\.abort\(\), 10000/, 'school authentication must have a bounded wait');
assert.match(remoteValidator[0], /finally[\s\S]*clearTimeout/, 'school authentication timeout must always be cleared');
assert.match(remoteValidator[0], /credentials:\s*'same-origin'/, 'school authentication must preserve same-origin session behavior');

const deterministicFix = html.match(/<script id="edutrack-school-login-deterministic-fix">([\s\S]*?)<\/script>/);
assert.ok(deterministicFix, 'final deterministic school-login wrapper must exist');
assert.match(deterministicFix[1], /\.login-level-btn\.active/, 'school login must resolve the visible active level');
assert.match(deterministicFix[1], /emsRouteAfterLogin\('SCHOOL'/, 'successful school login must open the school dashboard');
assert.match(deterministicFix[1], /authResult\.timedOut/, 'a timed-out login must restore a usable state');

console.log('School login authenticating-state regression suite passed.');
