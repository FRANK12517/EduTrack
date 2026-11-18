'use strict';

const fs = require('node:fs');
const path = require('node:path');

function read() {
  const directory = path.join(__dirname, '..', 'supabase', 'migrations');
  return fs.readdirSync(directory).filter(name => name.endsWith('.sql')).sort()
    .map(name => fs.readFileSync(path.join(directory, name), 'utf8'))
    .join('\n')
    .replace(/^CREATE TABLE IF NOT EXISTS public\.schema_migrations[^;]*;\r?\n?/m, '')
    .replace(/CREATE TABLE(?: IF NOT EXISTS)? public\./g, 'CREATE TABLE IF NOT EXISTS ');
}

module.exports = { read };
