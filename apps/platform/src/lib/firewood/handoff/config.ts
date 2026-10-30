import"server-only";
import{createClient}from"@supabase/supabase-js";
import{supabaseDatabase}from"./database.mjs";
import{FIREWOOD_STAGING,isFirewoodStagingIdentity}from"./staging-profile.mjs";
export function getHandoffDependencies(env=process.env){
 const staging=env.FIREWOOD_HANDOFF_V2_STAGING_ENABLED==="1";
 if(staging?env.FIREWOOD_HANDOFF_V2_TEST_ENABLED==="1":env.FIREWOOD_HANDOFF_V2_TEST_ENABLED!=="1")return null;
 try{
  const url=new URL(env.FIREWOOD_HANDOFF_V2_SUPABASE_URL??""),origin=new URL(env.FIREWOOD_HANDOFF_V2_PORTAL_ORIGIN??"");
  const key=env.FIREWOOD_HANDOFF_V2_SERVICE_ROLE_KEY??"",secret=env.FIREWOOD_HANDOFF_V2_SIGNING_SECRET??"",encryption=env.FIREWOOD_HANDOFF_V2_ENCRYPTION_KEY??"",environmentId=env.FIREWOOD_HANDOFF_V2_ENVIRONMENT_ID??"";
  if(url.pathname!=="/"||url.search||url.hash||url.username||url.password||origin.pathname!=="/"||origin.search||origin.hash||origin.username||origin.password||!key||!/^[A-Za-z0-9_-]{32,256}$/.test(secret)||env.FIREWOOD_HANDOFF_V2_ACCOUNT_ID!=="acct_1UU9U8RAZXGe6tX0"||env.FIREWOOD_HANDOFF_V2_SOURCE_ID!=="website_firewood_invoice_v2")return null;
  if(staging){
   if(!isFirewoodStagingIdentity(env)||url.origin!==FIREWOOD_STAGING.databaseOrigin||origin.origin!==FIREWOOD_STAGING.portalOrigin||env.FIREWOOD_HANDOFF_V2_COLLECTOR_TEST_ENABLED==="1")return null;
   if(!/^[A-Za-z0-9][A-Za-z0-9_-]{7,79}$/.test(env.FIREWOOD_HANDOFF_V2_KEY_ID??""))return null;
   if(env.CUSTOMER_PORTAL_BASE_URL&&env.CUSTOMER_PORTAL_BASE_URL!==FIREWOOD_STAGING.portalOrigin)return null;
   if(env.STRIPE_SECRET_KEY&&!/^rk_test_[A-Za-z0-9]+$/.test(env.STRIPE_SECRET_KEY))return null;
   const publishable=env.STRIPE_PUBLISHABLE_KEY||env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
   if(publishable&&!/^pk_test_[A-Za-z0-9]+$/.test(publishable))return null;
   if(env.STRIPE_PUBLISHABLE_KEY&&env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY&&env.STRIPE_PUBLISHABLE_KEY!==env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)return null;
   if(env.FIREWOOD_HANDOFF_V2_COLLECTOR_STAGING_ENABLED==="1"&&(!env.STRIPE_SECRET_KEY||!publishable))return null;
  }else if(env.APP_ENV==="staging"||(env.FIREWOOD_HANDOFF_V2_STAGING_ENABLED&&env.FIREWOOD_HANDOFF_V2_STAGING_ENABLED!=="0")||url.protocol!=="http:"||url.hostname!=="127.0.0.1"||!url.port||origin.protocol!=="http:"||origin.hostname!=="127.0.0.1"||!origin.port||!/^ats_fwhandoff_(home_)?[a-f0-9]{12}$/.test(environmentId))return null;
  const encryptionKey=Buffer.from(encryption,"base64");if(encryptionKey.length!==32||env.PORTAL_TOKEN_ENCRYPTION_KEY!==encryption||env.NEXT_PUBLIC_SUPABASE_URL!==url.origin||env.SUPABASE_SERVICE_ROLE_KEY!==key)return null;
  return{config:{enabled:true,profile:staging?"staging":"native",sourceId:"website_firewood_invoice_v2",accountId:"acct_1UU9U8RAZXGe6tX0",environmentId,keyId:env.FIREWOOD_HANDOFF_V2_KEY_ID??"",signingSecret:secret,encryptionKey,portalOrigin:origin.origin,collectorReady:staging?env.FIREWOOD_HANDOFF_V2_COLLECTOR_STAGING_ENABLED==="1":env.FIREWOOD_HANDOFF_V2_COLLECTOR_TEST_ENABLED==="1"},db:supabaseDatabase(createClient(url.origin,key,{auth:{persistSession:false,autoRefreshToken:false}}))};
 }catch{return null;}
}
