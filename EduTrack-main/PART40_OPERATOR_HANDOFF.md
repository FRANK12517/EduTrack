# Part 40 Operator Handoff

Part 40 verified that the exact Part 39 release can produce a READY Vercel preview, but the preview is not an operational staging endpoint. The connected project reports Node.js 24.x rather than the required 22.x, and real requests to `/api/health` and `/api/auth/session` return HTTP 500 `FUNCTION_INVOCATION_FAILED`. Vercel SSO was bypassed only through a temporary authorized share URL; SSO was not disabled.

The next safe action is to provision an isolated staging target that can execute Node.js 22 and receive staging-only environment values. Required resources are a dedicated relational database, private S3 bucket or prefix, Paystack sandbox credentials, test delivery sink, backup destination, and non-production test accounts. Do not use the public production domains, production database, production bucket, live Paystack credentials, or real user data.

Deploy the exact Part 39 release SHA `ca64f8c6b23fb9397eda256cf27ea7e40be14aa3`, verify the actual runtime metadata, then run the HTTPS health/session/CORS/security checks. Only after those pass should the operator run database migrations, controlled fixtures, authentication, RBAC, tenant-isolation, storage, payment sandbox, mobile, performance, backup/restore, monitoring, and rollback checks.

If an isolated Node 22 staging target cannot be provided, retain the Part 40 decision as `BLOCKED`. Do not merge the staging pull request into production, do not alter production security controls, and do not begin Part 41.
