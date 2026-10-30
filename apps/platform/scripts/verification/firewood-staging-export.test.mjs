import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {allowedSource,assignedManifest,exportSource,stagingConfig,netlifyIgnore} from './firewood-staging-export.mjs';
test('private export excludes credential material, generated state and path traversal',()=>{
 for(const path of ['apps/platform/.env','apps/platform/.env.example','apps/platform/.netlify/state.json','apps/platform/node_modules/a.js','apps/platform/.next/server.js','apps/platform/private.key','apps/platform/runtime.private.json','../outside','/absolute'])assert.equal(allowedSource(path),false,path);
 for(const path of ['apps/platform/src/lib/firewood/handoff/config.ts','supabase/staging/firewood-v2/candidate.json','apps/platform/.netlifyignore'])assert.equal(allowedSource(path),true,path);
});
test('private export assigns only reviewed targets and never promotes verification evidence',()=>{const m=assignedManifest();assert.equal(m.mode,'firewood-sandbox-v2');assert.equal(m.staging.supabaseProjectRef,'gbyhdsuiqeslgjdnbqng');assert.equal(m.staging.scannerOrigin,'https://scanner-staging.angeltreeservices.org');for(const value of Object.values(m.staging))if(typeof value==='boolean')assert.equal(value,false);});
test('staging build keeps no schedules and the gate-order plugin after the current unpinned Next adapter',()=>{assert.match(stagingConfig,/directory = "staging\/no-schedules"/);assert.ok(stagingConfig.indexOf('package = "@netlify/plugin-nextjs"')<stagingConfig.indexOf('package = ".\/staging\/access\/netlify-plugin"'));assert.match(stagingConfig,/staging-preflight/);assert.match(stagingConfig,/staging\/access\/check/);assert.doesNotMatch(stagingConfig,/netlify\/functions|schedule\s*=/);assert.match(netlifyIgnore,/\.env\*/);assert.doesNotMatch(netlifyIgnore,/^\.next|^\.netlify/m);});
test('an existing private export is preserved before any source reads or writes',()=>{const directory=mkdtempSync(join(tmpdir(),'ats-fw-export-guard-'));try{assert.throws(()=>exportSource({output:directory}),/Preserve existing exports/);}finally{rmSync(directory,{recursive:true});}});
