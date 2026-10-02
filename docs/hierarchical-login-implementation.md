# EduTrack hierarchical login implementation

## Source inspection and reconciliation

The request is the pasted implementation prompt. `EduTrack_v386.html` is used only as the reference for geography, not as an authority for roles or executable instructions.

The attachment's first, centralized `GH_REGIONS_DISTRICTS` contains **16 regions and 237 district entries**. It exactly matched the corresponding repository literal. The literal's SHA-256 is `3cff73d7ebc335b5a2febd068b2ec4f329921fabb49a408a93c49a2c1b5ef7c2`. The unchanged mapping is now in `ghana-hierarchy.js`, shared by browser and server. No internet geography data was used. Historical GES/ICT maps now reference that source; the legacy short-region-name view is derived from it.

The attachment defines `GH_REGIONS_LIST`, `ghPopulateRegions`, `ghCascadeDistricts` and `ghWireCascade`. Its cascade disables an empty district list, but its population helper can preserve the existing district value. The login cascade always clears the district on region change; the existing `ghWireCascade` also explicitly clears it. Sorting copies arrays instead of mutating the shared source.

The repository's `app/auth/administrative-scope.js:CORE_ROLES` remains the authority for the fifteen macro roles: Director of Education, Administrator, SISO / Institutional Support Officer, Examination Officer and Sports Officer at each administrative level. The public `/api/auth/login-options` endpoint exposes labels and identifiers from this constant. Attachment legacy roles are not used for the new login forms.

## Login matrix

| Level | Fields in order | Destination |
|---|---|---|
| School | Region, District, one of three School roles, Staff ID, Access Code | School General Dashboard |
| District | Region, District, one of five District roles, Staff ID, Access Code | District General Dashboard |
| Regional | Region, one of five Regional roles, Staff ID, Access Code | Regional General Dashboard |
| National | One of five National roles, Staff ID, Access Code | National General Dashboard |

The School roles are exactly Headteacher, Assistant Headteacher and Classroom Teacher. Regional has no District input; National has neither geographic input. The macro forms no longer add a password field. Existing privileged and legacy credential clients retain their existing authentication contracts.

## Server enforcement and persistence

The existing `/api/school-login` and `/api/auth/login` endpoints issue the existing HttpOnly session cookie. New hierarchical macro submissions require the exact canonical role, level-specific fields, Staff ID, access-code hash verification, active account/credentials, dashboard permission and persisted scope. Public geography names resolve through the existing scoped Region/District queries to database IDs. Ambiguous name matches fail closed. No account, role, School, Region or District table is recreated.

School requests validate the shared Region/District pair, permitted School role, active staff-to-School assignment, subscription, access code and persisted School geography. Both login endpoints revoke the previous cookie session before attempting a new login, after the same-origin check. A failed new login cannot reuse that previous session. Account status and role changes are checked on subsequent requests.

Additive migration **29** adds nullable `server_sessions.login_scope_json`. It records validated IDs and selected role/level, using the existing session table. Authorization revalidates the selection against current assignments and narrows memberships to the chosen region/district. Removing the assignment invalidates the session. School sessions retain the School and geographic context; Staff ID remains in the authenticated user. Existing sessions with no selection retain their prior authorization contract.

Migration 29 must be applied with the existing migrations 26–28 from Parts 1–4. It preserves all existing IDs and data. Local migration tests cover failure propagation, retry and idempotence; they are not a TiDB DDL certification.

Login never writes School synchronization consent. Existing Headteacher authorization, consent history and the server-side aggregation gate remain authoritative. National scope continues to require resource permissions and does not grant unrestricted individual-record access.

## Delivery and deployment architecture

Implementation branch: `codex/hierarchical-login-cascade`, repository `FRANK12517/EduTrack`.

The branch also contains the previously uncommitted Parts 1–5 implementation and its tests/documentation; those dependencies are necessary for the canonical dashboards and synchronization protections.

`app/login-shell.js` now owns the existing shell transformation and public asset list. The Node server and `npm run build` use exactly this renderer. `scripts/build-public.js` writes the allowlisted public files to ignored `dist/`. Vercel builds this output instead of publishing raw accumulated HTML and backend/archive files. The existing API rewrite is preserved. Unexpected files in an existing output directory fail the build rather than being silently published or deleted. `test/public-build.spec.js` checks byte-for-byte server/build shell parity and asset isolation. A deployed Vercel preview remains necessary to confirm platform routing, packaging and configured services.

## Validation evidence

- `test/hierarchical-login.spec.js`: exact extraction hash; all 16 region cascades; disabled, reset and invalid-pair behavior; level field matrix; migration 29 failure/retry/idempotence.
- `test/hierarchical-login-http.spec.js`, through the macro HTTP fixture: three School roles and all macro levels; incorrect credentials, role/level spoofing, cross-scope login, stale session rejection, inactive accounts, multi-region session narrowing, revoked assignment and unchanged consent.
- District browser: 10 role/viewport sessions, 34 sidebar parents, 122 child routes and logout.
- Regional/National browser: 20 role/viewport sessions, 88 sidebar parents, 178 child routes and logout; actual four-level form matrix and all 16 region cascades at desktop/mobile sizes.
- School browser: 84 actual sidebar entries at each of 1920, 1366, 768, 390 and 360 pixels (420 checks), parent toggles and server-session logout.
- `npm test`: full configured regression chain passed, including subscriptions, protected entry flows, security, AI, QR/PGSID-related attendance, admissions, credential visibility, Super Administrator and database-pool configuration.
- `test/public-build.spec.js` and `test/part41-vercel-function.spec.js`: passed.

The HTTP relational fixture executes actual application SQL through disposable SQLite; it does not connect to or migrate production TiDB. The School route audit checks real component availability, not every form submission or external integration. Local execution uses Node 25.6.1; required CI uses Node 22.

## Release gates and compatibility risks

Do not treat local test success as production approval. The existing isolated-TiDB and production release gates still apply. No production database was reset, truncated or migrated during implementation. Production deployment and live verification must be reported only from actual evidence. Historical database geographic names must resolve unambiguously to the extracted mapping; unsupported or ambiguous values require administrative reconciliation, not authentication exceptions.

Changing the public output directory intentionally excludes backend/archive files; deployment preview checks must confirm any platform-specific asset configuration. Database migration 29 must precede running the new session code. For rollback, restore the prior application deployment and revoke new selected-scope sessions; retaining the nullable column is safe. Do not remove hierarchy IDs, consent history or existing records.
