export const actor='00000000-0000-4000-8000-000000000001';
export const fixture=`
 create role anon; create role authenticated; create role service_role bypassrls;
 create schema auth; create schema app_private;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
 create function app_private.has_platform_admin_role() returns boolean language sql stable as $$select current_setting('test.admin',true)='true'$$;
 create function app_private.effective_platform_access(p_id uuid) returns boolean language sql stable as $$select p_id is not null$$;
 create function app_private.has_staff_role() returns boolean language sql as $$select true$$;
 create table invoices(id uuid primary key default gen_random_uuid(),customer_id uuid,organization_id uuid,status text default 'sent',
   total_cents integer default 1000,balance_due_cents integer default 1000,paid_at timestamptz,sent_at timestamptz default now(),due_at timestamptz);
 create table invoice_checkout_sessions(id uuid primary key default gen_random_uuid(),invoice_id uuid,customer_id uuid,organization_id uuid,
   invoice_principal_cents integer default 1000,surcharge_cents integer default 0,total_charge_cents integer default 1000,currency text default 'usd',
   status text default 'open',payment_channel text default 'ach',stripe_checkout_session_id text,stripe_payment_intent_id text,stripe_confirmation_token_id text,
   card_brand text,card_funding_type text,submitted_at timestamptz,authorized_at timestamptz,completed_at timestamptz,failed_at timestamptz,processing_expires_at timestamptz);
 create table payments(id uuid primary key default gen_random_uuid(),invoice_id uuid,customer_id uuid,organization_id uuid,amount_cents integer,total_collected_cents integer,surcharge_cents integer,
   currency text,payment_method text,provider text,provider_checkout_session_id text,provider_payment_id text,provider_charge_id text,status text,
   refunded_principal_cents integer default 0,refunded_surcharge_cents integer default 0,disputed_principal_cents integer default 0,dispute_status text,
   card_brand text,card_funding_type text,stripe_fee_cents integer,net_received_cents integer,authorized_at timestamptz,submitted_at timestamptz,paid_at timestamptz,succeeded_at timestamptz,failed_at timestamptz,refunded_at timestamptz);
 create unique index payment_session_key on payments(provider_checkout_session_id) where provider='stripe' and provider_checkout_session_id is not null;
 create unique index payment_intent_key on payments(provider_payment_id) where provider='stripe' and provider_payment_id is not null;
 create table customer_communications(invoice_id uuid,status text,cancelled_at timestamptz,processing_started_at timestamptz,skip_reason text);
 create table stripe_webhook_events(event_id text primary key,event_type text not null,received_at timestamptz default now(),processed_at timestamptz);
 alter table stripe_webhook_events enable row level security;
 grant all on stripe_webhook_events to service_role;
 create table profiles(id uuid primary key,email text,status text);
 create table user_roles(user_id uuid,role_id uuid); create table roles(id uuid,name text);
 create table admin_notification_preferences(user_id uuid,payment_email_enabled boolean);
 create table activity_log(id uuid primary key default gen_random_uuid(),actor_user_id uuid,actor_type text,subject_type text,subject_id uuid,event_type text,metadata_json jsonb,
   action_category text,summary text,record_label text,destination_path text,organization_id uuid,idempotency_key text);
 create unique index activity_key on activity_log(idempotency_key) where idempotency_key is not null;
 create table admin_notifications(id uuid primary key default gen_random_uuid(),activity_id uuid,recipient_user_id uuid,organization_id uuid,
   category text,title text,body text,destination_path text,email_status text default 'pending',email_attempted_at timestamptz,unique(activity_id,recipient_user_id));
 grant select on admin_notifications to service_role;
 insert into profiles values('${actor}','fixture@example.invalid','active');
 insert into roles values('${actor}','owner');insert into user_roles values('${actor}','${actor}');
 insert into stripe_webhook_events values('evt_legacy_complete','fixture',now(),now()),('evt_legacy_pending','fixture',now(),null);
 select set_config('test.uid','${actor}',false),set_config('test.admin','true',false);
`;
