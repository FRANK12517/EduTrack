'use strict';

const POLICY_VERSION = 'part57-active-student-term-v1';
const CURRENCY = 'GHS';
const PRICE_PER_STUDENT_GHS = 1.00;
const PRICE_PER_STUDENT_MINOR = 100;
const BILLING_PERIOD = 'term';
const MAX_PRIVATE_TERM_MONTHS = 4;
const CAPACITY = Object.freeze({ students: 300, staff: 15 });
const PLAN_IDS = Object.freeze({ government: 'government', private: 'private' });
const PLANS = Object.freeze({
  government: Object.freeze({
    id: 'government',
    name: 'EduTrack Government School Plan',
    pricePerStudentGhs: PRICE_PER_STUDENT_GHS,
    pricePerStudentMinor: PRICE_PER_STUDENT_MINOR,
    currency: CURRENCY,
    billingPeriod: BILLING_PERIOD,
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
    pricePerStudentGhs: PRICE_PER_STUDENT_GHS,
    pricePerStudentMinor: PRICE_PER_STUDENT_MINOR,
    currency: CURRENCY,
    billingPeriod: BILLING_PERIOD,
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

function validateActiveStudentCount(value) {
  const count = Number(value);
  if (!Number.isInteger(count) || count < 0) throw new Error('activeStudentCount must be a non-negative integer');
  return count;
}

function calculateSubscriptionAmount(activeStudentCount) {
  const count = validateActiveStudentCount(activeStudentCount);
  return Object.freeze({
    activeStudentCount: count,
    pricePerStudentGhs: PRICE_PER_STUDENT_GHS,
    pricePerStudentMinor: PRICE_PER_STUDENT_MINOR,
    amountGhs: Number((count * PRICE_PER_STUDENT_GHS).toFixed(2)),
    amountMinor: count * PRICE_PER_STUDENT_MINOR,
    currency: CURRENCY,
    billingPeriod: BILLING_PERIOD,
  });
}

function parseDate(value, fieldName) {
  const text = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new Error(`${fieldName} must be an ISO date (YYYY-MM-DD)`);
  const date = new Date(`${text}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== text) throw new Error(`${fieldName} is not a valid calendar date`);
  return date;
}

function addCalendarMonths(date, months) {
  const result = new Date(date.getTime());
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}

function calculateTermDurationDays(startDate, endDate) {
  const start = parseDate(startDate, 'startDate');
  const end = parseDate(endDate, 'endDate');
  const durationDays = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
  if (durationDays < 1) throw new Error('endDate must be on or after startDate');
  return durationDays;
}

function validatePrivateTermDates(startDate, endDate) {
  const start = parseDate(startDate, 'startDate');
  const end = parseDate(endDate, 'endDate');
  if (end.getTime() <= start.getTime()) throw new Error('closing date must be later than reopening date');
  const maximum = addCalendarMonths(start, MAX_PRIVATE_TERM_MONTHS);
  if (end.getTime() > maximum.getTime()) throw new Error('Private subscription term must not exceed 4 months');
  return { startDate: String(startDate), endDate: String(endDate), durationDays: calculateTermDurationDays(startDate, endDate), maximumEndDate: maximum.toISOString().slice(0, 10) };
}

function validatePrivateAcademicYearDates(academicYear, termNumber, startDate, endDate) {
  const match = String(academicYear || '').match(/^(\d{4})\/(\d{4})$/);
  if (!match) throw new Error('academicYear must use YYYY/YYYY format');
  const firstYear = Number(match[1]); const secondYear = Number(match[2]);
  if (secondYear !== firstYear + 1) throw new Error('academicYear must contain consecutive years');
  const start = parseDate(startDate, 'startDate'); const end = parseDate(endDate, 'endDate');
  const lower = Date.UTC(firstYear, 7, 1); const upper = Date.UTC(secondYear, 8, 30, 23, 59, 59);
  if (start.getTime() < lower || end.getTime() > upper) throw new Error(`Private term ${termNumber} dates must belong to academic year ${academicYear}`);
  return true;
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
    if (startDate || endDate) throw new Error('Government term dates are centrally controlled and cannot be supplied by a school');
    return { schoolType: type, academicYear: year, termNumber: term, termId: String(governmentTermId), governmentTermId: String(governmentTermId), startDate: null, endDate: null, durationDays: null };
  }
  const privateDates = validatePrivateTermDates(startDate, endDate);
  validatePrivateAcademicYearDates(year, term, privateDates.startDate, privateDates.endDate);
  return { schoolType: type, academicYear: year, termNumber: term, termId: `${year}:term_${term}`, governmentTermId: null, startDate: privateDates.startDate, endDate: privateDates.endDate, durationDays: privateDates.durationDays, maximumEndDate: privateDates.maximumEndDate };
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

function firstTermFreeEligibilityForSchool({ schoolType, schoolIdentityKey, firstTermFreeUsed = false }) {
  const type = normalizeSchoolType(schoolType);
  const identity = String(schoolIdentityKey || '').trim();
  return type === 'government' && Boolean(identity) && !Boolean(firstTermFreeUsed);
}

function firstTermFreeRecord({ schoolIdentityKey, term }) {
  const key = String(schoolIdentityKey || '').trim();
  if (!key) throw new Error('schoolIdentityKey is required for first-term-free tracking');
  return Object.freeze({ firstTermFreeUsed: true, firstTermFreeUsedAt: new Date().toISOString(), firstTermFreeIdentityKey: key, firstTermFreeTerm: term || null });
}

function quote({ schoolType, term, activeStudentCount = null, firstTermFreeUsed = false, schoolIdentityExists = false }) {
  const plan = planForSchoolType(schoolType);
  if (!plan) throw new Error('Unsupported school type');
  const free = plan.firstTermFree && firstTermFreeEligibility({ firstTermFreeUsed, schoolIdentityExists });
  const pricing = activeStudentCount == null ? null : calculateSubscriptionAmount(activeStudentCount);
  const amountGhs = pricing ? (free ? 0 : pricing.amountGhs) : null;
  const amountMinor = pricing ? (free ? 0 : pricing.amountMinor) : null;
  return {
    policyVersion: POLICY_VERSION,
    planId: plan.id,
    planName: plan.name,
    currency: plan.currency,
    billingPeriod: plan.billingPeriod,
    activeStudentCount: pricing?.activeStudentCount ?? null,
    pricePerStudentGhs: plan.pricePerStudentGhs,
    pricePerStudentMinor: plan.pricePerStudentMinor,
    amountGhs,
    amountMinor,
    economicValueGhs: pricing?.amountGhs ?? null,
    economicValueMinor: pricing?.amountMinor ?? null,
    durationDays: term && term.durationDays ? Number(term.durationDays) : null,
    termId: term?.termId || null,
    academicYear: term?.academicYear || null,
    termNumber: term?.termNumber || null,
    firstTermFree: free,
    smsIncluded: plan.smsIncluded,
    capacity: plan.capacity,
  };
}

module.exports = {
  POLICY_VERSION,
  CURRENCY,
  PRICE_PER_STUDENT_GHS,
  PRICE_PER_STUDENT_MINOR,
  BILLING_PERIOD,
  MAX_PRIVATE_TERM_MONTHS,
  CAPACITY,
  PLAN_IDS,
  PLANS,
  normalizeSchoolType,
  planForSchoolType,
  validateActiveStudentCount,
  calculateSubscriptionAmount,
  calculateTermDurationDays,
  validatePrivateTermDates,
  validatePrivateAcademicYearDates,
  validateTermConfiguration,
  validateCapacity,
  firstTermFreeEligibility,
  firstTermFreeEligibilityForSchool,
  firstTermFreeRecord,
  quote,
};

// Active subscription pricing is intentionally count-based. Historical fixed-price
// records remain data and are never used to build a new payment intent.
