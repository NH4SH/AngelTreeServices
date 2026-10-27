import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, openSync, closeSync } from 'node:fs';
import { hostname } from 'node:os';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
export const digest=data=>createHash('sha256').update(data).digest('hex');
export const literal=value=>"'"+String(value).replaceAll("'","''")+"'";
export const identifier=value=>{assert.match(value,/^[a-zA-Z_][a-zA-Z0-9_]*$/);return '"'+value+'"';};
export class CandidateIO {
  constructor({create=false}={}){
    assert.equal(process.env.HOME_FAILOVER_REHEARSAL,'1');assert.equal(hostname(),'lima-ats-crm-candidate-20261027');assert.equal(process.platform,'linux');assert.equal(process.getuid(),501);process.umask(0o077);
    this.id=process.env.ATS_FAILOVER_RUN_ID;assert.match(this.id,/^[a-f0-9]{12}$/);
    this.root=process.env.HOME+'/candidate';this.folder=this.root+'/failover-'+this.id;
    if(create)mkdirSync(this.folder,{mode:0o700});
    this.namespace='ats-rehearsal-'+this.id;this.project='ats_crm_candidate_20261027';this.db=this.project+'-db-1';this.app=this.project+'-app-1';
    this.config=JSON.parse(readFileSync(this.root+'/environment.private.json'));assert.match(this.config.id,/^ats_candidate_[a-f0-9]{12}$/);assert.equal(this.config.api,'http://127.0.0.1:3240/backend');
    this.env={HOME:process.env.HOME,PATH:'/usr/bin:/bin',DOCKER_HOST:'unix:///run/user/501/docker.sock',GOMAXPROCS:'2',GOMEMLIMIT:'256MiB'};this.step=0;
  }
  run(command,args,{input,timeout=180000,allowFailure=false}={}){const r=spawnSync(command,args,{env:this.env,input,encoding:'utf8',timeout,maxBuffer:16*1024*1024,stdio:['pipe','pipe','pipe']});writeFileSync(this.folder+'/step-'+(++this.step)+'-'+Date.now()+'.private.log',(r.stdout??'')+'\n'+(r.stderr??''),{mode:0o600});if(!allowFailure)assert.equal(r.status,0,'Isolated operation failed; inspect its private step log.');return r;}
  docker(args,options){return this.run('/usr/bin/docker',args,options).stdout;}
  sql(query,{container=this.db,database='postgres',user='supabase_admin'}={}){return this.docker(['exec','-i',container,'psql','-X','-Atq','-v','ON_ERROR_STOP=1','-U',user,'-d',database],{input:query}).trim();}
  json(name,value){writeFileSync(this.folder+'/'+name,JSON.stringify(value,null,2)+'\n',{mode:0o600});}
  inspect(name){assert.match(name,/^ats_crm_(candidate_20261027|recovery_[a-f0-9]{12})[-_]/);return JSON.parse(this.docker(['inspect',name]))[0];}
  binary(args,file,{inputFile,timeout=180000}={}){const out=openSync(file,'wx',0o600),log=openSync(file+'.private.log','wx',0o600),input=inputFile?openSync(inputFile,'r'):null;let r;try{r=spawnSync('/usr/bin/docker',args,{env:this.env,stdio:[input??'ignore',out,log],timeout});}finally{closeSync(out);closeSync(log);if(input!==null)closeSync(input);}assert.equal(r.status,0,'Isolated binary transfer failed; inspect its private log.');}
  async ready(container=this.db){for(let n=0;n<80;n++){const r=spawnSync('/usr/bin/docker',['exec',container,'pg_isready','-h','127.0.0.1','-U','postgres','-d','postgres'],{env:this.env,stdio:'ignore'});if(r.status===0)return;await new Promise(r=>setTimeout(r,250));}throw Error('Isolated database did not become ready.');}
  assertSource(){const info=this.inspect(this.db);assert.equal(info.Config.Labels['com.docker.compose.project'],this.project);assert.equal(info.Config.Labels['com.docker.compose.service'],'db');assert.deepEqual(info.HostConfig.PortBindings??{},{});assert.equal(info.HostConfig.RestartPolicy.Name,'no');for(const network of Object.keys(info.NetworkSettings.Networks)){assert.equal(JSON.parse(this.docker(['network','inspect',network]))[0].Internal,true);}assert.equal(Number(this.sql("select count(*) from auth.users where email not like '%@example.invalid';")),0);assert.equal(Number(this.sql('select count(*) from supabase_migrations.schema_migrations;')),102);return info;}
}
