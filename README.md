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
