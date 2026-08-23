'use strict';
if (!process.env.EDUTRACK_STAGING_BASE_URL) console.log('Part 44 infrastructure: BLOCKED (isolated staging URL unavailable).');
else if (/localhost|127\.0\.0\.1/.test(process.env.EDUTRACK_STAGING_BASE_URL)) throw new Error('Localhost cannot be staging.');
