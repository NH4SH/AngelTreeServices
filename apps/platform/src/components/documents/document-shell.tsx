import type { ReactNode } from "react";
import { Leaf } from "lucide-react";

type DocumentShellProps = {
  children: ReactNode;
  documentLabel: string;
  documentNumber: string;
  statusLabel?: string;
};

export function DocumentShell({
  children,
  documentLabel,
  documentNumber,
  statusLabel,
}: DocumentShellProps) {
  return (
    <article className="business-document document-print-region">
      <header className="business-document-header">
        <div className="business-document-brand">
          <span aria-hidden="true">
            <Leaf size={20} />
          </span>
          <div>
            <strong>Angel Tree Services</strong>
            <small>Tree service, landscaping, and lawn care</small>
          </div>
        </div>
        <div className="business-document-identity">
          <span>{documentLabel}</span>
          <strong>{documentNumber}</strong>
          {statusLabel ? <small>{statusLabel}</small> : null}
        </div>
      </header>
      {children}
      <footer className="business-document-footer">
        <strong>Angel Tree Services</strong>
        <span>Fredericksburg, Virginia region</span>
      </footer>
    </article>
  );
}

export function DocumentSection({ children, title }: { children: ReactNode; title: string }) {
  return (
    <section className="business-document-section">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

export function DocumentMeta({
  items,
}: {
  items: { label: string; value: string }[];
}) {
  return (
    <dl className="business-document-meta">
      {items.map((item) => (
        <div key={item.label}>
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
