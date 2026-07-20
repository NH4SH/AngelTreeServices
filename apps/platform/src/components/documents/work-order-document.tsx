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
  const approvedQuote = (job.quotes ?? []).find((quote) => quote.status === "approved") ?? job.quotes?.[0] ?? null;
  const originalLines = [...(approvedQuote?.quote_line_items ?? [])].sort((left, right) => left.sort_order - right.sort_order);
  const approvedAdditions = (job.change_orders ?? [])
    .filter((order) => order.status === "approved")
    .flatMap((order) => [...(order.change_order_line_items ?? [])]
      .sort((left, right) => left.sort_order - right.sort_order)
      .map((line) => ({ ...line, changeOrderNumber: order.change_order_number })));

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
        {originalLines.length || approvedAdditions.length ? (
          <div className="business-document-work-list">
            {originalLines.map((line) => <article key={line.id}><span>Original</span><div><strong>{line.name}</strong>{line.description ? <p>{line.description}</p> : null}</div></article>)}
            {approvedAdditions.map((line) => <article key={line.id}><span>Added</span><div><strong>{line.title}</strong>{line.description ? <p>{line.description}</p> : null}<small>{line.changeOrderNumber}</small></div></article>)}
          </div>
        ) : <p>{job.requested_scope || "No requested scope attached yet."}</p>}
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
