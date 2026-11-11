import {tmpdir} from 'node:os';import test from 'node:test';import assert from 'node:assert/strict';import{readFile,writeFile,mkdir,mkdtemp}from'node:fs/promises';import{createHash}from'node:crypto';import{createRequire}from'node:module';import{resolve,dirname,relative,join}from'node:path';import{pathToFileURL,fileURLToPath}from'node:url';
const here=dirname(fileURLToPath(import.meta.url)),sourceRoot=resolve(here,'../..');
const require=createRequire(import.meta.url),ts=require('typescript');
const output=await mkdtemp(join(tmpdir(),'ats-firewood-collector-'));
const sha=b=>createHash('sha256').update(b).digest('hex'),pins=[],memo=new Map();
const empty=join(output,'server-only.mjs'),contextStub=join(output,'released-context.stub.mjs'),serverStub=join(output,'stripe-server.stub.mjs');
await writeFile(empty,'export {};\n');await writeFile(contextStub,"export function readReleasedContext(mode){return globalThis.ATS_COLLECTOR_TEST?.readContext(mode)??null;}\n");
await writeFile(serverStub,"export function getStripeClientKeyFingerprint(client){return globalThis.ATS_COLLECTOR_TEST?.clientFingerprints.get(client)??null;}\n");
async function compile(path){path=resolve(path);if(memo.has(path))return memo.get(path);const out=join(output,relative(sourceRoot,path).replace(/\.ts$/u,'.mjs'));memo.set(path,out);
 let bytes=await readFile(path),code=bytes.toString();pins.push({source:relative(sourceRoot,path),sha256:sha(bytes)});
 if(path.endsWith('.ts')){const result=ts.transpileModule(code,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,isolatedModules:true},reportDiagnostics:true});
 assert.ok(!result.diagnostics?.some(d=>d.category===ts.DiagnosticCategory.Error),'TypeScript syntax');code=result.outputText;}
 const matches=[...code.matchAll(/(?:\bfrom\s*|\bimport\s*)['"]([^'"]+)['"]/gu)];
 for(const match of matches){const spec=match[1];let target;if(spec==='server-only')target=empty;else if(spec==='@/lib/stripe/server')target=serverStub;
 else if(spec.includes('runtime-admission/released-context.mjs'))target=contextStub;else if(spec.startsWith('node:'))continue;
 else if(spec.startsWith('@/'))target=await compile(resolve(sourceRoot,'src',spec.slice(2))+'.ts');
 else if(spec.startsWith('.')){let candidate=resolve(dirname(path),spec);if(!/\.(?:mjs|ts)$/u.test(candidate))candidate+='.ts';target=await compile(candidate);}
 else throw Error('Unexpected runtime dependency in isolated harness: '+spec);
 code=code.replace(match[0],match[0].replace(spec,pathToFileURL(target).href));}
 await mkdir(dirname(out),{recursive:true});await writeFile(out,code);return out;}
const policy=await import(pathToFileURL(await compile(join(sourceRoot,'src/lib/firewood/handoff/collector-policy.ts'))).href);
const card=await import(pathToFileURL(await compile(join(sourceRoot,'src/lib/stripe/card-payment.ts'))).href);
const ach=await import(pathToFileURL(await compile(join(sourceRoot,'src/lib/stripe/invoice-checkout.ts'))).href);
const admission=await import(pathToFileURL(await compile(join(sourceRoot,'src/lib/firewood/handoff/collector-admission.mjs'))).href);
const receipts=await import(pathToFileURL(await compile(join(sourceRoot,'src/lib/firewood/handoff/receipt-source-gate.mjs'))).href);
const contract=await import(pathToFileURL(await compile(join(sourceRoot,'src/lib/firewood/handoff/live-contract.mjs'))).href);
const invoiceId='00000000-0000-4000-8000-000000000010',orderId='00000000-0000-4000-8000-000000000020',customerId='00000000-0000-4000-8000-000000000030';
const invoice={id:invoiceId,invoice_number:'INV-FW-'+orderId.toUpperCase(),document_terms_version:contract.LIVE_TERMS_POLICY.version};
const syntheticKey=['rk', 'live', 'SYNTHETICFIXTUREONLY1'].join('_');
function released(mode='collection'){return{mode,modes:{status:true,collection:true,sending:true},contract:contract.LIVE_HANDOFF_CONTRACT,source:contract.LIVE_HANDOFF_SOURCE,environment:contract.LIVE_HANDOFF_ENVIRONMENT,
 account:contract.LIVE_ACCOUNT,portalOrigin:contract.LIVE_PORTAL_ORIGIN,websiteOrigin:contract.LIVE_WEBSITE_ORIGIN,termsHash:contract.LIVE_TERMS_HASH,paymentPolicyHash:contract.LIVE_PAYMENT_POLICY_HASH,
 namespace:'ats-home-continuous-aabbccddeeff',generation:4,bindingSha256:'a'.repeat(64),authorityPublicKeyFingerprint:'e'.repeat(64),installationOverlaySha256:'f'.repeat(64),schemaSha256:'b'.repeat(64),releaseSha256:'c'.repeat(64),stripeKeyFingerprint:sha(syntheticKey),
 signingKeyId:'synthetic-hmac-key',signingKeyFingerprint:'d'.repeat(64),systemIdentifier:'7701955335415689249',sourceBoot:'00000000-0000-4000-8000-000000000040',databaseBoot:'2026-10-30T01:24:05.648631+00:00',topologyFingerprint:'a'.repeat(32),timeline:1,expiresAtMs:Date.now()+120000,observedAtMs:Date.now()};}
function native(){return{managed:true,contract:contract.LIVE_HANDOFF_CONTRACT,source_id:contract.LIVE_HANDOFF_SOURCE,environment_id:contract.LIVE_HANDOFF_ENVIRONMENT,account_id:contract.LIVE_ACCOUNT,
 mode:'live',livemode:true,terms_hash:contract.LIVE_TERMS_HASH,payment_policy_hash:contract.LIVE_PAYMENT_POLICY_HASH,receipt_authority:'crm',surcharge_reporting:true,order_id:orderId,invoice_id:invoiceId,allowed:true,already_paid:false,review_required:false,sender_enabled:true};}
let seq=100;
function dbFixture(){const rows=[],writes=[],calls=[];const db={rows,writes,calls,source:native(),onWrite:null,failUpdate:null,
 rpc(name,args){calls.push({name,args});return{abortSignal:async()=>({data:structuredClone(db.source),error:null})};},from(table){assert.equal(table,'invoice_checkout_sessions');return new Query(db);}};return db;}
class Query{constructor(db){this.db=db;this.filters=[];this.action='select';this.returning=false;this.many=true;this.limitCount=Infinity;}
 select(){if(this.action!=='select')this.returning=true;return this;}eq(k,v){this.filters.push(r=>r[k]===v);return this;}is(k,v){return this.eq(k,v);}in(k,v){this.filters.push(r=>v.includes(r[k]));return this;}lte(k,v){this.filters.push(r=>r[k]!=null&&r[k]<=v);return this;}order(){return this;}limit(n){this.limitCount=n;return this;}
 insert(data){this.action='insert';this.data=data;return this;}update(data){this.action='update';this.data=data;return this;}maybeSingle(){this.many=false;return this.run();}single(){this.many=false;return this.run();}
 then(ok,bad){return this.run().then(ok,bad);}async run(){let selected=this.db.rows.filter(r=>this.filters.every(f=>f(r))).slice(0,this.limitCount);
 if(this.action==='insert'){const row={id:'00000000-0000-4000-8000-'+String(seq++).padStart(12,'0'),created_at:new Date().toISOString(),stripe_checkout_session_id:null,stripe_payment_intent_id:null,submitted_at:null,...this.data};this.db.rows.push(row);selected=[row];this.db.writes.push(structuredClone(this.data));await this.db.onWrite?.('insert',row,this.data);}
 if(this.action==='update'){this.db.writes.push(structuredClone(this.data));if(this.db.failUpdate?.(this.data))return{data:null,error:{code:'synthetic_write_failure'}};for(const row of selected){Object.assign(row,this.data);await this.db.onWrite?.('update',row,this.data);}}
 return{data:this.many?structuredClone(selected):structuredClone(selected[0]??null),error:null};}}
function stripeFixture(){const calls={intents:[],sessions:[],cancel:0,expire:0,reads:0};const stripe={calls,
 confirmationTokens:{retrieve:async id=>({id,livemode:true,payment_method_preview:{type:'card',card:{funding:'credit',country:'US',brand:'visa'}}})},
 paymentIntents:{create:async(params,options)=>{calls.intents.push({params,options});return{id:'pi_syntheticKnown',livemode:true,metadata:params.metadata,amount:params.amount,currency:params.currency,status:'requires_action',amount_received:0,client_secret:'pi_syntheticKnown_secret_syntheticOnly',amount_details:{surcharge:{amount:1800,status:'available',maximum_amount:1800}}};},retrieve:async()=>{calls.reads++;throw Error('Not configured in this fixture');},cancel:async()=>{calls.cancel++;throw Error('Unexpected mutation');}},
 checkout:{sessions:{create:async(params,options)=>{calls.sessions.push({params,options});return{id:'cs_live_syntheticKnown',mode:'payment',livemode:true,status:'open',payment_status:'unpaid',client_reference_id:invoiceId,metadata:params.metadata,amount_total:60000,currency:'usd',expires_at:Math.floor(Date.now()/1000)+1800,payment_intent:'pi_syntheticBank',url:'https://checkout.stripe.com/synthetic-only'};},retrieve:async()=>{calls.reads++;throw Error('Not configured in this fixture');},expire:async()=>{calls.expire++;throw Error('Unexpected mutation');}}}};
 globalThis.ATS_COLLECTOR_TEST.clientFingerprints.set(stripe,sha(syntheticKey));return stripe;}
function setup(){process.env.STRIPE_SECRET_KEY=syntheticKey;globalThis.ATS_COLLECTOR_TEST={held:false,clientFingerprints:new WeakMap(),readContext(mode){return this.held?null:released(mode);}};}
function setupLocal(){setup();let sequence=20;const state=globalThis.ATS_COLLECTOR_TEST;
 state.regressed=false;state.readContext=function(mode){if(this.held)return null;const c=released(mode);delete c.authorityPublicKeyFingerprint;
  return{...c,namespace:'ats-home-primary-112233445566',generation:20,systemIdentifier:'7000000000000000001',
   admissionProtocol:'local-primary-operation-v1',primaryInstallationId:'b'.repeat(32),operationSequence:this.regressed?1:sequence++,
   operationObservedAtMs:c.observedAtMs-500,operationObservedBootMs:99500,operationAgeMs:500,observedMonotonicMs:100000,expiresAtMs:c.observedAtMs+13500};};}
async function minted(db){const result=await policy.getFirewoodCollectorPolicy(db,invoice,true);assert.equal(result.ok,true);return result.policy;}
const input=(db,stripe,fw)=>({supabase:db,stripe,firewoodPolicy:fw,livemode:true,invoiceId,invoiceNumber:invoice.invoice_number,invoicePrincipalCents:60000,amountCents:60000,customerId,organizationId:null,portalUrl:'https://admin.angeltreeservices.org/portal/invoice/synthetic',billingEmail:'synthetic@fixture.invalid',surchargeBps:300,surchargeEnabled:true});
async function reviewed(db,stripe,fw){const result=await card.createCardReview({...input(db,stripe,fw),confirmationTokenId:'ctoken_synthetic'});assert.equal(result.ok,true);return result.review.reviewId;}

test('live admission rejects missing gate, malformed invoice, wrong key/native account and caller-forged policies',async()=>{setup();const db=dbFixture();globalThis.ATS_COLLECTOR_TEST.held=true;assert.equal((await policy.getFirewoodCollectorPolicy(db,invoice,true)).ok,false);globalThis.ATS_COLLECTOR_TEST.held=false;
 for(const bad of[{...invoice,invoice_number:'INV-FW-bad'},{...invoice,document_terms_version:'legacy-2026-10-22'}])assert.equal((await policy.getFirewoodCollectorPolicy(db,bad,true)).ok,false);
 process.env.STRIPE_SECRET_KEY=['rk', 'live', 'SYNTHETICFIXTUREONLY2'].join('_');assert.equal((await policy.getFirewoodCollectorPolicy(db,invoice,true)).ok,false);process.env.STRIPE_SECRET_KEY=syntheticKey;
 db.source.account_id='acct_wrong';assert.equal((await policy.getFirewoodCollectorPolicy(db,invoice,true)).ok,false);db.source=native();const fw=await minted(db),stripe=stripeFixture();
 assert.equal(await policy.revalidateFirewoodCollection({...input(db,stripe,{...fw}),policy:{...fw},db,invoiceId}),false);
 globalThis.ATS_COLLECTOR_TEST.clientFingerprints.set(stripe,'f'.repeat(64));assert.equal(await policy.revalidateFirewoodCollection({policy:fw,db,invoiceId,invoiceNumber:invoice.invoice_number,livemode:true,stripe}),false);
});
test('valid card review/confirm uses exact3percent US credit, dedicated fee, unchanged preview version and no second Stripe receipt',async()=>{setup();const db=dbFixture(),fw=await minted(db),stripe=stripeFixture(),reviewId=await reviewed(db,stripe,fw);
 const result=await card.confirmCardReview({...input(db,stripe,fw),reviewId});assert.equal(result.ok,true);assert.equal(stripe.calls.intents.length,1);const call=stripe.calls.intents[0];
 assert.equal(call.params.amount,61800);assert.equal(call.params.amount_details.surcharge.amount,1800);assert.deepEqual(call.params.allowed_payment_method_types,['card']);assert.equal('receipt_email'in call.params,false);assert.equal(call.options.apiVersion,'2026-03-25.preview');assert.equal(call.options.maxNetworkRetries,0);assert.equal(call.options.timeout,8000);
 assert.equal(db.rows[0].stripe_payment_intent_id,'pi_syntheticKnown');assert.equal(db.rows[0].status,'processing');
});
test('admission loss after card submission claim makeszero provider calls and retains creating guard',async()=>{setup();const db=dbFixture(),fw=await minted(db),stripe=stripeFixture(),reviewId=await reviewed(db,stripe,fw);
 db.onWrite=async(kind,row,data)=>{if(data.status==='creating')globalThis.ATS_COLLECTOR_TEST.held=true;};const result=await card.confirmCardReview({...input(db,stripe,fw),reviewId});assert.equal(result.ok,false);assert.equal(stripe.calls.intents.length,0);assert.equal(db.rows[0].status,'creating');
 globalThis.ATS_COLLECTOR_TEST.held=false;assert.equal((await card.confirmCardReview({...input(db,stripe,fw),reviewId})).ok,false);assert.equal(stripe.calls.intents.length,0);
});
test('bad live intent binding and surcharge maximum retainknown providerID and prohibit second charge',async()=>{for(const bad of['binding','maximum']){setup();const db=dbFixture(),fw=await minted(db),stripe=stripeFixture(),reviewId=await reviewed(db,stripe,fw);const real=stripe.paymentIntents.create;
 stripe.paymentIntents.create=async(...args)=>{const value=await real(...args);if(bad==='binding')value.metadata={...value.metadata,invoice_id:'wrong'};else value.amount_details.surcharge.maximum_amount=1799;return value;};
 assert.equal((await card.confirmCardReview({...input(db,stripe,fw),reviewId})).ok,false);assert.equal(db.rows[0].stripe_payment_intent_id,'pi_syntheticKnown');assert.equal(db.rows[0].status,'creating');assert.equal(stripe.calls.intents.length,1);
 assert.equal((await card.confirmCardReview({...input(db,stripe,fw),reviewId})).ok,false);assert.equal(stripe.calls.intents.length,1);}});
test('live surcharge denies changed global configuration and never charges debit/prepaid/unknown/international fees',async()=>{setup();const db=dbFixture(),fw=await minted(db);assert.equal(policy.firewoodCardConfigurationMatches(fw,false,300),false);assert.equal(policy.firewoodCardConfigurationMatches(fw,true,250),false);
 for(const [funding,country]of[['debit','US'],['prepaid','US'],['unknown','US'],['credit','CA'],['credit',null]])assert.equal(policy.firewoodSurchargeFields(fw,0,{principalCents:60000,funding,country}),null);
 assert.throws(()=>policy.firewoodSurchargeFields(fw,1,{principalCents:60000,funding:'debit',country:'US'}));assert.throws(()=>policy.firewoodSurchargeFields(fw,1500,{principalCents:60000,funding:'credit',country:'US'}));
});
test('valid live ACH keeps reservationidempotency and Endive, no surcharge or receipt_email',async()=>{setup();const db=dbFixture(),fw=await minted(db),stripe=stripeFixture();const result=await ach.createOrReuseInvoiceCheckout(input(db,stripe,fw));assert.equal(result.ok,true);assert.equal(stripe.calls.sessions.length,1);
 const call=stripe.calls.sessions[0];assert.equal(call.options.apiVersion,'2026-09-30.endive');assert.equal(call.options.maxNetworkRetries,0);assert.equal(call.options.timeout,8000);assert.equal(call.options.idempotencyKey,'angel-tree-invoice-checkout-'+db.rows[0].id);assert.deepEqual(call.params.allowed_payment_method_types,['us_bank_account']);assert.match(call.params.integration_identifier,/^ats_firewood_live_v1_ach_[a-p]{8}$/u);assert.equal('receipt_email'in call.params,false);assert.equal(call.params.line_items[0].price_data.unit_amount,60000);
});
test('ACH admission loss after reservation makeszero remote creates and preservesguard',async()=>{setup();const db=dbFixture(),fw=await minted(db),stripe=stripeFixture();db.onWrite=async(kind)=>{if(kind==='insert')globalThis.ATS_COLLECTOR_TEST.held=true;};
 assert.equal((await ach.createOrReuseInvoiceCheckout(input(db,stripe,fw))).ok,false);assert.equal(stripe.calls.sessions.length,0);assert.equal(db.rows[0].status,'creating');
});
test('malformed live ACH response preserves knownsession/intent and never auto-creates another',async()=>{setup();const db=dbFixture(),fw=await minted(db),stripe=stripeFixture(),real=stripe.checkout.sessions.create;stripe.checkout.sessions.create=async(...args)=>({...await real(...args),amount_total:1});
 assert.equal((await ach.createOrReuseInvoiceCheckout(input(db,stripe,fw))).ok,false);assert.equal(db.rows[0].stripe_checkout_session_id,'cs_live_syntheticKnown');assert.equal(db.rows[0].stripe_payment_intent_id,'pi_syntheticBank');assert.equal(db.rows[0].status,'creating');
 assert.equal((await ach.createOrReuseInvoiceCheckout(input(db,stripe,fw))).ok,false);assert.equal(stripe.calls.sessions.length,1);
});
test('replacement lease hook rechecksnative source before actualremote expiry after read',async()=>{setup();const db=dbFixture(),fw=await minted(db),stripe=stripeFixture();const row={id:'00000000-0000-4000-8000-000000000099',invoice_id:invoiceId,customer_id:customerId,organization_id:null,status:'open',payment_channel:'ach',amount_cents:30000,invoice_principal_cents:30000,total_charge_cents:30000,currency:'usd',stripe_checkout_session_id:'cs_live_previous',stripe_payment_intent_id:null,submitted_at:null};db.rows.push(row);
 stripe.checkout.sessions.retrieve=async()=>{stripe.calls.reads++;db.source.allowed=false;return{id:row.stripe_checkout_session_id,mode:'payment',livemode:true,status:'open',payment_status:'unpaid',client_reference_id:invoiceId,metadata:{invoice_id:invoiceId,checkout_reservation_id:row.id,payment_channel:'ach'},amount_total:30000,currency:'usd',payment_intent:null};};
 assert.equal((await ach.createOrReuseInvoiceCheckout(input(db,stripe,fw))).ok,false);assert.equal(stripe.calls.expire,0);assert.equal(stripe.calls.sessions.length,0);assert.equal(db.rows[0].status,'open');
});
test('ordinary invoices and legacyv2 policy retain their existing ungated classification and fee behavior',async()=>{setup();globalThis.ATS_COLLECTOR_TEST.held=true;const db=dbFixture();const ordinary=await policy.getFirewoodCollectorPolicy(db,{id:invoiceId,invoice_number:'INV-ORDINARY',document_terms_version:'legacy-2026-10-22'},true);assert.deepEqual(ordinary,{ok:true,policy:null});
 const legacy={sourceId:'website_firewood_invoice_v2',orderId,accountId:'acct_1UU9U8RAZXGe6tX0',receiptAuthority:'crm',surchargeReporting:true};assert.deepEqual(policy.firewoodSurchargeFields(legacy,1800),{amount:1800,enforce_validation:'enabled'});assert.equal(policy.firewoodSurchargeFields(null,1800),null);
 const stripe=stripeFixture();assert.equal(await policy.revalidateFirewoodCollection({policy:legacy,db,invoiceId,invoiceNumber:'TEST-FW2-fixture',livemode:false,stripe}),true);assert.equal(await policy.revalidateFirewoodCollection({policy:null,db,invoiceId,invoiceNumber:'INV-FW-malformed',livemode:true,stripe}),false);
});
test('read-only receipt gate allows late receipt withcollectionoff, but needs sendingmode/sourceflag and nativepaymentbinding',async()=>{setup();const paymentId='00000000-0000-4000-8000-000000000055',deliveryId='00000000-0000-4000-8000-000000000066',context={email_type:'payment_confirmation',invoice_id:invoiceId,payment_id:paymentId};let enabled=true;let source={...native(),allowed:false,surcharge_reporting:false};
 const gate=receipts.createFirewoodReceiptSourceGate({readSendingContext:()=>{const c=released('sending');c.modes.collection=false;return enabled?c:null;},readPayment:async id=>({id,invoice_id:invoiceId,status:'succeeded'}),readInvoice:async()=>invoice,readCollectorContext:async()=>source});
 const before=await gate.beforeClaim(deliveryId,context);assert.equal(before.ok,true);assert.equal(before.managed,true);assert.equal((await gate.beforeTransport(deliveryId,context,before.ticket)).ok,true);
 source={...source,sender_enabled:false};assert.equal((await gate.beforeTransport(deliveryId,context,before.ticket)).ok,false);source={...source,sender_enabled:true};enabled=false;assert.equal((await gate.beforeClaim(deliveryId,context)).ok,false);
 assert.equal((await gate.beforeTransport(deliveryId,{...context,payment_id:'00000000-0000-4000-8000-000000000077'},before.ticket)).ok,false);
});
test('receipt helper performs norewrites or provider calls and preserves ordinary classification',async()=>{setup();let reads=0;const gate=receipts.createFirewoodReceiptSourceGate({readSendingContext:()=>null,readPayment:async id=>({id,invoice_id:invoiceId}),readInvoice:async()=>({...invoice,invoice_number:'INV-ORDINARY',document_terms_version:'legacy-2026-10-22'}),readCollectorContext:async()=>{reads++;throw Error('must not be called');}});
 const result=await gate.beforeClaim('00000000-0000-4000-8000-000000000066',{email_type:'payment_confirmation',payment_id:'00000000-0000-4000-8000-000000000055',invoice_id:invoiceId});assert.deepEqual(result,{ok:true,managed:false});assert.equal(reads,0);
});
test('live receipt payment status is rechecked while ordinary classification remains unchanged',async()=>{
 setup();const paymentId='00000000-0000-4000-8000-000000000055',deliveryId='00000000-0000-4000-8000-000000000066';
 let status='succeeded';const gate=receipts.createFirewoodReceiptSourceGate({readSendingContext:()=>released('sending'),
  readPayment:async id=>({id,invoice_id:invoiceId,status}),readInvoice:async()=>invoice,readCollectorContext:async()=>native()});
 const context={email_type:'payment_confirmation',invoice_id:invoiceId,payment_id:paymentId},before=await gate.beforeClaim(deliveryId,context);
 assert.equal(before.ok,true);assert.equal((await gate.beforeClaim(deliveryId,{...context,invoice_id:null})).ok,false);status='refunded';assert.equal((await gate.beforeTransport(deliveryId,context,before.ticket)).ok,false);
 const ordinary=receipts.createFirewoodReceiptSourceGate({readSendingContext:()=>null,readPayment:async id=>({id,invoice_id:invoiceId,status}),
  readInvoice:async()=>({...invoice,invoice_number:'INV-ORDINARY',document_terms_version:'legacy-2026-10-22'}),readCollectorContext:async()=>{throw Error('must not read source');}});
 assert.deepEqual(await ordinary.beforeClaim(deliveryId,context),{ok:true,managed:false});
});
await writeFile(join(output,'HARNESS_SOURCE_PINS.json'),JSON.stringify({purpose:'transpiled-candidate-source-tests-with-synthetic-gate-server-only-stubs',noProviders:true,noDatabase:true,pins},null,2)+'\n');

test('ordinary card and ACH provider parameters remain unchanged even whileFirewood admission isheld',async()=>{setup();globalThis.ATS_COLLECTOR_TEST.held=true;const db=dbFixture(),stripe=stripeFixture(),base={...input(db,stripe,null),invoiceNumber:'INV-ORDINARY'};
 const review=await card.createCardReview({...base,confirmationTokenId:'ctoken_synthetic'});assert.equal(review.ok,true);const result=await card.confirmCardReview({...base,reviewId:review.review.reviewId});assert.equal(result.ok,true);
 const call=stripe.calls.intents[0];assert.equal(call.params.receipt_email,'synthetic@fixture.invalid');assert.deepEqual(call.params.payment_method_types,['card']);assert.equal(call.options.apiVersion,undefined);assert.equal(call.options.maxNetworkRetries,undefined);assert.equal(call.params.amount_details.line_items.length,2);
 const bankDb=dbFixture(),bankStripe=stripeFixture();assert.equal((await ach.createOrReuseInvoiceCheckout({...input(bankDb,bankStripe,null),invoiceNumber:'INV-ORDINARY'})).ok,true);const bank=bankStripe.calls.sessions[0];assert.deepEqual(bank.params.payment_method_types,['us_bank_account']);assert.equal(bank.options.apiVersion,undefined);assert.equal(bank.options.maxNetworkRetries,undefined);
});
test('a live ACH local acknowledgement failure preserves returnedIDs without another provider call',async()=>{setup();const db=dbFixture(),fw=await minted(db),stripe=stripeFixture();db.failUpdate=data=>data.status==='open';
 assert.equal((await ach.createOrReuseInvoiceCheckout(input(db,stripe,fw))).ok,false);assert.equal(db.rows[0].status,'creating');assert.equal(db.rows[0].stripe_checkout_session_id,'cs_live_syntheticKnown');assert.equal(db.rows[0].stripe_payment_intent_id,'pi_syntheticBank');assert.equal(stripe.calls.sessions.length,1);
 assert.equal((await ach.createOrReuseInvoiceCheckout(input(db,stripe,fw))).ok,false);assert.equal(stripe.calls.sessions.length,1);
});
test('admission lost during native collector lookup cannot mint a policy',async()=>{setup();const db=dbFixture();db.rpc=(name,args)=>({abortSignal:async()=>{globalThis.ATS_COLLECTOR_TEST.held=true;return{data:native(),error:null};}});assert.equal((await policy.getFirewoodCollectorPolicy(db,invoice,true)).ok,false);});
test('stale card cleanup rechecks native admission after intentread before cancellation',async()=>{setup();const db=dbFixture(),fw=await minted(db),stripe=stripeFixture();const row={id:'00000000-0000-4000-8000-000000000088',invoice_id:invoiceId,customer_id:customerId,organization_id:null,status:'processing',payment_channel:'card',total_charge_cents:61800,currency:'usd',stripe_checkout_session_id:null,stripe_payment_intent_id:'pi_syntheticStale',submitted_at:new Date(Date.now()-3600000).toISOString(),processing_expires_at:new Date(Date.now()-100000).toISOString()};db.rows.push(row);
 stripe.paymentIntents.retrieve=async()=>{stripe.calls.reads++;db.source.allowed=false;return{id:row.stripe_payment_intent_id,livemode:true,metadata:{invoice_id:invoiceId,checkout_reservation_id:row.id,payment_channel:'card'},amount:61800,currency:'usd',amount_received:0,status:'requires_action'};};
 assert.equal((await card.releaseStaleCardReservations({...input(db,stripe,fw)})).ok,false);assert.equal(stripe.calls.cancel,0);assert.equal(db.rows[0].status,'processing');assert.equal(db.rows[0].stripe_payment_intent_id,'pi_syntheticStale');
});

test('collector stamps explicitly reject issuerkey or installationoverlay drift even with the samebindinghash',()=>{const a=released('collection');assert.equal(admission.isReleasedFirewoodMode(a,'collection',Date.now()),true);for(const key of['authorityPublicKeyFingerprint','installationOverlaySha256']){assert.equal(admission.sameCollectorRelease(a,{...a,[key]:'1'.repeat(64)}),false);assert.equal(admission.isReleasedFirewoodMode({...a,[key]:undefined},'collection',Date.now()),false);}});
test('local-primary card path preserves amounts, provider options and known intent without a second create',async()=>{
 setupLocal();const db=dbFixture(),fw=await minted(db),stripe=stripeFixture(),reviewId=await reviewed(db,stripe,fw);
 assert.equal((await card.confirmCardReview({...input(db,stripe,fw),reviewId})).ok,true);
 const call=stripe.calls.intents[0];assert.equal(stripe.calls.intents.length,1);assert.equal(call.params.amount,61800);
 assert.equal(call.params.amount_details.surcharge.amount,1800);assert.equal('receipt_email'in call.params,false);
 assert.equal(call.options.apiVersion,'2026-03-25.preview');assert.equal(call.options.maxNetworkRetries,0);assert.equal(call.options.timeout,8000);
 const known=db.rows[0].stripe_payment_intent_id;await card.confirmCardReview({...input(db,stripe,fw),reviewId});
 assert.equal(stripe.calls.intents.length,1);assert.equal(db.rows[0].stripe_payment_intent_id,known);
});
test('regressed local operation after actual card claim prevents provider create and preserves the same creating guard',async()=>{
 setupLocal();const db=dbFixture(),fw=await minted(db),stripe=stripeFixture(),reviewId=await reviewed(db,stripe,fw);
 db.onWrite=async(kind,row,data)=>{if(data.status==='creating')globalThis.ATS_COLLECTOR_TEST.regressed=true;};
 assert.equal((await card.confirmCardReview({...input(db,stripe,fw),reviewId})).ok,false);
 assert.equal(stripe.calls.intents.length,0);assert.equal(db.rows[0].status,'creating');
});
