// Opt-in, local-only feasibility experiment. Never links/deploys a site, reads
// credentials, contacts a provider, starts shared services or writes definitions.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
const args=process.argv.slice(2);
assert.ok(args.length===6&&args[0]==='--docker'&&args[2]==='--socket'&&args[4]==='--out','Use --docker /absolute/docker --socket /absolute/local.sock --out /absolute/result.json');
const [docker,socket,out]=[args[1],args[3],args[5]];
assert.ok([docker,socket,out].every(p=>p.startsWith('/')&&!/[\x00-\x20]/.test(p))&&socket.endsWith('/pr02-disposable/sock/docker.sock'));
const d=(...a)=>execFileSync(docker,['--host','unix://'+socket,...a],{encoding:'utf8',stdio:'pipe',timeout:20000,maxBuffer:2*1024*1024});
const inspect=(kind,name)=>JSON.parse(d(kind,'inspect',name))[0];
const volume='ats_host_local_20261017_definitions';
const labels=inspect('volume',volume).Labels;
assert.equal(labels['com.docker.compose.project'],'ats_host_local_20261017');assert.equal(labels['com.docker.compose.volume'],'definitions');
const images={engine:'sha256:c7e276e90d746cb25c4475e06a507494245b254dd53196b40950458245947258',client:'sha256:1575dee44642e6df7c04cd9d5e69e89898839b3d42165bf352f6fe263fc135d4'};
for(const id of Object.values(images))assert.equal(inspect('image',id).Architecture,'arm64');
const original=d('ps','-a','--filter','label=com.docker.compose.project=ats_host_local_20261017','--format','{{.Names}} {{.State}}').trim();
assert.ok(original&&original.split('\n').every(x=>x.endsWith(' exited')),'Prior test hosting stack must remain stopped.');
const tag='ats_netlify_eval_'+randomUUID().replaceAll('-','');
const report={scope:'isolated Linux ARM64 Docker engine budgets; not Netlify runtime, bundle, billing or network proof',images,profiles:[],sharedServicesChanged:false,definitionVolumeReadOnly:true,cloudRequests:0};
const scratch=mkdtempSync(join(tmpdir(),'ats-netlify-fixtures-'));
const clientCode=readFileSync(new URL('./probe-client.mjs',import.meta.url),'utf8');
const common=['--read-only','--cap-drop','ALL','--security-opt','no-new-privileges:true','--pids-limit','64','--ulimit','core=0:0','--log-driver','none','--label','ats.evaluation='+tag];
const owned=[];let networkCreated=false;
try {
  writeFileSync(join(scratch,'small.txt'),'Synthetic evaluation fixture only.',{mode:0o600});
  writeFileSync(join(scratch,'large.txt'),Buffer.alloc(110*1024*1024,65),{mode:0o600});
  execFileSync('zip',['-j','-q','-P','synthetic-test-only',join(scratch,'encrypted.zip'),join(scratch,'small.txt')]);
  execFileSync('zip',['-j','-q',join(scratch,'expanded.zip'),join(scratch,'large.txt')]);
  const input=JSON.stringify({encrypted:readFileSync(join(scratch,'encrypted.zip')).toString('base64'),expanded:readFileSync(join(scratch,'expanded.zip')).toString('base64')});
  d('network','create','--internal','--label','ats.evaluation='+tag,tag);networkCreated=true;
  assert.equal(inspect('network',tag).Internal,true);
  for(const profile of [{memoryMiB:1024,cpu:0.5},{memoryMiB:4096,cpu:1.5}]) {
    const name=tag+'_'+profile.memoryMiB,client=name+'_client';
    const row={...profile,clientMemoryBudgetMiB:256,clientCpuBudget:0.5,ready:false};
    report.profiles.push(row);const start=performance.now();
    d('create','--name',name,...common,'--network',tag,'--memory',profile.memoryMiB+'m','--memory-swap',profile.memoryMiB+'m','--cpus',String(profile.cpu),
      '--tmpfs','/tmp:rw,noexec,nosuid,nodev,size=1g,mode=700,uid=10001,gid=10001','--mount','type=volume,src='+volume+',dst=/var/lib/clamav,readonly',images.engine);
    owned.push(name);d('start',name);
    const enforced=d('exec',name,'cat','/sys/fs/cgroup/memory.max','/sys/fs/cgroup/memory.swap.max').trim().split('\n');
    assert.deepEqual(enforced,[String(profile.memoryMiB*1024**2),'0']);row.enforcedMemoryBytes=Number(enforced[0]);row.swapMax=0;
    const probe=(mode)=>{
      owned.push(client);
      const value=execFileSync(docker,['--host','unix://'+socket,'run','--rm','-i','--name',client,...common,'--network',tag,'--memory','256m','--memory-swap','256m','--cpus','0.5',
        '--env','EVALUATION_ENGINE='+name,'--entrypoint','node',images.client,'--input-type=module','-e',clientCode,mode],
        {encoding:'utf8',input:mode==='cases'?input:'',timeout:45000,maxBuffer:2*1024*1024});
      return JSON.parse(value);
    };
    while(performance.now()-start<90000){
      const state=inspect('container',name).State;if(!state.Running){row.exitCode=state.ExitCode;row.oomKilled=state.OOMKilled;break;}
      try{row.observedPeakMemoryBytes=Number(d('exec',name,'cat','/sys/fs/cgroup/memory.peak').trim());}catch{}
      const result=probe('state');if(result.ready){row.ready=true;row.signatureState=result.state;break;}
      await delay(500);
    }
    row.coldReadinessMilliseconds=Math.round(performance.now()-start);
    if(row.ready){
      const results=probe('cases');row.scans=results;row.allCasesPassed=results.ready===true&&results.results.every(x=>x.passed);
      const state=inspect('container',name).State;row.exitCode=state.ExitCode;row.oomKilled=state.OOMKilled;
      if(state.Running)row.observedPeakMemoryBytes=Number(d('exec',name,'cat','/sys/fs/cgroup/memory.peak').trim());
      row.writableLayerClean=d('diff',name).trim()==='';assert.equal(row.writableLayerClean,true);
      row.tmpFilesAfter=state.Running?d('exec',name,'find','/tmp','-type','f').trim().split('\n').filter(Boolean):[];
      assert.ok(row.tmpFilesAfter.every(p=>p==='/tmp/clamd.pid'));
    }
    const config=inspect('container',name);assert.equal(config.HostConfig.ReadonlyRootfs,true);assert.equal(Object.keys(config.HostConfig.PortBindings??{}).length,0);
    assert.equal(config.Mounts.find(m=>m.Destination==='/var/lib/clamav').RW,false);
    d('stop','-t','2',name);console.log(JSON.stringify({memoryMiB:profile.memoryMiB,ready:row.ready,oomKilled:row.oomKilled??false,coldMs:row.coldReadinessMilliseconds}));
  }
}finally{
  for(const name of [...new Set(owned)].reverse()){
    let v;try{v=inspect('container',name);}catch{continue;}
    assert.equal(v.Config.Labels['ats.evaluation'],tag);d('rm','-f',name);
  }
  if(networkCreated){assert.equal(inspect('network',tag).Labels['ats.evaluation'],tag);d('network','rm',tag);}
  rmSync(scratch,{recursive:true,force:true});
  assert.equal(d('ps','-a','--filter','label=com.docker.compose.project=ats_host_local_20261017','--format','{{.Names}} {{.State}}').trim(),original);
  report.cleanupCompleted=true;report.clientSourceSha256=createHash('sha256').update(clientCode).digest('hex');
  writeFileSync(out,JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});
}
