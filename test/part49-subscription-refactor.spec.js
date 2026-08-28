'use strict';
const assert = require('assert');
const fs = require('fs');
const html = fs.readFileSync(require.resolve('../index.html'), 'utf8');
const server = fs.readFileSync(require.resolve('../server.js'), 'utf8');
const policy = require('../app/subscription-policy');

for (const obsolete of ['Full School Package', 'Examination Package', 'Individual Teacher Package', 'GHC 250', 'GHC 150', 'GHC 50', 'durationDays:365']) {
  assert.ok(!html.includes(obsolete), `obsolete subscription value remains: ${obsolete}`);
}
for (const plan of ['government', 'private']) assert.ok(html.includes(`subv2-renew-pkg-${plan}`), `renewal plan card missing: ${plan}`);
assert.match(html, /Government\/Public School/);
assert.match(html, /Private School/);
assert.match(html, /GH₵1 per active student \/ term/);
assert.match(html, /value="term_1"/);
assert.match(html, /value="term_2"/);
assert.match(html, /value="term_3"/);
assert.doesNotMatch(html, /value="[1-9][0-9]*_week"/);
assert.doesNotMatch(html, /subv2RenewSelectedPackage\s*=\s*['"](?:full|exam|teacher)['"]/);
assert.doesNotMatch(html, /subSelectedPkg\s*=\s*school\.package\s*\|\|\s*['"]full['"]/);
assert.doesNotMatch(html, /window\.subSelectedPkg\s*===\s*['"]teacher['"]/);
assert.match(server, /\/api\/payments\/paystack\/renewal-quote/);
assert.match(server, /\/api\/payments\/paystack\/initialize/);
assert.match(server, /paystack/);
assert.match(server, /verify/);
assert.match(server, /PAYSTACK_SECRET_KEY/);
assert.equal(policy.planForSchoolType('PUBLIC').pricePerStudentGhs, 1);
assert.equal(policy.planForSchoolType('PRIVATE').pricePerStudentGhs, 1);
console.log('Part 49 subscription refactor regression suite passed.');
