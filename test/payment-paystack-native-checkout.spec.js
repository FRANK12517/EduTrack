'use strict';
const assert = require('assert');
const fs = require('fs');
const html = fs.readFileSync(require.resolve('../index.html'), 'utf8');
const server = fs.readFileSync(require.resolve('../server.js'), 'utf8');

for (const obsolete of ['selectedPaymentMethod', 'paymentChannel', 'selectedChannel']) {
  assert.ok(!html.includes(obsolete), `obsolete payment selector state remains: ${obsolete}`);
}
assert.doesNotMatch(html, /id=["']edutrack-payment-method["']/);
assert.doesNotMatch(html, /id=["']edutrack-provider-bank-controls["']/);
assert.doesNotMatch(html, /id=["']edutrack-payment-inputs["']/);
const payloadSection = html.slice(html.indexOf('function subPaystackRegistrationPayload()'), html.indexOf('async function subPaystackStart()'));
assert.ok(payloadSection && !payloadSection.includes('paymentMethod'), 'custom payment method must not be sent by the Paystack registration payload');
assert.match(html, /id="edutrack-native-paystack-checkout"/);
assert.match(html, /fetch\('\/api\/payments\/paystack\/initialize'/);
assert.match(html, /new window\.PaystackPop\(\)/);
assert.match(html, /resumeTransaction\(auth\.access_code\)/);
assert.match(html, /subPaystackVerify\(reference\)/);
assert.match(html, /paymentPurpose/);
assert.match(html, /subscriptionPackageId/);
assert.match(html, /clientRequestId/);
assert.doesNotMatch(html, /channels\s*:\s*\[['"]card['"],\s*['"]mobile_money['"],/);
assert.match(server, /req\.url === '\/api\/payments\/verify'/);
assert.match(server, /data\.status !== 'success'/);
assert.match(server, /recordVerifiedPayment/);
assert.doesNotMatch(html, /PAYSTACK_SECRET_KEY/);
console.log('Native Paystack checkout regression suite passed.');
