#!/usr/bin/env node
'use strict';

const { spawnSync } = require('node:child_process');
const crypto = require('node:crypto');
const path = require('node:path');

const env = {
  ...process.env,
  NODE_ENV: 'test',
  EDUTRACK_TEST_SUPABASE_TARGET: 'local-disposable',
  EDUTRACK_TEST_SCHOOL_ACCESS_CODE: crypto.randomBytes(24).toString('hex'),
  EDUTRACK_TEST_SCHOOL_STAFF_ID: `RELEASE-SCHOOL-${crypto.randomBytes(6).toString('hex')}`,
  EDUTRACK_SCHOOL_ROUTE_AUDIT: '1'
};

function run(script) {
  const result = spawnSync(process.execPath, [path.join(__dirname, script)], { stdio: 'inherit', env });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}

try {
  if (!env.SUPABASE_DB_URL || !env.SUPABASE_URL || !env.SUPABASE_ANON_KEY || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Start local Supabase and provide its database, Auth anon and service-role settings before running School route tests');
  }
  run('seed-school-route-session.js');
  run('school-login-thin-boot.browser.spec.js');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
