import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateSourceManifest,assertMetadataStat,privateSecret,readReleaseDescriptor} from './integrity.mjs';
test('source manifests reject parent escape, absolute paths, unrelated scopes and missing digests',()=>{
  const good={'scripts/firewood-checkout/release/main.mjs':'a'.repeat(64),'public-firewood.json':'b'.repeat(64)};
  assert.ok(Object.isFrozen(validateSourceManifest(good)));
  for(const bad of [{},{'/absolute/file':'a'.repeat(64)},{'scripts/firewood-checkout/../secret':'a'.repeat(64)},{'other/file':'a'.repeat(64)},{'scripts/firewood-checkout/main.mjs':'changed'}])assert.throws(()=>validateSourceManifest(bad));
});
test('admission metadata must be root-owned, readonly, bounded regular files',()=>{
  const good={isFile:()=>true,isSymbolicLink:()=>false,uid:0,mode:0o100444,size:100};assertMetadataStat(good);
  for(const change of [{uid:501},{mode:0o100644},{isSymbolicLink:()=>true},{isFile:()=>false},{size:1048577}])assert.throws(()=>assertMetadataStat({...good,...change}));
});
test('arbitrary credential files and environment flags cannot substitute for mounted admission',async()=>{
  for(const path of ['/tmp/key','/run/secrets/../key','/run/secrets/.hidden','relative'])await assert.rejects(privateSecret(path),/mounted_private_credential_required/);
  const old=process.env.FIREWOOD_CUSTOMER_ENABLED;process.env.FIREWOOD_CUSTOMER_ENABLED='1';
  try{await assert.rejects(readReleaseDescriptor());}finally{if(old===undefined)delete process.env.FIREWOOD_CUSTOMER_ENABLED;else process.env.FIREWOOD_CUSTOMER_ENABLED=old;}
});
