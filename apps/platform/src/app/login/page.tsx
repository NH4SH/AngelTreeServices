import Link from "next/link";
import { Leaf, LogOut, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "./actions";
import { LoginForm } from "./LoginForm";

type LoginPageProps = {
  searchParams: Promise<{
    next?: string;
    signedOut?: string;
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const nextPath = params.next?.startsWith("/") ? params.next : "/admin";
  const supabase = await createClient();
  const configured = Boolean(supabase);
  const {
    data: { user },
  } = supabase ? await supabase.auth.getUser() : { data: { user: null } };

  return (
    <main className="shell narrow-shell">
      <section className="login-panel">
        <p className="surface-label">
          <Leaf aria-hidden="true" size={18} />
          Login Shell
        </p>
        <h1>Sign in to Angel Tree Services</h1>
        <p>
          Use Supabase Auth to access protected platform areas. Staff, crew, customers, and
          organization contacts will share this entry point as role checks mature.
        </p>

        {user ? (
          <div className="signed-in-panel">
            <div>
              <strong>Signed in as {user.email}</strong>
              <p>You can open the protected app shell or sign out.</p>
            </div>
            <div className="action-row">
              <Link className="primary-action" href="/admin">
                <ShieldCheck aria-hidden="true" size={18} />
                Open admin
              </Link>
              <form action={signOut}>
                <button className="secondary-action button-reset" type="submit">
                  <LogOut aria-hidden="true" size={18} />
                  Sign out
                </button>
              </form>
            </div>
          </div>
        ) : (
          <LoginForm
            configured={configured}
            nextPath={nextPath}
            signedOut={params.signedOut === "true"}
          />
        )}
      </section>
    </main>
  );
}
