import type { ReactNode } from "react";
import { Leaf } from "lucide-react";

type DocumentShellProps = {
  brandLogoSrc?: string;
  children: ReactNode;
  className?: string;
  documentLabel: string;
  documentNumber: string;
  footerDetails?: ReactNode;
  previewLabel?: string;
  statusLabel?: string;
};

export function DocumentShell({
  brandLogoSrc,
  children,
  className,
  documentLabel,
  documentNumber,
  footerDetails,
  previewLabel,
  statusLabel,
}: DocumentShellProps) {
  return (
    <article className={`business-document document-print-region${className ? ` ${className}` : ""}`}>
      <header className="business-document-header">
        <div className="business-document-brand">
          {brandLogoSrc ? (
            <img alt="" aria-hidden="true" className="business-document-logo" src={brandLogoSrc} />
          ) : (
            <span aria-hidden="true">
              <Leaf size={20} />
            </span>
          )}
          <div>
            <strong>Angel Tree Services</strong>
            <small>Tree service, landscaping, and lawn care</small>
          </div>
        </div>
        <div className="business-document-identity">
          <span>{documentLabel}</span>
          <strong>{documentNumber}</strong>
          {statusLabel ? <small>{statusLabel}</small> : null}
          {previewLabel ? <small className="business-document-preview-badge print-hidden">{previewLabel}</small> : null}
        </div>
      </header>
      {children}
      <footer className="business-document-footer">
        {footerDetails ?? (
          <>
            <strong>Angel Tree Services</strong>
            <span>Fredericksburg, Virginia region</span>
          </>
        )}
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
  items: { label: string; value: string; wide?: boolean }[];
}) {
  let nextColumn: "left" | "right" = "left";

  return (
    <dl className="business-document-meta">
      {items.map((item) => {
        const startsLeft = item.wide || nextColumn === "left";
        nextColumn = item.wide || nextColumn === "right" ? "left" : "right";

        return (
          <div
            className={item.wide ? "business-document-meta-wide" : startsLeft ? "business-document-meta-left" : undefined}
            key={item.label}
          >
            <dt>{item.label}</dt>
            <dd>{item.value}</dd>
          </div>
        );
      })}
    </dl>
  );
}
