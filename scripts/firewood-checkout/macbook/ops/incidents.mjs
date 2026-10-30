import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {atomicJson,jsonFile} from './files.mjs';
export async function notifyLocal(recovered=false){
  const text=recovered?'Firewood QA monitoring has recovered.':'Firewood QA needs attention. Open the local health report.';
  await promisify(execFile)('/usr/bin/osascript',['-e',`display notification "${text}" with title "Angel Firewood QA"`],{timeout:5000});
}
export async function recordIncident(file,issues,{now=Date.now(),notify=notifyLocal,enabled=false}={}){
  const previous=await jsonFile(file,{issues:[],lastNotificationAt:0});
  const changed=JSON.stringify(previous.issues)!==JSON.stringify(issues),cooldown=now-(previous.lastNotificationAt??0)>=3600000;
  const send=enabled&&((issues.length>0&&(changed||cooldown||!previous.alertOpen))||(issues.length===0&&previous.alertOpen));
  let notificationFailed=false;
  if(send)try{await notify(issues.length===0);}catch{notificationFailed=true;}
  const value={issues,checkedAt:now,lastNotificationAt:send?now:previous.lastNotificationAt,notificationFailed,
    alertOpen:enabled?(send?issues.length>0:!!previous.alertOpen):false};
  await atomicJson(file,value);return {changed,notified:!!send,notificationFailed};
}
