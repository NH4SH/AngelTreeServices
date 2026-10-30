// Not in the business mount/closure. No environment credential fallback.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {builtinModules} from 'node:module';
import {readRootFile} from './io.mjs';
import {createTestSdkCustodyCache} from './test-sdk-custody-core.mjs';
import {sha} from '../shared/protocol.mjs';
let cache;
function privateKey(){assert.equal(process.getuid?.(),0);return readRootFile('/run/acceptance-root-secrets/stripe_test_restricted',1024,{privateFile:true}).toString('utf8');}
export async function observePrivateSdkCustody(registration,approvedSdkSource){
 assert.equal(process.getuid?.(),0);assert.equal(process.platform,'linux');
 // Actual installed SDK bytes/version must be independently pinned by Root.
 // This exact module path is outside the Website and never chosen by a producer.
 const sdkRoot='/opt/acceptance-controller/node_modules/stripe',sdkPath=sdkRoot+'/esm/stripe.esm.node.js';assert.ok(Array.isArray(approvedSdkSource.files)&&approvedSdkSource.files.length>0&&approvedSdkSource.files.length<=512);const seen=new Set();for(const file of approvedSdkSource.files){assert.match(file.path,/^(?:esm\/[A-Za-z0-9_./-]+\.js|package\.json)$/);assert.ok(!file.path.split('/').some(x=>!x||x==='.'||x==='..')&&!seen.has(file.path));seen.add(file.path);const p=sdkRoot+'/'+file.path,st=fs.lstatSync(p);assert.ok(st.isFile()&&!st.isSymbolicLink()&&st.uid===0&&(st.mode&0o022)===0&&st.nlink===1);const bytes=fs.readFileSync(p);assert.equal(bytes.length,file.bytes);assert.equal(sha(bytes),file.sha256);}assert.ok(seen.has('esm/stripe.esm.node.js')&&seen.has('package.json'));const queue=['esm/stripe.esm.node.js'];const closed=new Set();while(queue.length){const p=queue.shift();if(closed.has(p))continue;assert.ok(seen.has(p),'Unpinned SDK import');closed.add(p);const source=fs.readFileSync(sdkRoot+'/'+p,'utf8');for(const match of source.matchAll(/(?:from\s*|import\s*\()\s*['"]([^'"]+)['"]/g)){if(!match[1].startsWith('.')){assert.ok(builtinModules.includes(match[1])||match[1].startsWith('node:')&&builtinModules.includes(match[1].slice(5)),'Unpinned external SDK dependency');continue;}const resolved=path.posix.normalize(path.posix.join(path.posix.dirname(p),match[1]));assert.ok(resolved.startsWith('esm/')&&resolved.endsWith('.js'));queue.push(resolved);}}
 if(!cache){const Stripe=(await import(sdkPath)).default;cache=createTestSdkCustodyCache({readPrivateKey:privateKey,constructSdk:key=>new Stripe(key)});}return cache.observe(registration.provider.testKeyFingerprint);
}
