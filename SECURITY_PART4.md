# EduTrack Security Hardening — Part 4

## AI inventory and actual architecture

The repository did not contain a live AI provider, model client, vector database, retrieval pipeline, or AI tool implementation before Part 4. The frontend contains historical references to AI-assisted application concepts, but the authoritative Node service had no AI API. Part 4 therefore adds a fail-closed AI security boundary rather than pretending that a model integration exists.

| AI surface | Enforced behavior |
|---|---|
| `/api/ai/request` | Requires an authenticated active account and same-origin request. The server derives the role from the session, validates a strict `{ prompt, context }` shape, caps prompt/context size, detects common prompt-injection attempts, applies role-based hourly quotas, records an audit event, and returns a safe unavailable response because no provider is configured. |
| `/api/ai/tool` | Requires authentication and same-origin protection. Unknown fields, malformed arguments, and all tool names are rejected. No model-generated shell, SQL, filesystem, URL, or application function is executed. |
| AI documents/context | Context is treated as untrusted data, limited to five bounded strings, and scanned with the same prompt-injection policy. No retrieval or cross-tenant data access exists in the current repository. |
| AI output | No AI output is processed by application logic because no provider is configured. The endpoint fails closed rather than returning unvalidated model content. |
| Quotas | Hourly server-side counts are keyed by the authenticated user ID and the role quota is selected from the server-side role, never from request data. |

## Centralized audit logging

Security events now include an opaque request correlation ID, timestamp, severity, request IP, bounded user-agent text, and event-specific safe metadata. Audit records are appended to the private JSON store; no ordinary application endpoint permits users to modify or delete records. The developer-root-only `/api/admin/security-audit` endpoint returns a minimized read-only view without prompts, tokens, secrets, file contents, or payment credentials.

AI requests, prompt-injection detections, quota violations, tool authorization failures, CORS rejection, authorization failures, upload events, payment events, and password/session events use the same audit mechanism. Audit helper sanitization removes secret-like fields and sensitive payload fields before persistence.

## Secrets and production artifacts

No provider credentials are hardcoded in the repository. Paystack credentials and any future AI provider configuration must be provided through environment variables. Environment variants, logs, backups, temporary files, and private runtime uploads are excluded by `.gitignore`. Public file serving remains allowlisted to the application entry page and privileged-auth script, so historical `OLD FILES`, `.git`, `.env`, data, logs, and configuration artifacts are not served through HTTP.

The current AI boundary is intentionally fail-closed. To enable a provider, configure `EDUTRACK_AI_PROVIDER` and add a reviewed server-side provider adapter with output-schema validation, tenant-scoped retrieval, tool-specific authorization, bounded retries, and provider-secret isolation. Merely setting the environment flag does not bypass the current security checks.

## Tests

`test/security.spec.js` verifies safe AI requests fail closed without a provider, prompt-injection rejection, unknown-parameter rejection, tool denial, correlation IDs, minimized audit responses, and preservation of all Part 1–3 security tests. The protected frontend suite remains part of `npm test`.
