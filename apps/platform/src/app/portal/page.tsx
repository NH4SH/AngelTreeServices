import { redirect } from "next/navigation";
import { CustomerDocumentEntry } from "@/components/customer-document-entry";
import { SetupRequired } from "@/components/SetupRequired";
import { createClient } from "@/lib/supabase/server";

export default async function PortalPage() {
  const supabase = await createClient();

  if (!supabase) {
    return <SetupRequired title="Configure Supabase before opening the customer portal" />;
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/portal");

  return <CustomerDocumentEntry signedInAs={user.email} />;
}
