import assert from "node:assert/strict";
import test from "node:test";
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { reviewInvoiceCheckout, voidInvoiceSafely } from "../src/lib/payments/invoice-void.ts";

const enabled = process.env.PR03_DISPOSABLE_STACK === "1" && Boolean(process.env.PR03_LOCAL_STATUS_FILE);
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
test("PR03 invoice financial boundary with real local Auth, RLS and concurrent transactions", { skip: !enabled, timeout: 240000 }, async t => {
  const c = JSON.parse(readFileSync(process.env.PR03_LOCAL_STATUS_FILE, "utf8"));
  assert.equal(c.API_URL, "http://127.0.0.1:54321");
  assert.match(process.env.DOCKER_HOST ?? "", /^unix:\/\//);
  const docker = process.env.PR03_DOCKER_BIN;
  assert.ok(docker);
  const base = ["exec", "-i", "supabase_db_ats_pr02_disposable", "psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"];
  function sql(source) {
    return new Promise((resolve, reject) => {
      const p = spawn(docker, base, { env: process.env }); let out = "", err = "";
      p.stdout.on("data", b => out += b); p.stderr.on("data", b => err += b);
      p.on("error", reject); p.on("exit", code => code === 0 ? resolve(out.trim()) : reject(new Error(err)));
      p.stdin.end(source);
    });
  }
  async function hold(source) {
    const p = spawn(docker, base, { env: process.env }); let err = "";
    p.stderr.on("data", b => err += b);
    const done = new Promise((resolve, reject) => { p.on("error", reject); p.on("exit", code => code === 0 ? resolve() : reject(new Error(err))); });
    const ready = new Promise((resolve, reject) => {
      p.stdout.on("data", b => { if (String(b).includes("PR03_LOCKED")) resolve(); });
      p.on("error", reject); p.on("exit", () => reject(new Error("Lock session exited before readiness: " + err)));
    });
    p.stdin.write(`begin; ${source}; select 'PR03_LOCKED';\n`);
    await ready;
    return async () => { p.stdin.end("commit;\n"); await done; };
  }
  const service = createClient(c.API_URL, c.SERVICE_ROLE_KEY, options);
  const anon = createClient(c.API_URL, c.ANON_KEY, options);
  const marker = randomBytes(5).toString("hex"), results = [];
  const check = (r, label = "request") => { assert.ifError(r.error && new Error(`${label}: ${r.error.message} [${r.error.code}]`)); return r.data; };
  const denied = (r, code) => { assert.ok(r.error, "Expected rejection"); if (code) assert.equal(r.error.code, code); };
  const client = jwt => createClient(c.API_URL, c.ANON_KEY, { ...options, global: { headers: { Authorization: `Bearer ${jwt}` } } });
  async function account(role, label = role) {
    check(await service.from("roles").upsert({ name: role }, { onConflict: "name" }));
    const password = randomBytes(24).toString("base64url");
    const u = check(await service.auth.admin.createUser({ email: `pr03-${label}-${marker}@example.invalid`, password, email_confirm: true })).user;
    check(await service.from("profiles").update({ status: "active" }).eq("id", u.id));
    const employee = check(await service.from("employee_records").insert({ auth_user_id: u.id, legal_name: `PR03 ${label} ${marker}`, employment_status: "active", is_active: true }).select("id").single());
    const rr = check(await service.from("roles").select("id").eq("name", role).single());
    check(await service.from("user_roles").insert({ user_id: u.id, role_id: rr.id }));
    const auth = createClient(c.API_URL, c.ANON_KEY, options);
    const session = check(await auth.auth.signInWithPassword({ email: u.email, password })).session;
    return { ...u, employeeId: employee.id, client: client(session.access_token), jwt: session.access_token };
  }
  const owner = await account("owner"), admin = await account("admin"), estimator = await account("estimator"), payroll = await account("payroll_admin");
  const customer = check(await service.from("customers").insert({ display_name: `PR03 disposable ${marker}`, email: `pr03-${marker}@example.invalid` }).select("id").single());
  async function invoice(changes = {}) {
    return check(await service.from("invoices").insert({ customer_id: customer.id, status: "sent", subtotal_cents: 1000, tax_cents: 0, total_cents: 1000, balance_due_cents: 1000, sent_at: new Date().toISOString(), ...changes }).select("*").single());
  }
  async function reservation(inv, status = "open", changes = {}) {
    return check(await service.from("invoice_checkout_sessions").insert({ invoice_id: inv.id, customer_id: customer.id, status, amount_cents: 1000, invoice_principal_cents: 1000, total_charge_cents: 1000, surcharge_cents: 0, currency: "usd", payment_channel: "ach", ...changes }).select("*").single());
  }
  async function payment(inv, status = "pending", changes = {}) {
    return check(await service.from("payments").insert({ invoice_id: inv.id, customer_id: customer.id, status, amount_cents: 1000, total_collected_cents: 1000, currency: "usd", payment_method: "ach", provider: "stripe", ...changes }).select("*").single());
  }

  const run = async (name, fn) => t.test(name, async () => { await fn(); results.push({ name, pass: true }); });
  const lines = (price = 1000, changes = {}) => [{ name: "Local test charge", quantity: 1, unit_price_cents: price, total_cents: price, ...changes }];
  async function draft(actor = owner, amount = 1000, header = {}, items = lines(amount)) {
    const created = check(await actor.client.rpc("create_invoice_draft", { p_header: { customer_id: customer.id, ...header }, p_lines: items }));
    return read(created.id);
  }
  async function read(id) { return check(await service.from("invoices").select("*,invoice_line_items(*)").eq("id", id).single()); }
  const save = (inv, items = lines(), actor = owner, extra = {}) => actor.client.rpc("save_invoice_details", {
    p_invoice_id: inv.id, p_expected_updated_at: inv.updated_at, p_due_at: inv.due_at, p_lines: items, ...extra,
  });
  const auditCount = async id => check(await service.from("activity_log").select("id").eq("subject_id",id).eq("event_type","invoice_updated")).length;
  const reconcile = (inv, actor = owner) => actor.client.rpc("reconcile_invoice_balance", { p_invoice_id: inv.id });
  const deliver = (inv, actor = owner, manual = true) => actor.client.rpc("record_invoice_delivery", { p_invoice_id: inv.id, p_manual: manual });

  await run("owners, admins, estimators and payroll keep draft creation/edit rights", async () => {
    for (const actor of [owner,admin,estimator,payroll]) {
      const inv = await draft(actor); assert.equal(inv.status,"draft"); assert.equal(inv.total_cents,1000);
      check(await save(inv,lines(1200),actor));
      assert.equal((await read(inv.id)).total_cents,1200);
    }
  });
  await run("draft creation ignores forged status, balance, IDs and line provenance", async () => {
    const inv = await draft(owner,1000,{ status:"paid", balance_due_cents:0, total_cents:1, paid_at:new Date().toISOString() },lines(1000,{ invoice_id:randomBytes(16).toString("hex"), source_change_order_line_item_id:owner.id }));
    assert.equal(inv.status,"draft"); assert.equal(inv.balance_due_cents,1000); assert.equal(inv.paid_at,null);
    assert.equal(inv.invoice_line_items[0].invoice_id,inv.id);
    assert.equal(inv.invoice_line_items[0].source_change_order_line_item_id,null);
  });
  await run("authenticated staff cannot directly forge invoice financial/source/delivery fields", async () => {
    const inv = await draft();
    for (const actor of [owner,admin,estimator,payroll]) {
      for (const patch of [{status:"paid"},{balance_due_cents:0},{paid_at:new Date().toISOString()},{total_cents:1},{subtotal_cents:1},{tax_cents:1},{customer_id:owner.id},{job_id:owner.id},{quote_id:owner.id},{sent_at:new Date().toISOString()}]) {
        denied(await actor.client.from("invoices").update(patch).eq("id",inv.id),"42501");
      }
      denied(await actor.client.from("invoices").insert({customer_id:customer.id,status:"paid"}),"42501");
      denied(await actor.client.from("invoice_line_items").insert({invoice_id:inv.id,name:"Bypass"}),"42501");
      denied(await actor.client.from("invoice_line_items").update({name:"Bypass"}).eq("invoice_id",inv.id),"42501");
      denied(await actor.client.from("invoice_line_items").delete().eq("invoice_id",inv.id),"42501");
    }
    assert.equal((await read(inv.id)).total_cents,1000);
  });
  await run("anonymous, customer, field and organization sessions cannot call staff commands", async () => {
    const inv = await draft();
    for (const actor of [{client:anon},await account("customer"),await account("crew"),await account("property_manager")]) {
      denied(await actor.client.rpc("create_invoice_draft",{p_header:{customer_id:customer.id},p_lines:lines()}),"42501");
      denied(await save(inv,lines(),actor),"42501"); denied(await reconcile(inv,actor),"42501"); denied(await deliver(inv,actor),"42501");
    }
    denied(await service.rpc("save_invoice_details",{p_invoice_id:inv.id,p_expected_updated_at:inv.updated_at,p_due_at:null,p_lines:lines()}),"42501");
  });
  await run("an already issued owner JWT loses all financial commands immediately after deactivation", async () => {
    const u = await account("owner","deactivated"); const inv = await draft(u);
    check(await service.from("employee_records").update({employment_status:"separated",is_active:false}).eq("id",u.employeeId));
    denied(await save(inv,lines(),u),"42501"); denied(await reconcile(inv,u),"42501"); denied(await deliver(inv,u),"42501");
    denied(await u.client.rpc("create_invoice_draft",{p_header:{customer_id:customer.id},p_lines:lines()}),"42501");
  });
  await run("an invalid line foreign key rolls the complete create back, including audit", async () => {
    const before = check(await service.from("invoices").select("id").eq("customer_id",customer.id)).length;
    denied(await owner.client.rpc("create_invoice_draft",{p_header:{customer_id:customer.id},p_lines:lines(1000,{service_category_id:owner.id})}),"23503");
    assert.equal(check(await service.from("invoices").select("id").eq("customer_id",customer.id)).length,before);
  });
  await run("line/header edits and audit roll back together after a later line fails", async () => {
    const inv = await draft(); const line = inv.invoice_line_items[0];
    const before = await auditCount(inv.id);
    denied(await save(inv,[{...lines(1200)[0],id:line.id},...lines(500,{service_category_id:owner.id})]),"23503");
    const after = await read(inv.id); assert.equal(after.total_cents,1000); assert.equal(after.invoice_line_items[0].total_cents,1000);
    assert.equal(after.invoice_line_items.length,1); assert.equal(after.updated_at,inv.updated_at); assert.equal(await auditCount(inv.id),before);
  });
  await run("foreign and repeated line IDs are rejected without changing either invoice", async () => {
    const inv = await draft(), other = await draft();
    denied(await save(inv,lines(1000,{id:other.invoice_line_items[0].id})),"23514");
    denied(await save(inv,[...lines(1000,{id:inv.invoice_line_items[0].id}),...lines(1000,{id:inv.invoice_line_items[0].id})]),"23514");
    assert.equal((await read(other.id)).invoice_line_items.length,1); assert.equal(await auditCount(inv.id),0);
  });
  await run("decimal quantities, cents rounding, zero prices and tax creation remain valid", async () => {
    const inv = await draft(owner,1000,{tax_cents:25},[{name:"Fractional",quantity:1.25,unit_price_cents:101,total_cents:126},{name:"Included",quantity:1,unit_price_cents:0,total_cents:0}]);
    assert.equal(inv.subtotal_cents,126); assert.equal(inv.total_cents,151); assert.equal(inv.balance_due_cents,151);
    const saved = check(await save(inv,[{...inv.invoice_line_items[0],id:inv.invoice_line_items[0].id}]));
    const updated = await read(inv.id); assert.equal(updated.tax_cents,0); assert.equal(updated.total_cents,126); assert.equal(saved.line_ids.length,1);
  });
  await run("invalid money/quantity and empty saves fail without partial writes", async () => {
    const inv = await draft();
    for (const items of [[],lines(1000,{quantity:0}),lines(1000,{quantity:1.001}),lines(1000,{total_cents:999}),lines(-1),lines(2147483647,{quantity:2,total_cents:4294967294})]) {
      denied(await save(inv,items));
    }
    assert.equal((await read(inv.id)).total_cents,1000); assert.equal(await auditCount(inv.id),0);
  });
  await run("a missing/stale form version cannot overwrite newer invoice changes", async () => {
    const inv = await draft(); denied(await save(inv,lines(),owner,{p_expected_updated_at:null}),"PT409");
    check(await save(inv,lines(1500))); denied(await save(inv,lines(2000)),"PT409");
    assert.equal((await read(inv.id)).total_cents,1500); assert.equal(await auditCount(inv.id),1);
  });
  await run("concurrent saves with one version produce one success and one conflict", async () => {
    const inv = await draft();
    const responses = await Promise.all([save(inv,lines(1500)),save(inv,lines(2000))]);
    assert.equal(responses.filter(r=>!r.error).length,1); assert.equal(responses.filter(r=>r.error?.code === "PT409").length,1);
    assert.equal(await auditCount(inv.id),1);
  });
  await run("a second save can use newly returned line IDs and version", async () => {
    const inv = await draft(); const saved = check(await save(inv,lines(1500)));
    const second = check(await save({...inv,updated_at:saved.updated_at},lines(1800,{id:saved.line_ids[0]})));
    assert.equal(second.line_ids[0],saved.line_ids[0]); assert.equal((await read(inv.id)).total_cents,1800);
  });
  await run("partial prepayments survive invoice editing and cannot be edited away", async () => {
    const inv = await draft();
    const payId = check(await owner.client.rpc("record_manual_invoice_payment_request",{p_request_id:randomUUID(),p_invoice_id:inv.id,p_amount_cents:400,p_paid_at:new Date().toISOString(),p_method:"cash"})).payment_id;
    let current = await read(inv.id); assert.equal(current.status,"draft"); assert.equal(current.balance_due_cents,600);
    denied(await save(current,lines(399)),"23514");
    check(await save(current,lines(1200))); current = await read(inv.id);
    assert.equal(current.status,"draft"); assert.equal(current.balance_due_cents,800);
    check(await deliver(current)); current = await read(inv.id); assert.equal(current.status,"partially_paid");
    check(await owner.client.rpc("cancel_manual_invoice_payment",{p_invoice_id:inv.id,p_payment_id:payId,p_reason:"Local correction"}));
    assert.equal((await read(inv.id)).balance_due_cents,1200);
    check(await owner.client.rpc("restore_cancelled_manual_invoice_payment",{p_invoice_id:inv.id,p_payment_id:payId}));
    assert.equal((await read(inv.id)).balance_due_cents,800);
  });
  await run("derived net principal excludes surcharge, refunds, lost disputes and failed payments", async () => {
    const inv = await draft(owner,2000); await deliver(inv);
    await payment(inv,"succeeded",{amount_cents:1000,total_collected_cents:1050,surcharge_cents:50,refunded_principal_cents:100,refunded_surcharge_cents:5,dispute_status:"lost",disputed_principal_cents:200,disputed_gross_cents:200});
    await payment(inv,"failed",{amount_cents:500,total_collected_cents:500});
    const result = check(await reconcile(inv,{client:service}));
    assert.equal(result.paid_cents,700); assert.equal(result.balance_due_cents,1300); assert.equal(result.status,"partially_paid");
    const current = await read(inv.id); check(await save(current,lines(1500)));
    assert.equal((await read(inv.id)).balance_due_cents,800);
  });
  await run("recording delivery preserves full payment and manual correction returns unsent payment to draft", async () => {
    const inv = await draft();
    const p = check(await owner.client.rpc("record_manual_invoice_payment_request",{p_request_id:randomUUID(),p_invoice_id:inv.id,p_amount_cents:1000,p_paid_at:new Date().toISOString(),p_method:"cash"})).payment_id;
    let current = await read(inv.id); assert.equal(current.status,"paid"); denied(await save(current),"23514");
    check(await owner.client.rpc("cancel_manual_invoice_payment",{p_invoice_id:inv.id,p_payment_id:p,p_reason:"Local correction"}));
    current = await read(inv.id); assert.equal(current.status,"draft");
    check(await owner.client.rpc("restore_cancelled_manual_invoice_payment",{p_invoice_id:inv.id,p_payment_id:p}));
    const paidAt = (await read(inv.id)).paid_at; check(await deliver(inv));
    current = await read(inv.id); assert.equal(current.status,"paid"); assert.equal(current.paid_at,paidAt); assert.ok(current.sent_at);
  });
  await run("manual delivery stays owner/admin while ordinary email delivery keeps staff access", async () => {
    for (const actor of [estimator,payroll]) {
      const inv = await draft(actor); denied(await deliver(inv,actor),"42501"); check(await deliver(inv,actor,false));
      assert.equal((await read(inv.id)).status,"sent");
    }
  });
  await run("active checkout, pending money and a void lease block invoice edits", async () => {
    for (const status of ["creating","open","processing"]) {
      const inv = await draft(); await deliver(inv); const current = await read(inv.id);
      await reservation(current,status); denied(await save(current),"23514");
    }
    const pending = await draft(); await payment(pending,"pending"); denied(await save(pending),"23514");
    const leased = await draft(); check(await owner.client.rpc("begin_invoice_void",{p_invoice_id:leased.id})); denied(await save(leased),"23514");
  });
  await run("save waits behind payment transaction then rejects the outdated form", async () => {
    const inv = await draft();
    const release = await hold(`select public.record_manual_invoice_payment_request('${randomUUID()}','${inv.id}',400,now(),'cash',null,null) from (select set_config('request.jwt.claim.sub','${owner.id}',true)) claims`);
    let done = false; const saving = save(inv,lines(1500)).then(r=>{done=true;return r;});
    try { await new Promise(r=>setTimeout(r,150)); assert.equal(done,false); } finally { await release(); }
    denied(await saving,"PT409"); assert.equal((await read(inv.id)).balance_due_cents,600);
  });
  await run("an invoice save holds the same parent lock as new collection", async () => {
    const inv = await draft(); await deliver(inv); const current = await read(inv.id);
    const release = await hold(`select public.save_invoice_details('${inv.id}','${current.updated_at}',null,'${JSON.stringify(lines(1500))}'::jsonb) from (select set_config('request.jwt.claim.sub','${owner.id}',true)) claims`);
    let done = false; const creating = service.from("invoice_checkout_sessions").insert({invoice_id:inv.id,customer_id:customer.id,status:"creating",amount_cents:1000,invoice_principal_cents:1000,total_charge_cents:1000,surcharge_cents:0,currency:"usd",payment_channel:"ach"}).then(r=>{done=true;return r;});
    try { await new Promise(r=>setTimeout(r,150)); assert.equal(done,false); } finally { await release(); }
    denied(await creating,"23514"); assert.equal((await read(inv.id)).total_cents,1500);
  });
  await run("metadata settings, archive/restore and draft-only permanent delete remain available", async () => {
    const inv = await draft();
    check(await owner.client.from("invoices").update({automatic_reminders_enabled:false,archived_at:new Date().toISOString(),archived_by_user_id:owner.id}).eq("id",inv.id));
    check(await owner.client.from("invoices").update({archived_at:null,archived_by_user_id:null}).eq("id",inv.id));
    const deletion = await estimator.client.from("invoices").delete().eq("id",inv.id).select("id");
    assert.ok(deletion.error?.code === "42501" || deletion.data?.length === 0);
    assert.equal((await read(inv.id)).id,inv.id);
    check(await owner.client.from("invoices").delete().eq("id",inv.id));
    const sent = await draft(); await deliver(sent); denied(await owner.client.from("invoices").delete().eq("id",sent.id),"23514");
    const checkout = await draft(); await reservation(checkout,"cancelled"); denied(await owner.client.from("invoices").delete().eq("id",checkout.id),"23514");
  });
  await run("mismatched billing party references fail closed", async () => {
    const other = check(await service.from("customers").insert({display_name:`Other ${marker}`}).select("id").single());
    const location = check(await service.from("service_locations").insert({customer_id:other.id,street:"Local test",city:"Fredericksburg",state:"VA",postal_code:"22401"}).select("id").single());
    denied(await owner.client.rpc("create_invoice_draft",{p_header:{customer_id:customer.id,service_location_id:location.id},p_lines:lines()}),"23514");
  });
  await run("approved additions retain prepayments, source links and material references", async () => {
    const location = check(await service.from("service_locations").insert({customer_id:customer.id,street:"Local fixture",city:"Fredericksburg",state:"VA",postal_code:"22401"}).select("id").single());
    const job = check(await service.from("jobs").insert({customer_id:customer.id,service_location_id:location.id,status:"completed"}).select("id").single());
    const material = check(await service.from("material_catalog").insert({name:`Local material ${marker}`,category:"mulch",default_unit:"each"}).select("id").single());
    const inv = await draft(owner,1000,{job_id:job.id,service_location_id:location.id});
    check(await owner.client.rpc("record_manual_invoice_payment_request",{p_request_id:randomUUID(),p_invoice_id:inv.id,p_amount_cents:400,p_paid_at:new Date().toISOString(),p_method:"cash"})).payment_id;
    const order = check(await service.from("change_orders").insert({job_id:job.id,customer_id:customer.id,status:"approved",title:"Fixture addition",created_by_user_id:owner.id}).select("id").single());
    const source = check(await service.from("change_order_line_items").insert({change_order_id:order.id,title:"Material",material_id:material.id,quantity:1,unit_price_cents:500,amount_cents:500}).select("id").single());
    check(await owner.client.rpc("attach_approved_change_orders_to_invoice",{p_invoice_id:inv.id}));
    let current = await read(inv.id); assert.equal(current.total_cents,1500); assert.equal(current.balance_due_cents,1100); assert.equal(current.status,"draft");
    const added = current.invoice_line_items.find(l=>l.source_change_order_line_item_id === source.id); assert.equal(added.material_id,material.id);
    check(await owner.client.rpc("attach_approved_change_orders_to_invoice",{p_invoice_id:inv.id}));
    current = await read(inv.id); assert.equal(current.total_cents,1500); assert.equal(current.invoice_line_items.length,2);
    check(await save(current,current.invoice_line_items.map(l=>({...l,name:l.name+" reviewed"}))));
    const after = await read(inv.id); assert.equal(after.balance_due_cents,1100);
    assert.equal(after.invoice_line_items.find(l=>l.id === added.id).material_id,material.id);
    assert.equal(after.invoice_line_items.find(l=>l.id === added.id).source_change_order_line_item_id,source.id);
  });
  await run("organization drafts retain valid billing contacts and reject a foreign contact", async () => {
    const org = check(await service.from("organizations").insert({name:`Local organization ${marker}`}).select("id").single());
    const contact = check(await service.from("organization_contacts").insert({organization_id:org.id,full_name:"Local billing",is_active:true}).select("id").single());
    const inv = await draft(owner,1000,{customer_id:null,organization_id:org.id,billing_contact_id:contact.id,accounts_payable_contact_id:contact.id,payment_terms:"Net 15",purchase_order_reference:"LOCAL-PO"});
    assert.equal(inv.customer_id,null); assert.equal(inv.organization_id,org.id); assert.equal(inv.billing_contact_id,contact.id); assert.equal(inv.purchase_order_reference,"LOCAL-PO");
    denied(await owner.client.rpc("create_invoice_draft",{p_header:{customer_id:customer.id,billing_contact_id:contact.id},p_lines:lines()}),"23514");
  });
  await run("void restore and paid/void locks remain intact after the write restrictions", async () => {
    const inv = await draft();
    const token = check(await owner.client.rpc("begin_invoice_void",{p_invoice_id:inv.id})).token;
    check(await owner.client.rpc("finalize_invoice_void",{p_invoice_id:inv.id,p_token:token}));
    const current = await read(inv.id); assert.equal(current.status,"void");
    denied(await save(current),"23514"); denied(await deliver(current),"23514");
    const reconciled = check(await reconcile(current,{client:service})); assert.equal(reconciled.status,"void");
    assert.equal(check(await owner.client.rpc("restore_voided_invoice",{p_invoice_id:inv.id})),"draft");
  });
  // Retain only disposable fixtures for inspection; no providers/workers are used.
  if (process.env.PR03_BOUNDARY_RESULTS_FILE) writeFileSync(process.env.PR03_BOUNDARY_RESULTS_FILE,JSON.stringify({marker,results},null,2));
});
