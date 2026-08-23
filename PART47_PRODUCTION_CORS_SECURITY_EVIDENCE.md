# Part 47 Production CORS and Security Evidence

The production root at `https://www.edutrackgh.online/` returned HTTP 200 over HTTPS. The response included HSTS (`strict-transport-security: max-age=63072000`) and Vercel served the response successfully.

The same response exposed `access-control-allow-origin: *`. This does not satisfy EduTrack’s exact-origin production requirement and is recorded as a **CORS FAIL**. No wildcard-CORS workaround was introduced in the repair.

The backend security-header set could not be independently verified because `GET /api/health` returned HTTP 500 with `FUNCTION_INVOCATION_FAILED`. The repaired preview redirected to Vercel SSO, so preview security checks were not attempted through a bypass. Unauthorized-origin behavior was not tested after the backend failure.

No Vercel protection was bypassed. No production configuration, secrets, database, storage, or Paystack credentials were changed.
