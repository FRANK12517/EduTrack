'use strict';

// Disposable in-memory PostgreSQL fixtures only. This test never connects to
// an application or Supabase project and writes no fixture data to the repo.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');

const root = path.join(__dirname, '..');
const migrationFiles = [
  '20261116000000_initial_schema.sql',
  '20261116001000_auth_identity_and_rls.sql',
  '20261116002000_verified_system_rbac_seed.sql'
];
const authIds = Object.freeze({
  district: '00000000-0000-4000-8000-000000000001',
  headteacher: '00000000-0000-4000-8000-000000000002',
  assistant: '00000000-0000-4000-8000-000000000003',
  teacher: '00000000-0000-4000-8000-000000000004',
  parent: '00000000-0000-4000-8000-000000000005',
  student: '00000000-0000-4000-8000-000000000006',
  regional: '00000000-0000-4000-8000-000000000007',
  national: '00000000-0000-4000-8000-000000000008'
});

async function main() {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE ROLE anon;
      CREATE ROLE authenticated;
      CREATE ROLE service_role BYPASSRLS;
      CREATE SCHEMA auth;
      CREATE TABLE auth.users (id uuid PRIMARY KEY);
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
        $$ SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    `);
    for (const file of migrationFiles) {
      await db.exec(fs.readFileSync(path.join(root, 'supabase/migrations', file), 'utf8'));
    }

    const coverage = await db.query(`
      SELECT count(*)::int AS total,
             count(*) FILTER (WHERE c.relrowsecurity)::int AS protected
      FROM pg_class AS c
      JOIN pg_namespace AS n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname <> 'schema_migrations'
    `);
    assert.equal(coverage.rows[0].total, 84, 'the fresh application schema has 84 public tables');
    assert.equal(coverage.rows[0].protected, coverage.rows[0].total, 'every application table has RLS enabled');

    await db.exec(`
      GRANT USAGE ON SCHEMA public, auth TO authenticated;
      GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
      GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;

      INSERT INTO auth.users(id) VALUES
        ('${authIds.district}'), ('${authIds.headteacher}'), ('${authIds.assistant}'),
        ('${authIds.teacher}'), ('${authIds.parent}'), ('${authIds.student}'),
        ('${authIds.regional}'), ('${authIds.national}');
      INSERT INTO public.users(id,email,status,active,development_fixture,hierarchy,created_at,updated_at,supabase_auth_user_id) VALUES
        ('u-district','district@test.invalid','ACTIVE',true,false,'DISTRICT',now(),now(),'${authIds.district}'),
        ('u-head','headteacher@test.invalid','ACTIVE',true,false,'SCHOOL',now(),now(),'${authIds.headteacher}'),
        ('u-assistant','assistant@test.invalid','ACTIVE',true,false,'SCHOOL',now(),now(),'${authIds.assistant}'),
        ('u-teacher','teacher@test.invalid','ACTIVE',true,false,'SCHOOL',now(),now(),'${authIds.teacher}'),
        ('u-parent','parent@test.invalid','ACTIVE',true,false,'SCHOOL',now(),now(),'${authIds.parent}'),
        ('u-student','student@test.invalid','ACTIVE',true,false,'SCHOOL',now(),now(),'${authIds.student}'),
        ('u-regional','regional@test.invalid','ACTIVE',true,false,'REGIONAL',now(),now(),'${authIds.regional}'),
        ('u-national','national@test.invalid','ACTIVE',true,false,'NATIONAL',now(),now(),'${authIds.national}');
      INSERT INTO public.user_roles(user_id,role_id) VALUES
        ('u-district','role_district_admin'),('u-head','role_headteacher'),
        ('u-assistant','role_assistant_headteacher'),('u-teacher','role_teacher'),
        ('u-parent','role_parent'),('u-student','role_student'),
        ('u-regional','role_regional_admin'),('u-national','role_national_admin');
      INSERT INTO public.tenants(id,name,tenant_type,parent_id,active,created_at,updated_at) VALUES
        ('national','National','NATIONAL',NULL,true,now(),now()),
        ('tenant-one','District One','DISTRICT','national',true,now(),now()),
        ('tenant-two','District Two','DISTRICT','national',true,now(),now());
      INSERT INTO public.regions(id,name,national_tenant_id) VALUES
        ('region-one','Region One','national'),('region-two','Region Two','national');
      INSERT INTO public.districts(id,region_id,name) VALUES
        ('district-one','region-one','District One'),('district-two','region-two','District Two');
      INSERT INTO public.schools(id,tenant_id,district_id,name,ownership_type,active,created_at,updated_at) VALUES
        ('school-one','tenant-one','district-one','School One','PUBLIC',true,now(),now()),
        ('school-two','tenant-two','district-two','School Two','PUBLIC',true,now(),now());
      INSERT INTO public.tenant_memberships(user_id,tenant_id,scope_json,active) VALUES
        ('u-district','tenant-one','{"districtId":"district-one","districtIds":["district-one"]}',true),
        ('u-head','tenant-one','{"schoolId":"school-one","schoolIds":["school-one"]}',true),
        ('u-assistant','tenant-one','{"schoolId":"school-one","schoolIds":["school-one"]}',true),
        ('u-teacher','tenant-one','{"schoolId":"school-one","schoolIds":["school-one"]}',true),
        ('u-regional','tenant-one','{"regionId":"region-one","regionIds":["region-one"]}',true),
        ('u-national','national','{"tenantId":"national"}',true);
      INSERT INTO public.staff(id,user_id,staff_identifier,full_name,staff_type,status,tenant_id,school_id,created_at,updated_at) VALUES
        ('staff-teacher','u-teacher','staff-one','Teacher One','TEACHER','ACTIVE','tenant-one','school-one',now(),now());
      INSERT INTO public.classes(id,name,school_id,tenant_id,status,created_at,updated_at) VALUES
        ('class-one','Class One','school-one','tenant-one','ACTIVE',now(),now()),
        ('class-two','Class Two','school-one','tenant-one','ACTIVE',now(),now()),
        ('class-three','Class Three','school-two','tenant-two','ACTIVE',now(),now());
      INSERT INTO public.teacher_class_assignments(staff_id,class_id,active,assigned_at)
        VALUES ('staff-teacher','class-one',true,now());
      INSERT INTO public.students(id,admission_number,student_identifier,full_name,tenant_id,school_id,class_id,status,created_at,updated_at,user_id) VALUES
        ('student-one','admission-one','identifier-one','Student One','tenant-one','school-one','class-one','ACTIVE',now(),now(),NULL),
        ('student-two','admission-two','identifier-two','Student Two','tenant-one','school-one','class-two','ACTIVE',now(),now(),NULL),
        ('student-three','admission-three','identifier-three','Student Three','tenant-two','school-two','class-three','ACTIVE',now(),now(),'u-student');
      INSERT INTO public.parent_student_relationships(parent_user_id,student_id,relationship_type,active,created_at)
        VALUES ('u-parent','student-one','PARENT',true,now());
      INSERT INTO public.audit_events(id,event_type,actor_user_id,occurred_at)
        VALUES ('private-audit','INTERNAL_EVENT',NULL,now());
      INSERT INTO public.term_records(id,school_id,student_id,academic_year,term,class_name,form)
        VALUES ('term-private','school-one','student-one','2026','TERM_1','Basic 1','A');
      INSERT INTO public.subject_scores(term_record_id,subject,total_score)
        VALUES ('term-private','Mathematics',87);
    `);

    async function visibleIds(authId, query) {
      await db.exec('RESET ROLE');
      await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [authId]);
      await db.exec('SET ROLE authenticated');
      try {
        return (await db.query(query)).rows.map((row) => row.id).sort();
      } finally {
        await db.exec('RESET ROLE');
      }
    }

    assert.deepEqual(await visibleIds(authIds.district, 'SELECT id FROM public.schools'), ['school-one']);
    assert.deepEqual(await visibleIds(authIds.regional, 'SELECT id FROM public.schools'), ['school-one'], 'regional scope includes only schools in its assigned region');
    assert.deepEqual(await visibleIds(authIds.national, 'SELECT id FROM public.schools'), ['school-one', 'school-two'], 'national scope includes schools under the assigned national tenant');
    assert.deepEqual(await visibleIds(authIds.headteacher, 'SELECT id FROM public.schools'), ['school-one']);
    assert.deepEqual(await visibleIds(authIds.assistant, 'SELECT id FROM public.schools'), ['school-one']);
    assert.deepEqual(await visibleIds(authIds.teacher, 'SELECT id FROM public.classes'), ['class-one']);
    assert.deepEqual(await visibleIds(authIds.teacher, 'SELECT id FROM public.students'), ['student-one']);
    assert.deepEqual(await visibleIds(authIds.parent, 'SELECT id FROM public.students'), ['student-one']);
    assert.deepEqual(await visibleIds(authIds.student, 'SELECT id FROM public.students'), ['student-three']);
    assert.deepEqual(await visibleIds(authIds.headteacher, 'SELECT id FROM public.audit_events'), [], 'unmapped sensitive tables remain default-deny');
    assert.deepEqual(await visibleIds(authIds.headteacher, 'SELECT id FROM public.term_records'), [], 'legacy result payloads remain unavailable to direct browser reads');
    assert.deepEqual(await visibleIds(authIds.headteacher, 'SELECT id FROM public.subject_scores'), [], 'legacy subject scores remain unavailable to direct browser reads');
    console.log('Supabase RLS fixture passed: 84/84 tables protected, unmapped-table default deny, district/regional/national isolation, same-school Headteacher equivalence, teacher class assignment, and linked Parent/Student rows.');
  } finally {
    await db.close();
  }
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
