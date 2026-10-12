# Macro-administrative hierarchy — Part 1

## Discovery recorded before implementation

The application is an existing static/vanilla JavaScript application, primarily in `index.html`, with Node HTTP services in `server.js`. `api/index.js` is the deployment adapter; it delegates legacy login/config/student operations to `api/legacy.js` and other routes to the existing server. `edutrack-cloud.js` persists school config/student data; `edutrack-cloud-sync.js` is its button/connectivity bridge. Neither is the School–District consent authority.

School General Dashboard, parent and student portals, and legacy administrative modules live in `index.html`. `school-sidebar.js` is the current School sidebar; `school-module-loader.js` and `school-login-boot.js` support loading. Existing inline navigation/search registries and `emsRouteAfterLogin` remain canonical. `admin-dashboard-separation.js` currently removes District/Regional/National shells and renders an unavailable notice. Part 1 must not recreate or re-enable them. Super Administrator/developer entry and session bridging use `privileged-auth.js` and server authentication. Register/Renew/Subscription UI remains in `index.html`, with server payment routes, `app/subscription-policy.js`, `app/subscription-entitlements.js`, and the existing payment/subscription tables.

## Existing synchronization

The canonical school control is `EMS_SYNC` (v138) in `index.html`: `openToggleConfirm`, `confirmToggle`, `isHeadteacher`, approval selection, and manual synchronization. `isHeadteacher` checks the School session and Headteacher role. `ems_sync_settings_v138` contains `enabled` (default false), circuit/EMIS metadata and last-sync timestamps. History/audit use `ems_sync_history_v138` and `ems_sync_audit_log`; notifications use the shared notifications store. These are localStorage records, not immutable server audit records. The local audit is capped at 1,000 entries.

`P2B_SYNC` separately uses `ems_p2b_sds_enabled` to activate the legacy framework; it is not Headteacher authorization. Legacy District/Regional/National centers consume local logs and name-based registries. No relational School–District consent field/table or server consent API was found. The required extension is server persistence for the existing EMS_SYNC control, not another synchronization engine or queue. Browser flags must never grant server aggregation access.

## Roles and hierarchy

`app/auth/administrative-scope.js` resolves dashboard levels; `app/auth/authorization.js` checks account, role, permission and ID scope. `db/relational.js` resolves `users`, `credentials`, `roles`, `permissions`, `role_permissions`, `user_roles`, `tenants` and active `tenant_memberships`. Existing role names include NATIONAL_ADMIN, REGIONAL_ADMIN and DISTRICT_ADMIN. UI officer labels are more numerous than the canonical server seed. Category membership must not automatically grant permissions.

`regions.id` → `districts.region_id` → `schools.district_id` is the existing relational cascade. District region membership is mandatory; school district membership is nullable with ON DELETE SET NULL for legacy compatibility. `tenants.parent_id` already provides a general hierarchy; National is currently a logical scope, not a dedicated table. Permanent student IDs are `students.student_identifier`; admission finalization also records `permanent_student_id`. Preserve all these IDs.

## Reporting and extension points

`db/relational.js:multiSchoolSummary` supplies control-panel summary, CSV export and administrative narrative scope. It currently filters by administrative membership but not synchronization consent. `verifiedNarrativeAnalytics` reads published results and attendance; `server.js:aiBuildScopedFacts` performs additional scoped counts. These existing consumers require the consent gateway, including direct analytics calls. School-level consumers must remain independent of consent.

Extend the existing administrative-scope/authorization modules, relational migration mechanism, server routes, and EMS_SYNC functions. Reuse `audit_events` for durable consent changes. Do not add dashboards, sidebars, login systems or synchronization queues.

## Migration plan and compatibility risks

Use an additive versioned migration in the existing relational migration runner: persist EMS_SYNC consent on `schools` with default OFF and actor/time metadata; link regions to the existing National tenant through a foreign key; seed missing functional roles without copying administrative permissions. Keep existing role IDs and assignments. Existing null school district IDs require explicit reconciliation, not guessed name-based backfills; reject newly introduced null memberships and exclude unresolved schools from rollups. Do not change or delete student IDs.

No database connection configuration is present in this execution environment. The checked-in TiDB schema and migration implementation were inspected; live schema/data and live migration execution are unverified. Existing browser ON settings cannot safely be imported as server authorization: the Headteacher must confirm through the existing control. OFF or absent consent must exclude school information at all upper levels. Offline setting changes cannot claim server success. Legacy local reports and historical snapshots are not authoritative server data. Existing DDL uses implicit commits, so an additive migration must be retry-safe and must not silently swallow errors.

Part 2 must extend this implementation and the existing retired-dashboard integration points, retain separate resource permissions for each role/level, and avoid importing legacy name-based records or local browser flags as authorization.

## Implemented Part 1 contract

- Migration 26 (`migrateMacroHierarchy`) runs through the existing relational migration runner, after the existing version-25 migrations/repairs. It adds `regions.national_tenant_id`, referencing the existing `tenants` table, reuses one active National root or creates `edutrack_national` if none exists, and rejects ambiguous roots. Existing Region/District/School identifiers are unchanged.
- The existing school table now persists `district_sync_enabled` (default false), `district_sync_actor_id` (user foreign key), and `district_sync_updated_at`. Consent changes and `SCHOOL_DISTRICT_SYNC_CHANGED` audit records commit in one transaction. Only an active assigned Headteacher with `schools.manage` can change consent. Enabling requires valid District/Region membership; disabling remains possible when that membership needs repair.
- `GET/POST /api/school-district-sync` are the server extension of EMS_SYNC. Scope comes from active authenticated memberships, never a display name. A single assigned school is selected automatically; explicitly requested School IDs must be assigned. Other school staff can read status with `scope.read`; only the Headteacher can POST. Missing authority or offline requests cannot enable sharing.
- EMS_SYNC retains its controls, approvals, history and manual synchronization flow. It reads server status on entry and before manual sync; toggle changes wait for server success. The legacy P2B switch delegates to EMS_SYNC instead of creating independent consent. Historical browser records remain intact. The security audit wrapper now awaits the asynchronous attempt and no longer labels every return a successful transmission.
- `multiSchoolSummary` gates control-panel summary/CSV and administrative AI facts with the same consent predicate, using District and Region IDs. `verifiedNarrativeAnalytics` independently gates both result and attendance queries. Administrative narrative level is derived from the authenticated role, so a caller cannot request school-level analytics to bypass consent. School-level analytics remain available while synchronization is OFF.
- `CORE_ROLES` extends `app/auth/administrative-scope.js` with the five categories for each of three levels. Existing `*_ADMIN` identifiers retain their assignments and permissions. New director/support/examination/sports roles are seeded without permission grants. Existing National administrators receive the canonical National membership, preserving their former nationwide scope. Authorization checks the selected role's resource grants rather than borrowing another role's grants, and rejects missing administrative scope or conflicting administrative level.

| Category | District suffix | Regional/National suffix |
| --- | --- | --- |
| Director of Education | DIRECTOR_OF_EDUCATION | DIRECTOR_OF_EDUCATION |
| Administrator | ADMIN | ADMIN |
| Institutional support | SISO | INSTITUTIONAL_SUPPORT_OFFICER |
| Examination Officer | EXAMINATION_OFFICER | EXAMINATION_OFFICER |
| Sports Officer | SPORTS_OFFICER | SPORTS_OFFICER |

Prefix each suffix with DISTRICT_, REGIONAL_, or NATIONAL_. REGION is accepted as a level alias; existing REGIONAL runtime values remain compatible. Category metadata is not a permission policy.

The legacy `api/legacy.js` config route still uses name-based columns and a different school-column shape. This is a pre-existing compatibility risk; it was not rebuilt or used as consent authority. The checked-in canonical `db/schema.sql` is an inventory, while the migration runner is the supported upgrade path. Existing installations may use a different National tenant ID as the region-column default.

## Deployment and continuation

Run the existing read-only production migration preflight against the intended deployment before rollout. It now reports unresolved School/District/Region relationships, National root count and presence of server consent columns. Resolve ambiguous roots and unassigned schools using verified IDs; never guess from school/district display names. The migration preserves legacy nullable school district fields rather than destroying or guessing existing relationships; unresolved schools cannot aggregate. Existing canonical school creation already requires and validates District/Region IDs. Full live-data conformity cannot be certified without the preflight and reconciliation.

Apply the normal controlled migration before serving the updated code; the existing `ensureInitialized` path also invokes migrations on first database use. Do not auto-import browser ON flags. Have each Headteacher confirm consent using the existing control. Revocation excludes subsequent upper-level queries; it does not delete previously exported files or historical browser logs. Preserve additive columns and audit records during application rollback; rolling back the reporting guard would restore the old governance gap.

Part 2 should consume the existing summary service and role metadata, assign explicit approved resource permissions to officer roles, and continue from the current dashboard-retirement state. It must not recreate consent tables, queues, sidebars, or authentication. No production data or identifiers were deleted, reset, truncated, or migrated during this task.

## Validation

Passed locally: `test/macro-hierarchy-part1.spec.js` (15 role/level combinations, scope/permission denial, SQL gateway checks, Headteacher assignment, revocation, audit rollback and migration retry/error behavior), `test/macro-hierarchy-sync-ui.spec.js` (executes the actual EMS_SYNC script with simulated server responses), existing AI authorization, login routing, School sidebar, and administrative dashboard separation tests. The existing desktop/mobile browser separation test passed. `npm run check` passed.

Database tests here use a controlled query/transaction double; they are not evidence of TiDB SQL execution, production data reconciliation, query performance, or a live authenticated end-to-end consent change. No live migration or production preflight was executed because connection configuration is unavailable.

Part 2 adds HTTP/SQL coverage and records the unresolved broader protected-feature browser test and the existing deployment login-adapter split in `docs/macro-hierarchy-part2.md`. Consult that continuation for the final combined validation status; no claim is made that all existing browser regressions pass.
