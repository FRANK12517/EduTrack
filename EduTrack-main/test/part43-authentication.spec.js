'use strict';
if (!process.env.EDUTRACK_STAGING_AUTH_FIXTURES) { console.log('Part 43 authentication: NOT_PROVEN (non-production staging fixtures unavailable).'); process.exit(0); }
if (process.env.EDUTRACK_STAGING_AUTH_FIXTURES === 'production') throw new Error('Production authentication fixtures are forbidden.');
console.log('Part 43 authentication fixture classification passed; deployed login/session matrix remains required.');
