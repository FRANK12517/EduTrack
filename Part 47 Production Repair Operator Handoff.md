# Part 47 Production Repair Operator Handoff

## Current state

The repair is isolated on branch `part47-production-repair` at commit `1f6b3abb9dbb002fd438c6bef28de9c9f513cca5`. The original `part47-staging` branch remains preserved at `563cb5eeac887d53f2bf39772f03b2f99ad20010`. The repair preview deployment reached `READY` as `dpl_FE2Gn4dZQGdYyoMibj1cdnaHGo2o`, but its HTTPS URL redirected to Vercel SSO.

## Repair summary

The existing production configuration assertion was moved from module-import time to request-invocation time. This allows the Vercel function module to load while preserving the fail-closed production guard. A misconfigured production invocation now returns a generic HTTP 503 before filesystem or compatibility persistence access. The focused regression test failed before the repair and passed afterward.

## Required operator actions

An authorized operator must first configure the Vercel project to use Node.js 22.x and provision the required isolated production-grade relational database, private storage, Paystack sandbox or approved production configuration, exact HTTPS origin configuration, monitoring, backup, rollback, and controlled test accounts. Do not use live credentials to manufacture a test pass.

After the prerequisites are available, deploy the exact repair commit through the authorized Vercel Git workflow. Confirm that the deployment reaches `READY`, its commit SHA is `1f6b3abb9dbb002fd438c6bef28de9c9f513cca5`, and Vercel reports Node.js 22.x.

Then verify the production domain over HTTPS. Check `/`, `/api/health`, and `/api/auth/session`; verify that `/api/health` returns an EduTrack backend response rather than a Vercel-generated error; verify exact-origin CORS and unauthorized-origin rejection; and inspect the required security headers. If any critical backend or runtime check fails, stop and retain the gate as `PRODUCTION NOT VERIFIED — BLOCKED`.

## Safety constraints

Do not bypass Vercel SSO or deployment protection. Do not modify production data manually. Do not change credentials or environment variables without an authorized, demonstrably safe operation. Do not commit `.env` files or credentials. Do not use wildcard CORS as a workaround. Do not start Part 48.

## Validation already completed

`npm run check`, `npm test`, `npm audit --omit=dev --audit-level=moderate`, the new production-function regression, and the preserved Part 39–47 focused suites completed locally. Infrastructure-dependent suites correctly remain `BLOCKED` or `NOT_PROVEN` where external resources were unavailable.
