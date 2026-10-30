// Pure operational policy only. No filesystem, environment, host, provider,
// database, login, kill, start, copy, credential or signing operation is exposed.
import {createHash} from 'node:crypto';
const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/u.test(v);
const canonical=v=>Array.isArray(v)?'['+v.map(canonical).join(',')+']':v&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}':JSON.stringify(v);
export const policySha256=v=>createHash('sha256').update(canonical(v)).digest('hex');
export const bytesSha256=v=>createHash('sha256').update(v).digest('hex');
const fail=m=>{throw Error('Firewood recovery policy rejected: '+m);};
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join('|')===[...keys].sort().join('|');
export const BACKEND_ROLES=freeze(['authenticator','supabase_auth_admin','supabase_storage_admin']);
export const PROFILE_ROLES=freeze({request:'ats_firewood_request',worker:'ats_firewood_worker',health:'ats_firewood_health'});
export const BASE_SERVICES=freeze(['db','app','api-gw','auth','rest','storage','imgproxy']);
export const NEW_SERVICES=freeze(['firewood-web','firewood-worker']);
export const ORDINARY_START=freeze(['auth','rest','imgproxy','storage','api-gw','app']);
export const NEW_TABLES=freeze([
 "app_private.firewood_live_cancellation_credits",
 "app_private.firewood_live_handoff_observations",
 "app_private.firewood_live_handoff_payment_events",
 "app_private.firewood_live_handoff_sources",
 "app_private.firewood_live_handoffs",
 "app_private.firewood_live_office_events",
 "app_private.firewood_live_office_receipts",
 "app_private.firewood_live_office_requests",
 "app_private.firewood_live_order_workflows",
 "app_private.firewood_live_price_approvals",
 "app_private.fwofficev2_confirmations",
 "app_private.fwofficev2_control",
 "app_private.fwofficev2_drafts",
 "app_private.fwofficev2_heartbeat",
 "app_private.fwofficev2_history",
 "app_private.fwofficev2_identity",
 "app_private.fwofficev2_observations",
 "app_private.fwofficev2_orders",
 "app_private.fwofficev2_outbox",
 "app_private.fwofficev2_prepare",
 "app_private.fwofficev2_price_history",
 "app_private.fwofficev2_price_queue",
 "app_private.fwofficev2_prices",
 "app_private.fwofficev2_rate",
 "app_private.fwofficev2_sessions"
]);
// Provenance of the repaired base, not authority for the operative fork. The
// approved three-span native-online edit has a distinct actual disk digest.
export const BASE_REPAIR_HELPERS=freeze({
 "native-online-candidate.mjs": "1567b2552dbf489a606777ecd4ed707acdcdbd3239bebdc82a028ac7a10cf031",
 "referenced-object-files.mjs": "34845ccf0925113bc865bbda5f818b30596306b72aed8da7d444b18fd113c43d",
 "bounded-file-archive.mjs": "8db69632720d9ce109680c084a13db7433c068197c39c760a55b5a0c04e575ef",
 "capture-attempt-lock.mjs": "5245e9a95d22c4cf713dbaaf2e5f6638f2bd061739ea0c021141b1c5282fd6fc"
});
// Retained export for older local review callers; never compared to live bytes.
export const FIXED_HELPERS=BASE_REPAIR_HELPERS;
export const UNBOUND_POLICY=freeze({kind:'ats-firewood-recovery-operational-policy-v1',version:1,state:'UNBOUND',
 sourceScope:'crm-v1',sourceMigrationCount:102,baseLedgerFullRowMd5:'630f8894ce3a5c50a947b8872ed8edf3',
 project:'ats_crm_primary_20261029',baselineTables:null,baselineCaptureTables:null,newTables:[...NEW_TABLES],operativeHelpers:null,
 semanticSchemaSha256:null,guardEnrollmentSha256:null,releaseComponentDigest:null,documentFamilySha256:null,
 roleNames:{...PROFILE_ROLES},newContainers:null,privateConfigurations:null,
 // The detached source-approval/registered binding carries the overlay digest.
 // Keeping it out of policy bytes avoids a policy/overlay self-hash cycle.
 privateMaterialIncludedInEncryptedPair:true,restoreStartsClosed:true});
const active=new WeakSet();
const tableName=v=>typeof v==='string'&&/^(?:public|app_private|auth|storage)\.[A-Za-z_][A-Za-z0-9_$]*$/u.test(v);
const captureTableName=v=>tableName(v)||typeof v==='string'&&/^supabase_migrations\.[A-Za-z_][A-Za-z0-9_$]*$/u.test(v);
function exactCaptureInventory(protectedTables,captureTables){
 return Array.isArray(captureTables)&&new Set(captureTables).size===captureTables.length
  &&captureTables.every(captureTableName)&&captureTables.includes('supabase_migrations.schema_migrations')
  &&canonical(captureTables.filter(tableName).sort())===canonical([...protectedTables].sort());
}
function operativeHelperApproval(helpers,expectedSha256){
 return exact(helpers,Object.keys(BASE_REPAIR_HELPERS))&&hash(expectedSha256)
  &&Object.values(helpers).every(hash)&&policySha256(helpers)===expectedSha256
  &&Object.entries(BASE_REPAIR_HELPERS).every(([name,digest])=>name==='native-online-candidate.mjs'||helpers[name]===digest);
}
const privateClasses=['website-environment','worker-environment','credential-version-map','capability-and-signing-material','runtime-configuration'];
export function bindRecoveryOperationalPolicy({expectedApproval,overlayBytes,policyBytes,bindingBytes,observed}){
 // Expected approval is supplied by root's independent fixed-path/publisher
 // boundary. A claimed/signed extra binding field cannot establish approval.
 if(!Buffer.isBuffer(overlayBytes)||!Buffer.isBuffer(policyBytes)||!expectedApproval||expectedApproval.kind!=='ats-approved-firewood-live25-overlay-v1'
  ||!hash(expectedApproval.installationOverlaySha256)||!hash(expectedApproval.operationalPolicySha256)
  ||bytesSha256(overlayBytes)!==expectedApproval.installationOverlaySha256||bytesSha256(policyBytes)!==expectedApproval.operationalPolicySha256)fail('independently approved overlay or policy digest');
 let overlay,p,binding;try{if(!Buffer.isBuffer(bindingBytes))fail('raw binding bytes required');overlay=JSON.parse(overlayBytes);p=JSON.parse(policyBytes);binding=JSON.parse(bindingBytes);}catch{fail('strict profile JSON');}
 const fields=['kind','version','state','sourceScope','sourceMigrationCount','baseLedgerFullRowMd5','project','baselineTables','baselineCaptureTables','newTables','operativeHelpers','semanticSchemaSha256','guardEnrollmentSha256','releaseComponentDigest','documentFamilySha256','roleNames','newContainers','privateConfigurations','privateMaterialIncludedInEncryptedPair','restoreStartsClosed'];
 if(!exact(p,fields)||p.kind!==UNBOUND_POLICY.kind||p.version!==1||p.state!=='reviewed-live25-policy'
  ||p.sourceScope!=='crm-v1'||p.sourceMigrationCount!==102||p.baseLedgerFullRowMd5!==UNBOUND_POLICY.baseLedgerFullRowMd5
  ||p.project!=='ats_crm_primary_20261029'||canonical(p.roleNames)!==canonical(PROFILE_ROLES)
  ||canonical(p.newTables)!==canonical(NEW_TABLES)||p.privateMaterialIncludedInEncryptedPair!==true||p.restoreStartsClosed!==true)fail('literal policy identity or unsupported extension');
 for(const key of['semanticSchemaSha256','guardEnrollmentSha256','releaseComponentDigest','documentFamilySha256'])if(!hash(p[key])||p[key]!==expectedApproval[key])fail('unbound component '+key);
 if(!Array.isArray(p.baselineTables)||p.baselineTables.length!==175||new Set(p.baselineTables).size!==175||!p.baselineTables.every(tableName)
  ||p.baselineTables.some(n=>NEW_TABLES.includes(n))||policySha256([...p.baselineTables].sort())!==expectedApproval.baselineInventorySha256)fail('exact unchanged baseline inventory');
 if(!exactCaptureInventory(p.baselineTables,p.baselineCaptureTables)||!hash(expectedApproval.baselineCaptureInventorySha256)
  ||policySha256([...p.baselineCaptureTables].sort())!==expectedApproval.baselineCaptureInventorySha256)fail('exact unchanged capture inventory including migration metadata');
 if(!operativeHelperApproval(p.operativeHelpers,expectedApproval.operativeHelpersSha256))fail('independently approved operative helper identity');
 if(overlay.kind!=='ats-firewood-live25-installation-overlay-v1'||overlay.operationalPolicySha256!==expectedApproval.operationalPolicySha256
  ||overlay.sourceScope!=='crm-v1'||overlay.sourceMigrationCount!==102||overlay.baseLedgerFullRowMd5!==p.baseLedgerFullRowMd5
  ||canonical(overlay.newTables)!==canonical(NEW_TABLES)||overlay.baselineCaptureInventorySha256!==expectedApproval.baselineCaptureInventorySha256
  ||overlay.operativeHelpersSha256!==expectedApproval.operativeHelpersSha256||overlay.semanticSchemaSha256!==p.semanticSchemaSha256
  ||overlay.guardEnrollmentSha256!==p.guardEnrollmentSha256||overlay.releaseComponentDigest!==p.releaseComponentDigest||overlay.documentFamilySha256!==p.documentFamilySha256)fail('immutable overlay components');
 if(!binding||binding.environment!=='home-primary-v1'||binding.sourceId!==p.project||binding.sourceScope!=='crm-v1'||binding.sourceMigrationCount!==102
  ||binding.installationOverlaySha256!==expectedApproval.installationOverlaySha256||!Number.isSafeInteger(binding.generation)||binding.generation<=3
  ||binding.namespace==='ats-home-continuous-7445a45dddd9'||!/^ats-home-continuous-[a-f0-9]{12}$/u.test(binding.namespace??'')
  ||!hash(expectedApproval.bindingSha256)||bytesSha256(bindingBytes)!==expectedApproval.bindingSha256)fail('exact registered expected binding');
 if(!observed||observed.sourceMigrationCount!==102||observed.fullLedgerMd5!==p.baseLedgerFullRowMd5
  ||observed.semanticSchemaSha256!==p.semanticSchemaSha256||observed.guardEnrollmentSha256!==p.guardEnrollmentSha256||observed.releaseComponentDigest!==p.releaseComponentDigest||observed.documentFamilySha256!==p.documentFamilySha256||canonical(observed.operativeHelpers)!==canonical(p.operativeHelpers)
  ||canonical([...observed.protectedTableNames??[]].sort())!==canonical([...p.baselineTables,...NEW_TABLES].sort())
  ||canonical([...observed.captureTableNames??[]].sort())!==canonical([...p.baselineCaptureTables,...NEW_TABLES].sort()))fail('actual catalog/enrollment/ledger identity');
 for(const name of Object.values(PROFILE_ROLES)){
  const role=observed.roles?.find(r=>r.name===name);if(!role||role.super!==false||role.bypassRls!==false||role.createRole!==false||role.createDb!==false||role.replication!==false||role.inherit!==false||typeof role.login!=='boolean'
   ||!Array.isArray(role.memberships)||role.memberships.length||name===PROFILE_ROLES.health&&role.login!==false)fail('profile role privilege or health login');
 }
 if(!exact(p.newContainers,NEW_SERVICES)||!exact(binding.containers,[...BASE_SERVICES,...NEW_SERVICES])||new Set(Object.values(binding.containers)).size!==9)fail('exact nine owned services');
 for(const service of NEW_SERVICES){const c=p.newContainers[service],seen=observed.containers?.[service];
  if(!exact(c,['id','image','configSha256','hostConfigSha256','uid','restartPolicy','project','service'])||!hash(c.id)||!/^sha256:[a-f0-9]{64}$/u.test(c.image??'')
   ||!hash(c.configSha256)||!hash(c.hostConfigSha256)||c.uid!==1000||c.restartPolicy!=='no'||c.project!==p.project||c.service!==service
   ||binding.containers[service]!==c.id||canonical(c)!==canonical(seen))fail('new owned service identity');
 }
 for(const service of BASE_SERVICES)if(!hash(binding.containers[service])||binding.containers[service]!==expectedApproval.baseContainers?.[service])fail('existing container identity');
 if(!Array.isArray(p.privateConfigurations)||p.privateConfigurations.length<privateClasses.length||p.privateConfigurations.length>16
  ||new Set(p.privateConfigurations.map(r=>r.name)).size!==p.privateConfigurations.length||new Set(p.privateConfigurations.map(r=>r.hostPath)).size!==p.privateConfigurations.length||p.privateConfigurations.some(r=>['app.private.env','core.private.env'].includes(r.name)))fail('bounded explicit private configuration set');
 for(const cls of privateClasses)if(!p.privateConfigurations.some(r=>r.class===cls))fail('missing private configuration class');
 for(const file of p.privateConfigurations){
  if(!exact(file,['name','class','hostPath','sha256','bytes','mode','version','ownerUid','regular','symlink'])||!privateClasses.includes(file.class)
   ||!/^[a-z][a-z0-9_.-]{0,79}\.private\.(?:env|json|key|bin)$/u.test(file.name??'')
   ||typeof file.hostPath!=='string'||!file.hostPath.startsWith('/home/noelsierra.guest/primary/')||file.hostPath.split('/').some(x=>x==='.'||x==='..')
   ||file.hostPath.includes('\\')||file.hostPath.includes('/admission-public/')||file.hostPath.includes('/recovery-approved/')||['/home/noelsierra.guest/primary/firewood-release-approval.json','/home/noelsierra.guest/primary/source-approval.private.json'].includes(file.hostPath)||/[\u0000-\u001f]/u.test(file.hostPath)||file.regular!==true||file.symlink!==false||!Number.isSafeInteger(file.ownerUid)||file.ownerUid<0||file.ownerUid>4294967295
   ||!hash(file.sha256)||!Number.isSafeInteger(file.bytes)||file.bytes<1||file.bytes>262144||file.mode!==0o600
   ||!/^v[1-9][0-9]{0,9}$/u.test(file.version??''))fail('private configuration path/version/permission');
  const before=observed.privateBefore?.find(r=>r.name===file.name),after=observed.privateAfter?.find(r=>r.name===file.name);
  if(!before||!after||canonical(before)!==canonical(file)||canonical(after)!==canonical(file))fail('private configuration changed across capture');
 }
 const result=freeze({policy:p,binding,bindingSha256:expectedApproval.bindingSha256,installationOverlaySha256:expectedApproval.installationOverlaySha256,operationalPolicySha256:expectedApproval.operationalPolicySha256});active.add(result);return result;
}
export function assertLegacySourceCompatibility({binding,observed,expectedLegacy}){
 if(!binding||Object.hasOwn(binding,'installationOverlaySha256')||binding.sourceScope!=='crm-v1'||binding.sourceMigrationCount!==102
  ||expectedLegacy?.kind!=='ats-approved-legacy-crm102-profile-v1'||!hash(expectedLegacy.baselineInventorySha256)
  ||!hash(expectedLegacy.semanticSchemaSha256)||!hash(expectedLegacy.releaseComponentDigest)
  ||observed?.sourceMigrationCount!==102||observed.fullLedgerMd5!==UNBOUND_POLICY.baseLedgerFullRowMd5
  ||!Array.isArray(observed.protectedTableNames)||observed.protectedTableNames.length!==175||new Set(observed.protectedTableNames).size!==175
  ||!observed.protectedTableNames.every(tableName)||observed.protectedTableNames.some(name=>NEW_TABLES.includes(name))
  ||policySha256([...observed.protectedTableNames].sort())!==expectedLegacy.baselineInventorySha256
  ||!exactCaptureInventory(observed.protectedTableNames,observed.captureTableNames)||!hash(expectedLegacy.baselineCaptureInventorySha256)
  ||policySha256([...observed.captureTableNames].sort())!==expectedLegacy.baselineCaptureInventorySha256
  ||observed.semanticSchemaSha256!==expectedLegacy.semanticSchemaSha256||observed.releaseComponentDigest!==expectedLegacy.releaseComponentDigest
  ||!Array.isArray(observed.serviceNames)||canonical([...observed.serviceNames].sort())!==canonical([...BASE_SERVICES].sort())
  ||!Array.isArray(observed.roleNames)||observed.roleNames.some(name=>Object.values(PROFILE_ROLES).includes(name))
  ||!operativeHelperApproval(observed.operativeHelpers,expectedLegacy.operativeHelpersSha256))fail('no legacy fallback for changed or unapproved source');
 return true;
}
export function legacyOperationPlan(){return freeze({rolesToClose:[...BACKEND_ROLES],rolesToRenew:[...BACKEND_ROLES],servicesToFence:[...BASE_SERVICES],servicesForOrdinaryStart:[...ORDINARY_START],servicesForProfileStart:[]});}
export function extensionOperationPlan(verified,readiness=null){
 if(!active.has(verified))fail('no independently validated policy');const {policy:p,binding:b}=verified;
 const matching=readiness?.kind==='ats-firewood-profile-service-readiness-v1'&&readiness.installationOverlaySha256===verified.installationOverlaySha256
  &&readiness.namespace===b.namespace&&readiness.generation===b.generation&&readiness.releaseComponentDigest===p.releaseComponentDigest
  &&readiness.bindingSha256===verified.bindingSha256&&readiness.modes?.status===true;
 const web=Boolean(matching&&readiness.web?.ready===true&&readiness.web.containerId===b.containers['firewood-web']);
 const worker=Boolean(matching&&readiness.worker?.ready===true&&readiness.worker.containerId===b.containers['firewood-worker']);
 return freeze({rolesToClose:[...BACKEND_ROLES,...Object.values(PROFILE_ROLES)],rolesToRenew:[...BACKEND_ROLES,...(web?[PROFILE_ROLES.request]:[]),...(worker?[PROFILE_ROLES.worker]:[])],
  healthAlwaysNoLogin:true,servicesToFence:[...BASE_SERVICES,...NEW_SERVICES],servicesForOrdinaryStart:[...ORDINARY_START],
  servicesForProfileStart:[...(web?['firewood-web']:[]),...(worker?['firewood-worker']:[])],
  privateConfigurationNames:p.privateConfigurations.map(f=>f.name),captureBarrierSchemas:['public','app_private','auth','storage','supabase_migrations'],
  sourceScope:'crm-v1',sourceMigrationCount:102,installationOverlaySha256:verified.installationOverlaySha256,
  // Operation modes still govern each request/send/collect. Pausing new orders
  // must not disable status or erase late reconciliation/provider evidence.
  pauseNewOrdersKeepsStatusAndReconciliation:true});
}
// No fixed-path approval/config reader or operator executor is installed here.
export function getInstalledRecoveryExtension(){return null;}

// The capability is minted only after independent expected-approval validation.
export function assertVerifiedRecoveryPolicy(value){if(!active.has(value))fail('unverified policy capability');return value;}
