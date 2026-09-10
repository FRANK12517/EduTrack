'use strict';
const assert=require('node:assert/strict');const fs=require('node:fs');
const server=fs.readFileSync('server.js','utf8');const db=fs.readFileSync('db/relational.js','utf8');
assert.match(server,/\/api\/signatures\/resolve-result/);assert.match(server,/reporting\.read/);assert.match(server,/student\.school_id/);
assert.match(db,/resolveResultSignatures/);assert.match(db,/teacher_class_assignments/);assert.match(db,/student\.school_id/);
assert.match(db,/headteacherSignature/);assert.match(db,/classTeacherSignature/);
assert.match(fs.readFileSync('index.html','utf8'),/v134RenderSignatureFooter/);assert.match(fs.readFileSync('index.html','utf8'),/print/i);
console.log('Signature Phase 5 result-resolution integration contract passed.');
