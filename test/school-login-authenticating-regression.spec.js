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
assert.match(remoteValidator[0], /status: res\.status/, 'school authentication must preserve server failure status');

const deterministicFix = html.match(/<script id="edutrack-school-login-deterministic-fix">([\s\S]*?)<\/script>/);
assert.ok(deterministicFix, 'final deterministic school-login wrapper must exist');
assert.match(deterministicFix[1], /\.login-level-btn\.active/, 'school login must resolve the visible active level');
assert.match(deterministicFix[1], /openSchoolGeneralDashboard\(\)/, 'successful school login must open the school dashboard');
assert.match(deterministicFix[1], /function openSchoolGeneralDashboard\(\)/, 'school login must have an explicit dashboard opener');
assert.match(deterministicFix[1], /getElementById\('page-dashboard'\)/, 'school login must target the School General Dashboard page');
assert.match(deterministicFix[1], /data-school-dashboard-open/, 'successful school login must mark the dashboard as opened');
assert.match(deterministicFix[1], /setTimeout\(function \(\).*openSchoolGeneralDashboard\(\)/s, 'school login must retry if the shell is still loading');
assert.match(deterministicFix[1], /Promise\.race\(\[remotePromise, deadline\]\)/, 'school authentication must have a bounded completion race');
assert.match(deterministicFix[1], /}, 9500\)/, 'school authentication must complete within ten seconds');
assert.match(deterministicFix[1], /offlineFallback/, 'server timeout must preserve valid local School login behavior');
assert.match(deterministicFix[1], /authResult\.timedOut/, 'a timed-out login must restore a usable state');

console.log('School login authenticating-state regression suite passed.');
