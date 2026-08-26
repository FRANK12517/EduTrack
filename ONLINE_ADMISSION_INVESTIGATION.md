# Online Admission Investigation

Date: 2026-08-26

## Read-only findings

The active application is `/home/ubuntu/EduTrack` on branch `main`. The Parent Access Portal markup is in `index.html` around line 83883, with the existing Permanent Student ID input, Search, Clear, and Cancel controls. The active Online Admission implementation is `online-admission.js`, loaded from the `<head>` with `defer`.

The Online Admission module's `inject()` function searches for `#parent-modal-overlay .pp-btn-row`, creates `#online-admission-entry`, and assigns `b.onclick=openSelection`. Its `MutationObserver` and `DOMContentLoaded` boot path keep the button injected when the Parent Portal is present. `openSelection()` creates `#online-admission-overlay`, loads `/api/admissions/options`, and wires admission type, region, district, school, level, class, Continue, and Cancel controls.

## Local reproduction

Using the active local application at `http://localhost:3000`, clicking the Parent login card opened the Parent Access Portal without entering a Permanent Student ID. The portal showed `#online-admission-entry` with label `ONLINE ADMISSION`. Clicking that control opened `#online-admission-overlay` with the expected selection interface containing admission type, region, district, school, educational level, class, Continue, and Cancel controls.

Therefore the reported click failure is not reproducible in the current local active code. The current implementation is already integrated into `index.html` via `/online-admission.js`, and the click handler executes successfully in the local browser. Console output showed no Online Admission runtime error during the click. Existing unrelated startup warnings were observed, including a protected-functionality warning for a missing `#shell` element, search-index drift, and a subscription/signature integrity warning; these were not caused by the Online Admission click.

## Next verification

The live production domain must be checked separately to determine whether the historical failure came from stale production assets or a production deployment/configuration mismatch. No Online Admission code should be changed until that comparison identifies a real active defect.

## Evidence

- `index.html` lines 83882-83900: Parent Access Portal markup.
- `index.html` lines 84458-84531: Parent portal login-card boot and `EMS_PARENT_PORTAL` export.
- `online-admission.js` lines 7-14: selection/form modal creation, injection, and event wiring.
- Local browser reproduction: Parent Portal opened and Online Admission selection overlay appeared after click.
- Local console: no Online Admission click-path runtime error.

## Validation results

The existing suites `test/online-admissions-part1.spec.js`, `test/online-admissions-part2.spec.js`, and `test/online-admissions-part3.spec.js` all passed. The configured `npm run check` syntax-validation chain passed, and the configured `npm test` suite passed for protected features, security, final security checks, AI Intelligence authorization/safety, and QR attendance.

The live production site `https://www.edutrackgh.online/` was opened after the latest READY deployment. Clicking the Parent login card opened the Parent Access Portal. Without entering a Permanent Student ID, clicking the injected `ONLINE ADMISSION` button created the Online Admission selection interface with admission type, region, district, school, educational level, class, Continue, and Cancel controls. The live browser produced no console output during the affected click sequence.

## Audit limitation and remaining issues

The live database currently returned zero regions, districts, schools, and classes from `/api/admissions/options`, so the dependent cascade could not be exercised with real jurisdiction records in this environment. The backend rejected an empty application with HTTP 400. An intentionally invalid selection against the unconfigured local relational store returned HTTP 500 with `Unable to validate admission selection`; this is an environment/configuration failure path and should be retested against a configured database before changing production behavior.

The local isolated browser harness also exposed pre-existing legacy-script syntax warnings and a notification-bell `insertBefore` race unrelated to the Parent/Online Admission path. No changes were made to those unrelated systems because the specification requires minimum safe fixes and the affected production flow is currently functional.

## Conclusion

No Online Admission source change was justified by the current evidence: the reported defect is not reproducible locally or on the live production deployment, and the active module is loaded and connected. The safe deliverable is this evidence-based investigation report, retained as an audit artifact; the existing Online Admission implementation should not be replaced or rebuilt.
