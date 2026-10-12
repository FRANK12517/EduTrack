'use strict';
const {spawnSync}=require('node:child_process');
const crypto=require('node:crypto');
const result=spawnSync(process.execPath,[require.resolve('./school-login-thin-boot.browser.spec')],{
  stdio:'inherit',
  env:{...process.env,EDUTRACK_DATABASE_URL:'',DATABASE_URL:'',DB_PASSWORD:'',
    EDUTRACK_TEST_SCHOOL_ACCESS_CODE:crypto.randomBytes(24).toString('hex'),
    EDUTRACK_TEST_SCHOOL_STAFF_ID:'RELEASE-SCHOOL-HT',EDUTRACK_SCHOOL_ROUTE_AUDIT:'1'}
});
if(result.error)console.error(result.error.message);
process.exitCode=result.status===0?0:1;
