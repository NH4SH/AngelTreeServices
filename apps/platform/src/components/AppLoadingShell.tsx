import { HardHat, Leaf } from "lucide-react";

type AppLoadingShellProps = {
  title: string;
  subtitle: string;
  statusLabel: string;
  variant: "admin" | "crew";
};

export function AppLoadingShell({
  title,
  subtitle,
  statusLabel,
  variant,
}: AppLoadingShellProps) {
  const isCrew = variant === "crew";
  const Icon = isCrew ? HardHat : Leaf;

  return (
    <main className="app-loading-shell" aria-busy="true" aria-live="polite">
      <section className="app-loading-panel">
        <div className="app-loading-brand">
          <span className="app-loading-brand-mark" aria-hidden="true">
            <Icon size={18} />
          </span>
          <div>
            <strong>Angel Tree Services</strong>
            <small>{isCrew ? "Crew workspace" : "Operations workspace"}</small>
          </div>
        </div>

        <div className="app-loading-copy">
          <p className="surface-label">
            <Leaf aria-hidden="true" size={16} />
            {statusLabel}
          </p>
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>

        <div className="app-loading-progress" aria-hidden="true">
          <span />
        </div>

        {isCrew ? (
          <div className="app-loading-crew-grid" aria-hidden="true">
            <section className="app-loading-crew-card app-loading-crew-card-wide">
              <div className="app-loading-skeleton-line short" />
              <div className="app-loading-skeleton-line medium" />
              <div className="app-loading-skeleton-line long" />
              <div className="app-loading-action-grid">
                <div className="app-loading-skeleton-button" />
                <div className="app-loading-skeleton-button" />
                <div className="app-loading-skeleton-button" />
                <div className="app-loading-skeleton-button" />
              </div>
            </section>
            <section className="app-loading-crew-card">
              <div className="app-loading-skeleton-line short" />
              <div className="app-loading-skeleton-line medium" />
              <div className="app-loading-skeleton-line long" />
            </section>
            <section className="app-loading-crew-card">
              <div className="app-loading-skeleton-line short" />
              <div className="app-loading-skeleton-line medium" />
              <div className="app-loading-skeleton-line long" />
            </section>
          </div>
        ) : (
          <div className="app-loading-admin-grid" aria-hidden="true">
            <section className="app-loading-admin-card">
              <div className="app-loading-skeleton-line short" />
              <div className="app-loading-skeleton-line medium" />
              <div className="app-loading-skeleton-stack">
                <div className="app-loading-skeleton-row" />
                <div className="app-loading-skeleton-row" />
                <div className="app-loading-skeleton-row" />
              </div>
            </section>
            <section className="app-loading-admin-card">
              <div className="app-loading-skeleton-line short" />
              <div className="app-loading-skeleton-line medium" />
              <div className="app-loading-skeleton-stack">
                <div className="app-loading-skeleton-chip" />
                <div className="app-loading-skeleton-chip" />
                <div className="app-loading-skeleton-chip" />
              </div>
            </section>
            <section className="app-loading-admin-card">
              <div className="app-loading-skeleton-line short" />
              <div className="app-loading-skeleton-line medium" />
              <div className="app-loading-skeleton-stack">
                <div className="app-loading-skeleton-row" />
                <div className="app-loading-skeleton-row" />
                <div className="app-loading-skeleton-row" />
              </div>
            </section>
            <section className="app-loading-admin-card">
              <div className="app-loading-skeleton-line short" />
              <div className="app-loading-skeleton-line medium" />
              <div className="app-loading-skeleton-stack">
                <div className="app-loading-skeleton-chip" />
                <div className="app-loading-skeleton-chip" />
                <div className="app-loading-skeleton-chip" />
              </div>
            </section>
          </div>
        )}
      </section>
    </main>
  );
}
