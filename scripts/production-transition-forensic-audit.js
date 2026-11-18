'use strict';
const fs = require('node:fs'); const path = require('node:path'); const { Client } = require('pg'); const { poolOptions } = require('../lib/postgres-pool');
const { readonly } = require('../lib/production-preflight-readonly');
function q(v) { return `"${String(v).replace(/"/g, '""')}"`; }
async function main() {
  if (process.env.EDUTRACK_PRODUCTION_PREFLIGHT_TARGET !== 'production-read-only') throw new Error('Production read-only target is not explicitly authorized');
  const opts=poolOptions({...process.env,EDUTRACK_DB_POOL_SIZE:'1'}); if(['localhost','127.0.0.1','::1','[::1]'].includes(new URL(opts.connectionString).hostname))throw new Error('Production read-only target cannot be local');
  const client=new Client({connectionString:opts.connectionString,ssl:opts.ssl});await client.connect();await client.query('BEGIN READ ONLY');const raw={async query(sql,values){const result=await client.query(sql,values);return[result.rows,result.fields]},async end(){try{await client.query('ROLLBACK')}finally{await client.end()}}};const db=readonly(raw);
  try {
    const [tableRows] = await db.query("SELECT table_name AS \"TABLE_NAME\" FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name"); const tables = new Set(tableRows.map(r => r.TABLE_NAME));
    const count = async name => { if (!tables.has(name)) return null; const [[r]] = await db.query(`SELECT COUNT(*) AS count FROM public.${q(name)}`); return Number(r.count); };
    const archive = { schools: await count('legacy_schools_archive'), users: await count('legacy_users_archive') };
    const canonical = {}; for (const n of ['tenants','schools','users','credentials','user_roles','tenant_memberships','staff','students']) canonical[n] = await count(n);
    const mappings = { school: await count('legacy_school_identity_map'), account: await count('legacy_account_identity_map') };
    const history = tables.has('schema_migrations') ? await count('schema_migrations') : null;
    const [ids] = await db.query("SELECT table_name AS \"TABLE_NAME\",column_name AS \"COLUMN_NAME\",data_type AS \"DATA_TYPE\" FROM information_schema.columns WHERE table_schema='public' AND (column_name='id' OR column_name LIKE '%\\_id' ESCAPE '\\\\') ORDER BY table_name,column_name");
    const [fks] = await db.query("SELECT k.table_name AS \"TABLE_NAME\",k.constraint_name AS \"CONSTRAINT_NAME\" FROM information_schema.key_column_usage k JOIN information_schema.table_constraints t ON t.constraint_schema=k.constraint_schema AND t.constraint_name=k.constraint_name AND t.constraint_type='FOREIGN KEY' WHERE k.table_schema='public' ORDER BY k.table_name,k.constraint_name");
    const archivePresent = archive.schools === 1 && archive.users === 2;
    const canonicalEmpty = ['schools','users','tenants','credentials','staff'].every(n => canonical[n] === 0);
    const phaseMatrix = { legacyArchive: archivePresent ? 'COMPLETE' : 'NOT_STARTED', canonicalSchema: ['users','schools','tenants','credentials','staff'].every(n => tables.has(n)) ? 'COMPLETE' : 'PARTIALLY_APPLIED', schoolMapping: mappings.school === 1 ? 'COMPLETE' : mappings.school === 0 ? 'NOT_STARTED' : 'INCONSISTENT', accountMapping: mappings.account === 2 ? 'COMPLETE' : mappings.account === 0 ? 'NOT_STARTED' : 'INCONSISTENT', canonicalPopulation: canonicalEmpty ? 'NOT_STARTED' : 'PARTIALLY_APPLIED', migrationHistory: history === 0 ? 'NOT_STARTED' : history == null ? 'NOT_STARTED' : 'PARTIALLY_APPLIED', foreignKeys: fks.length ? 'COMPLETE' : 'NOT_STARTED' };
    const recoveryClassification = archivePresent && canonicalEmpty ? 'PARTIAL_MIGRATION_RECOVERY_REQUIRED' : 'STATE_INCONSISTENT_MANUAL_REVIEW_REQUIRED';
    const report = { mode:'READ_ONLY', target:'PRODUCTION', productionState:'ARCHIVED_OR_TRANSITIONED_REQUIRES_REVIEW', phaseMatrix, archiveEvidence:archive, mappingEvidence:mappings, canonicalGraphEvidence:canonical, migrationHistoryEvidence:{ rows:history }, identifierGraphEvidence:{ bigint:ids.filter(r=>/bigint|int/i.test(r.DATA_TYPE)).length, varchar:ids.filter(r=>/varchar|char/i.test(r.DATA_TYPE)).length }, foreignKeyEvidence:{ definitions:fks.length }, stopPoint:'LEGACY_ARCHIVE_PHASE', firstUnsatisfiedPhase:'CANONICAL_IDENTITY_POPULATION', dataShapeCompatibility: canonical.students === 0 ? 'MATCHES_REHEARSAL' : 'DIFFERS_FROM_REHEARSAL', recommendedRecoveryClass:recoveryClassification, recoveryPoint:'NOT CONFIRMED', targetedRecoveryPlan:{ authorized:false, complete:['legacy archive','canonical schema','foreign-key definitions'], incomplete:['canonical identity population','migration-history recording'], next:'Require recovery point and isolated rehearsal before any targeted recovery.' } };
    const out=path.join('artifacts','production-transition-forensic-audit.json'); fs.mkdirSync(path.dirname(out),{recursive:true}); fs.writeFileSync(out,JSON.stringify(report,null,2),{mode:0o600}); console.log(`Production forensic audit complete: ${recoveryClassification}`);
  } finally { await db.end(); }
}
if(require.main===module) main().catch(()=>{console.error('Production forensic audit failed.');process.exitCode=1;});
