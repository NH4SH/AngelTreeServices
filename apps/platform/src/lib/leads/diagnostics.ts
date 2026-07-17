import "server-only";

import { getEmailSetupState } from "@/lib/email/config";
import {
  DEFAULT_PUBLIC_LEAD_INTAKE_URL,
  getAllowedLeadIntakeOrigins,
} from "@/lib/leads/config";
import { getServiceRoleClient } from "@/lib/supabase/admin";

export async function getLeadIntakeDiagnostics() {
  const supabase = getServiceRoleClient();
  let databaseError: string | null = null;

  if (supabase) {
    const { error } = await supabase
      .from("jobs")
      .select("id", { count: "exact", head: true });
    databaseError = error?.message ?? null;
  }

  const email = getEmailSetupState();

  return {
    allowedOrigins: getAllowedLeadIntakeOrigins(),
    databaseWriteAvailable: Boolean(supabase) && !databaseError,
    databaseError,
    endpoint: DEFAULT_PUBLIC_LEAD_INTAKE_URL,
    notificationConfigured: email.configured,
    notificationDestination: email.internalLeadNotificationEmail,
  };
}
