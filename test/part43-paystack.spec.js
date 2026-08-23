'use strict';
if (!process.env.PAYSTACK_SECRET_KEY || !process.env.PAYSTACK_WEBHOOK_SECRET) { console.log('Part 43 Paystack: NOT_PROVEN (sandbox configuration unavailable; no live transaction attempted).'); process.exit(0); }
if (process.env.EDUTRACK_PAYSTACK_LIVE === 'true') throw new Error('Live Paystack is forbidden.');
console.log('Part 43 Paystack sandbox configuration present; no transaction executed without approved consent.');
