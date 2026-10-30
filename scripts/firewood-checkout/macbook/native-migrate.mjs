import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {configuration,databaseOptions,MAC_RUNTIME_ID,DATABASE_NAME,DATABASE_PORT} from './native-config.mjs';
import {postgresAdapter} from '../hosted/runtime.mjs';
import {verifyHost} from './ops/host-identity.mjs';

export async function migrate(db,config) {
  const identity=(await db.query('SELECT current_database() AS db,current_user AS role,host(inet_server_addr()) AS host,inet_server_port() AS port')).rows[0];
  if(identity.db!==DATABASE_NAME||identity.role!=='firewood_macbook_migrator'||identity.host!=='127.0.0.1'||identity.port!==DATABASE_PORT)throw new Error('dedicated_macbook_migration_required');
  return db.transaction(async tx=>{
    await tx.query('SELECT pg_advisory_xact_lock(1095914311)');
    await tx.query('CREATE TABLE IF NOT EXISTS firewood_macbook_migrations(name text PRIMARY KEY,sha256 text NOT NULL)');
    // Retain the reviewed internal queue names and immutable SQL. A separate
    // Mac identity table binds this new physical database to this runtime.
    for(const folder of [new URL('../migrations/',import.meta.url),new URL('../render/migrations/',import.meta.url)]){
      for(const name of (await readdir(folder)).filter(name=>name.endsWith('.sql')).sort()){
        const sql=await readFile(new URL(name,folder),'utf8'),hash=createHash('sha256').update(sql).digest('hex');
        const previous=(await tx.query('SELECT sha256 FROM firewood_macbook_migrations WHERE name=$1',[name])).rows[0];
        if(previous){if(previous.sha256!==hash)throw new Error('migration_changed');continue;}
        await tx.query(sql);
        await tx.query('INSERT INTO firewood_macbook_migrations VALUES($1,$2)',[name,hash]);
      }
    }
    await tx.query("CREATE TABLE IF NOT EXISTS firewood_macbook_environment(id text PRIMARY KEY CHECK(id='angel-firewood-macbook-native-qa'),origin text NOT NULL,account_id text NOT NULL)");
    await tx.query('INSERT INTO firewood_macbook_environment VALUES($1,$2,$3) ON CONFLICT(id) DO NOTHING',[MAC_RUNTIME_ID,config.origin,config.account]);
    const marker=(await tx.query('SELECT * FROM firewood_macbook_environment WHERE id=$1',[MAC_RUNTIME_ID])).rows[0];
    if(marker.origin!==config.origin||marker.account_id!==config.account)throw new Error('database_identity_conflict');
    await tx.query('GRANT USAGE ON SCHEMA public TO firewood_macbook_worker');
    await tx.query('GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO firewood_macbook_worker');
    for(const name of ['firewood_macbook_migrations','firewood_macbook_environment','firewood_render_environment','firewood_test_environment','firewood_test_crm_sync'])await tx.query(`REVOKE INSERT,UPDATE,DELETE ON ${name} FROM firewood_macbook_worker`);
  });
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  let pool;
  try{
    if(process.argv[2]!=='--apply-private-macbook-qa')throw new Error('explicit_migration_required');
    await verifyHost();
    const config=configuration(process.env,'migration'),{Pool}=await import('pg');
    pool=new Pool(databaseOptions(process.env,true));await migrate(postgresAdapter(pool),config);
    console.log('Private MacBook Firewood test schema verified.');
  }catch{console.error('MacBook QA migration refused or failed. No connection details are logged.');process.exitCode=1;}
  finally{if(pool)await pool.end();}
}
