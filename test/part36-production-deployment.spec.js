'use strict';
const assert=require('node:assert/strict');const {spawnSync}=require('node:child_process');const path=require('node:path');const ROOT=path.resolve(__dirname,'..');
function run(file,env={}){const r=spawnSync(process.execPath,[file],{cwd:ROOT,env:{...process.env,...env},encoding:'utf8'});return{code:r.status,out:`${r.stdout}${r.stderr}`}}
const missing={NODE_ENV:'',EDUTRACK_DATABASE_URL:'',EDUTRACK_ALLOWED_ORIGINS:'',PAYSTACK_SECRET_KEY:'',PAYSTACK_WEBHOOK_SECRET:'',EDUTRACK_PAYMENT_PLANS:'',EDUTRACK_STORAGE_MODE:'',EDUTRACK_STORAGE_BUCKET:''};
let r=run('scripts/production-release-gate.js',missing);assert.equal(r.code,2);assert.match(r.out,/"decision": "NO_GO"/);assert.doesNotMatch(r.out,/part34-test-only|part19_test_password|mysql:\/\/edutrack_test/i);
r=run('scripts/production-deployment-check.js',{EDUTRACK_PRODUCTION_BASE_URL:''});assert.equal(r.code,2);assert.match(r.out,/PRODUCTION ENDPOINT NOT CONFIGURED/);
r=run('scripts/production-paystack-check.js',{PAYSTACK_SECRET_KEY:'',PAYSTACK_API_URL:''});assert.equal(r.code,2);assert.match(r.out,/PAYSTACK SANDBOX UNAVAILABLE/);
r=run('scripts/production-storage-check.js',{EDUTRACK_STORAGE_MODE:'',EDUTRACK_STORAGE_BUCKET:''});assert.equal(r.code,2);assert.match(r.out,/PRIVATE OBJECT STORAGE UNAVAILABLE/);
r=run('scripts/production-migration-check.js',{EDUTRACK_MIGRATION_SOURCE:''});assert.equal(r.code,2);assert.match(r.out,/PRODUCTION EXPORT UNAVAILABLE/);
r=run('scripts/production-performance-check.js',{EDUTRACK_PRODUCTION_BASE_URL:''});assert.equal(r.code,2);assert.match(r.out,/PRODUCTION PERFORMANCE ENDPOINT UNAVAILABLE/);
r=run('test/part35-production-rbac.browser.spec.js',{EDUTRACK_PRODUCTION_BASE_URL:''});assert.equal(r.code,2);assert.match(r.out,/DEPLOYED RBAC MATRIX UNAVAILABLE/);
console.log('Part 36 deployment execution classification suite passed.');
