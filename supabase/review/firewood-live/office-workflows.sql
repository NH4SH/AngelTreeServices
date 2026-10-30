-- ISOLATED REVIEW ONLY. Not a production installer or migration.
-- Adds office workflow authority to the separate, inactive live profile.
-- Does not seed sources, touch frozen v2, call providers, refund or send.
-- Clean unpaid cancellation uses the existing guarded invoice-void commands.
do $$begin
 if current_setting('ats.firewood_live_review',true)is distinct from'isolated-synthetic-only'
 or to_regclass('app_private.firewood_live_handoffs')is null then
  raise exception 'Explicit isolated live office review and base boundary required.'using errcode='42501';
 end if;
 if to_regprocedure('public.begin_invoice_void(uuid)')is null or to_regprocedure('public.finalize_invoice_void(uuid,uuid)')is null or to_regclass('app_private.invoice_void_leases')is null then
  raise exception 'Original guarded invoice void prerequisites required.'using errcode='23514';
 end if;
 if to_regclass('app_private.firewood_live_office_requests')is not null then
  raise exception 'Office objects already exist; preserve history and reconcile.'using errcode='23514';
 end if;
end $$;
create table app_private.firewood_live_office_requests(
 source_id text not null references app_private.firewood_live_handoff_sources(id),order_id uuid not null,
 reference text not null,draft jsonb not null,draft_hash text not null check(draft_hash~'^[a-f0-9]{64}$'),
 revision integer not null default 1 check(revision>0),status text not null default'pending'check(status in('pending','approved','revoked')),
 approval_id uuid references app_private.firewood_live_price_approvals(id),
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 primary key(source_id,order_id),unique(source_id,reference)
);
create table app_private.firewood_live_order_workflows(
 invoice_id uuid primary key references public.invoices(id),source_id text not null,order_id uuid not null,
 revision integer not null default 0 check(revision>=0),state text not null default'active'check(state in('active','cancellation_requested','cancelled')),
 delivery_window_start timestamptz,delivery_window_end timestamptz,delivery_evidence text,
 cancellation_reason_code text check(cancellation_reason_code in('customer_request','angel_cancelled','cannot_fulfill','declined_angel_reschedule')),
 cancellation_reason text,requested_at timestamptz,requested_by uuid references auth.users(id),
 confirmed_at timestamptz,confirmed_by uuid references auth.users(id),
 refund_eligibility text check(refund_eligibility in('full','non_refundable')),
 foreign key(source_id,order_id)references app_private.firewood_live_handoffs(source_id,order_id),
 check((delivery_window_start is null and delivery_window_end is null)or(delivery_window_start is not null and delivery_window_end>delivery_window_start)),
 check((state='active'and requested_at is null and confirmed_at is null)or(state='cancellation_requested'and requested_at is not null and confirmed_at is null)or(state='cancelled'and requested_at is not null and confirmed_at is not null)),
 check(state='active'or(refund_eligibility is not null and cancellation_reason_code is not null and length(btrim(cancellation_reason))between 1 and 1000))
);
create table app_private.firewood_live_office_events(
 id uuid primary key default gen_random_uuid(),order_id uuid not null,invoice_id uuid references public.invoices(id),
 revision integer not null,operation text not null,actor_id uuid not null references auth.users(id),
 details jsonb not null,created_at timestamptz not null default clock_timestamp()
);
create index firewood_live_office_events_recent on app_private.firewood_live_office_events(order_id,created_at desc,id desc);
create table app_private.firewood_live_office_receipts(
 request_id uuid primary key,actor_id uuid not null references auth.users(id),operation text not null,payload jsonb not null,
 response jsonb not null,created_at timestamptz not null default clock_timestamp()
);
alter table app_private.firewood_live_office_requests enable row level security;
alter table app_private.firewood_live_order_workflows enable row level security;
alter table app_private.firewood_live_office_events enable row level security;
alter table app_private.firewood_live_office_receipts enable row level security;
revoke all on app_private.firewood_live_office_requests,app_private.firewood_live_order_workflows,app_private.firewood_live_office_events,app_private.firewood_live_office_receipts from public,anon,authenticated,service_role;

create function app_private.firewood_live_office_actor()returns uuid language plpgsql security invoker set search_path='' set timezone='UTC' as $$
declare actor uuid;begin
 perform pg_advisory_xact_lock(hashtext('platform-role-management'));
 actor:=auth.uid();
 if current_setting('role',true)is distinct from'authenticated'or actor is null or not coalesce(app_private.has_platform_admin_role(),false)then
  raise exception 'Active CRM owner or admin required.'using errcode='42501';
 end if;return actor;
end $$;
create function app_private.firewood_live_office_replay(p_actor uuid,p_request uuid,p_operation text,p_payload jsonb)returns jsonb language plpgsql security invoker set search_path='' set timezone='UTC' as $$
declare r app_private.firewood_live_office_receipts%rowtype;begin
 if p_request is null then raise exception 'Request identity required.'using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('firewood-office-request:'||p_request::text,0));
 select *into r from app_private.firewood_live_office_receipts where request_id=p_request;
 if not found then return null;end if;
 if r.actor_id<>p_actor or r.operation<>p_operation or r.payload is distinct from p_payload then raise exception 'Office request identity changed.'using errcode='23505';end if;
 return r.response;
end $$;
create function app_private.firewood_live_office_ack(p_actor uuid,p_request uuid,p_operation text,p_payload jsonb,p_response jsonb)returns jsonb language plpgsql security invoker set search_path='' set timezone='UTC' as $$begin
 insert into app_private.firewood_live_office_receipts(request_id,actor_id,operation,payload,response)values(p_request,p_actor,p_operation,p_payload,p_response);return p_response;
end $$;
create function app_private.firewood_live_office_prepare(p_order uuid,p_draft jsonb,p_wood integer,p_stacking integer)returns jsonb language plpgsql security invoker set search_path='' set timezone='UTC' as $$
declare o jsonb;begin
 -- This constructs an approval offer, not customer acceptance. The Website
 -- must obtain the actual acceptance before any prepared invoice exists.
 o:=jsonb_build_object('quantity',p_draft->'quantity','stacking',p_draft->'stacking','wood_cents',p_wood,'delivery_cents',0,'stacking_cents',p_stacking,'principal_cents',p_wood+p_stacking,'currency','usd','tax_cents',0,'tax_basis','va_domestic_use_locality_exempt','terms',$terms${"version":"firewood-household-live-2026-10-29-v1","currency":"usd","deliveryCents":0,"stackingCents":15000,"maximumCords":2,"notificationDays":7,"cancellationHours":48,"cutoff":"delivery-window-start","unscheduledRefund":"full","angelCancellationRefund":"full","declinedAngelRescheduleRefund":"full","lateCustomerCancellation":"non-refundable","taxBasisPoints":0,"purchaseUse":"personal-household-only","veterans":"Inform Angel before purchase; office-approved price; residential only; one discount.","timezone":"America/New_York","clauses":[{"label":"Your order","text":"This invoice records your accepted firewood quantity, delivery address, selected stacking and agreed price. Choosing a payment method does not confirm payment or complete delivery."},{"label":"Delivery and stacking","text":"Delivery is included. Optional stacking costs $150 once per delivery, with wheelbarrow access and a reasonable carry. Angel Tree Services will contact you with a delivery date within one week; this does not promise delivery within one week."},{"label":"Payment","text":"Choose bank account, card, cash or check pickup, or mail a check. Bank payments must settle, and cash or checks must be received and recorded before they count as paid."},{"label":"Card fee","text":"A 3% fee on the outstanding principal applies only to eligible US credit cards, subject to applicable limits and processor validation. Debit, prepaid, unknown-funding and non-US cards, bank payments, cash and checks are not surcharged. Review the exact fee and total before confirming, or choose another payment method."},{"label":"Cancellation","text":"A full refund applies before delivery is scheduled or at least 48 hours before the agreed delivery window begins. Later customer cancellations are non-refundable. A full refund applies if Angel cancels, cannot fulfill, or you decline an Angel-requested reschedule. Contact the office to arrange any refund."},{"label":"Household use","text":"Your accepted order confirms personal household use at the delivery address and records the qualifying Virginia domestic-fuel and local exemption with zero sales tax. Business purchases require office review."},{"label":"Veterans pricing","text":"Tell the office before purchasing. Residential veterans pricing requires office approval and applies to wood and stacking before taxes and other fees. Only one discount applies."},{"label":"Help with your order","text":"Call Angel Tree Services at (540) 388-8715. An expired payment link or failed payment does not cancel the order or create another invoice. Refunds, disputes and returned payments require office review before another payment."}],"hash":"b58eaaea481bfd1aecf509ef940a8f0bc135f7db4446784533cb3b588c6ac482","accepted":true,"householdUseConfirmed":true}$terms$::jsonb,'accepted_at_ms',floor(extract(epoch from clock_timestamp())*1000)::bigint,'office_approval',null,'contact',p_draft->'contact','payment_policy',$policy${"version":"firewood-payment-options-live-2026-10-29-v1","channels":["card","ach","cash_check_pickup","check_mail"],"credit_surcharge_bps":300,"credit_eligibility":"processor_confirmed_US_credit","debit_surcharge_bps":0,"prepaid_surcharge_bps":0,"ach_surcharge_bps":0,"offline_surcharge_bps":0,"fee_basis":"outstanding_principal","surcharge_reporting":"stripe_dedicated","exact_fee_review_before_confirmation":true,"receipt_authority":"crm","accepted":true}$policy$::jsonb);
 return jsonb_build_object('contract','firewood-invoice-handoff-live-v1','source_id','website_firewood_invoice_live_v1','environment_id','ats_firewood_live_v1','account_id','acct_1Tv92EI7tY6VHUvU','mode','live','order_id',p_order,'reference','FW-'||upper(left(p_order::text,8)),'snapshot_hash',encode(sha256(convert_to(app_private.firewood_live_handoff_canonical(o),'UTF8')),'hex'),'order',o);
end $$;
create function app_private.firewood_live_office_price_receipt(p_order uuid)returns jsonb language plpgsql security invoker set search_path='' set timezone='UTC' as $$
declare r app_private.firewood_live_office_requests%rowtype;a app_private.firewood_live_price_approvals%rowtype;s text;begin
 select *into strict r from app_private.firewood_live_office_requests where order_id=p_order;
 if r.approval_id is not null then select *into strict a from app_private.firewood_live_price_approvals where id=r.approval_id;end if;
 s:=case when r.status='revoked'or a.revoked_at is not null then'revoked'when r.status='approved'and a.consumed_invoice_id is null and a.expires_at<=clock_timestamp()then'expired'else r.status end;
 return jsonb_build_object('order_id',r.order_id,'reference',r.reference,'draft_hash',r.draft_hash,'revision',r.revision,'status',s,'approval',case when s='approved'then jsonb_build_object('approval_id',a.id,'approved_at_ms',a.approved_at_ms,'residential',true,'single_discount_confirmed',true,'expires_at',a.expires_at)else null end,'prices',case when s='approved'then jsonb_build_object('wood_cents',a.order_binding->'wood_cents','stacking_cents',a.order_binding->'stacking_cents','principal_cents',a.order_binding->'principal_cents')else null end);
end $$;
create function public.request_firewood_live_office_price(p_source text,p_order uuid,p_reference text,p_draft_hash text,p_draft jsonb)returns jsonb language plpgsql security definer set search_path='' set timezone='UTC' set lock_timeout='3s' as $$
declare r app_private.firewood_live_office_requests%rowtype;request jsonb;wood integer;stack integer;begin
 perform app_private.firewood_live_handoff_source(p_source);
 if p_order is null or p_reference is distinct from'FW-'||upper(left(p_order::text,8))or jsonb_typeof(p_draft)is distinct from'object'or p_draft-array['quantity','stacking','contact']<>'{}'::jsonb or(select count(*)from jsonb_object_keys(p_draft))<>3
 or p_draft_hash is distinct from encode(sha256(convert_to(app_private.firewood_live_handoff_canonical(p_draft),'UTF8')),'hex')then raise exception 'Invalid office price draft.'using errcode='22023';end if;
 wood:=case p_draft->>'quantity'when'half'then 30000 when'full'then 45000 when'two'then 84000 end;
 if wood is null or jsonb_typeof(p_draft->'stacking')is distinct from'boolean'then raise exception 'Invalid office price draft.'using errcode='22023';end if;
 stack:=case when(p_draft->>'stacking')::boolean then 15000 else 0 end;
 request:=app_private.firewood_live_office_prepare(p_order,p_draft,wood,stack);
 perform app_private.validate_firewood_live_handoff_request(p_source,request);
 perform pg_advisory_xact_lock(hashtextextended('firewood-live-v1-order:'||p_source||':'||p_order::text,0));
 if exists(select 1 from app_private.firewood_live_handoffs where source_id=p_source and order_id=p_order)then raise exception 'Order already accepted.'using errcode='23505';end if;
 select *into r from app_private.firewood_live_office_requests where source_id=p_source and order_id=p_order for update;
 if found then if r.draft_hash is distinct from p_draft_hash or r.draft is distinct from p_draft or r.reference is distinct from p_reference then raise exception 'Office draft identity changed.'using errcode='23505';end if;
 else insert into app_private.firewood_live_office_requests(source_id,order_id,reference,draft,draft_hash)values(p_source,p_order,p_reference,p_draft,p_draft_hash);end if;
 return app_private.firewood_live_office_price_receipt(p_order);
end $$;
create function public.read_firewood_live_office_price(p_source text,p_order uuid,p_draft_hash text)returns jsonb language plpgsql security definer set search_path='' set timezone='UTC' set lock_timeout='3s' as $$begin
 perform app_private.firewood_live_handoff_source(p_source);
 if not exists(select 1 from app_private.firewood_live_office_requests where source_id=p_source and order_id=p_order and draft_hash=p_draft_hash)then raise exception 'Office draft binding changed.'using errcode='23514';end if;
 return app_private.firewood_live_office_price_receipt(p_order);
end $$;
create function public.approve_firewood_live_office_request(p_order uuid,p_expected_revision integer,p_wood_cents integer,p_stacking_cents integer,p_reason text,p_request_id uuid)returns jsonb language plpgsql security definer set search_path='' set timezone='UTC' set lock_timeout='3s' as $$
declare actor uuid;payload jsonb;replay jsonb;r app_private.firewood_live_office_requests%rowtype;request jsonb;approval jsonb;result jsonb;begin
 actor:=app_private.firewood_live_office_actor();payload:=jsonb_build_object('order_id',p_order,'revision',p_expected_revision,'wood_cents',p_wood_cents,'stacking_cents',p_stacking_cents,'reason',p_reason);replay:=app_private.firewood_live_office_replay(actor,p_request_id,'price_approved',payload);if replay is not null then return replay;end if;
 perform pg_advisory_xact_lock(hashtextextended('firewood-live-v1-order:website_firewood_invoice_live_v1:'||p_order::text,0));
 select *into strict r from app_private.firewood_live_office_requests where order_id=p_order for update;
 if p_expected_revision is null or r.revision<>p_expected_revision or r.status<>'pending'then raise exception 'Office review changed. Refresh before approving.'using errcode='40001';end if;
 request:=app_private.firewood_live_office_prepare(p_order,r.draft,p_wood_cents,p_stacking_cents);
 approval:=public.approve_firewood_live_price(r.source_id,request,p_reason,p_request_id);
 update app_private.firewood_live_office_requests set approval_id=(approval->>'approval_id')::uuid,status='approved',revision=revision+1,updated_at=clock_timestamp()where source_id=r.source_id and order_id=r.order_id;
 insert into app_private.firewood_live_office_events(order_id,revision,operation,actor_id,details)values(p_order,r.revision+1,'price_approved',actor,jsonb_build_object('approval_id',approval->'approval_id','reason',p_reason));
 result:=app_private.firewood_live_office_price_receipt(p_order);return app_private.firewood_live_office_ack(actor,p_request_id,'price_approved',payload,result);
end $$;
create function public.revoke_firewood_live_office_request(p_order uuid,p_expected_revision integer,p_reason text,p_request_id uuid)returns jsonb language plpgsql security definer set search_path='' set timezone='UTC' set lock_timeout='3s' as $$
declare actor uuid;payload jsonb;replay jsonb;r app_private.firewood_live_office_requests%rowtype;result jsonb;begin
 actor:=app_private.firewood_live_office_actor();payload:=jsonb_build_object('order_id',p_order,'revision',p_expected_revision,'reason',p_reason);replay:=app_private.firewood_live_office_replay(actor,p_request_id,'price_revoked',payload);if replay is not null then return replay;end if;
 if p_reason is null or length(btrim(p_reason))not between 1 and 500 then raise exception 'Reason required.'using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('firewood-live-v1-order:website_firewood_invoice_live_v1:'||p_order::text,0));
 select *into strict r from app_private.firewood_live_office_requests where order_id=p_order for update;
 if p_expected_revision is null or r.revision<>p_expected_revision or r.status='revoked'then raise exception 'Office review changed. Refresh before revoking.'using errcode='40001';end if;
 if r.approval_id is not null then perform public.revoke_firewood_live_price(r.approval_id,p_reason);end if;
 update app_private.firewood_live_office_requests set status='revoked',revision=revision+1,updated_at=clock_timestamp()where source_id=r.source_id and order_id=r.order_id;
 insert into app_private.firewood_live_office_events(order_id,revision,operation,actor_id,details)values(p_order,r.revision+1,'price_revoked',actor,jsonb_build_object('reason',p_reason));
 result:=app_private.firewood_live_office_price_receipt(p_order);return app_private.firewood_live_office_ack(actor,p_request_id,'price_revoked',payload,result);
end $$;

create function app_private.firewood_live_workflow_json(p_invoice uuid)returns jsonb language sql stable security invoker set search_path='' set timezone='UTC' as $$
 select coalesce((select jsonb_build_object('revision',w.revision,'state',w.state,'delivery_window_start',w.delivery_window_start,'delivery_window_end',w.delivery_window_end,'delivery_evidence',w.delivery_evidence,'cancellation_reason_code',w.cancellation_reason_code,'cancellation_reason',w.cancellation_reason,'requested_at',w.requested_at,'confirmed_at',w.confirmed_at,'refund_eligibility',w.refund_eligibility)from app_private.firewood_live_order_workflows w where w.invoice_id=p_invoice),jsonb_build_object('revision',0,'state','active','delivery_window_start',null,'delivery_window_end',null,'delivery_evidence',null,'cancellation_reason_code',null,'cancellation_reason',null,'requested_at',null,'confirmed_at',null,'refund_eligibility',null));
$$;
create function app_private.firewood_live_workflow_money(p_invoice uuid)returns jsonb language plpgsql security invoker set search_path='' set timezone='UTC' as $$
declare raw jsonb;valid boolean;pending boolean;refund_pending boolean;review boolean;gross bigint;refunded bigint;principal bigint;fee bigint;begin
 select jsonb_build_object('invoice',to_jsonb(i),'payments',coalesce((select jsonb_agg(to_jsonb(p)order by p.id)from public.payments p where p.invoice_id=i.id),'[]'::jsonb),'attempts',coalesce((select jsonb_agg(to_jsonb(c)order by c.id)from public.invoice_checkout_sessions c where c.invoice_id=i.id),'[]'::jsonb),'refunds',coalesce((select jsonb_agg(to_jsonb(f)order by f.refund_id)from app_private.stripe_refund_observations f join public.payments p on p.id=f.payment_id where p.invoice_id=i.id),'[]'::jsonb),'workflow',app_private.firewood_live_workflow_json(i.id),'original_paid_evidence',(select original_paid_evidence from app_private.firewood_live_handoffs where invoice_id=i.id))into raw from public.invoices i where i.id=p_invoice;
 if raw is null then raise exception 'Firewood invoice not found.'using errcode='P0002';end if;
 select not exists(select 1 from public.payments p where p.invoice_id=p_invoice and(p.status is null or p.status not in('pending','succeeded','failed','cancelled','refunded')or p.currency is distinct from'usd'or p.amount_cents is null or p.amount_cents<0 or p.surcharge_cents is null or p.surcharge_cents<0 or p.total_collected_cents is distinct from p.amount_cents+p.surcharge_cents or p.refunded_principal_cents is null or p.refunded_surcharge_cents is null or p.refunded_principal_cents<0 or p.refunded_surcharge_cents<0 or p.refunded_principal_cents>p.amount_cents or p.refunded_surcharge_cents>p.surcharge_cents))
 and not exists(select 1 from public.invoice_checkout_sessions c where c.invoice_id=p_invoice and(c.status is null or c.status not in('creating','open','processing','completed','expired','cancelled','failed')))
 and not exists(select 1 from app_private.stripe_refund_observations f join public.payments p on p.id=f.payment_id where p.invoice_id=p_invoice and(f.currency is distinct from'usd'or f.status is null or f.status not in('pending','requires_action','succeeded','failed','canceled')or f.amount_cents is null or f.amount_cents<1 or f.amount_cents>p.total_collected_cents))into valid;
 select exists(select 1 from public.payments where invoice_id=p_invoice and status='pending')or exists(select 1 from public.invoice_checkout_sessions where invoice_id=p_invoice and status in('creating','open','processing'))into pending;
 select exists(select 1 from app_private.stripe_refund_observations f join public.payments p on p.id=f.payment_id where p.invoice_id=p_invoice and f.status in('pending','requires_action'))into refund_pending;
 select exists(select 1 from public.payments where invoice_id=p_invoice and(dispute_status is not null or(status in('failed','cancelled')and succeeded_at is not null)))or exists(select 1 from app_private.firewood_live_handoffs h join public.payments p on p.invoice_id=h.invoice_id where h.invoice_id=p_invoice and h.original_paid_evidence is not null and p.status='failed')into review;
 select coalesce(sum(total_collected_cents::bigint)filter(where status in('succeeded','refunded')or succeeded_at is not null),0),coalesce(sum(refunded_principal_cents::bigint+refunded_surcharge_cents::bigint),0),coalesce(sum(amount_cents::bigint)filter(where status in('succeeded','refunded')or succeeded_at is not null),0),coalesce(sum(surcharge_cents::bigint)filter(where status in('succeeded','refunded')or succeeded_at is not null),0)into gross,refunded,principal,fee from public.payments where invoice_id=p_invoice;
 if refunded>gross or gross<0 then valid:=false;end if;
 if exists(select 1 from public.payments p where p.invoice_id=p_invoice and coalesce((select sum(f.amount_cents)from app_private.stripe_refund_observations f where f.payment_id=p.id and f.status in('pending','requires_action','succeeded')),0)>p.total_collected_cents)then valid:=false;end if;
 if exists(select 1 from public.invoices i where i.id=p_invoice and(i.total_cents is null or i.total_cents<1 or i.balance_due_cents is null or i.balance_due_cents<>i.total_cents-(select coalesce(sum(greatest(0,p.amount_cents::bigint-p.refunded_principal_cents-case when p.dispute_status='lost'then p.disputed_principal_cents else 0 end)),0)from public.payments p where p.invoice_id=i.id and p.status='succeeded')))then valid:=false;end if;
 if exists(select 1 from public.invoice_checkout_sessions c where c.invoice_id=p_invoice and c.status='completed'and not exists(select 1 from public.payments p where p.invoice_id=c.invoice_id and(p.status in('succeeded','refunded')or p.succeeded_at is not null)and p.provider='stripe'and((c.stripe_payment_intent_id is not null and p.provider_payment_id=c.stripe_payment_intent_id)or(c.stripe_checkout_session_id is not null and p.provider_checkout_session_id=c.stripe_checkout_session_id))))then valid:=false;end if;
 if exists(select 1 from public.payments p where p.invoice_id=p_invoice and p.provider='stripe'and p.refunded_principal_cents+p.refunded_surcharge_cents<>coalesce((select sum(f.amount_cents)from app_private.stripe_refund_observations f where f.payment_id=p.id and f.status='succeeded'),0))then valid:=false;end if;
 return jsonb_build_object('ledger_hash',encode(sha256(convert_to(raw::text,'UTF8')),'hex'),'invoice_status',raw#>'{invoice,status}','payment_count',(select count(*)from public.payments where invoice_id=p_invoice),'attempt_count',(select count(*)from public.invoice_checkout_sessions where invoice_id=p_invoice),'no_money_history',not exists(select 1 from public.payments where invoice_id=p_invoice)and not exists(select 1 from public.invoice_checkout_sessions where invoice_id=p_invoice)and not exists(select 1 from app_private.firewood_live_handoffs where invoice_id=p_invoice and original_paid_evidence is not null),'verified',valid,'payment_pending',pending,'refund_pending',refund_pending,'review_required',review or not valid,'collected_principal_cents',case when valid then principal else null end,'surcharge_collected_cents',case when valid then fee else null end,'balance_due_cents',case when valid then(raw#>>'{invoice,balance_due_cents}')::bigint else null end,'collected_gross_cents',case when valid then gross else null end,'refunded_gross_cents',case when valid then refunded else null end,'retained_gross_cents',case when valid then gross-refunded else null end);
end $$;
create function app_private.firewood_live_cancellation_disposition(p_money jsonb,p_eligibility text)returns text language sql immutable security invoker set search_path='' set timezone='UTC' as $$
 select case when p_money->'verified'is distinct from'true'::jsonb or p_money->'review_required'='true'::jsonb then'payment_review'
 when p_money->'payment_pending'='true'::jsonb then'awaiting_settlement'
 when p_money->'refund_pending'='true'::jsonb then'awaiting_refund'
 when p_eligibility='full'and(p_money->>'retained_gross_cents')::bigint>0 then'refund_review'
 when(p_money->>'balance_due_cents')::bigint>0 and not(p_eligibility='full'and p_money->'no_money_history'='true'::jsonb and p_money->>'invoice_status'in('draft','sent','overdue','void'))then'billing_closure_required'
 when p_eligibility='full'and(p_money->>'refunded_gross_cents')::bigint>0 then'refund_complete'
 else'no_refund_due'end;
$$;
create function public.list_firewood_live_office(p_page integer default 1,p_page_size integer default 20)returns jsonb language plpgsql security definer set search_path='' set timezone='UTC' set lock_timeout='3s' as $$
declare items jsonb;total bigint;begin
 perform app_private.firewood_live_office_actor();
 if p_page is null or p_page<1 or p_page>100000 or p_page_size is null or p_page_size<1 or p_page_size>50 then raise exception 'Invalid office page.'using errcode='22023';end if;
 with rows as(select coalesce(h.order_id,r.order_id)order_id,coalesce(h.reference,r.reference)reference,h.invoice_id,
 case when h.invoice_id is null then'price_request'else'accepted_order'end kind,
 case when h.invoice_id is not null then coalesce(w.state,'active')else app_private.firewood_live_office_price_receipt(r.order_id)->>'status'end state,
 case when h.invoice_id is null then r.revision else coalesce(w.revision,0)end revision,
 coalesce(h.payload#>>'{order,contact,name}',r.draft#>>'{contact,name}')customer_name,
 coalesce(h.payload#>>'{order,quantity}',r.draft->>'quantity')quantity,
 coalesce(h.payload#>'{order,stacking}',r.draft->'stacking')stacking,h.principal_cents,
 coalesce(h.created_at,r.created_at)created_at
 from app_private.firewood_live_handoffs h full join app_private.firewood_live_office_requests r on r.source_id=h.source_id and r.order_id=h.order_id left join app_private.firewood_live_order_workflows w on w.invoice_id=h.invoice_id),
 page as(select *from rows order by created_at desc,order_id desc limit p_page_size offset(p_page-1)*p_page_size)
 select(select count(*)from rows),coalesce((select jsonb_agg(to_jsonb(page)order by created_at desc,order_id desc)from page),'[]'::jsonb)into total,items;
 return jsonb_build_object('page',p_page,'page_size',p_page_size,'total_count',total,'items',items);
end $$;
create function public.inspect_firewood_live_office(p_order uuid)returns jsonb language plpgsql security definer set search_path='' set timezone='UTC' set lock_timeout='3s' as $$
declare h app_private.firewood_live_handoffs%rowtype;r app_private.firewood_live_office_requests%rowtype;lifecycle jsonb;money jsonb;decision text;events jsonb;order_data jsonb;price jsonb;begin
 perform app_private.firewood_live_office_actor();select *into h from app_private.firewood_live_handoffs where order_id=p_order;
 select *into r from app_private.firewood_live_office_requests where order_id=p_order;
 if h.invoice_id is null and r.order_id is null then raise exception 'Firewood order not found.'using errcode='P0002';end if;
 if h.invoice_id is not null then
  perform 1 from public.invoices where id=h.invoice_id for share;
  lifecycle:=app_private.firewood_live_workflow_json(h.invoice_id);money:=app_private.firewood_live_workflow_money(h.invoice_id);decision:=app_private.firewood_live_cancellation_disposition(money,lifecycle->>'refund_eligibility');
  order_data:=jsonb_build_object('order_id',h.order_id,'reference',h.reference,'invoice_id',h.invoice_id,'invoice_number',(select invoice_number from public.invoices where id=h.invoice_id),'principal_cents',h.principal_cents,'wood_cents',h.payload#>'{order,wood_cents}','stacking_cents',h.payload#>'{order,stacking_cents}','quantity',h.payload#>'{order,quantity}','stacking',h.payload#>'{order,stacking}','contact',h.payload#>'{order,contact}','terms_version',h.payload#>'{order,terms,version}');
 else order_data:=jsonb_build_object('order_id',r.order_id,'reference',r.reference,'invoice_id',null,'invoice_number',null,'principal_cents',null,'wood_cents',null,'stacking_cents',null,'quantity',r.draft->'quantity','stacking',r.draft->'stacking','contact',r.draft->'contact','terms_version','firewood-household-live-2026-10-29-v1');end if;
 if r.order_id is not null then price:=app_private.firewood_live_office_price_receipt(p_order);end if;
 select coalesce(jsonb_agg(jsonb_build_object('revision',e.revision,'operation',e.operation,'actor_id',e.actor_id,'details',e.details,'created_at',e.created_at)order by e.created_at,e.id),'[]'::jsonb)into events from(select *from app_private.firewood_live_office_events where order_id=p_order order by created_at desc,id desc limit 20)e;
 return jsonb_build_object('order',order_data,'price_request',price,'lifecycle',lifecycle,'financial',money,'financial_disposition',decision,'can_confirm',coalesce(lifecycle->>'state'='cancellation_requested'and decision in('no_refund_due','refund_complete'),false),'confirmation_blockers',case when lifecycle is null or lifecycle->>'state'<>'cancellation_requested'then jsonb_build_array('cancellation_not_requested')when decision not in('no_refund_due','refund_complete')then jsonb_build_array(decision)else'[]'::jsonb end,'events',events);
end $$;
create function public.record_firewood_live_delivery(p_invoice uuid,p_revision integer,p_start timestamptz,p_end timestamptz,p_evidence text,p_request_id uuid)returns jsonb language plpgsql security definer set search_path='' set timezone='UTC' set lock_timeout='3s' as $$
declare actor uuid;payload jsonb;replay jsonb;h app_private.firewood_live_handoffs%rowtype;w app_private.firewood_live_order_workflows%rowtype;result jsonb;begin
 actor:=app_private.firewood_live_office_actor();payload:=jsonb_build_object('invoice_id',p_invoice,'revision',p_revision,'start',p_start,'end',p_end,'evidence',p_evidence);replay:=app_private.firewood_live_office_replay(actor,p_request_id,'delivery_recorded',payload);if replay is not null then return replay;end if;
 if p_start is null or p_end is null or not isfinite(p_start)or not isfinite(p_end)or p_end<=p_start or p_evidence is null or length(btrim(p_evidence))not between 1 and 1000 then raise exception 'Agreed delivery window and evidence required.'using errcode='22023';end if;
 select *into strict h from app_private.firewood_live_handoffs where invoice_id=p_invoice;
 perform 1 from public.invoices where id=p_invoice for update;
 insert into app_private.firewood_live_order_workflows(invoice_id,source_id,order_id)values(p_invoice,h.source_id,h.order_id)on conflict(invoice_id)do nothing;
 select *into strict w from app_private.firewood_live_order_workflows where invoice_id=p_invoice for update;
 if p_revision is null or w.revision<>p_revision or w.state<>'active'then raise exception 'Firewood workflow changed. Refresh before recording delivery.'using errcode='40001';end if;
 update app_private.firewood_live_order_workflows set delivery_window_start=p_start,delivery_window_end=p_end,delivery_evidence=btrim(p_evidence),revision=revision+1 where invoice_id=p_invoice;
 insert into app_private.firewood_live_office_events(order_id,invoice_id,revision,operation,actor_id,details)values(h.order_id,p_invoice,w.revision+1,'delivery_recorded',actor,jsonb_build_object('start',p_start,'end',p_end,'evidence',btrim(p_evidence)));
 result:=jsonb_build_object('order_id',h.order_id,'invoice_id',p_invoice)||app_private.firewood_live_workflow_json(p_invoice);return app_private.firewood_live_office_ack(actor,p_request_id,'delivery_recorded',payload,result);
end $$;
create function public.request_firewood_live_cancellation(p_invoice uuid,p_revision integer,p_reason_code text,p_reason text,p_request_id uuid)returns jsonb language plpgsql security definer set search_path='' set timezone='UTC' set lock_timeout='3s' as $$
declare actor uuid;payload jsonb;replay jsonb;h app_private.firewood_live_handoffs%rowtype;w app_private.firewood_live_order_workflows%rowtype;request_at timestamptz;eligibility text;result jsonb;begin
 actor:=app_private.firewood_live_office_actor();payload:=jsonb_build_object('invoice_id',p_invoice,'revision',p_revision,'reason_code',p_reason_code,'reason',p_reason);replay:=app_private.firewood_live_office_replay(actor,p_request_id,'cancellation_requested',payload);if replay is not null then return replay;end if;
 if p_reason_code is null or p_reason_code not in('customer_request','angel_cancelled','cannot_fulfill','declined_angel_reschedule')or p_reason is null or length(btrim(p_reason))not between 1 and 1000 then raise exception 'Cancellation reason and evidence required.'using errcode='22023';end if;
 select *into strict h from app_private.firewood_live_handoffs where invoice_id=p_invoice;perform 1 from public.invoices where id=p_invoice for update;
 insert into app_private.firewood_live_order_workflows(invoice_id,source_id,order_id)values(p_invoice,h.source_id,h.order_id)on conflict(invoice_id)do nothing;
 select *into strict w from app_private.firewood_live_order_workflows where invoice_id=p_invoice for update;
 if p_revision is null or w.revision<>p_revision or w.state<>'active'then raise exception 'Firewood workflow changed. Refresh before cancelling.'using errcode='40001';end if;
 request_at:=clock_timestamp();eligibility:=case when p_reason_code<>'customer_request'or w.delivery_window_start is null or request_at<=w.delivery_window_start-interval'48 hours'then'full'else'non_refundable'end;
 update app_private.firewood_live_order_workflows set state='cancellation_requested',revision=revision+1,cancellation_reason_code=p_reason_code,cancellation_reason=btrim(p_reason),requested_at=request_at,requested_by=actor,refund_eligibility=eligibility where invoice_id=p_invoice;
 insert into app_private.firewood_live_office_events(order_id,invoice_id,revision,operation,actor_id,details)values(h.order_id,p_invoice,w.revision+1,'cancellation_requested',actor,jsonb_build_object('reason_code',p_reason_code,'reason',btrim(p_reason),'received_at',request_at,'refund_eligibility',eligibility,'delivery_window_start',w.delivery_window_start,'money_sent',false));
 result:=jsonb_build_object('order_id',h.order_id,'invoice_id',p_invoice)||app_private.firewood_live_workflow_json(p_invoice);return app_private.firewood_live_office_ack(actor,p_request_id,'cancellation_requested',payload,result);
end $$;
create function public.confirm_firewood_live_cancellation(p_invoice uuid,p_revision integer,p_ledger_hash text,p_request_id uuid,p_notes text default null)returns jsonb language plpgsql security definer set search_path='' set timezone='UTC' set lock_timeout='3s' as $$
declare actor uuid;payload jsonb;replay jsonb;h app_private.firewood_live_handoffs%rowtype;w app_private.firewood_live_order_workflows%rowtype;money jsonb;decision text;result jsonb;lease jsonb;voided boolean:=false;begin
 actor:=app_private.firewood_live_office_actor();payload:=jsonb_build_object('invoice_id',p_invoice,'revision',p_revision,'ledger_hash',p_ledger_hash,'notes',p_notes);replay:=app_private.firewood_live_office_replay(actor,p_request_id,'cancellation_confirmed',payload);if replay is not null then return replay;end if;
 if p_notes is not null and length(btrim(p_notes))not between 1 and 500 then raise exception 'Final review note must be between one and 500 characters.'using errcode='22023';end if;
 select *into strict h from app_private.firewood_live_handoffs where invoice_id=p_invoice;perform 1 from public.invoices where id=p_invoice for update;
 select *into strict w from app_private.firewood_live_order_workflows where invoice_id=p_invoice for update;
 if p_revision is null or w.revision<>p_revision or w.state<>'cancellation_requested'then raise exception 'Firewood workflow changed. Refresh before confirming cancellation.'using errcode='40001';end if;
 money:=app_private.firewood_live_workflow_money(p_invoice);
 if p_ledger_hash is distinct from money->>'ledger_hash'then raise exception 'Financial observation changed. Refresh before confirming.'using errcode='40001';end if;
 decision:=app_private.firewood_live_cancellation_disposition(money,w.refund_eligibility);
 if decision not in('no_refund_due','refund_complete')then raise exception 'Payment or refund needs review before cancellation can be confirmed.'using errcode='23514';end if;
 if w.refund_eligibility='full'and money->'no_money_history'='true'::jsonb then
  if to_regprocedure('public.begin_invoice_void(uuid)')is null or to_regprocedure('public.finalize_invoice_void(uuid,uuid)')is null or to_regclass('app_private.invoice_void_leases')is null then raise exception 'Guarded invoice void prerequisites unavailable.'using errcode='23514';end if;
  lease:=public.begin_invoice_void(p_invoice);
  if lease->'already_void'is distinct from'true'::jsonb then
   if coalesce(lease->>'token','')!~'^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$'or public.finalize_invoice_void(p_invoice,(lease->>'token')::uuid)is distinct from true then raise exception 'Guarded invoice closure unconfirmed.'using errcode='23514';end if;
  end if;
  if not exists(select 1 from public.invoices where id=p_invoice and status='void')then raise exception 'Invoice is still collectible.'using errcode='23514';end if;voided:=true;
 end if;
 update app_private.firewood_live_order_workflows set state='cancelled',revision=revision+1,confirmed_at=clock_timestamp(),confirmed_by=actor where invoice_id=p_invoice;
 insert into app_private.firewood_live_office_events(order_id,invoice_id,revision,operation,actor_id,details)values(h.order_id,p_invoice,w.revision+1,'cancellation_confirmed',actor,jsonb_build_object('financial_disposition',decision,'ledger_hash',p_ledger_hash,'refund_executed',false,'invoice_voided',voided,'customer_email_sent',false,'review_notes',case when p_notes is null then null else btrim(p_notes)end));
 result:=jsonb_build_object('order_id',h.order_id,'invoice_id',p_invoice)||app_private.firewood_live_workflow_json(p_invoice);return app_private.firewood_live_office_ack(actor,p_request_id,'cancellation_confirmed',payload,result);
end $$;
create function public.get_firewood_live_order_workflow(p_source text,p_order uuid,p_invoice uuid,p_hash text)returns jsonb language plpgsql security definer set search_path='' set timezone='UTC' set lock_timeout='3s' as $$
declare w jsonb;begin
 perform app_private.firewood_live_handoff_source(p_source);perform 1 from public.invoices where id=p_invoice for share;
 if not exists(select 1 from app_private.firewood_live_handoffs where source_id=p_source and order_id=p_order and invoice_id=p_invoice and payload->>'snapshot_hash'=p_hash)then raise exception 'Firewood workflow binding changed.'using errcode='23514';end if;
 w:=app_private.firewood_live_workflow_json(p_invoice);
 return jsonb_build_object('order_id',p_order,'invoice_id',p_invoice,'snapshot_hash',p_hash,'revision',w->'revision','state',w->'state','collection_held',w->>'state'<>'active','fulfillment_held',w->>'state'<>'active');
end $$;
create function app_private.guard_firewood_live_office_history()returns trigger language plpgsql security invoker set search_path='' set timezone='UTC' as $$begin
 if TG_OP='DELETE'or TG_TABLE_NAME in('firewood_live_office_events','firewood_live_office_receipts')then raise exception 'Firewood office history is immutable.'using errcode='23514';end if;
 if TG_TABLE_NAME='firewood_live_office_requests'then
  if(old.source_id,old.order_id,old.reference,old.draft,old.draft_hash,old.created_at)is distinct from(new.source_id,new.order_id,new.reference,new.draft,new.draft_hash,new.created_at)or new.revision<>old.revision+1
   or not((old.status='pending'and new.status in('approved','revoked'))or(old.status='approved'and new.status='revoked'))
   or(old.approval_id is not null and old.approval_id is distinct from new.approval_id)then raise exception 'Firewood office draft is immutable.'using errcode='23514';end if;
 elsif TG_TABLE_NAME='firewood_live_order_workflows'then
  if(old.invoice_id,old.source_id,old.order_id)is distinct from(new.invoice_id,new.source_id,new.order_id)or new.revision<>old.revision+1
   or(old.state='cancelled')or(old.state='cancellation_requested'and new.state<>'cancelled')
   or(old.state<>'active'and(old.delivery_window_start,old.delivery_window_end,old.delivery_evidence,old.cancellation_reason_code,old.cancellation_reason,old.requested_at,old.requested_by,old.refund_eligibility)is distinct from(new.delivery_window_start,new.delivery_window_end,new.delivery_evidence,new.cancellation_reason_code,new.cancellation_reason,new.requested_at,new.requested_by,new.refund_eligibility))
   then raise exception 'Firewood cancellation history is immutable.'using errcode='23514';end if;
 end if;return new;
end $$;
create trigger firewood_live_office_request_history before update or delete on app_private.firewood_live_office_requests for each row execute function app_private.guard_firewood_live_office_history();
create trigger firewood_live_workflow_history before update or delete on app_private.firewood_live_order_workflows for each row execute function app_private.guard_firewood_live_office_history();
create trigger firewood_live_office_event_history before update or delete on app_private.firewood_live_office_events for each row execute function app_private.guard_firewood_live_office_history();
create trigger firewood_live_office_receipt_history before update or delete on app_private.firewood_live_office_receipts for each row execute function app_private.guard_firewood_live_office_history();
create function app_private.guard_firewood_live_cancelled_collection()returns trigger language plpgsql security definer set search_path='' set timezone='UTC' as $$
begin
 if TG_OP='UPDATE'and old.invoice_id is distinct from new.invoice_id and exists(select 1 from app_private.firewood_live_handoffs where invoice_id in(old.invoice_id,new.invoice_id))then raise exception 'Firewood checkout invoice binding is immutable.'using errcode='23514';end if;
 if TG_OP='UPDATE'then perform 1 from public.invoices where id=new.invoice_id for update nowait;else perform 1 from public.invoices where id=new.invoice_id for update;end if;
 if exists(select 1 from app_private.firewood_live_order_workflows where invoice_id=new.invoice_id and state<>'active')then
  if TG_OP='INSERT'then raise exception 'Cancelled Firewood order cannot start another checkout.'using errcode='23514';end if;
  if old.invoice_id is distinct from new.invoice_id or(old.status not in('creating','open')and new.status in('creating','open'))then raise exception 'Cancelled Firewood checkout cannot be reopened.'using errcode='23514';end if;
 end if;
 -- Existing provider references/processing/success/expiry remain writable. The
 -- owner must close/reconcile those externally before final cancellation.
 return new;
end $$;
create trigger firewood_live_cancellation_collection before insert or update on public.invoice_checkout_sessions for each row execute function app_private.guard_firewood_live_cancelled_collection();

-- Preserve immutable amounts/identity and admit only an original guarded clean void.
create or replace function app_private.guard_firewood_live_handoff_invoice()returns trigger language plpgsql security definer set search_path='' set timezone='UTC' as $$
begin
 if TG_TABLE_NAME='invoices'then
  if exists(select 1 from app_private.firewood_live_handoffs where invoice_id=old.id)and new.status='void'and old.status is distinct from'void'
   and not exists(select 1 from app_private.firewood_live_order_workflows w join app_private.invoice_void_leases l on l.invoice_id=w.invoice_id join app_private.firewood_live_handoffs h on h.invoice_id=w.invoice_id where w.invoice_id=old.id and w.state='cancellation_requested'and w.refund_eligibility='full'and h.original_paid_evidence is null and l.purpose='void'and l.finalizing and l.actor_user_id=auth.uid()and l.expires_at>clock_timestamp()and not exists(select 1 from public.payments where invoice_id=old.id)and not exists(select 1 from public.invoice_checkout_sessions where invoice_id=old.id))
   then raise exception 'Accepted Firewood order requires coordinated cancellation review.'using errcode='23514';end if;
  if exists(select 1 from app_private.firewood_live_handoffs where invoice_id=old.id)and(new.total_cents is distinct from old.total_cents or new.subtotal_cents is distinct from old.subtotal_cents or new.tax_cents is distinct from old.tax_cents or new.customer_id is distinct from old.customer_id or new.organization_id is distinct from old.organization_id or new.service_location_id is distinct from old.service_location_id or new.job_id is distinct from old.job_id or new.document_terms_version is distinct from old.document_terms_version or new.invoice_number is distinct from old.invoice_number or new.payment_terms is distinct from old.payment_terms or new.purchase_order_reference is distinct from old.purchase_order_reference or new.automatic_reminders_enabled)then raise exception 'Prepared Firewood order is frozen; office review required.'using errcode='23514';end if;return new;
 end if;
 if exists(select 1 from app_private.firewood_live_handoffs where invoice_id=case when TG_OP='DELETE'then old.invoice_id else new.invoice_id end)or(TG_OP='UPDATE'and exists(select 1 from app_private.firewood_live_handoffs where invoice_id=old.invoice_id))then raise exception 'Prepared Firewood lines are frozen; office review required.'using errcode='23514';end if;
 if TG_OP='DELETE'then return old;else return new;end if;
end $$;

-- Extend only the independent live functions to include workflow in the ledger CAS.
create or replace function app_private.firewood_live_handoff_receipt(p_source text,p_order uuid,p_replayed boolean)returns jsonb language sql stable security invoker set search_path='' set timezone='UTC' as $$
 select jsonb_build_object('contract','firewood-invoice-handoff-live-v1','source_id',r.source_id,'environment_id',s.environment_id,'account_id',r.payload->>'account_id','mode','live','order_id',r.order_id,'reference',r.reference,'snapshot_hash',r.payload->>'snapshot_hash','invoice_id',r.invoice_id,'invoice_number',i.invoice_number,'preparation_status','prepared','principal_cents',r.principal_cents,'token_encrypted',case when t.revoked_at is null and t.expires_at>clock_timestamp()then t.token_encrypted else null end,'expires_at',t.expires_at,'capability_version',r.capability_version,'replayed',p_replayed,'receipt_authority','crm','order_confirmation_authority','website','payment_retry_required',false,'delivery_completed',false,'payment_execution_ready',s.collector_enabled and s.surcharge_reporting_enabled and coalesce(w.state,'active')='active','execution_blockers',case when s.collector_enabled and s.surcharge_reporting_enabled and coalesce(w.state,'active')='active' then '[]'::jsonb else case when coalesce(w.state,'active')<>'active'then jsonb_build_array('order_cancellation_hold')else jsonb_build_array('collector_source_not_enabled')end end)
 from app_private.firewood_live_handoffs r join app_private.firewood_live_handoff_sources s on s.id=r.source_id join public.invoices i on i.id=r.invoice_id join public.invoice_portal_tokens t on t.id=r.token_id left join app_private.firewood_live_order_workflows w on w.invoice_id=r.invoice_id where r.source_id=p_source and r.order_id=p_order;
$$;
create or replace function public.read_firewood_live_handoff(p_source text,p_order uuid,p_invoice uuid,p_hash text)returns jsonb language plpgsql security definer set search_path='' set timezone='UTC' set lock_timeout='3s' as $$
declare r app_private.firewood_live_handoffs%rowtype;i public.invoices%rowtype;result jsonb;
begin
 perform app_private.firewood_live_handoff_source(p_source);select * into strict r from app_private.firewood_live_handoffs where source_id=p_source and order_id=p_order;
 select * into strict i from public.invoices where id=r.invoice_id for share;
 if r.invoice_id<>p_invoice or r.payload->>'snapshot_hash'<>p_hash or i.customer_id<>r.customer_id or i.total_cents<>r.principal_cents or i.automatic_reminders_enabled then raise exception 'Firewood invoice requires review.'using errcode='23514';end if;
 select jsonb_build_object('invoice',to_jsonb(i),'payments',coalesce((select jsonb_agg(to_jsonb(p)order by p.id)from public.payments p where p.invoice_id=i.id),'[]'::jsonb),'attempts',coalesce((select jsonb_agg(to_jsonb(a)order by a.id)from public.invoice_checkout_sessions a where a.invoice_id=i.id),'[]'::jsonb),'refunds',coalesce((select jsonb_agg(jsonb_build_object('refund_id',f.refund_id,'payment_id',f.payment_id,'amount_cents',f.amount_cents,'currency',f.currency,'status',f.status)order by f.refund_id)from app_private.stripe_refund_observations f join public.payments p on p.id=f.payment_id where p.invoice_id=i.id),'[]'::jsonb),'original_paid_evidence',r.original_paid_evidence,'workflow',jsonb_build_object('state',coalesce(w.state,'active'),'revision',coalesce(w.revision,0),'collection_held',coalesce(w.state,'active')<>'active','fulfillment_held',coalesce(w.state,'active')<>'active')) into result from(select 1)anchor left join app_private.firewood_live_order_workflows w on w.invoice_id=i.id;
 return result||jsonb_build_object('ledger_hash',encode(sha256(convert_to(result::text,'UTF8')),'hex'));
end $$;
create or replace function public.get_firewood_live_collector_context(p_invoice uuid)returns jsonb language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare r app_private.firewood_live_handoffs%rowtype;s app_private.firewood_live_handoff_sources%rowtype;allowed boolean;review boolean;balance integer;held boolean;
begin
 if auth.uid()is not null or current_setting('role',true)is distinct from'service_role'then raise exception 'Server operation only.'using errcode='42501';end if;
 select * into r from app_private.firewood_live_handoffs where invoice_id=p_invoice;
 if not found then return jsonb_build_object('managed',false);end if;
 select * into strict s from app_private.firewood_live_handoff_sources where id=r.source_id;
 select balance_due_cents into strict balance from public.invoices where id=p_invoice;
 select exists(select 1 from app_private.firewood_live_order_workflows where invoice_id=p_invoice and state<>'active')into held;
 review:=held or exists(select 1 from public.payments p where p.invoice_id=p_invoice and(p.refunded_principal_cents>0 or p.refunded_surcharge_cents>0 or p.dispute_status is not null))or exists(select 1 from app_private.stripe_refund_observations f join public.payments p on p.id=f.payment_id where p.invoice_id=p_invoice and f.status in('pending','requires_action'))or(r.original_paid_evidence is not null and balance>0);
 allowed:=s.enabled and s.collector_enabled and s.surcharge_reporting_enabled and r.original_paid_evidence is null and not review;
 return jsonb_build_object('managed',true,'order_state',coalesce((select state from app_private.firewood_live_order_workflows where invoice_id=p_invoice),'active'),'workflow_revision',coalesce((select revision from app_private.firewood_live_order_workflows where invoice_id=p_invoice),0),'invoice_id',r.invoice_id,'allowed',allowed,'review_required',review,'already_paid',r.original_paid_evidence is not null and balance=0 and not review,'source_id',s.id,'order_id',r.order_id,'account_id',s.stripe_account_id,'receipt_authority','crm','surcharge_reporting',s.surcharge_reporting_enabled,'environment_id',s.environment_id,'livemode',true,'mode','live','contract','firewood-invoice-handoff-live-v1','sender_enabled',s.sender_enabled,'terms_hash','b58eaaea481bfd1aecf509ef940a8f0bc135f7db4446784533cb3b588c6ac482','payment_policy_hash','201c6523787fd3e2289843f51e63b1726b85a5fc2978cbae15acf870e79cdad3');
end $$;

do $$declare f record;begin
 for f in select p.oid::regprocedure sig,n.nspname schema,p.proname name from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in('public','app_private')and(p.proname like'%firewood_live_office%'or p.proname like'%firewood_live_workflow%'or p.proname like'%firewood_live_cancellation%'or p.proname in('record_firewood_live_delivery','request_firewood_live_cancellation','confirm_firewood_live_cancellation','get_firewood_live_order_workflow','guard_firewood_live_cancelled_collection')) loop
 execute format('revoke all on function %s from public,anon,authenticated,service_role',f.sig);
 if f.schema='public'then
  if f.name in('request_firewood_live_office_price','read_firewood_live_office_price','get_firewood_live_order_workflow')then execute format('grant execute on function %s to service_role',f.sig);
  else execute format('grant execute on function %s to authenticated',f.sig);end if;
 end if;
 end loop;
end $$;
notify pgrst,'reload schema';
