import assert from "node:assert/strict";
import test from "node:test";
import { invoiceId, invoice2, actor, reservationId, migration, fixtureSql } from "./checkout-void.sql-fixture.mjs";

// Isolated embedded PostgreSQL only. This suite does not contact Supabase or
// Stripe and does not claim multi-connection concurrency/RLS integration coverage.
// Missing PGlite FAILS unless the dependency-free run explicitly opts out.
const skip = process.env.CRM_SKIP_SQL_TESTS === "1";

test("invoice void lease SQL, money fencing, permissions and atomicity", { skip }, async t => {
  const { PGlite } = await import("@electric-sql/pglite");
  const db = new PGlite();
  try {
    await db.exec(fixtureSql);
    await db.exec(migration);
    const reset = async () => {
      await db.exec(`reset role; truncate public.activity_log, public.customer_communications, public.payments, public.invoice_checkout_sessions, app_private.invoice_void_leases, public.invoices cascade;
        insert into public.invoices(id,status) values ('${invoiceId}', 'sent'), ('${invoice2}', 'sent');
        select set_config('request.jwt.claim.sub', '${actor}', false); select set_config('test.is_admin', 'true', false);`);
    };
    const begin = async (id = invoiceId) => (await db.query("select public.begin_invoice_void($1) result", [id])).rows[0].result.token;
    const finalize = token => db.query("select public.finalize_invoice_void($1, $2) result", [invoiceId, token]);
    const insertReservation = (status = "open", id = invoiceId) => db.query("insert into public.invoice_checkout_sessions(id, invoice_id, status) values ($1,$2,$3)", [reservationId, id, status]);
    const closeReservation = token => db.query("update public.invoice_checkout_sessions set status='expired', void_reconciled_token=$1 where id=$2", [token, reservationId]);
    const state = async () => (await db.query("select status from public.invoices where id=$1", [invoiceId])).rows[0].status;

    await t.test("void and cancellation/activity commit once; repeated void is idempotent", async () => {
      await reset(); await insertReservation();
      await db.query("insert into public.customer_communications(invoice_id,status) values($1,'pending')", [invoiceId]);
      const token = await begin(); await closeReservation(token); await finalize(token); await finalize(token);
      assert.equal(await state(), "void");
      assert.equal((await db.query("select count(*)::int n from activity_log where event_type='invoice_voided'")).rows[0].n, 1);
      assert.equal((await db.query("select status from customer_communications")).rows[0].status, "cancelled");
      assert.deepEqual((await db.query("select public.begin_invoice_void($1) result", [invoiceId])).rows[0].result, { already_void: true });
    });
    await t.test("successful/pending payments and unresolved creating/processing/completed block begin", async () => {
      for (const status of ["pending", "succeeded", "refunded"]) {
        await reset(); await db.query("insert into public.payments(invoice_id,status) values($1,$2)", [invoiceId,status]);
        await assert.rejects(begin(), /payment activity/); assert.equal(await state(), "sent");
      }
      for (const evidence of ["refunded_principal_cents=1", "refunded_surcharge_cents=1", "dispute_status='lost'", "disputed_gross_cents=1"]) {
        await reset(); await db.query("insert into public.payments(invoice_id,status) values($1,'failed')", [invoiceId]);
        await db.exec(`update public.payments set ${evidence}`); await assert.rejects(begin(), /payment activity/);
      }
      for (const status of ["creating", "processing", "completed"]) {
        await reset(); await insertReservation(status); await assert.rejects(begin(), /payment activity/);
      }
    });
    await t.test("lease blocks new ACH/card collection and open card confirmation; independent invoice proceeds", async () => {
      await reset(); const token = await begin();
      await assert.rejects(insertReservation("creating"), /collection is unavailable/);
      await assert.rejects(insertReservation("open"), /collection is unavailable/);
      await insertReservation("creating", invoice2);
      await finalize(token); assert.equal(await state(), "void");
      await reset(); await insertReservation("open"); await begin();
      await assert.rejects(db.query("update invoice_checkout_sessions set status='creating' where id=$1", [reservationId]), /collection is unavailable/);
    });
    await t.test("direct status update and direct finalizer cannot bypass remote attestation", async () => {
      await reset(); await insertReservation("expired");
      await assert.rejects(db.query("update invoices set status='void' where id=$1", [invoiceId]), /authenticated invoice void workflow/);
      const token = await begin(); await assert.rejects(finalize(token), /Every checkout must be reconciled/);
      await closeReservation(token); await finalize(token); assert.equal(await state(), "void");
    });
    await t.test("late payment/checkout evidence before finalizer blocks finalization", async () => {
      for (const status of ["pending", "succeeded", "refunded"]) {
        await reset(); await insertReservation(); const token = await begin(); await closeReservation(token);
        await db.query("insert into payments(invoice_id,status) values($1,$2)", [invoiceId,status]);
        await assert.rejects(finalize(token), /payment activity/); assert.equal(await state(), "sent");
      }
      await reset(); await insertReservation(); const token = await begin(); await closeReservation(token);
      await db.query("update invoice_checkout_sessions set status='processing' where id=$1", [reservationId]);
      assert.equal((await db.query("select void_reconciled_token from invoice_checkout_sessions")).rows[0].void_reconciled_token, null);
      await assert.rejects(finalize(token), /payment activity/);
    });
    await t.test("expired/crashed-worker lease is fenced; stale release cannot delete new owner", async () => {
      await reset(); const old = await begin(); await assert.rejects(begin(), /already in progress/);
      await db.exec("update app_private.invoice_void_leases set expires_at=clock_timestamp()-interval '1 second'");
      await assert.rejects(finalize(old), /lease expired or changed/);
      const current = await begin(); assert.notEqual(current, old);
      await db.query("select public.release_invoice_void($1,$2)", [invoiceId,old]);
      await assert.rejects(finalize(old), /lease expired or changed/); await finalize(current);
    });
    await t.test("permissions prevent anonymous/staff/non-owner lease finalization and table tampering", async () => {
      await reset(); await db.exec("set role anon");
      await assert.rejects(begin(), /permission denied/); await db.exec("reset role; set role authenticated");
      await assert.rejects(db.query("select * from app_private.invoice_void_leases"), /permission denied/);
      await db.exec("select set_config('test.is_admin','false',false)"); await assert.rejects(begin(), /Only an owner or admin/);
      await db.exec("reset role; select set_config('test.is_admin','true',false)"); const token = await begin();
      await db.exec("select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000011',false)");
      await assert.rejects(finalize(token), /lease expired or changed/);
    });
    await t.test("activity failure rolls back invoice/reminders and supports a clean retry", async () => {
      await reset(); await insertReservation(); await db.query("insert into customer_communications(invoice_id,status) values($1,'pending')", [invoiceId]);
      const token = await begin(); await closeReservation(token);
      await db.exec("alter table activity_log add constraint reject_void_test check(event_type <> 'invoice_voided')");
      await assert.rejects(finalize(token), /reject_void_test/); assert.equal(await state(), "sent");
      assert.equal((await db.query("select status from customer_communications")).rows[0].status, "pending");
      await db.exec("alter table activity_log drop constraint reject_void_test"); await finalize(token);
      assert.equal(await state(), "void");
    });
    await t.test("unexpected money after void is preserved and flagged once; new collection remains blocked", async () => {
      await reset(); await insertReservation(); const token = await begin(); await closeReservation(token); await finalize(token);
      const payment = (await db.query("insert into payments(invoice_id,status) values($1,'succeeded') returning id", [invoiceId])).rows[0].id;
      await db.query("update payments set status='succeeded' where id=$1", [payment]);
      assert.equal((await db.query("select count(*)::int n from payments")).rows[0].n, 1);
      assert.equal((await db.query("select count(*)::int n from activity_log where event_type='invoice_void_payment_conflict'")).rows[0].n, 1);
      await db.query("update invoice_checkout_sessions set status='completed' where id=$1", [reservationId]);
      await assert.rejects(db.query("update invoice_checkout_sessions set status='open' where id=$1", [reservationId]), /Void invoices cannot collect/);
    });
  } finally { await db.close(); }
});
