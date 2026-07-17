import { DocumentMeta, DocumentSection, DocumentShell } from "@/components/documents/document-shell";
import type { JobDetail } from "@/lib/types/database";

const checklist = [
  "Before photos captured",
  "Agreed scope reviewed",
  "Debris cleaned",
  "Work area blown or raked",
  "After photos captured",
  "Customer notified if needed",
  "Notes added",
  "Ready for invoice",
];

export function WorkOrderDocument({ job }: { job: JobDetail }) {
  const crewNotes = (job.notes ?? []).filter((note) => note.visibility === "crew_visible");

  return (
    <DocumentShell
      documentLabel="Work order"
      documentNumber={job.service_type?.replace("_", " ") ?? "Service job"}
      statusLabel={job.status.replace("_", " ")}
    >
      <DocumentMeta
        items={[
          { label: "Contracting party", value: job.organizations?.name ?? job.customers?.display_name ?? "Contracting party not attached yet." },
          { label: "Contact", value: job.organizations?.billing_phone || job.customers?.phone || "No phone attached yet." },
          { label: "Service location", value: formatLocation(job) },
          { label: "Scheduled", value: job.scheduled_start_at ? formatDateTime(job.scheduled_start_at) : "No schedule attached yet." },
        ]}
      />
      <DocumentSection title="Scope of work">
        <p>{job.requested_scope || "No requested scope attached yet."}</p>
      </DocumentSection>
      <DocumentSection title="Access notes">
        <p>{job.service_locations?.access_notes || job.service_locations?.service_notes || "No access notes attached yet."}</p>
      </DocumentSection>
      <DocumentSection title="Crew notes">
        {crewNotes.length ? crewNotes.map((note) => <p key={note.id}>{note.body}</p>) : <p>No crew notes attached yet.</p>}
      </DocumentSection>
      <DocumentSection title="Equipment">
        <p>Equipment and material requirements will be added after field planning is connected.</p>
      </DocumentSection>
      <section className="business-document-checklist">
        <h3>Completion checklist</h3>
        <ul>
          {checklist.map((item) => <li key={item}>{item}</li>)}
        </ul>
      </section>
    </DocumentShell>
  );
}

function formatLocation(job: JobDetail) {
  const location = job.service_locations;
  if (!location) {
    return "No service location attached yet.";
  }

  return [location.street, location.city, location.state, location.postal_code].filter(Boolean).join(", ");
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}
