const assert = require('node:assert/strict');
const policy = require('../app/subscription-entitlements');

const required = ['fees', 'transport', 'hostel', 'communications', 'attendance.student', 'attendance.teacher', 'students', 'admissions', 'results', 'examinations', 'timetable', 'promotion', 'staff', 'academics', 'reports'];
assert.deepEqual(required.every(feature => policy.PRIVATE_SCHOOL_FEATURES.includes(feature)), true);
const active = { schoolType: 'private', status: 'ACTIVE', term_start_date: '2026-09-01', term_end_date: '2026-12-20' };
assert.equal(policy.privateFeatureEntitlement({ schoolType: 'private', subscriptions: [active], feature: 'transport', now: new Date('2026-10-01') }).entitled, true);
assert.equal(policy.privateFeatureEntitlement({ schoolType: 'private', subscriptions: [{ ...active, status: 'EXPIRED' }], feature: 'transport', now: new Date('2026-10-01') }).entitled, false);
assert.equal(policy.privateFeatureEntitlement({ schoolType: 'government', subscriptions: [active], feature: 'transport' }).entitled, false);
assert.equal(policy.privateFeatureEntitlement({ schoolType: 'private', subscriptions: [active], feature: 'unknown' }).entitled, false);
console.log('Subscription Part 3 private-school entitlement tests passed.');
