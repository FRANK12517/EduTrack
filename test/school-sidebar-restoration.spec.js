const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const sidebar = fs.readFileSync(path.join(root, 'school-sidebar.js'), 'utf8');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const modules = ['transport-management.js', 'hostel-management.js', 'qr-attendance.js']
  .map(file => fs.readFileSync(path.join(root, file), 'utf8')).join('\n');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const auth = fs.readFileSync(path.join(root, 'privileged-auth.js'), 'utf8');

const labels = [
  'Dashboard', 'Switch Language', 'Setup / Config',
  'Subject Config', 'School Report Generator', 'Academic Year Report',
  'FMS Dashboard', 'Fee Setup', 'Class Structures', 'Record Payment',
  'Receipt Registry', 'Outstanding Fees', 'Financial Reports',
  'Attendance Register', 'Teacher Setup', 'Term Config', 'Attendance Report',
  'Analytics Dashboard', 'Notifications Log', 'Teacher Alert (5-Day / SISO)',
  'Teacher Critical Alert (1-Month / HR)', 'Integrity Check', 'Cloud Sync',
  'User Management', 'Assign Class to Teachers', 'Reassign Class', 'Assign Roles',
  'Publish Results', 'Block Result', 'Publish Mock Results', 'Block Mock Result',
  'New Student Admission', 'Transfer Admission', 'Student Search / Profile',
  'Staff Management', 'Score Entry', 'Multi-Subject Entry', 'Mock Entry',
  'Pupil Setup', 'SMS Logs', 'Pupils Report', 'Audit Trail', 'Attendance Reports',
  'Automation Hub', 'Headteacher Critical Alert (3-Day)', 'SHEP Activities',
  'Subject Register', 'Sporting Activities', 'Learning Management (LMS)',
  'Student Database', 'Result Slip', 'Mock Result', 'Mock Exam Analysis',
  'Broadsheet', 'Rankings', 'Chart Analysis', 'Index Generator',
  'AI Analytics Engine', 'Workflow Automation', 'Business Intelligence',
  'Student Health', 'Library', 'Timetable AI', 'Procurement', 'Guidance & Counselling',
  'Online Admission', 'Communication Hub', 'Chat', 'Control Panel',
  'Analytics Narrative', 'Quiz', 'Admissions Review', 'Transport Management',
  'Hostel Management', 'QR Attendance', 'User Guide', 'Copyright',
  'Acknowledgement', 'Developer', 'Log Out'
];

for (const label of labels) {
  assert.ok(sidebar.includes(`'${label}'`), `missing sidebar label: ${label}`);
}

const renderExpression = sidebar.slice(sidebar.indexOf('wrap.innerHTML='));
const groupOrder = [
  'Overview', "group('ng-cat-headteacher'", "group('ng-cat-teachers'",
  "group('ng-cat-shared'", "group('school-smart-management'",
  "group('school-integrated-modules'", '+info+'
];
let previous = -1;
for (const label of groupOrder) {
  const at = renderExpression.indexOf(label);
  assert.ok(at > previous, `group order broken at ${label}`);
  previous = at;
}

assert.match(sidebar, /class="nav-group-items"/);
assert.match(sidebar, /aria-expanded="false"/);
assert.match(sidebar, /function toggle\(id\)/);
assert.match(sidebar, /function activateScope\(root\)/);
assert.match(sidebar, /sidebarTotalPages=1/);
assert.match(sidebar, /sidebar\.style\.overflowY='auto'/);
assert.match(sidebar, /scroll\.style\.webkitOverflowScrolling='touch'/);
assert.match(sidebar, /data-school-logout="true"/);
assert.match(sidebar, /data-school-target=/);
assert.match(sidebar, /EDUTRACK_STAFF_MANAGEMENT_PART3&&EDUTRACK_STAFF_MANAGEMENT_PART3\.open/);
assert.doesNotMatch(sidebar, /p3-staff-management-nav.*\.click/);
assert.doesNotMatch(sidebar, /Coming Soon|showPage\(['"](?:gallery|login)|location\.(?:href|assign).*?(?:gallery|login)/i);

// Every page() target below is an existing page or is created by the existing
// enterprise/LMS bootstraps in index.html; every API target is an exported module.
for (const id of [
  'dashboard', 'setup', 'subjects', 'schoolreport', 'annualreport', 'teachers',
  'teachersetup', 'termconfig', 'tattendreport', 'tattendanalytics', 'tattendnotif',
  'teachalert5', 'teachalertmonth', 'integrity', 'sync', 'ges-assign-class',
  'ges-assign-roles', 'ges-publish-results', 'ges-block-result',
  'ges-publish-mock-results', 'ges-block-mock-result', 'gnsis-admission', 'pupils',
  'pupilsetup', 'smslogs', 'pupilreport', 'pa-audittrail', 'pa-reporting',
  'pa-automation', 'htcritical', 'entry', 'multientry', 'mock', 'lms-teacher',
  'students', 'slip', 'mockresult', 'mockanalysis', 'broadsheet', 'rankings',
  'analytics', 'indexgen', 'ent-ai', 'ent-workflow', 'ent-bi', 'ent-health',
  'ent-library', 'ent-timetable', 'ent-procurement', 'ent-guidance', 'ges-school',
  'transport-management', 'hostel-management', 'qr-attendance'
]) {
  assert.ok(index.includes(`page-${id}`) || modules.includes(`page-${id}`) || index.includes(`'${id}'`) || index.includes(`"${id}"`), `unmapped page target: ${id}`);
}
for (const api of [
  'EDUTRACK_ONLINE_ADMISSIONS', 'EDUTRACK_COMMUNICATION_HUB', 'EDUTRACK_CHAT',
  'EDUTRACK_CONTROL_PANEL', 'EDUTRACK_QUIZ_MODULE', 'EDUTRACK_ADMISSIONS_REVIEW'
]) {
  assert.match(sidebar, new RegExp(api));
  assert.match(index + fs.readFileSync(path.join(root, api === 'EDUTRACK_ONLINE_ADMISSIONS' ? 'online-admission.js' : api === 'EDUTRACK_COMMUNICATION_HUB' ? 'communication-hub.js' : api === 'EDUTRACK_CHAT' ? 'chat-module.js' : api === 'EDUTRACK_CONTROL_PANEL' ? 'control-panel.js' : api === 'EDUTRACK_QUIZ_MODULE' ? 'quiz-module.js' : 'admissions-review.js'), 'utf8'), new RegExp(`window\\.${api}`));
}
assert.match(sidebar, /EMS_SLD&&EMS_SLD\.openSection/);
assert.match(sidebar, /EMS_GNSIS_LIFE&&EMS_GNSIS_LIFE\.open/);
assert.match(sidebar, /data-private-school-feature/);
assert.match(sidebar, /ASSISTANTHEAD/);
assert.match(server, /school-sidebar\.js/);
assert.match(auth, /school-sidebar\.js\?v=20260908-school-nav-routes/);
assert.match(auth, /script\.dataset\.edutrackSchoolSidebar/);
for (const level of ['DISTRICT', 'REGIONAL', 'NATIONAL']) {
  assert.doesNotMatch(sidebar, new RegExp(`data-admin-level=["']${level}`));
}

console.log('Full school sidebar restoration and routing contract passed.');
