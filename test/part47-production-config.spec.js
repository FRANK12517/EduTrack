'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const vercel = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'vercel.json'), 'utf8'));
const rootHeaders = (vercel.headers || []).find((entry) => entry.source === '/');
assert.ok(rootHeaders, 'Vercel root header rule must exist');
const rootHeaderMap = Object.fromEntries((rootHeaders.headers || []).map((header) => [header.key.toLowerCase(), header.value]));
assert.strictEqual(rootHeaderMap['access-control-allow-origin'], 'https://www.edutrackgh.online');
assert.strictEqual(rootHeaderMap['access-control-allow-origin'], rootHeaderMap['access-control-allow-origin'].trim());
assert.notStrictEqual(rootHeaderMap['access-control-allow-origin'], '*');
assert.strictEqual(rootHeaderMap.vary, 'Origin');

const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
assert.doesNotMatch(server, /Access-Control-Allow-Origin[^\n]*\*/);
assert.match(server, /function applyCors\(req, res\)/);
assert.match(server, /Access-Control-Allow-Credentials/);
assert.match(server, /OPTIONS/);

console.log('Part 47 production config CORS regression passed.');
