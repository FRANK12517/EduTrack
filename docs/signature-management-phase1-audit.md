# EduTrack Signature Rebuild — Phase 1 Audit

## Architecture discovered

EduTrack currently has a client-led signature pipeline layered into `index.html`. The primary setup UI is the Headteacher Info and Class Teachers Info sections. The digital canvas is `dsigOpen`/`dsigSave`; uploaded Headteacher images enter `handleHtSigUploadUpgraded`; `processSignatureData` delegates to `extractSignature`; `updateActiveSignature` writes the active value to the per-account signature store and mirrors it to `CONFIG.htSignature` or `CONFIG.classSignatures`.

The previous safety fix is preserved in commit `5d538a9`. The additional override in `individual-result-slip-fix.js` validates upload MIME and size and prevents the raw paper/photo from becoming active. The raw data is passed only as source metadata to the existing active-signature writer after processed data is available; result-slip lookup uses processed values.

## Current data flow

```text
Digital canvas / Headteacher upload
  -> raw data URL
  -> extractSignature / processSignatureData
  -> processed PNG data URL
  -> updateActiveSignature
  -> localStorage per-account store + CONFIG.htSignature/classSignatures
  -> v134/v240 signature resolution
  -> live slip footer injection
  -> print/export clone refresh
```

`extractSignature` removes light pixels by alpha conversion. The current implementation preserves the full source canvas and does not crop margins. The active renderer is prohibited from using raw upload data by the `v134GetProcessedSignature`/`v240` lookup chain and the Phase 0 upload override.

## Authoritative identifiers and assignments

- School identity: existing authenticated school context and `schoolId` values.
- Staff identity: existing `staffId`/`teacher_staff_id` records in the teacher registry.
- Class identity: existing class records and canonical class keys (`KG1`, `Class 1` … `JHS 3`) used by the current class-signature resolver.
- Teacher-to-class authority: the existing teacher/class assignment data and `GES_TEACHER_ASSIGN_UI`/`teacher_class_assignments` workflows. No parallel assignment source should be introduced.
- Academic year/term: existing academic configuration and result/subscription term fields.

## Renderers found

1. Individual result-slip live renderer and footer injection around `v134RenderSignatureFooter`.
2. Individual result fetch and result-slip page in `index.html`.
3. Print/export clone refresh around the V136 signature reinjection logic.
4. PDF/print paths that clone `.result-slip`/`#slip-container` and re-resolve signatures before export.
5. Parent/student result-profile and report-card structures that carry `class_teacher_signature` and `headteacher_signature` fields.
6. Legacy result/profile renderers that read `CONFIG.htSignature` and `CONFIG.classSignatures`.

No dedicated server signature API or relational signature table was found. Existing secure file storage and file validation infrastructure is generic and is not currently wired to signature ownership metadata.

## Defects and risks for later phases

- Class Teacher UI currently offers digital signing by class key but no complete uploaded-signature flow.
- Signature ownership is primarily client/local-storage based; it is not yet authoritative by `schoolId + classId + assignedTeacherId`.
- Multiple legacy lookup layers exist, including SOVMS and CONFIG fallbacks. Phase 2 must consolidate resolution without breaking backward compatibility.
- `index.html` contains several historical signature patches. Any future change must cover live, print, bulk, and PDF paths together.
- The current extraction algorithm removes light pixels but does not crop useful bounds; background removal and margin trimming require a careful, non-destructive processor.

## Phase 2 requirements

1. Introduce one signature record contract for `HEADTEACHER` and `CLASS_TEACHER`, with source `DIGITAL` or `UPLOAD`, active state, school/staff/class ownership, and timestamps.
2. Add server-side persistence and authorization using existing tenant/school/RBAC checks.
3. Add class-teacher upload UI and original/processed previews without persisting raw paper as the active signature.
4. Resolve class signatures by `schoolId + classId + assignedTeacherId + activeSignature`; never by display name alone.
5. Resolve Headteacher signatures by `schoolId + ownerType=HEADTEACHER + activeSignature`.
6. Make every result renderer consume the same resolved processed signature object.
7. Add fixture-based tests for cross-school, cross-class, inactive-teacher, digital, upload, print, and PDF cases before deployment.
