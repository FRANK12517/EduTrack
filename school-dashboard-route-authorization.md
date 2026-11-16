# School dashboard routes and authorization inventory

This inventory records the School-level navigation and the School route allowlist in `school-sidebar.js` and `school-route-history.js`. School accounts share `#/school/dashboard`. The active server session must resolve to a School role and assigned school before any route opens. Module navigation is additionally filtered by the permission returned by `/api/auth/session`; route checks repeat that permission check and protected APIs enforce their own authorization and school scope.

Canonical paths use the target slug in lowercase, with punctuation converted to hyphens. Examples: `page:dashboard` is `#/school/dashboard`; `page:transport-management` is `#/school/page-transport-management`; `api:EDUTRACK_ADMISSIONS_REVIEW.open` is `#/school/api-edutrack-admissions-review-open`. Every sidebar item receives `data-schoolCanonicalRoute`, including unavailable entries, so direct navigation can fail closed with a clear state.

## Enabled route allowlist

| Sidebar item | Target | Required School permission | Canonical route | Registered module or server dependency |
| --- | --- | --- | --- | --- |
| Dashboard | `page:dashboard` | `PUBLIC` plus authenticated School session | `#/school/dashboard` | Shared School General dashboard |
| Switch Language | `api:EMS_I18N.openSwitcher` | `PUBLIC` plus authenticated School session | `#/school/api-ems-i18n-openswitcher` | Existing language switcher |
| User Guide | `guide:school` | `PUBLIC` plus authenticated School session | `#/school/guide-school` | School guide module |
| Online Admission | `api:EDUTRACK_ONLINE_ADMISSIONS.open` | `admissions.view` | `#/school/api-edutrack-online-admissions-open` | Existing online admission flow; its public applicant APIs keep their own validation |
| Admissions Review | `api:EDUTRACK_ADMISSIONS_REVIEW.open` | `admissions.review` | `#/school/api-edutrack-admissions-review-open` | `/api/admissions/review`; server-side permission and school scope checks |
| Transport Management | `page:transport-management` | `transport.view` | `#/school/page-transport-management` | `/api/transport/overview`; server-side permission and school scope checks |
| Hostel Management | `page:hostel-management` | `hostel.view` | `#/school/page-hostel-management` | `/api/hostel/overview`; server-side permission and school scope checks |
| QR Attendance | `page:qr-attendance` | `attendance.qr.manage` | `#/school/page-qr-attendance` | `/api/attendance/qr/scan`; server-side permission and school scope checks |
| Chat | `api:EDUTRACK_CHAT.open` | `chat.use` | `#/school/api-edutrack-chat-open` | `/api/chat/contacts`; server-side permission and school scope checks |

The explicit role permission matrix remains in the relational `role_permissions` records. The Headteacher, Assistant Headteacher, and Teacher role names do not receive permissions from this route inventory. Assistant Headteacher has no verified grants in the current matrix and is seeded with an empty grant list; it may reach the shared dashboard but no operational module is enabled by this change. Unknown roles and an unavailable relational authorization service fail closed.

## Registered sidebar entries held back

These sidebar entries have no connected, verified server-backed route in the current School UI. They remain hidden in School navigation and direct URLs return an unavailable state. The permission column describes the intended existing permission label only; it does not enable access.

| Group | Hidden entries and intended permission labels |
| --- | --- |
| Overview and configuration | Setup / Config (`schools.manage`) |
| Headteacher | Subject Config (`academics.manage`); School Report Generator and Academic Year Report (`reporting.read`); Fee Hub items (`fees.manage`); Teachers Register items (`attendance.manage`, `schools.manage`, `academics.manage`, or `reporting.read` according to item); Integrity Check and Cloud Sync (`scope.read`); Publish/Block Results and Mock Results (`results.manage`) |
| Staff Management | User Accounts & Access Control and Staff Registry (`staff.manage`); Assign/Reassign Class (`classes.manage`); Assign Roles (`staff.manage`) |
| Student Admission & Transfer Management | New Student Admission and Transfer Admission (`admissions.view`); Student Search / Profile (`students.manage`) |
| Teachers | Score Entry, Multi-Subject Entry, and Mock Entry (`scores.manage`); Pupils Register, Audit Trail, Attendance Reports, Automation Hub, and critical alerts (`attendance.manage`); Pupil Setup, SMS Logs, and Pupils Report (`students.manage`); SHEP Activities and Sporting Activities (`UNMAPPED`); Subject Register and LMS (`academics.manage`); result publication items (`results.manage`) |
| Shared | Student Database (`students.manage`); Result Slip and Mock Result/Analysis (`reporting.read`); Broadsheet and Rankings (`results.manage`); Chart Analysis and Index Generator (`reporting.read`) |
| Smart School Management & Intelligence | AI Analytics Engine (`ai.use`); Student Health (`students.manage`); Workflow Automation, Business Intelligence, Library, Timetable AI, Procurement, Guidance & Counselling (`UNMAPPED`) |
| Integrated School Modules | Communication Hub (`communications.view`); Control Panel and Quiz (`UNMAPPED`); Analytics Narrative (`reporting.read`) |
| Info & Session | Copyright, Acknowledgement, and Developer entries are not in the server-backed route allowlist. Log Out remains available as a session action, not a content route. |

In particular, the legacy School modules that still render local or browser-held data are not made available merely because similarly named protected `/api/domain/*` endpoints exist. The frontend must call those endpoints and handle their server authorization before the corresponding sidebar item can be enabled.

## Legacy endpoint safeguards

`/api/config` and `/api/students` in `api/legacy.js` now require a verified relational account, active account and school, a role resolved from the current database record, assigned school identity, and the required database permission. The JWT role and requested `schoolCode` cannot grant access by themselves. Teachers are additionally restricted to their database-assigned class and form on `/api/students`. Unavailable relational authorization denies the request.

## Verification coverage

`test/school-sidebar-roles.browser.spec.js` exercises the role-filtered sidebar, canonical routes, Back/Forward, refresh, direct route restoration, unauthorized direct navigation, and expired-session handling at desktop and mobile viewport sizes. `test/macro-hierarchy-http.spec.js` exercises the administrative role-level HTTP authorization matrix and confirms that a role-only legacy JWT is rejected while a server-identified Headteacher is accepted. The browser tests use an authoritative-session fixture; they do not replace integration verification against a production identity database.
