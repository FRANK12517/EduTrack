'use strict';

const PRIVATE_SCHOOL_FEATURES = Object.freeze([
  'attendance.student', 'attendance.teacher', 'fees', 'transport', 'hostel',
  'communications', 'students', 'admissions', 'results', 'examinations',
  'timetable', 'promotion', 'staff', 'academics', 'reports',
]);
const GOVERNMENT_RESTRICTED_FEATURES = Object.freeze(['fees', 'transport', 'hostel', 'communications']);

function canSchoolAccessFeature(schoolType, feature) {
  const type = String(schoolType || '').trim().toLowerCase();
  const key = String(feature || '').trim().toLowerCase();
  if (['public', 'government', 'government/public', 'public school', 'government school'].includes(type)) return !GOVERNMENT_RESTRICTED_FEATURES.includes(key);
  return type === 'private' && PRIVATE_SCHOOL_FEATURES.includes(key);
}

function activePrivateSubscription(subscription, now = new Date()) {
  if (!subscription || String(subscription.schoolType || subscription.school_type || '').toLowerCase() !== 'private') return false;
  if (!['ACTIVE', 'RENEWED', 'SUCCESS'].includes(String(subscription.status || '').toUpperCase())) return false;
  const start = subscription.subscriptionStartDate || subscription.subscription_start_date || subscription.termStartDate || subscription.term_start_date || subscription.startsAt || subscription.starts_at;
  const end = subscription.subscriptionEndDate || subscription.subscription_end_date || subscription.termEndDate || subscription.term_end_date || subscription.expiresAt || subscription.expires_at;
  const timestamp = now instanceof Date ? now.getTime() : new Date(now).getTime();
  return (!start || timestamp >= new Date(start).getTime()) && (!end || timestamp <= new Date(`${String(end).slice(0, 10)}T23:59:59.999Z`).getTime());
}

function privateFeatureEntitlement({ schoolType, subscriptions = [], feature, now = new Date() }) {
  const type = String(schoolType || '').toLowerCase();
  if (type !== 'private' || !PRIVATE_SCHOOL_FEATURES.includes(feature)) return { entitled: false, reason: 'unsupported_school_feature' };
  const active = subscriptions.some(subscription => activePrivateSubscription(subscription, now));
  return active ? { entitled: true, feature, schoolType: 'private' } : { entitled: false, reason: 'subscription_expired_or_inactive', feature, schoolType: 'private' };
}

module.exports = { PRIVATE_SCHOOL_FEATURES, GOVERNMENT_RESTRICTED_FEATURES, canSchoolAccessFeature, activePrivateSubscription, privateFeatureEntitlement };
