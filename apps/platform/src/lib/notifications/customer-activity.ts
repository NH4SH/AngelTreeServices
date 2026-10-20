import "server-only";

import type { ActivityChanges, ActivityMetadata } from "@/lib/activity-log";
import type { NotificationCategory } from "@/lib/notifications/definitions";
import { redactActivityData } from "@/lib/security/activity-redaction";
import { mapBounded } from "@/lib/runtime/deadline";
import { callDeliveryCommand } from "@/lib/email/delivery-commands";
import { dispatchSavedEmail } from "@/lib/email/delivery";
import { completeDeliveryFollowups } from "@/lib/email/delivery-followups";
import { sendEmailTransport } from "@/lib/email/send";
import { getEmailSetupState } from "@/lib/email/config";
import { buildCanonicalAppUrl } from "@/lib/security/app-base-url";
import { getServiceRoleClient } from "@/lib/supabase/admin";

type CustomerActivityInput = {
  body?: string | null;
  category: NotificationCategory;
  changeOrderId?: string | null;
  changes?: ActivityChanges;
  customerId?: string | null;
  destinationPath: string;
  eventType: string;
  idempotencyKey: string;
  invoiceId?: string | null;
  metadata?: ActivityMetadata;
  organizationId?: string | null;
  paymentId?: string | null;
  quoteId?: string | null;
  recordLabel?: string | null;
  subjectId: string;
  subjectType: string;
  summary: string;
  title: string;
};
const uuid = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value);
const clean = (value: string | null | undefined, max: number) => value?.trim().slice(0, max) || null;

/** One committed preparation precedes all I/O. Replays reuse the original saved
 * requests; claims hold uncertain/accepted outcomes for existing PR14 recovery. */
export async function emitCustomerActivity(input: CustomerActivityInput) {
  try {
    const db = getServiceRoleClient();
    if (!db) throw Error("Activity preparation unavailable");
    const setup = getEmailSetupState();
    const path = clean(input.destinationPath, 500);
    const prepared = await callDeliveryCommand(db, "prepare_customer_activity", {
      p_event: {
        category: input.category, changes: redactActivityData(input.changes ?? {}),
        metadata: redactActivityData(input.metadata ?? {}),
        destination_path: path, event_type: input.eventType, idempotency_key: input.idempotencyKey,
        organization_id: input.organizationId ?? null, record_label: clean(input.recordLabel, 180),
        summary: clean(input.summary, 500), body: input.body ?? input.summary, title: input.title,
        subject_id: input.subjectId, subject_type: input.subjectType,
        customer_id: input.customerId ?? null, invoice_id: input.invoiceId ?? null,
        change_order_id: input.changeOrderId ?? null, payment_id: input.paymentId ?? null, quote_id: input.quoteId ?? null,
      },
      p_envelope: { from: setup.from, reply_to: setup.replyTo },
      p_destination: path ? buildCanonicalAppUrl(path) : null,
    });
    const saved = prepared.data;
    if (prepared.error || !uuid(saved?.activity_id) || saved.legacy_hold !== false
      || typeof saved.created !== "boolean" || !Number.isSafeInteger(saved.notification_count) || saved.notification_count < 0
      || !Array.isArray(saved.delivery_ids) || !saved.delivery_ids.every(uuid) || saved.delivery_count !== saved.delivery_ids.length
      || new Set(saved.delivery_ids).size !== saved.delivery_ids.length || saved.delivery_ids.length > saved.notification_count) {
      throw Error("Activity preparation unconfirmed");
    }
    // Missing configuration leaves complete saved requests visible in Delivery
    // review. A lost acknowledgement never authorizes speculative provider I/O.
    if (!setup.configured) return;
    const outcomes = await mapBounded(saved.delivery_ids as string[], 3, async id => {
      try {
        const sent = await dispatchSavedEmail(id, db, sendEmailTransport);
        const result = sent.ok ? await completeDeliveryFollowups(db, id, sent) : sent;
        return result.ok && result.historyRecorded && result.sourceReconciled;
      } catch { return false; }
    });
    if (outcomes.some(confirmed => !confirmed)) throw Error("Activity delivery needs review");
  } catch {
    console.error("Customer activity notification pipeline needs review.", { eventType: input.eventType, subjectId: input.subjectId });
  }
}
