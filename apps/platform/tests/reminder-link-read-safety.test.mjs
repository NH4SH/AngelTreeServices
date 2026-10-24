import assert from 'node:assert/strict';
import test from 'node:test';
import {reminderLinkReadFixture} from './reminder-link-read-fixture.mjs';

const types=['quote_follow_up','invoice_payment_reminder','overdue_invoice_reminder'];
const safeFailure='Delivery checks could not be completed safely. No email was sent.';
for(const type of types) {
  test(type+': token/source read errors remain failed for review without sending or automatic retry',async()=>{
    for(const linkFault of ['token-error','token-data-error','token-throw','source-error','source-data-error','source-throw']) {
      const f=reminderLinkReadFixture({type,linkFault}),r=await f.run();
      assert.equal(r.outcome,'not_sent');assert.equal(r.recorded,true);assert.equal(f.row.status,'failed');
      assert.equal(f.row.last_error,safeFailure);assert.equal(f.row.skip_reason,null);assert.equal(f.row.cancelled_at,null);
      assert.equal(f.sent.length,0);assert.equal(f.row.attempt_count,1);
      await f.run();assert.equal(f.sent.length,0);assert.equal(f.row.attempt_count,1);
      assert.doesNotMatch(JSON.stringify(r)+f.row.last_error,/PRIVATE_SYNTHETIC|token_hash|token_encrypted/);
    }
  });
  test(type+': absent, revoked, expired, wrong-party and unrecoverable links require review without creating a replacement',async()=>{
    for(const options of [
      {missingToken:true},{token:{revoked_at:new Date().toISOString()}},
      {token:{expires_at:new Date(Date.now()-60_000).toISOString()}},{token:{expires_at:'invalid'}},
      {token:{customer_id:'00000000-0000-4000-8000-000000000999'}},
      {token:{organization_id:'00000000-0000-4000-8000-000000000998'}},
      {token:{token_hash:'0'.repeat(64)}},{token:{token_encrypted:'invalid'}},{noKey:true},{noHost:true},
    ]) {
      const f=reminderLinkReadFixture({type,...options}),tokens=structuredClone(f.tables[f.tokenTable]);
      assert.equal((await f.run()).status,'failed');assert.equal(f.row.last_error,safeFailure);
      assert.equal(f.sent.length,0);assert.deepEqual(f.tables[f.tokenTable],tokens);
      assert.doesNotMatch(JSON.stringify(f.row),new RegExp(f.raw));
    }
  });
  test(type+': a result carrying an error cannot authorize sending even with a URL and token identity',async()=>{
    const f=reminderLinkReadFixture({type,portalOverride:{getExistingCommunicationPortalUrl:async()=>({
      error:'PRIVATE_SYNTHETIC_LINK_DIAGNOSTIC',url:'https://crm.example.invalid/portal/invoice/private-synthetic',
      tokenId:'00000000-0000-4000-8000-000000000001',
    })}});
    assert.equal((await f.run()).status,'failed');assert.equal(f.row.last_error,safeFailure);assert.equal(f.sent.length,0);
  });
  test(type+': healthy verified links retain their exact secure action, delivery identity and single acceptance',async()=>{
    const f=reminderLinkReadFixture({type}),token=f.tables[f.tokenTable][0];
    assert.equal((await f.run()).outcome,'accepted');assert.equal((await f.run()).outcome,'accepted');assert.equal(f.sent.length,1);
    const input=f.sent[0],url='https://crm.example.invalid/portal/'+f.kind+'/'+f.raw;
    assert.ok(input.text.includes(url));assert.ok(input.html.includes('href="'+url+'"'));
    assert.deepEqual(input.deliveryPortalTokens,[{kind:f.kind,id:token.id}]);
    assert.equal(input.idempotencyKey,'customer-communication/'+f.row.id);
    assert.equal(input.to,f.row.recipient_email);assert.equal(f.row.status,'sent');
  });
  test(type+': a lost failure write remains unrecorded under the original claim fence',async()=>{
    const f=reminderLinkReadFixture({type,linkFault:'token-error',zeroUpdate:true}),r=await f.run();
    assert.equal(r.outcome,'not_sent');assert.equal(r.recorded,false);assert.equal(f.row.status,'processing');
    await f.run();assert.equal(f.sent.length,0);assert.equal(f.row.attempt_count,1);
  });
  test(type+': uncertain delivery remains quarantined without another provider attempt',async()=>{
    const f=reminderLinkReadFixture({type,unknown:true});assert.equal((await f.run()).outcome,'unknown');
    assert.equal(f.row.status,'failed');await f.run();assert.equal(f.sent.length,1);
  });
}
test('automatic OFF holds and deliberately closed documents retain their original outcomes before link lookup',async()=>{
  for(const type of types) {
    const off=reminderLinkReadFixture({type,row:{is_automatic:true},missingToken:true});
    assert.equal((await off.run()).status,'pending');assert.equal(off.sent.length,0);assert.equal(off.linkReads.length,0);
    const f=reminderLinkReadFixture({type,missingToken:true});
    f.tables[f.kind==='quote'?'quotes':'invoices'][0].status=f.kind==='quote'?'approved':'paid';
    assert.equal((await f.run()).status,'cancelled');assert.equal(f.sent.length,0);assert.equal(f.linkReads.length,0);
  }
});
