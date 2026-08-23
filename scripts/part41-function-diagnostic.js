'use strict';

const { spawnSync } = require('child_process');
const path = require('path');

const root = path.resolve(__dirname, '..');
const result = spawnSync(process.execPath, ['-e', "require('./server')"], {
  cwd: root,
  env: { ...process.env, NODE_ENV: 'production', VERCEL: '1' },
  encoding: 'utf8'
});
const output = `${result.stdout}\n${result.stderr}`;
const safe = output
  .replace(/([A-Z0-9_]*(?:PASSWORD|SECRET|TOKEN|KEY|CREDENTIAL)[A-Z0-9_]*)=[^\s]+/gi, '$1=[redacted]')
  .replace(/(https?:\/\/)[^\s]+/gi, '$1[redacted]')
  .replace(/Bearer\s+[^\s]+/gi, 'Bearer [redacted]');
const lines = safe.split(/\r?\n/).filter(Boolean).slice(-12);
const classification = /ENOENT.*\/data/.test(output) ? 'FILESYSTEM_INITIALIZATION_FAILURE' : /EDUTRACK_DATABASE_URL/.test(output) ? 'MISSING_REQUIRED_DATABASE_CONFIGURATION' : result.status === 0 ? 'NO_IMPORT_FAILURE' : 'IMPORT_FAILURE_UNCLASSIFIED';
console.log(JSON.stringify({ classification, exitCode: result.status, safeDiagnostics: lines }, null, 2));
process.exit(result.status === 0 ? 0 : 1);
