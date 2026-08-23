# Part 39 Staging Deployment Evidence

## Scope

This file records only independently observed evidence. Local checks are not substituted for external staging checks.

| Check | Result | Evidence |
|---|---|---|
| Backend adapter exists | PASS | `api/index.js` exports the existing handler |
| `/api/health` route is exposed by adapter | PASS | `test/part39-deployment-adapter.spec.js` |
| `/api/auth/session` is exposed by adapter | PASS | `test/part39-deployment-adapter.spec.js` |
| Node runtime declaration | PASS | `package.json` `22.x`; `vercel.json` `nodejs22.x` |
| Exact-origin CORS behavior | PASS locally | `test/part39-deployment-repair.spec.js` |
| Security headers | PASS locally | `test/part39-deployment-repair.spec.js` |
| Immutable release deployed to staging | PASS | Vercel deployment `dpl_4f3FGEebd6u7a2pRmgqn64rMPCPU`, branch `part39-staging`, commit `ca64f8c6b23fb9397eda256cf27ea7e40be14aa3`, READY |
| External HTTPS health | BLOCKED | Preview URL `https://edutrack-2wiim5pdk-frank12517s-projects.vercel.app` redirects API requests to Vercel SSO with HTTP 302 |
| External session route | BLOCKED | SSO protection prevents reaching the application function; route response was HTTP 302 rather than an application response |
| Staging database | NOT_PROVEN | No authorized staging database evidence |
| Staging S3 | NOT_PROVEN | No authorized staging bucket evidence |
| Paystack sandbox | NOT_PROVEN | No authorized sandbox evidence |
| Deployed RBAC and tenant isolation | BLOCKED | Backend staging prerequisite unavailable |
| Mobile staging | NOT_PROVEN | No staging URL |
| Performance | NOT_PROVEN | No staging endpoint |

The connected public Vercel deployment from Part 38 was not overwritten. A separate GitHub/Vercel preview was created successfully, but project SSO protection applies to all non-custom domains, so unauthenticated external API verification is blocked. No production secrets were added and no production data was touched.
