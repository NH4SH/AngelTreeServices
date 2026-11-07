import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { configuration, databaseOptions, RUNTIME_ID } from './config.mjs';
import { postgresAdapter } from '../hosted/runtime.mjs';

// Explicit operator command only: web/worker startup never migrates a database.
export async function migrate(db,config) {
  return db.transaction(async tx=>{
    await tx.query('SELECT pg_advisory_xact_lock(1095914310)');
    await tx.query('CREATE TABLE IF NOT EXISTS firewood_render_migrations(name text PRIMARY KEY,sha256 text NOT NULL)');
    for(const folder of [new URL('../migrations/',import.meta.url),new URL('./migrations/',import.meta.url)]) {
      for(const name of (await readdir(folder)).filter(name=>name.endsWith('.sql')).sort()) {
        const sql=await readFile(new URL(name,folder),'utf8'), hash=createHash('sha256').update(sql).digest('hex');
        const previous=(await tx.query('SELECT sha256 FROM firewood_render_migrations WHERE name=$1',[name])).rows[0];
        if(previous){if(previous.sha256!==hash)throw new Error('migration_changed');continue;}
        await tx.query(sql);
        await tx.query('INSERT INTO firewood_render_migrations(name,sha256) VALUES($1,$2)',[name,hash]);
      }
    }
    await tx.query(`INSERT INTO firewood_render_environment(id,origin,web_id,worker_id,account_id)
      VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO NOTHING`,[RUNTIME_ID,config.origin,config.webId,config.workerId,config.account]);
    const marker=(await tx.query('SELECT * FROM firewood_render_environment WHERE id=$1',[RUNTIME_ID])).rows[0];
    if(marker.origin!==config.origin||marker.web_id!==config.webId||marker.worker_id!==config.workerId||marker.account_id!==config.account)throw new Error('database_identity_conflict');
    // Application workers can use data but cannot migrate or change identity.
    await tx.query('GRANT USAGE ON SCHEMA public TO firewood_worker');
    await tx.query('GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO firewood_worker');
    await tx.query('REVOKE INSERT,UPDATE,DELETE ON firewood_render_environment,firewood_render_migrations,firewood_test_environment FROM firewood_worker');
    await tx.query('REVOKE INSERT,UPDATE,DELETE ON firewood_test_crm_sync FROM firewood_worker');
  });
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  let pool;
  try {
    const config=configuration(process.env,'migration');
    if(process.argv[2]!=='--apply-isolated-qa')throw new Error('explicit_migration_required');
    const {Pool}=await import('pg');pool=new Pool(databaseOptions(process.env,true));
    await migrate(postgresAdapter(pool),config);
    console.log('Dedicated Firewood QA migrations verified. No live or CRM database is supported.');
  }catch{console.error('Firewood QA migration refused or failed; verify isolated database identity and roles.');process.exitCode=1;}
  finally{if(pool)await pool.end();}
}
