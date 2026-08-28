# Part 41 — Staging Runtime and Backend Function Repair Report

## Status

**IMPLEMENTED — BLOCKED for staging application verification.** Part 41 repaired the repository-side cause of the first staging invocation failure and deployed the repair to a separate Vercel preview. The preview still cannot execute the EduTrack backend because required staging environment configuration is absent, and the connected project remains configured for Node.js 24.x rather than the required Node.js 22.x.

## Authoritative baseline

Part 40 tested Part 39 release `ca64f8c6b23fb9397eda256cf27ea7e40be14aa3`. Its preview returned HTTP 500 `FUNCTION_INVOCATION_FAILED` for both `/api/health` and `/api/auth/session`, while Vercel reported Node.js 24.x.

## Root cause

Vercel runtime logs identified the concrete first failure: during module import, `server.js` called `ensureData()`, which attempted to create `/var/task/data`. The serverless function filesystem did not provide that path as a writable directory, so import terminated with `ENOENT` before the handler could execute.

A second, expected fail-closed prerequisite appeared after the filesystem correction: the production guard rejected the preview because `EDUTRACK_ALLOWED_ORIGINS` was not configured with exact HTTPS origins. The connected project also still reports Node.js 24.x.

## Correction

`server.js` now detects serverless execution and skips JSON filesystem initialization during production import. The production guard remains active and continues to require relational persistence, exact HTTPS origins, Paystack server secrets, payment plans, and validated private storage. This does not introduce JSON fallback or weaken authentication, authorization, CORS, or storage controls.

Part 41 added a safe diagnostic procedure, Node/runtime/function/health/session/CORS tests, and staging browser classification. The Vercel API adapter and existing route handler were preserved.

## Deployment

The immutable Part 41 release commit is `63b6739b72389d066d496a9b1e12afad13137cec` on branch `part41-staging`. Vercel created deployment `dpl_GcnWAdJnF9xgBWbMBa7PiidnkMvo` at `https://edutrack-by9raq7mw-frank12517s-projects.vercel.app` and reported `READY`. The deployment metadata identified the exact commit.

## HTTPS results

A temporary authorized Vercel share URL was used without disabling SSO. The preview root returned HTTPS 200 static HTML. Real `GET /api/health`, `GET /api/auth/session`, approved-origin requests, unauthorized-origin requests, and OPTIONS preflight requests all returned HTTP 500 `FUNCTION_INVOCATION_FAILED` after the filesystem correction. Vercel runtime logs identified the current failure as missing exact HTTPS origin configuration. These are external FAIL/BLOCKED results, not PASS results.

## Other gates

No isolated staging relational database, S3 bucket, Paystack sandbox, delivery sink, backup target, monitoring target, or seeded non-production accounts were available. Database, payment, storage, authentication, RBAC, tenant isolation, mobile, performance, backup/restore, monitoring, and rollback remain `NOT_PROVEN` or `BLOCKED`.

## Regression

`npm run check`, `npm run test:part39`, `npm run test:part40`, `npm run test:part41`, `npm run test:part41:browser`, `npm test`, and `npm audit --omit=dev --audit-level=moderate` passed locally. The browser test correctly classified the absent staging URL as blocked when no explicit staging URL was provided.

## Production safety

The production deployment, production data, production storage, and production payment configuration were not modified. Live Paystack was not used. No secrets were printed or committed. Part 42 was not started.

## Final decision

**BLOCKED.** The filesystem import defect is repaired, but a verified Node.js 22 runtime and isolated staging environment configuration are still required before real application-level staging validation can pass.
