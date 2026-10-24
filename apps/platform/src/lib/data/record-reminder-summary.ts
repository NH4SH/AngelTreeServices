import "server-only";
import { createClient } from "@/lib/supabase/server";
import { readRecordReminderSummary, unavailableRecordReminderSummary, type ReminderRecordType } from "@/lib/communications/record-summary";

export async function getRecordReminderSummary(recordType: ReminderRecordType, recordId: string) {
  try { return await readRecordReminderSummary(await createClient(), recordType, recordId); }
  catch { return unavailableRecordReminderSummary(); }
}
