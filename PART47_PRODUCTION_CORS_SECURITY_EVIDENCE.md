# Part 47 Production CORS and Security Evidence

## Production response

The deployed production root returned HTTP 200 over HTTPS. Its response included `access-control-allow-origin: *`, which fails EduTrack’s exact-origin production requirement. No wildcard-CORS workaround was introduced by the repair.

The production backend responses from `/api/health` and `/api/auth/session` returned the generic HTTP 503 fail-closed response. Both included Content-Security-Policy, Strict-Transport-Security, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, and Permissions-Policy.

## CORS probes

A request to `/api/health` with the authorized origin `https://www.edutrackgh.online` returned HTTP 503 without an allow-origin response. A request with unauthorized origin `https://attacker.invalid` returned the same HTTP 503 without an allow-origin response. Exact-origin success behavior and unauthorized-origin rejection are **NOT_PROVEN** while required production configuration is unavailable; the root wildcard header remains a **FAIL**.

No Vercel protection was bypassed. No production configuration, secrets, database, storage, Paystack credentials, or data were modified.
