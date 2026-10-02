# Part 3 — District General Dashboard

## Discovery and implementation boundary (recorded before implementation)

Continue Parts 1–2. The canonical District runtime is `admin-dashboard-separation.js`, loaded by the existing authentication bridge. It currently retires all macro dashboards. Re-enable District only; preserve Regional/National retirement and the School dashboard. Use the existing cookie authentication endpoints and `emsRouteAfterLogin` dispatcher.

Existing District functions include the multi-school control panel, attendance/reporting APIs, examination APIs, DEA browser analytics, SISO browser workbenches and `EMS_DSC` sports module (nine sections). Browser-only dashboards use display-name scopes, local School data and in some cases seeded examples. They cannot be reactivated as authoritative District data sources. Extend the existing relational reporting layer, reuse EMS_DSC's existing renderers/forms with an authenticated data adapter, disable its demo seeding in District sessions, and preserve legacy source/data without treating it as verified consent.

Coverage uses only institution IDs, active state and persisted consent, with no joins to pupil/staff/operational tables. Coverage describes the user's authorized School scope in the selected District. Operational reads use the Part 2 SQL gateway. Drill-down repeats role, permission, District membership, School District and synchronization checks on the server.

Migration 27 adds distinct read-only District permissions in existing role_permissions and a sports-domain records table because no canonical server sports table exists. This is domain persistence for the existing sports module, not another synchronization system. No local demo/history records are automatically imported. School-linked sports records use canonical School/District foreign keys and are excluded when consent is off. Existing role grants are preserved.

The sidebar lives in the existing District runtime. Functional groups and an immutable terminal section are separate; registration only accepts functional groups. Terminal order: About the Developer, Copyright, Acknowledgement, Logout. Server permissions determine visible functions; hidden navigation is not authorization.

## Permission matrix

All five roles: Dashboard, reporting coverage and synchronized School directory.

| Role | Attendance/support | Examinations | Sports read | Sports write | Report export |
|---|---|---|---|---|---|
| Director of Education | Yes | Yes | Yes | No | Yes |
| Administrator | Yes | Yes | Yes | No | Yes |
| SISO | Yes | No | No | No | No |
| Examination Officer | No | Yes | No | No | Yes |
| Sports Officer | No | No | Yes | Yes | No |

These are additive baseline grants. Every request also requires an active account, canonical District membership and the persisted resource permission. Existing customized grants are not deleted.

## Delivered components and canonical extension points

- `admin-dashboard-separation.js`: the one District General Dashboard, existing login/route bridge, permission-filtered functional groups, mobile navigation, permanent terminal section and logout. Regional/National retirement and School restoration remain in the same runtime. District login uses the existing `/api/auth/login` cookie session; the canonical handler now accepts a Staff ID as well as an email address, and still requires password plus access code. The authenticated account determines the role and District scope.
- `app/auth/administrative-scope.js`: five explicit District baseline permission sets. `app/auth/authorization.js` continues to enforce the Part 1/2 role, level, scope and resource checks. No second role or session registry was created.
- `server.js`: existing `/api/control-panel` family extended with `/api/control-panel/district`. GET views are `context`, `overview`, `schools`, `attendance`, `examinations`, `sports` and `export`. POST is limited to `view=sports` and requires `district.sports.manage`, same origin, canonical District/School membership and current consent.
- `db/relational.js`: District context, coverage, attendance/examination reporting and Sports reads/writes reuse `macroSchoolFilter`, `synchronizedSchoolPredicate`, `multiSchoolSummary`, the existing pool and audit table. Sports saves lock the eligible School and write the record/audit in one transaction. Revocation excludes subsequent Sports reads and writes while preserving history.
- `index.html`: reuse the existing EMS_DSC module's nine components and six entry forms. The District adapter supplies verified records and canonical School-ID choices. Demo seeding and browser-local School reads are bypassed in authenticated District sessions; other legacy District modules are unchanged. Refresh, filtering and exports revalidate Sports eligibility. Local demo/history is not automatically promoted to server data.
- Existing About, Copyright and Acknowledgement content is reused. Sidebar extensions have a functional-group registration path; the fixed terminal section is appended separately after all functional groups. Its items cannot be registered as functional routes.

Dashboard coverage counts active Schools in the selected authorized District, narrowed by any explicit School assignments. The coverage SQL uses institution/consent metadata only and returns no unsynchronized School identities. Operational student/staff counts are shown separately and come only from synchronized Schools. Attendance reporting shows register/reporting-day counts; examination reporting shows examination and published-result counts. These are views over existing records, not fabricated completion or performance scores.

## Validation results

All tests below passed locally:

- `npm run test:macro-hierarchy`: Parts 1/2 guards and consent UI, migration 26 behavior, additive migration 27 failure/retry/completed-version behavior, and actual HTTP/SQL checks for Part 3. The Part 3 matrix signs in all five District roles through the deployment adapter, tests the distinct permission grants, verifies 30 total / 20 synchronized / 10 not synchronized, then verifies 19/30 after one School revokes consent.
- `npm run test:district-dashboard`: District resource/scope permission matrix and executable syntax of the actual EMS_DSC module, including isolation from neighboring legacy modules.
- `npm run test:district-dashboard:browser`: actual application shell plus HTTP handler/auth/relational services, using a disposable SQLite adapter. **10 role/viewport sessions** passed: every role at **1280×900** and **390×844**. Tested **34 sidebar parents**, **122 content children**, and **10 Logout flows**; every exposed component was visited. Also tested all **six Sports entry forms at both sizes**, Sports report generation, authorized coverage CSV downloads, extension placement above the terminal section, synchronized School drill-down, cross-District and unsynchronized School URL attacks, unknown routes, session invalidation and reload after logout.
- Repository `npm run check`; explicit syntax checks of District runtime/server/relational code; `git diff --check`.
- Existing deployment-adapter, AI authorization, subscription pricing, production read-route gate, School sidebar and login-routing checks. Administrative separation unit/browser checks retain Regional/National retirement and School restoration. Their former requirement to retire District was intentionally updated for Part 3.
- Desktop/mobile overview screenshots were visually reviewed in `artifacts/district-part3-acceptance/`.

The SQL fixture executes SELECT/UPDATE/INSERT statements; it substitutes the connection/schema/transaction interface and removes MySQL `FOR UPDATE` syntax for SQLite. It does **not** certify TiDB DDL, concurrency, production performance or live credentials. Migration tests use controlled failure/retry doubles. Validation used Node 25.6.1 and Windows Chrome; production targets Node 22.x. The full historical `npm test` suite was not certified: the broader protected-features browser limitation documented in Part 2 was not rerun as part of this acceptance matrix.

## Rollout and Part 4 continuation

No production database was changed and nothing was deployed. Apply and verify migration 26 then migration 27 through the existing migration runner in the deployment environment, reconcile unresolved hierarchy IDs, and verify real District memberships and credentials before rollout. Migration 27 preserves existing customized permission grants; the matrix above describes additive baseline grants, not removal of existing access. It does not automatically create officer accounts or import unverified local Sports data.

Part 4 must extend the same administrative runtime, role metadata, authorization middleware and relational eligibility helpers. Do not add a separate synchronization switch, copy School data into an ungated reporting store, recreate the School dashboard, or append new District modules below the terminal section. Regional/National dashboards remain retired until explicitly implemented. Preserve the District routes, schema migration history and acceptance tests.
