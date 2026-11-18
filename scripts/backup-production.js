#!/usr/bin/env node
'use strict';
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const ROOT=path.resolve(__dirname,'..');
const DATA_DIR=path.join(ROOT,'data');
function fail(message){console.error(message);process.exit(1)}
function required(name){if(!process.env[name])fail(`Missing required environment variable: ${name}`);return process.env[name]}
function sha256(file){return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')}
const connection=required('SUPABASE_DB_URL');
if(!/^postgres(?:ql)?:\/\//i.test(connection))fail('SUPABASE_DB_URL must be a PostgreSQL URL');
const target=path.resolve(process.argv[2]||path.join(ROOT,'backups',new Date().toISOString().replace(/[:.]/g,'-')));
fs.mkdirSync(target,{recursive:true,mode:0o700});
const dump=path.join(target,'database.dump');
const env={...process.env,PGDATABASE:connection};
const dumpResult=spawnSync('pg_dump',['--format=custom','--no-owner','--no-acl'],{env,encoding:null,maxBuffer:1024*1024*1024});
if(dumpResult.status!==0)fail(`pg_dump failed: ${String(dumpResult.stderr||'').trim()}`);
fs.writeFileSync(dump,dumpResult.stdout,{mode:0o600});
const manifest={createdAt:new Date().toISOString(),hostname:os.hostname(),database:{provider:'supabase-postgresql'},artifacts:[]};
for(const source of [dump,path.join(ROOT,'supabase','config.toml'),path.join(ROOT,'package.json')])if(fs.existsSync(source)){const dest=path.join(target,path.basename(source));if(source!==dump)fs.copyFileSync(source,dest);fs.chmodSync(dest,0o600);manifest.artifacts.push({name:path.basename(dest),bytes:fs.statSync(dest).size,sha256:sha256(dest)});}
const uploadDir=path.join(DATA_DIR,'uploads');
if(fs.existsSync(uploadDir)){const archive=path.join(target,'uploads.tar.gz');const result=spawnSync('tar',['-czf',archive,'-C',DATA_DIR,'uploads'],{encoding:'utf8'});if(result.status!==0)fail(`upload archive failed: ${String(result.stderr||'').trim()}`);fs.chmodSync(archive,0o600);manifest.artifacts.push({name:path.basename(archive),bytes:fs.statSync(archive).size,sha256:sha256(archive)});}
fs.writeFileSync(path.join(target,'manifest.json'),JSON.stringify(manifest,null,2)+'\n',{mode:0o600});
console.log(JSON.stringify({ok:true,provider:'supabase-postgresql',backupDir:target,artifacts:manifest.artifacts.map(x=>x.name)},null,2));
