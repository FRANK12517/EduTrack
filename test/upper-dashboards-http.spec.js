'use strict';
const assert=require('node:assert/strict');
module.exports=async function upperHttp({sqlite,insert,base,accessCode,tokens,check,request}){
 const matrix=require('../app/auth/administrative-scope').UPPER_PERMISSIONS;
 // Deliberately grant only the new aggregate permissions: broad legacy fixture grants must not hide privacy failures.
 for(const [role,permissions] of Object.entries(matrix)){
  sqlite.prepare('DELETE FROM role_permissions WHERE role_id=?').run(role);
  for(const permission of permissions){sqlite.prepare('INSERT OR IGNORE INTO permissions VALUES (?,?)').run(permission,permission);insert('role_permissions',{role_id:role,permission_id:permission});}
 }
 insert('districts',{id:'d1b',name:'Second District in Region One',region_id:'r1'});
 insert('regions',{id:'rEmpty',name:'Region without reporting Schools',national_tenant_id:'n1'});
 insert('district_sports_records',{id:'sport-other-region',district_id:'d2',school_id:'s2',record_type:'athletes',payload_json:JSON.stringify({studentName:'PRIVATE ATHLETE',contactPhone:'PRIVATE PHONE'}),created_by:'ht2',created_at:'2026-09-01'});
 await check('ht1','/api/school-district-sync',200,{enabled:true});
 function url(level,view,extra=''){return '/api/control-panel/'+level+'?view='+view+(level==='regional'?'&regionId=r1':'&nationalId=n1')+extra}
 for(const [role,permissions] of Object.entries(matrix)){
  const level=role.startsWith('REGIONAL_')?'regional':'national',user='officer-'+role;
  const login=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({staffId:'STAFF-'+user,accessCode,administrativeLevel:level.toUpperCase(),role,...(level==='regional'?{region:'Central Region'}:{})})});
  const body=await login.json();assert.equal(login.status,200,JSON.stringify(body));assert.equal(body.authorization.dashboard,level+'-general');tokens[user]=login.headers.get('set-cookie').split(';')[0].split('=')[1];
  const context=await check(user,'/api/control-panel/'+level+'?view=context',200);assert.equal(context.role,role);
  const overview=await check(user,url(level,'overview'),200);assert.equal(overview.coverage.reportingCoverage,level==='regional'?'20/30':'21/31');
  assert.equal(overview.coverage.totalRegions,level==='regional'?1:3);assert.equal(overview.coverage.contributingRegions,level==='regional'?1:2);
  assert.equal(overview.coverage.totalDistricts,level==='regional'?2:3);assert.equal(overview.coverage.contributingDistricts,level==='regional'?1:2);
  assert.equal(overview.operationalTotals.students,level==='regional'?1:2);assert.equal(overview.schools.length,0,'overview does not return unnecessary School identities');
  const schools=await check(user,url(level,'schools'),200);assert.equal(schools.schools.length,level==='regional'?20:21);assert.doesNotMatch(JSON.stringify(schools),/Coverage School 32|PERMANENT-|Pupil |PRIVATE ATHLETE/);
  for(const view of ['regions','districts'])await check(user,url(level,view),200);
  for(const [view,permission] of [['attendance','attendance.read'],['examinations','examinations.read'],['sports','sports.read'],['export','reports.export']]){
   const granted=permissions.includes(level+'.'+permission),report=await check(user,url(level,view),granted?200:403);
   if(granted)assert.doesNotMatch(JSON.stringify(report),/PRIVATE ATHLETE|PRIVATE PHONE|PERMANENT-|Pupil |payload_json|studentName|contactPhone/);
  }
  // A verified Region/District chain is required; a different District in the same Region cannot claim this School.
  await check(user,url(level,'districts','&districtId=d1'),200);
  await check(user,url(level,'schools','&districtId=d1&schoolId=s1'),200);
  await check(user,url(level,'schools','&districtId=d1b&schoolId=s1'),403);
  await check(user,url(level,'schools','&schoolId=coverage32'),403);
  await check(user,url(level,'schools','&schoolId=s3'),403);
  await check(user,'/api/control-panel/'+level+'?view=schools&regionId=r3&districtId=d3&schoolId=s3'+(level==='national'?'&nationalId=n1':''),403);
  if(level==='regional')await check(user,'/api/control-panel/regional?view=schools&regionId=r2&districtId=d2&schoolId=s2',403);
  else {await check(user,url(level,'schools','&regionId=r1&districtId=d2'),403);await check(user,'/api/control-panel/national?view=overview&nationalId=n2',403);await check(user,url(level,'schools','&regionId=r2&districtId=d2&schoolId=s2'),200);}
  await check(user,url(level,'overview','&role=SUPER_ADMIN'),400);
  await check(user,url(level,'schools','&schoolId=s1&schoolId=s2'),400);
  await check(user,url(level,'schools'),405,{regionId:'r2',districtId:'d2',enabled:true});
  await check(user,'/api/control-panel/district?view=sports&districtId=d1',403,{districtId:'d1',schoolId:'s1',type:'calendar',record:{eventName:'Escalation'}});
  for(const endpoint of ['/api/domain/students?schoolId=s1','/api/domain/staff?schoolId=s1','/api/domain/result-slips/result1'])await check(user,endpoint,403);
  await check(user,'/api/school-district-sync?schoolId=s1',403,{enabled:true});
  await check(user,'/api/control-panel/'+(level==='regional'?'national':'regional')+'?view=context',403);
  const mismatch=await request(user,'/api/auth/login',{staffId:'STAFF-'+user,accessCode,role,administrativeLevel:level==='regional'?'NATIONAL':'REGIONAL'});assert.equal(mismatch.status,400);await check(user,'/api/auth/session',401);
  const relogin=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({staffId:'STAFF-'+user,accessCode,administrativeLevel:level.toUpperCase(),role,...(level==='regional'?{region:'Central Region'}:{})})});assert.equal(relogin.status,200);tokens[user]=relogin.headers.get('set-cookie').split(';')[0].split('=')[1];await relogin.text();
 }
 await check('regionalNarrow','/api/control-panel/regional?view=overview&regionId=r1&districtId=d1',403);
 const regionalNarrow=await check('regionalNarrow','/api/control-panel/regional?view=overview&regionId=r1&districtId=d1b',200);assert.equal(regionalNarrow.coverage.reportingCoverage,'0/0');
 await check('nationalNarrow','/api/control-panel/national?view=overview&nationalId=n1&regionId=r2',403);
 await check('nationalNarrow','/api/control-panel/national?view=overview&nationalId=n1&regionId=r1&districtId=d1b',403);
 const narrow=await check('nationalSchool','/api/control-panel/national?view=context',200);assert.deepEqual(narrow.regions.map(r=>r.id),['r1']);
 await check('nationalSchool','/api/control-panel/national?view=schools&nationalId=n1&schoolId=s2',403);
 await check('nationalSchool','/api/control-panel/national?view=districts&nationalId=n1&regionId=r2',403);
 const scoped=await check('nationalSchool','/api/control-panel/national?view=overview&nationalId=n1',200);assert.equal(scoped.coverage.reportingCoverage,'1/1');
 // Resource permissions continue to apply even inside a valid National jurisdiction.
 sqlite.prepare('DELETE FROM role_permissions WHERE role_id=? AND permission_id=?').run('NATIONAL_ADMIN','national.schools.read');
 await check('officer-NATIONAL_ADMIN',url('national','overview','&schoolId=s1'),403);
 insert('role_permissions',{role_id:'NATIONAL_ADMIN',permission_id:'national.schools.read'});
 sqlite.prepare('UPDATE users SET active=0 WHERE id=?').run('officer-REGIONAL_ADMIN');
 const inactive=await request('officer-REGIONAL_ADMIN','/api/control-panel/regional?view=context');assert.ok([401,403].includes(inactive.status));
 sqlite.prepare('UPDATE users SET active=1 WHERE id=?').run('officer-REGIONAL_ADMIN');
 await check('ht1','/api/school-district-sync',200,{enabled:false});
 for(const [role,permissions] of Object.entries(matrix)){
  const level=role.startsWith('REGIONAL_')?'regional':'national',user='officer-'+role;
  const overview=await check(user,url(level,'overview'),200);assert.equal(overview.coverage.reportingCoverage,level==='regional'?'19/30':'20/31');
  const schools=await check(user,url(level,'schools'),200);assert.ok(!schools.schools.some(s=>s.school_id==='s1'));
  for(const view of ['schools','overview','attendance','examinations','sports','export'])await check(user,url(level,view,'&districtId=d1&schoolId=s1'),403);
  for(const [view,permission] of [['attendance','attendance.read'],['examinations','examinations.read'],['sports','sports.read']])if(permissions.includes(level+'.'+permission)){const data=await check(user,url(level,view),200);assert.ok(!data.rows.some(r=>r.school_id==='s1'));}
 }
 assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM students').get().n,3);
 assert.ok(sqlite.prepare("SELECT COUNT(*) n FROM district_sports_records WHERE school_id='s1'").get().n>=1);
 if(process.env.EDUTRACK_UPPER_BROWSER==='1'){await check('ht1','/api/school-district-sync',200,{enabled:true});await require('./upper-dashboards.browser.spec')(base,accessCode,matrix);}
 for(const role of Object.keys(matrix)){const level=role.startsWith('REGIONAL_')?'regional':'national',user='officer-'+role;await check(user,'/api/auth/logout',200,{});await check(user,'/api/auth/session',401);await check(user,url(level,'overview'),401);}
 console.log('PASS Part 4 HTTP/SQL: 10 role logins/matrices, hierarchy/empty-entity coverage, intermediate scope validation, personal-data denial, tampering, cross-Region/District/National-root isolation, consent ON/OFF and logout');
};
