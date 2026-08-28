'use strict';
const assert = require('assert');
function classify(value) {
  const origins = String(value || '').split(',').map((x) => x.trim()).filter(Boolean);
  return origins.length > 0 && !origins.includes('*') && origins.every((x) => /^https:\/\//.test(x));
}
assert.strictEqual(classify('https://staging.example.test'), true);
assert.strictEqual(classify('*'), false);
assert.strictEqual(classify('http://localhost:3000'), false);
assert.strictEqual(classify(''), false);
console.log('Part 42 origin configuration checks passed.');
