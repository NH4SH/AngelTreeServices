// Exports reviewed working source only. No credential discovery, linking, provider
// calls, builds or deployments. Existing destinations and source symlinks fail.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync,lstatSync,mkdirSync,readFileSync,writeFileSync,chmodSync} from 'node:fs';
import {dirname,isAbsolute,join,relative,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {FIREWOOD_STAGING} from '../../src/lib/firewood/handoff/staging-profile.mjs';
const repo=fileURLToPath(new URL('../../../../',import.meta.url));
const digest=b=>createHash('sha256').update(b).digest('hex');
const git=(root,...args)=>execFileSync('git',args,{cwd:root,maxBuffer:128*1024*1024});
const blocked=/(?:^|\/)(?:\.env[^/]*|\.netlify|\.git|node_modules|\.next|\.turbo|coverage)(?:\/|$)|(?:\.private\.|\.(?:pem|key|p12|pfx|dump|backup|sqlite3?|log)$)/i;
const extra=/^(?:apps\/platform\/(?:FIREWOOD[^/]*\.md|scripts\/verification\/|src\/app\/api\/integrations\/firewood\/|src\/components\/portal-payment-refresh\.tsx$|src\/lib\/documents\/terms\/firewood-handoff-test-[^/]+\.ts$|src\/lib\/firewood\/handoff\/|tests\/(?:ach-microdeposit-handoff|firewood-[^/]+|portal-payment-refresh)\.test\.mjs$|tests\/fixtures\/firewood-handoff-v2\.json$)|supabase\/staging\/firewood-v2\/)/;
export function allowedSource(path){return !blocked.test(path)&&!path.split('/').includes('..')&&!isAbsolute(path);}
export const stagingConfig=`[build]\n  command = "node scripts/release/staging-preflight.mjs --manifest staging/targets.json && node staging/access/check.mjs && npm run build"\n  publish = ".next"\n[build.environment]\n  NODE_VERSION = "22.23.4"\n  NETLIFY_NEXT_SKEW_PROTECTION = "true"\n[functions]\n  directory = "staging/no-schedules"\n  node_bundler = "esbuild"\n[[plugins]]\n  package = "@netlify/plugin-nextjs"\n[[plugins]]\n  package = "./staging/access/netlify-plugin"\n`;
export const netlifyIgnore=`# Staging publication exclusions. Generated Next/adapter outputs remain eligible.\n.env*\n**/.env*\n**/*.private.*\n**/*.pem\n**/*.key\n**/*.p12\n**/*.pfx\n**/*.dump\n**/*.backup\n**/*.log\n.git/**\nSTAGING_EXPORT.json\nSTAGING_EXPORT_PROVENANCE.json\nSTAGING_BUILD_PREPARATION.md\ntests/**\nscripts/verification/**\n`;
export function assignedManifest(){return{mode:FIREWOOD_STAGING.mode,staging:{supabaseProjectRef:FIREWOOD_STAGING.projectRef,netlifySiteId:FIREWOOD_STAGING.siteId,appOrigin:FIREWOOD_STAGING.portalOrigin,scannerOrigin:'https://scanner-staging.angeltreeservices.org',scannerIsolationVerified:false,environmentIsolationVerified:false,runtimeKeyBindingVerified:false,authIsolationVerified:false,accessProtectionVerified:false,canonicalLinksSupported:false,backupRecoveryVerified:false,maintainerAssigned:false}};}
export function verifyExport(output){
 const root=resolve(output),p=JSON.parse(readFileSync(join(root,'STAGING_EXPORT_PROVENANCE.json'),'utf8'));
 assert.equal(p.kind,'private-staging-source-export');assert.equal(p.credentialsCopied,false);assert.equal(p.verificationFlagsPromoted,false);assert.equal(p.deployed,false);
 assert.equal(digest(Buffer.from(JSON.stringify(p.files))),p.sourceFilesSha256);assert.equal(digest(Buffer.from(JSON.stringify(p.overrides))),p.overrideSha256);
 const expected=new Map([...p.files,...p.overrides].map(f=>[f.path,f.sha256]));
 for(const [path,sha256]of expected){assert.ok(allowedSource(path));assert.ok(lstatSync(join(root,path)).isFile());assert.equal(digest(readFileSync(join(root,path))),sha256,'Export source/override changed after freezing.');}
 assert.equal(digest(readFileSync(join(root,'apps/platform/package-lock.json'))),p.packageLockSha256);
 return{sourceVerified:true,fileCount:expected.size,credentialsCopied:false,verificationFlagsPromoted:false,deployed:false};
}
export function exportSource({sourceRoot=repo,output}){
 assert.ok(isAbsolute(output),'An explicit absolute private output directory is required.');assert.ok(!existsSync(output),'Preserve existing exports; choose a new destination.');
 const target=resolve(output),root=resolve(sourceRoot);assert.ok(!target.startsWith(root+'/'),'Export outside the working repository.');
 const prefixes=['apps/platform','supabase/migrations','supabase/staging/firewood-v2'];
 const tracked=git(root,'ls-files','-z','--cached','--',...prefixes).toString().split('\0').filter(Boolean);
 const untracked=git(root,'ls-files','-z','--others','--exclude-standard','--',...prefixes).toString().split('\0').filter(Boolean);
 const excluded=tracked.filter(p=>!allowedSource(p));
 const selected=[...new Set([...tracked.filter(allowedSource),...untracked.filter(p=>allowedSource(p)&&extra.test(p))])].sort();assert.ok(selected.length>1000,'Expected the complete existing CRM source.');
 const sourceCommit=git(root,'rev-parse','HEAD').toString().trim(),sourceTree=git(root,'rev-parse','HEAD:apps/platform').toString().trim();
 mkdirSync(target,{recursive:true,mode:0o700});chmodSync(target,0o700);
 const files=[];for(const p of selected){const from=join(root,p),to=join(target,p);if(!existsSync(from))continue;assert.ok(lstatSync(from).isFile(),'Only regular reviewed source files may be exported.');const bytes=readFileSync(from);assert.ok(bytes.length<20*1024*1024,'Oversized source needs explicit review.');mkdirSync(dirname(to),{recursive:true,mode:0o700});writeFileSync(to,bytes,{mode:0o600});files.push({path:p,sha256:digest(bytes),tracked:tracked.includes(p)});}
 // Catch another task editing selected source while this snapshot is assembled.
 for(const f of files)assert.equal(digest(readFileSync(join(root,f.path))),f.sha256,'Source changed during export; preserve this copy and export a fresh one.');
 const app=join(target,'apps/platform'),overrides=[];
 function override(path,content){const data=Buffer.from(content);mkdirSync(dirname(join(app,path)),{recursive:true,mode:0o700});writeFileSync(join(app,path),data,{mode:0o600});overrides.push({path:'apps/platform/'+path,sha256:digest(data)});}
 override('netlify.toml',stagingConfig);override('staging/targets.json',JSON.stringify(assignedManifest(),null,2)+'\n');
 override('staging/no-schedules/README.md','No custom scheduled functions are selected for the isolated staging build. Existing worker sources remain preserved and unselected.\n');
 override('.gitignore','.netlify/\n.env*\n.next/\nnode_modules/\n*.log\n');
 const priorIgnore=join(root,'apps/platform/.netlifyignore');override('.netlifyignore',(existsSync(priorIgnore)?readFileSync(priorIgnore,'utf8')+'\n':'')+netlifyIgnore);
 const packageLock=readFileSync(join(app,'package-lock.json')),pkg=JSON.parse(readFileSync(join(app,'package.json'))),lock=JSON.parse(packageLock);
 for(const p of['next','react','react-dom'])assert.equal(pkg.dependencies[p],lock.packages['node_modules/'+p].version,'Declared/locked framework versions must match.');
 const provenance={kind:'private-staging-source-export',createdAt:new Date().toISOString(),sourceRoot:root,sourceCommit,sourceTree,worktreeOverlayIncluded:true,files,overrides,excludedTrackedPaths:excluded,excludedUntrackedCount:untracked.filter(p=>!selected.includes(p)).length,sourceFilesSha256:digest(Buffer.from(JSON.stringify(files))),overrideSha256:digest(Buffer.from(JSON.stringify(overrides))),packageLockSha256:digest(packageLock),frameworkVersions:Object.fromEntries(['next','react','react-dom'].map(p=>[p,pkg.dependencies[p]])),targetProfile:FIREWOOD_STAGING.mode,credentialsCopied:false,sourceActivationIncluded:false,scheduledFunctionsSelected:0,stagingAccessGateSelected:true,verificationFlagsPromoted:false,linked:false,built:false,deployed:false,productionReady:false};
 writeFileSync(join(target,'STAGING_EXPORT_PROVENANCE.json'),JSON.stringify(provenance,null,2)+'\n',{mode:0o600});
 return{directory:target,app,sourceCommit,fileCount:files.length,sourceFilesSha256:provenance.sourceFilesSha256,overrideSha256:provenance.overrideSha256,packageLockSha256:provenance.packageLockSha256,frameworkVersions:provenance.frameworkVersions,credentialsCopied:false,verificationFlagsPromoted:false,built:false,deployed:false};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){try{const args=process.argv.slice(2);assert.equal(args.length,2);assert.ok(['--output','--verify'].includes(args[0]));console.log(JSON.stringify(args[0]==='--verify'?verifyExport(args[1]):exportSource({output:args[1]}),null,2));}catch{console.error('Private staging source export refused an invalid, changed or existing destination. No credentials are included.');process.exitCode=1;}}
