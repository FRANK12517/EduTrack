'use strict';
const crypto = require('node:crypto');
const { makeRenewalPaystackHandlers } = require('./paystack_renewal_backend_reference');

const secret = 'local-test-secret';
let finalized = 0;
const pending = new Map();
let schoolExpired = false;
const db = {
  async getRenewalPeriod(input) { const period = typeof input === 'string' ? input : input.period; const packageId = typeof input === 'string' ? 'full' : input.packageId; const price = !schoolExpired && input.lockedPrice ? input.lockedPrice : 250; return period === '1_year' && packageId === 'full' ? {id:period, label:'1 Year', price, currency:'GHS'} : null; },
  async findSchoolForRenewal(input) { return {id:'school-1', name:input.schoolName || 'Test School', package:'full', priceAtSubscription:'GHC 200.00', expiryDate:schoolExpired?'2020-01-01T00:00:00.000Z':'2030-01-01T00:00:00.000Z'}; },
  async getSchoolById() { return {id:'school-1', name:'Test School', package:'full', priceAtSubscription:'GHC 200.00', expiryDate:schoolExpired?'2020-01-01T00:00:00.000Z':'2030-01-01T00:00:00.000Z'}; },
  async validateCurrentAccessCode() { return true; },
  async createPendingRenewal(input) { const row={id:'renewal-1', ...input}; pending.set(input.reference,row); return row; },
  async attachPaystackAuthorization() {},
  async getRenewalByReference(reference) { return pending.get(reference) || {status:'pending', schoolId:'school-1', renewalId:'renewal-1', periodId:'1_year', amount:20000, currency:'GHS'}; },
  async markRenewalPaymentFailed() {},
  async transaction(fn) { return fn({markRenewalVerifiedAndRotateAccessCodeOnce: async input => { finalized += 1; const payment={...input,status:'verified',newAccessCode:'NEW-CODE#',newExpiryDate:'2030-01-01T00:00:00.000Z'}; const row=pending.get(input.reference); if(row) { row.status='verified'; row.payment=payment; } return payment; }}); }
};
const fetchImpl = async (url, init={}) => {
  if (url.endsWith('/transaction/initialize')) return {ok:true,json:async()=>({status:true,data:{access_code:'ACCESS',reference:JSON.parse(init.body).reference}})};
  if (url.includes('/transaction/verify/')) return {ok:true,json:async()=>({status:true,data:{reference:url.split('/').pop(),status:'success',amount:20000,currency:'GHS',id:77,paid_at:'2026-08-15T00:00:00.000Z'}})};
  throw new Error('Unexpected URL '+url);
};
function response() { return {statusCode:200, body:null, status(n){this.statusCode=n;return this;}, json(x){this.body=x;return this;}, send(x){this.body=x;return this;}}; }
(async()=>{
  const h=makeRenewalPaystackHandlers({db,secretKey:secret,fetchImpl});
  const q=response(); await h.quote({query:{period:'1_year',packageId:'full'}},q);
  if(q.body.amount!==250) throw new Error('Dynamic quote failed');
  const i=response(); await h.initialize({body:{schoolId:'school-1',schoolName:'Test School',region:'Ashanti',district:'Kumasi',currentAccessCode:'CODE',packageId:'full',packageName:'Full School Package',period:'1_year',contactPerson:'Tester',phone:'0240000000',email:'test@example.com'}},i);
  if(!i.body.authorization || i.body.authorization.amount!==20000) throw new Error('Active-school legacy price lock failed');
  const ref=i.body.authorization.reference;
  const v=response(); await h.verify({params:{reference:ref}},v);
  if(v.body.status!=='verified' || finalized!==1 || v.body.transaction.newAccessCode!=='NEW-CODE#') throw new Error('Verification/finalization/access-code rotation failed');
  const v2=response(); await h.verify({params:{reference:ref}},v2);
  if(finalized!==1) throw new Error('Verification was not idempotent');
  const webhookBody=JSON.stringify({event:'charge.success',data:{reference:ref,status:'success',amount:20000,currency:'GHS',id:77}});
  const signature=crypto.createHmac('sha512',secret).update(webhookBody).digest('hex');
  const w=response(); await h.webhook({rawBody:webhookBody,body:JSON.parse(webhookBody),headers:{'x-paystack-signature':signature}},w);
  if(w.statusCode!==200 || finalized!==1) throw new Error('Webhook duplicate protection failed');
  schoolExpired=true;
  const expired=response(); await h.initialize({body:{schoolId:'school-1',schoolName:'Test School',region:'Ashanti',district:'Kumasi',currentAccessCode:'CODE',packageId:'full',packageName:'Full School Package',period:'1_year',contactPerson:'Tester',phone:'0240000000',email:'test@example.com'}},expired);
  if(!expired.body.authorization || expired.body.authorization.amount!==25000) throw new Error('Expired-school effective price adoption failed');
  console.log(JSON.stringify({quoteAmount:q.body.amount,activeSchoolInitAmount:i.body.authorization.amount,expiredSchoolInitAmount:expired.body.authorization.amount,verified:v.body.status,finalizedCount:finalized,webhookStatus:w.statusCode}));
})().catch(err=>{console.error(err);process.exit(1);});
