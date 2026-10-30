import { AlertCircle } from "lucide-react";
import { getMissingSupabaseEnvVars } from "@/lib/supabase/config";

type SetupRequiredProps = {
  title?: string;
};

export function SetupRequired({
  title = "Supabase setup is required",
}: SetupRequiredProps) {
  const missingVars = getMissingSupabaseEnvVars();

  return (
    <main className="shell narrow-shell">
      <section className="setup-panel">
        <p className="surface-label">
          <AlertCircle aria-hidden="true" size={18} />
          Configuration needed
        </p>
        <h1>{title}</h1>
        <p>
          Add the public Supabase URL and anon key to <code>apps/platform/.env.local</code>, then restart
          the Next.js dev server. The app is rendering this setup screen instead of throwing a runtime error.
        </p>
        {missingVars.length > 0 ? (
          <ul className="env-list" aria-label="Missing Supabase environment variables">
            {missingVars.map((name) => (
              <li key={name}>
                <code>{name}</code>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </main>
  );
}
