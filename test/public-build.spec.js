'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { PUBLIC_FILES, renderLoginShell } = require('../app/login-shell');
const { buildPublic } = require('../scripts/build-public');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'dist');
execFileSync(process.execPath, [path.join(root, 'scripts/build-public.js')], { cwd: root, stdio: 'pipe' });

const builtFiles = [];
function collect(directory, relative = '') {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const name = relative ? `${relative}/${entry.name}` : entry.name;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) collect(absolute, name);
    else builtFiles.push(name);
  }
}
collect(output);
assert.deepEqual(builtFiles.sort(), [...PUBLIC_FILES].sort(), 'build emits every and only registered public file');
assert.deepEqual(fs.readFileSync(path.join(output, 'index.html')), renderLoginShell(fs.readFileSync(path.join(root, 'index.html'))));
for (const name of PUBLIC_FILES.filter(name => name !== 'index.html')) {
  assert.deepEqual(fs.readFileSync(path.join(output, name)), fs.readFileSync(path.join(root, name)), `${name} is copied without transformation`);
}
assert.ok(!builtFiles.includes('server.js'));
assert.ok(!builtFiles.some(name => name === 'db' || name.startsWith('db/')));

const sourceHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const icon = sourceHtml.match(/<img src="(\/assets\/edutrack-app-icon\.png)"[^>]*id="emsAppIconLocked"/);
assert.ok(icon, 'current locked EduTrack artwork uses its registered public asset');
assert.match(sourceHtml, /APP_ICON_LOCK_v186/);
assert.match(sourceHtml, /object-fit:\s*contain/);
assert.match(sourceHtml, /href="\/manifest\.webmanifest"/);
assert.match(sourceHtml, /href="\/assets\/favicon-16\.png"/);
assert.match(sourceHtml, /href="\/assets\/favicon-32\.png"/);
assert.match(sourceHtml, /href="\/assets\/apple-touch-icon\.png"/);
assert.match(sourceHtml, /window\.EMS_APP_ICON_LOCKED\s*=\s*src/);
assert.doesNotMatch(sourceHtml, /id="emsAppIconLocked"[^>]*src="data:image/);
const brandConfig = JSON.parse(fs.readFileSync(path.join(root, 'branding.config.json')));
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.webmanifest')));
const iconBytes = fs.readFileSync(path.join(root, 'assets/edutrack-app-icon.png'));
assert.equal(iconBytes.toString('ascii', 1, 4), 'PNG', 'current locked brand artwork is a PNG');
const iconSha256 = crypto.createHash('sha256').update(iconBytes).digest('hex').toUpperCase();
assert.equal(iconSha256, brandConfig.sourceSha256, 'brand config records the canonical source checksum');
assert.equal(iconSha256, '91199EC833B5A7A59996B9C290C68BCE3231C372DEC354991291D57AD7BD3D3A', 'canonical artwork matches the previously locked inline logo bytes');
assert.equal(brandConfig.logo.src, icon[1]);
assert.equal(brandConfig.logo.fit, 'contain');
assert.deepEqual(manifest.icons.map(item => item.src), brandConfig.pwaIcons);
for (const [name, size] of [['favicon-16.png',16],['favicon-32.png',32],['apple-touch-icon.png',180],['pwa-192.png',192],['pwa-512.png',512]]) {
  const png = fs.readFileSync(path.join(root, 'assets', name));
  assert.equal(png.toString('ascii', 1, 4), 'PNG', `${name} is PNG`);
  assert.equal(png.readUInt32BE(16), size, `${name} width`);
  assert.equal(png.readUInt32BE(20), size, `${name} height`);
}
for (const url of [...brandConfig.favicon, brandConfig.appleTouchIcon, ...brandConfig.pwaIcons, brandConfig.logo.src]) {
  assert.ok(PUBLIC_FILES.includes(url.replace(/^\//, '')), `${url} is in the public file registry`);
}
assert.ok(PUBLIC_FILES.includes('manifest.webmanifest'));
assert.match(fs.readFileSync(path.join(root, 'server.js'), 'utf8'), /application\/manifest\+json/);

const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'edutrack-build-check-'));
try {
  const fixtureRoot = path.join(fixture, 'source');
  const missingOutput = path.join(fixtureRoot, 'missing-dist');
  fs.mkdirSync(fixtureRoot, { recursive: true });
  fs.writeFileSync(path.join(fixtureRoot, 'index.html'), '<html></html>');
  assert.throws(
    () => buildPublic({ root: fixtureRoot, output: missingOutput, publicFiles: ['index.html', 'required.js'], render: buffer => buffer }),
    /Required public build input is missing: required\.js/
  );
  assert.equal(fs.existsSync(missingOutput), false, 'missing-input validation fails before creating output');

  const guardedOutput = path.join(fixtureRoot, 'guarded-dist');
  fs.mkdirSync(guardedOutput);
  fs.writeFileSync(path.join(guardedOutput, 'keep.txt'), 'user data');
  assert.throws(
    () => buildPublic({ root: fixtureRoot, output: guardedOutput, publicFiles: ['index.html'], render: buffer => buffer }),
    /Unexpected file in build output/
  );
  assert.equal(fs.readFileSync(path.join(guardedOutput, 'keep.txt'), 'utf8'), 'user data', 'unexpected existing output is preserved');
} finally {
  fs.rmSync(fixture, { recursive: true, force: true });
}

delete process.env.VERCEL;
delete process.env.AWS_LAMBDA_FUNCTION_NAME;
process.env.NODE_ENV = 'test';
const runtimeDataFile = path.join(os.tmpdir(), `edutrack-public-build-${process.pid}.json`);
process.env.EDUTRACK_DATA_FILE = runtimeDataFile;
const { handler } = require('../server');
async function verifyServedAssets() {
  const server = http.createServer((req, res) => Promise.resolve(handler(req, res)).catch(error => {
    if (!res.headersSent) res.writeHead(500);
    res.end(error.message);
  }));
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const pngResponse = await fetch(`${base}/assets/pwa-192.png`);
    assert.equal(pngResponse.status, 200);
    assert.match(pngResponse.headers.get('content-type'), /^image\/png/);
    assert.deepEqual(Buffer.from(await pngResponse.arrayBuffer()), fs.readFileSync(path.join(root, 'assets/pwa-192.png')));
    const manifestResponse = await fetch(`${base}/manifest.webmanifest`);
    assert.equal(manifestResponse.status, 200);
    assert.match(manifestResponse.headers.get('content-type'), /^application\/manifest\+json/);
    assert.deepEqual(await manifestResponse.json(), manifest);
    const privateResponse = await fetch(`${base}/server.js`);
    assert.equal(privateResponse.status, 404, 'server source is not publicly served');
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    fs.rmSync(runtimeDataFile, { force: true });
  }
}

verifyServedAssets().then(() => {
  console.log(`PASS public build and runtime: ${PUBLIC_FILES.length} exact assets, locked branding, PWA metadata, strict input validation and protected output`);
}).catch(error => {
  console.error(error);
  process.exitCode = 1;
});
