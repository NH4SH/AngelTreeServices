import Link from "next/link";
import { Clock3, HardHat, Leaf, LogOut, ShieldCheck, UserRoundPlus } from "lucide-react";
import { signOut } from "@/app/login/actions";
import type { EmployeeAccessRequestWithReviewer } from "@/lib/data/access-requests";

type AccessStatusShellProps = {
  currentRoleLabel?: string | null;
  request?: EmployeeAccessRequestWithReviewer | null;
  scope: "admin" | "crew" | "platform";
  userEmail?: string | null;
};

export function AccessStatusShell({
  currentRoleLabel,
  request,
  scope,
  userEmail,
}: AccessStatusShellProps) {
  if (request?.status === "rejected") {
    return (
      <main className="shell narrow-shell access-shell">
        <section className="login-panel access-panel">
          <p className="surface-label">
            <ShieldCheck aria-hidden="true" size={18} />
            Access request declined
          </p>
          <h1>Account access was not approved.</h1>
          <p>
            This sign-in works, but it does not have approval to use the Angel Tree internal
            platform yet.
          </p>

          <div className="access-summary-card">
            <strong>Current account</strong>
            <span>{userEmail ?? request.email}</span>
            {request.rejection_reason ? (
              <p>{request.rejection_reason}</p>
            ) : (
              <p>An owner or admin declined this request. If this was unexpected, contact the office.</p>
            )}
          </div>

          <div className="action-row">
            <Link className="secondary-action" href="/login">
              <Clock3 aria-hidden="true" size={18} />
              Back to login
            </Link>
            <form action={signOut}>
              <button className="secondary-action button-reset" type="submit">
                <LogOut aria-hidden="true" size={18} />
                Sign out
              </button>
            </form>
          </div>
        </section>
      </main>
    );
  }

  if (request?.status === "pending" || !currentRoleLabel) {
    return (
      <main className="shell narrow-shell access-shell">
        <section className="login-panel access-panel">
          <p className="surface-label">
            <Clock3 aria-hidden="true" size={18} />
            Access pending
          </p>
          <h1>Preparing your workspace…</h1>
          <p>
            Your account is signed in, but an Angel Tree owner or admin still needs to approve
            internal access before this workspace opens.
          </p>

          <div className="access-summary-grid">
            <article className="access-summary-card">
              <strong>Signed in as</strong>
              <span>{userEmail ?? request?.email ?? "Pending account"}</span>
              <p>
                {scope === "crew"
                  ? "Crew access stays locked until the request is approved."
                  : "Admin and operations routes stay protected until approval is complete."}
              </p>
            </article>
            <article className="access-summary-card">
              <strong>Requested access</strong>
              <span>{formatRequestedRole(request?.requested_role)}</span>
              <p>
                {request?.created_at
                  ? `Submitted ${formatDateTime(request.created_at)}`
                  : "Submit an employee access request from the login page if this account is new."}
              </p>
            </article>
          </div>

          <div className="access-note">
            <ShieldCheck aria-hidden="true" size={18} />
            <p>
              You can stay signed in, but the internal app stays closed until approval is granted.
            </p>
          </div>

          <div className="action-row">
            <Link className="secondary-action" href="/login">
              <Leaf aria-hidden="true" size={18} />
              Open login
            </Link>
            <form action={signOut}>
              <button className="secondary-action button-reset" type="submit">
                <LogOut aria-hidden="true" size={18} />
                Sign out
              </button>
            </form>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="shell narrow-shell access-shell">
      <section className="login-panel access-panel">
        <p className="surface-label">
          <HardHat aria-hidden="true" size={18} />
          Access required
        </p>
        <h1>This account cannot open this route.</h1>
        <p>
          The current role is active, but it does not include permission for the {scope} workspace.
        </p>

        <div className="access-summary-card">
          <strong>Current account</strong>
          <span>{userEmail ?? "Signed-in account"}</span>
          <p>{currentRoleLabel}</p>
        </div>

        <div className="action-row">
          <Link className="secondary-action" href="/login">
            <UserRoundPlus aria-hidden="true" size={18} />
            Open login
          </Link>
          <form action={signOut}>
            <button className="secondary-action button-reset" type="submit">
              <LogOut aria-hidden="true" size={18} />
              Sign out
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}

function formatRequestedRole(value?: string | null) {
  if (!value) {
    return "Employee access request";
  }

  return value.replaceAll("_", " ");
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}
