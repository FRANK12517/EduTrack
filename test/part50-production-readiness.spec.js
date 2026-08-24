'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const policy = require('../app/subscription-policy');
const server = fs.readFileSync(require.resolve('../server.js'), 'utf8');
const html = fs.readFileSync(require.resolve('../index.html'), 'utf8');

assert.deepEqual(Object.keys(policy.PLANS).sort(), ['government', 'private']);
assert.deepEqual({ price: policy.PLANS.government.priceGhs, currency: policy.PLANS.government.currency, period: policy.PLANS.government.billingPeriod, students: policy.PLANS.government.capacity.students, staff: policy.PLANS.government.capacity.staff, free: policy.PLANS.government.firstTermFree, sms: policy.PLANS.government.smsIncluded }, { price: 130, currency: 'GHS', period: 'term', students: 300, staff: 15, free: true, sms: 0 });
assert.deepEqual({ price: policy.PLANS.private.priceGhs, currency: policy.PLANS.private.currency, period: policy.PLANS.private.billingPeriod, students: policy.PLANS.private.capacity.students, staff: policy.PLANS.private.capacity.staff, free: policy.PLANS.private.firstTermFree, sms: policy.PLANS.private.smsIncluded }, { price: 200, currency: 'GHS', period: 'term', students: 300, staff: 15, free: false, sms: 500 });
assert.match(server, /subscriptionPolicy\.planForSchoolType/);
assert.doesNotMatch(server, /EDUTRACK_PAYMENT_PLANS/);
assert.doesNotMatch(html, /GHC 250|GHC 150|GHC 50|Full School Package|Examination Package|Individual Teacher Package/);
console.log('Part 50 production-readiness regression suite passed.');
