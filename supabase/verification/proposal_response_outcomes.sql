-- Synthetic acceptance of installed proposal commands. Every write rolls back.
begin;
set local lock_timeout='3s';set local statement_timeout='30s';
create temp table proposal_cases(scenario text,id uuid,hash text,request_id uuid,review jsonb,receipt jsonb,error_code text,final_status text,audits integer,events integer,jobs integer,notes integer);
do $fixtures$
declare scenario text;c uuid;l uuid;d uuid;h text;
begin
 foreach scenario in array array['approval','changes','changes_then_approval','stale_approval','stale_changes','revoked_approval','revoked_changes','expired_approval','expired_changes','cancelled_approval','cancelled_changes','wrong_party_approval','wrong_party_changes','short_message']loop
  c:=gen_random_uuid();l:=gen_random_uuid();d:=gen_random_uuid();h:=encode(sha256(convert_to(gen_random_uuid()::text,'UTF8')),'hex');
  insert into customers(id,display_name,email)values(c,'SYNTHETIC_PROPOSAL_CUSTOMER','proposal-'||c||'@example.invalid');
  insert into service_locations(id,customer_id,street,city,state)values(l,c,'1 Synthetic Lane','Fredericksburg','VA');
  insert into quotes(id,quote_number,customer_id,service_location_id,status,subtotal_cents,total_cents)values(d,'SYNTH-'||d,c,l,'sent',42500,42500);
  insert into quote_line_items(quote_id,name,description,quantity,unit_price_cents,total_cents)values(d,'SYNTHETIC_PROPOSAL_SCOPE','Synthetic scope only',1,42500,42500);
  insert into quote_portal_tokens(quote_id,customer_id,token_hash,expires_at)values(d,c,h,clock_timestamp()+interval '1 day');
  insert into proposal_cases(scenario,id,hash,request_id)values(scenario,d,h,gen_random_uuid());
 end loop;
 update quotes set status='cancelled'where id in(select id from proposal_cases where proposal_cases.scenario like 'cancelled_%');
 update quote_portal_tokens set revoked_at=clock_timestamp()where token_hash in(select hash from proposal_cases where proposal_cases.scenario like 'revoked_%');
 update quote_portal_tokens set expires_at=clock_timestamp()-interval '1 day'where token_hash in(select hash from proposal_cases where proposal_cases.scenario like 'expired_%');
 update quote_portal_tokens set customer_id=(select customer_id from quotes where id=(select pc.id from proposal_cases pc where pc.scenario='approval')) where token_hash in(select hash from proposal_cases where proposal_cases.scenario like 'wrong_party_%');
end $fixtures$;
update proposal_cases c set review=(select to_jsonb(q)from quotes q where q.id=c.id);
-- Intentionally stale submitted version; no automatic fetch of a newer revision.
update proposal_cases set review=jsonb_set(review,'{edit_revision}',to_jsonb((review->>'edit_revision')::integer-1))where proposal_cases.scenario like 'stale_%';
set local role anon;set local request.jwt.claims='{"role":"anon"}';
do $denials$
begin
 if has_function_privilege('anon','public.approve_quote_by_portal(text,integer)','execute')or has_function_privilege('authenticated','public.approve_quote_by_portal(text,integer)','execute')
 or has_function_privilege('anon','public.request_quote_changes_by_portal(uuid,text,integer,text)','execute')or has_function_privilege('authenticated','public.request_quote_changes_by_portal(uuid,text,integer,text)','execute')then raise exception 'Public proposal command privilege expanded';end if;
 begin if exists(select 1 from quotes)then raise exception 'Anonymous proposal enumeration';end if;exception when insufficient_privilege then null;end;
end $denials$;
reset role;
grant select,update on proposal_cases to service_role;
set local role service_role;set local request.jwt.claims='{"role":"service_role"}';
do $commands$
declare c record;r jsonb;again jsonb;approved jsonb;code text;expected text;revision integer;msg text;
begin
 for c in select *from proposal_cases loop
  r:=null;code:=null;revision:=(c.review->>'edit_revision')::integer;msg:=case when c.scenario='short_message'then'x'else'Synthetic requested scope adjustment'end;
  begin
   if c.scenario='approval'or c.scenario like '%_approval'and c.scenario<>'changes_then_approval'then
    r:=public.approve_quote_by_portal(c.hash,revision);again:=public.approve_quote_by_portal(c.hash,revision);
    if again->>'job_id'is distinct from r->>'job_id'or not(again->>'replayed')::boolean then raise exception 'Approval retry did not preserve work order';end if;
   else
    r:=public.request_quote_changes_by_portal(c.request_id,c.hash,revision,msg);
    if c.scenario='changes_then_approval'then approved:=public.approve_quote_by_portal(c.hash,(r->>'edit_revision')::integer);end if;
    again:=public.request_quote_changes_by_portal(c.request_id,c.hash,revision,msg);
    if again->>'note_id'is distinct from r->>'note_id'or not(again->>'replayed')::boolean then raise exception 'Change retry did not preserve request receipt';end if;
   end if;
  exception when others then get stacked diagnostics code=returned_sqlstate;
  end;
  expected:=case when c.scenario in('approval','changes','changes_then_approval')then null when c.scenario like 'stale_%'then'PT409'when c.scenario like 'cancelled_%'then'23514'when c.scenario='short_message'then'22023'else'42501'end;
  if code is distinct from expected then raise exception 'Unexpected % response: %, expected %',c.scenario,code,expected;end if;
  update proposal_cases set receipt=r,error_code=code where id=c.id;
 end loop;
end $commands$;
reset role;
update proposal_cases c set final_status=(select status from quotes where id=c.id),
 audits=(select count(*)from activity_log where subject_id=c.id and event_type in('quote_approved','quote_change_request_recorded')),
 events=(select count(*)from app_private.customer_source_events where event->>'subject_id'=c.id::text),
 jobs=(select count(*)from jobs where source_quote_id=c.id),
 notes=(select count(*)from app_private.quote_change_requests r join public.notes n on n.id=r.note_id where r.quote_id=c.id);
select jsonb_build_object('cases',jsonb_agg(to_jsonb(c)-'hash'-'request_id'order by scenario),'serviceOnly',true,'rolledBack',true)as verification from proposal_cases c;
rollback;
