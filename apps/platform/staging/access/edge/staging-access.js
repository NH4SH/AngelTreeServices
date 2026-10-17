import manifest from '../../targets.json' with {type:'json'};
import {handleGate,hostedConfig} from '../gate.mjs';

// Selected only by the exported staging configuration, never by production's
// netlify.toml. Missing markers/keys/site binding always deny; never pass through.
export default async function(request,context) {
  const env=globalThis.Netlify?.env;
  let config;
  const names=['APP_ENV','STAGING_MODE','APP_BASE_URL','STAGING_GATE_KEY','STAGING_GATE_VERIFIER',
    'NEXT_PUBLIC_STAGING_GATE_KEY','NEXT_PUBLIC_STAGING_GATE_VERIFIER','PUBLIC_STAGING_GATE_KEY','PUBLIC_STAGING_GATE_VERIFIER',
    'VITE_STAGING_GATE_KEY','VITE_STAGING_GATE_VERIFIER'];
  try {config=hostedConfig(manifest,Object.fromEntries(names.map(name=>[name,env?.get(name)])),context.site?.id);} catch {
    return handleGate(request,{},()=>{throw Error('Unreachable');});
  }
  return handleGate(request,config,authorized=>context.next(authorized));
}
export const config={onError:'fail'};
