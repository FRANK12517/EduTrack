'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {PUBLIC_FILES,renderLoginShell}=require('../app/login-shell');
const root=path.resolve(__dirname,'..');
const output=path.join(root,'dist');
fs.mkdirSync(output,{recursive:true});
if(fs.readdirSync(output).some(name=>!PUBLIC_FILES.includes(name)))throw new Error('Unexpected public build output; inspect dist before rebuilding.');
for(const name of PUBLIC_FILES){
 const source=path.join(root,name);
 if(!fs.existsSync(source))continue;
 fs.writeFileSync(path.join(output,name),name==='index.html'?renderLoginShell(fs.readFileSync(source)):fs.readFileSync(source));
}
console.log('Built the canonical EduTrack login shell and public asset registry for Vercel.');
