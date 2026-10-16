-- PR14: immutable provider requests, bounded retry authority and evidence-based repair.
-- Private bodies can contain customer portal links. No client gets table/body access.
create table app_private.outbound_deliveries (
  id uuid primary key default gen_random_uuid(), business_key text not null unique, provider_key text not null unique,
  payload jsonb not null, payload_hash text not null, context jsonb not null,
  source_snapshot jsonb not null, actor_id uuid references public.profiles(id), authorized_actor_id uuid references public.profiles(id),
  state text not null default 'prepared' check(state in ('prepared','dispatching','accepted','rejected','unknown','not_attempted','cancelled')),
  delivery_status text not null default 'pending' check(delivery_status in ('pending','accepted','delayed','delivered','failed','bounced','complained','suppressed')),
  provider_message_id text unique, first_dispatched_at timestamptz, last_dispatched_at timestamptz,
  attempt_id uuid, attempt_count integer not null default 0, lease_expires_at timestamptz,
  active_communication_claim jsonb,
  retry_authorized boolean not null default false,
  repair_state text not null default 'pending' check(repair_state in ('pending','complete','source_changed','needs_review','acknowledged')),
  followup_sync_pending boolean not null default false,
  problem_code text, accepted_at timestamptz, last_event_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check(jsonb_typeof(payload)='object' and octet_length(payload::text)<=524288),
  check(payload_hash ~ '^[a-f0-9]{64}$'), check(attempt_count between 0 and 3)
);
create index outbound_deliveries_review on app_private.outbound_deliveries(repair_state,created_at desc);
create index outbound_deliveries_communication on app_private.outbound_deliveries((context->>'communication_id'));
create index outbound_deliveries_job on app_private.outbound_deliveries((context->>'job_id'));
create table app_private.outbound_delivery_attempts (
  id uuid primary key, delivery_id uuid not null references app_private.outbound_deliveries(id),
  started_at timestamptz not null default now(), actor_id uuid references public.profiles(id), outcome text, completed_at timestamptz, provider_message_id text
);
alter table app_private.outbound_delivery_attempts enable row level security;
revoke all on app_private.outbound_delivery_attempts from public,anon,authenticated,service_role;
create table app_private.outbound_delivery_requests (
  request_key text primary key check(length(request_key) between 1 and 256),
  delivery_id uuid not null references app_private.outbound_deliveries(id), created_at timestamptz not null default now()
);
create table app_private.outbound_provider_events (
  event_id text primary key, payload_hash text not null, provider_message_id text not null,
  delivery_id uuid references app_private.outbound_deliveries(id), event_type text not null,
  occurred_at timestamptz not null, disposition text not null, created_at timestamptz not null default now()
);
create index outbound_provider_events_delivery on app_private.outbound_provider_events(delivery_id);
create table app_private.email_suppressions (
  recipient text primary key, reason text not null, provider_message_id text not null, created_at timestamptz not null default now()
);
create table app_private.website_lead_submissions (
  job_id uuid primary key references public.jobs(id), submission jsonb not null,
  notice_delivery_ids uuid[] not null default '{}', created_at timestamptz not null default now()
);
alter table app_private.outbound_deliveries enable row level security;
alter table app_private.outbound_delivery_requests enable row level security;
alter table app_private.outbound_provider_events enable row level security;
alter table app_private.email_suppressions enable row level security;
alter table app_private.website_lead_submissions enable row level security;
revoke all on app_private.outbound_deliveries,app_private.outbound_delivery_requests,app_private.outbound_provider_events,app_private.email_suppressions,app_private.website_lead_submissions from public,anon,authenticated,service_role;

alter table public.email_events add column outbound_delivery_id uuid references app_private.outbound_deliveries(id),
  add column delivery_status text check(delivery_status in ('accepted','delayed','delivered','failed','bounced','complained','suppressed')),
  add column delivery_status_at timestamptz;
create unique index email_events_one_delivery on public.email_events(outbound_delivery_id) where outbound_delivery_id is not null;

create function app_private.guard_email_delivery_facts() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if current_user in ('authenticated','anon') and ((tg_op='INSERT' and (new.outbound_delivery_id is not null or new.delivery_status is not null or new.delivery_status_at is not null))
    or (tg_op='UPDATE' and (new.outbound_delivery_id is distinct from old.outbound_delivery_id or new.delivery_status is distinct from old.delivery_status or new.delivery_status_at is distinct from old.delivery_status_at))) then
    raise exception 'Provider delivery facts are server-managed' using errcode='42501';end if;
  return new;
end $$;
revoke all on function app_private.guard_email_delivery_facts() from public,anon,authenticated,service_role;
create trigger guard_email_delivery_facts before insert or update on public.email_events for each row execute function app_private.guard_email_delivery_facts();

-- Existing intake remains authoritative; retain its exact normalized submission
-- in the same transaction so an interrupted pre-send handoff can be recovered.
alter function public.submit_website_lead(jsonb) set schema app_private;
create function public.submit_website_lead(p_submission jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r jsonb;
begin
  if current_setting('role',true)<>'service_role' or auth.uid() is not null then raise exception 'Server-only command' using errcode='42501';end if;
  -- The original invoker command checks current_user, so invoke a private copy
  -- whose equivalent server gate checks the effective request role instead.
  r:=app_private.submit_website_lead(p_submission);
  if (r->>'created')::boolean then
    insert into app_private.website_lead_submissions(job_id,submission) values((r->>'job_id')::uuid,p_submission);
  end if;
  return r;
end $$;
-- Keep the original PR13 body, changing only its role gate for the private call.
do $migration$
declare definition text; needle text := 'if current_user <> ''service_role'' or auth.uid() is not null then';
begin
  definition:=pg_get_functiondef('app_private.submit_website_lead(jsonb)'::regprocedure);
  if strpos(definition,needle)=0 then raise exception 'Unexpected PR13 command definition';end if;
  execute replace(definition,needle,'if current_setting(''role'',true) <> ''service_role'' or auth.uid() is not null then');
end $migration$;
revoke all on function app_private.submit_website_lead(jsonb) from public,anon,authenticated,service_role;

create function app_private.email_server_only() returns void language plpgsql security invoker set search_path='' as $$
begin
  if current_setting('role',true)<>'service_role' or auth.uid() is not null then raise exception 'Server-only command' using errcode='42501';end if;
end $$;

create function app_private.email_staff(p_user uuid,p_admin boolean default false) returns boolean
language sql stable security invoker set search_path='' as $$
  select app_private.effective_platform_access(p_user) and exists(select 1 from public.user_roles ur join public.roles r on r.id=ur.role_id
    where ur.user_id=p_user and (r.name in ('owner','admin') or (not p_admin and r.name in ('estimator','payroll_admin'))));
$$;

-- Shared order: job -> quote -> invoice -> change order -> visit -> queue -> outbox.
-- Parent commands retain their established order; no DB lock spans provider I/O.
create function app_private.lock_email_sources(c jsonb) returns void
language plpgsql security invoker set search_path='' as $$
declare x uuid;
begin
  for x in select distinct id from (
    select nullif(c->>'job_id','')::uuid id union all select job_id from public.quotes where id in(select value::uuid from jsonb_array_elements_text(coalesce(c->'quote_ids','[]')))
    union all select job_id from public.invoices where id=nullif(c->>'invoice_id','')::uuid
    union all select job_id from public.change_orders where id=nullif(c->>'change_order_id','')::uuid
    union all select job_id from public.schedule_events where id=nullif(c->>'schedule_event_id','')::uuid
    union all select job_id from public.customer_communications where id=nullif(c->>'communication_id','')::uuid
  ) s where id is not null order by id loop perform 1 from public.jobs where id=x for update;end loop;
  for x in select distinct value::uuid from jsonb_array_elements_text(coalesce(c->'quote_ids','[]')) order by 1 loop perform 1 from public.quotes where id=x for update;end loop;
  perform 1 from public.invoices where id=nullif(c->>'invoice_id','')::uuid for update;
  perform 1 from public.change_orders where id=nullif(c->>'change_order_id','')::uuid for update;
  perform 1 from public.schedule_events where id=nullif(c->>'schedule_event_id','')::uuid for update;
  perform 1 from public.appointments where id=nullif(c->>'appointment_id','')::uuid for update;
  perform 1 from public.customer_communications where id=nullif(c->>'communication_id','')::uuid for update;
end $$;

-- Canonical semantic snapshot. Sending/viewing timestamps and derived bookkeeping
-- do not create a new business email; edited content, parties and payments do.
create function app_private.email_source_snapshot(c jsonb) returns jsonb
language plpgsql volatile security invoker set search_path='' as $$
declare result jsonb:='{}'::jsonb; q public.quotes%rowtype; i public.invoices%rowtype; co public.change_orders%rowtype;
  cm public.customer_communications%rowtype; party jsonb; quotes jsonb:='[]'::jsonb; r jsonb; q_id uuid;
begin
  for q_id in select value::uuid from jsonb_array_elements_text(coalesce(c->'quote_ids','[]')) order by 1 loop
    select * into strict q from public.quotes where quotes.id=q_id;
    r:=to_jsonb(q)-array['updated_at','edit_revision','last_edited_at','last_edited_by_user_id','sent_at','sent_method','sent_by_user_id','first_viewed_at','last_viewed_at','view_count'];
    r:=r||jsonb_build_object('status',case when q.status in ('draft','sent') then 'open' else q.status end,
      'lines',(select coalesce(jsonb_agg(to_jsonb(l)-array['created_at','updated_at'] order by l.sort_order,l.id),'[]') from public.quote_line_items l where l.quote_id=q.id));
    quotes:=quotes||jsonb_build_array(r);
  end loop;
  if jsonb_array_length(quotes)>0 then result:=result||jsonb_build_object('quotes',quotes);end if;
  if nullif(c->>'invoice_id','') is not null then
    select * into strict i from public.invoices where invoices.id=(c->>'invoice_id')::uuid;
    result:=result||jsonb_build_object('invoice',(to_jsonb(i)-array['updated_at','status','sent_at','paid_at'])||jsonb_build_object('void',i.status='void',
      'net_paid',app_private.invoice_paid_principal(i.id),'lines',(select coalesce(jsonb_agg(to_jsonb(l)-array['created_at','updated_at'] order by l.sort_order,l.id),'[]') from public.invoice_line_items l where l.invoice_id=i.id)));
  end if;
  if nullif(c->>'change_order_id','') is not null then
    select * into strict co from public.change_orders where change_orders.id=(c->>'change_order_id')::uuid;
    result:=result||jsonb_build_object('change_order',(to_jsonb(co)-array['updated_at','sent_at','status'])||jsonb_build_object('status',case when co.status in ('ready_to_send','sent') then 'open' else co.status end,
      'lines',(select coalesce(jsonb_agg(to_jsonb(l)-array['created_at','updated_at'] order by l.sort_order,l.id),'[]') from public.change_order_line_items l where l.change_order_id=co.id)));
  end if;
  if nullif(c->>'job_id','') is not null then
    select jsonb_build_object('id',j.id,'status',j.status,'customer_id',j.customer_id,'organization_id',j.organization_id,'lead_disposition',j.lead_disposition,
      'archived_at',j.archived_at,'requested_scope',j.requested_scope,'scheduled_start_at',j.scheduled_start_at,'scheduled_end_at',j.scheduled_end_at) into r from public.jobs j where j.id=(c->>'job_id')::uuid;
    result:=result||jsonb_build_object('job',r);
  end if;
  if nullif(c->>'schedule_event_id','') is not null then
    select to_jsonb(s)-array['updated_at','created_at'] into r from public.schedule_events s where s.id=(c->>'schedule_event_id')::uuid;
    result:=result||jsonb_build_object('schedule_event',r);
  end if;
  if nullif(c->>'appointment_id','') is not null then
    select to_jsonb(a)-array['updated_at','created_at'] into r from public.appointments a where a.id=(c->>'appointment_id')::uuid;
    result:=result||jsonb_build_object('appointment',r);
  end if;
  if nullif(c->>'payment_id','') is not null then
    select to_jsonb(p)-array['updated_at','created_at'] into r from public.payments p where p.id=(c->>'payment_id')::uuid;
    result:=result||jsonb_build_object('payment',r);
  end if;
  if nullif(c->>'communication_id','') is not null then
    select * into strict cm from public.customer_communications where customer_communications.id=(c->>'communication_id')::uuid;
    result:=result||jsonb_build_object('communication',to_jsonb(cm)-array['updated_at','attempt_count','processing_started_at','last_error','skip_reason','status','sent_at','provider_message_id','cancelled_at','recipient_email'],
      'automation',(select to_jsonb(s)-array['updated_at','created_at'] from public.communication_settings s where singleton));
  end if;
  if nullif(c->>'customer_id','') is not null then
    select jsonb_build_object('id',p.id,'name',p.display_name,'email',lower(btrim(p.email)),'status',p.status) into party from public.customers p where p.id=(c->>'customer_id')::uuid;
  elsif nullif(c->>'organization_id','') is not null then
    select jsonb_build_object('id',p.id,'name',p.name,'email',lower(btrim(p.billing_email)),'status',p.status,
      'contacts',(select coalesce(jsonb_agg(jsonb_build_object('id',oc.id,'email',lower(btrim(oc.email)),'active',oc.is_active) order by oc.id),'[]') from public.organization_contacts oc where oc.organization_id=p.id)) into party from public.organizations p where p.id=(c->>'organization_id')::uuid;
  end if;
  result:=result||jsonb_build_object('party',party);
  return result;
end $$;

create function public.get_outbound_source_snapshot(p_context jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
begin perform app_private.email_server_only();return app_private.email_source_snapshot(p_context);end $$;

create function app_private.email_source_eligible(c jsonb,p jsonb) returns boolean
language plpgsql volatile security invoker set search_path='' as $$
declare q public.quotes%rowtype; i public.invoices%rowtype; cm public.customer_communications%rowtype; s public.communication_settings%rowtype; r text; q_id uuid; target jsonb; starts timestamptz;
begin
  if c->>'actor_id' is not null and not app_private.email_staff((c->>'actor_id')::uuid) then return false;end if;
  if exists(select 1 from app_private.email_suppressions where recipient in(select lower(value) from jsonb_array_elements_text((p->'to')||coalesce(p->'cc','[]')))) then return false;end if;
  -- Sender-specific kinds preserve existing access; internal notices do not use
  -- customer billing-recipient rules merely because they reference an invoice.
  if c->>'kind'='office' and not exists(select 1 from public.jobs where id=nullif(c->>'job_id','')::uuid and lead_disposition='active' and archived_at is null) then return false;end if;
  if c->>'kind'='quote' then
    for q_id in select value::uuid from jsonb_array_elements_text(c->'quote_ids') loop
      select * into q from public.quotes where quotes.id=q_id;
      if not found or q.status in ('approved','declined','expired','cancelled') or q.archived_at is not null or (q.recurring_occurrence_id is not null and q.pricing_reviewed_at is null) then return false;end if;
      r:=coalesce((select email from public.organization_contacts where id=q.approval_contact_id and is_active),(select email from public.organization_contacts where id=q.recipient_contact_id and is_active),
        (select email from public.customers where id=q.customer_id and status='active'),(select billing_email from public.organizations where id=q.organization_id and status='active'));
      if lower(btrim(r)) is distinct from p#>>'{to,0}' then return false;end if;
    end loop;
  elsif c->>'kind'='invoice' then
    select * into i from public.invoices where invoices.id=(c->>'invoice_id')::uuid;
    if not found or i.status='void' or i.archived_at is not null then return false;end if;
    r:=coalesce((select email from public.organization_contacts where id=i.accounts_payable_contact_id and is_active),(select email from public.organization_contacts where id=i.billing_contact_id and is_active),
      (select email from public.customers where id=i.customer_id and status='active'),(select billing_email from public.organizations where id=i.organization_id and status='active'));
    if lower(btrim(r)) is distinct from p#>>'{to,0}' then return false;end if;
  elsif c->>'kind'='change_order' then
    select coalesce(oc.email,cu.email,o.billing_email) into r from public.change_orders co
      left join public.organization_contacts oc on oc.id=co.approval_contact_id and oc.is_active left join public.customers cu on cu.id=co.customer_id
      left join public.organizations o on o.id=co.organization_id where co.id=(c->>'change_order_id')::uuid;
    if r is null or lower(btrim(r)) is distinct from p#>>'{to,0}' then return false;end if;
    if not exists(select 1 from public.change_orders where id=(c->>'change_order_id')::uuid and status in ('ready_to_send','sent')) then return false;end if;
  end if;
  for target in select value from jsonb_array_elements(coalesce(c->'portal_tokens','[]')) loop
    if target->>'kind'='quote' then
      if not exists(select 1 from public.quote_portal_tokens where id=(target->>'id')::uuid and revoked_at is null and (expires_at is null or expires_at>now())) then return false;end if;
    elsif target->>'kind'='invoice' then
      if not exists(select 1 from public.invoice_portal_tokens where id=(target->>'id')::uuid and revoked_at is null and (expires_at is null or expires_at>now())) then return false;end if;
    elsif target->>'kind'='change_order' then
      if not exists(select 1 from public.change_order_portal_tokens where id=(target->>'id')::uuid and revoked_at is null and (expires_at is null or expires_at>now())) then return false;end if;
    else return false;end if;
  end loop;
  if nullif(c->>'communication_id','') is not null then
    select * into cm from public.customer_communications where customer_communications.id=(c->>'communication_id')::uuid;
    select * into s from public.communication_settings where singleton;
    if not found or cm.status not in ('processing','pending','failed') or (cm.is_automatic and not s.automated_sending_enabled) then return false;end if;
    r:=coalesce((select email from public.customers where id=cm.customer_id and status='active'),(select billing_email from public.organizations where id=cm.organization_id and status='active'));
    -- Explicit organization workflow contacts take precedence over billing.
    if cm.organization_id is not null then
      if cm.quote_id is not null then select coalesce(oc.email,o.billing_email) into r from public.quotes qq join public.organizations o on o.id=qq.organization_id left join public.organization_contacts oc on oc.id=coalesce(qq.approval_contact_id,qq.recipient_contact_id) and oc.is_active where qq.id=cm.quote_id;
      elsif cm.invoice_id is not null then select coalesce(oc.email,o.billing_email) into r from public.invoices ii join public.organizations o on o.id=ii.organization_id left join public.organization_contacts oc on oc.id=coalesce(ii.accounts_payable_contact_id,ii.billing_contact_id) and oc.is_active where ii.id=cm.invoice_id;
      elsif cm.job_id is not null then select coalesce(oc.email,o.billing_email) into r from public.jobs j join public.organizations o on o.id=j.organization_id left join public.organization_contacts oc on oc.id=coalesce(j.onsite_contact_id,j.property_manager_contact_id) and oc.is_active where j.id=cm.job_id;end if;
    end if;
    if lower(btrim(r)) is distinct from p#>>'{to,0}' then return false;end if;
    if cm.communication_type='quote_follow_up' then
      select * into q from public.quotes where quotes.id=cm.quote_id;
      if not found or q.status<>'sent' or q.archived_at is not null or (cm.is_automatic and not q.automatic_follow_ups_enabled) then return false;end if;
    elsif cm.communication_type in ('invoice_payment_reminder','overdue_invoice_reminder') then
      select * into i from public.invoices where invoices.id=cm.invoice_id;
      if not found or i.status not in ('sent','partially_paid','overdue') or i.archived_at is not null or i.total_cents<=app_private.invoice_paid_principal(i.id) or (cm.is_automatic and not i.automatic_reminders_enabled) then return false;end if;
    elsif cm.communication_type='payment_confirmation' then
      if not exists(select 1 from public.payments where payments.id=cm.payment_id and status='succeeded') then return false;end if;
    else
      if cm.schedule_event_id is not null then select jsonb_build_object('start',starts_at,'status',status,'type',event_type) into target from public.schedule_events where schedule_events.id=cm.schedule_event_id;
      elsif cm.appointment_id is not null then select jsonb_build_object('start',starts_at,'status',status,'type',appointment_type) into target from public.appointments where appointments.id=cm.appointment_id;
      else select jsonb_build_object('start',scheduled_start_at,'status',status,'type','job') into target from public.jobs where jobs.id=cm.job_id;end if;
      starts:=(target->>'start')::timestamptz;
      if starts is null or starts<=now() or target->>'status' not in ('scheduled','confirmed','accepted') or (cm.source_version is not null and cm.source_version::timestamptz<>starts)
        or (cm.communication_type like 'estimate_%') is distinct from (target->>'type'='estimate') then return false;end if;
    end if;
  end if;
  return true;
end $$;

create function public.prepare_outbound_delivery(p_request_key text,p_payload jsonb,p_context jsonb,p_expected_snapshot jsonb default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare d app_private.outbound_deliveries%rowtype; snap jsonb; business text; ph text; x jsonb; v text;
begin
  perform app_private.email_server_only();
  if nullif(p_request_key,'') is null or length(p_request_key)>256 or p_request_key !~ '^[!-~]+$' or jsonb_typeof(p_payload) is distinct from 'object'
    or octet_length(p_payload::text)>524288 or jsonb_typeof(p_context) is distinct from 'object' or octet_length(p_context::text)>16000
    or jsonb_typeof(p_payload->'to') is distinct from 'array' or jsonb_array_length(p_payload->'to')<>1
    or coalesce(p_payload#>>'{to,0}','') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or coalesce(length(p_payload->>'subject'),0) not between 1 and 998
    or coalesce(length(p_payload->>'text'),0)>400000 or coalesce(length(p_payload->>'html'),0)>400000
    or nullif(p_payload->>'from','') is null or nullif(p_payload->>'reply_to','') is null then
    raise exception 'Invalid saved email request' using errcode='22023';end if;
  if p_context->>'actor_id' is not null and not app_private.email_staff((p_context->>'actor_id')::uuid) then raise exception 'Email access revoked' using errcode='42501';end if;
  perform app_private.lock_email_sources(p_context);
  perform pg_advisory_xact_lock(141,hashtext(p_request_key));
  select od.* into d from app_private.outbound_delivery_requests a join app_private.outbound_deliveries od on od.id=a.delivery_id where a.request_key=p_request_key;
  ph:=encode(sha256(convert_to(p_payload::text,'UTF8')),'hex');
  if found then
    if d.payload_hash<>ph or (d.context-array['expected_versions','copy_of']) is distinct from (p_context-array['expected_versions','copy_of']) then
      return jsonb_build_object('id',d.id,'state',d.state,'conflict',true,'provider_message_id',d.provider_message_id,'repair_state',d.repair_state,'retry_authorized',d.retry_authorized);
    end if;
    return jsonb_build_object('id',d.id,'state',d.state,'conflict',false,'provider_message_id',d.provider_message_id,'repair_state',d.repair_state,'retry_authorized',d.retry_authorized);
  end if;
  if nullif(p_context->>'communication_id','') is not null and exists(select 1 from public.customer_communications where id=(p_context->>'communication_id')::uuid and attempt_count>1) then
    raise exception 'Legacy attempt has no frozen request; review delivery history' using errcode='23514';end if;
  if p_context->>'kind' in ('quote','invoice','change_order') and exists(select 1 from public.email_events e where e.outbound_delivery_id is null and lower(e.recipient_email)=p_payload#>>'{to,0}' and e.status='sent'
    and ((p_context->>'kind'='quote' and e.email_type='quote' and e.related_quote_id in(select value::uuid from jsonb_array_elements_text(coalesce(p_context->'quote_ids','[]')))) or (p_context->>'kind'='invoice' and e.email_type='invoice' and e.related_invoice_id=nullif(p_context->>'invoice_id','')::uuid) or (p_context->>'kind'='change_order' and e.email_type='change_order' and e.related_change_order_id=nullif(p_context->>'change_order_id','')::uuid)))
    and not coalesce((p_context->>'confirmed_copy')::boolean,false) then raise exception 'An earlier email was accepted; confirm an additional email after review' using errcode='23514';end if;
  if p_context->>'kind' in ('quote','invoice','change_order') and exists(select 1 from public.email_events e where e.outbound_delivery_id is null and e.status='failed' and e.error_message='provider_outcome_unknown' and lower(e.recipient_email)=p_payload#>>'{to,0}' and
    ((p_context->>'kind'='quote' and e.email_type='quote' and e.related_quote_id in(select value::uuid from jsonb_array_elements_text(coalesce(p_context->'quote_ids','[]')))) or (p_context->>'kind'='invoice' and e.email_type='invoice' and e.related_invoice_id=nullif(p_context->>'invoice_id','')::uuid) or (p_context->>'kind'='change_order' and e.email_type='change_order' and e.related_change_order_id=nullif(p_context->>'change_order_id','')::uuid))) then
    raise exception 'An older email is uncertain; check provider evidence before sending' using errcode='23514';end if;
  snap:=app_private.email_source_snapshot(p_context);
  if p_expected_snapshot is not null and p_expected_snapshot<>snap then raise exception 'Email source changed; reload before sending' using errcode='40001';end if;
  for v,x in select key,value from jsonb_each(coalesce(p_context->'expected_versions','{}')) loop
    if v like 'quote:%' then
      if not exists(select 1 from public.quotes where quotes.id=substring(v from 7)::uuid and edit_revision=x::text::integer) then raise exception 'Quote changed; reload before sending' using errcode='40001';end if;
    elsif v like 'invoice:%' then
      if not exists(select 1 from public.invoices where invoices.id=substring(v from 9)::uuid and updated_at=(x#>>'{}')::timestamptz) then raise exception 'Invoice changed; reload before sending' using errcode='40001';end if;
    elsif v like 'change_order:%' then
      if not exists(select 1 from public.change_orders where change_orders.id=substring(v from 14)::uuid and updated_at=(x#>>'{}')::timestamptz) then raise exception 'Change order changed; reload before sending' using errcode='40001';end if;
    end if;
  end loop;
  if not app_private.email_source_eligible(p_context,p_payload) then raise exception 'Email source or recipient is no longer eligible' using errcode='23514';end if;
  if p_context->>'kind' in ('quote','invoice','change_order') then
    business:='document/'||(p_context->>'kind')||'/'||encode(sha256(convert_to((p_context-array['actor_id','expected_versions','confirmed_copy','copy_request_id'])::text||snap::text,'UTF8')),'hex');
  elsif p_context->>'communication_id' is not null then
    select 'communication/'||encode(sha256(convert_to(jsonb_build_array(communication_type,reminder_stage,customer_id,organization_id,quote_id,invoice_id,job_id,schedule_event_id,appointment_id,payment_id,
      source_version::text)::text,'UTF8')),'hex') into business
      from public.customer_communications where customer_communications.id=(p_context->>'communication_id')::uuid;
  else business:=p_request_key;end if;
  perform pg_advisory_xact_lock(142,hashtext(business));
  if coalesce((p_context->>'confirmed_copy')::boolean,false) then
    if p_context->>'kind' not in ('quote','invoice','change_order') or nullif(p_context->>'copy_request_id','') is null then raise exception 'Confirm the current email request' using errcode='22023';end if;
    select * into d from app_private.outbound_deliveries where business_key=business for update;
    if found then
      if d.state='accepted' and d.delivery_status in ('accepted','delayed','delivered') then
        p_context:=p_context||jsonb_build_object('copy_of',d.id);
      elsif (d.first_dispatched_at is null and d.state in ('prepared','cancelled')) or (d.attempt_count=1 and ((d.state='rejected' and d.problem_code='provider_definite_rejection') or d.state='not_attempted')) then
        update app_private.outbound_deliveries set state='cancelled',repair_state='acknowledged',problem_code=case when d.first_dispatched_at is null then 'replaced_before_dispatch' else 'replaced_after_definite_rejection' end where id=d.id;
        insert into public.activity_log(actor_user_id,actor_type,subject_type,subject_id,event_type,metadata_json)
          values(nullif(p_context->>'actor_id','')::uuid,'staff','email_delivery',d.id,'saved_email_replaced',jsonb_build_object('request_id',p_context->>'copy_request_id','email_sent',false));
        p_context:=p_context||jsonb_build_object('copy_of',d.id);
      else raise exception 'Review the original provider outcome before another email' using errcode='23514';end if;
      business:=business||'/copy/'||((p_context->>'copy_request_id')::uuid)::text;
    end if;
  end if;

  select * into d from app_private.outbound_deliveries where business_key=business;
  if found then
    insert into app_private.outbound_delivery_requests(request_key,delivery_id) values(p_request_key,d.id);
    return jsonb_build_object('id',d.id,'state',d.state,'conflict',d.payload_hash<>ph,'provider_message_id',d.provider_message_id,'repair_state',d.repair_state,'retry_authorized',d.retry_authorized);
  end if;
  insert into app_private.outbound_deliveries(business_key,provider_key,payload,payload_hash,context,source_snapshot,actor_id)
    values(business,p_request_key,p_payload,ph,p_context,snap,nullif(p_context->>'actor_id','')::uuid) returning * into d;
  insert into app_private.outbound_delivery_requests(request_key,delivery_id) values(p_request_key,d.id);
  return jsonb_build_object('id',d.id,'state',d.state,'conflict',false,'provider_message_id',d.provider_message_id,'repair_state',d.repair_state,'retry_authorized',d.retry_authorized);
end $$;

create function public.claim_outbound_delivery(p_delivery_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare d app_private.outbound_deliveries%rowtype; a uuid; interval_hours integer;
begin
  perform app_private.email_server_only();
  select * into d from app_private.outbound_deliveries where id=p_delivery_id;
  if not found then return null;end if;
  perform app_private.lock_email_sources(d.context);
  select * into d from app_private.outbound_deliveries where id=p_delivery_id for update;
  if not (d.state='prepared' or (d.state='rejected' and d.retry_authorized)) or d.attempt_count>=3 then return null;end if;
  if d.first_dispatched_at is not null and (not d.retry_authorized or d.first_dispatched_at<=clock_timestamp()-interval '23 hours') then
    update app_private.outbound_deliveries set repair_state='needs_review',problem_code='provider_key_expired' where id=d.id;return null;
  end if;
  if d.source_snapshot<>app_private.email_source_snapshot(d.context) or not app_private.email_source_eligible(d.context||jsonb_build_object('actor_id',coalesce(d.authorized_actor_id,d.actor_id)),d.payload) then
    update app_private.outbound_deliveries set state='cancelled',repair_state='source_changed',problem_code='source_changed' where id=d.id;return null;
  end if;
  if d.context->>'communication_id' is not null then
    select minimum_send_interval_hours into interval_hours from public.communication_settings where singleton;
    -- Serialize matching delivery admission across distinct queue rows too.
    perform pg_advisory_xact_lock(143,hashtext((d.payload#>>'{to,0}')||'/'||(d.context->>'email_type')));
    if exists(select 1 from app_private.outbound_deliveries o where o.id<>d.id and o.payload#>>'{to,0}'=d.payload#>>'{to,0}'
      and o.context->>'email_type'=d.context->>'email_type'
      and coalesce(o.context->>'invoice_id',o.context->>'quote_ids',o.context->>'schedule_event_id',o.context->>'appointment_id',o.context->>'job_id','')=
        coalesce(d.context->>'invoice_id',d.context->>'quote_ids',d.context->>'schedule_event_id',d.context->>'appointment_id',d.context->>'job_id','')
      and ((o.state='accepted' and o.accepted_at>now()-make_interval(hours=>coalesce(interval_hours,24))) or o.state in ('dispatching','unknown'))) then
      update app_private.outbound_deliveries set state='cancelled',repair_state='needs_review',problem_code='matching_delivery' where id=d.id;return null;
    end if;
  end if;
  a:=gen_random_uuid();
  update app_private.outbound_deliveries set state='dispatching',active_communication_claim=(select jsonb_build_object('attempt_count',cm.attempt_count,'processing_started_at',cm.processing_started_at,'status',cm.status) from public.customer_communications cm where cm.id=nullif(d.context->>'communication_id','')::uuid),attempt_id=a,attempt_count=attempt_count+1,retry_authorized=false,
    first_dispatched_at=coalesce(first_dispatched_at,clock_timestamp()),last_dispatched_at=clock_timestamp(),lease_expires_at=clock_timestamp()+interval '2 minutes',updated_at=clock_timestamp(),problem_code=null where id=d.id;
  insert into app_private.outbound_delivery_attempts(id,delivery_id,actor_id) values(a,d.id,coalesce(d.authorized_actor_id,d.actor_id));
  return jsonb_build_object('id',d.id,'attempt_id',a,'payload',d.payload,'context',d.context,'idempotency_key',d.provider_key);
end $$;

create function app_private.sync_website_notice(p_job uuid) returns void
language plpgsql security invoker set search_path='' as $$
declare ids uuid[]; total integer; accepted integer; attempted integer; outcome text;
begin
  select notice_delivery_ids into ids from app_private.website_lead_submissions where job_id=p_job;
  if coalesce(cardinality(ids),0)=0 then return;end if;
  select count(*),count(*) filter(where state='accepted' and delivery_status in ('accepted','delayed','delivered')),count(*) filter(where first_dispatched_at is not null) into total,accepted,attempted from app_private.outbound_deliveries where id=any(ids);
  outcome:=case when total=accepted then 'accepted' when attempted=0 then 'pending' else 'unknown' end;
  -- Preserve PR13's attempt pair invariant, even when preparing a pending batch.
  update public.jobs set notification_outcome=case when outcome='pending' and notification_attempt_id is not null then 'sending' else outcome end,
    notification_status=case outcome when 'accepted' then 'sent' when 'pending' then 'pending' else 'failed' end,
    notification_error=case when outcome='unknown' then 'Some office notices need delivery review before retrying.' end where id=p_job;
end $$;

create function app_private.reconcile_outbound_delivery(p_delivery uuid) returns boolean
language plpgsql security invoker set search_path='' as $$
declare d app_private.outbound_deliveries%rowtype; q public.quotes%rowtype; i public.invoices%rowtype; q_id uuid; paid bigint; balance integer; resolved text;
begin
  select * into d from app_private.outbound_deliveries where id=p_delivery for update;
  if d.state<>'accepted' then return false;end if;
  -- Receipt/history is repaired even when the source changed. Never overwrite a
  -- newer quote, terminal invoice, schedule or financial source with old intent.
  insert into public.email_events(outbound_delivery_id,related_customer_id,related_job_id,related_quote_id,related_invoice_id,related_change_order_id,related_organization_id,
    related_schedule_event_id,related_appointment_id,related_payment_id,related_communication_id,recipient_email,subject,email_type,status,provider_message_id,sent_by_user_id,sent_at,delivery_status,delivery_status_at)
  values(d.id,nullif(d.context->>'customer_id','')::uuid,nullif(d.context->>'job_id','')::uuid,nullif(d.context#>>'{quote_ids,0}','')::uuid,nullif(d.context->>'invoice_id','')::uuid,
    nullif(d.context->>'change_order_id','')::uuid,nullif(d.context->>'organization_id','')::uuid,nullif(d.context->>'schedule_event_id','')::uuid,nullif(d.context->>'appointment_id','')::uuid,
    nullif(d.context->>'payment_id','')::uuid,nullif(d.context->>'communication_id','')::uuid,d.payload#>>'{to,0}',d.payload->>'subject',d.context->>'email_type','sent',d.provider_message_id,d.actor_id,d.accepted_at,d.delivery_status,d.last_event_at)
  on conflict(outbound_delivery_id) where outbound_delivery_id is not null do update set status='sent',provider_message_id=excluded.provider_message_id,
    error_message=null,sent_at=excluded.sent_at,delivery_status=excluded.delivery_status,delivery_status_at=excluded.delivery_status_at;
  if d.repair_state='complete' then return true;end if;
  if d.source_snapshot<>app_private.email_source_snapshot(d.context) or exists(select 1 from public.customer_communications cm where cm.id=nullif(d.context->>'communication_id','')::uuid and (cm.status in ('cancelled','skipped') or jsonb_build_object('attempt_count',cm.attempt_count,'processing_started_at',cm.processing_started_at,'status',cm.status) is distinct from d.active_communication_claim)) then
    update app_private.outbound_deliveries set repair_state='source_changed',problem_code='source_changed_after_dispatch',updated_at=clock_timestamp() where id=d.id;
    return false;
  end if;
  if d.context->>'kind'='quote' then
    for q_id in select value::uuid from jsonb_array_elements_text(d.context->'quote_ids') order by 1 loop
      select * into q from public.quotes where quotes.id=q_id;
      if q.status in ('approved','declined','expired','cancelled') then raise exception 'Closed quote cannot be marked sent' using errcode='23514';end if;
      update public.quotes set status='sent',sent_at=coalesce(sent_at,d.accepted_at),sent_method='crm_email',sent_by_user_id=d.actor_id where quotes.id=q_id;
      if q.recurring_occurrence_id is not null then
        update public.recurring_service_occurrences set status='quote_sent' where recurring_service_occurrences.id=q.recurring_occurrence_id and status in ('upcoming','review_needed','quote_draft','quote_sent');
      end if;
      insert into public.activity_log(actor_user_id,actor_type,subject_type,subject_id,event_type,metadata_json)
        values(d.actor_id,'system','quote',q_id,'quote_sent',jsonb_build_object('outbound_delivery_id',d.id,'provider_message_id',d.provider_message_id,'delivery_method','crm_email'));
    end loop;
  elsif d.context->>'kind'='invoice' then
    select * into i from public.invoices where invoices.id=(d.context->>'invoice_id')::uuid;
    if i.status='void' then raise exception 'Void invoice cannot be marked sent' using errcode='23514';end if;
    -- Same PR03/07 principal and derived-state helpers; no line/payment mutation.
    paid:=app_private.invoice_paid_principal(i.id);balance:=greatest(0,i.total_cents::bigint-paid)::integer;
    resolved:=app_private.invoice_payment_status(i.status,balance,paid,coalesce(i.sent_at,d.accepted_at),i.due_at);
    update public.invoices set sent_at=coalesce(sent_at,d.accepted_at),balance_due_cents=balance,status=resolved,
      paid_at=case when balance=0 then coalesce(paid_at,clock_timestamp()) else null end where invoices.id=i.id;
    insert into public.activity_log(actor_user_id,actor_type,subject_type,subject_id,event_type,metadata_json)
      values(d.actor_id,'system','invoice',i.id,'invoice_sent',jsonb_build_object('outbound_delivery_id',d.id,'provider_message_id',d.provider_message_id,'delivery_method','crm_email'));
  elsif d.context->>'kind'='change_order' then
    update public.change_orders set status='sent',sent_at=coalesce(sent_at,d.accepted_at) where change_orders.id=(d.context->>'change_order_id')::uuid and status in ('ready_to_send','sent');
    insert into public.activity_log(actor_user_id,actor_type,subject_type,subject_id,event_type,metadata_json)
      values(d.actor_id,'system','change_order',(d.context->>'change_order_id')::uuid,'change_order_sent',jsonb_build_object('outbound_delivery_id',d.id,'delivery_method','crm_email'));
  end if;
  if d.context->>'communication_id' is not null then
    update public.customer_communications set status='sent',sent_at=coalesce(sent_at,d.accepted_at),provider_message_id=d.provider_message_id,processing_started_at=null,last_error=null,skip_reason=null
      where customer_communications.id=(d.context->>'communication_id')::uuid;
  end if;
  update app_private.outbound_deliveries set repair_state='complete',followup_sync_pending=(d.context->>'kind' in ('quote','invoice')),problem_code=null,updated_at=clock_timestamp() where outbound_deliveries.id=d.id;
  return true;
end $$;

create function public.finish_outbound_delivery(p_delivery_id uuid,p_attempt_id uuid,p_outcome text,p_provider_message_id text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare d app_private.outbound_deliveries%rowtype; repaired boolean:=false; can_retry boolean:=false; definite_rejection boolean:=false;
begin
  perform app_private.email_server_only();
  select * into d from app_private.outbound_deliveries where id=p_delivery_id;
  if not found then raise exception 'Delivery not found' using errcode='P0002';end if;
  perform app_private.lock_email_sources(d.context);
  select * into d from app_private.outbound_deliveries where id=p_delivery_id for update;
  if p_outcome='rejected_definite' then p_outcome:='rejected';definite_rejection:=true;end if;
  if p_outcome='rejected_retryable' then p_outcome:='rejected';can_retry:=true;end if;
  if d.attempt_id is distinct from p_attempt_id or p_attempt_id is null or p_outcome not in ('accepted','rejected','unknown','not_attempted') then raise exception 'Delivery attempt changed' using errcode='40001';end if;
  if d.state='accepted' then
    if p_provider_message_id is not null and p_provider_message_id is distinct from d.provider_message_id then raise exception 'Provider message conflict' using errcode='23505';end if;
  elsif d.state='dispatching' then
    if p_outcome='accepted' and coalesce(p_provider_message_id,'') !~ '^[A-Za-z0-9_-]{1,200}$' then raise exception 'Missing provider acceptance' using errcode='22023';end if;
    update app_private.outbound_deliveries set state=p_outcome,provider_message_id=p_provider_message_id,
      accepted_at=case when p_outcome='accepted' then clock_timestamp() end,
      delivery_status=case when p_outcome='accepted' then 'accepted' else 'pending' end,
      lease_expires_at=null,retry_authorized=can_retry and d.attempt_count<3 and d.first_dispatched_at>clock_timestamp()-interval '23 hours',repair_state=case when p_outcome='accepted' then 'pending' else 'needs_review' end,
      problem_code=case when definite_rejection then 'provider_definite_rejection' when p_outcome<>'accepted' then 'provider_'||p_outcome end,updated_at=clock_timestamp() where id=d.id;
  end if;
  update app_private.outbound_delivery_attempts set outcome=coalesce(outcome,p_outcome),completed_at=coalesce(completed_at,clock_timestamp()),provider_message_id=coalesce(provider_message_id,p_provider_message_id) where id=p_attempt_id;
  if p_outcome='accepted' or d.state='accepted' then
    begin repaired:=app_private.reconcile_outbound_delivery(d.id);
    exception when others then
      update app_private.outbound_deliveries set repair_state='needs_review',problem_code='history_pending' where id=d.id;
    end;
  end if;
  if p_outcome<>'accepted' and d.state<>'accepted' then
    begin
      insert into public.email_events(outbound_delivery_id,related_customer_id,related_job_id,related_quote_id,related_invoice_id,related_organization_id,related_communication_id,recipient_email,subject,email_type,status,error_message,sent_by_user_id)
      values(d.id,nullif(d.context->>'customer_id','')::uuid,nullif(d.context->>'job_id','')::uuid,nullif(d.context#>>'{quote_ids,0}','')::uuid,nullif(d.context->>'invoice_id','')::uuid,nullif(d.context->>'organization_id','')::uuid,nullif(d.context->>'communication_id','')::uuid,d.payload#>>'{to,0}',d.payload->>'subject',d.context->>'email_type','failed','provider_'||p_outcome,d.actor_id)
      on conflict(outbound_delivery_id) where outbound_delivery_id is not null do nothing;
    exception when others then update app_private.outbound_deliveries set problem_code='history_pending' where id=d.id;end;
  end if;
  if d.context->>'email_type'='lead_internal_notice' then perform app_private.sync_website_notice((d.context->>'job_id')::uuid);end if;
  select * into d from app_private.outbound_deliveries where id=p_delivery_id;
  return jsonb_build_object('id',d.id,'state',d.state,'provider_message_id',d.provider_message_id,'repair_state',d.repair_state,'retry_authorized',d.retry_authorized,'followup_sync_pending',d.followup_sync_pending,'repaired',repaired,'history_recorded',exists(select 1 from public.email_events where outbound_delivery_id=d.id));
end $$;

create function public.record_outbound_provider_event(p_event_id text,p_hash text,p_message_id text,p_delivery_id uuid,p_type text,p_occurred_at timestamptz,p_recipients jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare d app_private.outbound_deliveries%rowtype; old app_private.outbound_provider_events%rowtype; label text; rank_new integer; rank_old integer; target uuid; v_recipient text; repaired boolean:=false;
begin
  perform app_private.email_server_only();
  if length(p_event_id) not between 1 and 220 or p_hash !~ '^[a-f0-9]{64}$' or p_message_id !~ '^[A-Za-z0-9_-]{1,200}$'
    or p_occurred_at is null or p_occurred_at>now()+interval '5 minutes' or jsonb_typeof(p_recipients) is distinct from 'array' or jsonb_array_length(p_recipients) not between 1 and 100 then raise exception 'Invalid provider event' using errcode='22023';end if;
  perform pg_advisory_xact_lock(144,hashtext(p_event_id));
  select * into old from app_private.outbound_provider_events where event_id=p_event_id;
  if found then
    if old.payload_hash<>p_hash then raise exception 'Provider event collision' using errcode='23505';end if;
    if old.delivery_id is not null then
      select * into d from app_private.outbound_deliveries where id=old.delivery_id;
      perform app_private.lock_email_sources(d.context);
      begin repaired:=app_private.reconcile_outbound_delivery(old.delivery_id);
      exception when others then update app_private.outbound_deliveries set repair_state='needs_review',problem_code='history_pending' where id=old.delivery_id;end;
    end if;
    return jsonb_build_object('replayed',true,'disposition',old.disposition,'delivery_id',old.delivery_id);
  end if;
  select * into d from app_private.outbound_deliveries where provider_message_id=p_message_id or id=p_delivery_id order by (provider_message_id=p_message_id) desc nulls last limit 1;
  if found then
    perform app_private.lock_email_sources(d.context);
    select * into d from app_private.outbound_deliveries where id=d.id for update;
    if d.first_dispatched_at is null or (p_delivery_id is not null and p_delivery_id<>d.id) or (d.provider_message_id is not null and d.provider_message_id<>p_message_id)
      or exists(select 1 from jsonb_array_elements_text(p_recipients) r where lower(r.value) not in(select lower(value) from jsonb_array_elements_text((d.payload->'to')||coalesce(d.payload->'cc','[]')))) then
      insert into app_private.outbound_provider_events values(p_event_id,p_hash,p_message_id,null,p_type,p_occurred_at,'quarantined',now());
      return jsonb_build_object('replayed',false,'disposition','quarantined');
    end if;
    target:=d.id;
  end if;
  label:=case p_type when 'email.sent' then 'accepted' when 'email.delivered' then 'delivered' when 'email.delivery_delayed' then 'delayed'
    when 'email.bounced' then 'bounced' when 'email.complained' then 'complained' when 'email.failed' then 'failed' when 'email.suppressed' then 'suppressed' end;
  insert into app_private.outbound_provider_events(event_id,payload_hash,provider_message_id,delivery_id,event_type,occurred_at,disposition)
    values(p_event_id,p_hash,p_message_id,target,p_type,p_occurred_at,case when target is null then 'unmatched' when label is null then 'ignored' else 'matched' end);
  if label is null then return jsonb_build_object('replayed',false,'disposition','ignored');end if;
  if target is not null then
    rank_new:=array_position(array['pending','accepted','delayed','delivered','failed','suppressed','bounced','complained'],label);
    rank_old:=array_position(array['pending','accepted','delayed','delivered','failed','suppressed','bounced','complained'],d.delivery_status);
    update app_private.outbound_deliveries set state='accepted',provider_message_id=p_message_id,accepted_at=coalesce(accepted_at,p_occurred_at),
      delivery_status=case when rank_new>=rank_old then label else delivery_status end,last_event_at=greatest(last_event_at,p_occurred_at),lease_expires_at=null,
      repair_state=case when repair_state='complete' then 'complete' else 'pending' end,updated_at=clock_timestamp() where id=target;
    begin repaired:=app_private.reconcile_outbound_delivery(target);
    exception when others then update app_private.outbound_deliveries set repair_state='needs_review',problem_code='history_pending' where id=target;end;
    if d.context->>'email_type'='lead_internal_notice' then perform app_private.sync_website_notice((d.context->>'job_id')::uuid);end if;
  else
    -- Legacy history can receive delivery facts, but cannot authorize source repair
    -- without the immutable source/version evidence that older sends never stored.
    update public.email_events e set delivery_status=case
      when array_position(array['accepted','delayed','delivered','failed','suppressed','bounced','complained'],label)>=coalesce(array_position(array['accepted','delayed','delivered','failed','suppressed','bounced','complained'],e.delivery_status),0) then label else e.delivery_status end,
      delivery_status_at=greatest(e.delivery_status_at,p_occurred_at)
      where provider_message_id=p_message_id and lower(recipient_email) in(select lower(value) from jsonb_array_elements_text(p_recipients));
  end if;
  if label in ('bounced','complained','suppressed') and p_event_id not like 'lookup_%' and (target is not null or exists(select 1 from public.email_events where provider_message_id=p_message_id)) then
    for v_recipient in select lower(value) from jsonb_array_elements_text(p_recipients) loop
      insert into app_private.email_suppressions(recipient,reason,provider_message_id) values(v_recipient,label,p_message_id) on conflict(recipient) do update set reason=excluded.reason,provider_message_id=excluded.provider_message_id;
      update public.customer_communications set status='cancelled',cancelled_at=clock_timestamp(),skip_reason='Provider reported a delivery problem. Review the address before further email.'
        where status='pending' and lower(recipient_email)=v_recipient;
    end loop;
  end if;
  return jsonb_build_object('replayed',false,'disposition',case when target is null then 'unmatched' else 'matched' end,'repaired',repaired,'delivery_id',target);
end $$;

create function public.acknowledge_outbound_followup(p_delivery_id uuid) returns boolean
language plpgsql security definer set search_path='' as $$
begin perform app_private.email_server_only();update app_private.outbound_deliveries set followup_sync_pending=false where id=p_delivery_id and state='accepted' and repair_state='complete';return found;end $$;

create function public.record_legacy_email_provider_check(p_event_id uuid,p_actor_id uuid,p_provider_id text,p_subject text,p_recipient text,p_provider_created_at timestamptz,p_delivery_status text,p_reason text) returns boolean
language plpgsql security definer set search_path='' as $$
declare e public.email_events%rowtype;
begin
  perform app_private.email_server_only();
  if not app_private.email_staff(p_actor_id,true) then raise exception 'Administrator review required' using errcode='42501';end if;
  select * into e from public.email_events where id=p_event_id for update;
  if not found or e.outbound_delivery_id is not null or e.subject<>p_subject or lower(e.recipient_email)<>lower(p_recipient)
    or p_provider_id !~ '^[A-Za-z0-9_-]{1,200}$' or (e.provider_message_id is not null and e.provider_message_id<>p_provider_id)
    or abs(extract(epoch from(e.created_at-p_provider_created_at)))>300 or p_delivery_status not in ('accepted','delayed','delivered','failed','bounced','complained','suppressed') or p_reason is null or length(btrim(p_reason)) not between 5 and 1000 then
    raise exception 'Provider evidence does not match the earlier attempt' using errcode='23514';end if;
  if coalesce(array_position(array['accepted','delayed','delivered','failed','suppressed','bounced','complained'],e.delivery_status),0)>array_position(array['accepted','delayed','delivered','failed','suppressed','bounced','complained'],p_delivery_status) then p_delivery_status:=e.delivery_status;end if;
  if e.provider_message_id=p_provider_id and e.delivery_status=p_delivery_status and e.status='sent' then return true;end if;
  update public.email_events set status='sent',provider_message_id=p_provider_id,sent_at=coalesce(sent_at,p_provider_created_at),delivery_status=p_delivery_status,delivery_status_at=clock_timestamp(),error_message=null where id=e.id;
  insert into public.activity_log(actor_user_id,actor_type,subject_type,subject_id,event_type,metadata_json) values(p_actor_id,'staff','email_event',e.id,'legacy_email_delivery_checked',jsonb_build_object('reason',btrim(p_reason),'provider_message_id',p_provider_id,'delivery_status',p_delivery_status,'source_state_changed',false,'email_sent',false));
  return true;
end $$;

create function public.find_outbound_delivery_request(p_request_key text) returns uuid
language plpgsql security definer set search_path='' as $$
begin perform app_private.email_server_only();return(select delivery_id from app_private.outbound_delivery_requests where request_key=p_request_key);end $$;

create function public.get_outbound_delivery(p_delivery_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare d app_private.outbound_deliveries%rowtype;
begin perform app_private.email_server_only();select * into d from app_private.outbound_deliveries where id=p_delivery_id;
  if not found then return null;end if;
  return to_jsonb(d)||jsonb_build_object('history_recorded',exists(select 1 from public.email_events where outbound_delivery_id=d.id));
end $$;

create function public.prepare_website_notice_batch(p_job_id uuid,p_attempt_id uuid,p_messages jsonb)
returns uuid[] language plpgsql security definer set search_path='' as $$
declare submission app_private.website_lead_submissions%rowtype; j public.jobs%rowtype; item jsonb; ids uuid[]:='{}'::uuid[]; r jsonb; n integer:=0;
begin
  perform app_private.email_server_only();select * into j from public.jobs where id=p_job_id for update;
  select * into submission from app_private.website_lead_submissions where job_id=p_job_id for update;
  if not found then raise exception 'Older notice requires manual review' using errcode='23514';end if;
  if cardinality(submission.notice_delivery_ids)>0 then return submission.notice_delivery_ids;end if;
  if p_attempt_id is null or j.notification_attempt_id is distinct from p_attempt_id or j.notification_outcome<>'sending' then raise exception 'Notice claim changed' using errcode='40001';end if;
  if jsonb_typeof(p_messages) is distinct from 'array' or jsonb_array_length(p_messages) not between 1 and 10 then raise exception 'Invalid office notice batch' using errcode='22023';end if;
  for item in select value from jsonb_array_elements(p_messages) loop
    n:=n+1;
    r:=public.prepare_outbound_delivery('website-notice/'||p_job_id||'/'||n,item,jsonb_build_object('kind','office','email_type','lead_internal_notice','job_id',p_job_id,'batch_id',p_attempt_id));
    ids:=array_append(ids,(r->>'id')::uuid);
  end loop;
  update app_private.website_lead_submissions set notice_delivery_ids=ids where job_id=p_job_id;
  return ids;
end $$;

create function public.get_website_notice_repair(p_job_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  perform app_private.email_server_only();return (select jsonb_build_object('submission',s.submission,'delivery_ids',s.notice_delivery_ids,'attempt_id',j.notification_attempt_id,'outcome',j.notification_outcome)
    from app_private.website_lead_submissions s join public.jobs j on j.id=s.job_id where s.job_id=p_job_id);
end $$;

create function public.review_outbound_delivery(p_delivery_id uuid,p_action text,p_reason text,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare d app_private.outbound_deliveries%rowtype; copied app_private.outbound_deliveries%rowtype; repaired boolean; key text;
begin
  if auth.uid() is null or not app_private.email_staff(auth.uid(),p_action<>'new_copy') then raise exception 'Delivery review is not available to this account' using errcode='42501';end if;
  if p_action is null or p_action not in ('reconcile','retry','new_copy','acknowledge','check_provider') or p_reason is null or length(btrim(p_reason)) not between 5 and 1000 or p_request_id is null then raise exception 'Provide a review reason' using errcode='22023';end if;
  select * into d from app_private.outbound_deliveries where id=p_delivery_id;
  if not found then raise exception 'Delivery not found' using errcode='P0002';end if;
  perform app_private.lock_email_sources(d.context);
  select * into d from app_private.outbound_deliveries where id=p_delivery_id for update;
  if p_action='new_copy' and d.context->>'kind' not in ('quote','invoice','change_order') and not app_private.email_staff(auth.uid(),true) then raise exception 'Only an administrator can copy system notices' using errcode='42501';end if;
  if p_action='reconcile' then
    if d.state<>'accepted' then raise exception 'Provider acceptance has not been confirmed' using errcode='23514';end if;
    repaired:=app_private.reconcile_outbound_delivery(d.id);
    if d.context->>'email_type'='lead_internal_notice' then perform app_private.sync_website_notice((d.context->>'job_id')::uuid);end if;
  elsif p_action in ('retry','new_copy') then
    if d.source_snapshot<>app_private.email_source_snapshot(d.context) or not app_private.email_source_eligible(d.context||jsonb_build_object('actor_id',auth.uid()),d.payload) then raise exception 'Source changed; prepare a current email instead' using errcode='40001';end if;
    if p_action='retry' then
      if d.state not in ('prepared','rejected','not_attempted','unknown','dispatching','cancelled') or d.problem_code in ('replaced_before_dispatch','replaced_after_definite_rejection') or d.attempt_count>=3
        or (d.state='dispatching' and d.lease_expires_at>clock_timestamp())
        or (d.first_dispatched_at is not null and d.first_dispatched_at<=clock_timestamp()-interval '23 hours') then
        raise exception 'This delivery cannot safely retry. Check provider evidence first' using errcode='23514';end if;
      update app_private.outbound_deliveries set state='prepared',retry_authorized=true,authorized_actor_id=auth.uid(),lease_expires_at=null,updated_at=clock_timestamp() where id=d.id;
    else
      if d.state<>'accepted' or d.delivery_status not in ('accepted','delayed','delivered') then raise exception 'An uncertain or failed delivery cannot authorize another copy' using errcode='23514';end if;
      key:='explicit-copy/'||p_request_id;
      select od.* into copied from app_private.outbound_delivery_requests a join app_private.outbound_deliveries od on od.id=a.delivery_id where a.request_key=key;
      if found then
        if copied.context->>'copy_of'<>d.id::text or copied.actor_id<>auth.uid() then raise exception 'Review request collision' using errcode='23505';end if;
        return jsonb_build_object('id',copied.id,'action','new_copy');
      end if;
      insert into app_private.outbound_deliveries(business_key,provider_key,payload,payload_hash,context,source_snapshot,actor_id)
        values(key,'crm-delivery/'||p_request_id,d.payload,d.payload_hash,d.context||jsonb_build_object('actor_id',auth.uid(),'copy_of',d.id),d.source_snapshot,auth.uid()) returning * into copied;
      insert into app_private.outbound_delivery_requests(request_key,delivery_id) values(key,copied.id);
    end if;
  elsif p_action='acknowledge' then
    update app_private.outbound_deliveries set repair_state='acknowledged',updated_at=clock_timestamp() where id=d.id;
  end if;
  insert into public.activity_log(actor_user_id,actor_type,subject_type,subject_id,event_type,metadata_json)
    values(auth.uid(),'staff','email_delivery',d.id,'email_delivery_reviewed',jsonb_build_object('action',p_action,'reason',btrim(p_reason),'new_delivery_id',copied.id,'will_send',p_action in ('retry','new_copy')));
  return jsonb_build_object('id',coalesce(copied.id,d.id),'action',p_action,'repaired',repaired);
end $$;

create function public.list_outbound_deliveries(p_all boolean default false,p_id uuid default null,p_page integer default 1)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null or not app_private.email_staff(auth.uid()) then raise exception 'Delivery review is not available to this account' using errcode='42501';end if;
  return jsonb_build_object('total',(select count(*) from app_private.outbound_deliveries where (p_id is null or id=p_id) and (p_all or p_id is not null or repair_state<>'complete' or followup_sync_pending or delivery_status in ('bounced','complained','failed','suppressed'))),'deliveries',(select coalesce(jsonb_agg(r order by r.created_at desc),'[]') from (
    select id,context->>'kind' kind,context->>'email_type' email_type,context->>'job_id' job_id,context->>'invoice_id' invoice_id,
      context#>>'{quote_ids,0}' quote_id,context->>'change_order_id' change_order_id,payload#>>'{to,0}' recipient,payload->>'subject' subject,
      state,delivery_status,provider_message_id,attempt_count,first_dispatched_at,lease_expires_at,repair_state,problem_code,followup_sync_pending,created_at,
      (first_dispatched_at is null or first_dispatched_at>now()-interval '23 hours') retry_window_open
      from app_private.outbound_deliveries where (p_id is null or id=p_id) and (p_all or p_id is not null or repair_state<>'complete' or followup_sync_pending or delivery_status in ('bounced','complained','failed','suppressed'))
      order by created_at desc limit 50 offset (greatest(1,coalesce(p_page,1))-1)*50) r),
    'pending_office_notices',(select coalesce(jsonb_agg(r),'[]') from(select j.id,coalesce(o.name,cu.display_name,'Website request') name,s.job_id is not null recoverable,j.notification_outcome,j.notification_status,j.submitted_at
      from public.jobs j left join app_private.website_lead_submissions s on s.job_id=j.id left join public.customers cu on cu.id=j.customer_id left join public.organizations o on o.id=j.organization_id
      where j.website_submission_id is not null and j.notification_status in ('pending','failed') and coalesce(cardinality(s.notice_delivery_ids),0)=0 and j.lead_disposition='active'
      order by j.submitted_at desc limit 20) r),
    'legacy_attempts',(select coalesce(jsonb_agg(r),'[]') from(select id,recipient_email recipient,subject,provider_message_id,related_quote_id quote_id,related_invoice_id invoice_id,created_at from public.email_events where outbound_delivery_id is null and status='failed' and error_message='provider_outcome_unknown' order by created_at desc limit 20) r),
    'unmatched_events',(select count(*) from app_private.outbound_provider_events where disposition in ('unmatched','quarantined')));
end $$;

-- Only narrow server commands can read frozen bodies or update private state.
do $grants$
declare f record;
begin
  for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='app_private' and p.proname in ('email_server_only','email_staff','lock_email_sources','email_source_snapshot','email_source_eligible','sync_website_notice','reconcile_outbound_delivery') loop
    execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
  end loop;
  for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('submit_website_lead','get_outbound_source_snapshot','prepare_outbound_delivery','claim_outbound_delivery','finish_outbound_delivery','record_outbound_provider_event','get_outbound_delivery','record_legacy_email_provider_check','acknowledge_outbound_followup','find_outbound_delivery_request','prepare_website_notice_batch','get_website_notice_repair') loop
    execute format('revoke all on function %s from public,anon,authenticated',f.signature);
    execute format('grant execute on function %s to service_role',f.signature);
  end loop;
end $grants$;
revoke all on function public.review_outbound_delivery(uuid,text,text,uuid),public.list_outbound_deliveries(boolean,uuid,integer) from public,anon,service_role;
grant execute on function public.review_outbound_delivery(uuid,text,text,uuid),public.list_outbound_deliveries(boolean,uuid,integer) to authenticated;
notify pgrst,'reload schema';
