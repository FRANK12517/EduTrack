'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const guide=fs.readFileSync(path.join(root,'school-user-guide.js'),'utf8');
const sidebar=fs.readFileSync(path.join(root,'school-sidebar.js'),'utf8');

for(const label of ['AI Analytics Engine','Workflow Automation','Business Intelligence','Student Health','Library','Timetable AI','Procurement','Guidance & Counselling']){
  assert.ok(guide.includes(`title:'${label}'`),'missing Part 6 guide entry: '+label);
}
assert.match(guide,/verify significant conclusions against source records/i);
assert.match(guide,/does not provide a separate automation-rule activation control/i);
assert.match(guide,/health information is confidential/i);
assert.match(guide,/barcode-scan an available book/i);
assert.match(guide,/confirm classes → subjects → teachers\/assignments → periods\/breaks/i);
assert.match(guide,/approval-chain progress/i);
assert.match(guide,/confidential student guidance timeline/i);
for(const term of ['AI','analytics','automation','business intelligence','health','library','timetable','procurement','counselling']){
  assert.match(guide,new RegExp(term,'i'),'missing Part 6 search term: '+term);
}
assert.equal((sidebar.match(/group\('school-smart-management'/g)||[]).length,1,'School sidebar must render one consolidated Smart School Management & Intelligence group');
assert.match(sidebar,/SMART SCHOOL MANAGEMENT & INTELLIGENCE/);
for(const legacyId of ['ent-nav-section','ng-enterprise','ent-p2-nav-section','ng-enterprise-p2']){
  assert.match(sidebar,new RegExp("'"+legacyId+"'"),'legacy School-facing enterprise navigation must be suppressed');
}
console.log('School user guide Part 6 smart school management and intelligence coverage passed.');
