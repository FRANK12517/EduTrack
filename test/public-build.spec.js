'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const {renderLoginShell,PUBLIC_FILES}=require('../app/login-shell');
const root=path.resolve(__dirname,'..');
execFileSync(process.execPath,[path.join(root,'scripts/build-public.js')],{cwd:root});
const html=fs.readFileSync(path.join(root,'dist/index.html'));
assert.deepEqual(html,renderLoginShell(fs.readFileSync(path.join(root,'index.html'))));
const builtFiles=[];
function collectBuilt(directory,relative=''){for(const entry of fs.readdirSync(directory,{withFileTypes:true})){const name=relative?`${relative}/${entry.name}`:entry.name;const absolute=path.join(directory,entry.name);if(entry.isDirectory())collectBuilt(absolute,name);else builtFiles.push(name);}}
collectBuilt(path.join(root,'dist'));
for(const file of builtFiles)assert.ok(PUBLIC_FILES.includes(file),`built file is registered: ${file}`);
for(const file of ['ghana-hierarchy.js','school-login-boot.js','admin-dashboard-separation.js','school-module-loader.js']){assert.ok(html.includes(Buffer.from('src="'+file+'"')));assert.ok(fs.existsSync(path.join(root,'dist',file)));}
assert.ok(!fs.existsSync(path.join(root,'dist','server.js')));
assert.ok(!fs.existsSync(path.join(root,'dist','db')));
for(const file of ['manifest.webmanifest','assets/edutrack-app-icon.png','assets/favicon-16.png','assets/favicon-32.png','assets/apple-touch-icon.png','assets/pwa-192.png','assets/pwa-512.png'])assert.ok(builtFiles.includes(file),`branding file is included: ${file}`);
assert.equal(JSON.parse(fs.readFileSync(path.join(root,'vercel.json'))).outputDirectory,'dist');
console.log('PASS public build: exact server shell parity, canonical login adapters, public allowlist and no backend/archive files');
