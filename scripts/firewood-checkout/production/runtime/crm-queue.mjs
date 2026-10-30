import {randomUUID} from 'node:crypto';

const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u.test(value);
const canonical=value=>Array.isArray(value)?'['+value.map(canonical).join(',')+']':value!==null&&typeof value==='object'?'{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}':JSON.stringify(value);
export class CrmCandidateError extends Error {
  constructor(code,retryable=false,delayMs=0){super(code);this.code=code;this.retryable=retryable;this.delayMs=delayMs;}
}

// This queue is installed only by the separately reviewed candidate migration.
// It has no configuration discovery, payment API or sending capability.
export const crmQueueStatements=[`CREATE TABLE IF NOT EXISTS fw_crm_sync (
 order_id uuid PRIMARY KEY REFERENCES fw_orders(id), request jsonb NOT NULL,
 intent_id text NOT NULL UNIQUE CHECK(intent_id ~ '^pi_[A-Za-z0-9_]+$'), status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','synced','review')),
 tries integer NOT NULL DEFAULT 0, retry_at bigint NOT NULL DEFAULT 0, lease uuid,
 lease_until bigint NOT NULL DEFAULT 0, generation integer NOT NULL DEFAULT 0,
 processed_generation integer NOT NULL DEFAULT -1, receipt jsonb, last_code text,
 updated_at bigint NOT NULL
);`,`CREATE OR REPLACE FUNCTION fw_freeze_crm_request() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.order_id IS DISTINCT FROM OLD.order_id OR NEW.request IS DISTINCT FROM OLD.request OR NEW.intent_id IS DISTINCT FROM OLD.intent_id
 OR (OLD.receipt IS NOT NULL AND (NEW.receipt IS NULL OR NEW.receipt->>'invoice_id' IS DISTINCT FROM OLD.receipt->>'invoice_id'
 OR NEW.receipt->>'payment_id' IS DISTINCT FROM OLD.receipt->>'payment_id'))
 THEN RAISE EXCEPTION 'immutable_firewood_crm_identity'; END IF; RETURN NEW; END $$;`,
 'DROP TRIGGER IF EXISTS fw_crm_request_immutable ON fw_crm_sync;',
 'CREATE TRIGGER fw_crm_request_immutable BEFORE UPDATE ON fw_crm_sync FOR EACH ROW EXECUTE FUNCTION fw_freeze_crm_request();'];
export const crmQueueSchema=crmQueueStatements.join('\n');

export function createCrmQueue({db,client,now=Date.now}) {
  if(!client||typeof client.send!=='function')throw Error('dedicated_crm_client_required');
  async function enqueue(tx,request,intentId){
    if(!uuid(request?.order_id)||!/^pi_[A-Za-z0-9_]+$/u.test(intentId??''))throw Error('paid_crm_identity_required');
    const order=(await tx.query('SELECT payment_id,payment_intent,payment_status FROM fw_orders WHERE id=$1 FOR UPDATE',[request.order_id])).rows[0];
    if(!order||!['paid','refunded'].includes(order.payment_status)||order.payment_id!==request.session_id||order.payment_intent!==intentId)throw Error('paid_crm_identity_required');
    const saved=(await tx.query('INSERT INTO fw_crm_sync(order_id,request,intent_id,updated_at) VALUES($1,$2,$3,$4) ON CONFLICT(order_id) DO NOTHING RETURNING *',
      [request.order_id,JSON.stringify(request),intentId,now()])).rows[0];
    if(saved)return;
    const existing=(await tx.query('SELECT request,intent_id FROM fw_crm_sync WHERE order_id=$1 FOR UPDATE',[request.order_id])).rows[0];
    if(existing.intent_id!==intentId||canonical(existing.request)!==canonical(request))throw Error('immutable_crm_request_conflict');
    await tx.query(`UPDATE fw_crm_sync SET generation=generation+1,
      status=CASE WHEN status='review' AND last_code IS DISTINCT FROM 'financial_review' THEN 'review' ELSE 'pending' END,
      retry_at=0,updated_at=$2 WHERE order_id=$1`,[request.order_id,now()]);
  }
  async function claim(){return db.transaction(async tx=>{
    const row=(await tx.query("SELECT * FROM fw_crm_sync WHERE status='pending' AND retry_at<=$1 AND lease_until<=$1 ORDER BY updated_at,order_id FOR UPDATE SKIP LOCKED LIMIT 1",[now()])).rows[0];
    if(!row)return null;const lease=randomUUID();
    await tx.query('UPDATE fw_crm_sync SET lease=$2,lease_until=$3,tries=tries+1 WHERE order_id=$1',[row.order_id,lease,now()+60000]);
    return {...row,lease,tries:row.tries+1};
  });}
  async function work({limit=20}={}){
    if(!Number.isInteger(limit)||limit<1||limit>100)throw Error('bounded_crm_worker_required');
    const result={synced:0,pending:0,review:0},deadline=Date.now()+120000;
    for(let n=0;n<limit&&Date.now()<deadline;n++){
      const row=await claim();if(!row)break;
      try{
        // The client verifies the complete contract receipt before returning.
        const receipt=await client.send(row.request,row.receipt,row.intent_id);
        if(!uuid(receipt?.invoice_id)||!uuid(receipt?.payment_id)||typeof receipt.review_required!=='boolean'||typeof receipt.refresh_required!=='boolean')throw new CrmCandidateError('response_unconfirmed',true);
        if(row.receipt&&['invoice_id','payment_id'].some(k=>row.receipt[k]!==receipt[k]))throw new CrmCandidateError('mapping_review_required');
        const refresh=receipt.refresh_required,status=refresh?'pending':receipt.review_required?'review':'synced';
        const completed=await db.query(`UPDATE fw_crm_sync SET receipt=$3,processed_generation=$4,
          status=CASE WHEN generation<>$4 THEN 'pending' ELSE $5 END,
          last_code=CASE WHEN $6 THEN 'financial_review' ELSE NULL END,
          retry_at=CASE WHEN generation<>$4 THEN 0::bigint ELSE $7::bigint END,tries=0,
          lease=NULL,lease_until=0,updated_at=$8 WHERE order_id=$1 AND lease=$2 RETURNING status`,
          [row.order_id,row.lease,JSON.stringify(receipt),row.generation,status,receipt.review_required,refresh?now()+60000:0,now()]);
        if(completed.rows[0])result[completed.rows[0].status==='synced'?'synced':completed.rows[0].status==='review'?'review':'pending']++;
      }catch(error){
        const known=error instanceof CrmCandidateError?error:new CrmCandidateError('connection_unconfirmed',true);
        const retry=known.retryable&&row.tries<12,status=retry?'pending':'review';
        const code=/^[a-z_]{1,64}$/u.test(known.code??'')?known.code:'connection_unconfirmed';
        const delay=Math.min(3600000,Math.max(Number.isFinite(known.delayMs)?Math.max(0,known.delayMs):0,5000*2**Math.min(row.tries-1,9)));
        const completed=await db.query('UPDATE fw_crm_sync SET status=$3,last_code=$4,retry_at=$5,lease=NULL,lease_until=0,updated_at=$6 WHERE order_id=$1 AND lease=$2 RETURNING order_id',
          [row.order_id,row.lease,status,code,now()+delay,now()]);
        if(completed.rows[0])result[status]++;
      }
    }
    return result;
  }
  return {enqueue,work};
}
