import type { DocumentTerm } from "@/lib/documents/terms";

export function DocumentTerms({
  title,
  terms,
  variant,
}: {
  title: string;
  terms: readonly DocumentTerm[];
  variant: "quote" | "invoice";
}) {
  return (
    <section className={`document-terms ${variant}-document-terms`}>
      <div className="document-terms-heading">
        <span>{variant === "quote" ? "Proposal details" : "Payment and service conditions"}</span>
        <h3>{title}</h3>
      </div>
      <dl className="document-terms-list">
        {terms.map((term) => (
          <div className="document-term" key={term.label}>
            <dt>{term.label}</dt>
            <dd>{term.text}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
