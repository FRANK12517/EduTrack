# Part 40 RBAC and Tenant Evidence

The deployed Vercel preview could not execute the EduTrack API. Both `/api/health` and `/api/auth/session` returned provider-level HTTP 500 `FUNCTION_INVOCATION_FAILED` responses. Because the request did not reach EduTrack, no staging authentication, role matrix, direct API authorization, or cross-tenant test was executed.

| Control | Result | Reason |
|---|---|---|
| Authentication contract | BLOCKED | Backend function invocation failed |
| Developer/root and super-admin checks | BLOCKED | No reachable API |
| National, regional, district, school, teacher, parent, student checks | BLOCKED | No reachable API |
| Direct API authorization | BLOCKED | No reachable API |
| Role escalation rejection | BLOCKED | No reachable API |
| School A versus School B isolation | BLOCKED | No isolated seeded staging data and no reachable API |
| Cross-school student/staff/file/payment/subscription/audit denial | BLOCKED | No reachable API |

No local result is relabeled as a staging result. The next operator must provision isolated test identities and data, fix the staging function environment/runtime, and rerun the direct API matrix.
