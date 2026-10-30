// Explicit opt-in for disposable sandbox candidates. The installed runtime does
// not import this module or discover its credentials.
import {createHash} from 'node:crypto';
import {SANDBOX_ACCOUNT} from './config.mjs';
import {policyHash} from './policy.mjs';
import {canonicalCandidate,createCandidateBinding,candidateMetadata,candidateCrmClient,parseCandidateRequest} from './crm-contract.mjs';
import {createCrmQueue,crmQueueStatements} from './crm-queue.mjs';

export function createCandidateCrmAdapter({db,scope,client,fetcher=fetch,now=Date.now}){
  // Validate the full sandbox/loopback scope even when tests inject a client.
  const transport=candidateCrmClient(scope,fetcher,now);
  const identity=Object.freeze({source:scope.sourceId,origin:scope.origin,keyId:scope.keyId,
    account:scope.accountId,mode:scope.mode,policyHash});
  const identityHash=createHash('sha256').update(canonicalCandidate(identity)).digest('hex');
  const queue=createCrmQueue({db,client:client??transport,now});
  function assertConfiguration(config){
    if(config.sandbox!==true||config.mode!=='sandbox'||config.account!==SANDBOX_ACCOUNT||config.policyHash!==policyHash||
      config.crmEnabled!==false||config.emailEnabled!==false)throw Error('sandbox_crm_candidate_only');
  }
  function binding(row){
    const value=createCandidateBinding(row,scope);
    if(value.mode!=='sandbox'||value.account_id!==SANDBOX_ACCOUNT||!/@[^@\s]+\.invalid$/iu.test(value.order.contact.email))throw Error('sandbox_crm_candidate_only');
    return value;
  }
  function assertBinding(row){
    if(!row.crm_binding||canonicalCandidate(row.crm_binding)!==canonicalCandidate(binding(row)))throw Error('frozen_crm_binding_required');
    return row.crm_binding;
  }
  async function install(config){
    assertConfiguration(config);
    await db.transaction(async tx=>{
      await tx.query('SELECT pg_advisory_xact_lock(987134223)');
      const marker=(await tx.query('SELECT * FROM fw_identity')).rows;
      if(marker.length!==1||marker[0].account!==SANDBOX_ACCOUNT||marker[0].mode!=='sandbox'||marker[0].policy_hash!==policyHash||marker[0].origin!==config.origin)throw Error('isolated_crm_candidate_identity_required');
      const exists=(await tx.query("SELECT table_name FROM information_schema.tables WHERE table_schema=current_schema() AND table_name='fw_crm_candidate_identity'")).rows.length;
      const count=Number((await tx.query('SELECT count(*)::int AS n FROM fw_orders')).rows[0].n);
      if(!exists&&count!==0)throw Error('fresh_crm_candidate_required');
      await tx.query('CREATE TABLE IF NOT EXISTS fw_crm_candidate_identity(id boolean PRIMARY KEY CHECK(id),identity_hash text NOT NULL)');
      const prior=(await tx.query('SELECT identity_hash FROM fw_crm_candidate_identity WHERE id=true')).rows[0];
      if(prior&&prior.identity_hash!==identityHash)throw Error('crm_candidate_identity_conflict');
      await tx.query('INSERT INTO fw_crm_candidate_identity VALUES(true,$1) ON CONFLICT DO NOTHING',[identityHash]);
      await tx.query('ALTER TABLE fw_orders ADD COLUMN IF NOT EXISTS crm_binding jsonb');
      if(Number((await tx.query('SELECT count(*)::int AS n FROM fw_orders WHERE crm_binding IS NULL')).rows[0].n)!==0)throw Error('legacy_orders_cannot_gain_crm_binding');
      await tx.query(`CREATE OR REPLACE FUNCTION fw_freeze_candidate_binding() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
        IF NEW.crm_binding IS DISTINCT FROM OLD.crm_binding THEN RAISE EXCEPTION 'immutable_crm_binding'; END IF; RETURN NEW; END $$;`);
      await tx.query('DROP TRIGGER IF EXISTS fw_candidate_binding_immutable ON fw_orders');
      await tx.query('CREATE TRIGGER fw_candidate_binding_immutable BEFORE UPDATE ON fw_orders FOR EACH ROW EXECUTE FUNCTION fw_freeze_candidate_binding()');
      for(const sql of crmQueueStatements)await tx.query(sql);
    });
  }
  async function enqueue(tx,row,intent){
    const request=parseCandidateRequest({...assertBinding(row),session_id:row.payment_id});
    await queue.enqueue(tx,request,intent);
  }
  return {identity,install,assertConfiguration,binding,assertBinding,metadata:row=>candidateMetadata(assertBinding(row)),enqueue,queue};
}
