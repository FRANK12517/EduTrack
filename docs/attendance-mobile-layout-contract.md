# Attendance Register mobile layout contract

The teacher Attendance Register uses the v84 weekly attendance detail store as
its source of truth. On viewports up to 600 CSS pixels, each teacher is shown
in the original staff order as a vertical card with these six sections:

1. STAFF ID
2. STAFF NAME/MEMBER
3. POSITION/ROLE
4. ATTENDANCE STATUS
5. REPORTING TIME
6. REASONS/REMARKS

The status, reporting-time, and reason sections summarize the five dates in the
currently selected work week. Selecting a day status opens the existing v84
attendance detail editor. Its existing single-selection status values remain
canonical: Present (`P`), Absent (`AB`), Excused (`EX`), Sick Leave (`SL`),
Study Leave (`SDL`), Official Duty (`OD`), Maternity Leave (`ML`), Paternity
Leave (`PL`), Annual Leave (`AL`), and Late (`LT`). Checked In and Checked Out
are not attendance status values in this model; check-in/check-out data is
stored as time-in/time-out fields. Reasons are stored as absence, late, and
early-departure reasons rather than a generic remarks field.

The regression test renders the actual application and register component with
isolated in-memory fixture data. It checks the approved mobile widths (320,
360, 375, 390, and 430 px), tablet and desktop widths (768, 1024, and 1280 px),
page and card overflow, card field order, staff order, desktop matrix
availability, phone landscape orientation, 200% text reflow, and the canonical status editor. It does not submit attendance
or write production records.

Run locally with `npm run test:attendance-mobile:browser`. The existing
`.github/workflows/release-gate.yml` installs Chromium and runs this check for
pull requests and pushes to `main`. Changes to this contract or its assertions
should be reviewed alongside changes to the v84 attendance renderer, its
shared styles, or the attendance detail model.
