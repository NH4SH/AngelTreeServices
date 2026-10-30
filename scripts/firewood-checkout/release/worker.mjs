import {randomUUID} from 'node:crypto';
import {assertRuntimeDatabase} from './database.mjs';
import {captureConfirmation,drainConfirmations} from './confirmations.mjs';
export function createReleaseWorker({db,orders,admitted,mailer=null,preparationAllowed=false,now=Date.now}){
  assertRuntimeDatabase(db);
  if(typeof admitted!=='function'||typeof orders?.work!=='function'||typeof orders?.refreshOrder!=='function'||typeof preparationAllowed!=='boolean')throw Error('bound_release_worker_required');
  async function work(){
    if(!await admitted())return{held:true,accepted:0};
    const lease=randomUUID(),owned=await db.transaction(async tx=>{
      const before=(await tx.query('SELECT lease_until FROM fwofficev2_heartbeat WHERE id=true FOR UPDATE')).rows[0];
      if(!before||Number(before.lease_until)>now())return false;
      await tx.query('UPDATE fwofficev2_heartbeat SET lease=$1,lease_until=$2,started_at=$3,last_code=NULL WHERE id=true',[lease,now()+240000,now()]);return true;
    });
    if(!owned)return{busy:true,accepted:0};
    let result,lastCode=null,confirmationChecks=0;
    try{
      result=await orders.work({limit:1,preparation:preparationAllowed&&await admitted('preparation'),onObservation:async(id,receipt)=>{if((await captureConfirmation(db,id,receipt,now)).captured)confirmationChecks++;}});
      const delivery=await db.runInMode(['sending','office'],()=>drainConfirmations({db,now,admitted:()=>admitted(['sending','office']),mailer,limit:2,freshStatus:async id=>{try{return await orders.refreshOrder(id);}catch{return null;}}}));
      return{held:false,checked:result.checked,confirmationChecks,accepted:delivery.accepted,sendingHeld:delivery.held};
    }catch{lastCode='release_worker_pending';return{held:true,accepted:0};}
    finally{await db.query('UPDATE fwofficev2_heartbeat SET lease=NULL,lease_until=0,finished_at=$2,last_code=$3 WHERE id=true AND lease=$1',[lease,now(),lastCode]);}
  }
  async function status(){return(await db.query(`SELECT
    (SELECT count(*)::int FROM fwofficev2_orders) AS accepted_orders,
    (SELECT count(*)::int FROM fwofficev2_prepare WHERE status='pending') AS preparing,
    (SELECT count(*)::int FROM fwofficev2_prepare WHERE status='review') AS prepare_review,
    (SELECT count(*)::int FROM fwofficev2_price_queue WHERE status='review') AS price_review,
    (SELECT count(*)::int FROM fwofficev2_outbox WHERE status IN('pending','processing')) AS confirmation_pending,
    (SELECT count(*)::int FROM fwofficev2_outbox WHERE status='accepted') AS confirmation_accepted,
    (SELECT count(*)::int FROM fwofficev2_outbox WHERE status='review') AS confirmation_review,
    (SELECT count(*)::int FROM fwofficev2_outbox WHERE status='suppressed') AS confirmation_suppressed,
    (SELECT finished_at FROM fwofficev2_heartbeat WHERE id=true) AS worker_finished_at`)).rows[0];}
  return Object.freeze({work,status});
}
