# EduTrack

EduTrack is served by the existing `index.html` application and the small Node.js authentication service in `server.js`. The repository previously contained only a browser-local application: registered schools, staff, roles, and sessions were stored in `localStorage`, and the historical API bridge was offline-first and non-authoritative. The new service establishes the server-side authentication boundary required for privileged access.

## Bootstrap provisioning

Privileged credentials are never committed to the repository. Set the six bootstrap environment variables in the deployment secret manager, then run `npm run provision` once. The command stores only salted `scrypt` hashes for the password and access code. It is safe to rerun: it updates the two designated privileged identities while preserving their stable IDs.

Required variables are `EDUTRACK_DEVELOPER_EMAIL`, `EDUTRACK_DEVELOPER_PASSWORD`, `EDUTRACK_DEVELOPER_ACCESS_CODE`, `EDUTRACK_SUPER_ADMIN_EMAIL`, `EDUTRACK_SUPER_ADMIN_PASSWORD`, and `EDUTRACK_SUPER_ADMIN_ACCESS_CODE`.

## Part 19 relational authority layer

Part 19 adds one canonical TiDB/MySQL-compatible relational authority layer in `db/relational.js`. Configure `EDUTRACK_DATABASE_URL` from the deployment secret manager, then run `npm run db:migrate`. The schema and migration state are defined in `db/schema.sql`, and the migration is safe to rerun. `npm run db:import-json` is an explicit, controlled import of the current JSON store; it imports only entities covered by the Part 19 foundation and does not silently delete or rewrite the JSON file.

When `EDUTRACK_DATABASE_URL` is configured, users, credentials, roles, development fixtures, server sessions, and migrated authentication audit events are authoritative in the relational database. The JSON file remains a temporary compatibility store for non-migrated domains and is not a competing authority for the migrated authentication path. See `.env.example` for the secret-free environment contract. No Vercel deployment readiness is claimed by this change.

## Controlled reset

Run `npm run reset` only as an intentional administrative operation. It removes registered schools, staff, subscriptions, transactions, sessions, and dependent application data from the server store while retaining only `DEVELOPER_ROOT` and `SUPER_ADMIN` users. The reset does not create sample schools or staff.

## Run

Use `npm start` and open `http://localhost:3000`. The existing **Enter System** button now accepts the secure account fields when they are filled, submits credentials to `/api/auth/login`, and routes only after the server returns an authoritative role. The session is an `HttpOnly` cookie, so privileged tokens and credentials are not placed in browser storage or API responses. Refreshing the page restores the session through `/api/auth/session`.

The repository retains `data/edutrack.json` for non-migrated legacy domains, but the Part 19 relational adapter is now the authority for migrated identity, credentials, roles, sessions, and authentication audit events whenever `EDUTRACK_DATABASE_URL` is configured. The JSON store is not a production multi-instance database, and Vercel deployment readiness is intentionally deferred.

## Security hardening — Part 1

The authentication service now stores only password/access-code hashes and SHA-256-derived session and password-reset token representations. Session cookies are `HttpOnly`, `SameSite=Lax`, path-restricted, non-cacheable, and marked `Secure` in production. Sessions expire after eight hours, logout invalidates the server-side session, and password changes or password resets invalidate all sessions for the account.

Browser state-changing authentication requests are protected by same-origin validation. The authenticated `/api/auth/csrf` endpoint also provides a cryptographically random CSRF token for clients that need an explicit token header. Login failures use generic responses, and server-side per-IP/per-account progressive limits protect login and password-reset request endpoints. Repeated failures receive temporary throttling rather than permanent lockout.

Password-reset requests always return the same generic response for known and unknown accounts. Reset records contain only a hashed token, expire after fifteen minutes, are single-use, and are invalidated after successful use. The repository does not yet include an email or SMS delivery adapter; integrating one is intentionally left for a later security-hardening part so reset tokens are not exposed through the API or logs.

Run the complete validation workflow with `npm test`. The protected frontend regression suite remains in `test/protected-features.spec.js`, and the new server-side security coverage is in `test/security.spec.js`. Security tests use an isolated temporary data fixture and restore the repository data file after completion.

## Part 30 production operations

Production mode requires `NODE_ENV=production`, a configured `EDUTRACK_DATABASE_URL`, `EDUTRACK_ENABLE_DEV_ACCESS=false`, and an explicit `EDUTRACK_ALLOWED_ORIGINS` value. The server refuses to start in production without relational persistence or with development access enabled. The health endpoint verifies relational initialization and returns a non-sensitive `503` when production persistence is unavailable.

Install dependencies with `npm ci`, configure the secret values from `.env.production.example` through the deployment secret manager, run `npm run db:migrate`, and provision the two bootstrap identities once with `npm run provision`. Start the service with `npm start` behind a TLS-terminating reverse proxy or managed HTTPS service. The application is a Node.js server that serves the legacy frontend and API from the same origin; it has no separate frontend build step.

The production backup command is `npm run backup:production /external/backup/location/edutrack-YYYY-MM-DD`. It creates a checksummed manifest, a MySQL/MariaDB logical dump, the compatibility JSON store, the secret-free production environment template, schema metadata, package metadata, and an uploads archive. Backups must be copied to access-controlled external storage and encrypted at rest by that storage system; the backup directory must not be the only copy on the production host. Review the manifest and retain complete backup sets according to the organization’s retention policy.

A restore is destructive and must be performed during a maintenance window against a reviewed target database. Set `EDUTRACK_RESTORE_CONFIRM=YES`, set `EDUTRACK_RESTORE_DATA_DIR` to the target data directory, and run `npm run restore:production /external/backup/location/edutrack-YYYY-MM-DD`. The command verifies manifest checksums before loading the relational dump and restoring compatibility data and uploads. Perform a controlled restore test on an isolated database before relying on a production backup. Database rollback is not assumed to be automatic; use a verified backup restore for destructive migration recovery.

The `npm run reset` command is development-only and is rejected when `NODE_ENV=production`. Never run `npm run provision:dev` in production. Payment secrets, bootstrap credentials, database credentials, and any storage credentials must be supplied only by the deployment secret manager and must never be committed to source control.

### Part 30 production gate

The current application passes syntax checks, dependency audit, relational Parts 18–29 regression suites, the Part 29 responsive browser workflow, production-mode startup with a relational database, and controlled backup/restore verification. It is **not yet ready for production deployment** until payment/subscription and upload metadata are migrated from the compatibility JSON store into durable relational or managed object storage, production backup encryption and off-host retention are enforced by deployment infrastructure, HTTPS/domain configuration is installed, and the full role-by-role production smoke test is executed against a production-like deployment.


## Part 32 production infrastructure and final gate

Part 32 adds deployment artifacts under `deploy/`, a production container definition in `Dockerfile`, and an S3-compatible private-storage adapter in `app/private-storage.js`. Production mode now requires relational persistence, explicit allowed origins, Paystack server secrets, a configured payment-plan contract, and `EDUTRACK_STORAGE_MODE=s3` with a private bucket. Local filesystem storage remains available only for development and compatibility-mode testing.

The recommended deployment shape is a managed or persistent Linux host running Node.js 22 behind a TLS-terminating reverse proxy, with MySQL/MariaDB as the relational authority, an S3-compatible private bucket for uploaded files, and an access-controlled off-host backup destination. The reference Nginx configuration is `deploy/nginx.edutrack.conf.example`; systemd service and daily timer templates are `deploy/edutrack.service.example`, `deploy/edutrack-backup.service.example`, and `deploy/edutrack-backup.timer.example`. Replace example domains, certificate paths, users, paths, and secret-manager references before installation.

Use `.env.production.example` as a contract, never as a source of real secrets. Run `npm ci --omit=dev`, provision accounts as a one-time controlled operation, run `npm run db:migrate`, and verify `/api/health` reports relational persistence. A production release must pass role, tenant-isolation, payment/webhook, upload, password, academic, mobile, backup, and restore checks through the real deployment endpoint before approval.

Part 32 does not claim that deployment occurred. The final evidence and status matrix are recorded in `PART32_PRODUCTION_GATE_REPORT.md`. Until a real domain, TLS endpoint, Paystack test credentials, private object-storage bucket, off-host encrypted backup destination, retention scheduler, and production-like role fixtures are configured and tested, the final verdict remains **EDUTRACK IS NOT YET READY FOR PRODUCTION DEPLOYMENT**.

### Deployment and rollback sequence

1. Provision the relational database and private S3-compatible bucket in the target environment.
2. Create production secrets in the deployment secret manager and set the exact HTTPS origin in `EDUTRACK_ALLOWED_ORIGINS`.
3. Configure the reverse proxy and certificate, then verify forwarded protocol, host, IP, request limits, and secure cookies.
4. Deploy the application image or checked-out release, run `npm ci --omit=dev`, and execute `npm run db:migrate`.
5. If a populated legacy export exists, run `npm run db:migrate-business` and reconcile `manualReview` before enabling users.
6. Enable the daily backup timer only after its external destination, encryption, permissions, and retention policy are configured.
7. Exercise health, authentication, tenant isolation, payment/webhook, file, password, academic, mobile, backup, and restore checks.
8. For rollback, stop traffic, redeploy the previous known-good application release and configuration, and restore the reviewed matching database and file backup only when the failure requires data recovery. Do not assume an unverified reverse migration is safe.


## Part 33 deployment verification

Part 33 performed a fresh pre-deployment audit and added `npm run production:preflight`, which validates production-shaped configuration without printing secret values. It rejects missing relational configuration, development access, wildcard or non-HTTPS origins, missing Paystack server configuration, invalid payment plans, and non-S3 production storage. A complete environment-shaped preflight passed locally; no real external credentials were used.

The final Part 33 deployment report is `PART33_PRODUCTION_DEPLOYMENT_REPORT.md`, and the concise release checklist is `PART33_RELEASE_GATE.md`. These documents distinguish local verification from real external infrastructure verification. No production deployment, public HTTPS endpoint, Paystack sandbox transaction, private S3 bucket test, external backup drill, populated-data migration, or production role matrix is claimed from this environment.

The exact remaining release action is to provision the real host, domain/TLS ingress, relational production database, private S3-compatible bucket, Paystack sandbox credentials, external encrypted backup destination and schedule, then run the documented endpoint, role, payment, file, backup, restore, and rollback checks. Until those checks pass, the release decision remains **EDUTRACK IS NOT YET READY FOR PRODUCTION DEPLOYMENT**.


## Part 34 release-candidate verification

Part 34 adds `npm run production:preflight`, `npm run test:part34`, and `npm run test:part34:browser`. These checks validate fail-closed production configuration, relational-only startup, S3-only production storage, exact HTTPS origins, health behavior, production security headers, and non-sensitive browser-visible responses. The current release-candidate verification report is `PART34_PRODUCTION_DEPLOYMENT_VERIFICATION_REPORT.md`.

The local release-candidate and complete available regression inventory pass. No real deployment, public HTTPS endpoint, live Paystack sandbox, private S3 bucket, external encrypted backup/restore drill, populated production export, or deployed role/isolation matrix was available. These gates remain **NOT PROVEN — EXTERNAL INFRASTRUCTURE UNAVAILABLE**; local tests must not be treated as external production evidence. The release decision is therefore **NO-GO — EDUTRACK IS NOT YET READY FOR PRODUCTION DEPLOYMENT**.


## Part 35 final release gate

Part 35 adds a single authoritative machine-readable evaluator at `scripts/production-release-gate.js`, exposed as `npm run production:release-gate` and `npm run production:release-gate:json`. It classifies each gate as `PASS`, `FAIL`, `NOT_PROVEN`, or `BLOCKED`, never prints secret values, and exits nonzero for a non-GO decision.

Additional safe handoff harnesses are available through `production:deployment-check`, `production:paystack-check`, `production:storage-check`, `production:backup-check`, `production:migration-check`, `production:performance-check`, and `production:rbac-check`. They do not simulate successful external infrastructure. Missing external endpoints, providers, buckets, destinations, exports, or deployed fixtures are reported as `NOT_PROVEN` or `BLOCKED`.

The final Part 35 documents are `PART35_PRODUCTION_GATE_MATRIX.md` and `PART35_FINAL_PRODUCTION_READINESS_REPORT.md`. Local release-candidate validation passes, but the final decision remains **NO-GO — EDUTRACK IS NOT YET READY FOR PRODUCTION DEPLOYMENT** until the finite external blockers are executed and evidenced.


## Part 36 production deployment execution

Part 36 adds the final deployment-execution artifacts: `PART36_PREIMPLEMENTATION_BASELINE.txt`, `PART36_PRODUCTION_DEPLOYMENT_REPORT.md`, `PART36_FINAL_RELEASE_GATE.json`, and `PART36_FINAL_RELEASE_CHECKLIST.md`, plus the Part 36 unit and production-shaped browser validation suites. The current authoritative release gate remains `NO_GO` because no authorized external host, public HTTPS endpoint, live Paystack sandbox, private S3 bucket, external encrypted backup/restore target, populated production export, deployed role fixtures, password-delivery provider, monitoring service, or recovery environment is configured in this workspace.

Local checks pass and all unavailable external harnesses explicitly return `NOT_PROVEN` or `BLOCKED`. No production deployment, live payment, real S3 operation, external backup/restore, or production-data migration is claimed. The deployment operator must use the Part 36 checklist and rerun `npm run production:release-gate:json` after provisioning the real infrastructure. Part 37 was not started.


## Part 37 external deployment execution

Part 37 executed the external-deployment workflow as far as this environment permitted. The current artifacts are `PART37_PREIMPLEMENTATION_BASELINE.txt`, `PART37_EXTERNAL_DEPLOYMENT_EXECUTION_REPORT.md`, `PART37_FINAL_RELEASE_GATE.json`, `PART37_PRODUCTION_EVIDENCE_MATRIX.md`, and `PART37_OPERATOR_HANDOFF.md`.

No authorized external host, domain/TLS endpoint, production database, Paystack sandbox, private S3 bucket, external backup/restore target, password-delivery provider, monitoring service, deployed role fixtures, production export, or recovery environment was available. Therefore the authoritative result remains `NO_GO`; unavailable gates are classified `NOT_PROVEN` or `BLOCKED`, not PASS. Part 38 was not started.


## Part 38 real deployment execution

Part 38 inspected the connected deployment integrations rather than assuming that external infrastructure was absent. An authorized Vercel project linked to `FRANK12517/EduTrack` and the public domains `www.edutrackgh.online` and `edutrackgh.online` were discovered and tested. The live landing page returned HTTPS 200, but the deployed `/api/health` and `/api/auth/session` routes returned Vercel 404 responses. The Vercel project reports Node.js 24.x, while EduTrack requires Node.js 22, and the deployed commit does not match the local release candidate.

The live response also exposed `access-control-allow-origin: *`, so the connected deployment fails the exact-origin security requirement. Part 38 therefore does not push the dirty local tree or relabel the static deployment as a complete production release. See `PART38_EXTERNAL_RESOURCE_DISCOVERY.md`, `PART38_REAL_DEPLOYMENT_EXECUTION_REPORT.md`, `PART38_PRODUCTION_GATE_RESULTS.json`, `PART38_DEPLOYMENT_EVIDENCE_MATRIX.md`, and `PART38_OPERATOR_NEXT_ACTIONS.md` for the verified evidence and remediation sequence. Part 39 was not started.
 