import assert from 'node:assert/strict';
import test from 'node:test';
import {appointmentQueueFixture} from './appointment-queue-fixture.mjs';

const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const settings={quote_follow_up_enabled:true,quote_first_follow_up_days:3,quote_second_follow_up_days:7,
  invoice_reminder_enabled:true,invoice_first_reminder_days:1,invoice_second_reminder_days:7};
const source=n=>({id:id(n),status:'sent',sent_at:new Date().toISOString(),expires_at:null,due_at:new Date().toISOString(),
  updated_at:new Date().toISOString(),automatic_follow_ups_enabled:true,automatic_reminders_enabled:true,balance_due_cents:10000,
  customers:{id:id(999999),email:'synthetic@example.invalid',status:'active'},organizations:null});
const fixture=(table,count=401,extra={})=>appointmentQueueFixture({settings:{...settings,quote_follow_up_enabled:table==='quotes',invoice_reminder_enabled:table==='invoices'},
  sourceRowCaps:{[table]:1000},tables:{schedule_events:[],[table]:Array.from({length:count},(_,i)=>source(i+1)),customer_communications:[]},...extra});

for(const table of ['quotes','invoices']){
  test(table+': all 1001 sources retain both stages beyond the API row cap',async()=>{
    const f=fixture(table,1001),before=structuredClone(f.tables[table]);assert.equal((await f.run()).error,null);
    assert.equal(f.upserts.length,2002);assert.deepEqual(f.tables[table],before);
    const reads=f.calls.filter(c=>c.table===table);assert.equal(reads.length,7);
    for(const r of reads){assert.equal(r.cap,200);assert.deepEqual(r.sort,{key:'id',ascending:true});}
    assert.ok(f.calls.filter(c=>c.operation==='upsert').every(c=>c.batchSize<=200));
    const saved=structuredClone(f.tables.customer_communications);await f.run();assert.deepEqual(f.tables.customer_communications,saved);
  });
  test(table+': short server-capped pages continue until an empty page',async()=>{
    const f=fixture(table,401,{sourceRowCaps:{[table]:7}});assert.equal((await f.run()).error,null);
    assert.equal(f.upserts.length,802);assert.equal(f.calls.filter(c=>c.table===table).length,59);
  });
  test(table+': later read failure or unusable data withholds all family writes',async()=>{
    for(const mode of ['error','throw','null','repeat','reverse','invalid']){
      const f=fixture(table,401,{sourceReadFault:{table,at:2,mode}}),r=await f.run();
      assert.ok(r.error);assert.equal(r.created,0);assert.equal(f.upserts.length,0);assert.doesNotMatch(r.error,/PRIVATE_SYNTHETIC/);
    }
  });
  test(table+': incomplete source reads prevent actual delivery-batch claims',async()=>{
    const f=fixture(table,401,{sourceReadFault:{table,at:2,mode:'error'}});assert.equal((await f.worker()).claimed,0);
    assert.equal(f.calls.some(c=>c.rpc==='claim_due_customer_communications'),false);
  });
  test(table+': accepted follow-up remains pending until complete preparation without resending',async()=>{
    const f=fixture(table,401,{sourceReadFault:{table,at:2,mode:'null'}}),saved=structuredClone(f.delivery);
    assert.equal((await f.followups()).sourceReconciled,false);assert.equal(f.acks,0);assert.deepEqual(f.delivery,saved);
    f.clearSourceFaults();assert.equal((await f.followups()).sourceReconciled,true);assert.equal(f.acks,1);assert.equal(f.upserts.length,802);
    await f.followups();assert.equal(f.acks,1);
  });
  test(table+': partial and lost write acknowledgements retain history and recover by the same keys',async()=>{
    for(const mode of ['error','throw','lost']){
      const f=fixture(table,401,{sourceUpsertFault:{table,at:2,mode}}),r=await f.run();
      assert.ok(r.error);assert.equal(r.created,200);assert.equal(f.tables.customer_communications.length,mode==='lost'?400:200);
      const saved=structuredClone(f.tables.customer_communications);f.clearSourceFaults();assert.equal((await f.run()).error,null);
      assert.equal(f.tables.customer_communications.length,802);for(const row of saved)assert.deepEqual(f.tables.customer_communications.find(r=>r.id===row.id),row);
    }
  });
  test(table+': failed writes cannot start new claims or acknowledge accepted recovery',async()=>{
    const f=fixture(table,401,{sourceUpsertFault:{table,at:2,mode:'lost'}});assert.equal((await f.worker()).claimed,0);
    assert.equal(f.calls.some(c=>c.rpc==='claim_due_customer_communications'),false);
    const g=fixture(table,401,{sourceUpsertFault:{table,at:2,mode:'error'}});assert.equal((await g.followups()).sourceReconciled,false);assert.equal(g.acks,0);
  });
  test(table+': deleting an earlier record cannot shift later records out of view',async()=>{
    const f=fixture(table,401,{onSourceRead({tables,read}){if(read===1)tables[table]=tables[table].filter(r=>r.id!==id(1));}});
    assert.equal((await f.run()).error,null);assert.equal(f.upserts.length,802);
    assert.ok(f.upserts.some(r=>r.quote_id===id(401)||r.invoice_id===id(401)));
  });
  test(table+': source-page budget expiry is visible without writes',async()=>{
    const now=Date.now;let elapsed=0;Date.now=()=>now()+elapsed;
    try{const f=fixture(table,401,{onSourceRead({read}){if(read===1)elapsed=6000;}});assert.ok((await f.run()).error);assert.equal(f.upserts.length,0);}
    finally{Date.now=now;}
  });
  test(table+': master and family OFF switches preserve existing behavior',async()=>{
    const f=fixture(table,401,{settings:{automated_sending_enabled:false,...settings}});assert.equal((await f.run()).error,null);assert.equal(f.calls.some(c=>c.table===table),false);
    const g=fixture(table,401,{settings:{quote_follow_up_enabled:false,invoice_reminder_enabled:false}});assert.equal((await g.run()).error,null);assert.equal(g.calls.some(c=>c.table===table),false);
  });
  test(table+': concurrent complete passes retain one row per stable stage key',async()=>{
    const f=fixture(table);const r=await Promise.all([f.run(),f.run()]);r.forEach(x=>assert.equal(x.error,null));assert.equal(f.tables.customer_communications.length,802);
  });
}

test('proposal timing, explicit expiry and selected organization contact remain authoritative',async()=>{
  const f=fixture('quotes',0);f.tables.quotes.push(source(1),{...source(2),expires_at:'2000-01-01T00:00:00Z'},
    {...source(3),automatic_follow_ups_enabled:false},{...source(4),status:'approved'},
    {...source(5),sent_at:'2000-01-01T00:00:00Z'},{...source(6),customers:null,organizations:{id:id(999998),billing_email:'billing@example.invalid',status:'active'},approval_contact:{email:'approval@example.invalid',is_active:true}});
  assert.equal((await f.run()).error,null);assert.deepEqual([...new Set(f.upserts.map(r=>r.quote_id))],[id(1),id(6)]);
  assert.equal(f.upserts[2].recipient_email,'approval@example.invalid');assert.equal(f.upserts[0].scheduled_for,new Date(Date.parse(f.tables.quotes[0].sent_at)+3*86400000).toISOString());
});
test('invoice status, positive balance, timing and billing contacts remain authoritative',async()=>{
  const f=fixture('invoices',0);f.tables.invoices.push(source(1),{...source(2),balance_due_cents:0},{...source(3),status:'void'},
    {...source(4),due_at:null},{...source(5),due_at:'2000-01-01T00:00:00Z'},{...source(6),automatic_reminders_enabled:false},
    {...source(7),customers:null,organizations:{id:id(999998),billing_email:'billing@example.invalid',status:'active'},accounts_payable_contact:{email:'ap@example.invalid',is_active:true}});
  assert.equal((await f.run()).error,null);assert.deepEqual([...new Set(f.upserts.map(r=>r.invoice_id))],[id(1),id(7)]);assert.equal(f.upserts[2].recipient_email,'ap@example.invalid');
  assert.equal(f.upserts[0].scheduled_for,new Date(Date.parse(f.tables.invoices[0].due_at)+86400000).toISOString());
});
test('invoice-scoped recovery retains its restriction on every page and ignores unrelated proposals and visits',async()=>{
  const f=fixture('invoices',401);assert.equal((await f.invoice(id(401))).error,null);assert.equal(f.upserts.length,2);
  for(const r of f.calls.filter(c=>c.table==='invoices'))assert.ok(r.filters.some(([k,v])=>k==='id'&&v===id(401)));
  assert.equal(f.calls.some(c=>['quotes','schedule_events','appointments'].includes(c.table)),false);
});
test('one failed family leaves independent preparation intact and withholds delivery claims',async()=>{
  const f=fixture('quotes',401,{settings,sourceReadFault:{table:'quotes',at:2,mode:'error'}});f.tables.invoices=[source(500)];
  assert.equal((await f.worker()).claimed,0);assert.equal(f.upserts.length,2);assert.equal(f.upserts[0].invoice_id,id(500));
});
