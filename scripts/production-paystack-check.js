#!/usr/bin/env node
'use strict';
const has=key=>Boolean(process.env[key]);
if(!has('PAYSTACK_SECRET_KEY')||!has('PAYSTACK_API_URL')){console.log(JSON.stringify({status:'NOT_PROVEN',reason:'PAYSTACK SANDBOX UNAVAILABLE',liveProviderTest:false,secretValuesPrinted:false},null,2));process.exit(2)}
const base=process.env.EDUTRACK_PRODUCTION_BASE_URL;
const checks=[{id:'credentials',status:'PASS',evidence:'Provider configuration is present without printing values'},{id:'execution-consent',status:process.env.EDUTRACK_ALLOW_SANDBOX_MUTATIONS==='true'?'PASS':'BLOCKED',evidence:process.env.EDUTRACK_ALLOW_SANDBOX_MUTATIONS==='true'?'Explicit sandbox mutation consent is present':'Sandbox mutation consent is not enabled',requiredAction:'Set EDUTRACK_ALLOW_SANDBOX_MUTATIONS=true only for an approved sandbox test'}];
if(!base)checks.push({id:'endpoint',status:'NOT_PROVEN',evidence:'Production endpoint is not configured',requiredAction:'Set EDUTRACK_PRODUCTION_BASE_URL to the deployed HTTPS endpoint'});else checks.push({id:'endpoint',status:'PASS',evidence:'Production endpoint is configured; execute the provider matrix through the deployment harness'});
console.log(JSON.stringify({status:checks.some(x=>x.status==='BLOCKED')?'BLOCKED':'NOT_PROVEN',reason:'Provider execution requires an approved sandbox and explicit test workflow',checks,liveProviderTest:false,secretValuesPrinted:false},null,2));process.exit(2);
