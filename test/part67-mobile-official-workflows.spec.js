'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '..', 'individual-result-slip-fix.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

function expectSource(pattern, message) {
  assert.match(source, pattern, message);
}

assert.match(html, /src="\/individual-result-slip-fix\.js" defer/, 'enhancement module is loaded by the application');
expectSource(/MASTER_WIDTH\s*=\s*650/, 'desktop result-slip proportions remain the scaling master');
expectSource(/available\s*\/\s*MASTER_WIDTH/, 'result slip scale is calculated from available width');
expectSource(/@media \(max-width:700px\).*?et-slip-scale-stage/s, 'mobile slip scaling is viewport-scoped');
expectSource(/@media print.*?transform:none!important.*?color:#000!important/s, 'print restores full-size layout and dark official text');
expectSource(/slip-watermark img\{opacity:\.14!important/, 'watermark overrides the legacy faint inline opacity');
expectSource(/page-fms-.*?tbl-wrap.*?overflow-x:auto/s, 'Fee Hub tables preserve columns with controlled horizontal scrolling');
expectSource(/page-fms-.*?padding:\.65rem!important/s, 'Fee Hub uses mobile-safe page padding');
expectSource(/gw-pa-box.*?min-width:44px!important.*?min-height:44px!important/s, 'attendance choices expose touch-sized targets');
expectSource(/gw-submit-bar\{bottom:0/, 'attendance submit action remains accessible');
expectSource(/closest\('#v83-print-mount'\)/, 'print/PDF mount is excluded from preview transforms');

for (const mode of ['header', 'watermark', 'both', 'none']) {
  assert.ok(html.toLowerCase().includes(`'${mode}'`) || html.toLowerCase().includes(`"${mode}"`), `existing ${mode} logo mode remains present`);
}

console.log('PASS part67 mobile result slip, Fee Hub, print, watermark, and attendance safeguards');
