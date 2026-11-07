import {TEST_ACCOUNT_ID,postgresAdapter} from '../../hosted/runtime.mjs';
import {testKey} from '../../model.mjs';

export const RUNTIME_ID='angel-firewood-macbook-public-qa';
export const DATABASE_NAME='firewood_public_qa';
export const DATABASE_PORT=56382;
export const HTTPS_PORT=56383;
export function configuration(env,role='web') {
  if(!['web','worker','migration'].includes(role)||env.FIREWOOD_PUBLIC_HTTPS_QA_ENABLED!=='1'||
    env.FIREWOOD_STRIPE_TEST_ACCOUNT_ID!==TEST_ACCOUNT_ID||(env.FIREWOOD_CRM_TEST_ENABLED??'0')!=='0'||
    (env.FIREWOOD_TEST_EMAIL_ENABLED??'0')!=='0')throw new Error('isolated_https_qa_required');
  const key=testKey(env.FIREWOOD_STRIPE_TEST_SECRET_KEY);
  if(!key||!/^rk_test_/u.test(key))throw new Error('restricted_sandbox_key_required');
  let origin;try{origin=new URL(env.FIREWOOD_PUBLIC_QA_ORIGIN);}catch{throw new Error('temporary_https_origin_required');}
  if(origin.protocol!=='https:'||!/^([a-z0-9]+-)*[a-z0-9]+\.trycloudflare\.com$/u.test(origin.hostname)||
    origin.username||origin.password||origin.port||origin.pathname!=='/'||origin.search||origin.hash||
    origin.origin!==env.FIREWOOD_PUBLIC_QA_ORIGIN)throw new Error('temporary_https_origin_required');
  if(!/^[a-f0-9]{64}$/u.test(env.FIREWOOD_QA_ACCESS_TOKEN??'')||
    !/^whsec_[A-Za-z0-9]+$/u.test(env.FIREWOOD_HOSTED_TEST_WEBHOOK_SECRET??''))throw new Error('private_qa_credentials_required');
  return Object.freeze({origin:origin.origin,account:TEST_ACCOUNT_ID,key,accessToken:env.FIREWOOD_QA_ACCESS_TOKEN,
    webhookSecret:env.FIREWOOD_HOSTED_TEST_WEBHOOK_SECRET,emailEnabled:false});
}
export function databaseOptions(env,migration=false) {
  let url;try{url=new URL(env.FIREWOOD_PUBLIC_QA_DATABASE_URL);}catch{throw new Error('separate_https_database_required');}
  const role=migration?'firewood_public_migrator':'firewood_public_worker';
  if(url.protocol!=='postgresql:'||url.hostname!=='127.0.0.1'||url.port!==String(DATABASE_PORT)||url.pathname!==`/${DATABASE_NAME}`||
    decodeURIComponent(url.username)!==role||decodeURIComponent(url.password).length<32||url.search||url.hash)throw new Error('separate_https_database_required');
  return {connectionString:url.href,ssl:false,max:3,connectionTimeoutMillis:5000,idleTimeoutMillis:15000,statement_timeout:10000,allowExitOnIdle:true};
}
export async function verifyDatabase(db,config) {
  const id=(await db.query('SELECT current_database() AS db,current_user AS role,host(inet_server_addr()) AS host,inet_server_port() AS port')).rows[0];
  if(id.db!==DATABASE_NAME||id.role!=='firewood_public_worker'||id.host!=='127.0.0.1'||id.port!==DATABASE_PORT)throw new Error('separate_https_database_required');
  const marker=(await db.query('SELECT * FROM firewood_public_qa_environment WHERE id=$1',[RUNTIME_ID])).rows[0];
  if(!marker||marker.origin!==config.origin||marker.account_id!==config.account||
    Number((await db.query('SELECT count(*) AS n FROM firewood_test_crm_sync')).rows[0].n)!==0)throw new Error('https_qa_identity_required');
}
export async function openDatabase(env,config) {
  const {Pool}=await import('pg');const pool=new Pool(databaseOptions(env));pool.on('error',()=>{});const db=postgresAdapter(pool);
  try{await verifyDatabase(db,config);}catch(error){await pool.end();throw error;}
  return {db,close:()=>pool.end()};
}
