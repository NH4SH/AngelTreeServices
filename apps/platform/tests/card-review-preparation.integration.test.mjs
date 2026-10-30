import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { writeFileSync } from 'node:fs';
import { load } from './pr10-test-helpers.mjs';
import * as closure from '../src/lib/payments/checkout-closure.ts';
import * as budget from '../src/lib/payments/checkout-budget.ts';
import * as policy from '../src/lib/payments/card-reservation-policy.ts';
import * as surcharge from '../src/lib/payments/card-surcharge.ts';
import { achCheckoutPaymentMethodTypes } from '../src/lib/payments/ach-checkout.ts';

const { createCardReview, confirmCardReview } = load('../src/lib/stripe/card-payment.ts', {'@/lib/firewood/handoff/collector-policy':load('../src/lib/firewood/handoff/collector-policy.ts',{'server-only':{}}),
  'server-only': {}, '@/lib/payments/checkout-closure': closure,
  '@/lib/payments/checkout-budget': budget, '@/lib/payments/card-reservation-policy': policy, '@/lib/payments/card-surcharge': surcharge,
});
const {createOrReuseInvoiceCheckout}=load('../src/lib/stripe/invoice-checkout.ts',{'server-only':{},
  '@/lib/payments/checkout-closure':closure,'@/lib/payments/ach-checkout':{achCheckoutPaymentMethodTypes}});
const enabled = process.env.CARD_REVIEW_DISPOSABLE === '1';
const literal = v => v === null ? 'null' : typeof v === 'number' ? String(v) : "'" + String(v).replaceAll("'", "''") + "'";
test('card review preparation with installed SQL and synthetic provider in one rollback', { skip: !enabled, timeout: 120000 }, async t => {
  assert.equal(process.env.DOCKER_HOST, 'unix:///Users/noelsierra/.lima/pr02-disposable/sock/docker.sock');
  assert.ok(process.env.CARD_REVIEW_DOCKER_BIN);
  const child = spawn(process.env.CARD_REVIEW_DOCKER_BIN, ['exec', '-i', 'supabase_db_ats_pr02_disposable',
    'psql', '-X', '-qAt', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], { env: process.env, stdio: ['pipe', 'pipe', 'pipe'] });
  const lines = createInterface({ input: child.stdout });
  let pending, diagnostic = '', exited = false;
  child.stderr.on('data', data => { diagnostic += data; });
  const closed = new Promise(resolve => child.once('close', code => {
    exited = true; pending?.reject(Error('Disposable SQL connection stopped: ' + diagnostic)); pending = undefined; resolve(code);
  }));
  child.once('error', error => { pending?.reject(error); pending = undefined; });
  lines.on('line', line => {
    if (!pending) return;
    if (line === pending.marker) { const current = pending; pending = undefined; current.resolve(current.output); }
    else pending.output.push(line);
  });
  async function query(sql) {
    assert.equal(pending, undefined); assert.equal(exited, false);
    const marker = 'DONE_' + randomUUID(); let timer;
    try { return await new Promise((resolve, reject) => {
      pending = { marker, output: [], resolve, reject };
      timer = setTimeout(() => { pending = undefined; child.stdin.end(); reject(Error('Disposable SQL command timed out')); }, 20000);
      child.stdin.write(sql + ';\nselect ' + literal(marker) + ';\n');
    }); } finally { clearTimeout(timer); }
  }
  const proof = [];
  try {
    await query(`begin;set local statement_timeout='10s';set local lock_timeout='3s';
      create function pg_temp.capture_json(statement text) returns jsonb language plpgsql as $$
      declare result jsonb;begin execute statement into result;return jsonb_build_object('data',result,'error',null);
      exception when others then return jsonb_build_object('data',null,'error',jsonb_build_object('code',sqlstate));end;$$`);



    const scenarios=[
      {name:'a prepared review is accepted by the actual confirmation helper',confirm:true},
      {name:'lost insert acknowledgement reuses the saved review',lost:true},
      {name:'transport failure after insertion reuses the saved review',throwAfterInsert:true},
      {name:'current same-token review is reused without insertion',existing:true},
      {name:'prior unpaid review is closed before replacement',prior:true},
      {name:'unconfirmed prior closure stops insertion until re-read',prior:true,lostClose:true},
      {name:'another processing attempt blocks replacement',prior:true,processing:true},
      {name:'changed fee policy cannot reuse an older preview',existing:true,changedFee:true},
      {name:'SQL rejects a stale invoice principal',staleAmount:true,denied:true},
      {name:'an owner void lease blocks review creation',lease:true,denied:true},
      {name:'a unique token conflict is recovered by same-token retry',uniqueRace:true},
      {name:'organization-only review and card confirmation preserve billing identity',organization:true,confirm:true},
      {name:'organization-only bank checkout is saved and reused',organization:true,bank:true},
    ];
    for(const c of scenarios)await t.test(c.name,async()=>{
      const customer=randomUUID(),organization=randomUUID(),invoice=randomUUID(),seedId=randomUUID(),actor=randomUUID();
      const token='ctoken_'+invoice.replaceAll('-',''),oldToken='ctoken_old'+invoice.replaceAll('-','');
      const customerId=c.organization?null:customer,organizationId=c.organization?organization:null;
      await query(`savepoint fixture;${c.organization?`insert into public.organizations(id,name)values('${organization}','REVIEW_ACK_${invoice}')`:
        `insert into public.customers(id,display_name)values('${customer}','REVIEW_ACK_${invoice}')`};
        insert into public.invoices(id,invoice_number,customer_id,organization_id,status,subtotal_cents,total_cents,balance_due_cents,sent_at)
        values('${invoice}','REVIEW_ACK_${invoice}',${literal(customerId)},${literal(organizationId)},'sent',1000,1000,1000,clock_timestamp())`);
      async function seed(reviewId,reviewToken,fee=30,status='open'){
        const result=await execute(`insert into public.invoice_checkout_sessions(id,invoice_id,customer_id,organization_id,amount_cents,invoice_principal_cents,surcharge_cents,total_charge_cents,
          payment_channel,currency,status,stripe_confirmation_token_id,card_brand,card_country,card_funding_type,reviewed_at,processing_expires_at)
          values('${reviewId}','${invoice}',${literal(customerId)},${literal(organizationId)},1000,1000,${fee},${1000+fee},'card','usd','${status}','${reviewToken}',
            'visa','US','credit',clock_timestamp()-interval '1 minute',clock_timestamp()+interval '15 minutes')returning to_jsonb(invoice_checkout_sessions)`);
        assert.equal(result.error,null);
      }
      const codes=[],provider=[],inserts=[];
      async function execute(command){
        const lines=await query(`set local role service_role;set local request.jwt.claims='{"role":"service_role"}';
          select 'RESULT:'||pg_temp.capture_json(${literal(command)})::text;reset role`);
        const result=JSON.parse(lines.find(line=>line.startsWith('RESULT:')).slice(7));if(result.error)codes.push(result.error.code);return result;
      }
      if(c.existing||c.prior)await seed(seedId,c.prior?oldToken:token,c.changedFee?0:30,c.processing?'processing':'open');
      if(c.lease)await query(`insert into auth.users(id,email,raw_user_meta_data)values('${actor}','${actor}@example.invalid','{}');
        insert into public.profiles(id,email,full_name,status)values('${actor}','${actor}@example.invalid','Synthetic void owner','active')
          on conflict(id)do update set status=excluded.status;
        insert into public.user_roles(user_id,role_id)select '${actor}',id from public.roles where name='owner';
        set local role authenticated;set local request.jwt.claims='{"role":"authenticated","sub":"${actor}"}';
        select public.begin_invoice_void('${invoice}');reset role`);
      let lost=Boolean(c.lost),thrown=Boolean(c.throwAfterInsert),lostClose=Boolean(c.lostClose),race=Boolean(c.uniqueRace);
      const db={from(table){assert.equal(table,'invoice_checkout_sessions');let columns='*',patch,inserted;const filters=[];
        const column=key=>{assert.match(key,/^[a-z_]+$/);return key;};
        const q={select(value){assert.match(value,/^[a-z_, ]+$/);columns=value;return q;},
          eq(key,value){filters.push(column(key)+'='+literal(value));return q;},
          is(key,value){assert.equal(value,null);filters.push(column(key)+' is null');return q;},
          in(key,values){filters.push(column(key)+' in ('+values.map(literal).join(',')+')');return q;},
          lte(key,value){filters.push(column(key)+'<='+literal(value));return q;},
          order(){return q;},limit(n){assert.equal(n,1);return q;},
          update(value){patch=value;return q;},insert(value){inserted=value;return q;},
          single(){return run(true);},maybeSingle(){return run(true);},then(resolve,reject){return run(false).then(resolve,reject);}};
        async function run(single){let command;
          if(inserted){inserts.push(inserted);if(race){race=false;await seed(seedId,token);}
            const values={id:randomUUID(),...inserted};command=`with changed as(insert into public.invoice_checkout_sessions(${Object.keys(values).map(column).join(',')})
              values(${Object.values(values).map(literal).join(',')})returning ${columns})select to_jsonb(s)from changed s`;
          }else if(patch)command=`with changed as(update public.invoice_checkout_sessions set ${Object.entries(patch).map(([key,value])=>column(key)+'='+literal(value)).join(',')}
            where ${filters.join(' and ')} returning ${columns})select to_jsonb(s)from changed s`;
          else command=`with selected as(select ${columns} from public.invoice_checkout_sessions where ${filters.join(' and ')})
            select ${single?'(select to_jsonb(s)from selected s)':"(select coalesce(jsonb_agg(to_jsonb(s)),'[]'::jsonb)from selected s)"}from(select 1)singleton`;
          const result=await execute(command);
          if(inserted&&result.error===null&&lost){lost=false;return{data:{},error:null};}
          if(inserted&&result.error===null&&thrown){thrown=false;throw Error('Synthetic response lost after insertion');}
          if(patch?.status==='cancelled'&&lostClose&&result.error===null){lostClose=false;return{data:{},error:null};}
          return result;
        }return q;}};
      let bankSession;
      const stripe={checkout:{sessions:{async create(params,request){provider.push('bank-create');assert.equal(c.bank,true);
          assert.equal(request.idempotencyKey,'angel-tree-invoice-checkout-'+params.metadata.checkout_reservation_id);
          assert.equal(params.metadata.organization_id,organization);assert.equal(params.metadata.customer_id,undefined);
          bankSession={id:'cs_'+invoice.replaceAll('-',''),mode:'payment',status:'open',payment_status:'unpaid',livemode:false,
            metadata:params.metadata,client_reference_id:invoice,amount_total:1000,currency:'usd',payment_intent:null,
            expires_at:Math.floor(Date.now()/1000)+3600,url:'https://checkout.example.invalid/'+invoice};return bankSession;},
        async retrieve(){provider.push('bank-retrieve');return bankSession;}}},
        confirmationTokens:{async retrieve(){provider.push('token');return{id:token,livemode:false,
        payment_method_preview:{type:'card',card:{brand:'visa',funding:'credit',country:'US'}}};}},
        paymentIntents:{async create(params,request){provider.push('confirm');assert.equal(c.confirm,true);
          assert.equal(request.idempotencyKey,'angel-tree-card-confirm-'+params.metadata.checkout_reservation_id);assert.equal(params.amount,1030);
          if(c.organization){assert.equal(params.metadata.organization_id,organization);assert.equal(params.metadata.customer_id,undefined);}
          const intentId='pi_'+invoice.replaceAll('-','');return{id:intentId,metadata:params.metadata,livemode:false,amount:1030,amount_received:0,
            currency:'usd',status:'requires_action',client_secret:intentId+'_secret_SYNTHETIC_ONLY'};}}};
      const input={invoiceId:invoice,customerId,organizationId,confirmationTokenId:token,invoicePrincipalCents:c.staleAmount?900:1000,
        stripe,supabase:db,livemode:false,surchargeBps:300,surchargeEnabled:true};
      const prepare=()=>c.bank?createOrReuseInvoiceCheckout({...input,amountCents:1000,invoiceNumber:'SYNTHETIC',
        portalUrl:'https://crm.example.invalid/portal/invoice/synthetic'}):createCardReview(input);
      const first=await prepare();
      const shouldPrepare=!c.lost&&!c.throwAfterInsert&&!c.lostClose&&!c.processing&&!c.changedFee&&!c.denied&&!c.uniqueRace;
      assert.equal(first.ok,shouldPrepare);if(!first.ok)assert.equal(first.review,undefined);
      const second=await prepare();assert.equal(second.ok,!c.processing&&!c.changedFee&&!c.denied);
      if(second.ok&&!c.bank){assert.match(second.review.reviewId,/^[0-9a-f-]{36}$/);assert.equal(second.review.grossChargeCents,1030);}
      if(c.bank){assert.equal(first.reused,false);assert.equal(second.reused,true);assert.equal(provider.filter(x=>x==='bank-create').length,1);}
      if(c.confirm){const result=await confirmCardReview({...input,reviewId:second.review.reviewId,billingEmail:null,invoiceNumber:'SYNTHETIC',
        portalUrl:'https://crm.example.invalid/portal/invoice/synthetic'});assert.equal(result.ok,true);assert.equal(result.status,'requires_action');}
      if(c.denied)assert.deepEqual(codes,['23514','23514']);else if(c.uniqueRace)assert.deepEqual(codes,['23505']);else assert.deepEqual(codes,[]);
      const output=await query(`select 'STATE:'||jsonb_build_object('invoice_status',i.status,'balance',i.balance_due_cents,
        'rows',(select count(*)from public.invoice_checkout_sessions where invoice_id=i.id),
        'open',(select count(*)from public.invoice_checkout_sessions where invoice_id=i.id and status='open'),
        'processing',(select count(*)from public.invoice_checkout_sessions where invoice_id=i.id and status='processing'),
        'cancelled',(select count(*)from public.invoice_checkout_sessions where invoice_id=i.id and status='cancelled'),
        'customer_id',(select customer_id from public.invoice_checkout_sessions where invoice_id=i.id limit 1),
        'organization_id',(select organization_id from public.invoice_checkout_sessions where invoice_id=i.id limit 1),
        'payments',(select count(*)from public.payments where invoice_id=i.id))::text from public.invoices i where id='${invoice}'`);
      const state=JSON.parse(output.find(line=>line.startsWith('STATE:')).slice(6));
      assert.equal(state.invoice_status,'sent');assert.equal(state.balance,1000);assert.equal(state.payments,0);
      assert.equal(state.rows,c.denied?0:c.prior&&!c.processing?2:1);
      if(c.organization){assert.equal(state.customer_id,null);assert.equal(state.organization_id,organization);}
      assert.equal(provider.filter(name=>name==='confirm').length,c.confirm?1:0);
      if(c.prior&&!c.processing){assert.equal(state.cancelled,1);assert.equal(state.open,1);}
      if(c.confirm||c.processing)assert.equal(state.processing,1);
      if(!c.denied)assert.equal(inserts.length,c.existing||c.processing?0:1);
      if(c.existing&&second.ok)assert.equal(second.review.reviewId,seedId);
      if(c.uniqueRace)assert.equal(second.review.reviewId,seedId);
      await query('rollback to savepoint fixture;release savepoint fixture');
      const absent=await query(`select 'ABSENT:'||((select count(*)from public.invoices where id='${invoice}')+
        (select count(*)from public.customers where id='${customer}')+(select count(*)from public.organizations where id='${organization}')+
        (select count(*)from auth.users where id='${actor}'))::text`);
      assert.ok(absent.includes('ABSENT:0'));proof.push({name:c.name,pass:true,fixturesRolledBack:true});
    });
    if(process.env.CARD_REVIEW_RESULTS_FILE)writeFileSync(process.env.CARD_REVIEW_RESULTS_FILE,
      JSON.stringify({proof,providerRequests:0,outerRollback:true,independentlyCommittedRecovery:false,concurrencyProof:false},null,2)+'\n');
  }finally{
    if(!exited){try{await query('rollback');}finally{child.stdin.end();}}
    await closed;lines.close();
  }
});
