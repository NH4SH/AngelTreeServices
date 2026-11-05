-- REVIEW ONLY: a new source-specific receipt admission delta after the frozen receipt102 prerequisite.
-- No canonical migration or financial/finish/repair command is modified.
begin;
set local lock_timeout='3s';
set local statement_timeout='20s';
do $review$
declare definition text;before_acl aclitem[];before_owner oid;before_settings text[];before_definer boolean;
  early text:=$early$  if not (d.state='prepared' or (d.state='rejected' and d.retry_authorized)) or d.attempt_count>=3 then return null;end if;
$early$;
  late text:=$late$  a:=gen_random_uuid();
$late$;
  guard text:=$guard$  -- Firewood receipt sending is independent of new collection and fulfillment holds.
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
$guard$;
begin
  if current_setting('ats.firewood_receipt_review',true)is distinct from 'isolated-synthetic-only' then
    raise exception 'Explicit isolated synthetic receipt review required.'using errcode='42501';end if;
  if (select md5(prosrc) from pg_proc where oid='public.claim_outbound_delivery(uuid)'::regprocedure)<> '300389d99e9409f36610eaa971caee04'
    or (select md5(prosrc) from pg_proc where oid='public.finish_outbound_delivery(uuid,uuid,text,text)'::regprocedure)<> 'aef215ac8c91811aefba30a8c1798583' then
    raise exception 'Delivery command preimage changed; review the exact102 prerequisite and finish behavior.';end if;
  select proacl,proowner,proconfig,prosecdef into before_acl,before_owner,before_settings,before_definer from pg_proc where oid='public.claim_outbound_delivery(uuid)'::regprocedure;
  if pg_get_userbyid(before_owner)<>'postgres' or before_definer is distinct from true or before_settings is distinct from array['search_path=""']
    or (select array_agg(x::text order by x::text)from unnest(before_acl)x)is distinct from array['postgres=X/postgres','service_role=X/postgres'] then
    raise exception 'Delivery claim owner or access boundary changed.';end if;
  definition:=pg_get_functiondef('public.claim_outbound_delivery(uuid)'::regprocedure);
  if (length(definition)-length(replace(definition,early,'')))/length(early)<>1
    or (length(definition)-length(replace(definition,late,'')))/length(late)<>1 then raise exception 'Delivery admission anchors changed.';end if;
  execute replace(replace(definition,early,early||guard),late,guard||late);
  if (select md5(prosrc) from pg_proc where oid='public.claim_outbound_delivery(uuid)'::regprocedure)<> '409f0e55cdc9a0075b1e4d42307a567d'
    or exists(select 1 from pg_proc where oid='public.claim_outbound_delivery(uuid)'::regprocedure and
      (proacl is distinct from before_acl or proowner is distinct from before_owner or proconfig is distinct from before_settings or prosecdef is distinct from before_definer)) then
    raise exception 'Delivery claim postimage or access boundary differs.';end if;
end $review$;
notify pgrst,'reload schema';
commit;
