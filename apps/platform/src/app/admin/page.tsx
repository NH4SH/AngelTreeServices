import {
  CalendarDays,
  CircleDollarSign,
  ClipboardCheck,
  Clock3,
  Leaf,
  MessageSquareMore,
  PhoneCall,
  Truck,
  Zap,
} from "lucide-react";
import { redirect } from "next/navigation";
import { PlatformFrame } from "@/components/PlatformFrame";
import { SetupRequired } from "@/components/SetupRequired";
import { getCurrentUserRoles } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";

const lanes = [
  {
    title: "New leads",
    description: "Website requests, phone calls, referrals, and local search leads awaiting first contact.",
    Icon: PhoneCall,
  },
  {
    title: "Estimates to schedule",
    description: "Qualified requests that need an on-site visit, calendar slot, and estimator assignment.",
    Icon: CalendarDays,
  },
  {
    title: "Quotes awaiting response",
    description: "Sent quotes that need approval, edits, reminders, or a careful follow-up.",
    Icon: MessageSquareMore,
  },
  {
    title: "Today's jobs",
    description: "Crew-ready work with address, scope, notes, directions, and photo needs.",
    Icon: Truck,
  },
  {
    title: "Follow-ups due",
    description: "Promised callbacks, post-job check-ins, review requests, and dormant leads to revisit.",
    Icon: Clock3,
  },
  {
    title: "Unpaid invoices",
    description: "Completed work that has been billed and still needs payment tracking.",
    Icon: CircleDollarSign,
  },
];

export default async function AdminPage() {
  const supabase = await createClient();

  if (!supabase) {
    return <SetupRequired title="Configure Supabase before opening the admin CRM" />;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/admin");
  }

  const roles = await getCurrentUserRoles();

  return (
    <PlatformFrame active="admin" roles={roles} userEmail={user.email}>
      <div className="shell app-content">
      <section className="page-heading">
        <p className="surface-label">
          <Leaf aria-hidden="true" size={18} />
          Internal CRM Shell
        </p>
        <h1>Keep the whole day in view without turning the office into a spreadsheet.</h1>
        <p>
          This is a protected-route placeholder. It contains workflow lanes only, not real CRM data.
        </p>
      </section>

      <section className="admin-board" aria-label="Future CRM lanes">
        {lanes.map((lane) => (
          <article className="work-card" key={lane.title}>
            <lane.Icon aria-hidden="true" className="card-icon" size={22} />
            <h2>{lane.title}</h2>
            <p>{lane.description}</p>
          </article>
        ))}
      </section>

      <section className="notice-panel">
        <strong>
          <Zap aria-hidden="true" size={18} />
          Security gate pending
        </strong>
        <p>
          Connect Supabase Auth and role-based policies before adding customers, jobs, photos, quotes,
          invoices, or payments.
        </p>
      </section>

      <section className="workflow-strip" aria-label="First workflow">
        <span>
          <ClipboardCheck aria-hidden="true" size={18} />
          First workflow: lead intake to scheduled estimate
        </span>
      </section>
      </div>
    </PlatformFrame>
  );
}
