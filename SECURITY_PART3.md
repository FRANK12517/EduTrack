# EduTrack Security Hardening — Part 3

## Actual integration inventory

The repository did not contain a server-side upload route or Paystack API/webhook route before this part. The frontend contains historical/local subscription and payment workflows, but the authoritative Node service exposed no payment verification endpoint and no private file-storage mechanism. Part 3 therefore adds secure backend primitives without rewriting the existing frontend flow.

| Capability | Part 3 implementation |
|---|---|
| Upload categories | `passport`, `profile`, `document`, and `report`. |
| Allowed file formats | JPEG, PNG, and WebP for image categories; JPEG, PNG, WebP, and PDF for document/report categories. SVG, HTML, JavaScript, archives, executables, and server-side files are rejected. |
| Validation | Filename safety, declared MIME type, extension, magic bytes, non-empty content, and category-specific size limit are checked server-side. |
| Size limits | Passport/profile: 5 MiB; document: 15 MiB; report: 25 MiB. Ordinary API JSON remains limited to 1 MiB. |
| Storage | Files are written outside the public web allowlist under `data/uploads`, with mode `0700` for the directory and `0600` for files. Storage names are unpredictable server-generated tokens. |
| Download authorization | Downloads require an active authenticated account. Only the owning account or an administrative role can retrieve a file. Responses use attachment disposition, private no-store caching, and `nosniff`. |
| Upload auditing | Accepted, rejected, and denied-access events record safe metadata such as account, category, size, file ID, and rejection category; contents and tokens are not logged. |
| Payment plans | Plans are loaded from the server-only `EDUTRACK_PAYMENT_PLANS` JSON configuration. Client-supplied amount, currency, duration, discount, or entitlement values are never authoritative. |
| Payment initialization | Requires authentication, same-origin protection, an approved plan ID, and an idempotency key. Repeated keys return the original server-owned intent. |
| Paystack verification | `/api/payments/verify` calls Paystack's transaction verification endpoint only when `PAYSTACK_SECRET_KEY` is configured, then validates status, reference, amount, currency, customer ownership where available, and the server-side intent. |
| Webhooks | `/api/payments/paystack/webhook` validates the `x-paystack-signature` HMAC-SHA512 signature using `PAYSTACK_WEBHOOK_SECRET` or `PAYSTACK_SECRET_KEY`, rejects malformed/unsigned events, and processes only successful events tied to a known intent. |
| Replay protection | Transaction references and webhook event IDs are checked before subscription changes. Duplicate deliveries are safely acknowledged without extending a subscription again. |
| Subscription integrity | Subscription duration, plan, expiry, status, user association, and transaction association are computed server-side from the approved plan and trusted payment result. |

## Configuration

Set `EDUTRACK_PAYMENT_PLANS` to a JSON object whose plans contain positive integer `amount`, ISO-like currency text, and positive integer `durationDays`. Set `PAYSTACK_SECRET_KEY` for server-side verification and `PAYSTACK_WEBHOOK_SECRET` for webhook signature verification. Secrets must be provided through deployment configuration and must not be committed to the repository.

The current repository does not include a production email/payment delivery adapter or a live Paystack callback configuration. The new endpoints are fail-closed when required server configuration is absent; they do not activate subscriptions based on frontend callbacks or client-reported payment state.

## Tests

`test/security.spec.js` now covers valid and spoofed magic-byte uploads, private download behavior, attachment headers, server-owned pricing, idempotent initialization, signed webhook acceptance, invalid signature rejection, duplicate webhook replay, and subscription/payment persistence. The complete workflow remains `npm test`, which also runs the existing protected frontend suite and Part 1/2 authentication-security tests.
