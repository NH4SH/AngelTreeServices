import {test} from 'node:test';
import assert from 'node:assert/strict';
import {approvedVerifierRuntime} from './verifier-runtime.mjs';
test('cloud verifier rejects the observed unpatched releases and unreviewed runtime families',()=>{
  for(const version of ['22.23.2','22.23.3','22.22.9','24.21.0','24.22.1','26.12.1','22.23.4-rc.1','v22.23.4','bad',undefined]){
    assert.equal(approvedVerifierRuntime(version,'linux','x64'),false,String(version));
  }
  for(const version of ['22.23.4','22.23.5','22.24.0'])assert.equal(approvedVerifierRuntime(version,'linux','x64'),true);
  assert.equal(approvedVerifierRuntime('22.23.4','darwin','x64'),false);
  assert.equal(approvedVerifierRuntime('22.23.4','linux','arm64'),false);
});
