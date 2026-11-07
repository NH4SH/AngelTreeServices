import { TEST_ACCOUNT_ID,postgresAdapter } from '../hosted/runtime.mjs';
import { testKey } from '../model.mjs';

export const MAC_RUNTIME_ID='angel-firewood-macbook-native-qa';
export const MAC_ORIGIN='http://127.0.0.1:56381';
export const DATABASE_PORT=56382;
export const DATABASE_NAME='firewood_macbook_qa';

export function configuration(env,role='web') {
  if(!['web','worker','migration'].includes(role)||env.FIREWOOD_MACBOOK_RUNTIME_TEST_ENABLED!=='1'||
    (env.FIREWOOD_CRM_TEST_ENABLED??'0')!=='0'||env.FIREWOOD_STRIPE_TEST_ACCOUNT_ID!==TEST_ACCOUNT_ID||
    (env.FIREWOOD_TEST_EMAIL_ENABLED??'0')!=='0')throw new Error('private_macbook_qa_required');
  const key=testKey(env.FIREWOOD_STRIPE_TEST_SECRET_KEY);
  if(!key||!/^(?:rk|sk)_test_/u.test(key))throw new Error('claimed_sandbox_required');
  if(env.FIREWOOD_MACBOOK_QA_ORIGIN!==MAC_ORIGIN||!/^[a-f0-9]{64}$/u.test(env.FIREWOOD_QA_ACCESS_TOKEN??'')||
    !/^whsec_[A-Za-z0-9]+$/u.test(env.FIREWOOD_HOSTED_TEST_WEBHOOK_SECRET??''))throw new Error('private_qa_credentials_required');
  return Object.freeze({origin:MAC_ORIGIN,account:TEST_ACCOUNT_ID,key,accessToken:env.FIREWOOD_QA_ACCESS_TOKEN,
    webhookSecret:env.FIREWOOD_HOSTED_TEST_WEBHOOK_SECRET,emailEnabled:false,
    mailFrom:'Angel Tree Services Firewood <orders@firewood.angeltreeservice.org>'});
}

export function databaseOptions(env,migration=false) {
  let url;
  try{url=new URL(env.FIREWOOD_MACBOOK_DATABASE_URL);}catch{throw new Error('dedicated_macbook_database_required');}
  const role=migration?'firewood_macbook_migrator':'firewood_macbook_worker';
  if(url.protocol!=='postgresql:'||url.hostname!=='127.0.0.1'||url.port!==String(DATABASE_PORT)||url.pathname!==`/${DATABASE_NAME}`||
    decodeURIComponent(url.username)!==role||decodeURIComponent(url.password).length<32||url.search||url.hash)throw new Error('dedicated_macbook_database_required');
  // This exception is confined to the host's loopback. Remote Render/Neon TLS
  // validation and every other runtime's database guards are unchanged.
  return {connectionString:url.href,ssl:false,max:3,connectionTimeoutMillis:5000,idleTimeoutMillis:15000,
    statement_timeout:10000,allowExitOnIdle:true};
}

export async function verifyDatabase(db,config) {
  const identity=(await db.query("SELECT current_database() AS db,current_user AS role,host(inet_server_addr()) AS host,inet_server_port() AS port")).rows[0];
  if(identity.db!==DATABASE_NAME||identity.role!=='firewood_macbook_worker'||identity.host!=='127.0.0.1'||identity.port!==DATABASE_PORT)throw new Error('dedicated_macbook_database_required');
  const marker=(await db.query('SELECT * FROM firewood_macbook_environment WHERE id=$1',[MAC_RUNTIME_ID])).rows[0];
  if(!marker||marker.origin!==config.origin||marker.account_id!==TEST_ACCOUNT_ID||
    Number((await db.query('SELECT count(*) AS n FROM firewood_test_crm_sync')).rows[0].n)!==0)throw new Error('isolated_macbook_database_required');
}

export async function openDatabase(env,config) {
  const {Pool}=await import('pg'),pool=new Pool(databaseOptions(env));
  pool.on('error',()=>{});
  const db=postgresAdapter(pool);
  try{await verifyDatabase(db,config);}catch(error){await pool.end();throw error;}
  return {db,close:()=>pool.end()};
}
