#!/usr/bin/env node
'use strict';
const fs=require('node:fs');const checks=[];const add=(id,status,evidence,requiredAction='None')=>checks.push({id,status,evidence,requiredAction});
add('destination',process.env.EDUTRACK_BACKUP_DESTINATION?'PASS':'NOT_PROVEN',process.env.EDUTRACK_BACKUP_DESTINATION?'External destination reference is configured':'External backup destination is unavailable','Configure a separate access-controlled backup destination');
add('encryption',process.env.EDUTRACK_BACKUP_ENCRYPTION_KEY_FILE?'PASS':'NOT_PROVEN',process.env.EDUTRACK_BACKUP_ENCRYPTION_KEY_FILE?'Encryption-key file reference is configured':'Backup encryption configuration is unavailable','Configure encryption through approved key management');
add('retention',process.env.EDUTRACK_BACKUP_RETENTION_DAYS&&Number(process.env.EDUTRACK_BACKUP_RETENTION_DAYS)>0?'PASS':'NOT_PROVEN',process.env.EDUTRACK_BACKUP_RETENTION_DAYS?'Retention days are configured':'Retention policy is unavailable','Configure a positive retention period');
add('scheduler',process.env.EDUTRACK_BACKUP_SCHEDULED==='true'?'PASS':'NOT_PROVEN',process.env.EDUTRACK_BACKUP_SCHEDULED==='true'?'Scheduler is declared active':'Scheduler is not declared active','Enable and monitor the supplied systemd timer or managed scheduler');
const localRoot=process.env.EDUTRACK_BACKUP_ROOT||'';if(localRoot&&fs.existsSync(localRoot))add('artifact-root','PASS','Configured backup root exists');else add('artifact-root','NOT_PROVEN','No configured backup root was verified','Run the controlled backup command against the configured destination');
const status=checks.some(x=>x.status==='NOT_PROVEN')?'NOT_PROVEN':'PASS';console.log(JSON.stringify({status,checks,secretValuesPrinted:false},null,2));process.exit(status==='PASS'?0:2);
