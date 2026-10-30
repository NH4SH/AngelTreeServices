// Separate production-profile store. Installation/execution is limited to the
// explicit in-process fixture until the existing guarded installer is bound.
import {randomUUID} from 'node:crypto';
import {canonicalHandoff,handoffDigest,validatePrepareReceipt,FirewoodHandoffError} from './contract.mjs';
import {assertLiveClient,liveStoreIdentity} from './client.mjs';
import {validateSettlement} from './settlement.mjs';
import {assertIsolatedLiveDatabase} from './isolated-database.mjs';

export async function installHandoffStore(db,client){
  assertLiveClient(client,{isolated:true});
  assertIsolatedLiveDatabase(db);
  const identityValue=liveStoreIdentity(client);
  return db.transaction(async tx=>{
    await tx.query('SELECT pg_advisory_xact_lock(987134230)');
    const existing=(await tx.query("SELECT table_name FROM information_schema.tables WHERE table_schema=current_schema() AND table_type='BASE TABLE'")).rows;
    if(existing.some(x=>!x.table_name.startsWith('fwlive_'))||existing.length&&!existing.some(x=>x.table_name==='fwlive_identity'))throw Error('fresh_handoff_namespace_required');
    await tx.query('CREATE TABLE IF NOT EXISTS fwlive_identity(id boolean PRIMARY KEY CHECK(id),identity_hash text NOT NULL)');
    const identity=handoffDigest(identityValue);
    const before=(await tx.query('SELECT identity_hash FROM fwlive_identity WHERE id=true')).rows[0];if(before&&before.identity_hash!==identity)throw Error('handoff_identity_conflict');
    await tx.query('INSERT INTO fwlive_identity VALUES(true,$1) ON CONFLICT DO NOTHING',[identity]);
    await tx.query(`CREATE OR REPLACE FUNCTION fwlive_identity_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'immutable_live_identity';END $$;`);
    await tx.query('DROP TRIGGER IF EXISTS fwlive_identity_guard ON fwlive_identity');
    await tx.query('CREATE TRIGGER fwlive_identity_guard BEFORE UPDATE OR DELETE ON fwlive_identity FOR EACH ROW EXECUTE FUNCTION fwlive_identity_immutable()');
    await tx.query(`CREATE TABLE IF NOT EXISTS fwlive_prepare(order_id uuid PRIMARY KEY,request jsonb NOT NULL,
      status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','prepared','review')),receipt jsonb,invoice_id uuid UNIQUE,
      tries integer NOT NULL DEFAULT 0,retry_at bigint NOT NULL DEFAULT 0,lease uuid,lease_until bigint NOT NULL DEFAULT 0,last_code text,updated_at bigint NOT NULL)`);
    await tx.query(`CREATE OR REPLACE FUNCTION fwlive_freeze_prepare() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF TG_OP='DELETE' THEN RAISE EXCEPTION 'immutable_handoff_preparation'; END IF;
      IF NEW.order_id IS DISTINCT FROM OLD.order_id OR NEW.request IS DISTINCT FROM OLD.request
        OR (OLD.invoice_id IS NOT NULL AND NEW.invoice_id IS DISTINCT FROM OLD.invoice_id)
      THEN RAISE EXCEPTION 'immutable_handoff_preparation';END IF;RETURN NEW;END $$;`);
    await tx.query('DROP TRIGGER IF EXISTS fwlive_immutable_prepare ON fwlive_prepare');
    await tx.query('CREATE TRIGGER fwlive_immutable_prepare BEFORE UPDATE OR DELETE ON fwlive_prepare FOR EACH ROW EXECUTE FUNCTION fwlive_freeze_prepare()');
    await tx.query('CREATE TABLE IF NOT EXISTS fwlive_observation(order_id uuid PRIMARY KEY REFERENCES fwlive_prepare(order_id),revision integer NOT NULL,receipt jsonb NOT NULL)');
    await tx.query('CREATE TABLE IF NOT EXISTS fwlive_observation_history(order_id uuid NOT NULL REFERENCES fwlive_prepare(order_id),revision integer NOT NULL,receipt jsonb NOT NULL,PRIMARY KEY(order_id,revision))');
    await tx.query(`CREATE OR REPLACE FUNCTION fwlive_guard_observation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF TG_OP='DELETE' THEN RAISE EXCEPTION 'immutable_handoff_observation'; END IF;
      IF NEW.order_id IS DISTINCT FROM OLD.order_id OR NEW.revision<OLD.revision
        OR (NEW.revision=OLD.revision AND NEW.receipt IS DISTINCT FROM OLD.receipt)
        OR NEW.receipt->>'invoice_id' IS DISTINCT FROM OLD.receipt->>'invoice_id'
        OR (OLD.receipt->'original_paid_evidence' IS NOT NULL AND OLD.receipt->'original_paid_evidence'<>'null'::jsonb
          AND NEW.receipt->'original_paid_evidence' IS DISTINCT FROM OLD.receipt->'original_paid_evidence')
      THEN RAISE EXCEPTION 'immutable_handoff_observation';END IF;RETURN NEW;END $$;`);
    await tx.query('DROP TRIGGER IF EXISTS fwlive_observation_guard ON fwlive_observation');
    await tx.query('CREATE TRIGGER fwlive_observation_guard BEFORE UPDATE OR DELETE ON fwlive_observation FOR EACH ROW EXECUTE FUNCTION fwlive_guard_observation()');
    await tx.query(`CREATE OR REPLACE FUNCTION fwlive_history_append_only() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'append_only_handoff_history';END $$;`);
    await tx.query('DROP TRIGGER IF EXISTS fwlive_history_guard ON fwlive_observation_history');
    await tx.query('CREATE TRIGGER fwlive_history_guard BEFORE UPDATE OR DELETE ON fwlive_observation_history FOR EACH ROW EXECUTE FUNCTION fwlive_history_append_only()');
  });
}
export async function verifyHandoffStore(db,client){
  assertLiveClient(client,{isolated:true});
  assertIsolatedLiveDatabase(db);
  const identityValue=liveStoreIdentity(client);
  const expected=handoffDigest(identityValue);
  const row=(await db.query('SELECT identity_hash FROM fwlive_identity WHERE id=true')).rows[0];
  if(row?.identity_hash!==expected)throw Error('handoff_identity_conflict');
}
export async function queuePreparation(tx,input,at,client){
  assertLiveClient(client,{isolated:true});
  const request=client.parseRequest(input);
  await tx.query('INSERT INTO fwlive_prepare(order_id,request,updated_at) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[request.order_id,JSON.stringify(request),at]);
  const saved=(await tx.query('SELECT request FROM fwlive_prepare WHERE order_id=$1 FOR UPDATE',[request.order_id])).rows[0];
  if(!saved||canonicalHandoff(saved.request)!==canonicalHandoff(request))throw Error('immutable_handoff_preparation');
  return request;
}
export function handoffStore({db,client,now=Date.now}){
  assertLiveClient(client,{isolated:true});
  assertIsolatedLiveDatabase(db);
  async function enqueue(input){const request=client.parseRequest(input);
    await db.transaction(tx=>queuePreparation(tx,request,now(),client));
  }
  async function work({limit=20}={}){
    if(!Number.isInteger(limit)||limit<1||limit>50)throw Error('bounded_handoff_worker_required');
    const results={prepared:0,pending:0,review:0};
    for(let n=0;n<limit;n++){
      const row=await db.transaction(async tx=>{
        const r=(await tx.query("SELECT * FROM fwlive_prepare WHERE status='pending' AND retry_at<=$1 AND lease_until<=$1 ORDER BY updated_at,order_id FOR UPDATE SKIP LOCKED LIMIT 1",[now()])).rows[0];
        if(!r)return null;const lease=randomUUID();await tx.query('UPDATE fwlive_prepare SET lease=$2,lease_until=$3,tries=tries+1 WHERE order_id=$1',[r.order_id,lease,now()+60000]);return {...r,lease,tries:r.tries+1};
      });if(!row)break;
      try{const receipt=validatePrepareReceipt(await client.prepare(row.request),row.request);
        const r=await db.query("UPDATE fwlive_prepare SET status='prepared',receipt=$3,invoice_id=$4,tries=0,retry_at=0,lease=NULL,lease_until=0,last_code=NULL,updated_at=$5 WHERE order_id=$1 AND lease=$2 RETURNING order_id",[row.order_id,row.lease,JSON.stringify(receipt),receipt.invoice_id,now()]);if(r.rows.length)results.prepared++;
      }catch(e){const retry=e instanceof FirewoodHandoffError?e.retryable:true,status=retry&&row.tries<12?'pending':'review';
        const code=/^[a-z_]{1,64}$/u.test(e.code??'')?e.code:'live_handoff_connection_unconfirmed';
        const r=await db.query('UPDATE fwlive_prepare SET status=$3,last_code=$4,retry_at=$5,lease=NULL,lease_until=0,updated_at=$6 WHERE order_id=$1 AND lease=$2 RETURNING order_id',[row.order_id,row.lease,status,code,now()+Math.min(3600000,5000*2**Math.min(row.tries-1,9)),now()]);if(r.rows.length)results[status]++;
      }
    }return results;
  }
  async function saved(orderId){return(await db.query('SELECT * FROM fwlive_prepare WHERE order_id=$1',[orderId])).rows[0]??null;}
  async function paymentLink(orderId){const row=await saved(orderId);if(!row||row.status!=='prepared'||!row.receipt?.payment_execution_ready||!row.receipt.portal_url)throw new FirewoodHandoffError('live_payment_execution_not_ready',false,503);
    if(Date.parse(row.receipt.expires_at)<=now()+5000)throw new FirewoodHandoffError('live_capability_renewal_required',false,409);
    return {invoiceId:row.invoice_id,url:row.receipt.portal_url};
  }
  async function renew(orderId){
    const row=await saved(orderId);if(!row?.receipt||row.status!=='prepared')throw new FirewoodHandoffError('live_preparation_unconfirmed',true);
    const receipt=validatePrepareReceipt(await client.renew(row.request,row.receipt),row.request);
    if(receipt.invoice_id!==row.invoice_id||receipt.capability_version<row.receipt.capability_version)throw new FirewoodHandoffError('live_handoff_identity_review');
    return db.transaction(async tx=>{
      const latest=(await tx.query('SELECT receipt,invoice_id FROM fwlive_prepare WHERE order_id=$1 FOR UPDATE',[orderId])).rows[0];
      if(latest.invoice_id!==receipt.invoice_id||latest.receipt.capability_version>receipt.capability_version)throw new FirewoodHandoffError('live_capability_version_conflict');
      if(latest.receipt.capability_version===receipt.capability_version&&latest.receipt.portal_url!==receipt.portal_url)throw new FirewoodHandoffError('live_capability_version_conflict');
      await tx.query('UPDATE fwlive_prepare SET receipt=$2,updated_at=$3 WHERE order_id=$1',[orderId,JSON.stringify(receipt),now()]);return receipt;
    });
  }
  async function observation(orderId){return(await db.query('SELECT receipt FROM fwlive_observation WHERE order_id=$1',[orderId])).rows[0]?.receipt??null;}
  async function observe(orderId){
    const row=await saved(orderId);if(!row?.receipt||!row.invoice_id)throw new FirewoodHandoffError('live_preparation_unconfirmed',true);
    const prior=await observation(orderId),value=await client.status(row.request,row.receipt,prior);
    return db.transaction(async tx=>{
      const locked=(await tx.query('SELECT receipt FROM fwlive_prepare WHERE order_id=$1 FOR UPDATE',[orderId])).rows[0];
      const current=(await tx.query('SELECT receipt FROM fwlive_observation WHERE order_id=$1',[orderId])).rows[0]?.receipt??null;
      const valid=validateSettlement(value,row.request,locked.receipt,current);
      await tx.query('INSERT INTO fwlive_observation_history VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[orderId,valid.observation_revision,JSON.stringify(valid)]);
      const history=(await tx.query('SELECT receipt FROM fwlive_observation_history WHERE order_id=$1 AND revision=$2',[orderId,valid.observation_revision])).rows[0];
      if(canonicalHandoff(history.receipt)!==canonicalHandoff(valid))throw new FirewoodHandoffError('live_settlement_version_conflict');
      await tx.query('INSERT INTO fwlive_observation VALUES($1,$2,$3) ON CONFLICT(order_id) DO UPDATE SET revision=EXCLUDED.revision,receipt=EXCLUDED.receipt',[orderId,valid.observation_revision,JSON.stringify(valid)]);
      return valid;
    });
  }
  return {enqueue,work,saved,paymentLink,renew,observe,observation};
}
