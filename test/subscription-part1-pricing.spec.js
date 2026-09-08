'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const policy = require('../app/subscription-policy');

const root = path.join(__dirname, '..');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const relational = fs.readFileSync(path.join(root, 'db', 'relational.js'), 'utf8');
const schema = fs.readFileSync(path.join(root, 'db', 'schema.sql'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

assert.deepEqual(policy.SCHOOL_TYPE_RATES, { government: 2, private: 5 });
assert.equal(policy.calculateSubscriptionAmount(250, 'PRIVATE').amountGhs, 1250);
assert.equal(policy.calculateSubscriptionAmount(250, 'PRIVATE').amountMinor, 125000);
assert.equal(policy.calculateSubscriptionAmount(500, 'GOVERNMENT').amountGhs, 1000);
assert.equal(policy.calculateSubscriptionAmount(500, 'GOVERNMENT').amountMinor, 100000);
assert.throws(() => policy.calculateSubscriptionAmount(10, 'unknown'), /schoolType/);

for (const type of ['private', 'government']) {
  const plan = policy.planForSchoolType(type);
  assert.equal(plan.capacity.students, null);
  assert.equal(plan.capacity.unlimitedStudents, true);
  assert.equal(policy.validateCapacity(1000000, 0).studentsWithinStandard, true);
}

for (const routeMarker of ["/api/payments/paystack/initialize", "/api/payments/initialize"]) {
  const start = server.indexOf(routeMarker);
  const route = server.slice(start, start + 9000);
  assert.match(route, /authoritativeSchoolContext/);
  assert.match(route, /calculateSubscriptionAmount\(context\.activeStudentCount, schoolType\)/);
  assert.doesNotMatch(route, /calculateSubscriptionAmount\(input\./);
}
assert.match(server, /UPPER\(status\) IN \('ACTIVE','ADMITTED'\)/);
assert.match(relational, /COUNT\(\*\) AS count FROM students WHERE school_id=\? AND status='ACTIVE'/);
assert.match(schema, /private_subscription_count_for_academic_year TINYINT NOT NULL DEFAULT 0/);
assert.match(schema, /CHECK \(private_subscription_count_for_academic_year BETWEEN 0 AND 3\)/);
assert.doesNotMatch(schema, /UPDATE subscriptions/i);
assert.match(html, /Public \/ Government School/);
assert.match(html, /Private School/);
assert.match(html, /GH₵2 per active student \/ term/);
assert.match(html, /GH₵5 per active student \/ term/);
assert.match(html, /Unlimited Students/i);
assert.doesNotMatch(html, /Up to 300 Students/i);

console.log('Subscription Part 1 school-type pricing and active-population rules passed.');
