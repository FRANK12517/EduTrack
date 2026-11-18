-- Supabase Auth identity and fail-closed row security.
-- This migration deliberately seeds no application users or organizational data.

CREATE OR REPLACE FUNCTION private.edutrack_user_id()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT u.id
  FROM public.users AS u
  WHERE u.supabase_auth_user_id = auth.uid()
    AND u.active IS TRUE
    AND upper(coalesce(u.status, '')) = 'ACTIVE'
    AND u.revoked_at IS NULL
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION private.edutrack_has_permission(permission_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT permission_name IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.users AS u
    JOIN public.user_roles AS ur ON ur.user_id = u.id
    JOIN public.roles AS r ON r.id = ur.role_id
    JOIN public.roles AS grant_role
      ON grant_role.name = CASE WHEN r.name = 'ASSISTANT_HEADTEACHER' THEN 'HEADTEACHER' ELSE r.name END
    JOIN public.role_permissions AS rp ON rp.role_id = grant_role.id
    JOIN public.permissions AS p ON p.id = rp.permission_id
    WHERE u.id = private.edutrack_user_id()
      AND p.name = permission_name
  )
$$;

CREATE OR REPLACE FUNCTION private.edutrack_school_scope(school_key text, permission_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT school_key IS NOT NULL
    AND private.edutrack_has_permission(permission_name)
    AND EXISTS (
      SELECT 1
      FROM public.schools AS s
      JOIN public.districts AS d ON d.id = s.district_id
      JOIN public.regions AS r ON r.id = d.region_id
      WHERE s.id = school_key
        AND s.active IS TRUE
        AND EXISTS (
          SELECT 1
          FROM public.tenant_memberships AS tm
          JOIN public.tenants AS membership_tenant ON membership_tenant.id = tm.tenant_id
          WHERE tm.user_id = private.edutrack_user_id()
            AND tm.active IS TRUE
            AND membership_tenant.active IS TRUE
            AND (
              coalesce(tm.scope_json, '{}'::jsonb) ->> 'schoolId' = s.id
              OR coalesce(tm.scope_json, '{}'::jsonb) -> 'schoolIds' ? s.id
              OR coalesce(tm.scope_json, '{}'::jsonb) ->> 'districtId' = d.id
              OR coalesce(tm.scope_json, '{}'::jsonb) -> 'districtIds' ? d.id
              OR coalesce(tm.scope_json, '{}'::jsonb) ->> 'regionId' = r.id
              OR coalesce(tm.scope_json, '{}'::jsonb) -> 'regionIds' ? r.id
              OR (membership_tenant.tenant_type = 'NATIONAL' AND tm.tenant_id = r.national_tenant_id)
            )
        )
        AND NOT EXISTS (
          SELECT 1
          FROM public.user_roles AS ur
          JOIN public.roles AS role ON role.id = ur.role_id
          WHERE ur.user_id = private.edutrack_user_id()
            AND role.name = 'TEACHER'
        )
    )
$$;

CREATE OR REPLACE FUNCTION private.edutrack_class_scope(school_key text, class_key text, permission_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT class_key IS NOT NULL
    AND private.edutrack_has_permission(permission_name)
    AND CASE WHEN EXISTS (
      SELECT 1 FROM public.user_roles AS ur
      JOIN public.roles AS role ON role.id = ur.role_id
      WHERE ur.user_id = private.edutrack_user_id()
        AND role.name = 'TEACHER'
    ) THEN EXISTS (
      SELECT 1
      FROM public.staff AS st
      JOIN public.teacher_class_assignments AS tca
        ON tca.staff_id = st.id AND tca.active IS TRUE
      JOIN public.classes AS c ON c.id = tca.class_id
      WHERE st.user_id = private.edutrack_user_id()
        AND st.status = 'ACTIVE'
        AND c.id = class_key
        AND c.school_id = school_key
        AND c.status = 'ACTIVE'
    ) ELSE private.edutrack_school_scope(school_key, permission_name) END
$$;

CREATE OR REPLACE FUNCTION private.edutrack_student_scope(student_key text, permission_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.students AS s
    WHERE s.id = student_key
      AND CASE WHEN s.class_id IS NULL THEN
        private.edutrack_school_scope(s.school_id, permission_name)
      ELSE private.edutrack_class_scope(s.school_id, s.class_id, permission_name) END
  )
$$;

-- The nullable link supports existing Student accounts without inventing or
-- automatically matching identities. An authorized provisioning workflow
-- must set the link before direct Student row access is allowed.
ALTER TABLE public.students
  ADD COLUMN user_id varchar(80) NULL UNIQUE
  REFERENCES public.users(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION private.edutrack_student_link(student_key text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT student_key IS NOT NULL AND (
    EXISTS (
      SELECT 1 FROM public.students AS s
      WHERE s.id = student_key AND s.user_id = private.edutrack_user_id()
    )
    OR EXISTS (
      SELECT 1
      FROM public.parent_student_relationships AS ps
      WHERE ps.student_id = student_key
        AND ps.parent_user_id = private.edutrack_user_id()
        AND ps.active IS TRUE
    )
  )
$$;

REVOKE ALL ON FUNCTION private.edutrack_user_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.edutrack_has_permission(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.edutrack_school_scope(text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.edutrack_class_scope(text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.edutrack_student_scope(text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.edutrack_student_link(text) FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.edutrack_user_id() TO authenticated;
GRANT EXECUTE ON FUNCTION private.edutrack_has_permission(text) TO authenticated;
GRANT EXECUTE ON FUNCTION private.edutrack_school_scope(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION private.edutrack_class_scope(text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION private.edutrack_student_scope(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION private.edutrack_student_link(text) TO authenticated;

-- RLS is enabled on every application table. Tables without an explicit policy
-- below remain inaccessible to browser roles (PostgreSQL's default deny).
DO $$
DECLARE row record;
BEGIN
  FOR row IN
    SELECT schemaname, tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename <> 'schema_migrations'
  LOOP
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', row.schemaname, row.tablename);
  END LOOP;
END
$$;

CREATE POLICY users_read_self ON public.users
  FOR SELECT TO authenticated
  USING (supabase_auth_user_id = auth.uid() AND id = private.edutrack_user_id());

CREATE POLICY tenant_memberships_read_self ON public.tenant_memberships
  FOR SELECT TO authenticated
  USING (user_id = private.edutrack_user_id());

CREATE POLICY user_roles_read_self ON public.user_roles
  FOR SELECT TO authenticated
  USING (user_id = private.edutrack_user_id());

CREATE POLICY role_permissions_read_assigned ON public.role_permissions
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_roles AS ur
    WHERE ur.user_id = private.edutrack_user_id()
      AND ur.role_id = role_permissions.role_id
  ));

CREATE POLICY permissions_read_granted ON public.permissions
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1
    FROM public.role_permissions AS rp
    JOIN public.user_roles AS ur ON ur.role_id = rp.role_id
    JOIN public.permissions AS p ON p.id = rp.permission_id
    WHERE ur.user_id = private.edutrack_user_id()
      AND p.id = permissions.id
  ));

CREATE POLICY roles_read_assigned ON public.roles
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_roles AS ur
    WHERE ur.user_id = private.edutrack_user_id()
      AND ur.role_id = roles.id
  ));

CREATE POLICY parent_links_read_self ON public.parent_student_relationships
  FOR SELECT TO authenticated
  USING (parent_user_id = private.edutrack_user_id() AND active IS TRUE);

CREATE POLICY students_read_linked_parent ON public.students
  FOR SELECT TO authenticated
  USING (private.edutrack_student_link(id) OR private.edutrack_class_scope(school_id, class_id, 'students.manage'));

CREATE POLICY quiz_attempts_read_self ON public.quiz_attempts
  FOR SELECT TO authenticated
  USING (student_user_id = private.edutrack_user_id());

CREATE POLICY quizzes_read_own_attempt ON public.quizzes
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.quiz_attempts AS qa
    WHERE qa.quiz_id = quizzes.id
      AND qa.student_user_id = private.edutrack_user_id()
  ));

CREATE POLICY quiz_questions_read_own_quiz ON public.quiz_questions
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1
    FROM public.quiz_attempts AS qa
    WHERE qa.quiz_id = quiz_questions.quiz_id
      AND qa.student_user_id = private.edutrack_user_id()
  ));

CREATE POLICY quiz_responses_read_own_attempt ON public.quiz_responses
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.quiz_attempts AS qa
    WHERE qa.id = quiz_responses.attempt_id
      AND qa.student_user_id = private.edutrack_user_id()
  ));

-- Parent result/attendance visibility is limited to explicitly linked students.
CREATE POLICY parent_read_student_attendance ON public.student_attendance_records
  FOR SELECT TO authenticated
  USING (private.edutrack_student_link(student_id) OR private.edutrack_student_scope(student_id, 'attendance.manage'));

CREATE POLICY parent_read_student_scores ON public.scores
  FOR SELECT TO authenticated
  USING (private.edutrack_student_link(student_id) OR private.edutrack_student_scope(student_id, 'scores.manage'));

CREATE POLICY parent_read_published_results ON public.published_results
  FOR SELECT TO authenticated
  USING (private.edutrack_student_link(student_id) OR private.edutrack_student_scope(student_id, 'results.manage'));

CREATE POLICY parent_read_result_slips ON public.result_slips
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.published_results AS result
    WHERE result.id = result_slips.published_result_id
      AND (private.edutrack_student_link(result.student_id)
        OR private.edutrack_student_scope(result.student_id, 'results.manage'))
  ));

-- School-scoped operations must have both a verified role grant and an active
-- organizational membership. Teacher scope is further restricted to assigned
-- classes by edutrack_school_scope; unclassified table access is denied.
CREATE POLICY schools_read_authorized_scope ON public.schools
  FOR SELECT TO authenticated
  USING (
    private.edutrack_school_scope(id, 'schools.manage')
    OR private.edutrack_school_scope(id, 'district.schools.read')
    OR private.edutrack_school_scope(id, 'regional.schools.read')
    OR private.edutrack_school_scope(id, 'national.schools.read')
  );

CREATE POLICY classes_read_authorized_scope ON public.classes
  FOR SELECT TO authenticated
  USING (
    private.edutrack_class_scope(school_id, id, 'classes.manage')
    OR private.edutrack_class_scope(school_id, id, 'district.schools.read')
    OR private.edutrack_class_scope(school_id, id, 'regional.schools.read')
    OR private.edutrack_class_scope(school_id, id, 'national.schools.read')
  );

CREATE POLICY staff_read_authorized_scope ON public.staff
  FOR SELECT TO authenticated
  USING (
    private.edutrack_school_scope(school_id, 'staff.manage')
    OR private.edutrack_school_scope(school_id, 'district.schools.read')
    OR private.edutrack_school_scope(school_id, 'regional.schools.read')
    OR private.edutrack_school_scope(school_id, 'national.schools.read')
  );

CREATE POLICY attendance_registers_read_authorized_scope ON public.attendance_registers
  FOR SELECT TO authenticated
  USING (
    private.edutrack_class_scope(school_id, class_id, 'attendance.manage')
    OR private.edutrack_class_scope(school_id, class_id, 'district.attendance.read')
    OR private.edutrack_class_scope(school_id, class_id, 'regional.attendance.read')
    OR private.edutrack_class_scope(school_id, class_id, 'national.attendance.read')
  );

CREATE POLICY teacher_attendance_read_authorized_scope ON public.teacher_attendance_records
  FOR SELECT TO authenticated
  USING (
    private.edutrack_school_scope(school_id, 'attendance.manage')
    OR private.edutrack_school_scope(school_id, 'district.attendance.read')
    OR private.edutrack_school_scope(school_id, 'regional.attendance.read')
    OR private.edutrack_school_scope(school_id, 'national.attendance.read')
  );

CREATE POLICY examinations_read_authorized_scope ON public.examinations
  FOR SELECT TO authenticated
  USING (
    private.edutrack_class_scope(school_id, class_id, 'examinations.manage')
    OR private.edutrack_class_scope(school_id, class_id, 'district.examinations.read')
    OR private.edutrack_class_scope(school_id, class_id, 'regional.examinations.read')
    OR private.edutrack_class_scope(school_id, class_id, 'national.examinations.read')
  );

CREATE POLICY quiz_read_authorized_scope ON public.quizzes
  FOR SELECT TO authenticated
  USING (private.edutrack_class_scope(school_id, class_id, 'academics.manage'));
