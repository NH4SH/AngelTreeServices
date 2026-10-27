// Restore only a new, internal, synthetic cluster. Never restore over staging.
import assert from 'node:assert/strict';import{readFileSync,writeFileSync,mkdirSync,copyFileSync,existsSync}from'node:fs';
import{CandidateIO,digest,literal,identifier}from'./candidate-io.mjs';import{captureManifestSql}from'./capture-manifest.mjs';import{hardFenceProblems}from'./failover-proof.mjs';
import{functionMetadataSql,compareRecoveredManifest}from'./function-metadata.mjs';
const io=new CandidateIO(),from=io.folder+'/offsite-restored-capture',manifest=JSON.parse(readFileSync(from+'/manifest.private.json')),proof=JSON.parse(readFileSync(io.folder+'/capture-proof.json'));
assert.equal(manifest.syntheticOnly,true);assert.equal(manifest.sourceMigrationCount,102);assert.equal(digest(readFileSync(from+'/manifest.private.json')),proof.manifestSha256);
for(const[file,expected]of[['database.dump',manifest.databaseSha256],['objects.tar',manifest.objectArchiveSha256],['release-source.tar.gz',manifest.releaseSourceSha256]])assert.equal(digest(readFileSync(from+'/'+file)),expected);
assert.deepEqual(hardFenceProblems(manifest.sourceFence),[]);
for(const c of manifest.sourceFence.containers){const actual=io.inspect(io.project+'-'+c.service+'-1');assert.equal(actual.Id,c.id);assert.equal(actual.State.Running,false);}
const resume=process.env.ATS_RESTORE_RESUME_AFTER_SCHEMA==='1';
const project='ats_crm_recovery_'+io.id,target=project+'-db-1',dir=io.folder+'/recovered-stack';assert.equal(existsSync(dir),resume,'Refuse overwriting a recovery target.');if(!resume)mkdirSync(dir,{mode:0o700});
const config=JSON.parse(readFileSync(io.root+'/selfhost/compose.json'));config.name=project;
for(const service of Object.values(config.services))if(service.volumes)service.volumes=service.volumes.map(v=>v.startsWith('./volumes/')?io.root+'/selfhost/'+v.slice(2):v);
if(config.services.app.ports)delete config.services.app.ports;
if(!resume){copyFileSync(from+'/core.private.env',dir+'/core.private.env');copyFileSync(from+'/app.private.env',dir+'/app.private.env');writeFileSync(dir+'/compose.json',JSON.stringify(config,null,2)+'\n',{mode:0o600});}
const compose=['compose','--env-file',dir+'/core.private.env','-f',dir+'/compose.json'];
io.docker([...compose,'config','--quiet']);io.docker([...compose,'up','-d','--wait','--wait-timeout','120','db']);await io.ready(target);
const info=io.inspect(target);assert.equal(info.Image,manifest.sourceDbImage);assert.deepEqual(info.HostConfig.PortBindings??{},{});assert.equal(info.Config.Labels['com.docker.compose.project'],project);
if(!resume){
assert.equal(Number(io.sql('select count(*) from auth.users;',{container:target})),0,'A supposedly new cluster already has users.');
for(const r of manifest.roles){const flags=[[r.rolsuper,'SUPERUSER'],[r.rolinherit,'INHERIT'],[r.rolcreaterole,'CREATEROLE'],[r.rolcreatedb,'CREATEDB'],[false,'LOGIN'],[r.rolreplication,'REPLICATION'],[r.rolbypassrls,'BYPASSRLS']].map(([v,k])=>(v?'':'NO')+k).join(' ');if(['postgres','supabase_admin'].includes(r.rolname))continue;io.sql(`do $$begin if not exists(select 1 from pg_roles where rolname=${literal(r.rolname)})then create role ${identifier(r.rolname)} ${flags};else alter role ${identifier(r.rolname)} nologin;end if;end$$;`,{container:target});}
for(const m of manifest.memberships)io.sql(`grant ${identifier(m.role_name)} to ${identifier(m.member_name)} with admin ${m.admin_option},inherit ${m.inherit_option},set ${m.set_option};`,{container:target});
// This is the brand-new clone's empty bootstrap database, proven above. The
// actual source cluster and both hosted projects are never drop/restore targets.
io.sql('drop database postgres with(force);',{container:target,database:'template1'});io.sql('create database postgres with template template0;',{container:target,database:'template1'});
io.binary(['exec','-i',target,'pg_restore','-U','supabase_admin','-d','postgres','--exit-on-error'],io.folder+'/restore-output.private.log',{inputFile:from+'/database.dump'});
for(const s of manifest.sequenceOwnerPrivileges){assert.ok(s.privileges.every(p=>['SELECT','UPDATE','USAGE'].includes(p)));if(s.privileges.length)io.sql(`grant ${s.privileges.join(',')} on sequence ${identifier(s.schema_name)}.${identifier(s.sequence_name)} to ${identifier(s.owner_name)};`,{container:target});}
}else assert.equal(Number(io.sql("select count(*) from pg_roles where rolcanlogin and rolname not in('postgres','supabase_admin');",{container:target})),0);
const after=JSON.parse(io.sql(captureManifestSql,{container:target}));io.json('restored-database-manifest.private.json',after);
let originalFunctions=manifest.functionDetails;
if(!originalFunctions){const witness=JSON.parse(readFileSync(io.folder+'/source-function-restore-witness.json'));assert.equal(witness.manifestSha256,proof.manifestSha256);assert.ok(JSON.stringify(witness.database)===JSON.stringify(manifest.database),'Legacy witness no longer matches the frozen archive.');originalFunctions=witness.functions;}
const functionComparison=compareRecoveredManifest(manifest.database,after,originalFunctions,JSON.parse(io.sql(functionMetadataSql,{container:target})));io.json('function-semantic-comparison.json',functionComparison);
assert.equal(io.sql('select expires_at<clock_timestamp() or database_started_at<>pg_postmaster_start_time() from hosting_guard.state;',{container:target}),'t');
const coreEnv=Object.fromEntries(readFileSync(dir+'/core.private.env','utf8').trim().split('\n').map(line=>{const n=line.indexOf('=');return[line.slice(0,n),line.slice(n+1)];}));assert.equal(coreEnv.POSTGRES_PASSWORD,io.config.pg);
for(const r of manifest.roles.filter(r=>r.rolcanlogin&&!['postgres','supabase_admin'].includes(r.rolname)))io.sql(`alter role ${identifier(r.rolname)} password ${literal(coreEnv.POSTGRES_PASSWORD)} nologin;`,{container:target});
const volume=project+'_object-data',nodeImage='node:22.23.4-bookworm-slim@sha256:de170b39439eb0e5a3444ad7d60b015614a381e10fecae2e30ec9e735122f38d';
io.docker(['volume','create','--label','ats-purpose=synthetic-failover-recovery',volume]);
io.docker(['run','--rm','--network','none','--read-only','--user','0:0','--cap-drop','ALL','--cap-add','CHOWN','--security-opt','no-new-privileges:true','--mount','type=volume,src='+volume+',dst=/objects','--entrypoint','/bin/sh',nodeImage,'-c','test -z "$(ls -A /objects)" && chown 1000:1000 /objects']);
io.docker(['run','--rm','-i','--network','none','--read-only','--user','1000:1000','--cap-drop','ALL','--security-opt','no-new-privileges:true','--mount','type=volume,src='+volume+',dst=/objects','--entrypoint','tar',nodeImage,'--no-same-owner','-C','/objects','-xf','-'],{input:readFileSync(from+'/objects.tar')});
const restoredObjects=JSON.parse(io.docker(['run','--rm','--network','none','--read-only','--user','1000:1000','--cap-drop','ALL','--mount','type=volume,src='+volume+',dst=/objects,readonly',nodeImage,'node','-e',manifest.objectInventory]));assert.deepEqual(restoredObjects,manifest.objects);
const targetReport={version:1,namespace:io.namespace,id:info.Id,project,container:target,databaseVerified:true,objectsVerified:true,permissionsVerified:true,coldGuardClosed:true,workersDisabled:true,apiLoginsDisabled:true,restoredTables:after.tables.length,privatePhysicalFiles:restoredObjects.length,businessStateSha256:digest(Buffer.from(JSON.stringify({database:after,objects:restoredObjects}))),sourceStillStopped:true,managedSupabaseDatabase:false};io.json('target-verification.json',targetReport);
console.log(JSON.stringify({isolatedRestorePassed:true,tables:after.tables.length,privatePhysicalFiles:restoredObjects.length,targetStillFenced:true,managedSupabaseDatabase:false}));
