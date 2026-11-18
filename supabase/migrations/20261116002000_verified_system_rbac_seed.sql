-- Seed only the application's existing system role and permission catalog.
-- No user, school, student, or organizational records are created here.

WITH roles(role_name) AS (
  VALUES
    ('DEVELOPER_ROOT'), ('SUPER_ADMIN'), ('NATIONAL_ADMIN'), ('REGIONAL_ADMIN'),
    ('DISTRICT_ADMIN'), ('HEADTEACHER'), ('ASSISTANT_HEADTEACHER'),
    ('SCHOOL_ACCOUNTANT'), ('ACCOUNTANT'), ('TEACHER'), ('PARENT'), ('STUDENT'),
    ('DISTRICT_DIRECTOR_OF_EDUCATION'), ('DISTRICT_ADMIN'), ('DISTRICT_SISO'),
    ('DISTRICT_EXAMINATION_OFFICER'), ('DISTRICT_SPORTS_OFFICER'),
    ('REGIONAL_DIRECTOR_OF_EDUCATION'), ('REGIONAL_ADMIN'), ('REGIONAL_SISO'),
    ('REGIONAL_EXAMINATION_OFFICER'), ('REGIONAL_SPORTS_OFFICER'),
    ('NATIONAL_DIRECTOR_OF_EDUCATION'), ('NATIONAL_ADMIN'), ('NATIONAL_SISO'),
    ('NATIONAL_EXAMINATION_OFFICER'), ('NATIONAL_SPORTS_OFFICER')
)
INSERT INTO public.roles (id, name, description)
SELECT 'role_' || lower(role_name), role_name, 'EduTrack system role: ' || role_name
FROM roles
ON CONFLICT (name) DO NOTHING;

WITH permissions(permission_name) AS (
  SELECT unnest(ARRAY[
    'auth.session.manage','admin.summary.read','security.audit.read','users.manage',
    'roles.manage','tenants.manage','schools.manage','staff.manage','students.manage',
    'academics.manage','attendance.manage','classes.manage','examinations.manage',
    'scores.manage','results.manage','promotion.manage','subscriptions.manage',
    'payments.manage','reporting.read','scope.read','files.manage','files.read',
    'signature.manage','fees.manage','attendance.qr.manage','hostel.view','hostel.manage',
    'hostel.rollcall','transport.view','transport.manage','transport.event.record',
    'transport.staff.manage','transport.location.manage','transport.parent.view',
    'admissions.view','admissions.review','admissions.finalize','communications.view',
    'communications.manage','ai.use','controlpanel.view','controlpanel.export',
    'branding.manage','chat.use',
    'district.dashboard.view','district.schools.read','district.attendance.read',
    'district.examinations.read','district.sports.read','district.reports.export',
    'district.sports.manage',
    'regional.dashboard.view','regional.hierarchy.read','regional.schools.read',
    'regional.attendance.read','regional.examinations.read','regional.sports.read',
    'regional.reports.export',
    'national.dashboard.view','national.hierarchy.read','national.schools.read',
    'national.attendance.read','national.examinations.read','national.sports.read',
    'national.reports.export'
  ])
)
INSERT INTO public.permissions (id, name, description)
SELECT permission_name, permission_name, 'EduTrack system permission: ' || permission_name
FROM permissions
ON CONFLICT (name) DO NOTHING;

WITH grants(role_name, permission_names) AS (
  VALUES
    ('DEVELOPER_ROOT', ARRAY['auth.session.manage','admin.summary.read','security.audit.read','users.manage','roles.manage','tenants.manage','schools.manage','staff.manage','students.manage','academics.manage','attendance.manage','classes.manage','examinations.manage','scores.manage','results.manage','promotion.manage','subscriptions.manage','payments.manage','reporting.read','scope.read','files.manage','files.read','signature.manage','fees.manage','attendance.qr.manage','hostel.view','hostel.manage','hostel.rollcall','transport.view','transport.manage','transport.event.record','transport.staff.manage','transport.location.manage','transport.parent.view','admissions.view','admissions.review','admissions.finalize','communications.view','communications.manage','ai.use']::text[]),
    ('SUPER_ADMIN', ARRAY['auth.session.manage','admin.summary.read','security.audit.read','users.manage','tenants.manage','schools.manage','staff.manage','students.manage','academics.manage','attendance.manage','classes.manage','examinations.manage','scores.manage','results.manage','promotion.manage','subscriptions.manage','payments.manage','reporting.read','scope.read','files.manage','files.read','signature.manage','fees.manage','attendance.qr.manage','hostel.view','hostel.manage','hostel.rollcall','transport.view','transport.manage','transport.event.record','transport.staff.manage','transport.location.manage','transport.parent.view','admissions.view','admissions.review','admissions.finalize','communications.view','communications.manage','ai.use']::text[]),
    ('NATIONAL_ADMIN', ARRAY['ai.use','attendance.qr.manage','transport.view','hostel.view','admin.summary.read','schools.manage','staff.manage','students.manage','academics.manage','attendance.manage','classes.manage','examinations.manage','scores.manage','results.manage','promotion.manage','reporting.read','scope.read']::text[]),
    ('REGIONAL_ADMIN', ARRAY['ai.use','controlpanel.view','controlpanel.export','branding.manage','attendance.qr.manage','transport.view','hostel.view','admin.summary.read','schools.manage','staff.manage','students.manage','academics.manage','attendance.manage','classes.manage','examinations.manage','scores.manage','results.manage','promotion.manage','reporting.read','scope.read']::text[]),
    ('DISTRICT_ADMIN', ARRAY['ai.use','controlpanel.view','controlpanel.export','branding.manage','attendance.qr.manage','transport.view','hostel.view','admin.summary.read','schools.manage','staff.manage','students.manage','academics.manage','attendance.manage','classes.manage','examinations.manage','scores.manage','results.manage','promotion.manage','reporting.read','scope.read']::text[]),
    ('HEADTEACHER', ARRAY['ai.use','signature.manage','attendance.qr.manage','transport.view','transport.manage','transport.event.record','transport.staff.manage','transport.location.manage','admissions.view','admissions.review','admissions.finalize','communications.view','communications.manage','hostel.view','hostel.manage','hostel.rollcall','schools.manage','staff.manage','students.manage','academics.manage','attendance.manage','classes.manage','examinations.manage','scores.manage','results.manage','promotion.manage','fees.manage','reporting.read','scope.read']::text[]),
    ('ASSISTANT_HEADTEACHER', ARRAY[]::text[]),
    ('SCHOOL_ACCOUNTANT', ARRAY['fees.manage','reporting.read','scope.read']::text[]),
    ('ACCOUNTANT', ARRAY['fees.manage','reporting.read','scope.read']::text[]),
    ('TEACHER', ARRAY['chat.use','signature.manage','transport.event.record','hostel.rollcall','students.manage','academics.manage','attendance.manage','classes.manage','examinations.manage','scores.manage','results.manage','reporting.read','scope.read']::text[]),
    ('PARENT', ARRAY['chat.use','transport.parent.view','reporting.read','scope.read']::text[]),
    ('STUDENT', ARRAY['transport.parent.view','reporting.read','scope.read']::text[]),
    ('DISTRICT_DIRECTOR_OF_EDUCATION', ARRAY['district.dashboard.view','district.schools.read','district.attendance.read','district.examinations.read','district.sports.read','district.reports.export']::text[]),
    ('DISTRICT_ADMIN', ARRAY['district.dashboard.view','district.schools.read','district.attendance.read','district.examinations.read','district.sports.read','district.reports.export']::text[]),
    ('DISTRICT_SISO', ARRAY['district.dashboard.view','district.schools.read','district.attendance.read']::text[]),
    ('DISTRICT_EXAMINATION_OFFICER', ARRAY['district.dashboard.view','district.schools.read','district.examinations.read','district.reports.export']::text[]),
    ('DISTRICT_SPORTS_OFFICER', ARRAY['district.dashboard.view','district.schools.read','district.sports.read','district.sports.manage']::text[]),
    ('REGIONAL_DIRECTOR_OF_EDUCATION', ARRAY['regional.dashboard.view','regional.hierarchy.read','regional.schools.read','regional.attendance.read','regional.examinations.read','regional.sports.read','regional.reports.export']::text[]),
    ('REGIONAL_ADMIN', ARRAY['regional.dashboard.view','regional.hierarchy.read','regional.schools.read','regional.attendance.read','regional.examinations.read','regional.sports.read','regional.reports.export']::text[]),
    ('REGIONAL_SISO', ARRAY['regional.dashboard.view','regional.hierarchy.read','regional.schools.read','regional.attendance.read']::text[]),
    ('REGIONAL_EXAMINATION_OFFICER', ARRAY['regional.dashboard.view','regional.hierarchy.read','regional.schools.read','regional.examinations.read','regional.reports.export']::text[]),
    ('REGIONAL_SPORTS_OFFICER', ARRAY['regional.dashboard.view','regional.hierarchy.read','regional.schools.read','regional.sports.read']::text[]),
    ('NATIONAL_DIRECTOR_OF_EDUCATION', ARRAY['national.dashboard.view','national.hierarchy.read','national.schools.read','national.attendance.read','national.examinations.read','national.sports.read','national.reports.export']::text[]),
    ('NATIONAL_ADMIN', ARRAY['national.dashboard.view','national.hierarchy.read','national.schools.read','national.attendance.read','national.examinations.read','national.sports.read','national.reports.export']::text[]),
    ('NATIONAL_SISO', ARRAY['national.dashboard.view','national.hierarchy.read','national.schools.read','national.attendance.read']::text[]),
    ('NATIONAL_EXAMINATION_OFFICER', ARRAY['national.dashboard.view','national.hierarchy.read','national.schools.read','national.examinations.read','national.reports.export']::text[]),
    ('NATIONAL_SPORTS_OFFICER', ARRAY['national.dashboard.view','national.hierarchy.read','national.schools.read','national.sports.read']::text[])
), expanded AS (
  SELECT g.role_name, unnest(g.permission_names) AS permission_name
  FROM grants AS g
)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT 'role_' || lower(e.role_name), e.permission_name
FROM expanded AS e
ON CONFLICT (role_id, permission_id) DO NOTHING;
