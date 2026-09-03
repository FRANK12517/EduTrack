const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const transport = fs.readFileSync(path.join(root, 'transport-management.js'), 'utf8');

const guardStart = html.indexOf('var PINNED_LAST_SELECTORS = [');
const guardEnd = html.indexOf('];', guardStart);
assert.notEqual(guardStart, -1, 'sidebar order guard exists');
assert.notEqual(guardEnd, -1, 'sidebar order guard is complete');

const guard = html.slice(guardStart, guardEnd);
const orderedMarkers = [
  '#communication-hub-nav',
  '#chat-nav',
  '#control-panel-nav',
  '#admissions-review-nav',
  '#edutrack-transport-nav',
  "showPage('user-guide'",
  "showPage('copyright'",
  "showPage('acknowledgement'",
  "showPage('about'",
  'emsDoLogout()'
];

let previous = -1;
for (const marker of orderedMarkers) {
  const current = guard.indexOf(marker);
  assert.ok(current > previous, marker + ' is present in the required order');
  previous = current;
}

assert.doesNotMatch(
  html,
  /pinned\.length\s*!==\s*PINNED_LAST_SELECTORS\.length/,
  'restricted dynamic modules do not prevent visible items from reordering'
);
assert.match(
  transport,
  /getElementById\('sidebarScroll'\)\|\|document\.querySelector\('\.sidebar'\)/,
  'Transport mounts in the managed sidebar container'
);
assert.match(transport, /if\(!\/HEADTEACHER\|TEACHER\|DISTRICT\|REGIONAL\|NATIONAL\|ADMIN\/\.test\(role\)\)return/);
assert.equal((transport.match(/n\.id='edutrack-transport-nav'/g) || []).length, 1, 'one Transport nav registration');
assert.match(transport, /showPage\('transport-management',n\)/, 'Transport opens its existing page');
assert.match(transport, /window\.sidebarPagingReady=false/, 'Transport refreshes mobile sidebar paging');

console.log('Info & Session sidebar ordering regression suite passed.');
