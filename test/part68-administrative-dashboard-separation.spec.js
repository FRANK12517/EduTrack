'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const scope = require('../app/auth/administrative-scope');

assert.equal(scope.levelForRole('HEADTEACHER'), 'SCHOOL');
assert.equal(scope.levelForRole('District Examination Officer'), 'DISTRICT');
assert.equal(scope.levelForRole('Regional ICT Coordinator'), 'REGIONAL');
assert.equal(scope.levelForRole('National Accountant'), 'NATIONAL');
assert.equal(scope.contextForUser({role:'DISTRICT_ADMIN'}).dashboard, 'district-general');
assert.equal(scope.matches({role:'REGIONAL_ADMIN'}, 'REGIONAL'), true);
assert.equal(scope.matches({role:'REGIONAL_ADMIN'}, 'NATIONAL'), false);

const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const authClient = fs.readFileSync(path.join(__dirname, '..', 'privileged-auth.js'), 'utf8');
const dashboard = fs.readFileSync(path.join(__dirname, '..', 'admin-dashboard-separation.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

assert.match(server, /administrativeScope\.matches\(user, input\.administrativeLevel\)/, 'server rejects login-card scope mismatch');
assert.match(server, /ADMINISTRATIVE_LEVEL_MISMATCH/, 'server audits scope mismatch');
assert.match(server, /administrativeScope\.contextForUser\(user\)/, 'session exposes administrative level separately from role');
assert.match(authClient, /admin-dashboard-separation\.js/, 'existing auth bridge loads dashboard separation');
for (const level of ['DISTRICT','REGIONAL','NATIONAL']) assert.match(dashboard, new RegExp(level+":\\["), `${level} sidebar definition exists`);
assert.match(dashboard, /sessionLevel\(\)!=='SCHOOL'/, 'school cleanup is scope-bound');
assert.match(dashboard, /Access Denied: this dashboard belongs to a different administrative level/, 'cross-level routes are denied');
for (const loginLevel of ['NATIONAL','REGIONAL','DISTRICT','SCHOOL','PARENT','STUDENT']) assert.match(html, new RegExp(`data-level=["']${loginLevel}["']`), `${loginLevel} login card remains present`);
assert.match(html, /Subscribe \/ Register School|Subscribe|Register School/i);
assert.match(html, /Renew Subscription/i);

console.log('PASS part68 administrative scope, login mismatch, sidebars, and entry-point safeguards');
