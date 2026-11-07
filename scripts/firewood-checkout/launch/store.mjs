import {randomUUID} from 'node:crypto';
import {HANDOFF_CONTRACT,canonicalHandoff,handoffDigest,parsePrepareRequest,validatePrepareReceipt,FirewoodHandoffError} from './contract.mjs';
import {handoffEnvironmentScope} from './client.mjs';
import {validateSettlement} from './settlement.mjs';

export async function installHandoffStore(db,scope){
  scope=handoffEnvironmentScope(scope);
  return db.transaction(async tx=>{
    await tx.query('SELECT pg_advisory_xact_lock(987134229)');
    const existing=(await tx.query("SELECT table_name FROM information_schema.tables WHERE table_schema=current_schema() AND table_type='BASE TABLE'")).rows;
    if(existing.some(x=>!x.table_name.startsWith('fwv2_'))||existing.length&&!existing.some(x=>x.table_name==='fwv2_identity'))throw Error('fresh_handoff_namespace_required');
    await tx.query('CREATE TABLE IF NOT EXISTS fwv2_identity(id boolean PRIMARY KEY CHECK(id),identity_hash text NOT NULL)');
    const identity=handoffDigest({contract:HANDOFF_CONTRACT,account:scope.account,source:scope.source,origin:scope.origin,portalOrigin:scope.portalOrigin,keyId:scope.keyId});
    const before=(await tx.query('SELECT identity_hash FROM fwv2_identity WHERE id=true')).rows[0];if(before&&before.identity_hash!==identity)throw Error('handoff_identity_conflict');
    await tx.query('INSERT INTO fwv2_identity VALUES(true,$1) ON CONFLICT DO NOTHING',[identity]);
    await tx.query(`CREATE TABLE IF NOT EXISTS fwv2_prepare(order_id uuid PRIMARY KEY,request jsonb NOT NULL,
      status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','prepared','review')),receipt jsonb,invoice_id uuid UNIQUE,
      tries integer NOT NULL DEFAULT 0,retry_at bigint NOT NULL DEFAULT 0,lease uuid,lease_until bigint NOT NULL DEFAULT 0,last_code text,updated_at bigint NOT NULL)`);
    await tx.query(`CREATE OR REPLACE FUNCTION fwv2_freeze_prepare() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.order_id IS DISTINCT FROM OLD.order_id OR NEW.request IS DISTINCT FROM OLD.request
        OR (OLD.invoice_id IS NOT NULL AND NEW.invoice_id IS DISTINCT FROM OLD.invoice_id)
      THEN RAISE EXCEPTION 'immutable_handoff_preparation';END IF;RETURN NEW;END $$;`);
    await tx.query('DROP TRIGGER IF EXISTS fwv2_immutable_prepare ON fwv2_prepare');
    await tx.query('CREATE TRIGGER fwv2_immutable_prepare BEFORE UPDATE ON fwv2_prepare FOR EACH ROW EXECUTE FUNCTION fwv2_freeze_prepare()');
    await tx.query('CREATE TABLE IF NOT EXISTS fwv2_observation(order_id uuid PRIMARY KEY REFERENCES fwv2_prepare(order_id),revision integer NOT NULL,receipt jsonb NOT NULL)');
    await tx.query('CREATE TABLE IF NOT EXISTS fwv2_observation_history(order_id uuid NOT NULL REFERENCES fwv2_prepare(order_id),revision integer NOT NULL,receipt jsonb NOT NULL,PRIMARY KEY(order_id,revision))');
    await tx.query(`CREATE OR REPLACE FUNCTION fwv2_guard_observation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.order_id IS DISTINCT FROM OLD.order_id OR NEW.revision<OLD.revision
        OR (NEW.revision=OLD.revision AND NEW.receipt IS DISTINCT FROM OLD.receipt)
        OR NEW.receipt->>'invoice_id' IS DISTINCT FROM OLD.receipt->>'invoice_id'
        OR (OLD.receipt->'original_paid_evidence' IS NOT NULL AND OLD.receipt->'original_paid_evidence'<>'null'::jsonb
          AND NEW.receipt->'original_paid_evidence' IS DISTINCT FROM OLD.receipt->'original_paid_evidence')
      THEN RAISE EXCEPTION 'immutable_handoff_observation';END IF;RETURN NEW;END $$;`);
    await tx.query('DROP TRIGGER IF EXISTS fwv2_observation_guard ON fwv2_observation');
    await tx.query('CREATE TRIGGER fwv2_observation_guard BEFORE UPDATE ON fwv2_observation FOR EACH ROW EXECUTE FUNCTION fwv2_guard_observation()');
    await tx.query(`CREATE OR REPLACE FUNCTION fwv2_history_append_only() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'append_only_handoff_history';END $$;`);
    await tx.query('DROP TRIGGER IF EXISTS fwv2_history_guard ON fwv2_observation_history');
    await tx.query('CREATE TRIGGER fwv2_history_guard BEFORE UPDATE OR DELETE ON fwv2_observation_history FOR EACH ROW EXECUTE FUNCTION fwv2_history_append_only()');
  });
}
export async function verifyHandoffStore(db,scope){
  scope=handoffEnvironmentScope(scope);
  const expected=handoffDigest({contract:HANDOFF_CONTRACT,account:scope.account,source:scope.source,origin:scope.origin,portalOrigin:scope.portalOrigin,keyId:scope.keyId});
  const row=(await db.query('SELECT identity_hash FROM fwv2_identity WHERE id=true')).rows[0];
  if(row?.identity_hash!==expected)throw Error('handoff_identity_conflict');
}
export async function queuePreparation(tx,input,at){
  const request=parsePrepareRequest(input);
  await tx.query('INSERT INTO fwv2_prepare(order_id,request,updated_at) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[request.order_id,JSON.stringify(request),at]);
  const saved=(await tx.query('SELECT request FROM fwv2_prepare WHERE order_id=$1 FOR UPDATE',[request.order_id])).rows[0];
  if(!saved||canonicalHandoff(saved.request)!==canonicalHandoff(request))throw Error('immutable_handoff_preparation');
  return request;
}
export function handoffStore({db,client,now=Date.now}){
  const scope=handoffEnvironmentScope(client?.scope);
  async function enqueue(input){const request=parsePrepareRequest(input);
    await db.transaction(tx=>queuePreparation(tx,request,now()));
  }
  async function work({limit=20}={}){
    if(!Number.isInteger(limit)||limit<1||limit>50)throw Error('bounded_handoff_worker_required');
    const results={prepared:0,pending:0,review:0};
    for(let n=0;n<limit;n++){
      const row=await db.transaction(async tx=>{
        const r=(await tx.query("SELECT * FROM fwv2_prepare WHERE status='pending' AND retry_at<=$1 AND lease_until<=$1 ORDER BY updated_at,order_id FOR UPDATE SKIP LOCKED LIMIT 1",[now()])).rows[0];
        if(!r)return null;const lease=randomUUID();await tx.query('UPDATE fwv2_prepare SET lease=$2,lease_until=$3,tries=tries+1 WHERE order_id=$1',[r.order_id,lease,now()+60000]);return {...r,lease,tries:r.tries+1};
      });if(!row)break;
      try{const receipt=validatePrepareReceipt(await client.prepare(row.request),row.request,{origin:scope.portalOrigin});
        const r=await db.query("UPDATE fwv2_prepare SET status='prepared',receipt=$3,invoice_id=$4,tries=0,retry_at=0,lease=NULL,lease_until=0,last_code=NULL,updated_at=$5 WHERE order_id=$1 AND lease=$2 RETURNING order_id",[row.order_id,row.lease,JSON.stringify(receipt),receipt.invoice_id,now()]);if(r.rows.length)results.prepared++;
      }catch(e){const retry=e instanceof FirewoodHandoffError?e.retryable:true,status=retry&&row.tries<12?'pending':'review';
        const code=/^[a-z_]{1,64}$/u.test(e.code??'')?e.code:'handoff_connection_unconfirmed';
        const r=await db.query('UPDATE fwv2_prepare SET status=$3,last_code=$4,retry_at=$5,lease=NULL,lease_until=0,updated_at=$6 WHERE order_id=$1 AND lease=$2 RETURNING order_id',[row.order_id,row.lease,status,code,now()+Math.min(3600000,5000*2**Math.min(row.tries-1,9)),now()]);if(r.rows.length)results[status]++;
      }
    }return results;
  }
  async function saved(orderId){return(await db.query('SELECT * FROM fwv2_prepare WHERE order_id=$1',[orderId])).rows[0]??null;}
  async function paymentLink(orderId){const row=await saved(orderId);if(!row||row.status!=='prepared'||!row.receipt?.payment_execution_ready||!row.receipt.portal_url)throw new FirewoodHandoffError('payment_execution_not_ready',false,503);
    if(Date.parse(row.receipt.expires_at)<=now()+5000)throw new FirewoodHandoffError('capability_renewal_required',false,409);
    return {invoiceId:row.invoice_id,url:row.receipt.portal_url};
  }
  async function renew(orderId){
    const row=await saved(orderId);if(!row?.receipt||row.status!=='prepared')throw new FirewoodHandoffError('preparation_unconfirmed',true);
    const receipt=validatePrepareReceipt(await client.renew(row.request,row.receipt),row.request,{origin:scope.portalOrigin});
    if(receipt.invoice_id!==row.invoice_id||receipt.capability_version<row.receipt.capability_version)throw new FirewoodHandoffError('handoff_identity_review');
    return db.transaction(async tx=>{
      const latest=(await tx.query('SELECT receipt,invoice_id FROM fwv2_prepare WHERE order_id=$1 FOR UPDATE',[orderId])).rows[0];
      if(latest.invoice_id!==receipt.invoice_id||latest.receipt.capability_version>receipt.capability_version)throw new FirewoodHandoffError('capability_version_conflict');
      if(latest.receipt.capability_version===receipt.capability_version&&latest.receipt.portal_url!==receipt.portal_url)throw new FirewoodHandoffError('capability_version_conflict');
      await tx.query('UPDATE fwv2_prepare SET receipt=$2,updated_at=$3 WHERE order_id=$1',[orderId,JSON.stringify(receipt),now()]);return receipt;
    });
  }
  async function observation(orderId){return(await db.query('SELECT receipt FROM fwv2_observation WHERE order_id=$1',[orderId])).rows[0]?.receipt??null;}
  async function observe(orderId){
    const row=await saved(orderId);if(!row?.receipt||!row.invoice_id)throw new FirewoodHandoffError('preparation_unconfirmed',true);
    const prior=await observation(orderId),value=await client.status(row.request,row.receipt,prior);
    return db.transaction(async tx=>{
      const locked=(await tx.query('SELECT receipt FROM fwv2_prepare WHERE order_id=$1 FOR UPDATE',[orderId])).rows[0];
      const current=(await tx.query('SELECT receipt FROM fwv2_observation WHERE order_id=$1',[orderId])).rows[0]?.receipt??null;
      const valid=validateSettlement(value,row.request,locked.receipt,current);
      await tx.query('INSERT INTO fwv2_observation_history VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[orderId,valid.observation_revision,JSON.stringify(valid)]);
      const history=(await tx.query('SELECT receipt FROM fwv2_observation_history WHERE order_id=$1 AND revision=$2',[orderId,valid.observation_revision])).rows[0];
      if(canonicalHandoff(history.receipt)!==canonicalHandoff(valid))throw new FirewoodHandoffError('settlement_version_conflict');
      await tx.query('INSERT INTO fwv2_observation VALUES($1,$2,$3) ON CONFLICT(order_id) DO UPDATE SET revision=EXCLUDED.revision,receipt=EXCLUDED.receipt',[orderId,valid.observation_revision,JSON.stringify(valid)]);
      return valid;
    });
  }
  return {enqueue,work,saved,paymentLink,renew,observe,observation};
}
