import { Camera, CheckCircle2, MapPin, Phone, Truck, Wrench } from "lucide-react";
import { redirect } from "next/navigation";
import { PlatformFrame } from "@/components/PlatformFrame";
import { SetupRequired } from "@/components/SetupRequired";
import { getCurrentUserRoles } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";

const actions = [
  {
    label: "Directions",
    description: "Open the next service location.",
    Icon: MapPin,
  },
  {
    label: "Call",
    description: "Contact the customer from the job.",
    Icon: Phone,
  },
  {
    label: "Photos",
    description: "Capture before and after photos.",
    Icon: Camera,
  },
  {
    label: "Complete",
    description: "Finish the checklist and mark done.",
    Icon: CheckCircle2,
  },
];

export default async function CrewPage() {
  const supabase = await createClient();

  if (!supabase) {
    return <SetupRequired title="Configure Supabase before opening the crew app" />;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/crew");
  }

  const roles = await getCurrentUserRoles();

  return (
    <PlatformFrame active="crew" roles={roles} userEmail={user.email}>
      <div className="crew-shell app-content">
      <section className="crew-hero">
        <p className="surface-label">
          <Truck aria-hidden="true" size={18} />
          Crew Field App Shell
        </p>
        <h1>Today, clearly.</h1>
        <p>
          A mobile-first view for the field: jobs, directions, customer contact, scope, notes, photos,
          and completion.
        </p>
      </section>

      <section className="job-card" aria-label="Future job card placeholder">
        <div>
          <p className="job-kicker">Next job placeholder</p>
          <h2>Tree service work order</h2>
          <p>Address, scope, crew notes, and customer contact will appear here after auth is connected.</p>
        </div>
        <Wrench aria-hidden="true" className="job-card-icon" size={28} />
      </section>

      <section className="crew-actions" aria-label="Future crew actions">
        {actions.map((action) => (
          <button disabled key={action.label} type="button">
            <action.Icon aria-hidden="true" size={24} />
            <span>
              <strong>{action.label}</strong>
              <small>{action.description}</small>
            </span>
          </button>
        ))}
      </section>

      <p className="field-note">
        Buttons are disabled until auth, assigned jobs, and photo storage are connected.
      </p>
      </div>
    </PlatformFrame>
  );
}
