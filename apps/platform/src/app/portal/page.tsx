import { Camera, CheckCircle2, FileSignature, Leaf, ReceiptText, Star } from "lucide-react";
import { redirect } from "next/navigation";
import { PlatformFrame } from "@/components/PlatformFrame";
import { SetupRequired } from "@/components/SetupRequired";
import { getCurrentUserRoles } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";

const portalCards = [
  {
    title: "Quote approval",
    description: "View line items, approve the work, or request changes before scheduling.",
    Icon: FileSignature,
  },
  {
    title: "Invoice and payment",
    description: "Review invoice status and payment details later, once billing is connected.",
    Icon: ReceiptText,
  },
  {
    title: "Upload photos",
    description: "Share property photos before estimates or after follow-up requests.",
    Icon: Camera,
  },
  {
    title: "Review and feedback",
    description: "Leave a review or send a private note after work is complete.",
    Icon: Star,
  },
];

export default async function PortalPage() {
  const supabase = await createClient();

  if (!supabase) {
    return <SetupRequired title="Configure Supabase before opening the customer portal" />;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/portal");
  }

  const roles = await getCurrentUserRoles();

  return (
    <PlatformFrame active="portal" roles={roles} userEmail={user.email}>
      <div className="shell narrow-shell app-content">
      <section className="page-heading">
        <p className="surface-label">
          <Leaf aria-hidden="true" size={18} />
          Customer Portal Shell
        </p>
        <h1>A calm place for customers to review work and keep decisions moving.</h1>
        <p>
          Future customers will securely view quotes, approve work, request changes, view invoices,
          upload photos, and pay online from this area.
        </p>
      </section>

      <section className="stack-list" aria-label="Future customer portal actions">
        {portalCards.map((card) => (
          <div key={card.title}>
            <card.Icon aria-hidden="true" className="card-icon" size={22} />
            <span>{card.title}</span>
            <p>{card.description}</p>
          </div>
        ))}
      </section>

      <section className="notice-panel trust-note">
        <strong>
          <CheckCircle2 aria-hidden="true" size={18} />
          Trust boundary
        </strong>
        <p>Portal records stay placeholders until secure customer-specific access is implemented.</p>
      </section>
      </div>
    </PlatformFrame>
  );
}
