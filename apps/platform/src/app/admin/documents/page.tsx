import Link from "next/link";
import { Archive, Download, FileText, Files, Search } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { PlatformFrame } from "@/components/PlatformFrame";
import { SetupRequired } from "@/components/SetupRequired";
import { getAuthenticatedPlatformContext } from "@/lib/auth/pageContext";
import { hasAllowedRole, platformRoleGroups } from "@/lib/auth/roles";
import type { PlatformDocument } from "@/lib/types/database";
import { archivePlatformDocument } from "./actions";
import { DocumentUploadForm, type DocumentLinkOptions } from "./DocumentUploadForm";

type DocumentsPageProps = {
  searchParams: Promise<{ q?: string; type?: string }>;
};

type DocumentRow = PlatformDocument & {
  uploaded_by?: { full_name: string | null; email: string | null } | null;
  customers?: { display_name: string } | null;
  organizations?: { name: string } | null;
  jobs?: { service_type: string | null } | null;
  quotes?: { quote_number: string | null } | null;
  invoices?: { invoice_number: string | null } | null;
  employee_records?: { preferred_name: string | null; legal_name: string } | null;
  equipment_assets?: { name: string; asset_number: string } | null;
};

const documentTypes = [
  "contract", "proposal", "invoice", "work_order", "insurance", "permit",
  "safety", "employee", "equipment", "photo", "receipt", "other",
] as const;

export default async function DocumentsPage({ searchParams }: DocumentsPageProps) {
  const context = await getAuthenticatedPlatformContext("/admin/documents");
  if (!context.configured) return <SetupRequired title="Configure Supabase before opening documents" />;

  const params = await searchParams;
  const queryText = String(params.q ?? "").trim().slice(0, 80);
  const typeFilter = documentTypes.includes(params.type as (typeof documentTypes)[number]) ? params.type : "";
  let documentsQuery = context.supabase
    .from("documents")
    .select("*, uploaded_by:profiles!documents_uploaded_by_user_id_fkey(full_name, email), customers(display_name), organizations(name), jobs(service_type), quotes(quote_number), invoices(invoice_number), employee_records(preferred_name, legal_name), equipment_assets(name, asset_number)")
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .limit(200);
  if (queryText) documentsQuery = documentsQuery.ilike("title", `%${queryText}%`);
  if (typeFilter) documentsQuery = documentsQuery.eq("document_type", typeFilter);

  const [documentsResult, optionsResult] = await Promise.all([
    documentsQuery,
    getDocumentLinkOptions(context.supabase),
  ]);
  const documents = (documentsResult.data ?? []) as unknown as DocumentRow[];
  const paths = documents.map((document) => document.storage_path);
  const signedResult = paths.length
    ? await context.supabase.storage.from("platform-documents").createSignedUrls(paths, 1800)
    : { data: [], error: null };
  const signedByPath = new Map((signedResult.data ?? []).map((file) => [file.path, file.signedUrl]));
  const error = documentsResult.error?.message ?? optionsResult.error ?? signedResult.error?.message ?? null;
  if (error) console.error("Documents page data load failed", { error });

  return (
    <PlatformFrame active="documents" roles={context.roles} userEmail={context.user.email}>
      <div className="shell app-content">
        <section className="page-heading">
          <p className="surface-label"><Files aria-hidden="true" size={18} />Documents</p>
          <h1>Documents</h1>
          <p>Store operational files privately and link them to the record where staff will need them.</p>
        </section>

        {error ? <section className="data-warning"><strong>Documents unavailable</strong><p>{error}</p></section> : null}

        <form className="schedule-filter-form" method="get">
          <label><span>Search</span><input defaultValue={queryText} name="q" placeholder="Document title" /></label>
          <label><span>Type</span><select defaultValue={typeFilter} name="type"><option value="">All types</option>{documentTypes.map((type) => <option key={type} value={type}>{title(type)}</option>)}</select></label>
          <button type="submit"><Search aria-hidden="true" size={17} />Search</button>
          {(queryText || typeFilter) ? <Link className="secondary-action" href="/admin/documents">Clear</Link> : null}
        </form>

        <div className="crm-layout">
          <section className="crm-main">
            {documents.length ? (
              <div className="record-list">
                {documents.map((document) => {
                  const signedUrl = signedByPath.get(document.storage_path);
                  return (
                    <article className="record-card" key={document.id}>
                      <div className="record-card-header">
                        <div><p className="record-kicker">{title(document.document_type)}</p><h2>{document.title}</h2></div>
                        <span className="status-pill">{document.access_classification === "employee_sensitive" ? "Restricted" : "Staff"}</span>
                      </div>
                      <dl className="record-details">
                        <div><dt>Linked record</dt><dd>{linkedRecordLabel(document)}</dd></div>
                        <div><dt>Uploaded</dt><dd>{formatDate(document.created_at)}</dd></div>
                        <div><dt>Uploaded by</dt><dd>{one(document.uploaded_by)?.full_name || one(document.uploaded_by)?.email || "Staff"}</dd></div>
                        <div><dt>Expires</dt><dd>{document.expires_at ? formatDate(document.expires_at) : "No expiration"}</dd></div>
                      </dl>
                      <div className="action-row">
                        {signedUrl ? <a className="secondary-action" href={signedUrl} rel="noreferrer" target="_blank"><Download aria-hidden="true" size={17} />Open / download</a> : <span className="field-note">Secure download unavailable.</span>}
                        <form action={archivePlatformDocument}>
                          <input name="document_id" type="hidden" value={document.id} />
                          <button className="secondary-action" type="submit"><Archive aria-hidden="true" size={16} />Archive</button>
                        </form>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <section className="empty-state">
                <FileText aria-hidden="true" size={28} />
                <h2>{queryText || typeFilter ? "No documents match these filters" : "No documents uploaded yet"}</h2>
                <p>{queryText || typeFilter ? "Clear the filters or try a different title." : "Upload the first private operational document using the form."}</p>
              </section>
            )}
          </section>
          <aside className="form-panel">
            <h2>Upload document</h2>
            <p>Files are private and opened through short-lived secure links.</p>
            <DocumentUploadForm
              canUploadSensitive={hasAllowedRole(context.roles, platformRoleGroups.accessApproval)}
              options={optionsResult.options}
            />
          </aside>
        </div>
      </div>
    </PlatformFrame>
  );
}

async function getDocumentLinkOptions(supabase: SupabaseClient<any, "public", any>) {
  const [customers, organizations, jobs, quotes, invoices, employees, equipment] = await Promise.all([
    supabase.from("customers").select("id, display_name").neq("status", "archived").order("display_name").limit(250),
    supabase.from("organizations").select("id, name").neq("status", "archived").order("name").limit(250),
    supabase.from("jobs").select("id, service_type, customers:customers!jobs_customer_id_fkey(display_name), organizations(name)").order("updated_at", { ascending: false }).limit(250),
    supabase.from("quotes").select("id, quote_number, customers:customers!quotes_customer_id_fkey(display_name), organizations(name)").order("updated_at", { ascending: false }).limit(250),
    supabase.from("invoices").select("id, invoice_number, customers:customers!invoices_customer_id_fkey(display_name), organizations(name)").order("updated_at", { ascending: false }).limit(250),
    supabase.from("employee_records").select("id, preferred_name, legal_name").is("archived_at", null).order("preferred_name").limit(250),
    supabase.from("equipment_assets").select("id, name, asset_number").is("archived_at", null).order("name").limit(250),
  ]);
  const errors = [customers, organizations, jobs, quotes, invoices, employees, equipment].map((result) => result.error?.message).filter(Boolean);
  const options: DocumentLinkOptions = {
    customer: (customers.data ?? []).map((row) => ({ id: row.id, label: row.display_name })),
    organization: (organizations.data ?? []).map((row) => ({ id: row.id, label: row.name })),
    job: (jobs.data ?? []).map((row) => ({ id: row.id, label: `${partyLabel(row)} - ${title(row.service_type || "work order")}` })),
    quote: (quotes.data ?? []).map((row) => ({ id: row.id, label: `${row.quote_number || `Quote for ${partyLabel(row)}`} - ${partyLabel(row)}` })),
    invoice: (invoices.data ?? []).map((row) => ({ id: row.id, label: `${row.invoice_number || `Invoice for ${partyLabel(row)}`} - ${partyLabel(row)}` })),
    employee: (employees.data ?? []).map((row) => ({ id: row.id, label: row.preferred_name || row.legal_name })),
    equipment: (equipment.data ?? []).map((row) => ({ id: row.id, label: `${row.asset_number} - ${row.name}` })),
  };
  return { options, error: errors[0] ?? null };
}

function linkedRecordLabel(document: DocumentRow) {
  return one(document.customers)?.display_name
    || one(document.organizations)?.name
    || one(document.quotes)?.quote_number
    || one(document.invoices)?.invoice_number
    || one(document.employee_records)?.preferred_name
    || one(document.employee_records)?.legal_name
    || (one(document.equipment_assets) ? `${one(document.equipment_assets)?.asset_number} - ${one(document.equipment_assets)?.name}` : null)
    || (one(document.jobs)?.service_type ? title(one(document.jobs)?.service_type || "") : null)
    || "Not linked";
}

function partyLabel(row: { customers?: unknown; organizations?: unknown }) {
  const organization = one(row.organizations as { name?: string } | { name?: string }[] | null);
  const customer = one(row.customers as { display_name?: string } | { display_name?: string }[] | null);
  return organization?.name || customer?.display_name || "Unknown party";
}

function one<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function title(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(value));
}
