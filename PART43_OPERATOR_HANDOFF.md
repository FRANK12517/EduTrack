# Part 43 Operator Handoff

Part 43 is **BLOCKED** because the currently authorized infrastructure can deploy Vercel previews but cannot configure the required isolated staging environment. The connected Vercel project reports Node.js 24.x, and no authorized environment-variable management, staging database, private storage, Paystack sandbox, delivery sink, monitoring target, backup destination, or rollback target is available.

```text
Provision an isolated non-production Node.js 22 staging target. Configure staging-only EDUTRACK_DATABASE_URL, exact HTTPS EDUTRACK_ALLOWED_ORIGINS, private S3-compatible storage, Paystack sandbox credentials, a non-production delivery sink, monitoring, backup, and recovery targets through the approved secret mechanism. Deploy the exact Part 41 source release 63b6739b72389d066d496a9b1e12afad13137cec plus reviewed Part 43 changes as a clean immutable release. Verify the deployed SHA and actual runtime. Run real HTTPS /, /api/health, /api/auth/session, OPTIONS, exact-origin CORS, security-header, database migration/persistence, private storage, sandbox payment, authentication, RBAC, tenant-isolation, mobile, performance, monitoring, backup/restore, and rollback checks. Record only actual results. Never use production resources, live Paystack, real users, production data, production storage, or production alerting. Keep Part 43 BLOCKED until every mandatory staging gate is independently evidenced. Do not start Part 44.
```

Do not weaken SSO, HTTPS, CORS, authentication, authorization, tenant isolation, database guards, storage guards, or payment guards. **PART 44 WAS NOT STARTED.**
