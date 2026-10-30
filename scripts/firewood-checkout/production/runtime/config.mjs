import {policyHash} from './policy.mjs';
import {privateFile} from '../../macbook/ops/files.mjs';
export const SANDBOX_ACCOUNT='acct_1UU9U8RAZXGe6tX0';
export const LIVE_ACCOUNT='acct_1Tv92EI7tY6VHUvU';
export const DB_PORT=56388,HTTPS_PORT=56389,RELAY_PORT=56390;
export const RUNTIME_ID='angel-firewood-candidate-v1';
export async function loadConfiguration(env){const release=env.FIREWOOD_CANDIDATE_MODE==='live'&&env.FIREWOOD_CANDIDATE_RELEASE_FILE?JSON.parse((await privateFile(env.FIREWOOD_CANDIDATE_RELEASE_FILE)).toString()):null;return configuration(env,release);}
export function configuration(env,release=null) {
  const mode=env.FIREWOOD_CANDIDATE_MODE;
  if(!['sandbox','live'].includes(mode))throw Error('explicit_candidate_mode_required');
  const sandbox=mode==='sandbox';
  if(!sandbox&&(!release||release.policyHash!==policyHash||release.approval!=='owner-approved-live-release'||
    !['routing','tls','database','backupRestore','tax','notifications','operations','crmContract','livePayments'].every(k=>release.gates?.[k]===true)))throw Error('live_activation_not_approved');
  const account=sandbox?SANDBOX_ACCOUNT:LIVE_ACCOUNT,key=env.FIREWOOD_CANDIDATE_STRIPE_KEY;
  if(env.FIREWOOD_CANDIDATE_ACCOUNT!==account||!(sandbox?/^rk_test_[A-Za-z0-9]+$/u:/^rk_live_[A-Za-z0-9]+$/u).test(key??''))throw Error('separate_restricted_account_key_required');
  const origin=env.FIREWOOD_CANDIDATE_ORIGIN;let url;
  try{url=new URL(origin);}catch{throw Error('canonical_https_origin_required');}
  if(url.origin!==origin||url.protocol!=='https:'||url.username||url.password||url.port||
    (sandbox?!(/^[a-z0-9-]+\.trycloudflare\.com$/u.test(url.hostname)||['firewood-candidate.invalid','checkout.angeltreeservices.org'].includes(url.hostname)):url.hostname!=='checkout.angeltreeservices.org'))throw Error('canonical_https_origin_required');
  if(env.FIREWOOD_CANDIDATE_MANAGED_WORKER!==undefined&&!['0','1'].includes(env.FIREWOOD_CANDIDATE_MANAGED_WORKER))throw Error('explicit_worker_ownership_required');
  if(!/^whsec_[A-Za-z0-9]+$/u.test(env.FIREWOOD_CANDIDATE_WEBHOOK_SECRET??''))throw Error('separate_webhook_secret_required');
  if(env.FIREWOOD_CANDIDATE_CRM_ENABLED!=='0'||!['0','1'].includes(env.FIREWOOD_CANDIDATE_EMAIL_ENABLED)||
    sandbox&&env.FIREWOOD_CANDIDATE_EMAIL_ENABLED!=='0')throw Error('crm_and_sending_held_for_review');
  if(!/^[a-f0-9]{64}$/u.test(env.FIREWOOD_CANDIDATE_ACCESS_TOKEN??''))throw Error('sandbox_access_token_required');
  return Object.freeze({sandbox,mode,origin,account,key,webhookSecret:env.FIREWOOD_CANDIDATE_WEBHOOK_SECRET,
    accessToken:env.FIREWOOD_CANDIDATE_ACCESS_TOKEN,database:sandbox?'firewood_candidate_sandbox':'firewood_orders',policyHash,
    emailEnabled:!sandbox&&env.FIREWOOD_CANDIDATE_EMAIL_ENABLED==='1',crmEnabled:false,managedWorker:env.FIREWOOD_CANDIDATE_MANAGED_WORKER==='1'});
}
export function databaseOptions(env,config,migration=false) {
  let u;try{u=new URL(env.FIREWOOD_CANDIDATE_DATABASE_URL);}catch{throw Error('separate_candidate_database_required');}
  const role=migration?'firewood_candidate_migrator':'firewood_candidate_worker';
  if(u.protocol!=='postgresql:'||u.hostname!=='127.0.0.1'||u.port!==String(DB_PORT)||u.pathname!==`/${config.database}`||
    decodeURIComponent(u.username)!==role||decodeURIComponent(u.password).length<32||u.search||u.hash)throw Error('separate_candidate_database_required');
  return {connectionString:u.href,max:4,connectionTimeoutMillis:5000,idleTimeoutMillis:10000,statement_timeout:10000,allowExitOnIdle:true};
}
export async function verifyDatabase(db,config) {
  const x=(await db.query('SELECT * FROM fw_identity WHERE id=$1',[RUNTIME_ID])).rows[0];
  if(!x||x.account!==config.account||x.mode!==config.mode||x.origin!==config.origin||x.policy_hash!==policyHash)throw Error('candidate_database_identity_mismatch');
}
