'use strict';
const assert=require('node:assert/strict');
module.exports=async function({base,accessCode,sqlite}){
 const send=async(body,cookie)=>{const res=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:JSON.stringify(body)});return {status:res.status,body:await res.json(),cookie:res.headers.get('set-cookie')?.split(';')[0]};};
 const read=async(cookie,url)=>{const res=await fetch(base+url,{headers:{Cookie:cookie}});return {status:res.status,body:await res.json()};};
 for(const level of ['DISTRICT','REGIONAL','NATIONAL']){
  const valid={administrativeLevel:level,role:level+'_ADMIN',staffId:'STAFF-officer-'+level+'_ADMIN',accessCode,...(level!=='NATIONAL'?{region:'Central Region'}:{}),...(level==='DISTRICT'?{district:'Cape Coast Metro'}:{})};
  const attacks=[{role:'SUPER_ADMIN'},{role:level+'_SPORTS_OFFICER'},{staffId:'NOT-REGISTERED'},{accessCode:'wrong'}, {administrativeLevel:'SCHOOL'},...(level==='DISTRICT'?[{district:'Kumasi Metro'},{region:'Ashanti Region',district:'Kumasi Metro'}]:level==='REGIONAL'?[{region:'Ashanti Region'},{district:'Cape Coast Metro'}]:[{region:'Central Region'},{district:'Cape Coast Metro'}])];
  for(const attack of attacks){const good=await send(valid);assert.equal(good.status,200,JSON.stringify(good.body));const bad=await send({...valid,...attack},good.cookie);assert.ok([400,401,403].includes(bad.status),JSON.stringify(bad));assert.equal((await read(good.cookie,'/api/auth/session')).status,401,'a rejected new login cannot reuse its previous session');}
  const logged=await send(valid);assert.equal(logged.status,200);
  const session=await read(logged.cookie,'/api/auth/session');assert.equal(session.status,200);assert.equal(session.body.authorization.loginScope.level,level);
  sqlite.prepare('UPDATE users SET status=? WHERE id=?').run('INACTIVE','officer-'+level+'_ADMIN');assert.equal((await read(logged.cookie,'/api/auth/session')).status,401);sqlite.prepare('UPDATE users SET status=? WHERE id=?').run('ACTIVE','officer-'+level+'_ADMIN');
 }
 // An account with two assigned regions must still receive a session for just the selected region.
 const user='officer-REGIONAL_ADMIN';const old=sqlite.prepare('SELECT scope_json FROM tenant_memberships WHERE user_id=?').get(user).scope_json;
 sqlite.prepare('UPDATE tenant_memberships SET scope_json=? WHERE user_id=?').run(JSON.stringify({regionIds:['r1','r2']}),user);
 const login=await send({administrativeLevel:'REGIONAL',role:'REGIONAL_ADMIN',staffId:'STAFF-'+user,accessCode,region:'Central Region'});assert.equal(login.status,200);
 const context=await read(login.cookie,'/api/control-panel/regional?view=context');assert.equal(context.status,200);assert.deepEqual(context.body.regions.map(r=>r.id),['r1']);assert.equal((await read(login.cookie,'/api/control-panel/regional?view=overview&regionId=r2')).status,403);
 sqlite.prepare('UPDATE tenant_memberships SET scope_json=? WHERE user_id=?').run(JSON.stringify({regionIds:['r2']}),user);assert.equal((await read(login.cookie,'/api/auth/session')).status,401,'changed assignment invalidates selected session');
 sqlite.prepare('UPDATE tenant_memberships SET scope_json=? WHERE user_id=?').run(old,user);
 const consent=sqlite.prepare('SELECT district_sync_enabled FROM schools WHERE id=?').get('s1').district_sync_enabled;
 const schoolInput={region:'Central Region',district:'Cape Coast Metro',role:'Headteacher',staffId:'STAFF-ht1',accessCode};
 const schoolLogin=async(input)=>{const response=await fetch(base+'/api/school-login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)});return {status:response.status,body:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};};
 sqlite.prepare('INSERT OR IGNORE INTO roles VALUES (?,?)').run('ASSISTANT_HEADTEACHER','ASSISTANT_HEADTEACHER');
 for(const [role,label] of [['HEADTEACHER','Headteacher'],['ASSISTANT_HEADTEACHER','Assistant Headteacher'],['TEACHER','Classroom Teacher']]){
  sqlite.prepare('UPDATE user_roles SET role_id=? WHERE user_id=?').run(role,'ht1');
  const login=await schoolLogin({...schoolInput,role:label});assert.equal(login.status,200,JSON.stringify(login.body));assert.equal(login.body.dashboard,'school-general');const session=await read(login.cookie,'/api/auth/session');assert.equal(session.status,200);assert.equal(session.body.authorization.loginScope.level,'SCHOOL');assert.equal(session.body.user.staffId,'STAFF-ht1');
 }
 sqlite.prepare('UPDATE user_roles SET role_id=? WHERE user_id=?').run('HEADTEACHER','ht1');
 for(const attack of [{district:'Kumasi Metro'},{region:'Ashanti Region',district:'Kumasi Metro'},{role:'District Administrator'},{role:'Classroom Teacher'},{staffId:'NOT-REGISTERED'},{accessCode:'wrong'}]){assert.equal((await schoolLogin(schoolInput)).status,200);assert.ok([400,401].includes((await schoolLogin({...schoolInput,...attack})).status));}
 assert.equal(sqlite.prepare('SELECT district_sync_enabled FROM schools WHERE id=?').get('s1').district_sync_enabled,consent,'logging in never enables synchronization');
 console.log('PASS School authentication: all three roles, cookie scope and Staff ID, wrong role/credentials, invalid pair, foreign scope and unchanged synchronization');
 console.log('PASS hierarchical HTTP authentication: all macro levels, invalid pairs, cross-scope credentials, role/level spoofing, stale session rejection, inactive accounts, narrowed multi-region session and revoked assignment');
};
