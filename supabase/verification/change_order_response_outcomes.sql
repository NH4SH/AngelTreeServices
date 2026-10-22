-- Synthetic acceptance of existing capability commands; no schema changes or sends.
-- Run as one transaction. Every fixture, receipt, note, audit and event rolls back.
begin;
set local lock_timeout='3s';set local statement_timeout='30s';
create temp table response_cases(scenario text,id uuid,hash text,request_id uuid,review jsonb,receipt jsonb,error_code text,final_status text,audits integer,events integer,scope_items integer,notes integer);
do $fixtures$
declare scenario text;actor uuid:=gen_random_uuid();c uuid;l uuid;j uuid;d uuid;h text;
begin
 insert into auth.users(id,email,raw_user_meta_data)values(actor,'response-'||actor||'@example.invalid','{}');
 foreach scenario in array array['approved','change_requested','declined','stale','revoked','expired','cancelled','short_message','wrong_party']loop
  c:=gen_random_uuid();l:=gen_random_uuid();j:=gen_random_uuid();d:=gen_random_uuid();h:=encode(sha256(convert_to(gen_random_uuid()::text,'UTF8')),'hex');
  insert into customers(id,display_name,email)values(c,'SYNTHETIC_RESPONSE_CUSTOMER','response-'||c||'@example.invalid');
  insert into service_locations(id,customer_id,street,city,state)values(l,c,'1 Synthetic Lane','Fredericksburg','VA');
  insert into jobs(id,customer_id,service_location_id,status,service_type,requested_scope)values(j,c,l,'accepted','other','Synthetic response scope');
  insert into change_orders(id,change_order_number,job_id,customer_id,service_location_id,created_by_user_id,title,status,subtotal_cents,total_cents)
   values(d,'',j,c,l,actor,'Synthetic additional work','sent',10000,10000);
  insert into change_order_line_items(change_order_id,title,quantity,unit_price_cents,amount_cents)values(d,'SYNTHETIC_RESPONSE_SCOPE',1,10000,10000);
  insert into change_order_portal_tokens(change_order_id,customer_id,token_hash,expires_at)values(d,c,h,clock_timestamp()+interval '1 day');
  insert into response_cases(scenario,id,hash,request_id)values(scenario,d,h,gen_random_uuid());
 end loop;
end $fixtures$;
-- The customer cannot call service-only commands or enumerate the test records.
set local role anon;set local request.jwt.claims='{"role":"anon"}';
do $denials$
begin
 if has_function_privilege('anon','public.respond_to_change_order_by_portal(uuid,text,timestamptz,text,text)','execute')
 or has_function_privilege('authenticated','public.respond_to_change_order_by_portal(uuid,text,timestamptz,text,text)','execute')
 or has_function_privilege('anon','public.approve_change_order_by_portal(uuid,text,timestamptz,text,text)','execute')
 or has_function_privilege('authenticated','public.approve_change_order_by_portal(uuid,text,timestamptz,text,text)','execute')then raise exception 'Public response command privilege expanded';end if;
 begin
  if exists(select 1 from change_orders)then raise exception 'Anonymous change-order enumeration';end if;
 exception when insufficient_privilege then null;
 end;
end $denials$;
reset role;
grant select,update on response_cases to service_role;
set local role service_role;set local request.jwt.claims='{"role":"service_role"}';
update response_cases set review=public.get_change_order_portal_review(hash);
-- The fixture transaction shares now(); make the submitted stale review explicitly older.
update response_cases set review=jsonb_set(review,'{updated_at}',to_jsonb(((review->>'updated_at')::timestamptz-interval '1 second')::text))where scenario='stale';
reset role;
update change_orders set internal_notes='Synthetic stale edit' where id in(select id from response_cases where scenario='stale');
update change_orders set status='cancelled' where id in(select id from response_cases where scenario='cancelled');
update change_order_portal_tokens set revoked_at=clock_timestamp()where token_hash in(select hash from response_cases where scenario='revoked');
update change_order_portal_tokens set expires_at=clock_timestamp()-interval '1 day'where token_hash in(select hash from response_cases where scenario='expired');
update change_order_portal_tokens set customer_id=null where token_hash in(select hash from response_cases where scenario='wrong_party');
set local role service_role;set local request.jwt.claims='{"role":"service_role"}';
do $commands$
declare c record;r jsonb;again jsonb;code text;intent text;msg text;expected text;
begin
 for c in select *from response_cases loop
  r:=null;code:=null;intent:=case when c.scenario='declined'then'decline'else'request_changes'end;msg:=case when c.scenario='short_message'then'x'when c.scenario='declined'then''else'Synthetic request for a revised scope'end;
  begin
   if c.scenario='approved'then
    r:=public.approve_change_order_by_portal(c.request_id,c.hash,(c.review->>'updated_at')::timestamptz,c.review->>'review_hash','Synthetic approver');
    again:=public.approve_change_order_by_portal(c.request_id,c.hash,(c.review->>'updated_at')::timestamptz,c.review->>'review_hash','Synthetic approver');
   else
    r:=public.respond_to_change_order_by_portal(c.request_id,c.hash,(c.review->>'updated_at')::timestamptz,intent,msg);
    again:=public.respond_to_change_order_by_portal(c.request_id,c.hash,(c.review->>'updated_at')::timestamptz,intent,msg);
   end if;
   if again->>'source_event_id' is distinct from r->>'source_event_id' or not(again->>'replayed')::boolean then raise exception 'Retry did not preserve the committed receipt';end if;
  exception when others then get stacked diagnostics code=returned_sqlstate;
  end;
  expected:=case when c.scenario in('approved','change_requested','declined')then null when c.scenario='stale'then'PT409'when c.scenario in('revoked','expired','wrong_party')then'42501'when c.scenario='cancelled'then'23514'else'22023'end;
  if code is distinct from expected then raise exception 'Unexpected % response code: %, expected %',c.scenario,code,expected;end if;
  update response_cases set receipt=r,error_code=code where id=c.id;
 end loop;
end $commands$;
reset role;
update response_cases c set final_status=(select status from change_orders where id=c.id),
 audits=(select count(*)from activity_log where subject_id=c.id and event_type in('change_order_approved','change_order_response_recorded')),
 events=(select count(*)from app_private.customer_source_events where event->>'subject_id'=c.id::text),
 scope_items=(select count(*)from job_change_order_scope_items where change_order_id=c.id),
 notes=(select count(*)from notes where job_id=(select job_id from change_orders where id=c.id));
select jsonb_build_object('cases',jsonb_agg(to_jsonb(c)-'hash'-'request_id'order by scenario),'serviceOnly',true,'rolledBack',true)as verification from response_cases c;
rollback;
