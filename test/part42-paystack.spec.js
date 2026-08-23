'use strict';
const hasSandboxConfig = Boolean(process.env.PAYSTACK_SECRET_KEY && process.env.PAYSTACK_WEBHOOK_SECRET && process.env.EDUTRACK_PAYMENT_PLANS);
if (!hasSandboxConfig) {
  console.log('Part 42 Paystack: NOT_PROVEN (sandbox credentials/configuration unavailable; no live transaction attempted).');
  process.exit(0);
}
if (process.env.EDUTRACK_PAYSTACK_LIVE === 'true') throw new Error('Live Paystack configuration is forbidden in Part 42.');
console.log('Part 42 Paystack sandbox configuration is present; no transaction executed without explicit approved sandbox consent.');
