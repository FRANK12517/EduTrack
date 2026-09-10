const assert = require('node:assert/strict');
const policy = require('../app/subscription-policy');

for (const [type, minorRate] of [['private', 500], ['government', 200]]) {
  assert.equal(policy.SCHOOL_TYPE_RATES_MINOR[type], minorRate);
  assert.equal(policy.calculateSubscriptionAmount(0, type).amountMinor, 0);
  assert.equal(policy.calculateSubscriptionAmount(1, type).amountMinor, minorRate);
  assert.equal(policy.calculateSubscriptionAmount(300, type).amountMinor, minorRate * 300);
  assert.equal(policy.calculateSubscriptionAmount(1000000, type).amountMinor, minorRate * 1000000);
}
assert.throws(() => policy.calculateSubscriptionAmount(-1, 'private'), /non-negative integer/);
assert.throws(() => policy.calculateSubscriptionAmount(1.5, 'private'), /non-negative integer/);
console.log('Subscription Part 5 integer billing calculations passed.');
