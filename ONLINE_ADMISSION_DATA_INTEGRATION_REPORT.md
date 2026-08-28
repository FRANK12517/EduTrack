# EduTrack Online Admission Data Integration Report

## Current investigation

The active branch is `main`. The authoritative relational layer is implemented in `db/relational.js` and uses `EDUTRACK_DATABASE_URL`, falling back to `DATABASE_URL`; it creates and queries the shared `regions`, `districts`, `schools`, and `classes` tables. The Online Admission API in `server.js` uses those same tables, so no duplicate jurisdiction or school store was created.

The live production health endpoint currently returns HTTP 503 with `Service unavailable`, while the local compatibility instance reports `persistence: compatibility`. The production deployment is configured to run in production mode, where `server.js` deliberately rejects operation unless the relational authority layer is configured. This proves the current blocker is production relational persistence configuration/availability, not a missing Online Admission UI module or a fabricated-data problem. The production environment must have a valid `EDUTRACK_DATABASE_URL` or `DATABASE_URL` pointing to the authoritative EduTrack MySQL/TiDB database before real options can be returned. No secret value was read or recorded.

The canonical production `/api/admissions/options` request reaches Vercel but currently returns HTTP 503 after the redirect from `edutrackgh.online` to `www.edutrackgh.online`. The prior local response of HTTP 200 with empty arrays occurred because the local process had no relational environment variable and the old route silently treated that state as an empty data store.

## Implemented source changes

`server.js` now returns HTTP 503 with the safe message `Admission data service unavailable` when relational persistence is not configured, rather than returning an ambiguous successful response with fabricated-looking empty option sets. The selection-validation route now makes the same distinction: unavailable persistence returns HTTP 503, while a configured database with an invalid or cross-jurisdiction selection returns HTTP 400.

The selection-validation route now validates `admissionType`, restricts `level` to `KG`, `LOWER_PRIMARY`, `UPPER_PRIMARY`, or `JHS`, and compares the selected level to the authoritative class name. It continues to require a joined active school, district, region, and active class, preserving the server-side trust boundary and preventing arbitrary IDs or stale browser values from advancing.

The new focused regression file is `test/online-admissions-data-safety.spec.js`. Existing Online Admission Part 1, Part 2, and Part 3 suites remain unchanged and pass.

## Data flow

Regions come from `regions`. Districts come from `districts.region_id`. Schools come from active `schools` joined through `districts` and `regions`. Classes come from active `classes.school_id`; the UI derives the level cascade from supported class names, while the server now verifies that the submitted level matches the selected class. School registration must therefore create the authoritative school, district association, and class records through the existing relational registration/domain flow; Online Admission does not require manual duplication.

## Validation status

The focused data-safety suite, Online Admission Part 1–3 suites, `npm run check`, and `npm test` pass. The live Parent Login → Parent Access Portal → Online Admission interface still opens, and all six login cards are present, enabled, and have pointer events enabled on the production page. A complete real-data cascade, end-to-end application submission, and live New/Transfer continuation remain blocked until the authoritative production database connection is configured and contains records.

## Pending production action

A Vercel project owner must configure the production database environment variable using the existing authoritative EduTrack MySQL/TiDB connection, without exposing the secret in code or chat. After configuration, redeploy and verify `/api/health` returns relational persistence, then exercise the real Region → District → School → Level → Class cascade and the full admission review/finalization flow.
