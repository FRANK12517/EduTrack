# EduTrack

EduTrack is served by the existing `index.html` application and the small Node.js authentication service in `server.js`. The repository previously contained only a browser-local application: registered schools, staff, roles, and sessions were stored in `localStorage`, and the historical API bridge was offline-first and non-authoritative. The new service establishes the server-side authentication boundary required for privileged access.

## Bootstrap provisioning

Privileged credentials are never committed to the repository. Set the six bootstrap environment variables in the deployment secret manager, then run `npm run provision` once. The command stores only salted `scrypt` hashes for the password and access code. It is safe to rerun: it updates the two designated privileged identities while preserving their stable IDs.

Required variables are `EDUTRACK_DEVELOPER_EMAIL`, `EDUTRACK_DEVELOPER_PASSWORD`, `EDUTRACK_DEVELOPER_ACCESS_CODE`, `EDUTRACK_SUPER_ADMIN_EMAIL`, `EDUTRACK_SUPER_ADMIN_PASSWORD`, and `EDUTRACK_SUPER_ADMIN_ACCESS_CODE`.

## Controlled reset

Run `npm run reset` only as an intentional administrative operation. It removes registered schools, staff, subscriptions, transactions, sessions, and dependent application data from the server store while retaining only `DEVELOPER_ROOT` and `SUPER_ADMIN` users. The reset does not create sample schools or staff.

## Run

Use `npm start` and open `http://localhost:3000`. The existing **Enter System** button now accepts the secure account fields when they are filled, submits credentials to `/api/auth/login`, and routes only after the server returns an authoritative role. The session is an `HttpOnly` cookie, so privileged tokens and credentials are not placed in browser storage or API responses. Refreshing the page restores the session through `/api/auth/session`.

The current repository has no external production database adapter or migration history; its historical data architecture is browser `localStorage`. The included service uses a private JSON store as a deployable baseline and exposes explicit reset/provisioning commands. A production deployment should place the store on persistent private storage or replace the storage functions with the platform's managed database adapter before multi-instance scaling.

## Security hardening — Part 1

The authentication service now stores only password/access-code hashes and SHA-256-derived session and password-reset token representations. Session cookies are `HttpOnly`, `SameSite=Lax`, path-restricted, non-cacheable, and marked `Secure` in production. Sessions expire after eight hours, logout invalidates the server-side session, and password changes or password resets invalidate all sessions for the account.

Browser state-changing authentication requests are protected by same-origin validation. The authenticated `/api/auth/csrf` endpoint also provides a cryptographically random CSRF token for clients that need an explicit token header. Login failures use generic responses, and server-side per-IP/per-account progressive limits protect login and password-reset request endpoints. Repeated failures receive temporary throttling rather than permanent lockout.

Password-reset requests always return the same generic response for known and unknown accounts. Reset records contain only a hashed token, expire after fifteen minutes, are single-use, and are invalidated after successful use. The repository does not yet include an email or SMS delivery adapter; integrating one is intentionally left for a later security-hardening part so reset tokens are not exposed through the API or logs.

Run the complete validation workflow with `npm test`. The protected frontend regression suite remains in `test/protected-features.spec.js`, and the new server-side security coverage is in `test/security.spec.js`. Security tests use an isolated temporary data fixture and restore the repository data file after completion.
