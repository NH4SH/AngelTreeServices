import {atomicJson,jsonFile,lease} from '../../macbook/ops/files.mjs';
import {randomUUID} from 'node:crypto';

// Keep observations separate from successfully delivered notifications. A failed
// alert or recovery remains pending for the next monitoring pass.
export async function recordOperationsIncident(file,issues,{now=Date.now(),notify,enabled=false}={}){
  return lease(file+'.lock',async()=>{
    const previous=await jsonFile(file,{issues:[],lastNotificationAt:0});
    const current=[...new Set(issues)].sort(),observed=previous.issues??[];
    let delivered=previous.deliveredIssues??(previous.alertOpen&&!previous.notificationFailed?observed:[]);
    let alertOpen=previous.deliveredIssues?!!previous.alertOpen:!!previous.alertOpen&&!previous.notificationFailed;
    let notificationFailed=!!previous.notificationFailed,lastNotificationAt=Number(previous.lastNotificationAt)||0,pending=previous.pendingNotification??null;
    const changed=JSON.stringify(observed)!==JSON.stringify(current),deliveryChanged=JSON.stringify(delivered)!==JSON.stringify(current);
    const send=enabled&&(pending||current.length>0&&(deliveryChanged||!alertOpen||notificationFailed||now-lastNotificationAt>=3600000)||current.length===0&&alertOpen);
    if(!current.length&&!alertOpen&&!pending)notificationFailed=false;
    let accepted=false;
    if(send){
      pending??={id:randomUUID(),createdAt:now,recovered:current.length===0,issues:current};
      // Commit the immutable notification identity before external delivery.
      // A crash or changed observation must not create a second email identity.
      await atomicJson(file,{...previous,version:3,issues:current,deliveredIssues:delivered,checkedAt:now,lastNotificationAt,
        lastAttemptAt:now,notificationFailed,alertOpen,pendingNotification:pending});
      try{await notify(pending.recovered,pending);accepted=true;notificationFailed=false;alertOpen=!pending.recovered;delivered=pending.issues;lastNotificationAt=now;pending=null;}catch{notificationFailed=true;}
    }
    await atomicJson(file,{version:3,issues:current,deliveredIssues:delivered,checkedAt:now,lastNotificationAt,
      lastAttemptAt:send?now:previous.lastAttemptAt??null,notificationFailed,alertOpen,pendingNotification:pending});
    return {changed,notified:accepted,notificationAttempted:!!send,notificationFailed};
  });
}
