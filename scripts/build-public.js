'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {PUBLIC_FILES,renderLoginShell}=require('../app/login-shell');
const root=path.resolve(__dirname,'..');
const output=path.join(root,'dist');
fs.mkdirSync(output,{recursive:true});
const allowedTopLevel=new Set(PUBLIC_FILES.map(name=>name.split(/[\\\\/]/)[0]));
if(fs.readdirSync(output).some(name=>!allowedTopLevel.has(name)))throw new Error('Unexpected public build output; inspect dist before rebuilding.');
for(const name of PUBLIC_FILES){
 const source=path.join(root,name);
 if(!fs.existsSync(source))continue;
 const destination=path.join(output,name);
 fs.mkdirSync(path.dirname(destination),{recursive:true});
 fs.writeFileSync(destination,name==='index.html'?renderLoginShell(fs.readFileSync(source)):fs.readFileSync(source));
}
console.log('Built the canonical EduTrack login shell and public asset registry for Vercel.');
