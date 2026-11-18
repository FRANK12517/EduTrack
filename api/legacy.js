'use strict';

const crypto = require('node:crypto');
const relational = require('../db/relational');
const authorization = require('../app/auth/authorization');
const administrativeScope = require('../app/auth/administrative-scope');
const supabaseAuth = require('../lib/supabase-auth');

function readBody(req) {
  if (req.body && typeof req.body === 'object') return Promise.resolve(req.body);
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => { raw += chunk; if (raw.length > 2_000_000) reject(new Error('Payload too large')); });
    req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch { reject(new Error('Invalid JSON')); } });
    req.on('error', reject);
  });
}
function json(res, status, value) {
  if (res.headersSent) return;
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(value));
}
function tokenFrom(req) {
  const header = String(req.headers.authorization || '');
  return header.startsWith('Bearer ') ? header.slice(7) : '';
}
function canonicalRole(value) { return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }
const ROLE_ALIASES = Object.freeze({ 'head teacher':'HEADTEACHER', headteacher:'HEADTEACHER', headmaster:'HEADTEACHER', headmistress:'HEADTEACHER', 'assistant headteacher':'ASSISTANT_HEADTEACHER', 'assistant head teacher':'ASSISTANT_HEADTEACHER', 'asst headteacher':'ASSISTANT_HEADTEACHER', teacher:'TEACHER', 'class teacher':'TEACHER', 'classroom teacher':'TEACHER' });
function schoolRole(value) { return ROLE_ALIASES[canonicalRole(value)] || null; }
function safeRole(authz) { return authz.roles.find(role => ['HEADTEACHER','ASSISTANT_HEADTEACHER','TEACHER'].includes(role)) || null; }
async function resolveBearer(req, res) {
  const token = tokenFrom(req);
  if (!token) { json(res, 401, { error: 'Authentication required' }); return null; }
  try {
    const identity = await supabaseAuth.getUser(token);
    const user = await relational.findUserByAuthId(identity.id);
    if (!user || !user.active || user.status !== 'ACTIVE') { json(res, 401, { error: 'Authentication required' }); return null; }
    const authorizationState = await relational.resolveAuthorization(user.id);
    if (!authorizationState) { json(res, 403, { error: 'Permission denied' }); return null; }
    return { token, user, authorization: authorizationState };
  } catch {
    json(res, 401, { error: 'Authentication required' });
    return null;
  }
}
async function schoolAssignment(userId, schoolCode) {
  const rows = await relational.domainRows(`
    SELECT s.id AS school_id,s.school_code,s.name AS school_name,s.active AS school_active,
           s.tenant_id,s.registration_metadata,d.name AS district,r.name AS region,r.id AS region_id,
           st.id AS staff_record_id,st.staff_identifier,st.full_name
    FROM staff st
    JOIN staff_school_assignments a ON a.staff_id=st.id AND a.active IS TRUE
    JOIN schools s ON s.id=a.school_id
    JOIN districts d ON d.id=s.district_id
    JOIN regions r ON r.id=d.region_id
    WHERE st.user_id=? AND st.status='ACTIVE' AND s.active IS TRUE AND s.school_code=?
    ORDER BY st.created_at LIMIT 2`, [userId, schoolCode]);
  return rows.length === 1 ? rows[0] : null;
}
async function schoolAuthorization(bearer, schoolCode, permissionNames) {
  if (!bearer?.user?.id || !schoolCode) return null;
  const trusted = bearer.authorization;
  const role = safeRole(trusted);
  if (!role) return null;
  const school = await schoolAssignment(bearer.user.id, schoolCode);
  if (!school) return null;
  const roleAuthorization = { ...trusted, roles: [role], rolePermissions: { [role]: trusted.rolePermissions[role] || [] } };
  for (const permission of permissionNames) {
    const decision = authorization.evaluate(roleAuthorization, { permission, scope: { schoolId: school.school_id } });
    if (!decision.allowed) return null;
  }
  let assignedClass = null;
  if (role === 'TEACHER') {
    const classes = await relational.domainRows(`SELECT c.id,c.name FROM teacher_class_assignments tca
      JOIN staff st ON st.id=tca.staff_id JOIN classes c ON c.id=tca.class_id
      WHERE st.user_id=? AND tca.active IS TRUE AND c.school_id=? AND c.status='ACTIVE' ORDER BY c.name`, [bearer.user.id, school.school_id]);
    assignedClass = classes.map(row => ({ id: row.id, name: row.name }));
    if (!assignedClass.length) return null;
  }
  return { userId: bearer.user.id, schoolId: school.school_id, schoolCode: school.school_code,
    role, school, assignedClass, authorization: roleAuthorization };
}
async function login(req, res) {
  const input = await readBody(req);
  const schoolCode = String(input.schoolCode || '').trim();
  const staffId = String(input.staffId || '').trim();
  const password = String(input.password || '');
  if (!schoolCode || !staffId || !password) return json(res, 400, { error: 'schoolCode, staffId and password are required' });
  const authenticated = await relational.authenticateUserSession(staffId, password);
  if (!authenticated) return json(res, 401, { error: 'Invalid credentials' });
  const trusted = await relational.resolveAuthorization(authenticated.user.id);
  const role = safeRole(trusted || { roles: [] });
  const assignment = await schoolAssignment(authenticated.user.id, schoolCode);
  if (!trusted || !role || !assignment) return json(res, 401, { error: 'Invalid credentials' });
  return json(res, 200, { token: authenticated.authSession.accessToken, refreshToken: authenticated.authSession.refreshToken,
    expiresAt: authenticated.authSession.expiresAt, user: { staffId: authenticated.user.staffId, name: assignment.full_name, role,
      assignedClass: null, assignedForm: null, schoolName: assignment.school_name, region: assignment.region, district: assignment.district } });
}
async function schoolLogin(req, res) {
  const input = await readBody(req);
  const region = String(input.region || '').trim(), district = String(input.district || '').trim();
  const staffId = String(input.staffId || '').trim(), role = schoolRole(input.role), accessCode = String(input.accessCode || '');
  if (!region || !district || !staffId || !role || !accessCode) return json(res, 400, { error: 'Invalid School login selection' });
  const authenticated = await relational.authenticateUserSession(staffId, accessCode);
  if (!authenticated) return json(res, 401, { error: 'Invalid staff ID, access code, or role' });
  const trusted = await relational.resolveAuthorization(authenticated.user.id);
  const assignment = await schoolAssignment(authenticated.user.id, String(input.schoolCode || '').trim());
  const actualRole = safeRole(trusted || { roles: [] });
  if (!trusted || !assignment || actualRole !== role || canonicalRole(assignment.region).replace(/ region$/, '') !== canonicalRole(region).replace(/ region$/, '') || canonicalRole(assignment.district) !== canonicalRole(district)) {
    return json(res, 401, { error: 'Invalid staff ID, access code, or role' });
  }
  const roleAuthorization = { ...trusted, roles: [role], rolePermissions: { [role]: trusted.rolePermissions[role] || [] } };
  if (!authorization.evaluate(roleAuthorization, { permission: 'scope.read', scope: { schoolId: assignment.school_id } }).allowed) return json(res, 401, { error: 'Invalid staff ID, access code, or role' });
  const classAssignments = role === 'TEACHER' ? await relational.domainRows(`SELECT c.id,c.name FROM teacher_class_assignments tca
    JOIN staff st ON st.id=tca.staff_id JOIN classes c ON c.id=tca.class_id
    WHERE st.user_id=? AND tca.active IS TRUE AND c.school_id=? AND c.status='ACTIVE' ORDER BY c.name`, [authenticated.user.id, assignment.school_id]) : [];
  if (role === 'TEACHER' && !classAssignments.length) return json(res, 401, { error: 'Invalid staff ID, access code, or role' });
  return json(res, 200, { token: authenticated.authSession.accessToken, refreshToken: authenticated.authSession.refreshToken,
    expiresAt: authenticated.authSession.expiresAt, administrativeLevel: 'SCHOOL', dashboard: 'school-general',
    user: { staffId: authenticated.user.staffId, name: assignment.full_name, role, schoolName: assignment.school_name,
      region: assignment.region, district: assignment.district, assignedClasses: classAssignments } });
}
async function config(req, res, auth) {
  if (req.method === 'GET') {
    const code = new URL(req.url, 'http://localhost').searchParams.get('schoolCode');
    if (String(auth.schoolCode) !== String(code)) return json(res, 403, { error: 'Forbidden school scope' });
    const metadata = auth.school.registration_metadata && typeof auth.school.registration_metadata === 'object' ? auth.school.registration_metadata : {};
    const cfg = metadata.legacyConfig && typeof metadata.legacyConfig === 'object' ? metadata.legacyConfig : {};
    return json(res, 200, { ...cfg, id: auth.school.school_id, schoolCode: auth.school.school_code, school: cfg.school || auth.school.school_name });
  }
  if (req.method === 'POST') {
    const cfg = req.__legacyInput || await readBody(req);
    if (String(auth.schoolCode) !== String(cfg.schoolCode) || !cfg.school) return json(res, 400, { error: 'schoolCode and school name are required' });
    const metadata = auth.school.registration_metadata && typeof auth.school.registration_metadata === 'object' ? auth.school.registration_metadata : {};
    const next = { ...metadata, legacyConfig: cfg };
    await relational.domainRows('UPDATE schools SET registration_metadata=?::jsonb,updated_at=CURRENT_TIMESTAMP WHERE id=?', [JSON.stringify(next), auth.schoolId]);
    return json(res, 200, { ok: true });
  }
  res.setHeader('Allow', 'GET, POST'); return json(res, 405, { error: 'Method Not Allowed' });
}
async function students(req, res, auth) {
  const input = req.__legacyInput || (req.method === 'GET' ? Object.fromEntries(new URL(req.url, 'http://localhost').searchParams) : await readBody(req));
  if (String(auth.schoolCode) !== String(input.schoolCode)) return json(res, 403, { error: 'Forbidden school scope' });
  const { schoolCode, class: className, form, year, term } = input;
  if (!schoolCode || !className || !form || !year || !term) return json(res, 400, { error: 'schoolCode, class, form, year, term are required' });
  if (auth.role === 'TEACHER' && !auth.assignedClass.some(row => String(row.name) === String(className))) return json(res, 403, { error: 'Permission denied for assigned class scope' });
  const classRows = await relational.domainRows('SELECT id FROM classes WHERE school_id=? AND name=? AND status=\'ACTIVE\' LIMIT 1', [auth.schoolId, className]);
  if (!classRows.length) return json(res, 404, { error: 'Class not found' });
  const classId = classRows[0].id;
  if (req.method === 'GET') {
    const rows = await relational.domainRows(`SELECT s.student_identifier AS student_usid,s.full_name AS name,s.gender,tr.id AS term_record_id,
      tr.rank_in_class,tr.index_no,tr.total_score,tr.subjects_sat,tr.aggregate,tr.class_position,tr.conduct,tr.interest,tr.attitude,
      tr.ct_remarks,tr.ht_remarks,tr.times_present,tr.times_absent,tr.total_school_days,tr.promotion_status,tr.result_date
      FROM term_records tr JOIN students s ON s.id=tr.student_id
      WHERE tr.school_id=? AND tr.class_name=? AND tr.form=? AND tr.academic_year=? AND tr.term=? AND s.class_id=?
      ORDER BY tr.rank_in_class ASC`, [auth.schoolId,className,form,year,term,classId]);
    if (!rows.length) return json(res, 200, { students: [] });
    const ids = rows.map(row => row.term_record_id);
    const scores = await relational.domainRows(`SELECT * FROM subject_scores WHERE term_record_id = ANY(?::text[])`, [ids]);
    const grouped = {}; scores.forEach(row => (grouped[row.term_record_id] ||= []).push(row));
    return json(res, 200, { students: rows.map(row => ({ ...row, scores: grouped[row.term_record_id] || [] })) });
  }
  if (req.method === 'POST') {
    const student = input.student;
    if (!student || !student.student_usid) return json(res, 400, { error: 'student.student_usid is required' });
    const id = `student_${crypto.randomBytes(12).toString('hex')}`;
    const admissionNumber = `legacy_${auth.schoolId}_${String(student.student_usid).slice(0,80)}`;
    const students = await relational.domainRows(`INSERT INTO students (id,admission_number,student_identifier,full_name,gender,tenant_id,school_id,class_id,status,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,\'ACTIVE\',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
      ON CONFLICT (student_identifier) DO UPDATE SET full_name=EXCLUDED.full_name,gender=EXCLUDED.gender,class_id=EXCLUDED.class_id,updated_at=CURRENT_TIMESTAMP
      WHERE students.school_id=EXCLUDED.school_id RETURNING id`, [id,admissionNumber,String(student.student_usid),String(student.name||'').trim(),student.gender||'M',auth.school.tenant_id,auth.schoolId,classId]);
    if (!students.length) return json(res, 409, { error: 'Student identifier belongs to another School' });
    const studentId = students[0].id;
    const records = await relational.domainRows(`INSERT INTO term_records (school_id,student_id,academic_year,term,class_name,form,rank_in_class,index_no,total_score,subjects_sat,aggregate,class_position,conduct,interest,attitude,ct_remarks,ht_remarks,times_present,times_absent,total_school_days,promotion_status,result_date)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT (student_id,academic_year,term) DO UPDATE SET class_name=EXCLUDED.class_name,form=EXCLUDED.form,rank_in_class=EXCLUDED.rank_in_class,index_no=EXCLUDED.index_no,total_score=EXCLUDED.total_score,subjects_sat=EXCLUDED.subjects_sat,aggregate=EXCLUDED.aggregate,class_position=EXCLUDED.class_position,conduct=EXCLUDED.conduct,interest=EXCLUDED.interest,attitude=EXCLUDED.attitude,ct_remarks=EXCLUDED.ct_remarks,ht_remarks=EXCLUDED.ht_remarks,times_present=EXCLUDED.times_present,times_absent=EXCLUDED.times_absent,total_school_days=EXCLUDED.total_school_days,promotion_status=EXCLUDED.promotion_status,result_date=EXCLUDED.result_date
      RETURNING id`, [auth.schoolId,studentId,year,term,className,form,student.rank||null,student.indexNo||null,student.totalScore||0,student.subjSat||0,student.aggregate||null,student.position||null,student.conduct||null,student.interest||null,student.attitude||null,student.ctRemarks||null,student.htRemarks||null,student.timesPresent||null,student.timesAbsent||null,student.totalSchoolDays||null,student.promotionStatus||null,student.resultDate||null]);
    const recordId = records[0].id;
    for (const [subject, score] of Object.entries(student.scores || {})) {
      await relational.domainRows(`INSERT INTO subject_scores (term_record_id,subject,class_score,exam_score,project,ce1,ce2,group_work,class_test,total_ca,ca_50,exam_50,total_score,grade,remark)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT (term_record_id,subject) DO UPDATE SET class_score=EXCLUDED.class_score,exam_score=EXCLUDED.exam_score,project=EXCLUDED.project,ce1=EXCLUDED.ce1,ce2=EXCLUDED.ce2,group_work=EXCLUDED.group_work,class_test=EXCLUDED.class_test,total_ca=EXCLUDED.total_ca,ca_50=EXCLUDED.ca_50,exam_50=EXCLUDED.exam_50,total_score=EXCLUDED.total_score,grade=EXCLUDED.grade,remark=EXCLUDED.remark`, [recordId,subject,score.classScore??null,score.examScore??null,score.project??null,score.ce1??null,score.ce2??null,score.groupWork??null,score.classTest??null,score.totalCA??null,score.ca50??null,score.exam50??null,score.totalScore??null,score.grade??null,score.remark||null]);
    }
    return json(res, 200, { ok: true, studentId, termRecordId: recordId });
  }
  res.setHeader('Allow','GET, POST'); return json(res,405,{error:'Method Not Allowed'});
}
async function handler(req, res) {
  try {
    const route = req.url.split('?')[0];
    if (route === '/api/login') return req.method === 'POST' ? await login(req,res) : json(res,405,{error:'Method Not Allowed'});
    if (route === '/api/school-login') return req.method === 'POST' ? await schoolLogin(req,res) : json(res,405,{error:'Method Not Allowed'});
    if (route === '/api/auth/refresh') {
      if (req.method !== 'POST') return json(res,405,{error:'Method Not Allowed'});
      const input=await readBody(req);const session=await supabaseAuth.refreshSession(input.refreshToken);
      const user=await relational.findUserByAuthId(session.user.id);
      if(!user||!user.active||user.status!=='ACTIVE')return json(res,401,{error:'Authentication required'});
      return json(res,200,{token:session.accessToken,refreshToken:session.refreshToken,expiresAt:session.expiresAt});
    }
    if (route === '/api/logout') {
      if (req.method !== 'POST') return json(res,405,{error:'Method Not Allowed'});
      const bearer=await resolveBearer(req,res);if(!bearer)return true;
      await supabaseAuth.signOut(bearer.token).catch(()=>{});
      return json(res,200,{ok:true});
    }
    if (!['/api/config','/api/students'].includes(route)) return false;
    const bearer=await resolveBearer(req,res);if(!bearer)return true;
    let input, schoolCode, permissions;
    if(route==='/api/config') {
      if(req.method==='POST'){input=await readBody(req);req.__legacyInput=input;}
      schoolCode=req.method==='GET'?new URL(req.url,'http://localhost').searchParams.get('schoolCode'):String(input.schoolCode||'');
      permissions=req.method==='GET'?['schools.manage']:['schools.manage'];
    } else {
      input=req.method==='GET'?Object.fromEntries(new URL(req.url,'http://localhost').searchParams):await readBody(req);
      req.__legacyInput=input;schoolCode=String(input.schoolCode||'');permissions=['students.manage','scores.manage'];
    }
    const auth=await schoolAuthorization(bearer,schoolCode,permissions);
    if(!auth){json(res,403,{error:'Permission denied'});return true;}
    if(route==='/api/config')await config(req,res,auth);else await students(req,res,auth);
    return true;
  } catch (error) {
    const status=error?.status===429?429:500;
    return json(res,status,{error:status===429?'Authentication rate limited':'Internal server error'});
  }
}
module.exports = { handler, schoolAuthorization };
