import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { orderMailer } from './mailer.mjs';
const key = 're_' + 'x'.repeat(32), id = 'fw-order-v2-' + 'a'.repeat(64);
const message = { to: 'synthetic@checkout.invalid', replyTo: 'info@angeltreeservice.org', subject: 'Your firewood order FW-00000000', text: 'Synthetic order details.' };
test('controlled test delivery is fixed to the owner and has a distinct stable provider identity', async () => {
  const calls = [], providerId = randomUUID();
  const mailer = orderMailer({ mode: 'controlled-test', key, fetcher: async (...args) => { calls.push(args); return Response.json({ id: providerId }); } });
  assert.equal(await mailer.send(message,id,'customer_order'),providerId); await mailer.send(message,id,'customer_order');
  assert.equal(calls[0][0],'https://api.resend.com/emails'); assert.equal(calls[0][1].redirect,'error');
  assert.deepEqual(JSON.parse(calls[0][1].body).to,['info@angeltreeservice.org']); assert.match(JSON.parse(calls[0][1].body).subject,/^\[Firewood test\]/);
  assert.match(calls[0][1].headers['Idempotency-Key'],/^test-fw-order-v2-/);assert.equal(calls[0][1].body,calls[1][1].body);
  assert.equal(calls[0][1].headers['Idempotency-Key'],calls[1][1].headers['Idempotency-Key']);
});
test('live sending requires explicit customer and owner gates and retains the frozen recipient', async () => {
  for(const options of [{mode:'live',key},{mode:'live',key,customerSending:true},{mode:'test',key}]) assert.throws(()=>orderMailer(options));
  let payload; const mailer=orderMailer({mode:'live',key,customerSending:true,ownerSending:true,fetcher:async(url,options)=>{payload=JSON.parse(options.body);return Response.json({id:randomUUID()});}});
  await mailer.send(message,id,'customer_order');assert.deepEqual(payload.to,[message.to]);assert.ok(!payload.subject.startsWith('[Firewood test]'));
});
test('invented identity, owner destination, header injection and malformed messages cannot call the provider', async () => {
  const mailer=orderMailer({mode:'controlled-test',key,fetcher:()=>assert.fail('No provider request permitted')});
  for(const [value,identity,kind] of [[message,'changed','customer_order'],[message,id,'owner_order'],[{...message,subject:'Header\nInjection'},id,'customer_order'],[{...message,replyTo:'other@example.invalid'},id,'customer_order']])
    await assert.rejects(mailer.send(value,identity,kind),/frozen_order_message_required/);
});
test('unverified or oversized provider replies and failures reveal no credential or provider payload', async () => {
  for(const fetcher of [async()=>Response.json({id:'fake'}),async()=>new Response('x'.repeat(65537)),async()=>Response.json({error:'sensitive provider text'},{status:500}),async()=>{throw Error(key);}]) {
    const mailer=orderMailer({mode:'controlled-test',key,fetcher});
    await assert.rejects(mailer.send(message,id,'customer_order'),error=>/^order_confirmation_(pending|unverified)$/u.test(error.message));
  }
});
