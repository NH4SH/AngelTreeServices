// Owner-installed production host adapter. The synthetic adapter stays separate.
import assert from 'node:assert/strict';import fs from 'node:fs';import {hostname} from 'node:os';import {spawnSync} from 'node:child_process';
import {backupSourceScope} from './backup-source-scope.mjs';
export class PrimaryIO{
 constructor(){
  assert.equal(process.env.ATS_HOME_PRIMARY_OPERATION,'1');assert.equal(hostname(),'lima-ats-crm-primary-20261029');assert.equal(process.platform,'linux');assert.equal(process.arch,'arm64');assert.equal(process.getuid(),501);process.umask(0o077);
  this.root='/home/noelsierra.guest/primary';assert.equal(fs.realpathSync(this.root),this.root);
  this.id=process.env.ATS_HOME_BACKUP_ID;assert.match(this.id,/^[a-f0-9]{12}$/);this.folder=this.root+'/native-'+this.id;
  this.namespace='ats-home-continuous-'+this.id;this.project='ats_crm_primary_20261029';this.db=this.project+'-db-1';this.app=this.project+'-app-1';
  this.approval=JSON.parse(fs.readFileSync(this.root+'/source-approval.private.json'));assert.equal(this.approval.version,1);assert.equal(this.approval.project,this.project);assert.equal(this.approval.vm,'ats-crm-primary-20261029');assert.equal(this.approval.sourceMigrationCount,102);assert.match(this.approval.systemIdentifier,/^[0-9]{1,20}$/);assert.equal(this.approval.databaseImage,'sha256:b15d862126dd2dac02da524696ccfde2dcce2ceaee0a58973b2727befe492706');
  this.config=JSON.parse(fs.readFileSync(this.root+'/environment.private.json'));assert.match(this.config.id,/^ats_primary_[a-f0-9]{12}$/);assert.equal(this.config.api,'https://admin.angeltreeservices.org/backend');
  this.productionBinding={environment:'home-primary-v1',sourceId:this.project,namespace:this.namespace,sourceScope:'crm-v1',sourceMigrationCount:102,captureMode:'transaction-barrier',privateFileFormat:'patch-v1',admissionProtocol:'certified-native-wal-v1'};backupSourceScope(this.productionBinding);
  this.env={HOME:process.env.HOME,PATH:'/usr/bin:/bin',DOCKER_HOST:'unix:///run/user/501/docker.sock',XDG_RUNTIME_DIR:'/run/user/501',DBUS_SESSION_BUS_ADDRESS:'unix:path=/run/user/501/bus',GOMAXPROCS:'2',GOMEMLIMIT:'256MiB',ATS_HOME_PRIMARY_OPERATION:'1',ATS_HOME_BACKUP_ID:this.id};this.step=0;
 }
 run(command,args,{input,timeout=180000,allowFailure=false}={}){
  const r=spawnSync(command,args,{env:this.env,input,encoding:'utf8',timeout,maxBuffer:16*1024*1024});
  fs.mkdirSync(this.folder+'/operator-logs',{recursive:true,mode:0o700});fs.writeFileSync(this.folder+'/operator-logs/'+Date.now()+'-'+(++this.step)+'.private.log',(r.stdout??'')+'\n'+(r.stderr??''),{mode:0o600});
  if(!allowFailure)assert.equal(r.status,0,'Home host operation withheld; inspect its private operator log');return r;
 }
 docker(args,options){return this.run('/usr/bin/docker',args,options).stdout;}
 sql(query,{container=this.db,database='postgres',user='supabase_admin'}={}){return this.docker(['exec','-i',container,'psql','-X','-Atq','-v','ON_ERROR_STOP=1','-U',user,'-d',database],{input:query}).trim();}
 json(name,value){fs.writeFileSync(this.folder+'/'+name,JSON.stringify(value,null,2)+'\n',{mode:0o600});}
 inspect(name){assert.match(name,/^ats_crm_(primary_20261029|recovery_[a-f0-9]{12})[-_]/);return JSON.parse(this.docker(['inspect',name]))[0];}
 binary(args,file,{inputFile,timeout=180000}={}){
  const out=fs.openSync(file,'wx',0o600),log=fs.openSync(file+'.private.log','wx',0o600),input=inputFile?fs.openSync(inputFile,'r'):null;let r;
  try{r=spawnSync('/usr/bin/docker',args,{env:this.env,stdio:[input??'ignore',out,log],timeout});}finally{fs.closeSync(out);fs.closeSync(log);if(input!==null)fs.closeSync(input);}assert.equal(r.status,0,'Home host binary operation withheld');
 }
 assertSource(){
  const info=this.inspect(this.db);assert.equal(info.Config.Labels['com.docker.compose.project'],this.project);assert.equal(info.Config.Labels['com.docker.compose.service'],'db');assert.equal(info.Image,this.approval.databaseImage);assert.deepEqual(info.HostConfig.PortBindings??{},{});assert.equal(info.HostConfig.RestartPolicy.Name,'no');
  for(const network of Object.keys(info.NetworkSettings.Networks))assert.equal(JSON.parse(this.docker(['network','inspect',network]))[0].Internal,true);
  assert.equal(this.sql('select system_identifier::text from pg_control_system();',{user:'postgres'}),this.approval.systemIdentifier);
  assert.equal(Number(this.sql('select count(*) from supabase_migrations.schema_migrations;')),102);
  assert.equal(this.sql('select local_node from hosting_guard.state where singleton;'),'ats-home-primary');return info;
 }
}
