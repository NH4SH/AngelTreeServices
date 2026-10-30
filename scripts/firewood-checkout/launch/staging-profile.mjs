import {HANDOFF_SOURCE,SANDBOX_ACCOUNT,FirewoodHandoffError} from './contract.mjs';

// This is the verified, separate CRM staging target. It cannot select live mode.
export const HANDOFF_STAGING=Object.freeze({
  profile:'staging',
  origin:'https://angel-tree-admin-staging.netlify.app',
  portalOrigin:'https://angel-tree-admin-staging.netlify.app',
  databaseOrigin:'https://gbyhdsuiqeslgjdnbqng.supabase.co',
  siteId:'d81d923d-6ccf-4c1e-87cc-263f3d51555d',
  environmentId:'ats_fwhandoff_staging_gbyhdsuiqeslgjdnbqng',
  account:SANDBOX_ACCOUNT,
  source:HANDOFF_SOURCE
});

export function handoffStagingScope(value){
  const secret=value?.secret;
  const validSecret=typeof secret==='string'&&(/^[a-f0-9]{64}$/u.test(secret)||
    /^[A-Za-z0-9_-]{43}$/u.test(secret)&&Buffer.from(secret,'base64url').length===32&&Buffer.from(secret,'base64url').toString('base64url')===secret);
  if(value?.testOnly!==true||value.production!==false||
    Object.entries(HANDOFF_STAGING).some(([key,wanted])=>value[key]!==wanted)||
    !/^website-firewood-v2-staging-[a-f0-9]{12}$/u.test(value.keyId??'')||
    !validSecret){
    throw new FirewoodHandoffError('isolated_staging_scope_required');
  }
  return Object.freeze({...value});
}
