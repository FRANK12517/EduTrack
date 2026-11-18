# EduTrack branding assets

The approved full artwork is `assets/edutrack-app-icon.png` (1254 × 1254 PNG). Its SHA-256 is recorded in `branding.config.json`. Keep this source unchanged unless a deliberate brand update is approved.

Platform assets are generated directly from that source at 16, 32, 180, 192, and 512 pixels using Windows System.Drawing high-quality bicubic resizing. The artwork is square and already includes its rounded-square field; generated variants preserve the complete square image without an added mask or crop.

`branding.config.json` records the canonical logo, favicon, Apple touch icon, manifest, PWA icon paths, alternative text, and source checksum. Keep its paths aligned with `index.html`, `manifest.webmanifest`, and the public asset registry in `app/login-shell.js`. The login, developer header, and dashboard app mark use the same full-artwork asset. School logos and user-supplied images remain separate.

Do not delete or replace these assets during cleanup because a search appears to show no references. Update assets, metadata, responsive component, and regression checks together for an approved brand change. Run `npm run test:branding` after changes; CI also validates and builds the public asset bundle. Prominent logo images must preserve aspect ratio and use `object-fit: contain`.
