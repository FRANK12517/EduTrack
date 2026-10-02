'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {DISTRICT_PERMISSIONS}=require('../app/auth/administrative-scope');
const authorization=require('../app/auth/authorization');
for(const [role,permissions] of Object.entries(DISTRICT_PERMISSIONS)){
 const auth={user:{active:true,status:'ACTIVE',hierarchy:'DISTRICT'},roles:[role],rolePermissions:{[role]:permissions},memberships:[{tenantId:'t1',scope:{districtIds:['d1']}}]};
 for(const permission of ['district.dashboard.view','district.schools.read','district.attendance.read','district.examinations.read','district.sports.read','district.sports.manage','district.reports.export']){
  assert.equal(authorization.evaluate(auth,{permission,scope:{districtId:'d1'}}).allowed,permissions.includes(permission),role+' '+permission);
  assert.equal(authorization.evaluate(auth,{permission,scope:{districtId:'d2'}}).allowed,false);
 }
}
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const start=html.indexOf('(function EMS_DSC_MODULE(){'),end=html.indexOf('(function EMS_DTVEC_MODULE(){',start);
const source=html.slice(start,end);new vm.Script(source);
assert.match(source,/EDUTRACK_DISTRICT_SPORTS.read/);
assert.match(source,/await write\(KEYS.calendar/);
assert.doesNotMatch(html.slice(end,html.indexOf('</script>',end)),/EDUTRACK_DISTRICT_SPORTS/,'other existing District modules are unmodified');
console.log('PASS District permission matrix and existing Sports module syntax/adapter isolation');
