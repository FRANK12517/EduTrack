'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { PUBLIC_FILES, renderLoginShell } = require('../app/login-shell');

const ROOT = path.resolve(__dirname, '..');
const OUTPUT = path.join(ROOT, 'dist');

function isWithin(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function collectFiles(directory, relative = '') {
  if (!fs.existsSync(directory)) return [];
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const name = relative ? `${relative}/${entry.name}` : entry.name;
    const absolute = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Refusing symbolic link in build output: ${name}`);
    if (entry.isDirectory()) files.push(...collectFiles(absolute, name));
    else if (entry.isFile()) files.push(name);
    else throw new Error(`Unsupported build output entry: ${name}`);
  }
  return files;
}

function buildPublic({ root = ROOT, output = path.join(root, 'dist'), publicFiles = PUBLIC_FILES, render = renderLoginShell } = {}) {
  const absoluteRoot = path.resolve(root);
  const absoluteOutput = path.resolve(output);
  if (!isWithin(absoluteRoot, absoluteOutput) || absoluteOutput === absoluteRoot) {
    throw new Error(`Build output must be a child of the application root: ${absoluteOutput}`);
  }
  if (!Array.isArray(publicFiles) || publicFiles.length === 0) throw new Error('Public asset registry is empty.');

  const seen = new Set();
  const prepared = [];
  for (const name of publicFiles) {
    if (typeof name !== 'string' || !name || name.includes('\\') || path.posix.isAbsolute(name) || name.split('/').some(part => !part || part === '.' || part === '..')) {
      throw new Error(`Invalid public asset path: ${String(name)}`);
    }
    if (seen.has(name)) throw new Error(`Duplicate public asset in registry: ${name}`);
    seen.add(name);
    const source = path.resolve(absoluteRoot, ...name.split('/'));
    if (!isWithin(absoluteRoot, source) || source === absoluteRoot) throw new Error(`Public asset escapes application root: ${name}`);
    let stat;
    try { stat = fs.statSync(source); }
    catch { throw new Error(`Required public build input is missing: ${name}`); }
    if (!stat.isFile()) throw new Error(`Required public build input is not a file: ${name}`);
    const sourceBytes = fs.readFileSync(source);
    const contents = name === 'index.html' ? render(sourceBytes) : sourceBytes;
    if (!Buffer.isBuffer(contents)) throw new Error(`Build renderer returned non-binary output for ${name}`);
    prepared.push({ name, contents });
  }
  if (!seen.has('index.html')) throw new Error('Public asset registry must include index.html.');

  const expected = new Set(prepared.map(file => file.name));
  for (const existing of collectFiles(absoluteOutput)) {
    if (!expected.has(existing)) throw new Error(`Unexpected file in build output; inspect before rebuilding: ${existing}`);
  }

  fs.mkdirSync(absoluteOutput, { recursive: true });
  for (const file of prepared) {
    const destination = path.resolve(absoluteOutput, ...file.name.split('/'));
    if (!isWithin(absoluteOutput, destination) || destination === absoluteOutput) throw new Error(`Build destination escapes output directory: ${file.name}`);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, file.contents);
  }
  return prepared.map(file => file.name);
}

if (require.main === module) {
  try {
    const files = buildPublic();
    console.log(`Built ${files.length} registered EduTrack public files in ${OUTPUT}.`);
  } catch (error) {
    console.error(`EduTrack public build failed: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { buildPublic };
