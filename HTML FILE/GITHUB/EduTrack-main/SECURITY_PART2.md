# EduTrack Security Hardening — Part 2

## Actual API inventory

The current repository exposes a deliberately small Node HTTP API. No separate ORM, SQL database, upload service, OTP endpoint, payment endpoint, AI endpoint, or resource CRUD API is present in this repository. School, staff, subscription, and transaction records are currently maintained by the existing frontend workflows and private JSON store; the Part 2 controls therefore harden the API surface that actually exists without inventing unsupported endpoints.

| Endpoint | Method | Authentication | Authorization and scope | Input and response controls |
|---|---:|---|---|---|
| `/api/health` | GET | Public | None | Minimal `{ ok: true }` response; strict CORS and security headers. |
| `/api/auth/login` | POST | Public | Server-side user lookup determines role | Email/password/access-code validation, generic failures, per-IP and per-account throttling, no password or role echo. |
| `/api/auth/session` | GET | Session cookie | Authenticated active account | Returns only public user identity and server-derived authorization context. |
| `/api/auth/csrf` | GET | Session cookie | Authenticated active account | Returns a short-lived-use cryptographically random token; only its SHA-256-derived representation is stored. |
| `/api/auth/logout` | POST | Optional session | Same-origin state change | Server-side session invalidation and cookie clearing. |
| `/api/auth/password-reset/request` | POST | Public | Same-origin request | Generic response for known and unknown accounts; request rate limiting; hashed server-side reset record. |
| `/api/auth/password-reset/confirm` | POST | Reset token | Same-origin request; active target account | Strict token/password validation; single-use expiration; invalidates all target sessions. |
| `/api/auth/password-change` | POST | Session cookie | Authenticated active account | Same-origin request; current-password verification; server-generated hash; invalidates all sessions. |
| `/api/admin/summary` | GET | Session cookie | `DEVELOPER_ROOT` or `SUPER_ADMIN`; dashboard permission checked server-side | Aggregate response only; no password hashes, tokens, or raw records. |
| `/api/admin/authorized-hierarchies` | GET | Session cookie | `DEVELOPER_ROOT` only | Returns server-defined role and scope only. |
| Static `/` and `/index.html` | GET | Public | None | Explicit allowlist; no directory listing or traversal. |
| Static `/privileged-auth.js` | GET | Public | None | Explicit allowlist and security headers. |

## Authorization model

Backend authorization is authoritative. The server resolves the session to an active user record, derives the role from that record, and applies endpoint-specific role checks. Frontend buttons, hidden routes, local storage values, URL obscurity, and client-provided role or scope values are not used as authorization boundaries.

The current repository does not yet expose school, district, regional, parent, student, teacher, subscription, payment, upload, or AI resource endpoints. Consequently, there are no resource-level tenant routes to authorize in Part 2. The authorization helper and audit events are centralized so future resource endpoints can require authentication, account status, role, organizational scope, ownership, entitlement, and action checks before accessing data.

## Request and response security

Production CORS uses the explicit `EDUTRACK_ALLOWED_ORIGINS` comma-separated allowlist and never returns a wildcard credentialed origin. Development permits only localhost origins. Unsupported methods return `405`, oversized request bodies are rejected at one mebibyte, long request targets return `414`, malformed credentials are rejected before expensive hashing, and sensitive paths such as `.git`, `.env`, backups, and arbitrary files are not served.

The server emits `X-Content-Type-Options`, `X-Frame-Options`, CSP `frame-ancestors`, `Referrer-Policy`, `Permissions-Policy`, and production HSTS. API errors remain generic and do not include stack traces, filesystem paths, database errors, or secrets. Unauthorized, forbidden, and rejected-CORS events are added to the existing audit array.

## Part 2 test coverage

`test/security.spec.js` now verifies authenticated administrative access, unauthenticated denial, strict CORS and preflight behavior, unsupported methods, path exposure, input validation, request limits, audit events, and all Part 1 authentication/session/reset controls. The existing protected frontend suite continues to run as part of `npm test`.
