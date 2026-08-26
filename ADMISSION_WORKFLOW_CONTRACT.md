# EduTrack Admission Workflow Contract

This contract protects the existing online admission workflow from cleanup, refactoring, or feature work that could remove or weaken it.

## Parent submission

Parents must be able to complete and submit both **New Admission** and **Transfer Admission** applications online through `online-admission.js`. The selection flow must open the existing next-stage form, retain the selected admission context, validate the selected school/class, and persist the application through `POST /api/admissions/applications` with status `PENDING_REVIEW`.

New Admission requires applicant name, date of birth, gender, guardian/parent name, and guardian phone. Transfer Admission additionally requires previous school, previous class, and transfer reason. Submitted applications must not receive a Permanent Student ID.

## Review and finalization

Admission review must preserve the existing status path: `PENDING_REVIEW` or `RESUBMITTED` → `UNDER_REVIEW` → `APPROVED`, `REJECTED`, or `CORRECTION_REQUIRED`. Only an authorized **HEADTEACHER** scoped to the selected school may perform `FINALIZE_ADMISSION`.

Finalization is the only workflow step allowed to create the student record and Permanent Student ID. The HTTP authorization boundary and the relational persistence function both enforce the Headteacher-only rule. Parents, students, teachers, accountants, and other non-Headteacher roles must never be able to generate a Permanent Student ID.

## Preservation gate

`test/admission-workflow-preservation.spec.js` is included in the standard `npm test` command. Any future change that removes required form fields, the parent submission route, admission statuses, the Headteacher-only authorization boundary, or the six login-card role markers must fail the standard test suite before merge or deployment.
