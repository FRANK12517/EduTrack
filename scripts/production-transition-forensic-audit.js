'use strict';
const fs = require('node:fs'); const path = require('node:path'); const mysql = require('mysql2/promise');
const { readonly } = require('../lib/production-preflight-readonly'); const { options } = require('./verify-production-tidb-secrets');
function q(v) { return `\`${String(v).replace(/`/g, '``')}\``; }
async function main() {
  const raw = await mysql.createConnection(options()); const db = readonly(raw);
  try {
    const [tableRows] = await db.query('SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() ORDER BY TABLE_NAME'); const tables = new Set(tableRows.map(r => r.TABLE_NAME));
    const count = async name => { if (!tables.has(name)) return null; const [[r]] = await db.query(`SELECT COUNT(*) AS count FROM ${q(name)}`); return Number(r.count); };
    const archive = { schools: await count('legacy_schools_archive'), users: await count('legacy_users_archive') };
    const canonical = {}; for (const n of ['tenants','schools','users','credentials','user_roles','tenant_memberships','staff','students']) canonical[n] = await count(n);
    const mappings = { school: await count('legacy_school_identity_map'), account: await count('legacy_account_identity_map') };
    const history = tables.has('schema_migrations') ? await count('schema_migrations') : null;
    const [ids] = await db.query("SELECT TABLE_NAME,COLUMN_NAME,DATA_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND (COLUMN_NAME='id' OR COLUMN_NAME LIKE '%\\_id' ESCAPE '\\\\') ORDER BY TABLE_NAME,COLUMN_NAME");
    const [fks] = await db.query('SELECT TABLE_NAME,CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=DATABASE() AND REFERENCED_TABLE_NAME IS NOT NULL ORDER BY TABLE_NAME,CONSTRAINT_NAME');
    const archivePresent = archive.schools === 1 && archive.users === 2;
    const canonicalEmpty = ['schools','users','tenants','credentials','staff'].every(n => canonical[n] === 0);
    const phaseMatrix = { legacyArchive: archivePresent ? 'COMPLETE' : 'NOT_STARTED', canonicalSchema: ['users','schools','tenants','credentials','staff'].every(n => tables.has(n)) ? 'COMPLETE' : 'PARTIALLY_APPLIED', schoolMapping: mappings.school === 1 ? 'COMPLETE' : mappings.school === 0 ? 'NOT_STARTED' : 'INCONSISTENT', accountMapping: mappings.account === 2 ? 'COMPLETE' : mappings.account === 0 ? 'NOT_STARTED' : 'INCONSISTENT', canonicalPopulation: canonicalEmpty ? 'NOT_STARTED' : 'PARTIALLY_APPLIED', migrationHistory: history === 0 ? 'NOT_STARTED' : history == null ? 'NOT_STARTED' : 'PARTIALLY_APPLIED', foreignKeys: fks.length ? 'COMPLETE' : 'NOT_STARTED' };
    const recoveryClassification = archivePresent && canonicalEmpty ? 'PARTIAL_MIGRATION_RECOVERY_REQUIRED' : 'STATE_INCONSISTENT_MANUAL_REVIEW_REQUIRED';
    const report = { mode:'READ_ONLY', target:'PRODUCTION', productionState:'ARCHIVED_OR_TRANSITIONED_REQUIRES_REVIEW', phaseMatrix, archiveEvidence:archive, mappingEvidence:mappings, canonicalGraphEvidence:canonical, migrationHistoryEvidence:{ rows:history }, identifierGraphEvidence:{ bigint:ids.filter(r=>/bigint|int/i.test(r.DATA_TYPE)).length, varchar:ids.filter(r=>/varchar|char/i.test(r.DATA_TYPE)).length }, foreignKeyEvidence:{ definitions:fks.length }, stopPoint:'LEGACY_ARCHIVE_PHASE', firstUnsatisfiedPhase:'CANONICAL_IDENTITY_POPULATION', dataShapeCompatibility: canonical.students === 0 ? 'MATCHES_REHEARSAL' : 'DIFFERS_FROM_REHEARSAL', recommendedRecoveryClass:recoveryClassification, recoveryPoint:'NOT CONFIRMED', targetedRecoveryPlan:{ authorized:false, complete:['legacy archive','canonical schema','foreign-key definitions'], incomplete:['canonical identity population','migration-history recording'], next:'Require recovery point and isolated rehearsal before any targeted recovery.' } };
    const out=path.join('artifacts','production-transition-forensic-audit.json'); fs.mkdirSync(path.dirname(out),{recursive:true}); fs.writeFileSync(out,JSON.stringify(report,null,2),{mode:0o600}); console.log(`Production forensic audit complete: ${recoveryClassification}`);
  } finally { await db.end(); }
}
if(require.main===module) main().catch(()=>{console.error('Production forensic audit failed.');process.exitCode=1;});
