// Initial, owner-approved primary only. This adapter does not label production
// as a synthetic candidate or bypass the original baseline checks.
import fs from'node:fs';import assert from'node:assert/strict';import{PrimaryIO}from'./primary-io.mjs';import{primaryWriteFenceSql}from'./primary-write-fence.mjs';
const io=new PrimaryIO();assert.equal(process.argv[2],'initial-install');
const db=io.inspect(io.db);assert.equal(db.Image,io.approval.databaseImage);assert.equal(db.HostConfig.RestartPolicy.Name,'no');assert.deepEqual(db.HostConfig.PortBindings??{},{});
assert.equal(io.sql('select system_identifier::text from pg_control_system();',{user:'postgres'}),io.approval.systemIdentifier);
assert.equal(io.sql("select md5(string_agg(version,',' order by version)) from supabase_migrations.schema_migrations;"),'46394436fcbf2f2d7d516b69c84a45af');
assert.equal(io.sql("select count(*) from pg_namespace where nspname='hosting_guard';"),'0');
for(const service of ['auth','rest','storage','imgproxy','api-gw'])assert.equal(io.inspect(io.project+'-'+service+'-1').State.Running,false);
io.sql("set ats.hosting.primary_initial_install='ats_crm_primary_20261029';\n"+fs.readFileSync(new URL('./primary-production-catalog.sql',import.meta.url),'utf8'));
for(const name of ['candidate-privilege-reconciliation.sql','candidate-managed-defaults.sql']){
 let sql=fs.readFileSync(new URL('./'+name,import.meta.url),'utf8');assert.equal(sql.split("current_setting('ats.hosting.candidate_only',true) is distinct from 'yes'").length,2);
 sql=sql.replace("current_setting('ats.hosting.candidate_only',true) is distinct from 'yes'","current_setting('ats.hosting.primary_initial_install',true) is distinct from 'ats_crm_primary_20261029'").replace('Isolated candidate flag required','Explicit primary installation flag required');
 io.sql("set ats.hosting.primary_initial_install='ats_crm_primary_20261029';\n"+sql);
}
io.sql(primaryWriteFenceSql().sql);
io.sql("do $roles$ declare r record;begin for r in select rolname from pg_roles where rolcanlogin and rolname not in('postgres','supabase_admin') loop execute format('alter role %I nologin',r.rolname);end loop;end $roles$;");
io.sql("set ats.hosting.primary_initial_install='ats_crm_primary_20261029';\n"+fs.readFileSync(new URL('./primary-initial-privilege-parity.sql',import.meta.url),'utf8'));
io.assertSource();console.log(JSON.stringify({initialPrimaryGuardInstalled:true,migrations:102,apisStopped:true,productionChanged:false}));
