/* Ensure every executable inline script in the legacy page remains parseable. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const pagePath = path.join(__dirname, '..', 'index.html');
const page = fs.readFileSync(pagePath, 'utf8');
const scriptPattern = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
const ignoredTypes = /^(?:application\/(?:json|ld\+json)|text\/(?:plain|template)|importmap)$/i;
const failures = [];
let match;
let index = 0;

while ((match = scriptPattern.exec(page))) {
  index += 1;
  const attributes = match[1];
  const source = match[2];
  const type = (attributes.match(/\btype\s*=\s*["']?([^"'\s>]+)/i) || [])[1] || 'classic';
  const isInline = !/\bsrc\s*=/i.test(attributes);
  const startLine = page.slice(0, match.index).split('\n').length;

  if (!isInline || ignoredTypes.test(type)) continue;

  try {
    new vm.Script(source, { filename: `index.html:inline-script-${index}` });
  } catch (error) {
    const relativeLine = Number((error.stack.match(/:(\d+)$/m) || [])[1] || 0);
    failures.push({
      index,
      line: startLine + relativeLine,
      column: Number((error.stack.match(/:(\d+):(\d+)/m) || [])[2] || 0),
      message: error.message,
      bytes: Buffer.byteLength(source),
    });
  }
}

assert.deepEqual(failures, [], `Invalid executable inline scripts:\n${JSON.stringify(failures, null, 2)}`);
console.log(`Validated ${index} script blocks in index.html; all executable inline scripts parse.`);
