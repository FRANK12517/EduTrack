#!/usr/bin/env node
'use strict';
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
function fail(message){console.error(message);process.exit(1)}
function required(name){if(!process.env[name])fail(`Missing required environment variable: ${name}`);return process.env[name]}
function sha256(file){return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')}
const source=path.resolve(process.argv[2]||'');
if(!source||!fs.existsSync(source))fail('Usage: EDUTRACK_RESTORE_CONFIRM=YES node scripts/restore-production.js <backup-directory>');
if(process.env.EDUTRACK_RESTORE_CONFIRM!=='YES')fail('Restore requires EDUTRACK_RESTORE_CONFIRM=YES after reviewing the backup and target.');
const connection=required('SUPABASE_DB_URL');
if(!/^postgres(?:ql)?:\/\//i.test(connection))fail('SUPABASE_DB_URL must be a PostgreSQL URL');
const manifestPath=path.join(source,'manifest.json');
if(!fs.existsSync(manifestPath))fail('Backup manifest.json is required.');
const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
for(const item of manifest.artifacts||[]){const file=path.join(source,item.name);if(!fs.existsSync(file)||sha256(file)!==item.sha256)fail(`Backup artifact failed integrity verification: ${item.name}`)}
const dump=path.join(source,'database.dump');
if(!fs.existsSync(dump))fail('database.dump is required for a PostgreSQL restore.');
const env={...process.env,PGDATABASE:connection};
const restored=spawnSync('pg_restore',['--single-transaction','--exit-on-error','--no-owner','--no-acl','--dbname',connection,dump],{env,encoding:'utf8',maxBuffer:16*1024*1024});
if(restored.status!==0)fail(`pg_restore failed: ${String(restored.stderr||'').trim()}`);
const archive=path.join(source,'uploads.tar.gz');
if(fs.existsSync(archive)){const dataRoot=path.resolve(process.env.EDUTRACK_RESTORE_DATA_DIR||path.join(process.cwd(),'data'));fs.mkdirSync(dataRoot,{recursive:true});const extract=spawnSync('tar',['-xzf',archive,'-C',dataRoot,'--no-same-owner'],{encoding:'utf8'});if(extract.status!==0)fail(`upload restore failed: ${String(extract.stderr||'').trim()}`)}
console.log(JSON.stringify({ok:true,provider:'supabase-postgresql',restoredFrom:source,uploads:fs.existsSync(archive)},null,2));
