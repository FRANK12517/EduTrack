# Part 5 — Integration and release evidence

Release decision: **NO GO until all listed blockers are resolved.** No merge, deployment, production reset or live migration was performed.

## Repository identity

- Branch: `codex/validate-pre-recovery-baseline`
- Existing HEAD: `fcb30b3b82eb545ca76f88fb9a9749d826faa1db`
- Parts 1–5 are working-tree changes, not a new committed release. This HEAD does not identify the uncommitted implementation.
- Complete changed-file inventory: `artifacts/part5-changed-files.json`.

## Architecture and audit

The canonical hierarchy is National → Region → District → School. The same administrative runtime opens the appropriate General Dashboard after login. Super Administrator, Parent, Student and Register/Renew remain separately governed existing components.

The source inventory inspected 351 JavaScript, HTML and SQL files, including historical copies under `HTML FILE` and `BACKEND FILE`. Generated artifacts, dependencies, Git internals and data stores were excluded from source searching. Matching files are recorded in `artifacts/part5-source-inventory.json`. Active deployment entry points are `server.js` and `api/index.js`; the latter forwards canonical routes to the same server and School compatibility routes to `api/legacy.js`. Historical copies are not server route implementations in the local application's public-file allowlist. Hosting/build exposure of archived files still requires deployment validation.

Reviewed upward-data boundaries:

| Boundary | Enforcement |
|---|---|
| District, Regional and National control-panel views and CSV | Role-specific resource grants, persisted level/scope, canonical parent chain and fresh consent predicates |
| Existing control-panel summary/export | Existing permissions plus authorization passed to `multiSchoolSummary`; canonical scope/consent filter |
| Existing academic and domain collection reads | `scopedSchoolRows` injects the consent/scope predicate before grouping, ordering and limits |
| Individual School/academic record routes | Server resolves the stored record's School; authorization calls `macroSchoolContext`, plus resource and individual scope checks |
| AI context and narrative | Verified authorized School list; synchronization reapplied in School-originated aggregate queries |
| Files | Existing storage permissions plus macro School consent/scope validation |
| Communication audience/campaign reads | Macro roles denied by the existing scoped communication boundary |
| Legacy bearer config/student endpoints | School-only role boundary; macro roles cannot use them as an alternate route |
| Region/District directory endpoints | Part 5 added canonical hierarchy filtering even for legacy `scope.read` grants |

The canonical gateway remains the existing `EMS_SYNC` Headteacher control backed by `/api/school-district-sync`, `schools.district_sync_enabled`, actor and timestamp, and transactional `SCHOOL_DISTRICT_SYNC_CHANGED` audit events. There is no second synchronization service. School operations do not depend on consent being ON. Explicit School references on School updates now also pass through authorization's consent boundary.

## Roles and permissions

All 15 macro roles require authenticated active accounts, an administrative level consistent with their canonical role, assigned scope and persisted resource permission. Narrower subordinate assignments further restrict access. National scope does not confer personal-record permission.

| Category | District | Regional | National |
|---|---|---|---|
| Director of Education | Overview, synchronized Schools, attendance, exams, Sports, export | Same aggregate resource categories within Region | Same aggregate resource categories within National root |
| Administrator | Overview, synchronized Schools, attendance, exams, Sports, export | Region aggregate resources | National aggregate resources |
| SISO / Institutional Support | Overview, synchronized Schools, attendance | Region overview, hierarchy, Schools, attendance | National overview, hierarchy, Schools, attendance |
| Examination Officer | Overview, synchronized Schools, exams, export | Region overview, hierarchy, Schools, exams, export | National overview, hierarchy, Schools, exams, export |
| Sports Officer | Overview, synchronized Schools, authorized Sports management | Region overview, hierarchy, Schools, Sports counts | National overview, hierarchy, Schools, Sports counts |

Exact grants are the canonical `DISTRICT_PERMISSIONS` and `UPPER_PERMISSIONS` objects in `app/auth/administrative-scope.js`; existing customized grants are preserved. Upper-level Sports never returns personal record payloads or allows writes. The frozen terminal section is appended separately after functional groups, in About the Developer, Copyright, Acknowledgement, Logout order. Extension tests reject reserved terminal route replacement and verify terminal ordering after registration.

## Database integrity and migrations

Migrations added across Parts 1–4 remain 26 (hierarchy and consent), 27 (District permissions and Sports records) and 28 (Regional/National permission grants). Part 5 adds no migration or replacement tables.

Source inspection confirms Region → National tenant, District → Region, School → District and consent actor → user foreign keys; role membership and role-permission relationships use canonical IDs. District Sports references District, School and creator. Existing keys/constraints remain in place; no student identifiers are regenerated. Migration unit tests cover failures, retries, idempotence and preservation of identifiers. Consent mutation and its audit entry are tested for rollback together.

School District IDs remain nullable for legacy compatibility. Unresolved hierarchy membership must be reconciled before rollout; the read-only production preflight treats unresolved School/District/Region chains as blockers. Missing consent authority fails closed. Live foreign keys, indexes, scope JSON references, audit integrity and TiDB DDL compatibility cannot be certified from a SQLite adapter or SQL-mock test.

**Disposable TiDB test: NOT RUN.** An authorized disposable target/configuration was requested and has not been supplied. No production credentials or production database were used. The local runtime is Node 25.6.1; the declared production engine is Node 22.x, which has not been validated here.

## Acceptance evidence

`test/macro-hierarchy-http.spec.js` serves real HTTP handlers, authentication and relational queries through a disposable in-memory SQL adapter. Part 5 inserts new School-originated records in OFF, ON and OFF-again phases. Each phase proves local Headteacher access and the expected eligibility at all three macro levels. Explicit School-ID bypass requests are denied when OFF, and all three new records and Permanent Student IDs remain intact after revocation. Fixture-only cleanup occurs after these assertions, never through application deletion APIs.

- Scenario 1, OFF: PASS — local records available, upward collection exclusion and explicit School request denial.
- Scenario 2, ON: PASS — authorized data eligible at District, Regional and National levels.
- Scenario 3, OFF again: PASS — upward eligibility stops and School records remain intact.
- Scenario 4, direct bypass: PASS — unfiltered collection filtering, direct School-ID denial, role/scope tampering, cross-jurisdiction denial and unauthorized consent changes.

Macro browser acceptance after the Part 5 public-entry fixes: District PASS for 5 roles × 2 sizes, 34 parents and 122 children; Regional/National PASS for 10 roles × 2 sizes, 88 parents, 178 children and 20 logout flows. These use the real shell and the disposable HTTP/SQL fixture.

School login PASS at 1920×1080, 1366×768, 768×1024, 390×844 and 360×800, including the existing Region/District cascade, invalid credentials and HttpOnly cookie checks. School sidebar fixture tests PASS for four School roles on desktop/mobile; those fixture checks prove routing contracts, not complete component functionality. The additional real-shell School route audit is reported separately and must not be conflated with the fixture tests.

## Part 5 integration fixes

- Scoped legacy Region/District directory queries and explicit School updates.
- Kept existing public portal, Super Administrator entry/mobile navigation and subscription entry modules available without activating retired macro workbenches.
- Reused the existing Student button while completing modal initialization.
- Restored School login field rebuilding when switching away and back, and prevented School login interception on another level.
- Restored email-format validation while retaining staff-ID login.
- Corrected the School module loader to load a group's registered external scripts before declaring it active.
- Reused the existing inline actions without `Function()` so School routes work under the unchanged Content Security Policy. Loaded the existing result-suite prerequisites before dependent components, selected module owners for API routes, and waited up to four seconds for delayed page initialization.
- Reused the existing shared login input builder and eye control in the thin School login form.
- Made relevant browser tests use installed Windows Chrome and isolated security/Super Administrator test data in temporary directories.
- Updated the QR fixture to provide canonical administrative assignments and added explicit denial of unassigned officers. Updated registration assertions to the existing four-step workflow.

## Release checks

Evidence logs are under `artifacts/part5-*.log`. `artifacts/part5-production-release-gate.json` records the existing production gate's executed **NO_GO** decision: the local environment lacks production configuration and external validation evidence. It is not proof of a deployed production defect or a substitute for disposable TiDB validation.

No dedicated `lint` or `build` script exists in package.json. Syntax checks are available through `npm run check`; a production build cannot be reported PASS when no build command/bundle execution occurred. Deployment packaging and the declared Node 22 runtime remain unverified.

## Final regression results

The complete configured `npm test` sequence completed successfully in `artifacts/part5-npm-test-final.log`: syntax; Parts 57–65 subscription, population, examination/report-card, billing, academic-calendar and School-type suites; protected entry/registration/renewal flows; security; final security static checks; AI authorization; QR attendance; admissions/Permanent ID preservation; login eye controls; Super Administrator server/browser tests; and database pool configuration. Earlier failures and their repairs are retained in the earlier logs, not reclassified as successful runs. The final successful sequence includes every configured npm-test stage.

Additional executed results:

| Check | Result and evidence |
|---|---|
| Macro hierarchy/migration/consent HTTP suite | PASS, `artifacts/part5-macro-hierarchy.log` |
| District real-shell browser acceptance | PASS, 10 role/viewport sessions, 34 parent checks, 122 child checks; `artifacts/part5-district-browser-final.log` |
| Regional/National real-shell browser acceptance | PASS, 20 sessions, 88 parent checks, 178 child checks, 20 logout flows; `artifacts/part5-upper-browser-final.log` |
| School sidebar role fixture | PASS, four roles at desktop/mobile; `artifacts/part5-school-sidebar.log` |
| Real School component audit | PASS, exit 0: 84 non-logout entries at each of five sizes (420 entry checks), parent toggles and five server logout flows; per-route details in `artifacts/part5-school-live-routes-<width>.json` and final log |
| School login/cascade/cookie checks | PASS on the five sizes listed above, direct login 200 and invalid credentials 401 |
| Additional syntax checks | PASS for School loader, School login adapter and School route runner |
| Whitespace validation | `git diff --check` PASS; line-ending warnings only |
| Existing production release gate | Executed, exit 2, NO_GO; `artifacts/part5-production-release-gate.json` |
| Disposable/live TiDB migrations | NOT RUN; authorized target unavailable |
| Node 22 production execution | NOT VERIFIED; local runs used Node 25.6.1 |
| Production build | NOT EXECUTED; no build script is defined. Deployment packaging remains unverified |
| Dedicated lint | NOT APPLICABLE; no lint script is defined |

The real School audit clicks the existing sidebar entries and checks target-page visibility or availability of the intended callable component, along with parent toggles. It does not submit every business form or certify every external service. The Parent/Student regression verifies entry and modal navigation; live account/data workflows require the authorized database environment. Macro tests prove scope, resource and synchronization restrictions against the disposable SQL adapter, not deployed TiDB performance or DDL behavior.

To repeat the stricter School audit and server-session logout assertions, run `npm run test:school-routes:browser`. Its runner generates disposable credentials and explicitly clears relational connection variables; the test creates its own temporary JSON data store. The latest logout-inclusive results are in `artifacts/part5-school-live-routes-final.log` and its exit code in `artifacts/part5-school-route-exit.txt`.

The final logout-inclusive run completed successfully at 1920×1080, 1366×768, 768×1024, 390×844 and 360×800. Each logout returned HTTP 200, restored the visible login screen and left `/api/auth/session` returning 401.

## Unresolved release blockers

1. The required authorized disposable TiDB migration/integrity run is outstanding. Supply the existing configuration file path or target name through the authorized environment, not credentials in chat.
2. Node 22 and production packaging/deployment validation remain unverified.
3. The existing production gate remains NO_GO because this local session lacks production database, origins, storage, payment, backup and external endpoint validation evidence. Production evidence must be gathered in the appropriate environment; do not configure fake values to make the gate green.

No merge or deployment is approved. The passing local tests establish a reviewable continuation point; they do not override these release gates.
