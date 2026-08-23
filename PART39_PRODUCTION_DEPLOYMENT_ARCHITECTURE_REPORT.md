# Part 39 — Production Deployment Architecture Repair Report

## Executive Summary

Part 38 established that the connected Vercel deployment served the EduTrack landing page but not the backend. Part 39 repaired the repository-side deployment boundary by making the existing Node HTTP handler importable, adding a Vercel function adapter, pinning Node.js 22, and routing `/api/*` requests to that adapter. Local verification passes. A controlled external staging deployment was not completed because the authorized Vercel project requires a clean pushed release and real staging environment variables; no production deployment was overwritten.

The current decision is **BLOCKED** for staging verification and **not a production approval**.

## Part 38 Defects Confirmed

The public domains responded over HTTPS, while `/api/health` and `/api/auth/session` returned HTTP 404. The connected deployment reported Node.js 24.x, the deployed commit differed from the local candidate, and the response exposed wildcard CORS. These findings remain preserved in the Part 38 evidence artifacts.

## Root Cause of Static Deployment

The source contained the complete backend routes, including health and session handlers, but `server.js` only self-started an `http.Server` when executed as a process and exported no request handler. The repository also had no Vercel configuration, no function entrypoint, and no authoritative Node engine declaration. Consequently, the connected Vercel project could serve static files without having a deployable backend function.

## Architecture Changes

The existing request handler was preserved. Startup is now guarded by `require.main === module`, while `handler` and `startServer` are exported. `api/index.js` invokes the same handler for Vercel requests and keeps the existing error contract. `vercel.json` routes `/api/:path*` to the adapter and requests the Node.js 22.x function runtime. No business logic, authentication logic, database schema, payment logic, or storage logic was rewritten.

## Runtime, Routing, CORS, and Headers

`package.json` now declares Node `22.x`; Vercel configuration declares `nodejs22.x`. Existing exact-origin CORS logic remains authoritative and allows configured HTTPS origins while rejecting unauthorized origins. Existing security headers remain active, including `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, CSP, and production HSTS. The new tests verify the adapter, health route, session route, approved-origin response, rejected-origin response, and security headers.

## Release Cleanup and Immutable Commit

The repository was classified before release. The working tree contains historical Part artifacts and temporary patch files from prior phases, so those files are not treated as an automatically releasable set. The intended release set is application source, deployment configuration, package files, migrations, required tests, and Part 39 evidence. No secrets were added. The exact immutable commit is recorded in `PART39_RELEASE_COMMIT.txt` after commit creation.

## Staging and External Verification

No staging URL was available in the environment, and no external staging request was intercepted or replaced with localhost. The browser staging test therefore reports `NOT_PROVEN`. Database, S3, Paystack sandbox, deployed RBAC, tenant isolation, mobile staging, performance, backups, and rollback remain `NOT_PROVEN` or `BLOCKED` until an independently provisioned staging target and non-production credentials are supplied.

## Regression Results

`npm test`, `npm run check`, the Part 39 repair test, the adapter test, the staging-browser classification test, and `npm audit --omit=dev --audit-level=moderate` completed successfully. The staging browser test correctly classified the absent external URL as `NOT_PROVEN`; it did not claim a staging pass.

## Final Decision

**BLOCKED — STAGING VALIDATION NOT COMPLETED.** The deployment architecture defect has been repaired locally, but the application must still be deployed from the immutable release to an authorized staging target and tested through real HTTPS before any staging or production readiness claim is made.

Part 40 was not started.
