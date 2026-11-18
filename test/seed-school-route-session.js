#!/usr/bin/env node
'use strict';

const crypto = require('node:crypto');
const relational = require('../db/relational');
const { parameterize } = relational;

function assertLocalTarget(env = process.env) {
  if (env.NODE_ENV !== 'test' || env.EDUTRACK_TEST_SUPABASE_TARGET !== 'local-disposable') {
    throw new Error('School route fixtures require an explicitly authorized local disposable Supabase target');
  }
  const db = new URL(env.SUPABASE_DB_URL || '');
  const auth = new URL(env.SUPABASE_URL || '');
  if (!['localhost', '127.0.0.1', '[::1]'].includes(db.hostname) || db.port !== '54322'
      || !['localhost', '127.0.0.1', '[::1]'].includes(auth.hostname) || auth.port !== '54321') {
    throw new Error('School route fixtures may only target the standard local Supabase ports');
  }
  if (!env.SUPABASE_ANON_KEY || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Local Supabase Auth keys are required for the authenticated route fixture');
}

function accessCodeHash(value) {
  const salt = crypto.randomBytes(16).toString('hex');
  return `${salt}:${crypto.scryptSync(String(value), salt, 64).toString('hex')}`;
}
async function exec(sql, values = []) {
  return relational.getPool().query(parameterize(sql, values), values);
}

async function main() {
  assertLocalTarget();
  const accessCode = String(process.env.EDUTRACK_TEST_SCHOOL_ACCESS_CODE || '');
  const staffId = String(process.env.EDUTRACK_TEST_SCHOOL_STAFF_ID || '');
  if (accessCode.length < 24 || !/^[A-Za-z0-9._-]{4,120}$/.test(staffId)) throw new Error('School route fixture credentials are invalid');

  const now = new Date().toISOString();
  const userId = 'test-headteacher-western-sekondi';
  const tenantId = 'test-tenant-western-sekondi';
  const schoolId = 'test-school-western-sekondi';
  const regionId = 'test-region-western';
  const districtId = 'test-district-sekondi-takoradi';
  const role = 'HEADTEACHER';
  await relational.upsertUser({ id: userId, email: 'headteacher.test@edutrack.invalid', staffId,
    authPassword: accessCode, accessCodeHash: accessCodeHash(accessCode), role, hierarchy: 'SCHOOL',
    scope: { tenantId, schoolId, schoolIds: [schoolId] }, active: true, developmentFixture: true, createdAt: now, updatedAt: now });

  await exec(`INSERT INTO tenants (id,name,tenant_type,parent_id,active,created_at,updated_at)
    VALUES ('edutrack_national','EduTrack National','NATIONAL',NULL,TRUE,?,?)
    ON CONFLICT (id) DO UPDATE SET active=TRUE,updated_at=EXCLUDED.updated_at`, [now, now]);
  await exec(`INSERT INTO tenants (id,name,tenant_type,parent_id,active,created_at,updated_at)
    VALUES (?,?, 'SCHOOL', 'edutrack_national', TRUE, ?, ?)
    ON CONFLICT (id) DO UPDATE SET active=TRUE,updated_at=EXCLUDED.updated_at`, [tenantId, 'EduTrack Test School Tenant', now, now]);
  await exec(`INSERT INTO regions (id,name,national_tenant_id,created_at) VALUES (?,?,?,?)
    ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name,national_tenant_id=EXCLUDED.national_tenant_id`, [regionId, 'Western Region', 'edutrack_national', now]);
  await exec(`INSERT INTO districts (id,region_id,name,created_at) VALUES (?,?,?,?)
    ON CONFLICT (id) DO UPDATE SET region_id=EXCLUDED.region_id,name=EXCLUDED.name`, [districtId, regionId, 'Sekondi Takoradi Metropolitan', now]);
  await exec(`INSERT INTO schools (id,tenant_id,district_id,school_code,name,ownership_type,active,created_at,updated_at)
    VALUES (?,?,?,?,?,'PUBLIC',TRUE,?,?) ON CONFLICT (id) DO UPDATE SET tenant_id=EXCLUDED.tenant_id,district_id=EXCLUDED.district_id,school_code=EXCLUDED.school_code,name=EXCLUDED.name,active=TRUE,updated_at=EXCLUDED.updated_at`,
  [schoolId, tenantId, districtId, 'TEST-WESTERN-SEKONDI', 'EduTrack Test School', now, now]);
  await exec(`INSERT INTO tenant_memberships (user_id,tenant_id,scope_json,active,created_at) VALUES (?,?,?::jsonb,TRUE,?)
    ON CONFLICT (user_id,tenant_id) DO UPDATE SET scope_json=EXCLUDED.scope_json,active=TRUE`,
  [userId, tenantId, JSON.stringify({ schoolId, schoolIds: [schoolId], regionId, districtId }), now]);
  await exec(`INSERT INTO staff (id,user_id,staff_identifier,full_name,email,staff_type,status,tenant_id,region_id,district_id,school_id,created_at,updated_at)
    VALUES ('test-staff-western-sekondi',?,?,?,'headteacher.test@edutrack.invalid','HEADTEACHER','ACTIVE',?,?,?,?,?,?)
    ON CONFLICT (id) DO UPDATE SET user_id=EXCLUDED.user_id,staff_identifier=EXCLUDED.staff_identifier,full_name=EXCLUDED.full_name,status='ACTIVE',tenant_id=EXCLUDED.tenant_id,region_id=EXCLUDED.region_id,district_id=EXCLUDED.district_id,school_id=EXCLUDED.school_id,updated_at=EXCLUDED.updated_at`,
  [userId, staffId, 'Test Headteacher', tenantId, regionId, districtId, schoolId, now, now]);
  await exec(`INSERT INTO staff_school_assignments (staff_id,school_id,active,assigned_at) VALUES (?,?,TRUE,?)
    ON CONFLICT (staff_id,school_id) DO UPDATE SET active=TRUE`, ['test-staff-western-sekondi', schoolId, now]);
  await exec(`INSERT INTO subscriptions (id,user_id,school_id,plan_id,status,starts_at,expires_at,renewal_state,created_at,updated_at)
    VALUES ('test-sub-western-sekondi',?,?, 'test', 'ACTIVE', ?, '2099-12-31T23:59:59Z', 'INITIAL', ?, ?)
    ON CONFLICT (id) DO UPDATE SET user_id=EXCLUDED.user_id,school_id=EXCLUDED.school_id,status='ACTIVE',expires_at=EXCLUDED.expires_at,updated_at=EXCLUDED.updated_at`,
  [userId, schoolId, now, now, now]);

  const authz = await relational.resolveAuthorization(userId);
  if (!authz?.roles.includes(role) || !authz.rolePermissions[role]?.includes('admissions.finalize')
      || !authz.memberships.some(item => item.scope.schoolId === schoolId)) {
    throw new Error('Database-backed School fixture did not resolve its Headteacher role, grants and school scope');
  }
  console.log('Seeded an authenticated local Supabase School identity with server-resolved Headteacher permissions.');
}

main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => relational.close());
