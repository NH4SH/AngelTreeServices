// Executes the actual TS module with a synthetic Stripe constructor. No provider
// client, actual environment, credentials, network or application DB is used.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { stripTypeScriptTypes } from 'node:module';
import { createHash } from 'node:crypto';
const source=fs.readFileSync(new URL('../../src/lib/stripe/server.ts',import.meta.url),'utf8');
const digest=value=>createHash('sha256').update(value,'utf8').digest('hex');
async function fixture({key,origin='https://admin.angeltreeservices.org'}={}) {
  const environment={STRIPE_SECRET_KEY:key},created=[];
  class StripeFixture {constructor(value){created.push(value);}}
  const context=vm.createContext({process:{env:environment},WeakMap,Error});
  const synth=values=>new vm.SyntheticModule(Object.keys(values),function(){for(const[k,v]of Object.entries(values))this.setExport(k,v);},{context});
  const modules={'server-only':synth({}),stripe:synth({default:StripeFixture}),
    'node:crypto':synth({createHash}),
    '@/lib/security/app-base-url':synth({getCanonicalAppBaseUrl:()=>origin})};
  const module=new vm.SourceTextModule(stripTypeScriptTypes(source),{context});
  await module.link(name=>{if(!Object.hasOwn(modules,name))throw Error('Unexpected module import');return modules[name];});
  await module.evaluate();return {api:module.namespace,environment,created};
}
test('no key or canonical origin constructs no client',async()=>{
  for(const options of [{},{key:'rk_live_SYNTHETIC_A',origin:null}]){
    const f=await fixture(options);assert.equal(f.api.getStripeServerConfig().configured,false);assert.equal(f.created.length,0);
  }
});
test('unchanged key reuses only the exact fingerprinted client',async()=>{
  const f=await fixture({key:'  rk_live_SYNTHETIC_A  '});
  const a=f.api.getStripeServerConfig(),b=f.api.getStripeServerConfig();
  assert.equal(a.configured,true);assert.equal(a.livemode,true);assert.equal(a.stripe,b.stripe);
  assert.equal(f.api.getStripeClientKeyFingerprint(a.stripe),digest('rk_live_SYNTHETIC_A'));
  assert.equal(f.api.getStripeClientKeyFingerprint({}),null);assert.deepEqual(f.created,['rk_live_SYNTHETIC_A']);
});
test('key change cannot authorize the old client or silently construct another',async()=>{
  const f=await fixture({key:'rk_live_SYNTHETIC_A'}),original=f.api.getStripeServerConfig();
  f.environment.STRIPE_SECRET_KEY='rk_live_SYNTHETIC_B';
  const changed=f.api.getStripeServerConfig();assert.equal(changed.configured,false);assert.equal(changed.stripe,null);
  assert.equal(f.created.length,1);assert.equal(f.api.getStripeClientKeyFingerprint(original.stripe),digest('rk_live_SYNTHETIC_A'));
  assert.notEqual(f.api.getStripeClientKeyFingerprint(original.stripe),digest(f.environment.STRIPE_SECRET_KEY));
});
test('test/live key switch is held rather than reusing a client in the wrong mode',async()=>{
  const f=await fixture({key:'rk_test_SYNTHETIC_A'}),original=f.api.getStripeServerConfig();assert.equal(original.livemode,false);
  f.environment.STRIPE_SECRET_KEY='rk_live_SYNTHETIC_A';assert.equal(f.api.getStripeServerConfig().configured,false);assert.equal(f.created.length,1);
});
test('restoring the exact original key permits the same original client only',async()=>{
  const f=await fixture({key:'rk_live_SYNTHETIC_A'}),original=f.api.getStripeServerConfig();
  f.environment.STRIPE_SECRET_KEY='rk_live_SYNTHETIC_B';assert.equal(f.api.getStripeServerConfig().configured,false);
  f.environment.STRIPE_SECRET_KEY='rk_live_SYNTHETIC_A';assert.equal(f.api.getStripeServerConfig().stripe,original.stripe);assert.equal(f.created.length,1);
});
