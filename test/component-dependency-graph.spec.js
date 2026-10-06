'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Exercise the actual inline scanner, including names inherited by ordinary objects.
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const start = html.indexOf('  function buildGraph(){');
const end = html.indexOf('\n  function runScan(', start);
assert.ok(start >= 0 && end > start, 'canonical dependency scanner exists');
const names = ['constructor', 'toString', '__proto__', 'hasOwnProperty', 'Dashboard'];
const found = Object.fromEntries(names.map((name, i) => [String(i), { name, type: 'component' }]));
const items = Object.fromEntries(names.map((name, i) => [String(i), { dependencyMap: [...names, name] }]));
const context = {
  window: { EMS_COMPONENT_REGISTRY: { getRegistry: () => ({ items }), discover: () => found } },
  kindOf: () => 'Component', nowStr: () => 'test'
};
vm.createContext(context);
vm.runInContext(html.slice(start, end), context);
const graph = context.buildGraph();
for (const name of names) {
  assert.deepEqual(Array.from(graph.reverse[name]), names, `${name}: deduplicated reverse edges`);
  assert.equal(graph.forward[name].length, names.length + 1);
  assert.equal(graph.kinds[name], 'Component');
  assert.equal(graph.types[name], 'component');
}
assert.equal(Object.getPrototypeOf(graph.reverse), null);
assert.equal(items['0'].dependencyMap.length, names.length + 1, 'registry remains unchanged');
context.window.EMS_COMPONENT_REGISTRY = null;
assert.equal(context.buildGraph(), null, 'unavailable registry remains supported');
console.log('PASS component dependency graph: inherited-name collisions, deduplication, registry preservation');
