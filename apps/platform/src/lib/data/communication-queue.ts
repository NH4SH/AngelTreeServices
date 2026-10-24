import "server-only";
import { createClient } from "@/lib/supabase/server";
import { readCommunicationQueuePage, type CommunicationQueueView } from "@/lib/communications/queue-page";

export async function getCommunicationQueuePage(view: CommunicationQueueView, page: unknown = 1) {
  try { return await readCommunicationQueuePage(await createClient(), view, page); }
  catch { return readCommunicationQueuePage(null, view, page); }
}
