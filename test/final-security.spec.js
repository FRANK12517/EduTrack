const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const server = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const gitignore = fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8');

const requiredControls = [
  'Strict-Transport-Security', 'HttpOnly', 'SameSite=Lax', 'requireSameOrigin',
  'Access-Control-Allow-Origin', 'MAX_BODY_BYTES', 'MAX_URL_BYTES', 'authorize(',
  'UPLOAD_LIMITS', 'PAYSTACK_WEBHOOK_SECRET', 'createHmac', 'AI_ROLE_LIMITS',
  'PROMPT_INJECTION_PATTERNS', 'X-Request-ID', 'security-audit'
];
for (const control of requiredControls) assert.ok(server.includes(control), `missing enforced control: ${control}`);

for (const forbidden of ['sk_live_', 'pk_live_', 'AKIA', 'BEGIN PRIVATE KEY', 'PAYSTACK_SECRET_KEY=']) {
  assert.equal(server.includes(forbidden), false, `possible credential pattern in server source: ${forbidden}`);
}
for (const requiredIgnore of ['.env', '.env.*', '*.log', '*.backup', 'data/uploads/']) assert.ok(gitignore.includes(requiredIgnore), `missing ignore rule: ${requiredIgnore}`);

const publicAllowlist = [...server.matchAll(/SAFE_PUBLIC_FILES[^\n]+/g)].map(match => match[0]).join('\n');
assert.ok(publicAllowlist.includes('index.html') && publicAllowlist.includes('privileged-auth.js'));
assert.equal(packageJson.scripts['test:security'], 'node test/security.spec.js');
assert.equal(packageJson.scripts['test:protected'], 'node test/protected-features.spec.js');
assert.equal(packageJson.scripts['test:final'], 'node test/final-security.spec.js');
console.log('Final security release-gate static checks passed.');
