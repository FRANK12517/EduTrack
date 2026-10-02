# Part 4 — Regional and National General Dashboards

## Discovery and intended extension

Parts 1–3 provide one administrative runtime in `admin-dashboard-separation.js`, canonical role metadata and authorization middleware, the existing `/api/control-panel` route family, and consent-gated relational services. District is active; Regional/National are intentionally retired pending this part. Existing browser-local higher-level workbenches cannot be treated as authoritative reporting sources.

Extend this same runtime with level-specific navigation and first-login routing. Extend the existing control-panel API family and relational helpers. Retain District routes, Sports forms, School routing, cookie sessions and the single Headteacher-controlled consent gateway. Add no new dashboards alongside the canonical runtime, authentication system, synchronization state or reporting tables.

Migration 28 will add explicit Regional/National resource grants to existing roles/permissions tables only. Read-only hierarchy/coverage and aggregate reports are distinct from permissions for individual pupil, staff, athlete or medical records. Higher-level Sports reporting uses counts from the existing Sports table and never returns its personal payloads.

Canonical hierarchy IDs must be validated at each intermediate Region/District boundary, as well as at School drill-down. Explicit subordinate assignments narrow the jurisdiction. Coverage counts active Schools using institution/consent metadata and distinguishes total versus contributing Regions, Districts and Schools, including empty entities.

## Baseline permission matrices

Both levels have explicit, separately stored resource permissions. All ten roles receive their own level's dashboard, hierarchy and synchronized-School-directory reads. This does not grant School management or individual-record access.

| Role category | Regional attendance | Regional exams | Regional Sports aggregates | Regional export | National attendance | National exams | National Sports aggregates | National export |
|---|---|---|---|---|---|---|---|---|
| Director of Education | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| Administrator | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| Institutional Support Officer | Yes | No | No | No | Yes | No | No | No |
| Examination Officer | No | Yes | No | Yes | No | Yes | No | Yes |
| Sports Officer | No | No | Yes | No | No | No | Yes | No |

Existing customized grants are preserved; new baseline grants do not grant write access to District Sports records or access to sensitive individual records. Each API request re-evaluates persisted role permissions and canonical jurisdiction.

## Implemented boundaries and continuation contract

The shared administrative runtime now opens Regional General Dashboard or National General Dashboard immediately after the corresponding authenticated login. It retains the District shell and School routing. Each level has its own functional groups and permission-filtered children. About the Developer, Copyright, Acknowledgement and Logout remain a separate permanent terminal section; extensions are inserted above it and cannot replace its reserved routes. Logout invalidates the server session, clears administrative client state and returns to the login screen.

`GET /api/control-panel/regional` and `GET /api/control-panel/national` extend the existing API family. Views are context, overview, regions, districts, schools, attendance, examinations, sports and export, subject to the level's resource permissions. Parameters use canonical nationalId, regionId, districtId and schoolId. Unknown or duplicate parameters and context-scope overrides are rejected. Requests validate the authenticated level, persisted grants, assigned National root/Region, any narrower subordinate assignments, and the actual parent-child chain. School-specific reports additionally require the School-directory resource permission. These endpoints do not support writes.

`macroHierarchyContext`, `macroHierarchyFilter` and `macroSchoolFilter` in `db/relational.js` share the canonical scope and consent enforcement. Operational queries reapply the existing Headteacher-controlled synchronization predicate. Coverage reads only institution and consent metadata; non-contributing School identities and operational records are not returned. Empty Regions and Districts count toward entity totals. Higher-level Sports responses contain record-type counts, never athlete payloads. Attendance and examination views are aggregate reports, without individual student records.

Migration 28 adds the matrix above to existing permission/role tables using idempotent inserts. It preserves customized grants, all IDs, existing data and the Part 1–3 schema. It creates no new tables or synchronization flags. A failed grant insert does not mark the migration complete; retry behavior is tested. Migration 28 has not been applied to a live TiDB database in this work.

Part 5 must continue from these files and migrations 26–28. Use the same administrative runtime, authorization middleware, control-panel API family, relational queries and Headteacher consent gateway. Review any existing customized production grants during integration; the additive migration deliberately does not revoke them. Production TiDB compatibility, Node 22 execution and the full historical release suite remain release-gate work.

## Verification environment and limitations

Actual results on 2026-09-28:

| Check | Result |
|---|---|
| `npm run test:macro-hierarchy` | PASS: migrations including 28 failure/retry/idempotence, consent UI, real HTTP/SQL authorization and consent tests |
| `npm run test:upper-dashboards:browser` | PASS: all 10 upper-level roles, 20 desktop/mobile sessions, 88 sidebar parents, 178 content children, 20 logout flows |
| `npm run test:district-dashboard:browser` | PASS: all 5 District roles, 10 desktop/mobile sessions, 34 sidebar parents and 122 children; existing Sports forms and consent revocation preserved |
| Upper-level HTTP/SQL acceptance | PASS: 10 role login/permission matrices; empty-entity coverage; canonical intermediate scope; narrower assignments; personal-data denial; parameter tampering; cross-Region/District/National-root isolation; consent ON/OFF; session invalidation |
| `npm run check` | PASS |
| `node test/ai-intelligence.spec.js` | PASS |
| `node test/login-dashboard-routing.spec.js` | PASS |
| `node test/part68-administrative-dashboard-separation.spec.js` | PASS |
| `node test/part68-administrative-dashboard-separation.browser.spec.js` | PASS: administrative authentication boundaries and School routing on desktop/mobile |
| `node test/district-dashboard.spec.js` | PASS: District permission matrix and existing Sports adapter isolation |
| `node test/school-sidebar-restoration.spec.js` | PASS |
| `git diff --check` | PASS (line-ending warnings only) |

The initial upper browser run caught terminal links using the District route prefix on Regional/National dashboards. The links now derive their prefix from the authenticated administrative level; the complete rerun above passed.

The acceptance fixture serves the actual application, authentication middleware, API handlers and relational queries. It substitutes a disposable in-memory SQLite adapter for mysql2; it does not connect to TiDB or alter production data. Browser checks use installed Windows Chrome at 1280 × 900 and 390 × 844. The local runtime is Node 25.6.1, while the declared production engine is Node 22.x.

The complete historical `npm test` suite is not certified by these targeted checks. No deployment, live migration or production release gate was performed. Screenshots are saved under `artifacts/macro-part4-acceptance/`; Regional mobile and National desktop/mobile layouts were visually inspected.
