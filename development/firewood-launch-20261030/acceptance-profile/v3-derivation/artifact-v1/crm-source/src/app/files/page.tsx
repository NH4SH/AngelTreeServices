import "./files.css";
import Link from "next/link";
import { escapeSearchLike } from "@/lib/record-search";
import { PlatformFrame } from "@/components/PlatformFrame";
import { SetupRequired } from "@/components/SetupRequired";
import { getAuthenticatedPlatformContext } from "@/lib/auth/pageContext";
import { AttachmentScanControl } from "./AttachmentScanControl";
const areas: Record<string,string> = {"employee-files":"Employee files","employee-program-files":"Training & safety","equipment-files":"Equipment","material-files":"Materials & deliveries","job-cost-receipts":"Job receipts","job-photos":"Job photos"};
type Row = {bucket_id:string;storage_path:string;source_type:string;source_id:string;label:string;status:string;enabled:boolean;can_retry:boolean;can_open:boolean};
export default async function FileChecks({searchParams}:{searchParams:Promise<{bucket?:string;page?:string;view?:string;q?:string;source?:string;id?:string}>}) {
  const context = await getAuthenticatedPlatformContext("/files");
  if (!context.configured) return <SetupRequired title="Configure Supabase before checking files"/>;
  const params = await searchParams; const bucket = params.bucket && areas[params.bucket] ? params.bucket : "";
  const page = Math.min(10000,Math.max(1,Number.parseInt(params.page??"1",10)||1)); const all = params.view === "all";
  const search = (params.q??"").trim().slice(0,80);
  const source = /^[a-z_]{1,40}$/.test(params.source??"") && /^[0-9a-f-]{36}$/i.test(params.id??"") ? {source:params.source!,id:params.id!} : null;
  let query = context.supabase.from("attachment_file_checks").select("*").order("bucket_id").order("source_type").order("source_id").range((page-1)*25,page*25);
  if (search) query = query.ilike("label",`%${escapeSearchLike(search)}%`);
  if (source) query = query.eq("source_type",source.source).eq("source_id",source.id);
  if (bucket) query = query.eq("bucket_id",bucket);
  if (!all) query = query.eq("enabled",true).neq("status","clean");
  const result = await query; const rows = (result.data??[]) as Row[]; const more = rows.length > 25;
  const href = (next:number) => `/files?${new URLSearchParams({...(bucket?{bucket}:{}),...(all?{view:"all"}:{}),...(search?{q:search}:{}),...(source??{}),page:String(next)})}`;
  return <PlatformFrame active="documents" roles={context.roles} userEmail={context.user.email}>
    <div className="shell app-content file-checks">
      <section className="page-heading"><h1>File checks</h1><p>Check held attachments before opening them. The original records and access permissions stay in place.</p></section>
      <form className="schedule-filter-form" method="get">
        {source ? <><input type="hidden" name="source" value={source.source}/><input type="hidden" name="id" value={source.id}/></> : null}
        <label><span>Search</span><input name="q" placeholder="Attachment title" defaultValue={search}/></label>
        <label><span>Attachment area</span><select name="bucket" defaultValue={bucket}><option value="">All areas</option>{Object.entries(areas).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>
        <label><span>Show</span><select name="view" defaultValue={all?"all":"held"}><option value="held">Needs a check</option><option value="all">All attachments</option></select></label><button type="submit">Apply</button>
        {(source || search || bucket) ? <Link className="secondary-action" href="/files">Clear filters</Link> : null}
      </form>
      {result.error ? <section className="data-warning"><h2>File checks unavailable</h2><p>Refresh to try again. Files waiting for a check remain held.</p></section> : rows.length ? <section aria-label="Attachments" className="attachment-check-list">
        {rows.slice(0,25).map(row=><article className="attachment-check-row" key={`${row.source_type}/${row.source_id}`}>
          <div><h2>{row.label || "Attachment"}</h2><p>{areas[row.bucket_id]} · {row.enabled ? statusLabel(row.status) : "Checks not enabled"}</p>
            {row.enabled && row.status === "quarantined" ? <p>Upload a safe replacement through the original record. This file cannot be opened.</p> : null}
          </div>
          <div className="attachment-check-actions">
            {row.can_open ? <a className="secondary-action" href={`/files/${row.source_type}/${row.source_id}`} target="_blank" rel="noreferrer">Open file</a>
              : row.enabled && row.status !== "clean" && row.status !== "quarantined" && row.can_retry ? <AttachmentScanControl bucket={row.bucket_id} path={row.storage_path}/>
              : row.enabled && row.status !== "clean" && row.status !== "quarantined" ? <span className="field-note">Ask the uploader or an administrator to check this file.</span> : row.status === "clean" ? <span className="field-note">Your account cannot open this file.</span> : null}
          </div>
        </article>)}
      </section> : <section className="empty-state"><h2>{all?"No attachments to show":"No files waiting for a check"}</h2><p>{all?"Attachments appear here after they are added to records you can access.":"Choose All attachments to review files that have already passed."}</p></section>}
      {(page>1 || more) && !result.error ? <nav aria-label="File check pages" className="action-row">{page>1?<Link className="secondary-action" href={href(page-1)}>Previous</Link>:null}<span>Page {page}</span>{more?<Link className="secondary-action" href={href(page+1)}>Next</Link>:null}</nav>:null}
    </div>
  </PlatformFrame>;
}
function statusLabel(status:string) { return ({unscanned:"Waiting for a check",checking:"Checking file",clean:"Passed",quarantined:"Quarantined",unavailable:"Check unavailable"} as Record<string,string>)[status] ?? "Waiting for a check"; }
