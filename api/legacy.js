'use strict';

const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { query, getPool } = require('../lib/db');

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

function requireAuth(req, res) {
  try {
    const token = tokenFrom(req);
    if (!token) throw new Error('missing token');
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    json(res, 401, { error: 'Authentication required' });
    return null;
  }
}

function assertSchool(auth, schoolCode) {
  if (!schoolCode || String(auth.schoolCode) !== String(schoolCode)) {
    const error = new Error('Forbidden school scope');
    error.status = 403;
    throw error;
  }
}

async function login(req, res) {
  const input = await readBody(req);
  const { schoolCode, staffId, password } = input;
  if (!schoolCode || !staffId || !password) return json(res, 400, { error: 'schoolCode, staffId and password are required' });
  const rows = await query(`SELECT u.id, u.staff_id, u.full_name, u.role, u.password_hash, u.assigned_class, u.assigned_form, s.school_code, s.id AS school_id FROM users u JOIN schools s ON s.id = u.school_id WHERE s.school_code = ? AND u.staff_id = ?`, [schoolCode, staffId]);
  if (!rows.length || !(await bcrypt.compare(password, rows[0].password_hash))) return json(res, 401, { error: 'Invalid credentials' });
  const user = rows[0];
  const token = jwt.sign({ userId: user.id, schoolId: user.school_id, schoolCode: user.school_code, role: user.role, assignedClass: user.assigned_class, assignedForm: user.assigned_form }, process.env.JWT_SECRET, { expiresIn: '12h' });
  return json(res, 200, { token, user: { staffId: user.staff_id, name: user.full_name, role: user.role, assignedClass: user.assigned_class, assignedForm: user.assigned_form } });
}

// Roles are free text in `users.role` but the login form only ever submits
// one of the six SCHOOL-level labels from V43_CONFIG.roles (index.html,
// ~line 24953). If a row in the database was typed/imported with a
// slightly different spelling — "Head Teacher" vs "Headteacher", "Teacher"
// vs "Classroom Teacher" — an exact match silently locks that person out
// even though every credential is correct. Normalize + alias instead of
// matching exactly.
function normalizeRole(r) {
  return String(r || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
const ROLE_ALIASES = {
  'head teacher': 'headteacher',
  'headmaster': 'headteacher',
  'headmistress': 'headteacher',
  'asst headteacher': 'assistant headteacher',
  'assistant head teacher': 'assistant headteacher',
  'teacher': 'classroom teacher',
  'class teacher': 'classroom teacher',
  'proprietor': 'school proprietor',
  'ict coordinator': 'school ict coordinator',
  'property officer': 'school property management officer',
};
function canonicalRole(r) {
  const n = normalizeRole(r);
  return ROLE_ALIASES[n] || n;
}

async function schoolLogin(req, res) {
  const input = await readBody(req);
  const { region, district, accessCode, staffId, role } = input;
  if (input.administrativeLevel && String(input.administrativeLevel).toUpperCase() !== 'SCHOOL') {
    return json(res, 403, { error: 'Invalid staff ID, access code, or role' });
  }
  if (!region || !district || !accessCode || !staffId || !role) {
    return json(res, 400, { error: 'region, district, accessCode, staffId and role are required' });
  }

  const rows = await query(
    `SELECT u.id, u.staff_id, u.full_name, u.role, u.assigned_class, u.assigned_form,
            s.id AS school_id, s.school_code, s.name AS school_name, s.region, s.district
     FROM schools s
     JOIN users u ON u.school_id = s.id
     WHERE s.access_code = ?
       AND s.access_code_status = 'ACTIVE'
       AND (s.access_code_expires_at IS NULL OR s.access_code_expires_at > NOW())
       AND LOWER(s.region) = LOWER(?)
       AND LOWER(s.district) = LOWER(?)
       AND u.staff_id = ?
     LIMIT 1`,
    [accessCode, region, district, staffId]
  );

  // Deliberately generic — never reveals which of the five fields was wrong,
  // and never reveals whether the row was missing vs. the role not matching.
  if (!rows.length || canonicalRole(rows[0].role) !== canonicalRole(role)) {
    return json(res, 401, { error: 'Invalid staff ID, access code, or role' });
  }

  const user = rows[0];
  const token = jwt.sign(
    { userId: user.id, schoolId: user.school_id, schoolCode: user.school_code, role: user.role, administrativeLevel: 'SCHOOL',
      assignedClass: user.assigned_class, assignedForm: user.assigned_form },
    process.env.JWT_SECRET,
    { expiresIn: '12h' }
  );
  return json(res, 200, {
    token,
    administrativeLevel: 'SCHOOL', dashboard: 'school-general',
    user: { staffId: user.staff_id, name: user.full_name, role: user.role, schoolName: user.school_name,
            region: user.region, district: user.district }
  });
}

async function config(req, res, auth) {
  if (req.method === 'GET') {
    const code = new URL(req.url, 'http://localhost').searchParams.get('schoolCode');
    assertSchool(auth, code);
    const rows = await query('SELECT * FROM schools WHERE school_code = ?', [code]);
    return rows.length ? json(res, 200, rows[0]) : json(res, 404, { error: 'School not found' });
  }
  if (req.method === 'POST') {
    const cfg = await readBody(req);
    assertSchool(auth, cfg.schoolCode);
    if (!cfg.schoolCode || !cfg.school) return json(res, 400, { error: 'schoolCode and school name are required' });
    await query(`INSERT INTO schools (school_code,name,ges_name,directorate,district,region,head_name,head_phone,academic_year,term,exam_type,category,grading_system,boys_count,girls_count,vacation_date,reopening_date,extra_config) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE name=VALUES(name),ges_name=VALUES(ges_name),directorate=VALUES(directorate),district=VALUES(district),region=VALUES(region),head_name=VALUES(head_name),head_phone=VALUES(head_phone),academic_year=VALUES(academic_year),term=VALUES(term),exam_type=VALUES(exam_type),category=VALUES(category),grading_system=VALUES(grading_system),boys_count=VALUES(boys_count),girls_count=VALUES(girls_count),vacation_date=VALUES(vacation_date),reopening_date=VALUES(reopening_date),extra_config=VALUES(extra_config)`, [cfg.schoolCode,cfg.school,cfg.gesName||'GHANA EDUCATION SERVICE',cfg.directorate||null,cfg.district||null,cfg.region||null,cfg.head||null,cfg.headPhone||null,cfg.year||null,cfg.term||'3rd Term',cfg.examType||'End of Term Exam',cfg.category||'ORGANIZED BY SCHOOL',cfg.gradingSystem||'WAEC',cfg.boys||0,cfg.girls||0,cfg.vacationDate||null,cfg.reopeningDate||null,JSON.stringify(cfg.extra||{})]);
    return json(res, 200, { ok: true });
  }
  res.setHeader('Allow', 'GET, POST'); return json(res, 405, { error: 'Method Not Allowed' });
}

async function students(req, res, auth) {
  const input = req.method === 'GET' ? Object.fromEntries(new URL(req.url, 'http://localhost').searchParams) : await readBody(req);
  assertSchool(auth, input.schoolCode);
  const { schoolCode, class: className, form, year, term } = input;
  if (!schoolCode || !className || !form || !year || !term) return json(res, 400, { error: 'schoolCode, class, form, year, term are required' });
  const schools = await query('SELECT id FROM schools WHERE school_code = ?', [schoolCode]);
  if (!schools.length) return json(res, 404, { error: 'School not found' });
  const schoolId = schools[0].id;
  if (req.method === 'GET') {
    const rows = await query(`SELECT s.student_usid,s.name,s.gender,tr.id AS term_record_id,tr.rank_in_class,tr.index_no,tr.total_score,tr.subjects_sat,tr.aggregate,tr.class_position,tr.conduct,tr.interest,tr.attitude,tr.ct_remarks,tr.ht_remarks,tr.times_present,tr.times_absent,tr.total_school_days,tr.promotion_status,tr.result_date FROM term_records tr JOIN students s ON s.id=tr.student_id WHERE tr.school_id=? AND tr.class_name=? AND tr.form=? AND tr.academic_year=? AND tr.term=? ORDER BY tr.rank_in_class ASC`, [schoolId,className,form,year,term]);
    if (!rows.length) return json(res, 200, { students: [] });
    const ids = rows.map(row => row.term_record_id); const scores = await query(`SELECT * FROM subject_scores WHERE term_record_id IN (${ids.map(() => '?').join(',')})`, ids); const grouped = {}; scores.forEach(row => (grouped[row.term_record_id] ||= []).push(row));
    return json(res, 200, { students: rows.map(row => ({ ...row, scores: grouped[row.term_record_id] || [] })) });
  }
  if (req.method === 'POST') {
    const student = input.student;
    if (!student || !student.student_usid) return json(res, 400, { error: 'student.student_usid is required' });
    const conn = await getPool().getConnection();
    try { await conn.beginTransaction();
      await conn.execute(`INSERT INTO students (school_id,student_usid,name,gender,admission_year,current_class,current_form) VALUES (?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE name=VALUES(name),gender=VALUES(gender),current_class=VALUES(current_class),current_form=VALUES(current_form)`, [schoolId,student.student_usid,student.name,student.gender||'M',year,className,form]);
      const [[identity]] = await conn.query('SELECT id FROM students WHERE school_id=? AND student_usid=?', [schoolId,student.student_usid]);
      await conn.execute(`INSERT INTO term_records (school_id,student_id,academic_year,term,class_name,form,rank_in_class,index_no,total_score,subjects_sat,aggregate,class_position,conduct,interest,attitude,ct_remarks,ht_remarks,times_present,times_absent,total_school_days,promotion_status,result_date) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE rank_in_class=VALUES(rank_in_class),index_no=VALUES(index_no),total_score=VALUES(total_score),subjects_sat=VALUES(subjects_sat),aggregate=VALUES(aggregate),class_position=VALUES(class_position),conduct=VALUES(conduct),interest=VALUES(interest),attitude=VALUES(attitude),ct_remarks=VALUES(ct_remarks),ht_remarks=VALUES(ht_remarks),times_present=VALUES(times_present),times_absent=VALUES(times_absent),total_school_days=VALUES(total_school_days),promotion_status=VALUES(promotion_status),result_date=VALUES(result_date)`, [schoolId,identity.id,year,term,className,form,student.rank||null,student.indexNo||null,student.totalScore||0,student.subjSat||0,student.aggregate||null,student.position||null,student.conduct||null,student.interest||null,student.attitude||null,student.ctRemarks||null,student.htRemarks||null,student.timesPresent||null,student.timesAbsent||null,student.totalSchoolDays||null,student.promotionStatus||null,student.resultDate||null]);
      const [[record]] = await conn.query('SELECT id FROM term_records WHERE student_id=? AND academic_year=? AND term=?', [identity.id,year,term]);
      for (const [subject, score] of Object.entries(student.scores || {})) await conn.execute(`INSERT INTO subject_scores (term_record_id,subject,class_score,exam_score,project,ce1,ce2,group_work,class_test,total_ca,ca_50,exam_50,total_score,grade,remark) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE class_score=VALUES(class_score),exam_score=VALUES(exam_score),project=VALUES(project),ce1=VALUES(ce1),ce2=VALUES(ce2),group_work=VALUES(group_work),class_test=VALUES(class_test),total_ca=VALUES(total_ca),ca_50=VALUES(ca_50),exam_50=VALUES(exam_50),total_score=VALUES(total_score),grade=VALUES(grade),remark=VALUES(remark)`, [record.id,subject,score.classScore??null,score.examScore??null,score.project??null,score.ce1??null,score.ce2??null,score.groupWork??null,score.classTest??null,score.totalCA??null,score.ca50??null,score.exam50??null,score.totalScore??null,score.grade??null,score.remark||null]);
      await conn.commit(); return json(res, 200, { ok: true, studentId: identity.id, termRecordId: record.id });
    } catch (error) { await conn.rollback(); throw error; } finally { conn.release(); }
  }
  res.setHeader('Allow','GET, POST'); return json(res,405,{error:'Method Not Allowed'});
}

async function handler(req, res) {
  try {
    if (req.url.split('?')[0] === '/api/login') return req.method === 'POST' ? login(req,res) : json(res,405,{error:'Method Not Allowed'});
    if (req.url.split('?')[0] === '/api/school-login') return req.method === 'POST' ? schoolLogin(req,res) : json(res,405,{error:'Method Not Allowed'});
    if (!['/api/config','/api/students'].includes(req.url.split('?')[0])) return false;
    const auth = requireAuth(req,res); if (!auth) return true;
    if (req.url.split('?')[0] === '/api/config') await config(req,res,auth); else await students(req,res,auth);
    return true;
  } catch (error) { json(res, error.status || 500, { error: error.status ? error.message : 'Internal server error' }); return true; }
}

module.exports = { handler };
