import { Camera, CheckCircle2, FileSignature, Leaf, ReceiptText, ShieldCheck, Star } from "lucide-react";
import { redirect } from "next/navigation";
import { SetupRequired } from "@/components/SetupRequired";
import { createClient } from "@/lib/supabase/server";

const portalCards = [
  {
    title: "Quote approval",
    description: "Review line items, confirm the scope, and approve work when you are ready.",
    Icon: FileSignature,
  },
  {
    title: "Billing follow-up",
    description: "See invoice status and payment details later, once billing is connected.",
    Icon: ReceiptText,
  },
  {
    title: "Photo sharing",
    description: "Upload property photos before visits or send follow-up images after service.",
    Icon: Camera,
  },
  {
    title: "Feedback and review",
    description: "Send a private note or leave a review after the work is complete.",
    Icon: Star,
  },
];

const trustPoints = [
  "Secure quote review",
  "Clear scope and pricing",
  "Local Angel Tree team follow-up",
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

  return (
    <main className="customer-portal-page customer-portal-home">
      <header className="customer-portal-header">
        <div className="customer-portal-brand">
          <span><Leaf aria-hidden="true" size={22} /></span>
          <div>
            <strong>Angel Tree Services</strong>
            <small>Customer Portal</small>
          </div>
        </div>
        <p><ShieldCheck aria-hidden="true" size={17} /> Private customer access</p>
      </header>

      <section className="customer-portal-hero">
        <div className="customer-portal-intro">
          <p className="surface-label">
            <Leaf aria-hidden="true" size={18} />
            Customer Portal
          </p>
          <h1>Review quotes, stay aligned, and keep the job moving.</h1>
          <p>
            This portal keeps your quote details, service communication, and next steps in one clean place without
            exposing any internal office tools.
          </p>
        </div>

        <aside className="customer-portal-summary-card">
          <strong>Signed in as</strong>
          <span>{user.email ?? "Customer account"}</span>
          <div className="customer-portal-trust-list" aria-label="Portal trust cues">
            {trustPoints.map((point) => (
              <p key={point}>
                <CheckCircle2 aria-hidden="true" size={16} />
                {point}
              </p>
            ))}
          </div>
        </aside>
      </section>

      <section className="customer-portal-card-grid" aria-label="Customer portal features">
        {portalCards.map((card) => (
          <article className="customer-portal-card" key={card.title}>
            <div className="customer-portal-card-icon">
              <card.Icon aria-hidden="true" size={20} />
            </div>
            <h2>{card.title}</h2>
            <p>{card.description}</p>
          </article>
        ))}
      </section>

      <section className="customer-portal-note">
        <strong>
          <CheckCircle2 aria-hidden="true" size={18} />
          Portal access stays scoped
        </strong>
        <p>Each customer view is limited to the records and quote links intended for that customer only.</p>
      </section>

      <footer className="customer-portal-footer">
        <strong>Angel Tree Services</strong>
        <span>Questions? Reply to your quote email or call our office.</span>
      </footer>
    </main>
  );
}
