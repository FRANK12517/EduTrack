/*
 * Secure Paystack renewal backend reference for the existing EMS application.
 *
 * Mount these handlers in the existing server and database layer. This file does
 * not contain credentials. The server must provide PAYSTACK_SECRET_KEY through
 * its secret manager/environment and must rotate any previously exposed key.
 *
 * Expected routes:
 *   GET  /api/payments/paystack/renewal-quote?period=...
 *   POST /api/payments/paystack/initialize
 *   GET  /api/payments/paystack/verify/:reference
 *   POST /api/payments/paystack/webhook
 */
'use strict';

const crypto = require('node:crypto');

function makeRenewalPaystackHandlers({ db, secretKey = process.env.PAYSTACK_SECRET_KEY, fetchImpl = fetch }) {
  if (!db) throw new Error('A database adapter is required');
  if (!secretKey) throw new Error('PAYSTACK_SECRET_KEY is required on the server');

  async function paystack(path, init = {}) {
    const response = await fetchImpl('https://api.paystack.co' + path, {
      ...init,
      headers: { Authorization: `Bearer ${secretKey}`, 'Content-Type': 'application/json', ...(init.headers || {}) }
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body.status !== true) {
      const error = new Error(body.message || `Paystack request failed (${response.status})`);
      error.statusCode = response.status;
      throw error;
    }
    return body.data;
  }

  function minorUnit(amount) {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) throw new Error('Invalid renewal amount');
    return Math.round(value * 100);
  }

  function reference() {
    return `EMS_RENEWAL_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
  }

  function send(res, status, body) { return res.status(status).json(body); }

  function lockedPriceForSchool(school, packageId) {
    if (!school || !packageId || school.package !== packageId || !school.priceAtSubscription || !school.expiryDate) return null;
    const expiry = new Date(school.expiryDate);
    if (!Number.isFinite(expiry.getTime()) || expiry <= new Date()) return null;
    const numeric = Number(String(school.priceAtSubscription).replace(/[^0-9.]/g, ''));
    return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
  }

  async function validateRenewal(input) {
    const school = await db.findSchoolForRenewal({
      schoolId: input.schoolId,
      schoolName: input.schoolName,
      region: input.region,
      district: input.district
    });
    if (!school) throw Object.assign(new Error('School not found.'), { statusCode: 400 });

    const validCode = await db.validateCurrentAccessCode(school.id, input.currentAccessCode);
    if (!validCode) throw Object.assign(new Error('Current Access Code is incorrect or inactive.'), { statusCode: 400 });

    const period = await db.getRenewalPeriod({ period: input.period, packageId: input.packageId, schoolId: school.id, school, lockedPrice: lockedPriceForSchool(school, input.packageId) });
    if (!period || !period.id || !Number.isFinite(Number(period.price))) {
      throw Object.assign(new Error('Selected subscription period is unavailable.'), { statusCode: 400 });
    }
    if (!input.contactPerson || !input.phone || !input.email) {
      throw Object.assign(new Error('Contact person, phone, and email are required.'), { statusCode: 400 });
    }
    return { school, period };
  }

  async function quote(req, res) {
    try {
      const schoolId = String(req.query.schoolId || '') || null;
      const school = schoolId && db.getSchoolById ? await db.getSchoolById(schoolId) : null;
      const period = await db.getRenewalPeriod({ period: String(req.query.period || ''), packageId: String(req.query.packageId || ''), schoolId, school, lockedPrice: lockedPriceForSchool(school, String(req.query.packageId || '')) });
      if (!period) return send(res, 400, { message: 'Selected subscription period is unavailable.' });
      return send(res, 200, { period: period.id, label: period.label, amount: Number(period.price), currency: period.currency || 'GHS' });
    } catch (error) {
      return send(res, error.statusCode || 500, { message: error.message || 'Unable to load renewal price.' });
    }
  }

  async function initialize(req, res) {
    try {
      const input = req.body || {};
      const { school, period } = await validateRenewal(input);
      const amount = minorUnit(period.price);
      const txReference = reference();
      const metadata = {
        school_id: school.id,
        school_name: school.name,
        renewal_id: null,
        subscription_package_id: input.packageId || null,
        subscription_package_name: input.packageName || null,
        subscription_period: period.id,
        subscription_period_label: period.label,
        subscription_id: period.id,
        contact_person: input.contactPerson,
        phone: input.phone,
        email: input.email,
        payment_purpose: 'subscription_renewal'
      };
      const renewal = await db.createPendingRenewal({
        schoolId: school.id,
        periodId: period.id,
        currentAccessCode: input.currentAccessCode,
        amount,
        currency: period.currency || 'GHS',
        reference: txReference,
        contactPerson: input.contactPerson,
        phone: input.phone,
        email: input.email,
        metadata,
        status: 'pending'
      });
      metadata.renewal_id = renewal.id;
      const authorization = await paystack('/transaction/initialize', {
        method: 'POST',
        body: JSON.stringify({ email: input.email, amount: String(amount), currency: period.currency || 'GHS', reference: txReference, metadata })
      });
      await db.attachPaystackAuthorization(txReference, authorization);
      return send(res, 200, { authorization: { access_code: authorization.access_code, reference: authorization.reference || txReference, amount, currency: period.currency || 'GHS' } });
    } catch (error) {
      return send(res, error.statusCode || 500, { message: error.message || 'Unable to initialize renewal payment.' });
    }
  }

  async function verify(req, res) {
    try {
      const txReference = String(req.params.reference || '');
      if (!txReference) return send(res, 400, { status: 'failed', message: 'Reference is required.' });
      const renewal = await db.getRenewalByReference(txReference);
      if (!renewal) return send(res, 404, { status: 'failed', message: 'Renewal reference not found.' });
      if (renewal.status === 'verified') return send(res, 200, { status: 'verified', transaction: renewal.payment });

      const transaction = await paystack(`/transaction/verify/${encodeURIComponent(txReference)}`);
      const valid = transaction.reference === txReference && transaction.status === 'success' && transaction.currency === renewal.currency && Number(transaction.amount) === Number(renewal.amount);
      if (!valid) {
        await db.markRenewalPaymentFailed(txReference, { reason: 'Reference, status, amount, or currency mismatch', transaction });
        return send(res, 400, { status: 'failed', message: 'Payment verification failed.' });
      }

      // The database adapter must resolve the price using the selected package and
      // the school's price lock: an active school keeps its priceAtSubscription
      // until its current expiry; a new price applies only after expiry.
      // No Access Code is generated or revoked before this verified-payment branch.
      // This operation must be atomic and idempotent. It must enforce uniqueness
      // on payment reference, verify the payment, extend the school, revoke the
      // old code, and issue the new code exactly once in that order.
      const completed = await db.transaction(async trx => trx.markRenewalVerifiedAndRotateAccessCodeOnce({
        reference: txReference,
        schoolId: renewal.schoolId,
        renewalId: renewal.id,
        periodId: renewal.periodId,
        currentAccessCode: renewal.currentAccessCode,
        transactionId: transaction.id,
        amount: Number(transaction.amount),
        currency: transaction.currency,
        paidAt: transaction.paid_at || new Date().toISOString(),
        transaction
      }));
      return send(res, 200, { status: 'verified', transaction: completed });
    } catch (error) {
      return send(res, error.statusCode || 500, { status: 'failed', message: error.message || 'Renewal payment verification failed.' });
    }
  }

  function validSignature(rawBody, signature) {
    if (!rawBody || !signature) return false;
    const expected = crypto.createHmac('sha512', secretKey).update(rawBody).digest('hex');
    const a = Buffer.from(expected); const b = Buffer.from(String(signature));
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }

  async function webhook(req, res) {
    const rawBody = req.rawBody || JSON.stringify(req.body || {});
    if (!validSignature(rawBody, req.headers['x-paystack-signature'])) return res.status(401).send('Invalid signature');
    const event = req.body || {};
    if (event.event === 'charge.success' && event.data?.reference) {
      const renewal = await db.getRenewalByReference(event.data.reference);
      if (renewal && renewal.status !== 'verified') {
        const valid = event.data.status === 'success' && Number(event.data.amount) === Number(renewal.amount) && event.data.currency === renewal.currency;
        if (valid) await db.transaction(async trx => trx.markRenewalVerifiedAndRotateAccessCodeOnce({ reference: event.data.reference, schoolId: renewal.schoolId, renewalId: renewal.id, periodId: renewal.periodId, currentAccessCode: renewal.currentAccessCode, transactionId: event.data.id, amount: Number(event.data.amount), currency: event.data.currency, paidAt: event.data.paid_at || new Date().toISOString(), transaction: event.data }));
      }
    }
    return res.status(200).send('ok');
  }

  return { quote, initialize, verify, webhook };
}

module.exports = { makeRenewalPaystackHandlers };
