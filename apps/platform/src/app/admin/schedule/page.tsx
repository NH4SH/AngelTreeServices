import { CalendarDays, MapPin } from "lucide-react";
import { PlatformFrame } from "@/components/PlatformFrame";
import { SetupRequired } from "@/components/SetupRequired";
import { AddAppointmentForm } from "./AppointmentForm";
import { getAuthenticatedPlatformContext } from "@/lib/auth/pageContext";
import { getAppointments } from "@/lib/data/appointments";
import { getJobOptions } from "@/lib/data/jobs";

export default async function SchedulePage() {
  const context = await getAuthenticatedPlatformContext("/admin/schedule");

  if (!context.configured) {
    return <SetupRequired title="Configure Supabase before opening schedule" />;
  }

  const [appointments, jobs] = await Promise.all([getAppointments(), getJobOptions()]);

  return (
    <PlatformFrame active="schedule" roles={context.roles} userEmail={context.user.email}>
      <div className="shell app-content">
        <section className="page-heading">
          <p className="surface-label">
            <CalendarDays aria-hidden="true" size={18} />
            Schedule
          </p>
          <h1>A simple schedule shell before a full calendar.</h1>
          <p>
            Track estimate, job, and follow-up appointments as lightweight records. A full drag-and-drop
            calendar can come later after the core job workflow is proven.
          </p>
        </section>

        {[appointments.error, jobs.error].filter(Boolean).map((message) => (
          <DataWarning key={message} message={message ?? ""} />
        ))}

        <section className="crm-layout">
          <div className="crm-main">
            {appointments.data.length === 0 ? (
              <EmptyState title="No scheduled work yet" body="Schedule estimates, jobs, or follow-ups after jobs exist." />
            ) : (
              <div className="record-list">
                {appointments.data.map((appointment) => (
                  <article className="record-card" key={appointment.id}>
                    <div className="record-card-header">
                      <div>
                        <h2>{appointment.appointment_type.replace("_", " ")}</h2>
                        <p>{new Date(appointment.starts_at).toLocaleString()}</p>
                      </div>
                      <span className="status-pill">{appointment.status.replace("_", " ")}</span>
                    </div>
                    {appointment.service_locations ? (
                      <p className="inline-icon-line">
                        <MapPin aria-hidden="true" size={15} />
                        {appointment.service_locations.street}, {appointment.service_locations.city}
                      </p>
                    ) : null}
                    <p>{appointment.calendar_notes || appointment.jobs?.requested_scope || "No notes yet."}</p>
                  </article>
                ))}
              </div>
            )}
          </div>

          <aside className="crm-side">
            <section className="form-panel">
              <h2>Add appointment</h2>
              <AddAppointmentForm jobs={jobs.data} />
            </section>
            <section className="notice-panel">
              <strong>Future calendar direction</strong>
              <p>
                Keep this lightweight until scheduling patterns are clear. Then add a proper calendar
                view with crew assignment and day/week planning.
              </p>
            </section>
          </aside>
        </section>
      </div>
    </PlatformFrame>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <section className="empty-state">
      <h2>{title}</h2>
      <p>{body}</p>
    </section>
  );
}

function DataWarning({ message }: { message: string }) {
  return (
    <section className="data-warning" role="status">
      <strong>Database notice</strong>
      <p>{message}</p>
    </section>
  );
}
