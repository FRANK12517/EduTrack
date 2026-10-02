'use strict';
// Real HTTP handler/auth middleware and real relational SELECT/UPDATE statements.
// SQLite is a disposable SQL execution adapter, NOT a TiDB migration test.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const http=require('node:http');
const crypto=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const mysql=require('mysql2/promise');

(async()=>{
  const sqlite=new DatabaseSync(':memory:');
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'edutrack-macro-http-'));
  process.env.EDUTRACK_DATA_FILE=path.join(temp,'data.json');
  process.env.EDUTRACK_DATABASE_URL='mysql://disposable.invalid/test';
  process.env.DB_PASSWORD='';process.env.NODE_ENV='test';
  process.env.JWT_SECRET=crypto.randomBytes(32).toString('hex');
  for(const name of ['EDUTRACK_AI_PROVIDER_URL','OPENAI_API_BASE','BUILT_IN_FORGE_API_URL','EDUTRACK_AI_API_KEY','OPENAI_API_KEY','BUILT_IN_FORGE_API_KEY'])delete process.env[name];
  fs.writeFileSync(process.env.EDUTRACK_DATA_FILE,'{}');
  sqlite.exec(`
    CREATE TABLE users (id TEXT PRIMARY KEY,email TEXT,staff_id TEXT,scope_json TEXT,status TEXT,active INTEGER,development_fixture INTEGER,hierarchy TEXT);
    CREATE TABLE credentials (user_id TEXT,password_hash TEXT,access_code_hash TEXT,status TEXT);
    CREATE TABLE server_sessions (id TEXT,token_hash TEXT,user_id TEXT,created_at TEXT,expires_at TEXT,revoked_at TEXT,csrf_token_hash TEXT,login_scope_json TEXT);
    CREATE TABLE district_sports_records (id TEXT PRIMARY KEY,district_id TEXT,school_id TEXT,record_type TEXT,payload_json TEXT,created_by TEXT,created_at TEXT);
    CREATE TABLE subscriptions (id TEXT,school_id TEXT,status TEXT,expires_at TEXT);
    CREATE TABLE roles (id TEXT PRIMARY KEY,name TEXT);
    CREATE TABLE user_roles (user_id TEXT,role_id TEXT);
    CREATE TABLE permissions (id TEXT PRIMARY KEY,name TEXT);
    CREATE TABLE role_permissions (role_id TEXT,permission_id TEXT);
    CREATE TABLE tenants (id TEXT PRIMARY KEY,tenant_type TEXT,active INTEGER,parent_id TEXT);
    CREATE TABLE tenant_memberships (user_id TEXT,tenant_id TEXT,scope_json TEXT,active INTEGER);
    CREATE TABLE parent_student_relationships (parent_user_id TEXT,student_id TEXT,active INTEGER);
    CREATE TABLE regions (id TEXT PRIMARY KEY,name TEXT,national_tenant_id TEXT);
    CREATE TABLE districts (id TEXT PRIMARY KEY,name TEXT,region_id TEXT);
    CREATE TABLE schools (id TEXT PRIMARY KEY,name TEXT,school_code TEXT,tenant_id TEXT,district_id TEXT,active INTEGER,district_sync_enabled INTEGER,district_sync_actor_id TEXT,district_sync_updated_at TEXT);
    CREATE TABLE students (id TEXT PRIMARY KEY,full_name TEXT,student_identifier TEXT,tenant_id TEXT,school_id TEXT,class_id TEXT,gender TEXT,special_needs TEXT,status TEXT);
    CREATE TABLE staff (id TEXT PRIMARY KEY,user_id TEXT,full_name TEXT,tenant_id TEXT,school_id TEXT,status TEXT);
    CREATE TABLE classes (id TEXT PRIMARY KEY,name TEXT,tenant_id TEXT,school_id TEXT,status TEXT);
    CREATE TABLE pending_admission_applications (id TEXT PRIMARY KEY,school_id TEXT,status TEXT);
    CREATE TABLE published_results (id TEXT PRIMARY KEY,school_id TEXT,tenant_id TEXT,class_id TEXT,student_id TEXT,result_json TEXT,publication_status TEXT,updated_at TEXT);
    CREATE TABLE attendance_registers (id TEXT PRIMARY KEY,school_id TEXT,tenant_id TEXT,class_id TEXT,attendance_date TEXT);
    CREATE TABLE student_attendance_records (id TEXT PRIMARY KEY,register_id TEXT,school_id TEXT,student_id TEXT,status TEXT);
    CREATE TABLE teacher_attendance_records (id TEXT PRIMARY KEY,school_id TEXT,tenant_id TEXT,staff_id TEXT,attendance_date TEXT);
    CREATE TABLE academic_report_snapshots (id TEXT PRIMARY KEY,report_type TEXT,school_id TEXT,tenant_id TEXT,class_id TEXT,created_at TEXT,snapshot_json TEXT);
    CREATE TABLE examinations (id TEXT PRIMARY KEY,school_id TEXT,tenant_id TEXT,class_id TEXT,created_at TEXT);
    CREATE TABLE scores (id TEXT PRIMARY KEY,school_id TEXT,tenant_id TEXT,class_id TEXT,student_id TEXT,subject_id TEXT,raw_score REAL,maximum_score REAL,status TEXT,examination_id TEXT,updated_at TEXT);
    CREATE TABLE subjects (id TEXT PRIMARY KEY,school_id TEXT,tenant_id TEXT,name TEXT);
    CREATE TABLE academic_configurations (id TEXT PRIMARY KEY,school_id TEXT,tenant_id TEXT,academic_year TEXT,term TEXT);
    CREATE TABLE examination_types (id TEXT PRIMARY KEY,school_id TEXT,tenant_id TEXT,name TEXT);
    CREATE TABLE mock_examinations (id TEXT PRIMARY KEY,school_id TEXT,tenant_id TEXT,class_id TEXT,created_at TEXT);
    CREATE TABLE examination_components (id TEXT PRIMARY KEY,examination_id TEXT,name TEXT,position_no INTEGER);
    CREATE TABLE mock_components (id TEXT PRIMARY KEY,mock_examination_id TEXT,name TEXT);
    CREATE TABLE mock_scores (id TEXT PRIMARY KEY,mock_examination_id TEXT,updated_at TEXT);
    CREATE TABLE broadsheets (id TEXT PRIMARY KEY,school_id TEXT,tenant_id TEXT,class_id TEXT,created_at TEXT);
    CREATE TABLE promotion_records (id TEXT PRIMARY KEY,school_id TEXT,tenant_id TEXT,created_at TEXT);
    CREATE TABLE audit_events (id TEXT PRIMARY KEY,event_type TEXT,actor_user_id TEXT,occurred_at TEXT,correlation_id TEXT,ip TEXT,user_agent TEXT,metadata_json TEXT);
    INSERT INTO tenants VALUES ('n1','NATIONAL',1,NULL),('n2','NATIONAL',1,NULL),('t1','SCHOOL',1,'n1'),('t2','SCHOOL',1,'n1'),('t3','SCHOOL',1,'n2');
    INSERT INTO regions VALUES ('r1','Central Region','n1'),('r2','Ashanti Region','n1'),('r3','Greater Accra Region','n2');
    INSERT INTO districts VALUES ('d1','Cape Coast Metro','r1'),('d2','Kumasi Metro','r2'),('d3','Accra Metro','r3');
  `);
  sqlite.exec('ALTER TABLE tenants ADD COLUMN name TEXT');
  const insert=(table,row)=>sqlite.prepare(`INSERT INTO ${table} (${Object.keys(row).join(',')}) VALUES (${Object.keys(row).map(()=>'?').join(',')})`).run(...Object.values(row));
  for(let i=1;i<=3;i++){
    insert('schools',{id:'s'+i,name:'School '+i,school_code:'SC'+i,tenant_id:'t'+i,district_id:'d'+i,active:1,district_sync_enabled:i===1?0:1,district_sync_actor_id:i===1?null:'ht'+i});
    insert('students',{id:'p'+i,full_name:'Pupil '+i,student_identifier:'PERMANENT-'+i,tenant_id:'t'+i,school_id:'s'+i,class_id:'c'+i,gender:'female',special_needs:'',status:'ACTIVE'});
    insert('staff',{id:'staff'+i,user_id:'ht'+i,full_name:'Staff '+i,tenant_id:'t'+i,school_id:'s'+i,status:'ACTIVE'});
    insert('subscriptions',{id:'sub'+i,school_id:'s'+i,status:'ACTIVE',expires_at:'2099-01-01 00:00:00'});
    insert('classes',{id:'c'+i,name:'Class '+i,tenant_id:'t'+i,school_id:'s'+i,status:'ACTIVE'});
    insert('published_results',{id:'result'+i,school_id:'s'+i,tenant_id:'t'+i,class_id:'c'+i,student_id:'p'+i,result_json:JSON.stringify({percentage:70+i}),publication_status:'PUBLISHED',updated_at:'2026-09-01'});
    insert('attendance_registers',{id:'reg'+i,school_id:'s'+i,tenant_id:'t'+i,class_id:'c'+i,attendance_date:'2026-09-01'});
    insert('student_attendance_records',{id:'att'+i,register_id:'reg'+i,school_id:'s'+i,student_id:'p'+i,status:'PRESENT'});
    insert('teacher_attendance_records',{id:'tatt'+i,school_id:'s'+i,tenant_id:'t'+i,staff_id:'staff'+i,attendance_date:'2026-09-01'});
    insert('academic_report_snapshots',{id:'report'+i,report_type:'annual',school_id:'s'+i,tenant_id:'t'+i,class_id:'c'+i,created_at:'2026-09-01',snapshot_json:'{}'});
    for(const table of ['subjects','examination_types'])insert(table,{id:table+i,school_id:'s'+i,tenant_id:'t'+i,name:table+i});
    for(const table of ['examinations','mock_examinations'])insert(table,{id:table+i,school_id:'s'+i,tenant_id:'t'+i,class_id:'c'+i,created_at:'2026-09-01'});
    insert('examination_components',{id:'ec'+i,examination_id:'examinations'+i,name:'Exam Component',position_no:1});
    insert('mock_components',{id:'mc'+i,mock_examination_id:'mock_examinations'+i,name:'Mock Component'});
    insert('mock_scores',{id:'ms'+i,mock_examination_id:'mock_examinations'+i,updated_at:'2026-09-01'});
    insert('broadsheets',{id:'bs'+i,school_id:'s'+i,tenant_id:'t'+i,class_id:'c'+i,created_at:'2026-09-01'});
    insert('academic_configurations',{id:'config'+i,school_id:'s'+i,tenant_id:'t'+i,academic_year:'2026',term:'1'});
    insert('promotion_records',{id:'promotion'+i,school_id:'s'+i,tenant_id:'t'+i,created_at:'2026-09-01'});
    insert('scores',{id:'score'+i,school_id:'s'+i,tenant_id:'t'+i,class_id:'c'+i,student_id:'p'+i,subject_id:'subjects'+i,raw_score:70,maximum_score:100,status:'PUBLISHED',examination_id:'examinations'+i,updated_at:'2026-09-01'});
  }
  const grants=['scope.read','schools.manage','controlpanel.view','controlpanel.export','ai.use','reporting.read','students.manage','staff.manage','classes.manage','attendance.manage','academics.manage','examinations.manage','scores.manage','results.manage','promotion.manage','communications.manage','communications.view'];
  for(const permission of grants)insert('permissions',{id:permission,name:permission});
  const accounts={ht1:['HEADTEACHER','SCHOOL','t1',{schoolIds:['s1'],tenantIds:['t1'],classIds:['c1']}],ht2:['HEADTEACHER','SCHOOL','t2',{schoolIds:['s2'],tenantIds:['t2']}],district:['DISTRICT_ADMIN','DISTRICT','t1',{districtIds:['d1']}],otherDistrict:['DISTRICT_ADMIN','DISTRICT','t2',{districtIds:['d2']}],regional:['REGIONAL_ADMIN','REGIONAL','t1',{regionIds:['r1']}],national:['NATIONAL_ADMIN','NATIONAL','n1',{}],teacher:['TEACHER','SCHOOL','t1',{schoolIds:['s1']}],parent:['PARENT','SCHOOL','t1',{schoolIds:['s1']}],student:['STUDENT','SCHOOL','t1',{schoolIds:['s1']}],super:['SUPER_ADMIN','NATIONAL','n1',{}],support:['DISTRICT_SISO','DISTRICT','t1',{districtIds:['d1']}],noPermission:['DISTRICT_SPORTS_OFFICER','DISTRICT','t1',{districtIds:['d1']}]};
  const users=[],sessions=[],tokens={};const roleSet=new Set();
  const accessCode=crypto.randomBytes(12).toString('hex'),salt=crypto.randomBytes(16).toString('hex');
  const encoded=salt+':'+crypto.scryptSync(accessCode,salt,64).toString('hex');
  accounts.wrongTenantHeadteacher=['HEADTEACHER','SCHOOL','t1',{schoolIds:['s2']}];
  accounts.regionalNarrow=['REGIONAL_ADMIN','REGIONAL','t1',{regionIds:['r1'],districtIds:['d1b']}];
  accounts.nationalNarrow=['NATIONAL_ADMIN','NATIONAL','n1',{regionIds:['r1'],districtIds:['d1']}];
  accounts.nationalSchool=['NATIONAL_ADMIN','NATIONAL','n1',{schoolIds:['s1']}];
  accounts.districtDetails=['DISTRICT_ADMIN','DISTRICT','t1',{districtIds:['d1'],classIds:['c1']}];
  for(const [role,{level}] of Object.entries(require('../app/auth/administrative-scope').CORE_ROLES)) {
    accounts['officer-'+role]=[role,level,level==='NATIONAL'?'n1':'t1',level==='DISTRICT'?{districtIds:['d1']}:level==='REGIONAL'?{regionIds:['r1']}:{}];
  }
  for(const [id,[role,level,tenantId,scope]] of Object.entries(accounts)){
    insert('users',{id,staff_id:'STAFF-'+id,scope_json:JSON.stringify(scope),status:'ACTIVE',active:1,development_fixture:0,hierarchy:level});
    insert('credentials',{user_id:id,password_hash:encoded,access_code_hash:encoded,status:'ACTIVE'});
    if(!roleSet.has(role)){
      roleSet.add(role);insert('roles',{id:role,name:role});
      for(const permission of (id==='noPermission'?['scope.read']:grants))insert('role_permissions',{role_id:role,permission_id:permission});
    }
    insert('user_roles',{user_id:id,role_id:role});insert('tenant_memberships',{user_id:id,tenant_id:tenantId,scope_json:JSON.stringify(scope),active:1});
    users.push({id,role,hierarchy:level,active:true});tokens[id]=crypto.randomBytes(18).toString('hex');
    sessions.push({id:'session-'+id,userId:id,tokenHash:crypto.createHash('sha256').update(tokens[id]).digest('hex'),expiresAt:'2099-01-01T00:00:00.000Z'});
    insert('server_sessions',{id:'session-'+id,user_id:id,token_hash:sessions.at(-1).tokenHash,created_at:'2026-09-01 00:00:00',expires_at:'2099-01-01 00:00:00'});
  }
  const connection={release(){},escape:value=>"'"+String(value).replace(/'/g,"''")+"'",beginTransaction:async()=>sqlite.exec('BEGIN'),commit:async()=>sqlite.exec('COMMIT'),rollback:async()=>sqlite.exec('ROLLBACK'),query:async(sql,params=[])=>{
    // Schema is explicitly built above. No DDL is tested by this adapter.
    if(/^SELECT version FROM schema_migrations/.test(sql))return [[{version:26}]];
    if(/^(CREATE TABLE|ALTER TABLE)/.test(sql))return [[]];
    sql=sql.replace(/ FOR UPDATE\b/g,'');
    const values=params.map(v=>v===undefined?null:typeof v==='boolean'?Number(v):v instanceof Date?v.toISOString():v);
    const stmt=sqlite.prepare(sql);
    return /^SELECT\b/.test(sql)?[stmt.all(...values)]:[{affectedRows:stmt.run(...values).changes}];
  }};
  const originalPool=mysql.createPool;
  connection.execute=connection.query;
  mysql.createPool=()=>({...connection,getConnection:async()=>connection,end:async()=>{}});
  const relational=require('../db/relational');
  sqlite.exec("UPDATE users SET email='synthetic-parent@example.invalid' WHERE id='parent'; INSERT INTO parent_student_relationships VALUES ('parent','p1',1),('parent','p2',1)");
  const handler=require('../api/index');
  let server;
  try{
    server=http.createServer((req,res)=>Promise.resolve(handler(req,res)).catch(error=>{console.error(error);res.writeHead(500);res.end(JSON.stringify({error:error.message}));}));
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const base='http://127.0.0.1:'+server.address().port;
    const request=async(user,url,body,origin=base)=>{
      const response=await fetch(base+url,{method:body===undefined?'GET':'POST',headers:{Cookie:'edutrack_session='+tokens[user],Origin:origin,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
      const text=await response.text();let value;try{value=JSON.parse(text);}catch{value=text;}return {status:response.status,body:value};
    };
    const check=async(user,url,status,body)=>{const result=await request(user,url,body);assert.equal(result.status,status,`${user} ${url}: ${JSON.stringify(result.body)}`);return result.body;};
    const schools=async user=>(await check(user,'/api/control-panel/summary',200)).schools.map(row=>row.schoolId);
    const login=await fetch(base+'/api/school-login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({region:'Central Region',district:'Cape Coast Metro',staffId:'STAFF-ht1',role:'Headteacher',accessCode})});
    const loginBody=await login.json();assert.equal(login.status,200,JSON.stringify(loginBody));assert.equal(loginBody.authenticated,true);
    assert.equal(loginBody.school.id,'s1');assert.match(login.headers.get('set-cookie'),/HttpOnly/);
    tokens.ht1=login.headers.get('set-cookie').split(';')[0].split('=')[1];
    assert.equal((await check('ht1','/api/auth/session',200)).authenticated,true,'new School login session survives relational hydration');
    assert.equal((await check('ht1','/api/school-district-sync',200)).schoolId,'s1','existing Headteacher control uses the login session');
    const rejected=await fetch(base+'/api/school-login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({region:'Central Region',district:'Cape Coast Metro',staffId:'STAFF-ht1',role:'Headteacher',accessCode:'incorrect'})});
    assert.equal(rejected.status,401);await rejected.text();
    sqlite.exec("UPDATE credentials SET status='INACTIVE' WHERE user_id='ht1'");
    const inactive=await fetch(base+'/api/school-login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({region:'Central Region',district:'Cape Coast Metro',staffId:'STAFF-ht1',role:'Headteacher',accessCode})});
    assert.equal(inactive.status,401);await inactive.text();
    sqlite.exec("UPDATE credentials SET status='ACTIVE' WHERE user_id='ht1'");
    const jwt=require('jsonwebtoken');
    for(const role of ['DISTRICT_ADMIN','REGIONAL_ADMIN','NATIONAL_ADMIN','District Director of Education','SISO','HEADTEACHER']){
      const token=jwt.sign({role,schoolCode:'SC1'},process.env.JWT_SECRET,{expiresIn:'1h'});
      const response=await fetch(base+'/api/config?schoolCode=SC1',{headers:{Authorization:'Bearer '+token}});
      assert.equal(response.status,role==='HEADTEACHER'?200:403,'legacy school API: '+role);
      await response.text();
    }
    for(const [user,regions,districts] of [['district',['r1'],['d1']],['regional',['r1'],['d1']],['national',['r1','r2'],['d1','d2']]]) {
      assert.deepEqual((await check(user,'/api/domain/regions',200)).regions.map(x=>x.id).sort(),regions);
      assert.deepEqual((await check(user,'/api/domain/districts',200)).districts.map(x=>x.id).sort(),districts);
    }
    await check('district','/api/domain/districts?regionId=r2',403);
    await check('national','/api/domain/districts?regionId=r3',403);
    const local=await check('ht1','/api/domain/students?schoolId=s1',200);assert.equal(local.students.length,1);
    assert.equal(local.students[0].studentIdentifier,'PERMANENT-1');
    for(const user of ['district','regional','national'])assert.ok(!(await schools(user)).includes('s1'),'OFF excludes '+user);
    assert.deepEqual(await schools('national'),['s2'],'National root excludes s3 in other National scope');
    const routes=[['academic-config','configurations'],['subjects','subjects'],['attendance','attendance'],['examination-types','examinationTypes'],['examinations','examinations'],['scores','scores'],['results','results'],['academic-reports/annual','reports'],['promotions','promotions'],['mock-examinations','mockExaminations'],['teacher-attendance','attendance'],['schools','schools'],['staff','staff'],['students','students'],['classes','classes']];
    routes.push(['broadsheets','broadsheets']);
    for(const [route,key] of routes){const data=await check('district','/api/domain/'+route,200);assert.equal(data[key].length,0,'OFF unfiltered '+route);}
    await check('regional','/api/domain/attendance?schoolId=s1',403);
    await check('national','/api/domain/result-slips/result1',403);
    for(const user of ['district','otherDistrict','regional','national','teacher','parent','student','super','support'])await check(user,'/api/school-district-sync?schoolId=s1',403,{enabled:true});
    for(const user of Object.keys(accounts).filter(id=>id.startsWith('officer-')))await check(user,'/api/school-district-sync?schoolId=s1',403,{enabled:true});
    await check('ht2','/api/school-district-sync?schoolId=s1',403,{enabled:true});
    await check('wrongTenantHeadteacher','/api/school-district-sync?schoolId=s2',403,{enabled:true});
    await check('ht1','/api/school-district-sync',403,{enabled:true,schoolId:'s2'});
    assert.equal((await request('ht1','/api/school-district-sync',{enabled:true},'https://evil.invalid')).status,403);
    await check('ht1','/api/school-district-sync',400,{enabled:'true'});
    await check('noPermission','/api/control-panel/summary',403);
    await check('ht1','/api/school-district-sync',200,{enabled:true});
    for(const user of ['district','regional','national'])assert.ok((await schools(user)).includes('s1'),'ON eligible '+user);
    for(const [route,key] of routes){const data=await check('district','/api/domain/'+route,200);assert.equal(data[key].length,1,'ON scoped '+route);}
    await check('regional','/api/domain/attendance?schoolId=s1',200);
    assert.equal((await check('regional','/api/domain/examination-components?schoolId=s1&tenantId=t1&examinationId=examinations1',200)).components.length,1);
    assert.equal((await check('regional','/api/domain/mock-components?schoolId=s1&tenantId=t1&mockExaminationId=mock_examinations1',200)).components.length,1);
    // School/Class scope remains mandatory for personal mock scores.
    await check('regional','/api/domain/mock-scores?schoolId=s1&tenantId=t1&classId=c1&mockExaminationId=mock_examinations1',403);
    assert.equal((await check('districtDetails','/api/domain/mock-scores?schoolId=s1&tenantId=t1&classId=c1&mockExaminationId=mock_examinations1',200)).scores.length,1);
    assert.equal((await check('districtDetails','/api/domain/broadsheets?schoolId=s1&tenantId=t1&classId=c1&examinationId=examinations1',200)).broadsheets[0].studentId,'p1');
    await check('otherDistrict','/api/domain/attendance?schoolId=s1',403);
    await check('district','/api/domain/attendance?schoolId=s2',403);
    await check('national','/api/domain/attendance?schoolId=s3',403);
    await check('noPermission','/api/domain/students?schoolId=s1',403);
    await check('district','/api/communications/audience-count',403,{audience:{kind:'ALL_STUDENTS'}});
    await check('regional','/api/communications/campaigns',403);
    const audience=await relational.resolveCommunicationAudience({kind:'ALL_PARENTS'},{schoolId:'s1'});
    assert.deepEqual(audience.map(row=>row.studentId),['p1'],'a parent linked to two schools does not reveal the other child');
    await check('regional','/api/domain/result-slips/result1',403); // Personal class/student scope is still required.
    const narrative=await check('district','/api/ai/narrative',200,{level:'school'});
    assert.equal(narrative.facts.level,'district');assert.equal(narrative.facts.metrics.assessments,1);assert.equal(narrative.facts.metrics.attendanceRate,100);
    const csv=await check('district','/api/control-panel/export.csv',200);assert.match(csv,/School 1/);assert.doesNotMatch(csv,/School 2/);
    await check('ht1','/api/school-district-sync',200,{enabled:false});
    for(const user of ['district','regional','national'])assert.ok(!(await schools(user)).includes('s1'),'OFF again excludes '+user);
    for(const [route,key] of routes){const data=await check('district','/api/domain/'+route,200);assert.equal(data[key].length,0,'OFF again '+route);}
    const offNarrative=await check('district','/api/ai/narrative',200,{level:'school'});assert.equal(offNarrative.facts.metrics.assessments,undefined);
    await check('district','/api/domain/attendance?schoolId=s1',403);
    await check('regional','/api/domain/examination-components?schoolId=s1&tenantId=t1&examinationId=examinations1',403);
    await check('regional','/api/domain/mock-components?schoolId=s1&tenantId=t1&mockExaminationId=mock_examinations1',403);
    await check('districtDetails','/api/domain/mock-scores?schoolId=s1&tenantId=t1&classId=c1&mockExaminationId=mock_examinations1',403);
    await check('districtDetails','/api/domain/broadsheets?schoolId=s1&tenantId=t1&classId=c1&examinationId=examinations1',403);
    assert.doesNotMatch(await check('district','/api/control-panel/export.csv',200),/School 1/);
    assert.equal((await check('ht1','/api/domain/students?schoolId=s1',200)).students[0].studentIdentifier,'PERMANENT-1');
    assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM students').get().n,3);
    assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM published_results').get().n,3);
    const audit=sqlite.prepare("SELECT actor_user_id,occurred_at,metadata_json FROM audit_events WHERE event_type='SCHOOL_DISTRICT_SYNC_CHANGED' ORDER BY rowid").all();
    assert.equal(audit.length,2);assert.equal(audit[0].actor_user_id,'ht1');assert.ok(audit[0].occurred_at);
    assert.deepEqual(audit.map(x=>{const a=JSON.parse(x.metadata_json);return [a.schoolId,a.previousEnabled,a.enabled];}),[['s1',false,true],['s1',true,false]]);
    // New School-originated data written during each consent phase remains
    // available locally and is eligible upward only while consent is ON.
    for(const [phase,enabled] of [['OFF',false],['ON',true],['OFF_AGAIN',false]]){
      if(phase!=='OFF')await check('ht1','/api/school-district-sync',200,{enabled});
      const id='release-'+phase;
      insert('students',{id,full_name:'Release '+phase,student_identifier:'PERMANENT-'+phase,tenant_id:'t1',school_id:'s1',class_id:'c1',status:'ACTIVE'});
      assert.ok((await check('ht1','/api/domain/students?schoolId=s1',200)).students.some(x=>x.id===id),'School retains new '+phase+' record');
      for(const user of ['district','regional','national']){
        const data=await check(user,'/api/domain/students',200);
        assert.equal(data.students.some(x=>x.id===id),enabled,user+' new record eligibility '+phase);
        await check(user,'/api/domain/students?schoolId=s1',enabled?200:403);
      }
    }
    assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM students WHERE id LIKE 'release-%'").get().n,3,'revocation retains all new records');
    // Remove only this disposable fixture's extra rows so later coverage assertions
    // keep their independent baseline. Application APIs never delete these records.
    sqlite.exec("DELETE FROM students WHERE id LIKE 'release-%'");
    console.log('PASS Part 5 acceptance: new School data in OFF/ON/OFF-again phases, all three upward levels, direct bypass denied, permanent IDs and local data retained');
    console.log('PASS HTTP/SQL matrix: OFF → ON → OFF, 3 macro levels, 16 unfiltered data routes, component drill-downs, direct School-ID requests, CSV, narrative, other roles, cross-school/district/National-root attacks, resource denial, preserved records/IDs and audit history');
    // Part 3 uses real persisted grants, logins and the same SQL fixture.
    const matrix=require('../app/auth/administrative-scope').DISTRICT_PERMISSIONS;
    for(const [role,permissions] of Object.entries(matrix))for(const permission of permissions){
      sqlite.prepare('INSERT OR IGNORE INTO permissions (id,name) VALUES (?,?)').run(permission,permission);
      sqlite.prepare('INSERT OR IGNORE INTO role_permissions (role_id,permission_id) SELECT ?,? WHERE NOT EXISTS (SELECT 1 FROM role_permissions WHERE role_id=? AND permission_id=?)').run(role,permission,role,permission);
    }
    for(let i=4;i<=32;i++)insert('schools',{id:'coverage'+i,name:'Coverage School '+i,school_code:'COV'+i,tenant_id:'t1',district_id:'d1',active:1,district_sync_enabled:i<=22?1:0,district_sync_actor_id:i<=22?'ht1':null});
    await check('ht1','/api/school-district-sync',200,{enabled:true});
    const districtUrl=(view,extra='')=>'/api/control-panel/district?view='+view+'&districtId=d1'+extra;
    for(const [role,permissions] of Object.entries(matrix)){
      const user='officer-'+role;
      const login=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({staffId:'STAFF-'+user,accessCode,administrativeLevel:'DISTRICT',region:'Central Region',district:'Cape Coast Metro',role})});
      const data=await login.json();assert.equal(login.status,200,JSON.stringify(data));assert.equal(data.authorization.dashboard,'district-general');
      tokens[user]=login.headers.get('set-cookie').split(';')[0].split('=')[1];
      assert.equal((await check(user,'/api/control-panel/district?view=context',200)).role,role);
      const overview=await check(user,districtUrl('overview'),200);
      assert.deepEqual(overview.coverage,{total:30,synchronized:20,notSynchronized:10,reportingCoverage:'20/30',scope:'District'});
      assert.equal(overview.schools.length,20);assert.ok(!JSON.stringify(overview).includes('Coverage School 32'));
      for(const [view,permission] of [['attendance','district.attendance.read'],['examinations','district.examinations.read'],['sports','district.sports.read'],['export','district.reports.export']])await check(user,districtUrl(view),permissions.includes(permission)?200:403);
      for(const view of ['overview','schools','attendance','examinations','sports','export'])await check(user,'/api/control-panel/district?view='+view+'&districtId=d2',403);
      await check(user,districtUrl('schools','&schoolId=s2'),403);
      await check(user,districtUrl('schools','&schoolId=coverage32'),403);
      await check(user,districtUrl('schools','&schoolId=s1'),200);
      await check(user,districtUrl('sports'),permissions.includes('district.sports.manage')?201:403,{districtId:'d1',schoolId:'s1',type:'calendar',record:{eventName:'Verified event',sport:'Football'}});
    }
    const sportsUser='officer-DISTRICT_SPORTS_OFFICER';
    await check(sportsUser,districtUrl('sports'),403,{districtId:'d2',schoolId:'s2',type:'calendar',record:{eventName:'Forged scope'}});
    await check(sportsUser,districtUrl('sports'),403,{districtId:'d1',schoolId:'s2',type:'calendar',record:{eventName:'Foreign school'}});
    await check(sportsUser,districtUrl('sports'),403,{districtId:'d1',schoolId:'coverage32',type:'athletes',record:{studentName:'Unsynchronized'}});
    assert.equal((await request(sportsUser,districtUrl('sports'),{districtId:'d1',schoolId:'s1',type:'calendar',record:{}},'https://evil.invalid')).status,403);
    assert.equal((await check(sportsUser,districtUrl('sports'),200)).records.length,1);
    await check('ht1','/api/school-district-sync',200,{enabled:false});
    assert.equal((await check(sportsUser,districtUrl('sports'),200)).records.length,0);
    await check(sportsUser,districtUrl('sports'),403,{districtId:'d1',schoolId:'s1',type:'calendar',record:{eventName:'After revocation'}});
    assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM district_sports_records').get().n,1,'revocation preserves sports history');
    const narrowed=await check('district',districtUrl('overview'),200);assert.equal(narrowed.coverage.reportingCoverage,'19/30');
    await check('teacher',districtUrl('overview'),403);
    await check('noPermission',districtUrl('overview'),200); // The role now has its explicit baseline grants.
    sqlite.prepare('DELETE FROM role_permissions WHERE role_id=? AND permission_id=?').run('DISTRICT_SISO','district.dashboard.view');
    await check('support',districtUrl('overview'),403);
    sqlite.prepare('INSERT INTO role_permissions VALUES (?,?)').run('DISTRICT_SISO','district.dashboard.view');
    if(process.env.EDUTRACK_DISTRICT_BROWSER==='1'){
      await check('ht1','/api/school-district-sync',200,{enabled:true});
      await require('./district-dashboard.browser.spec')(base,accessCode,matrix);
    }
    for(const role of Object.keys(matrix)){const user='officer-'+role;await check(user,'/api/auth/logout',200,{});await check(user,'/api/auth/session',401);await check(user,districtUrl('overview'),401);}
    console.log('PASS Part 3 HTTP/SQL: all 5 District-role logins and permission matrix, 30/20/10 coverage, synchronized drill-down, cross-District/School/body attacks, sports write/read/revocation/history, missing grant, and server session logout');
    await require('./upper-dashboards-http.spec')({sqlite,insert,base,accessCode,tokens,check,request});
    await require('./hierarchical-login-http.spec')({base,accessCode,sqlite});
    console.log('SQL backend: disposable in-memory SQLite adapter; no TiDB connection or migration executed.');
  } finally {
    if(server)await new Promise(resolve=>server.close(resolve));
    mysql.createPool=originalPool;sqlite.close();
    assert.equal(path.dirname(path.resolve(temp)),path.resolve(os.tmpdir()));
    assert.ok(path.basename(temp).startsWith('edutrack-macro-http-'));
    fs.rmSync(temp,{recursive:true,force:true});
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
