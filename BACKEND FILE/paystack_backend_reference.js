/*
 * Paystack backend reference for the supplied static EMS build.
 *
 * Integrate these handlers into the application's existing server and database
 * layer. Do not run this file as a standalone production server without wiring
 * the repository functions to the real database.
 *
 * Required environment variable on the server only:
 *   PAYSTACK_SECRET_KEY=sk_live_or_sk_test_...
 *
 * The frontend must never receive PAYSTACK_SECRET_KEY.
 */
'use strict';

const crypto = require('node:crypto');

function makePaystackHandlers({ db, secretKey = process.env.PAYSTACK_SECRET_KEY, fetchImpl = fetch }) {
  if (!secretKey) throw new Error('PAYSTACK_SECRET_KEY is required on the server');
  if (!db) throw new Error('A database adapter is required');

  async function paystackRequest(path, init = {}) {
    const response = await fetchImpl('https://api.paystack.co' + path, {
      ...init,
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/json',
        ...(init.headers || {})
      }
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body.status !== true) {
      const error = new Error(body.message || `Paystack request failed (${response.status})`);
      error.statusCode = response.status;
      throw error;
    }
    return body.data;
  }

  function minorUnit(amountMajor) {
    const amount = Number(amountMajor);
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('Invalid subscription amount');
    return Math.round(amount * 100);
  }

  function reference() {
    return `EMS_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
  }

  function safeJson(res, status, payload) {
    res.status(status).json(payload);
  }

  async function initialize(req, res) {
    try {
      const input = req.body || {};
      const registration = await db.getRegistrationForPayment(input);
      if (!registration || !registration.id || !registration.email) {
        return safeJson(res, 400, { message: 'Valid school registration and email are required.' });
      }
      const subscription = await db.getSubscriptionById(registration.packageId);
      if (!subscription || !subscription.id || !Number.isFinite(Number(subscription.price))) {
        return safeJson(res, 400, { message: 'Selected subscription package is unavailable.' });
      }
      const txReference = reference();
      const amountMinor = minorUnit(subscription.price);
      const metadata = {
        school_id: registration.schoolId || null,
        registration_id: registration.id,
        subscription_id: subscription.id,
        school_email: registration.email,
        payment_purpose: 'school_subscription_registration'
      };
      await db.createPendingPayment({
        schoolId: registration.schoolId || null,
        registrationId: registration.id,
        subscriptionId: subscription.id,
        reference: txReference,
        amount: amountMinor,
        currency: subscription.currency || 'GHS',
        status: 'pending',
        gateway: 'paystack',
        customerEmail: registration.email,
        metadata
      });
      const authorization = await paystackRequest('/transaction/initialize', {
        method: 'POST',
        body: JSON.stringify({
          email: registration.email,
          amount: String(amountMinor),
          currency: subscription.currency || 'GHS',
          reference: txReference,
          metadata
        })
      });
      await db.attachPaystackAuthorization(txReference, authorization);
      return safeJson(res, 200, {
        authorization: {
          access_code: authorization.access_code,
          reference: authorization.reference || txReference,
          amount: amountMinor,
          currency: subscription.currency || 'GHS'
        }
      });
    } catch (error) {
      return safeJson(res, error.statusCode || 500, { message: error.message || 'Unable to initialize payment.' });
    }
  }

  async function verify(req, res) {
    try {
      const txReference = String(req.params.reference || '');
      if (!txReference) return safeJson(res, 400, { status: 'failed', message: 'Reference is required.' });
      const payment = await db.getPaymentByReference(txReference);
      if (!payment) return safeJson(res, 404, { status: 'failed', message: 'Payment reference not found.' });
      if (payment.status === 'verified') {
        return safeJson(res, 200, { status: 'verified', transaction: payment });
      }
      const transaction = await paystackRequest(`/transaction/verify/${encodeURIComponent(txReference)}`);
      const expectedAmount = Number(payment.amount);
      const actualAmount = Number(transaction.amount);
      const valid = transaction.reference === txReference && transaction.status === 'success' && transaction.currency === payment.currency && actualAmount === expectedAmount;
      if (!valid) {
        await db.markPaymentFailed(txReference, { reason: 'Paystack verification mismatch', transaction });
        return safeJson(res, 400, { status: 'failed', message: 'Payment verification failed.' });
      }
      const verified = await db.markPaymentVerifiedAndActivateSubscription({
        reference: txReference,
        transactionId: transaction.id,
        amount: actualAmount,
        currency: transaction.currency,
        paidAt: transaction.paid_at || new Date().toISOString(),
        transaction
      });
      return safeJson(res, 200, { status: 'verified', transaction: verified });
    } catch (error) {
      return safeJson(res, error.statusCode || 500, { status: 'failed', message: error.message || 'Payment verification failed.' });
    }
  }

  function validSignature(rawBody, signature) {
    if (!signature || !rawBody) return false;
    const expected = crypto.createHmac('sha512', secretKey).update(rawBody).digest('hex');
    const a = Buffer.from(expected, 'utf8');
    const b = Buffer.from(String(signature), 'utf8');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }

  async function webhook(req, res) {
    const rawBody = req.rawBody || JSON.stringify(req.body || {});
    if (!validSignature(rawBody, req.headers['x-paystack-signature'])) return res.status(401).send('Invalid signature');
    const event = req.body || {};
    if (event.event === 'charge.success' && event.data && event.data.reference) {
      const txReference = event.data.reference;
      const payment = await db.getPaymentByReference(txReference);
      if (payment && payment.status !== 'verified') {
        await db.markPaymentVerifiedAndActivateSubscription({
          reference: txReference,
          transactionId: event.data.id,
          amount: Number(event.data.amount),
          currency: event.data.currency,
          paidAt: event.data.paid_at || new Date().toISOString(),
          transaction: event.data
        });
      }
    }
    return res.status(200).send('ok');
  }

  return { initialize, verify, webhook };
}

module.exports = { makePaystackHandlers };
