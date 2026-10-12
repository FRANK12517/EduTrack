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
for(const file of fs.readdirSync(path.join(root,'dist')))assert.ok(PUBLIC_FILES.includes(file));
for(const file of ['ghana-hierarchy.js','school-login-boot.js','admin-dashboard-separation.js','school-module-loader.js']){assert.ok(html.includes(Buffer.from('src="'+file+'"')));assert.ok(fs.existsSync(path.join(root,'dist',file)));}
assert.ok(!fs.existsSync(path.join(root,'dist','server.js')));
assert.ok(!fs.existsSync(path.join(root,'dist','db')));
assert.equal(JSON.parse(fs.readFileSync(path.join(root,'vercel.json'))).outputDirectory,'dist');
console.log('PASS public build: exact server shell parity, canonical login adapters, public allowlist and no backend/archive files');
