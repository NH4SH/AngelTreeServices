import { AlertTriangle, Award, ClipboardCheck, ShieldCheck, UsersRound } from "lucide-react";
import { PlatformFrame } from "@/components/PlatformFrame";
import { SetupRequired } from "@/components/SetupRequired";
import { getAuthenticatedPlatformContext } from "@/lib/auth/pageContext";
import { getMySupervisedTeam } from "@/lib/data/employees";

export default async function CrewTeamPage() {
  const context = await getAuthenticatedPlatformContext("/crew/team");
  if (!context.configured) return <SetupRequired title="Configure Supabase before opening crew readiness" />;
  const result = await getMySupervisedTeam();
  const team = result.data;
  return <PlatformFrame active="crew-team" roles={context.roles} userEmail={context.user.email}><div className="crew-shell app-content employee-team-page">
    <section className="crew-hero"><p className="surface-label"><UsersRound size={18} />Supervisor view</p><h1>My crew</h1><p>Operational onboarding, training, credential, and safety readiness only. Private HR details and platform role controls are not available here.</p></section>
    {result.error ? <section className="data-warning"><strong>Crew readiness unavailable</strong><p>{result.error}</p></section> : null}
    {!team?.is_supervisor ? <section className="crew-panel"><h2>Supervisor access required</h2><p>Your employee record is not marked as a crew supervisor. Your own records remain available under My Employee Profile.</p></section> : team.employees.length ? <section className="employee-team-list">{team.employees.map((employee) => { const expired = employee.credentials.filter((credential) => credential.expiration_date && new Date(credential.expiration_date) < new Date()).length; return <article className="crew-panel employee-team-card" key={employee.id}><div className="record-card-header"><div><p className="record-kicker">{employee.crew_name || "Crew not assigned"}</p><h2>{employee.preferred_name || employee.legal_name || "Employee"}</h2><p>{employee.job_title || "Job title not set"}</p></div><span className={`employee-status status-${employee.employment_status}`}>{title(employee.employment_status)}</span></div><div className="employee-team-signals"><span><ClipboardCheck size={17} /><strong>{employee.onboarding_progress}%</strong> onboarding</span><span className={expired ? "attention-text" : ""}><Award size={17} /><strong>{expired}</strong> expired</span><span><ShieldCheck size={17} /><strong>{employee.training_count}</strong> training records</span>{employee.pending_safety_acknowledgments ? <span className="attention-text"><AlertTriangle size={17} /><strong>{employee.pending_safety_acknowledgments}</strong> safety acknowledgments</span> : null}</div>{employee.documents.length ? <details className="employee-self-details"><summary>Approved crew documents ({employee.documents.length})</summary><div className="quick-action-list">{employee.documents.map((document) => document.signed_url ? <a href={document.signed_url} key={document.id} rel="noreferrer" target="_blank">{document.title}</a> : null)}</div></details> : null}</article>; })}</section> : <section className="crew-panel"><h2>No employees assigned</h2><p>Assign direct reports or a matching crew on the admin employee record.</p></section>}
  </div></PlatformFrame>;
}

function title(value: string) { return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
