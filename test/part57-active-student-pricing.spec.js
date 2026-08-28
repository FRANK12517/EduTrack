'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const policy = require('../app/subscription-policy');

for (const [count, expectedGhs] of [[1, 1], [100, 100], [300, 300], [325, 325]]) {
  const result = policy.calculateSubscriptionAmount(count);
  assert.equal(result.amountGhs, expectedGhs, `${count} active students should cost GH₵${expectedGhs}`);
  assert.equal(result.amountMinor, expectedGhs * 100);
  assert.equal(result.pricePerStudentGhs, 1);
  assert.equal(result.currency, 'GHS');
  assert.equal(result.billingPeriod, 'term');
}
assert.throws(() => policy.calculateSubscriptionAmount(-1), /non-negative integer/);
assert.throws(() => policy.calculateSubscriptionAmount(1.5), /non-negative integer/);

const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const relational = fs.readFileSync(path.join(__dirname, '..', 'db', 'relational.js'), 'utf8');
const schema = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const initStart = server.indexOf("req.url === '/api/payments/paystack/initialize'");
const initEnd = server.indexOf("req.url === '/api/payments/initialize'", initStart);
assert.ok(initStart >= 0 && initEnd > initStart);
const paystackInit = server.slice(initStart, initEnd);
assert.match(paystackInit, /authoritativeSchoolContext/);
assert.match(paystackInit, /calculateSubscriptionAmount\(context\.activeStudentCount\)/);
assert.match(paystackInit, /amount: pricing\.amountMinor/);
assert.match(paystackInit, /activeStudentCount: pricing\.activeStudentCount/);
assert.doesNotMatch(paystackInit, /input\.amount/);
assert.doesNotMatch(paystackInit, /input\.activeStudentCount/);
assert.doesNotMatch(paystackInit, /plan\.amount/);
assert.doesNotMatch(paystackInit, /input\.schoolId \|\| auth\.user\.schoolId/);
assert.match(server, /Number\(event\.data\.amount\)!==Number\(intent\[0\]\.amount\)/);
assert.match(server, /Number\(event\.data\.amount\) !== Number\(intent\.amount\)/);
assert.match(relational, /active_student_count_at_subscription/);
assert.match(relational, /payment_provider/);
assert.match(relational, /status='RENEWED'/);
assert.match(relational, /INSERT INTO subscriptions/);
assert.doesNotMatch(relational, /UPDATE subscriptions SET plan_id/);
assert.match(schema, /term_id VARCHAR\(160\)/);
assert.match(schema, /active_student_count_at_subscription INT/);
assert.match(schema, /subscription_amount DECIMAL/);
assert.match(schema, /payment_provider VARCHAR/);
assert.doesNotMatch(server, /priceGhs\s*:/);
assert.doesNotMatch(html, /priceGhs\s*:/);
assert.doesNotMatch(html, /GH₵130|GH₵200|GH₵250|GH₵150|GH₵50/);
assert.match(html, /GH₵'\+plan\.pricePerStudentGhs\+' per active student \/ term/);
console.log('part57 active-student pricing: PASS');
