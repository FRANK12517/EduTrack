# Part 47 Production Configuration and Readiness Repair

## Scope and baseline

The repair began from `main` at `037d2404cc9ef6865106fbcd47a1575e188eca17` and was isolated on `part47-production-config-repair`. The prior production deployment was `dpl_H5KvByz7P9kkJfeGe85NHXfqSYQW`, deployed from that same SHA. Before this work, `/` returned HTTP 200, `/api/health` and `/api/auth/session` returned the intended generic HTTP 503, Vercel reported Node.js 24.x, and the production root exposed `Access-Control-Allow-Origin: *`.

Existing Part 39–47 implementation, tests, evidence, fail-closed guards, authentication, RBAC, tenant isolation, Paystack protections, storage protections, and security headers were preserved. No history was rewritten and no prior evidence was deleted.

## Authorized capability review

The authorized GitHub integration permits repository inspection and Git pushes. The authorized Vercel integration permits project and deployment inspection, deployment inspection, read-only URL fetching, deployment operations, and deployment-protection inspection. It does not expose an authorized environment-variable management operation, Node runtime project-setting operation, relational database provider, private object-storage provider, Paystack sandbox provider, delivery sink, monitoring target, backup destination, restore target, rollback target, or controlled test-account provider. The enabled Vercel project has SSO protection for all non-custom domains; no protection was bypassed.

No plugin was installed automatically. No production credentials were used merely because credentials might exist in the environment.

## Configuration classification

The actual server validation requires a relational database, exact HTTPS `EDUTRACK_ALLOWED_ORIGINS`, Paystack server secrets, non-empty `EDUTRACK_PAYMENT_PLANS`, and valid private storage configuration. The production guard is fail-closed and is invoked at request time. Optional operational configuration includes reset delivery, backup, and monitoring integrations; these were not provisioned because no authorized real resources exist. No secret values were printed, stored in evidence, committed, or placed in source code.

## Implemented change

The source of application CORS behavior is `applyCors()` in `server.js`, which dynamically allows only configured exact origins and rejects unauthorized origins. The observed wildcard was on the Vercel-served root response, not in active server middleware. A minimal root-only Vercel header rule was added to set `Access-Control-Allow-Origin: https://www.edutrackgh.online` and `Vary: Origin`. The API rewrite and dynamic API CORS behavior were preserved. A focused regression test verifies the root rule is exact-origin, non-wildcard, and that API dynamic CORS controls remain present.

This repair was committed as `aa6553ce961c3ce70a73f0118c4d3d438b308550` and pushed to the dedicated repair branch only. It was not merged into `main` because mandatory production configuration and independent production verification remain unavailable.

## Validation

`npm run check`, `npm test`, `npm audit --omit=dev --audit-level=moderate`, the focused production-configuration test, the production-function import regression, and all preserved Part 39–47 focused suites passed locally. External infrastructure-dependent checks remain blocked or not proven as recorded in the final gate.

Vercel created preview deployment `dpl_CHAxqrQ3WQiCjGTVPEdRjHtv4v6L` from the repair SHA and reported `READY`. The preview URL redirects to Vercel SSO. It was not accessed by bypassing protection, so the deployed CORS header change is not independently proven.

## Remaining production gates

The project still reports Node.js 24.x, not the required Node.js 22.x. No authorized Vercel project-runtime management capability was available, so runtime status is `FAIL` based on the observed mismatch and was not changed through documentation alone.

No authorized production relational database exists in the available capabilities, so database is `BLOCKED`. Private storage, Paystack sandbox/test resources, delivery, monitoring, backup, restore, rollback, and controlled accounts are `BLOCKED`. Authentication, RBAC, tenant isolation, mobile, and performance production results are `NOT_PROVEN` without valid isolated resources and accounts.

The existing production deployment remains unchanged. Its root is HTTP 200, while `/api/health` and `/api/auth/session` return HTTP 503 because required production configuration is unavailable. Backend security headers were observed. The production root wildcard remains a `FAIL` until the exact-origin configuration is promoted and independently verified. The repair preview cannot be used as proof while it is SSO-protected.

> **PRODUCTION NOT VERIFIED — BLOCKED**

**PART 48 WAS NOT STARTED.**
