import {resolve} from 'node:path';
import {homedir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {privateDir,privateFile,jsonFile,atomicJson,lease} from '../../macbook/ops/files.mjs';
import {receiveBackup} from '../../macbook/ops/watch.mjs';
import {recordOperationsIncident} from './incidents.mjs';
import {PROFILE,notifyOperations,durableCopies} from './ops.mjs';
export const WATCH_ROOT=resolve(homedir(),'.local/share',PROFILE.sandbox?'ats-firewood-routed-backup-watch':'ats-firewood-production-backup-watch');
const remoteRoot=PROFILE.root,recoveryKey=resolve(homedir(),'.config',PROFILE.sandbox?'ats-firewood-routed-recovery':'ats-firewood-production-recovery','key.private');
export function assertWatchSettings(settings){if(settings?.sandbox!==PROFILE.sandbox||settings.remoteRoot!==remoteRoot||settings.host!=='ats-home-private'||settings.sshConfig!==resolve(homedir(),'.config/ats-home-private-access/development/ssh-config')||settings.recoveryKey!==recoveryKey)throw Error('isolated_backup_watch_required');return settings;}
export async function watchCycle({readReport,receive,now=Date.now(),sandbox=PROFILE.sandbox}){
  let report,backup=null;const issues=[];
  try{report=await readReport();}catch(e){return {report:null,backup,issues:[e instanceof SyntaxError?'server_report_invalid':'server_unreachable']};}
  if(!report||report.sandbox!==sandbox||typeof report.active!=='boolean'||report.active&&(!Number.isFinite(report.activationStartedAt)||report.activationStartedAt>now+300000)||
    report.monitor&&(!Number.isFinite(report.monitor.checkedAt)||!Array.isArray(report.monitor.issues)||report.monitor.issues.some(x=>typeof x!=='string')))
    return {report:null,backup,issues:['server_report_invalid']};
  // Server health is independent from backup transport. Preserve its alerts
  // even when the subsequent copy, authentication or acknowledgement fails.
  if(report.attentionRequired)issues.push('operations_control_needs_review');
  if(report.active){if(!report.monitor||now-report.monitor.checkedAt>180000)issues.push('server_monitor_stale');
    else issues.push(...report.monitor.issues.filter(x=>x!=='off_device_backup_stale'));
    if(report.monitor?.notificationFailed)issues.push('server_notification_delivery_failed');}
  try{if(report.latest)backup=await receive(report.latest);}catch{issues.push('backup_pull_failed');}
  if(report.active&&(!backup||now-backup.createdAt>7200000))issues.push('off_device_backup_stale');
  return {report,backup,issues:[...new Set(issues)].sort()};
}
export async function watch(){await privateDir(WATCH_ROOT);const settings=await jsonFile(resolve(WATCH_ROOT,'settings.json'));
  assertWatchSettings(settings);
  return lease(resolve(WATCH_ROOT,'watch.lock'),async()=>{const execute=promisify(execFile),ssh=['-F',settings.sshConfig,'-o','BatchMode=yes','-o','ConnectTimeout=10',settings.host],code=remoteRoot+'/app/scripts/firewood-checkout/production/runtime/ops.mjs';
    const command=['/usr/bin/env','FIREWOOD_OPERATIONS_PROFILE='+PROFILE.name,'/opt/homebrew/bin/node',code];
    const now=Date.now(),cycle=await watchCycle({now,
      readReport:async()=>{const {stdout}=await execute('/usr/bin/ssh',[...ssh,...command,'report'],{timeout:25000,maxBuffer:16384});return JSON.parse(stdout);},
      receive:async meta=>receiveBackup({root:WATCH_ROOT,meta,key:await privateFile(settings.recoveryKey),
        copy:destination=>execute('/usr/bin/scp',['-q','-F',settings.sshConfig,'-o','BatchMode=yes','-o','ConnectTimeout=10',settings.host+':'+remoteRoot+'/ops/backups/'+meta.name,destination],{timeout:45000}),
        acknowledge:async meta=>{await durableCopies(resolve(WATCH_ROOT,'backups'),[meta.name,meta.name+'.json','latest.json']);return execute('/usr/bin/ssh',[...ssh,...command,'ack',meta.name,meta.sha256],{timeout:20000,maxBuffer:512});}})
    });
    const {report,backup,issues}=cycle,enabled=settings.active===true&&(!report||!report.active||now-report.activationStartedAt>180000);
    const incident=await recordOperationsIncident(resolve(WATCH_ROOT,'incident.json'),issues,{now,enabled,notify:(recovered,notice)=>notifyOperations(recovered,notice,{root:WATCH_ROOT,location:'receiver'})});
    const reportedIssues=incident.notificationFailed?[...issues,'notification_delivery_failed'].sort():issues;
    const value={sandbox:PROFILE.sandbox,checkedAt:Date.now(),healthy:!reportedIssues.length,issues:reportedIssues,backup,...incident};await atomicJson(resolve(WATCH_ROOT,'status.json'),value);return value;
  });
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))try{const result=await watch();console.log(JSON.stringify({sandbox:PROFILE.sandbox,healthy:result.healthy,issues:result.issues,backup:result.backup}));if(!result.healthy)process.exitCode=1;}catch{console.error('Firewood off-device backup check failed.');process.exitCode=1;}
