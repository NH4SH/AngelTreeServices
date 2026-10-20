// Offline review of Netlify configuration sources. No key lookup or remote writes.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { checkStaging } from '../../src/lib/security/staging-policy.mjs';

const nonempty = v => typeof v === 'string' && Boolean(v.trim());
const contexts = ['production','deploy-preview','branch-deploy','dev'];
const scopes = ['builds','functions','runtime'];
export const preparedCredentialTarget = Object.freeze({
  siteId:'d81d923d-6ccf-4c1e-87cc-263f3d51555d',
  projectRef:'gbyhdsuiqeslgjdnbqng',
  origin:'https://angel-tree-admin-staging.netlify.app',
});
// Review installation metadata separately from secret values, which Netlify
// deliberately masks. This cannot prove the values a hosted process receives.
export function reviewPreparedCredentialMetadata(target, siteVariables, teamVariables) {
  const errors=[];
  const require=(ok,message)=>{if(!ok)errors.push(message);};
  require(Object.entries(preparedCredentialTarget).every(([k,v])=>target?.[k]===v),'Use only the assigned staging site, project and origin.');
  if(!Array.isArray(siteVariables)||!Array.isArray(teamVariables))throw Error('Complete site and team metadata is required.');
  require(teamVariables.length===0,'Review inherited team variables before continuing.');
  const publicSettings={APP_ENV:'staging',STAGING_MODE:'core-no-providers',APP_BASE_URL:preparedCredentialTarget.origin,
    NEXT_PUBLIC_SUPABASE_URL:`https://${preparedCredentialTarget.projectRef}.supabase.co`};
  const privateKeys=['SUPABASE_SERVICE_ROLE_KEY','PORTAL_TOKEN_ENCRYPTION_KEY','STAGING_GATE_KEY','STAGING_GATE_VERIFIER'];
  const expected=[...Object.keys(publicSettings),'NEXT_PUBLIC_SUPABASE_ANON_KEY',...privateKeys];
  const names=siteVariables.map(v=>v?.key);
  require(names.length===expected.length&&new Set(names).size===names.length&&names.every(k=>expected.includes(k)),
    'Require exactly the reviewed staging variables; reject missing, duplicate or additional keys.');
  const scopesMatch=(v,wanted)=>Array.isArray(v?.scopes)&&v.scopes.length===wanted.length&&[...v.scopes].sort().join(',')===[...wanted].sort().join(',');
  const contextMatch=(v,context)=>Array.isArray(v?.values)&&v.values.length===1&&v.values[0]?.context===context&&v.values[0].context_parameter==null;
  for(const [key,value]of Object.entries(publicSettings)){
    const v=siteVariables.find(v=>v?.key===key);
    require(v?.is_secret===false&&scopesMatch(v,['builds','functions','runtime','post_processing'])&&contextMatch(v,'all')&&v.values[0].value===value,
      'Preserve the reviewed public staging settings and scopes.');
  }
  const browserKey=siteVariables.find(v=>v?.key==='NEXT_PUBLIC_SUPABASE_ANON_KEY');
  require(browserKey?.is_secret===false&&scopesMatch(browserKey,['builds','functions','runtime','post_processing'])&&contextMatch(browserKey,'production')&&
    /^sb_publishable_[A-Za-z0-9_-]{10,}$/.test(browserKey.values[0].value??''),'Require a publishable browser key only in the dedicated staging production context.');
  for(const key of privateKeys){
    const v=siteVariables.find(v=>v?.key===key);
    // Free-plan secret scopes exclude post processing but cannot be narrowed
    // further. Do not fall back to readable variables or a dev-context value.
    require(v?.is_secret===true&&scopesMatch(v,['builds','functions','runtime'])&&contextMatch(v,'production'),
      'Require write-only staging secrets in the production context and the supported secret scopes.');
  }
  return {reviewVersion:1,metadataInstalled:errors.length===0,errors:[...new Set(errors)],
    privateVariableCount:privateKeys.filter(k=>names.includes(k)).length,
    secretValuesVerified:false,keyBindingVerified:false,runtimeObserved:false,visitorProtectionVerified:false,
    readyForHosting:false,networkRequests:0,changesApplied:false};
}
export function reviewEnvironmentSources(manifest, siteVariables, teamVariables) {
  if (!Array.isArray(siteVariables) || !Array.isArray(teamVariables)) throw Error('Complete site and team variable lists are required.');
  const metadata = [], findings = [];
  for (const [source,variables] of [['site',siteVariables],['team',teamVariables]]) {
    const seen = new Set();
    for (const v of variables) {
      if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(v.key??'') || seen.has(v.key) || !Array.isArray(v.scopes) || !v.scopes.length || !Array.isArray(v.values)) throw Error('Unsupported variable metadata.');
      seen.add(v.key);
      if (v.scopes.some(x=>!['all','builds','functions','runtime','post_processing'].includes(x))) findings.push('Unknown variable scopes need independent review.');
      const selectors = new Set();
      for (const value of v.values) {
        const selector = value.context + ':' + (value.context_parameter??'');
        if (selectors.has(selector)) throw Error('Ambiguous context values.');
        selectors.add(selector);
        if (!['all',...contexts].includes(value.context) || value.context_parameter != null) findings.push('Named or unknown context overrides require a separate review.');
      }
      metadata.push({source,key:v.key,scopes:[...v.scopes],secret:v.is_secret===true,contexts:v.values.map(x=>x.context)});
    }
  }
  const select = (variables,key,scope,context) => {
    const v = variables.find(v=>v.key===key&&(v.scopes.includes('all')||v.scopes.includes(scope)));
    if (!v) return null;
    return v.values.find(x=>x.context===context&&x.context_parameter==null)??v.values.find(x=>x.context==='all'&&x.context_parameter==null)??null;
  };
  const keys = [...new Set([...siteVariables,...teamVariables].map(v=>v.key))].sort();
  const cases = [];
  for (const context of contexts) for (const scope of scopes) {
    // SITE_ID is reserved. This is an expected-site projection, not runtime proof.
    const env = {SITE_ID:manifest?.staging?.netlifySiteId},unknownKeys=[];
    for (const key of keys) {
      const selected = select(siteVariables,key,scope,context)??select(teamVariables,key,scope,context);
      if (selected) {
        if (typeof selected.value !== 'string' || /^\*{3,}$/.test(selected.value) || /^\[?REDACTED\]?$/i.test(selected.value)) unknownKeys.push(key);
        else env[key]=selected.value;
      }
    }
    const report=checkStaging(manifest,env);
    cases.push({context,scope,configurationPasses:report.ready&&unknownKeys.length===0&&findings.length===0,unknownKeys,errors:report.errors});
  }
  return {reviewVersion:1,metadata,cases,findings:[...new Set(findings)],configurationComplete:cases.every(x=>x.configurationPasses),runtimeObserved:false,readyForHosting:false,networkRequests:0,changesApplied:false};
}
export function reviewAuthConfiguration(config, origin, projectRef) {
  const a=config?.data?.attributes?.auth;
  if (!a || typeof a!=='object') throw Error('Effective managed Auth configuration is required.');
  const templates=Object.entries(a).filter(([k])=>/^mailer_templates_.+_content$/.test(k));
  const required=['confirmation','email_change','invite','magic_link','reauthentication','recovery'];
  const templateSummary=templates.map(([key,value])=>({name:key.slice('mailer_templates_'.length,-'_content'.length),
    productionTarget:typeof value==='string'&&/angeltreeservices?\.org|ddvlnixdugcbnrewktes/i.test(value),
    literalUrl:typeof value==='string'&&/https?:\/\//i.test(value),usesConfirmationURL:typeof value==='string'&&value.includes('ConfirmationURL')}));
  const smtpFields=['smtp_host','smtp_user','smtp_pass','smtp_admin_email'];
  return {siteUrlMatchesStaging:a.site_url===origin,redirectAllowlistMatches:a.uri_allow_list===origin+'/update-password',
    publicSignupDisabled:a.disable_signup===true,emailProviderEnabled:a.external_email_enabled===true,
    otherProvidersDisabled:Object.entries(a).filter(([k])=>k.startsWith('external_')&&k.endsWith('_enabled')&&k!=='external_email_enabled').every(([,v])=>v===false),
    emailHookEnabled:a.hook_send_email_enabled===true,smtpConfigured:smtpFields.some(k=>nonempty(a[k])),
    templates:templateSummary,templateSetComplete:required.every(name=>templateSummary.some(t=>t.name===name)),
    // A configured SMTP/hook is not evidence of a controlled mailbox or delivery.
    authMailIsolationVerified:false,deliveryTested:false,projectRef,readyForHosting:false,changesApplied:false};
}
function main() {
  const args=process.argv.slice(2);
  if(args.length!==4||args[0]!=='--manifest'||args[2]!=='--evidence')throw Error('Use --manifest <file> --evidence <private JSON source lists>. Offline review only.');
  const manifest=JSON.parse(readFileSync(args[1],'utf8')),evidence=JSON.parse(readFileSync(args[3],'utf8'));
  console.log(JSON.stringify(reviewEnvironmentSources(manifest,evidence.siteVariables,evidence.teamVariables),null,2));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){try{main();}catch{console.error('Runtime-source review could not verify the inputs. No values or credentials are included in this error.');process.exitCode=1;}}
