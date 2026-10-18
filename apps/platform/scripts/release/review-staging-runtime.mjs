// Offline review of Netlify configuration sources. No key lookup or remote writes.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { checkStaging } from '../../src/lib/security/staging-policy.mjs';

const nonempty = v => typeof v === 'string' && Boolean(v.trim());
const contexts = ['production','deploy-preview','branch-deploy','dev'];
const scopes = ['builds','functions','runtime'];
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
