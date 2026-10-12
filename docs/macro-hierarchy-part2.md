# Part 2 — enforce the existing School–District synchronization gateway

Continues Part 1 in the same files and existing EMS_SYNC → server consent → schools/audit_events path. No additional toggle, API, table, synchronization queue or dashboard is introduced.

## Endpoint and consumer trace

| Existing surface | Enforcement |
| --- | --- |
| `/api/school-district-sync` | Part 1 endpoint extending EMS_SYNC. Assigned, active Headteacher plus schools.manage; server-resolved School ID; persisted consent and audit transaction. Other roles cannot POST. |
| `/api/control-panel/summary`, `/api/control-panel/export.csv` | Existing multiSchoolSummary; gate applies in SQL before aggregation. Memberships constrain District/Region/National root and explicit school assignments. |
| `/api/ai/request`, `/api/ai/briefing`, `/api/ai/tool` | Existing aiBuildScopedFacts routes administrative school metrics through multiSchoolSummary. Singular/plural ID scopes and all active memberships are collected. |
| `/api/ai/narrative` | Administrative level comes from role. Eligible school selection plus an independent consent predicate in published-results and attendance queries. Class/student overrides cannot turn this into an ungated administrative query. |
| Academic configuration, subjects, attendance, examination types/examinations/components, scores, published results, reports, promotions, mock examinations/components/scores, teacher attendance | Existing GET routes now use scopedSchoolRows in the existing relational read layer. Consent plus canonical jurisdiction is applied before GROUP BY, ORDER BY and LIMIT, including when request filters are omitted. |
| School, staff, student and class lists | Same SQL gateway; existing role/resource permission checks remain required. School-level behavior is preserved. |
| Result-slip and broadsheet drill-down, signatures, school subscription/population reports, school-scoped hostel/transport/admissions operations | Existing authorization middleware resolves requested School ID through persisted consent and District → Region → National relationships. Class/student and other resource scope checks still apply. Consent is not an extra permission grant. |
| School-linked private files | Existing owner/resource restrictions plus the synchronization gate for administrative actors. No broader file access is granted. |
| Legacy bearer `/api/config` and `/api/students` | Existing assertSchool guard now rejects macro levels using the shared administrative-level resolver. Legacy School users retain their School-code checks; macro officers cannot use a legacy token to bypass canonical consent/RBAC. |
| Communications/chat | Explicit school scope is required for macro actors. Legacy campaign-history reads do not have a school-safe read contract, so macro access remains denied. Existing school-level paths remain intact. |
| Public admission selection/catalogue | Intentionally retains public institution/class selection metadata needed for admissions. Does not provide student records or operational counts. |
| Super Administrator/developer administration | Existing platform management and security/billing audit access remains separate from education-level rollups; control-panel aggregation itself remains consent-gated. |
| Sports/institutional-support modules | Existing legacy browser modules were found, but no canonical server sports/support reporting endpoint or table was found. Retired macro dashboards remain retired. No fictional backend, duplicate dashboards or invented datasets were added. Future school-originated reporting must use the same eligibility helper. |

## Semantics and boundaries

OFF removes a school from subsequent operational queries at every macro level, including direct API calls and existing report snapshots. School records and historical/audit entries are preserved; already-downloaded exports cannot be recalled. ON makes information eligible only within the persisted hierarchy and the requester's administrative jurisdiction, subject to existing resource permissions. It does not grant access to private files, pupil details or class/student scope by itself.

The server re-reads eligibility per request; no long-lived eligibility cache is introduced. Query helpers apply the predicate again within the SQL statement rather than trusting browser state. A request that already completed before revocation is historical; subsequent requests evaluate the new state. Part 2 requires no database migration beyond Part 1's additive migration 26.

`macroSchoolFilter`, `macroSchoolContext`, `scopedSchoolRows`, `synchronizedSchoolPredicate`, `multiSchoolSummary`, and `verifiedNarrativeAnalytics` are extensions of the existing `db/relational.js`, not an independent synchronization service. Administrative authorization stays in `app/auth/authorization.js`. The Headteacher control remains EMS_SYNC in `index.html`.

The Headteacher mutation checks both the explicit school assignment and the School's tenant against an active membership. A mismatched tenant plus a forged/misconfigured school ID cannot enable sharing. Communication audience selection also bounds the outer child relation to the requested school/class, so a parent associated with two schools does not expose the other child. No messages were sent during validation.

An unavailable or ambiguous response to a toggle displays “Status not verified”; it does not claim the server changed state. New local transmissions remain blocked until status can be verified. The existing durable server audit is the record of committed changes.

## Actual validation results

`npm run test:macro-hierarchy` passed, including:

- Part 1's 15 role/level scope and permission cases, Headteacher assignment checks, audit transaction rollback, additive-migration failure/retry tests, and actual EMS_SYNC JavaScript execution with controlled responses.
- Real HTTP requests through `api/index.js` → `server.js` → the existing authentication/authorization middleware and relational service functions. The Headteacher signs in through `/api/school-login` and uses the resulting cookie for consent changes; other actors use seeded session fixtures. Actual relational session hydration runs on subsequent requests. Invalid codes and inactive credentials are rejected. Authorization decisions and aggregation responses are not mocked. SELECT/UPDATE statements execute against a disposable in-memory SQLite adapter. The adapter only substitutes connection transport, schema setup, transaction interfaces and MySQL `FOR UPDATE` syntax; it is not a TiDB DDL/concurrency compatibility test.
- OFF → ON → OFF across District, Regional and National summaries, 16 unfiltered list/report endpoints, examination/mock component drill-downs, authorized class-scoped mock scores and score-based broadsheets, CSV export and narrative analytics. OFF leaves Headteacher access to the school's roster and Permanent Student IDs intact.
- All 15 core macro roles, Teacher, Parent, Student and Super Administrator denied consent changes. Wrong-school Headteacher, mismatched-tenant Headteacher, cross-District and cross-National-root requests denied. Missing resource permission, missing personal class/student scope, bad origin and non-boolean state also denied.
- Legacy macro bearer requests denied while the legacy Headteacher school-config read still works. Existing audit rows contain school, actor, previous/new state and timestamp. Revocation preserves all seeded student and published-result records. A parent linked to two schools does not expose the other child's ID through audience selection.

Other passing checks: repository `npm run check`, additional legacy/preflight syntax checks, AI authorization, login routing, School sidebar, administrative dashboard separation, its desktop/mobile browser test, subscription pricing, production read-route gate, and `git diff --check`.

One broader browser regression remains unresolved: `test/protected-features.spec.js` initially could not launch its hard-coded `/usr/bin/chromium`; a rerun with Windows Chrome launched but timed out tapping the Regional login card. This test is not reported as passing, and no baseline comparison was performed. Its unrelated login/registration UI assertions were not rewritten to force a pass.

Validation ran on local Node 25.6.1; the repository deployment engine is Node 22.x. No live TiDB connection, production migration/preflight, deployment, or production login test was performed. Migration 26 and live data reconciliation remain rollout requirements.

## Existing deployment compatibility boundary

Tracing found that the deployment adapter routed `/api/school-login` to the legacy JWT handler, while `school-login-boot.js` expects the canonical server's authenticated/session response shape. The adapter now sends that existing route to the canonical handler. In relational mode, the handler resolves the active staff/school relationship and subscription from the existing tables and persists sessions/audit through the existing relational services. Compatibility JSON mode and the legacy `/api/login`, `/api/config` and `/api/students` routes remain available. EMS_SYNC recognizes both canonical uppercase and legacy display-case Headteacher role names. No second authentication or session system was introduced.

The HTTP matrix verifies School login through the deployment adapter, subsequent relational session hydration, and consent changes using that fresh cookie. The existing Part 39 deployment-adapter checks also pass. Production login still requires deployment validation with live TiDB and subscription records.

## Part 3 continuation

Extend these existing services and role metadata. Supply resolved server authorization to administrative school queries; do not accept display names or browser-provided role/scope objects as authority. Preserve the existing retired-dashboard state until a later part explicitly changes it. Do not add Regional/National school-sharing switches or copy consent into a separate table.
