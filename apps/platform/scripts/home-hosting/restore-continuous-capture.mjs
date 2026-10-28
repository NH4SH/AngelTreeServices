// Recover the last independently downloaded continuous capture into a NEW,
// internal DB-only clone. Neither staging nor the candidate is a restore target.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,copyFileSync,existsSync} from 'node:fs';
import {CandidateIO,digest,literal,identifier} from './candidate-io.mjs';
import {captureManifestSql} from './capture-manifest.mjs';
import {functionMetadataSql,compareRecoveredManifest} from './function-metadata.mjs';
import {restoreDatabaseParts} from './database-parts.mjs';
assert.equal(process.env.ATS_CONTINUOUS_REHEARSAL,'1');const id=process.argv[2];assert.match(id,/^[a-f0-9]{12}$/);
process.env.HOME_FAILOVER_REHEARSAL='1';process.env.ATS_FAILOVER_RUN_ID=id;
const io=new CandidateIO();io.folder=io.root+'/continuous-'+id;
const from=io.folder+'/offsite-latest',manifestBytes=readFileSync(from+'/manifest.private.json'),manifest=JSON.parse(manifestBytes),receipt=JSON.parse(readFileSync(io.folder+'/last-receipt.private.json'));
assert.equal(manifest.syntheticOnly,true);assert.equal(manifest.namespace,'ats-rehearsal-continuous-'+id);assert.equal(manifest.sourceMigrationCount,102);assert.equal(digest(manifestBytes),receipt.manifestSha256);assert.equal(manifest.sequence,receipt.sequence);
if(manifest.databaseParts)restoreDatabaseParts(from,manifest.databaseParts);
for(const[file,key]of[['database.dump','databaseSha256'],['objects.tar','objectArchiveSha256'],['release-source.tar.gz','releaseSourceSha256']])assert.equal(digest(readFileSync(from+'/'+file)),manifest[key]);
const project='ats_crm_recovery_'+id,target=project+'-db-1',dir=io.folder+'/recovery-stack';assert.equal(existsSync(dir),false);mkdirSync(dir,{mode:0o700});
const config=JSON.parse(readFileSync(io.root+'/selfhost/compose.json'));config.name=project;config.services={db:config.services.db};config.volumes={'pg-data':{},'db-config':{}};
config.services.db.volumes=config.services.db.volumes.map(v=>v.startsWith('./volumes/')?io.root+'/selfhost/'+v.slice(2):v);copyFileSync(from+'/core.private.env',dir+'/core.private.env');writeFileSync(dir+'/compose.json',JSON.stringify(config,null,2)+'\n',{mode:0o600});
const compose=['compose','--env-file',dir+'/core.private.env','-f',dir+'/compose.json'];let report={passed:false,productionChanged:false};
try{
  io.docker([...compose,'up','-d','--wait','--wait-timeout','120','db']);await io.ready(target);const info=io.inspect(target);assert.equal(info.Config.Labels['com.docker.compose.project'],project);assert.equal(info.Image,manifest.sourceDbImage);assert.deepEqual(info.HostConfig.PortBindings??{},{});assert.equal(Number(io.sql('select count(*) from auth.users;',{container:target})),0);
  for(const r of manifest.roles){if(['postgres','supabase_admin'].includes(r.rolname))continue;const flags=[[r.rolsuper,'SUPERUSER'],[r.rolinherit,'INHERIT'],[r.rolcreaterole,'CREATEROLE'],[r.rolcreatedb,'CREATEDB'],[false,'LOGIN'],[r.rolreplication,'REPLICATION'],[r.rolbypassrls,'BYPASSRLS']].map(([v,k])=>(v?'':'NO')+k).join(' ');io.sql(`do $$begin if not exists(select 1 from pg_roles where rolname=${literal(r.rolname)})then create role ${identifier(r.rolname)} ${flags};else alter role ${identifier(r.rolname)} nologin;end if;end$$;`,{container:target});}
  for(const m of manifest.memberships)io.sql(`grant ${identifier(m.role_name)} to ${identifier(m.member_name)} with admin ${m.admin_option},inherit ${m.inherit_option},set ${m.set_option};`,{container:target});
  io.sql('drop database postgres with(force);',{container:target,database:'template1'});io.sql('create database postgres with template template0;',{container:target,database:'template1'});
  io.binary(['exec','-i',target,'pg_restore','-U','supabase_admin','-d','postgres','--exit-on-error'],dir+'/restore.private.log',{inputFile:from+'/database.dump'});
  for(const s of manifest.sequenceOwnerPrivileges){assert.ok(s.privileges.every(p=>['SELECT','UPDATE','USAGE'].includes(p)));if(s.privileges.length)io.sql(`grant ${s.privileges.join(',')} on sequence ${identifier(s.schema_name)}.${identifier(s.sequence_name)} to ${identifier(s.owner_name)};`,{container:target});}
  const actual=JSON.parse(io.sql(captureManifestSql,{container:target}));const comparison=compareRecoveredManifest(manifest.database,actual,manifest.functions,JSON.parse(io.sql(functionMetadataSql,{container:target})));
  assert.equal(Number(io.sql("select count(*) from auth.users where email not like '%@example.invalid';",{container:target})),0);
  assert.equal(Number(io.sql("select count(*) from pg_roles where rolcanlogin and rolname not in('postgres','supabase_admin');",{container:target})),0);
  assert.equal(io.sql('select database_started_at<>pg_postmaster_start_time() from hosting_guard.state;',{container:target}),'t');
  assert.equal(Number(io.sql('select count(*) from public.candidate_fence_fixture where id=990001;',{container:target})),0);
  const first=manifest.binding.workloadStart??800000;assert.ok(Number.isSafeInteger(first)&&first>=800000&&first+399<900000);
  report={passed:true,namespace:manifest.namespace,sequence:manifest.sequence,manifestSha256:receipt.manifestSha256,tableFingerprintsMatched:actual.tables.length,effectiveFunctionMetadata:comparison,sourceFileDigestsInPairedArchive:manifest.objects.length,managedStorageReadback:true,coldClosed:true,restoredSyntheticWorkloadWrites:Number(io.sql('select count(*) from public.candidate_fence_fixture where id>='+first+' and id<'+(first+400)+';',{container:target})),productionChanged:false};
}finally{io.docker(['stop','--time','3',target]);report.targetStopped=!io.inspect(target).State.Running;io.json('continuous-restore-report.json',report);}
console.log(JSON.stringify(report));
