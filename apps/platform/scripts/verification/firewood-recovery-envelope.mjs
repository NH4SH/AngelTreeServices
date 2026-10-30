// Authenticated transport for synthetic rehearsal evidence. Production retains
// its existing backup format, credential custody and independent verifier.
import fs from 'node:fs';import assert from 'node:assert/strict';import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';import {fileURLToPath} from 'node:url';
import {digest} from './firewood-recovery-capture.mjs';
const magic=Buffer.from('ATSFWREC1');
export function recoveryEnvelopeFiles(manifest){
  assert.ok(manifest.version===undefined||manifest.version===1||manifest.version===2);
  const names=['capture/database.dump','capture/manifest.private.json','capture/capability-key.private.json','capture/capture-proof.json','restore-proof.json','paired-proof.json'];
  if(manifest.version===2)names.push('capture/expected-context.private.json','fence-proof.json','deadline-proof.json');
  return names;
}
export function seal(bytes,key){assert.equal(key.length,32);const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',key,iv);c.setAAD(magic);const encrypted=Buffer.concat([c.update(bytes),c.final()]);return Buffer.concat([magic,iv,c.getAuthTag(),encrypted]);}
export function open(bytes,key){assert.equal(key.length,32);assert.ok(bytes.length>37);assert.ok(bytes.subarray(0,9).equals(magic));const d=createDecipheriv('aes-256-gcm',key,bytes.subarray(9,21));d.setAAD(magic);d.setAuthTag(bytes.subarray(21,37));return Buffer.concat([d.update(bytes.subarray(37)),d.final()]);}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  process.umask(0o077);assert.equal(process.env.ATS_FIREWOOD_RECOVERY,'1');
  const [mode,root]=process.argv.slice(2);assert.ok(['--seal','--verify'].includes(mode));
  if(mode==='--seal'){
    assert.equal(process.platform,'darwin');assert.ok(root.startsWith(process.env.HOME+'/.local/share/ats-firewood-v2-recovery-20261029-'));assert.match(root,/[a-f0-9]{12}$/);
    const manifest=JSON.parse(fs.readFileSync(root+'/capture/manifest.private.json')),proof=JSON.parse(fs.readFileSync(root+'/paired-proof.json'));assert.equal(manifest.pairId,proof.pair);assert.equal(manifest.syntheticOnly,true);
    const names=recoveryEnvelopeFiles(manifest);
    const files=Object.fromEntries(names.map(name=>[name,{sha256:digest(fs.readFileSync(root+'/'+name)),bytes:fs.readFileSync(root+'/'+name).toString('base64')}]));
    const bundle=Buffer.from(JSON.stringify({format:'ats-firewood-rehearsal-v1',pair:manifest.pairId,syntheticOnly:true,files}));
    const key=randomBytes(32);fs.writeFileSync(root+'/transport-key.private',key,{mode:0o600,flag:'wx'});const encrypted=seal(bundle,key);fs.writeFileSync(root+'/recovery.synthetic.enc',encrypted,{mode:0o600,flag:'wx'});
    const meta={pair:manifest.pairId,encryptedSha256:digest(encrypted),crmDumpSha256:files['capture/database.dump'].sha256,sourceManifestSha256:files['capture/manifest.private.json'].sha256,files:files?Object.keys(files).length:0,syntheticOnly:true,productionBackupFormatChanged:false};fs.writeFileSync(root+'/envelope-proof.json',JSON.stringify(meta,null,2),{mode:0o600});console.log(meta);
  }else{
    const meta=JSON.parse(fs.readFileSync(root+'/envelope-proof.json')),encrypted=fs.readFileSync(root+'/recovery.synthetic.enc'),key=fs.readFileSync(root+'/../keys/transport-key.private');assert.equal(digest(encrypted),meta.encryptedSha256);
    const bundle=JSON.parse(open(encrypted,key));assert.equal(bundle.syntheticOnly,true);assert.equal(bundle.pair,meta.pair);for(const f of Object.values(bundle.files))assert.equal(digest(Buffer.from(f.bytes,'base64')),f.sha256);
    const manifest=JSON.parse(Buffer.from(bundle.files['capture/manifest.private.json'].bytes,'base64'));assert.deepEqual(Object.keys(bundle.files),recoveryEnvelopeFiles(manifest));assert.equal(manifest.pairId,bundle.pair);
    if(manifest.version===2){
      assert.equal(bundle.files['capture/expected-context.private.json'].sha256,manifest.expectedContextSha256);
      const context=JSON.parse(Buffer.from(bundle.files['capture/expected-context.private.json'].bytes,'base64')),fence=JSON.parse(Buffer.from(bundle.files['fence-proof.json'].bytes,'base64')),deadline=JSON.parse(Buffer.from(bundle.files['deadline-proof.json'].bytes,'base64'));
      assert.equal(context.pairId,bundle.pair);assert.equal(fence.pair,bundle.pair);assert.equal(fence.passed,true);assert.equal(fence.cloneStopped,true);assert.equal(fence.expectedContextSha256,manifest.expectedContextSha256);assert.deepEqual(fence.expectedCounts,manifest.expectedCounts);assert.deepEqual(context.expected,manifest.expectedCounts);assert.deepEqual(fence.independentDeadline,deadline);assert.equal(deadline.passed,true);
    }
    assert.equal(bundle.files['capture/database.dump'].sha256,meta.crmDumpSha256);assert.equal(bundle.files['capture/manifest.private.json'].sha256,meta.sourceManifestSha256);
    const altered=Buffer.from(encrypted);altered[altered.length-1]^=1;assert.throws(()=>open(altered,key));assert.throws(()=>open(encrypted,randomBytes(32)));
    const proof={passed:true,pair:bundle.pair,offDeviceAuthenticated:true,allBundleHashesMatched:true,wrongKeyRejected:true,tamperingRejected:true,encryptedSha256:meta.encryptedSha256,crmDumpSha256:meta.crmDumpSha256,sourceManifestSha256:meta.sourceManifestSha256,syntheticOnly:true,productionKeyCustodyCertified:false,at:new Date().toISOString()};fs.writeFileSync(root+'/off-device-proof.json',JSON.stringify(proof,null,2),{mode:0o600});console.log(proof);
  }
}
