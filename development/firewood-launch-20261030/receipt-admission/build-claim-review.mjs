// Offline review artifact builder. Reads only retained synthetic schema and frozen prerequisites.
// Does not connect a database, read credentials, or alter any canonical migration.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const root = new URL('../', import.meta.url);
const baselinePath = new URL('/Users/noelsierra/Documents/Codex/2026-10-30/firewood-accounting-repair/target-28956add6ba1/baseline-catalog.private.json', 'file:');
const prerequisitePath = new URL('acceptance-profile/artifacts-hermetic-v1/prerequisites/payment-receipt-102.review.sql.review-only.txt', root);
const baseline = JSON.parse(await readFile(baselinePath, 'utf8')), prerequisite = await readFile(prerequisitePath, 'utf8');
const body = name => {
  const row = baseline.functions.find(item => item.name === name && item.schema === 'public');
  assert.ok(row);
  const match = row.definition.match(/AS (\$[^$]*\$)(.*?)\1/s);
  assert.ok(match, name); return match[2];
};
const digest = (value, kind = 'sha256') => createHash(kind).update(value).digest('hex');
assert.equal(digest(prerequisite), 'f0009ec4c0c51b7e14cf8ec51554d8bec2dc42bb22c896f1cc18e39afba73327');
assert.equal(digest(baseline.functions.find(item => item.name === 'claim_outbound_delivery' && item.schema === 'public').definition),
  'c26a7c1649ea6858779cb22657ee847735660804e9b3ef9e2e00dd7fc88173d7');
const paymentAnchor = prerequisite.match(/anchor text:=\$anchor\$(.*?)\$anchor\$/s)?.[1];
const paymentReplacement = prerequisite.match(/replacement text:=\$replacement\$(.*?)\$replacement\$/s)?.[1];
assert.ok(paymentAnchor && paymentReplacement);
const raw102 = body('claim_outbound_delivery'), finish = body('finish_outbound_delivery');
assert.equal(raw102.split(paymentAnchor).length, 2);
const current = raw102.replace(paymentAnchor, () => paymentReplacement);
assert.equal(digest(raw102, 'md5'), '1900fbc1f487cd9847db7fdb32729e5a');
assert.equal(digest(current, 'md5'), '300389d99e9409f36610eaa971caee04');
assert.equal(digest(finish, 'md5'), 'aef215ac8c91811aefba30a8c1798583');

const guard = `  -- Firewood receipt sending is independent of new collection and fulfillment holds.
  -- Existing source/delivery lock order is retained. A source transition never adds a wait.
  if d.context->>'email_type'='payment_confirmation' then
    declare fw_payment_invoice uuid;fw_payment_status text;fw_declared_invoice uuid;
      fw_invoice public.invoices%rowtype;fw_declared public.invoices%rowtype;
      fw_handoff app_private.firewood_live_handoffs%rowtype;
      fw_sender app_private.firewood_live_handoff_sources%rowtype;fw_marked boolean;
    begin
      if coalesce(d.context->>'payment_id','')~*'^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$' then
        select p.invoice_id,p.status into fw_payment_invoice,fw_payment_status from public.payments p where p.id=(d.context->>'payment_id')::uuid;
      end if;
      if coalesce(d.context->>'invoice_id','')~*'^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$' then
        fw_declared_invoice:=(d.context->>'invoice_id')::uuid;
        select * into fw_declared from public.invoices where id=fw_declared_invoice;
      end if;
      select * into fw_invoice from public.invoices where id=fw_payment_invoice;
      fw_marked:=coalesce(fw_invoice.document_terms_version like 'firewood-household-live-%',false)
        or coalesce(fw_invoice.invoice_number like 'INV-FW-%',false)
        or coalesce(fw_declared.document_terms_version like 'firewood-household-live-%',false)
        or coalesce(fw_declared.invoice_number like 'INV-FW-%',false)
        or exists(select 1 from app_private.firewood_live_handoffs h where h.invoice_id in(fw_payment_invoice,fw_declared_invoice));
      if fw_marked then
        -- The actual invoice must already be locked by the original lock_email_sources.
        -- Never infer authority from an arbitrary invoice_id supplied in the saved context.
        if fw_payment_invoice is null or fw_payment_status is distinct from 'succeeded'
          or fw_declared_invoice is distinct from fw_payment_invoice or fw_invoice.id is null
          or fw_invoice.document_terms_version is distinct from 'firewood-household-live-2026-10-29-v1' then return null;end if;
        select * into fw_handoff from app_private.firewood_live_handoffs where invoice_id=fw_payment_invoice;
        if not found or fw_handoff.source_id is distinct from 'website_firewood_invoice_live_v1'
          or fw_invoice.invoice_number is distinct from 'INV-FW-'||upper(fw_handoff.order_id::text)
          or fw_handoff.payload->>'contract' is distinct from 'firewood-invoice-handoff-live-v1'
          or fw_handoff.payload->>'source_id' is distinct from 'website_firewood_invoice_live_v1'
          or fw_handoff.payload->>'environment_id' is distinct from 'ats_firewood_live_v1'
          or fw_handoff.payload->>'account_id' is distinct from 'acct_1Tv92EI7tY6VHUvU'
          or fw_handoff.payload->>'mode' is distinct from 'live' then return null;end if;
        begin
          select * into fw_sender from app_private.firewood_live_handoff_sources where id=fw_handoff.source_id for share nowait;
        exception when lock_not_available then return null;end;
        if not found or fw_sender.sender_enabled is distinct from true
          or fw_sender.id is distinct from 'website_firewood_invoice_live_v1'
          or fw_sender.environment_id is distinct from 'ats_firewood_live_v1'
          or fw_sender.stripe_account_id is distinct from 'acct_1Tv92EI7tY6VHUvU' then return null;end if;
      end if;
    end;
  end if;
`;
const early = "  if not (d.state='prepared' or (d.state='rejected' and d.retry_authorized)) or d.attempt_count>=3 then return null;end if;\n";
const late = '  a:=gen_random_uuid();\n';
assert.equal(current.split(early).length, 2); assert.equal(current.split(late).length, 2);
const proposed = current.replace(early, () => early + guard).replace(late, () => guard + late);
assert.equal(proposed.split(guard).length, 3);
assert.equal(proposed.split(guard).join(''), current);
const sql = `-- REVIEW ONLY: a new source-specific receipt admission delta after the frozen receipt102 prerequisite.
-- No canonical migration or financial/finish/repair command is modified.
begin;
set local lock_timeout='3s';
set local statement_timeout='20s';
do $review$
declare definition text;before_acl aclitem[];before_owner oid;before_settings text[];before_definer boolean;
  early text:=$early$${early}$early$;
  late text:=$late$${late}$late$;
  guard text:=$guard$${guard}$guard$;
begin
  if current_setting('ats.firewood_receipt_review',true)is distinct from 'isolated-synthetic-only' then
    raise exception 'Explicit isolated synthetic receipt review required.'using errcode='42501';end if;
  if (select md5(prosrc) from pg_proc where oid='public.claim_outbound_delivery(uuid)'::regprocedure)<> '${digest(current, 'md5')}'
    or (select md5(prosrc) from pg_proc where oid='public.finish_outbound_delivery(uuid,uuid,text,text)'::regprocedure)<> '${digest(finish, 'md5')}' then
    raise exception 'Delivery command preimage changed; review the exact102 prerequisite and finish behavior.';end if;
  select proacl,proowner,proconfig,prosecdef into before_acl,before_owner,before_settings,before_definer from pg_proc where oid='public.claim_outbound_delivery(uuid)'::regprocedure;
  if pg_get_userbyid(before_owner)<>'postgres' or before_definer is distinct from true or before_settings is distinct from array['search_path=""']
    or (select array_agg(x::text order by x::text)from unnest(before_acl)x)is distinct from array['postgres=X/postgres','service_role=X/postgres'] then
    raise exception 'Delivery claim owner or access boundary changed.';end if;
  definition:=pg_get_functiondef('public.claim_outbound_delivery(uuid)'::regprocedure);
  if (length(definition)-length(replace(definition,early,'')))/length(early)<>1
    or (length(definition)-length(replace(definition,late,'')))/length(late)<>1 then raise exception 'Delivery admission anchors changed.';end if;
  execute replace(replace(definition,early,early||guard),late,guard||late);
  if (select md5(prosrc) from pg_proc where oid='public.claim_outbound_delivery(uuid)'::regprocedure)<> '${digest(proposed, 'md5')}'
    or exists(select 1 from pg_proc where oid='public.claim_outbound_delivery(uuid)'::regprocedure and
      (proacl is distinct from before_acl or proowner is distinct from before_owner or proconfig is distinct from before_settings or prosecdef is distinct from before_definer)) then
    raise exception 'Delivery claim postimage or access boundary differs.';end if;
end $review$;
notify pgrst,'reload schema';
commit;
`;
await writeFile(new URL('claim-receipt-admission.sql.review-only.txt', import.meta.url), sql);
await writeFile(new URL('CLAIM_SOURCE_PROOF.json', import.meta.url), JSON.stringify({
  kind: 'offline-exact-preimage-receipt-claim-transform', productionChanged: false,
  raw102ClaimMd5: digest(raw102, 'md5'), postPrerequisiteClaimMd5: digest(current, 'md5'),
  unchangedFinishMd5: digest(finish, 'md5'), proposedClaimMd5: digest(proposed, 'md5'),
  rawClaimSha256: digest(raw102), prerequisiteSha256: digest(prerequisite),
  preimageProsrcSha256: digest(current), postimageProsrcSha256: digest(proposed),
  proposedUnitSha256: digest(sql), insertionCount: 2, removingInsertionsRestoresExactPreimage: true,
  ownerAclConfigurationPreserved: 'asserted by review unit; actual native QA required',
}, null, 2) + '\n');
console.log(JSON.stringify({ postPrerequisiteClaimMd5: digest(current, 'md5'), proposedClaimMd5: digest(proposed, 'md5'), sqlSha256: digest(sql) }));
