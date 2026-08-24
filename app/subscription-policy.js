'use strict';

const POLICY_VERSION = 'part46-government-private-term-v1';
const CURRENCY = 'GHS';
const CAPACITY = Object.freeze({ students: 300, staff: 15 });
const PLAN_IDS = Object.freeze({ government: 'government', private: 'private' });
const PLANS = Object.freeze({
  government: Object.freeze({
    id: 'government',
    name: 'EduTrack Government School Plan',
    priceGhs: 130,
    amountMinor: 13000,
    currency: CURRENCY,
    billingPeriod: 'term',
    durationDays: null,
    capacity: CAPACITY,
    firstTermFree: true,
    smsIncluded: 0,
    smsAddOn: true,
    termCalendar: 'central',
  }),
  private: Object.freeze({
    id: 'private',
    name: 'EduTrack Private School Plan',
    priceGhs: 200,
    amountMinor: 20000,
    currency: CURRENCY,
    billingPeriod: 'term',
    durationDays: null,
    capacity: CAPACITY,
    firstTermFree: false,
    smsIncluded: 500,
    smsAddOn: true,
    termCalendar: 'school',
  }),
});

function normalizeSchoolType(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (['government', 'public', 'government/public', 'government school', 'public school'].includes(normalized)) return 'government';
  if (['private', 'private school'].includes(normalized)) return 'private';
  return null;
}

function planForSchoolType(value) {
  const id = normalizeSchoolType(value);
  return id ? PLANS[id] : null;
}

function parseDate(value, fieldName) {
  const text = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new Error(`${fieldName} must be an ISO date (YYYY-MM-DD)`);
  const date = new Date(`${text}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== text) throw new Error(`${fieldName} is not a valid calendar date`);
  return date;
}

function calculateTermDurationDays(startDate, endDate) {
  const start = parseDate(startDate, 'startDate');
  const end = parseDate(endDate, 'endDate');
  const durationDays = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
  if (durationDays < 1) throw new Error('endDate must be on or after startDate');
  return durationDays;
}

function validateTermConfiguration({ schoolType, academicYear, termNumber, startDate, endDate, governmentTermId = null }) {
  const type = normalizeSchoolType(schoolType);
  if (!type) throw new Error('schoolType must be government or private');
  const year = String(academicYear || '').trim();
  if (!/^\d{4}\/\d{4}$/.test(year)) throw new Error('academicYear must use YYYY/YYYY format');
  const term = Number(termNumber);
  if (![1, 2, 3].includes(term)) throw new Error('termNumber must be 1, 2, or 3');
  if (type === 'government') {
    if (!governmentTermId) throw new Error('governmentTermId is required for centrally managed government terms');
    return { schoolType: type, academicYear: year, termNumber: term, governmentTermId: String(governmentTermId), startDate: null, endDate: null, durationDays: null };
  }
  const durationDays = calculateTermDurationDays(startDate, endDate);
  return { schoolType: type, academicYear: year, termNumber: term, governmentTermId: null, startDate: String(startDate), endDate: String(endDate), durationDays };
}

function validateCapacity(studentCount, staffCount) {
  const students = Number(studentCount || 0);
  const staff = Number(staffCount || 0);
  if (!Number.isInteger(students) || students < 0) throw new Error('studentCount must be a non-negative integer');
  if (!Number.isInteger(staff) || staff < 0) throw new Error('staffCount must be a non-negative integer');
  return {
    students,
    staff,
    studentsWithinStandard: students <= CAPACITY.students,
    staffWithinStandard: staff <= CAPACITY.staff,
    additionalStudents: Math.max(0, students - CAPACITY.students),
    additionalStaff: Math.max(0, staff - CAPACITY.staff),
  };
}

function firstTermFreeEligibility({ firstTermFreeUsed = false, schoolIdentityExists = false }) {
  return !Boolean(firstTermFreeUsed) && !Boolean(schoolIdentityExists);
}

function firstTermFreeRecord({ schoolIdentityKey, term }) {
  const key = String(schoolIdentityKey || '').trim();
  if (!key) throw new Error('schoolIdentityKey is required for first-term-free tracking');
  return Object.freeze({ firstTermFreeUsed: true, firstTermFreeUsedAt: new Date().toISOString(), firstTermFreeIdentityKey: key, firstTermFreeTerm: term || null });
}

function quote({ schoolType, term, firstTermFreeUsed = false, schoolIdentityExists = false }) {
  const plan = planForSchoolType(schoolType);
  if (!plan) throw new Error('Unsupported school type');
  const free = plan.firstTermFree && firstTermFreeEligibility({ firstTermFreeUsed, schoolIdentityExists });
  return {
    policyVersion: POLICY_VERSION,
    planId: plan.id,
    planName: plan.name,
    currency: plan.currency,
    amountGhs: free ? 0 : plan.priceGhs,
    amountMinor: free ? 0 : plan.amountMinor,
    billingPeriod: plan.billingPeriod,
    durationDays: term && term.durationDays ? Number(term.durationDays) : null,
    firstTermFree: free,
    smsIncluded: plan.smsIncluded,
    capacity: plan.capacity,
  };
}

module.exports = {
  POLICY_VERSION,
  CURRENCY,
  CAPACITY,
  PLAN_IDS,
  PLANS,
  normalizeSchoolType,
  planForSchoolType,
  calculateTermDurationDays,
  validateTermConfiguration,
  validateCapacity,
  firstTermFreeEligibility,
  firstTermFreeRecord,
  quote,
};
