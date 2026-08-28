'use strict';
const names=['EDUTRACK_DATABASE_URL','EDUTRACK_ALLOWED_ORIGINS','PAYSTACK_SECRET_KEY','PAYSTACK_WEBHOOK_SECRET','EDUTRACK_PAYMENT_PLANS','EDUTRACK_STORAGE_MODE','EDUTRACK_STORAGE_BUCKET','EDUTRACK_STORAGE_REGION','AWS_ACCESS_KEY_ID','AWS_SECRET_ACCESS_KEY','EDUTRACK_RESET_DELIVERY_PROVIDER','EDUTRACK_BACKUP_DESTINATION','EDUTRACK_MONITORING_URL'];
const missing=names.filter((x)=>!process.env[x]);
if(missing.length) console.log(`Part 44 environment: NOT_PROVEN (${missing.length} staging variables unavailable; values omitted).`);
else if(process.env.EDUTRACK_ALLOWED_ORIGINS==='*') throw new Error('Wildcard origin forbidden.');
