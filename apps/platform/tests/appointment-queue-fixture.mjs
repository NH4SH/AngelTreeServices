import assert from 'node:assert/strict';
import * as crypto from 'node:crypto';
import {load} from './pr10-test-helpers.mjs';
import {callDeliveryCommand} from '../src/lib/email/delivery-commands.ts';
import {emailDeliveryContext} from '../src/lib/email/delivery-context.ts';
import {mapBounded, withDeadline} from '../src/lib/runtime/deadline.ts';

// Controlled PostgREST responses; real queue, worker and follow-up code, no transport.
export function appointmentQueueFixture(options = {}) {
  const kind = options.kind ?? 'schedule_event';
  const column = kind === 'schedule_event' ? 'schedule_event_id' : 'appointment_id';
  const sourceTable = kind === 'schedule_event' ? 'schedule_events' : 'appointments';
  const startsAt = new Date(Date.now() + 7 * 24 * 60 * 60_000).toISOString();
  const settings = {
    singleton:true, automated_sending_enabled:true, appointment_change_notices_enabled:false,
    estimate_confirmation_enabled:true, estimate_reminder_enabled:true, estimate_reminder_hours_before:24,
    work_confirmation_enabled:true, work_reminder_enabled:true, work_reminder_hours_before:24,
    quote_follow_up_enabled:false, invoice_reminder_enabled:false, payment_confirmation_enabled:false,
    updated_at:'2000-01-01T00:00:00.000Z', ...options.settings,
  };
  const job = {id:'synthetic-job', lead_disposition:'active', customers:{id:'synthetic-customer', email:'synthetic@example.invalid', status:'active'}, organizations:null};
  const source = {id:'10000000-0000-4000-8000-000000000001', job_id:job.id, event_type:'estimate', appointment_type:'estimate', status:'scheduled', starts_at:startsAt, created_at:new Date().toISOString(), jobs:job};
  const base = {[column]:source.id, source_version:'2035-01-14T14:00:00.000Z', status:'pending', communication_type:'estimate_reminder', scheduled_for:startsAt};
  const rows = [
    {id:'obsolete', ...base}, {id:'legacy', ...base, source_version:null},
    {id:'current', ...base, source_version:startsAt},
    ...['sent','processing','failed','cancelled'].map(status => ({id:status, ...base, status})),
    {id:'unrelated', ...base, [column]:'other-visit'},
  ];
  const tables = {communication_settings:[settings], schedule_events:[], appointments:[], customer_communications:rows};
  tables[sourceTable] = [source];
  if (options.tables) for (const [name, data] of Object.entries(options.tables)) tables[name] = structuredClone(data);
  let fault = options.fault, acks = 0, cleanupCalls = 0, paymentReads = 0, paymentWrites = 0, coverageReads = 0;
  const sourceReads = {}, sourceWrites = {};
  const calls = [], upserts = [];
  const delivery = {id:crypto.randomUUID(), state:'accepted', repair_state:'complete', history_recorded:true, provider_message_id:'synthetic-accepted', followup_sync_pending:true};
  const db = {
    rpc(name) {
      calls.push({rpc:name});
      if (name === 'claim_due_customer_communications') return {data:[], error:null};
      if (name === 'get_appointment_notice_coverage') {
        const filters=[],names=[];let cap=Infinity;
        const q={eq(k,v){names.push([k,v]);filters.push(r=>r[k]===v);return q;},gt(k,v){names.push([k,v]);filters.push(r=>r[k]>v);return q;},order(k){assert.equal(k,'source_id');return q;},limit(n){cap=n;return q;},abortSignal(s){assert.ok(s instanceof AbortSignal);return q;},then(resolve,reject){return execute().then(resolve,reject);}};
        async function execute(){
          coverageReads++;calls.push({coverageRead:coverageReads,filters:names,cap});
          options.onCoverageRead?.({read:coverageReads});
          let data=(options.coverage??[]).filter(r=>filters.every(f=>f(r))).sort((a,b)=>a.source_id.localeCompare(b.source_id)).slice(0,Math.min(cap,options.coverageRowCap??Infinity));
          const fault=options.coverageReadFault?.at===coverageReads?options.coverageReadFault.mode:null;
          if(fault==='throw')throw Error('PRIVATE_SYNTHETIC_COVERAGE');
          if(fault==='error')return{data:null,error:{message:'PRIVATE_SYNTHETIC_COVERAGE'}};
          if(fault==='null')data=null;
          if(fault==='repeat')data=[options.coverage[0]];
          if(fault==='reverse')data.reverse();
          if(fault==='invalid')data=[{source_kind:'schedule_event',source_id:'invalid'}];
          return{data,error:null};
        }
        return q;
      }
      if (name === 'get_outbound_delivery') return {data:structuredClone(delivery), error:null};
      if (name === 'acknowledge_outbound_followup') { acks++; delivery.followup_sync_pending = false; return {data:true, error:null}; }
      assert.fail('Unexpected RPC: ' + name);
    },
    from(table) {
      let operation = 'read', values, single = false, sort = null, cap = Infinity;
      const filters = [], filterNames = [];
      const filter = (name, predicate) => { filterNames.push(name); filters.push(predicate); return q; };
      const q = {
        select() { return q; },
        eq(k,v) { return filter([k,v], r => r[k] === v); },
        in(k,v) { return filter([k,v], r => v.includes(r[k])); },
        not(k,op,v) { assert.equal(op,'is'); assert.equal(v,null); return filter([k,'not-null'], r => r[k] != null); },
        gt(k,v) { return filter([k,v], r => r[k] > v); },
        gte(k,v) { return filter([k,v], r => r[k] >= v); },
        lte(k,v) { return filter([k,v], r => r[k] <= v); },
        order(k,o) { sort = {key:k,ascending:o?.ascending!==false}; return q; },
        limit(n) { cap = n; return q; },
        abortSignal(signal) { assert.ok(signal instanceof AbortSignal); return q; },
        or(value) {
          const expiryPrefix = 'expires_at.is.null,expires_at.gt.';
          if (value.startsWith(expiryPrefix)) return filter(['or',value], r => r.expires_at == null || Date.parse(r.expires_at) > Date.parse(value.slice(expiryPrefix.length)));
          const prefix = 'source_version.is.null,source_version.neq.';
          assert.ok(value.startsWith(prefix));
          return filter(['or',value], r => r.source_version == null || r.source_version !== value.slice(prefix.length));
        },
        update(v) { operation = 'update'; values = v; return q; },
        upsert(v, config) { assert.deepEqual(config,{ignoreDuplicates:true,onConflict:'idempotency_key'}); operation = 'upsert'; values = v; return q; },
        maybeSingle() { single = true; return execute(); },
        then(resolve,reject) { return execute().then(resolve,reject); },
      };
      async function execute() {
        calls.push({table,operation,filters:structuredClone(filterNames),...(sort?{sort,cap}:{}),...(operation==='upsert'?{batchSize:values.length}:{})});
        let targets = (tables[table] ?? []).filter(r => filters.every(f => f(r)));
        if (sort) targets.sort((a,b)=>String(a[sort.key]).localeCompare(String(b[sort.key]))*(sort.ascending?1:-1));
        const paymentRead = table === 'payments' && operation === 'read';
        const sourceRead = operation === 'read' && ['quotes','invoices','schedule_events','appointments'].includes(table);
        if (sourceRead) sourceReads[table]=(sourceReads[table]??0)+1;
        if (paymentRead) paymentReads++;
        targets = targets.slice(0,Math.min(cap,paymentRead?options.paymentRowCap??Infinity:options.sourceRowCaps?.[table]??Infinity));
        if (sourceRead && options.onSourceRead) options.onSourceRead({tables,table,read:sourceReads[table],targets});
        const sourceFault = sourceRead && options.sourceReadFault?.table===table && options.sourceReadFault.at===sourceReads[table] ? options.sourceReadFault.mode : null;
        if (sourceFault==='throw') throw Error('PRIVATE_SYNTHETIC_SOURCE_READ');
        if (sourceFault==='error') return {data:null,error:{message:'PRIVATE_SYNTHETIC_SOURCE_READ'}};
        if (sourceFault==='null') return {data:null,error:null};
        if (sourceFault==='repeat') targets=[tables[table][0]];
        if (sourceFault==='reverse') targets.reverse();
        if (sourceFault==='invalid') targets=[{id:'PRIVATE_SYNTHETIC_INVALID_ID'}];
        if (paymentRead && options.onPaymentRead) options.onPaymentRead({tables,read:paymentReads,targets});
        const readFault = paymentRead && options.paymentReadFault?.at === paymentReads ? options.paymentReadFault.mode : null;
        if (readFault === 'throw') throw Error('PRIVATE_SYNTHETIC_PAYMENT_READ');
        if (readFault === 'error') return {data:null,error:{message:'PRIVATE_SYNTHETIC_PAYMENT_READ'}};
        if (readFault === 'null') return {data:null,error:null};
        if (readFault === 'repeat') targets = [tables.payments[0]];
        if (readFault === 'invalid') targets = [{id:'PRIVATE_SYNTHETIC_INVALID_ID'}];
        if (readFault === 'reverse') targets.reverse();
        const cleanup = table === 'customer_communications' && operation === 'update';
        if (cleanup) cleanupCalls++;
        const failing = cleanup && fault && (!options.failCleanupAt || cleanupCalls === options.failCleanupAt);
        if (failing && ['error','throw'].includes(fault)) return fail();
        if (operation === 'update') targets.forEach(r => Object.assign(r,values));
        if (failing) return fail(); // Lost acknowledgement after a successful write.
        if (operation === 'upsert') {
          const family=values[0]?.quote_id?'quotes':values[0]?.invoice_id&&!values[0]?.payment_id?'invoices':values[0]?.schedule_event_id?'schedule_events':values[0]?.appointment_id?'appointments':null;
          if (family) sourceWrites[family]=(sourceWrites[family]??0)+1;
          const sourceWriteFault=family&&options.sourceUpsertFault?.table===family&&options.sourceUpsertFault.at===sourceWrites[family]?options.sourceUpsertFault.mode:null;
          if (sourceWriteFault==='throw') throw Error('PRIVATE_SYNTHETIC_SOURCE_WRITE');
          if (sourceWriteFault==='error') return {data:null,error:{message:'PRIVATE_SYNTHETIC_SOURCE_WRITE'}};
          const paymentWrite = values.some(r=>r.communication_type==='payment_confirmation');
          if (paymentWrite) paymentWrites++;
          const writeFault = paymentWrite && options.paymentUpsertFault?.at === paymentWrites ? options.paymentUpsertFault.mode : null;
          if (writeFault === 'throw') throw Error('PRIVATE_SYNTHETIC_PAYMENT_WRITE');
          if (writeFault === 'error') return {data:null,error:{message:'PRIVATE_SYNTHETIC_PAYMENT_WRITE'}};
          upserts.push(...structuredClone(values));
          for (const v of values) if (!tables[table].some(r => r.idempotency_key === v.idempotency_key)) tables[table].push({id:crypto.randomUUID(), status:'pending', ...structuredClone(v)});
          if (writeFault === 'lost') throw Error('PRIVATE_SYNTHETIC_PAYMENT_ACK');
          if (sourceWriteFault==='lost') throw Error('PRIVATE_SYNTHETIC_SOURCE_ACK');
        }
        return {data:structuredClone(single ? targets[0] ?? null : targets), error:null};
      }
      function fail() {
        if (['throw','lost-throw'].includes(fault)) throw Error('PRIVATE_SYNTHETIC_CLEANUP_DIAGNOSTIC');
        return {data:null, error:{code:'57014',message:'PRIVATE_SYNTHETIC_CLEANUP_DIAGNOSTIC'}};
      }
      return q;
    },
  };
  const queue = load(options.queueFile ?? '../src/lib/communications/queue.ts', {'server-only':{}});
  const forbidden = () => assert.fail('No provider or source-processing call is permitted');
  const processor = load('../src/lib/communications/processor.ts', {
    'server-only':{}, '@/lib/email/delivery-commands':{callDeliveryCommand}, '../quotes/proposal-number.ts':{formatProposalNumber:forbidden},
    '@/lib/payments/reconciliation':{getSuccessfulPaymentTotal:forbidden}, '@/lib/communications/portal-links':{getExistingCommunicationPortalUrl:forbidden},
    '@/lib/communications/queue':queue, '@/lib/communications/templates':{}, '@/lib/email/delivery-context':{emailDeliveryContext},
    '@/lib/email/send':{sendTransactionalEmail:forbidden}, '@/lib/supabase/admin':{getServiceRoleClient:forbidden},
    '@/lib/runtime/deadline':{mapBounded,withDeadline},
  });
  const durable = load('../src/lib/email/delivery.ts', {'server-only':{}, '@/lib/email/delivery-commands':{callDeliveryCommand}, 'node:crypto':crypto, '@/lib/email/delivery-context':{emailDeliveryContext}});
  const followups = load('../src/lib/email/delivery-followups.ts', {'server-only':{}, '@/lib/email/delivery-commands':{callDeliveryCommand}, '@/lib/communications/queue':queue, '@/lib/runtime/deadline':{withDeadline}, '@/lib/email/delivery':durable});
  return {
    db,tables,calls,upserts,column,sourceTable,delivery,
    get acks() { return acks; },
    setFault(value) { fault = value; },
    clearPaymentFaults() { options.paymentReadFault=null; options.paymentUpsertFault=null; },
    clearSourceFaults() { options.sourceReadFault=null; options.sourceUpsertFault=null; options.coverageReadFault=null; },
    run:() => queue.syncAutomatedCommunications(db),
    invoice:(id) => queue.syncInvoicePaymentCommunications(db,id),
    worker:() => processor.processDueCommunications(1,{db,send:forbidden}),
    followups:() => followups.completeDeliveryFollowups(db,delivery.id),
  };
}
