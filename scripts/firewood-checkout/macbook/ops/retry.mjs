import {setTimeout as sleep} from 'node:timers/promises';
export const startupPolicy=Object.freeze({maxAttempts:6,budgetMs:60000,delaysMs:[1000,2000,4000,8000,15000]});
const phases=new Set(['identity','configuration','database','stripe_account','backup','worker','operation']);
const terminal=new Set(['approved_macbook_required','private_host_identity_required','host_identity_unavailable','private_directory_required','private_file_required','private_ops_settings_required','private_macbook_qa_required','claimed_sandbox_required','private_qa_credentials_required','dedicated_macbook_database_required','isolated_macbook_database_required','dedicated_sandbox_required','backup_key_required','backup_disk_space_low','backup_retention_needs_review','unexpected_worker_response']);
const temporary=new Set(['host_probe_timeout','database_unavailable','database_timeout','stripe_temporarily_unavailable','backup_dump_failed','backup_stream_interrupted']);
const codes=new Set([...terminal,...temporary,'configuration_missing','permission_denied','disk_full','database_authentication_refused','database_schema_missing','stripe_access_refused','worker_failed','worker_deadline_exceeded','operation_failed']);
export class StartupFailure extends Error{
  constructor(code,phase='operation',retryable=false){super(codes.has(code)?code:'operation_failed');this.code=this.message;this.phase=phases.has(phase)?phase:'operation';this.retryable=temporary.has(this.code)&&retryable;}
}
export function classify(error,phase='operation'){
  if(error instanceof StartupFailure)return error;
  let code='operation_failed',retryable=false;
  if(terminal.has(error?.message))code=error.message;
  else if(error?.code==='ENOENT')code='configuration_missing';
  else if(['EACCES','EPERM'].includes(error?.code))code='permission_denied';
  else if(error?.code==='ENOSPC')code='disk_full';
  else if(phase==='identity'&&(error?.killed||error?.code==='ETIMEDOUT')){code='host_probe_timeout';retryable=true;}
  else if(phase==='database'){
    if(['28P01','28000'].includes(error?.code))code='database_authentication_refused';
    else if(['42P01','3D000'].includes(error?.code))code='database_schema_missing';
    else if(['ECONNREFUSED','ECONNRESET','EPIPE','57P03','08000','08001','08006'].includes(error?.code)||['Connection terminated unexpectedly','Connection ended unexpectedly'].includes(error?.message)){code='database_unavailable';retryable=true;}
    else if(['ETIMEDOUT','57014'].includes(error?.code)||['Connection terminated due to connection timeout','timeout exceeded when trying to connect'].includes(error?.message)){code='database_timeout';retryable=true;}
  }else if(phase==='stripe_account'){
    if(error?.statusCode===401||error?.statusCode===403)code='stripe_access_refused';
    else if(['StripeConnectionError','StripeRateLimitError'].includes(error?.type)||[429,500,502,503,504].includes(error?.statusCode)){code='stripe_temporarily_unavailable';retryable=true;}
  }else if(phase==='backup'){
    if(error?.message==='backup_dump_failed'){code='backup_dump_failed';retryable=true;}
    else if(['ERR_STREAM_PREMATURE_CLOSE','ECONNRESET','EPIPE'].includes(error?.code)){code='backup_stream_interrupted';retryable=true;}
  }else if(phase==='worker')code='worker_failed';
  return new StartupFailure(code,phase,retryable);
}
export async function stage(phase,operation){try{return await operation();}catch(error){throw classify(error,phase);}}
export function diagnostic(error){
  const safe=classify(error);
  return {code:safe.code,phase:safe.phase,retryable:safe.retryable,attempts:Number.isInteger(safe.attempts)?safe.attempts:1,exhausted:safe.exhausted===true};
}
// Only startup/read-only snapshot operations may be passed here. Order work
// begins after this returns and is never replayed by this retry loop.
export async function retryStartup(operation,{now=()=>performance.now(),pause=sleep,maxAttempts=startupPolicy.maxAttempts,budgetMs=startupPolicy.budgetMs,delaysMs=startupPolicy.delaysMs}={}){
  const start=now(),failures=[];
  for(let attempt=1;attempt<=maxAttempts;attempt++){
    try{return {value:await operation(),startup:{attempts:attempt,failures}};}
    catch(error){
      const safe=classify(error);safe.attempts=attempt;
      const delay=delaysMs[Math.min(attempt-1,delaysMs.length-1)],again=safe.retryable&&attempt<maxAttempts&&now()-start+delay<budgetMs;
      failures.push({attempt,code:safe.code,phase:safe.phase,retryable:safe.retryable});
      if(!again){safe.exhausted=safe.retryable;throw safe;}
      await pause(delay);
    }
  }
}
export function workerFailure(error){
  // Parse only our fixed diagnostic envelope; never retain arbitrary child
  // stderr, connection errors, credentials, provider payloads or stack traces.
  try{
    const parsed=JSON.parse(String(error?.stderr??'').trim()),d=parsed?.error;
    if(parsed.testOnly===true&&codes.has(d?.code)&&phases.has(d?.phase)){
      const safe=new StartupFailure(d.code,d.phase,d.retryable===true);safe.attempts=Number.isInteger(d.attempts)&&d.attempts>=1&&d.attempts<=6?d.attempts:1;safe.exhausted=d.exhausted===true;return safe;
    }
  }catch{}
  return new StartupFailure('worker_failed','worker',false);
}
