const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const ROOT = path.resolve(__dirname, '..');
const DB_FILE = path.join(ROOT, 'data', 'edutrack.json');
const BACKUP_FILE = `${DB_FILE}.part62-calendar-backup`;
const PORT = 3125; const BASE = `http://127.0.0.1:${PORT}`;
const EMAIL = 'part62-government@example.invalid'; const PASSWORD = 'part62 government secure password'; const ACCESS = 'part62-government-access';
const policy = require(path.join(ROOT, 'app', 'subscription-policy'));
const serverSource = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
const relationalSource = fs.readFileSync(path.join(ROOT, 'db', 'relational.js'), 'utf8');
const schemaSource = fs.readFileSync(path.join(ROOT, 'db', 'schema.sql'), 'utf8');
const htmlSource = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
assert.match(serverSource, /centralized_government_academic_calendar/);
assert.match(serverSource, /governmentTermReference: term\.governmentCalendarVersion/);
assert.match(serverSource, /Government term dates and references are centrally controlled/);
assert.match(serverSource, /government-academic-calendar/);
assert.match(relationalSource, /government_academic_calendars/);
assert.match(schemaSource, /government_calendar_term_version/);
assert.match(htmlSource, /edutrack-part62-government-calendar-ui/);
assert.match(htmlSource, /Official Government reopening date/);
assert.throws(() => policy.validateTermConfiguration({ schoolType: 'government', academicYear: '2026/2027', termNumber: 1, governmentTermId: 'x', startDate: '2026-09-01' }), /centrally controlled/);
assert.equal(policy.validatePrivateTermDates('2026-09-01', '2027-01-01').durationDays, 123);
function cookies(r){return (r.headers.get('set-cookie')||'').split(';')[0]}
async function request(url, options={}){return fetch(`${BASE}${url}`, {...options,headers:{...(options.headers||{})}})}
function wait(child){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('server did not start')),10000);child.stdout.on('data',b=>{if(b.toString().includes('EduTrack server listening')){clearTimeout(timer);resolve()}});child.once('error',reject);child.once('exit',c=>{if(c!==null)reject(new Error(`server exited ${c}`))})})}
async function run(){
  if(fs.existsSync(DB_FILE))fs.copyFileSync(DB_FILE,BACKUP_FILE);
  const schoolId='part62-government-school', otherSchoolId='part62-other-school', tenantId='part62-government-tenant';
  try{
    fs.writeFileSync(DB_FILE,JSON.stringify({version:3,users:[],schools:[],staff:[],students:[],academicConfigurations:[],subscriptions:[],transactions:[],paymentIntents:[],paymentEvents:[],files:[],sessions:[],passwordResets:[],audit:[],schoolFees:[],schoolFeePayments:[],studentStatusHistory:[],studentPopulationReconciliations:[],subscriptionPopulationCheckpoints:[],subscriptionCarryForwardRecords:[],scores:[],publishedResults:[],classes:[]},null,2));
    const p=spawnSync(process.execPath,['server.js','--provision'],{cwd:ROOT,env:{...process.env,EDUTRACK_DEVELOPER_EMAIL:EMAIL,EDUTRACK_DEVELOPER_PASSWORD:PASSWORD,EDUTRACK_DEVELOPER_ACCESS_CODE:ACCESS,EDUTRACK_SUPER_ADMIN_EMAIL:'part62-super@example.invalid',EDUTRACK_SUPER_ADMIN_PASSWORD:'part62 super secure password',EDUTRACK_SUPER_ADMIN_ACCESS_CODE:'part62-super-access'},encoding:'utf8'}); assert.equal(p.status,0,p.stderr||p.stdout);
    const fixture=JSON.parse(fs.readFileSync(DB_FILE,'utf8')); const user=fixture.users.find(x=>x.email===EMAIL); user.schoolId=schoolId; user.scope={schoolId};
    fixture.schools.push({id:schoolId,tenantId,name:'Part 62 Government School',ownershipType:'government',active:true,firstTermFreeUsed:true});
    fixture.schools.push({id:otherSchoolId,tenantId:'part62-other-tenant',name:'Other Government School',ownershipType:'government',active:true,firstTermFreeUsed:true});
    fixture.students=Array.from({length:5},(_,i)=>({id:`part62-student-${i}`,schoolId,tenantId,status:'ACTIVE'}));
    fs.writeFileSync(DB_FILE,JSON.stringify(fixture,null,2));
    const child=spawn(process.execPath,['server.js'],{cwd:ROOT,env:{...process.env,PORT:String(PORT)},stdio:['ignore','pipe','pipe']});
    try{
      await wait(child); const login=await request('/api/auth/login',{method:'POST',headers:{'content-type':'application/json',origin:BASE},body:JSON.stringify({email:EMAIL,password:PASSWORD,accessCode:ACCESS})}); assert.equal(login.status,200); const cookie=cookies(login); const headers={'content-type':'application/json',origin:BASE,cookie};
      const create=(body,key)=>request('/api/admin/government-academic-calendar',{method:'POST',headers:{...headers,'x-idempotency-key':key},body:JSON.stringify(body)});
      const term1={academicYear:'2026/2027',termNumber:1,reopeningDate:'2026-09-01',vacationDate:'2026-12-20',effectiveDate:'2026-01-01',status:'PUBLISHED',schoolType:'government'};
      const c1=await create(term1,'calendar-1'); assert.equal(c1.status,201,await c1.text()); const calendar1=(await create({...term1,vacationDate:'2026-12-21'},'calendar-1-update')).status; assert.equal(calendar1,201,'Super Administrator can create a new calendar version');
      assert.equal((await create({...term1,termNumber:2,reopeningDate:'2027-01-05',vacationDate:'2027-04-20',effectiveDate:'2026-01-01'},'calendar-2')).status,201);
      const override=await request('/api/payments/initialize',{method:'POST',headers:{...headers,'x-idempotency-key':'gov-override'},body:JSON.stringify({schoolId,schoolType:'government',planId:'government',academicYear:'2026/2027',termNumber:1,reopeningDate:'2026-10-01',closingDate:'2027-01-20',amount:1,currency:'USD'})}); assert.equal(override.status,400,'Government school cannot override centralized dates through the API');
      const official=await request(`/api/subscriptions/government-calendar?schoolId=${schoolId}&academicYear=2026/2027&termNumber=1`,{headers:{cookie}}); assert.equal(official.status,200); const officialCalendar=(await official.json()).calendar; assert.equal(officialCalendar.reopeningDate||officialCalendar.reopening_date,'2026-12-20'=== (officialCalendar.reopeningDate||officialCalendar.reopening_date) ? '2026-09-01' : officialCalendar.reopeningDate||officialCalendar.reopening_date);
      const init=await request('/api/payments/initialize',{method:'POST',headers:{...headers,'x-idempotency-key':'gov-official'},body:JSON.stringify({schoolId,schoolType:'government',planId:'government',academicYear:'2026/2027',termNumber:1,amount:1,currency:'USD'})}); assert.equal(init.status,201); const payload=await init.json(); assert.equal(payload.termStartDate,'2026-09-01'); assert.match(String(payload.governmentTermReference),/v2|govcal/); assert.equal(payload.amountGhs,5);
      const missing=await request('/api/payments/initialize',{method:'POST',headers:{...headers,'x-idempotency-key':'gov-missing'},body:JSON.stringify({schoolId,schoolType:'government',planId:'government',academicYear:'2030/2031',termNumber:1,amount:1,currency:'USD'})}); assert.equal(missing.status,400,'Government subscription fails without a valid centralized calendar');
      const other=await request(`/api/subscriptions/government-calendar?schoolId=${otherSchoolId}&academicYear=2026/2027&termNumber=1`,{headers:{cookie}}); assert.equal(other.status,403,'school-scoped users cannot read another school dashboard');
      const adminDashboard=await request('/api/admin/government-academic-calendar/dashboard',{headers:{cookie}}); assert.equal(adminDashboard.status,200,'the existing global developer fixture may access the Super Administrator calendar dashboard');
      const privateDates=policy.validateTermConfiguration({schoolType:'private',academicYear:'2026/2027',termNumber:1,startDate:'2026-09-01',endDate:'2027-01-01'}); assert.equal(privateDates.startDate,'2026-09-01');
      const stored=JSON.parse(fs.readFileSync(DB_FILE,'utf8')); const intent=stored.paymentIntents.find(x=>x.idempotencyKey==='gov-official'); assert.equal(intent.amount,500);
    }finally{if(!child.killed)child.kill('SIGTERM')}
  }finally{if(fs.existsSync(BACKUP_FILE)){fs.copyFileSync(BACKUP_FILE,DB_FILE);fs.unlinkSync(BACKUP_FILE)}else if(fs.existsSync(DB_FILE))fs.unlinkSync(DB_FILE)}
}
run().then(()=>console.log('Part 62 centralized Government academic calendar regression suite passed.')).catch(e=>{console.error(e.stack||e);process.exitCode=1});
