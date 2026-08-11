import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  canRecordManualInvoicePayment,
  isInvoiceCustomerPayable,
  isInvoiceReminderEligible,
  resolveInvoicePaymentStatus,
} from "./invoice-payment-state.ts";

const futureDueAt = "2099-01-01T00:00:00.000Z";
const pastDueAt = "2020-01-01T00:00:00.000Z";
const sentAt = "2026-08-11T12:00:00.000Z";

function resolve(overrides = {}) {
  return resolveInvoicePaymentStatus({
    balanceDueCents: 10_000,
    currentStatus: "draft",
    dueAt: futureDueAt,
    paidCents: 0,
    sentAt: null,
    now: Date.parse("2026-08-11T12:00:00.000Z"),
    ...overrides,
  });
}

test("keeps unsent partial prepayments in draft", () => {
  assert.equal(resolve(), "draft");
  assert.equal(resolve({ balanceDueCents: 6_000, paidCents: 4_000 }), "draft");
  assert.equal(resolve({ currentStatus: "paid", balanceDueCents: 6_000, paidCents: 4_000 }), "draft");
});

test("marks an unsent invoice paid when prepayment covers the full balance", () => {
  assert.equal(resolve({ balanceDueCents: 0, paidCents: 10_000 }), "paid");
});

test("derives delivered partial and full payment states without losing delivery", () => {
  assert.equal(resolve({ balanceDueCents: 6_000, paidCents: 4_000, sentAt }), "partially_paid");
  assert.equal(resolve({ balanceDueCents: 0, currentStatus: "paid", paidCents: 10_000, sentAt }), "paid");
});

test("preserves sent, overdue, and void transitions", () => {
  assert.equal(resolve({ currentStatus: "sent", sentAt }), "sent");
  assert.equal(resolve({ currentStatus: "sent", dueAt: pastDueAt, sentAt }), "overdue");
  assert.equal(resolve({ currentStatus: "overdue", sentAt }), "overdue");
  assert.equal(resolve({ currentStatus: "void", sentAt }), "void");
});

test("allows owner/admin manual payment on open draft and delivered invoices only", () => {
  for (const status of ["draft", "sent", "partially_paid", "overdue"]) {
    assert.equal(canRecordManualInvoicePayment(status, 10_000), true);
  }
  assert.equal(canRecordManualInvoicePayment("paid", 10_000), false);
  assert.equal(canRecordManualInvoicePayment("void", 10_000), false);
  assert.equal(canRecordManualInvoicePayment("draft", 0), false);
});

test("keeps Stripe/customer payment and reminders unavailable before delivery", () => {
  for (const status of ["sent", "partially_paid", "overdue"]) {
    assert.equal(isInvoiceCustomerPayable(status, 10_000), true);
    assert.equal(isInvoiceReminderEligible(status, 10_000), true);
  }
  for (const status of ["draft", "paid", "void"]) {
    assert.equal(isInvoiceCustomerPayable(status, 10_000), false);
    assert.equal(isInvoiceReminderEligible(status, 10_000), false);
  }
  assert.equal(isInvoiceCustomerPayable("sent", 0), false);
  assert.equal(isInvoiceReminderEligible("sent", 0), false);
});

test("manual payment RPC migration preserves authorization, locking, audit, and overpayment guards", async () => {
  const migration = await readFile(
    new URL("../../../../../supabase/migrations/20260811185455_preserve_prepaid_invoice_delivery_state.sql", import.meta.url),
    "utf8",
  );

  for (const functionName of [
    "record_manual_invoice_payment",
    "cancel_manual_invoice_payment",
    "restore_cancelled_manual_invoice_payment",
  ]) {
    assert.match(migration, new RegExp(`create or replace function public\\.${functionName}`));
  }
  assert.match(migration, /security definer/g);
  assert.match(migration, /set search_path = ''/g);
  assert.match(migration, /app_private\.has_platform_admin_role\(\)/);
  assert.match(migration, /for update/g);
  assert.match(migration, /Manual payment exceeds the invoice balance\./);
  assert.match(migration, /Restoring this payment would exceed the current invoice total\./);
  assert.match(migration, /manual_payment_recorded/);
  assert.match(migration, /manual_payment_cancelled/);
  assert.match(migration, /manual_payment_restored/);
  assert.match(migration, /target\.sent_at is null and target\.status in \('draft', 'paid'\)/);
  assert.match(migration, /target_invoice\.sent_at is null and target_invoice\.status in \('draft', 'paid'\)/g);
  assert.match(migration, /revoke all on function public\.record_manual_invoice_payment/);
  assert.match(migration, /grant execute on function public\.record_manual_invoice_payment/);
});
