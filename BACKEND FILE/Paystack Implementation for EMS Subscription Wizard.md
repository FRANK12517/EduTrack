# Paystack Implementation for EMS Subscription Wizard

## What was changed

The rebuilt EMS copy replaces only the subscription wizard’s Step 3 and Step 4 payment functionality. Step 3 no longer displays GCB Bank details or editable manual payment-proof fields. It now displays the selected package, the dynamically supplied amount, the registered school email, and a **Pay with Paystack** action. Step 4 is rendered only after the backend reports a successful server-side verification and shows the school, package, amount, payment status, Paystack reference, and payment date.

The original `EDUCATIONMANAGEMENTSYSTEM.html` and the earlier `EDUCATIONMANAGEMENTSYSTEM_REBUILT.html` files are not modified by this patch. The updated frontend is `EDUCATIONMANAGEMENTSYSTEM_PAYSTACK.html`.

## Backend integration required

The supplied upload contains HTML only; it does not contain the application’s existing server, database adapter, routing layer, or subscription schema. Therefore, `paystack_backend_reference.js` provides secure handlers that must be mounted inside the real EMS backend rather than run as a replacement application.

The handlers require a database adapter with methods for loading the registration and server-side package price, creating and updating pending payments, finding payments by reference, and atomically marking a verified payment while activating the correct subscription. The backend must enforce a unique payment reference and an idempotent verified-payment transition in the database transaction.

Mount the handlers as follows in the existing backend architecture:

```js
const { makePaystackHandlers } = require('./paystack_backend_reference');
const handlers = makePaystackHandlers({ db: existingDatabaseAdapter });
app.post('/api/payments/paystack/initialize', handlers.initialize);
app.get('/api/payments/paystack/verify/:reference', handlers.verify);
app.post('/api/payments/paystack/webhook', handlers.webhook);
```

The server must retain the raw request body for webhook signature verification. The Paystack secret is server-only:

```bash
PAYSTACK_SECRET_KEY=replace_with_a_rotated_test_or_live_secret
```

Do not place that value in this HTML, browser JavaScript, local storage, session storage, a frontend environment variable, or a source-controlled file. The previous exposed secret must be revoked or rotated before a live deployment.

## Frontend payment behavior

The frontend calls `POST /api/payments/paystack/initialize` without sending an amount. The server determines the selected package and its actual configured price, converts the amount to the currency minor unit, creates a unique reference, and returns only safe authorization data. Paystack InlineJS then resumes the server-initialized transaction with its access code. After success, the frontend calls `GET /api/payments/paystack/verify/:reference`. Step 4 opens only when the response contains `status: "verified"` and a verified transaction object.

Failures, cancellation, unavailable checkout, and verification timeouts leave the user on Step 3, preserve Step 1 and Step 2 values, keep the subscription inactive, and expose a retry action.

## Regression scope

The patch does not alter the login page, any of the six login cards, authentication, registration Steps 1–2, navigation, sidebar, dashboard, branding, or unrelated components. The existing Region → District cascade remains outside the Step 3/4 replacement and must be regression-tested in the live backend-connected application.

## Sources

[1]: https://paystack.com/docs/developer-tools/inlinejs/ "Paystack InlineJS documentation"
[2]: https://paystack.com/docs/payments/accept-payments/ "Paystack Accept Payments documentation"

## Browser regression results

The final reloaded HTML was exercised in Chromium. The live controller exposed initialization, verification, display-preparation, and confirmation-builder functions. Step 3 contains no GCB Bank details, manual proof fields, transaction-reference entry, or payment-date entry; it displays the Paystack payment action. With a ready payment state, the wizard stayed on Step 3. With a simulated verified server response, Step 4 rendered the `Payment Successful / Payment Verified` summary. All six login cards were present and clickable, and both Region and District controls remained present for the existing cascade.

The browser test did not contact Paystack or submit a real payment. Live payment behavior requires the backend endpoints and rotated server-side secret to be mounted in the actual EMS deployment.
