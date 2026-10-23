-- Synthetic installed-schema acceptance. Apply the reviewed migration in the
-- same outer transaction when testing staging, then roll back all DDL/data.
begin;
set local lock_timeout='3s';set local statement_timeout='50s';
create temporary table proposal_expiry_assertions(label text);
create function pg_temp.expiry_check(ok boolean,label text)returns void language plpgsql as $$begin
 if ok is distinct from true then raise exception 'Proposal expiry assertion failed: %',label;end if;
 insert into pg_temp.proposal_expiry_assertions values(label);
end $$;
create function pg_temp.expiry_quote(deadline timestamptz,state text default 'sent')returns uuid language plpgsql as $$
declare q uuid:=gen_random_uuid();party uuid:=current_setting('ats_test.expiry_customer')::uuid;site uuid:=current_setting('ats_test.expiry_location')::uuid;
begin
 insert into public.quotes(id,customer_id,service_location_id,quote_number,status,subtotal_cents,total_cents,expires_at)
 values(q,party,site,'EXPIRY-'||q,state,10000,10000,deadline);
 insert into public.quote_line_items(quote_id,name,description,quantity,unit_price_cents,total_cents)
 values(q,'Synthetic expiry work','Synthetic preserved scope',1,10000,10000);
 return q;
end $$;
create function pg_temp.expiry_token(q uuid)returns text language plpgsql as $$
declare hash text:=encode(sha256(convert_to(gen_random_uuid()::text,'UTF8')),'hex');
begin
 insert into public.quote_portal_tokens(quote_id,customer_id,token_hash,expires_at)
 values(q,current_setting('ats_test.expiry_customer')::uuid,hash,clock_timestamp()+interval '1 day');return hash;
end $$;
create function pg_temp.expiry_accept(q uuid,token text default null,version integer default null)returns jsonb language plpgsql as $$
declare result jsonb;revision integer;actor uuid:=current_setting('ats_test.expiry_owner')::uuid;
begin
 select edit_revision into revision from public.quotes where id=q;
 if token is null then
  perform set_config('request.jwt.claim.sub',actor::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',actor)::text,true);
  perform set_config('role','authenticated',true);
  result:=public.approve_quote(q,coalesce(version,revision));
 else
  perform set_config('request.jwt.claim.sub','',true);
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  perform set_config('role','service_role',true);
  result:=public.approve_quote_by_portal(token,coalesce(version,revision));
 end if;
 perform set_config('role','none',true);return result;
exception when others then perform set_config('role','none',true);raise;
end $$;
create function pg_temp.expiry_facts(q uuid)returns jsonb language sql as $$
 select jsonb_build_object('quote',(select to_jsonb(x)from public.quotes x where id=q),
 'tokens',(select jsonb_agg(to_jsonb(x)order by id)from public.quote_portal_tokens x where quote_id=q),
 'jobs',(select jsonb_agg(to_jsonb(x)order by id)from public.jobs x where source_quote_id=q),
 'activity',(select jsonb_agg(to_jsonb(x)order by id)from public.activity_log x where subject_id=q),
 'events',(select jsonb_agg(to_jsonb(x)order by source_key)from app_private.customer_source_events x where source_key like 'quote:'||q||':%'));
$$;
create function pg_temp.expiry_delay()returns trigger language plpgsql as $$begin
 if current_setting('ats_test.expiry_delay',true)='1'then perform pg_sleep(0.8);end if;return new;
end $$;
create trigger expiry_delay before insert on public.jobs for each row execute function pg_temp.expiry_delay();
do $test$
declare owner_id uuid:=gen_random_uuid();crew uuid:=gen_random_uuid();party uuid:=gen_random_uuid();other_party uuid:=gen_random_uuid();site uuid:=gen_random_uuid();
 q uuid;token text;state text;customer_path boolean;before_state jsonb;first jsonb;again jsonb;revision integer;
begin
 insert into public.roles(name)values('owner'),('crew')on conflict(name)do nothing;
 insert into auth.users(id,email,raw_user_meta_data)select v,'expiry-'||v||'@example.invalid','{}'from unnest(array[owner_id,crew])v;
 update public.profiles set status='active'where id=any(array[owner_id,crew]);
 insert into public.employee_records(auth_user_id,legal_name,is_active,employment_status)select v,'Synthetic proposal expiry staff',true,'active'from unnest(array[owner_id,crew])v;
 insert into public.user_roles(user_id,role_id)select owner_id,id from public.roles where name='owner';
 insert into public.user_roles(user_id,role_id)select crew,id from public.roles where name='crew';
 insert into public.customers(id,display_name,email)values(party,'Synthetic expiry customer','expiry-'||party||'@example.invalid'),(other_party,'Other synthetic expiry customer',null);
 insert into public.service_locations(id,customer_id,label,street,city,state,postal_code)values(site,party,'Synthetic expiry site','1 Test Lane','Fredericksburg','VA','22401');
 perform set_config('ats_test.expiry_owner',owner_id::text,true);perform set_config('ats_test.expiry_customer',party::text,true);perform set_config('ats_test.expiry_location',site::text,true);
 foreach customer_path in array array[false,true]loop
  foreach state in array array['draft','sent','change_requested']loop
   q:=pg_temp.expiry_quote(clock_timestamp()-interval '1 day',state);token:=case when customer_path then pg_temp.expiry_token(q)else null end;before_state:=pg_temp.expiry_facts(q);
   begin perform pg_temp.expiry_accept(q,token);raise exception using errcode='ZX001';
   exception when check_violation then perform pg_temp.expiry_check(sqlerrm='This proposal has expired. Contact our office for an updated proposal.','plain deadline rejection');end;
   perform pg_temp.expiry_check(pg_temp.expiry_facts(q)=before_state,state||case when customer_path then ' customer'else ' staff'end||' past deadline rejects without business/history/event changes');
  end loop;
 end loop;
 foreach customer_path in array array[false,true]loop
  foreach state in array array['future','undated']loop
   q:=pg_temp.expiry_quote(case when state='future'then clock_timestamp()+interval '1 day'else null end);token:=case when customer_path then pg_temp.expiry_token(q)else null end;
   first:=pg_temp.expiry_accept(q,token);
   perform pg_temp.expiry_check(first->>'job_id' is not null and(select count(*)=1 from public.jobs where source_quote_id=q),state||case when customer_path then ' customer'else ' staff'end||' retains one-work-order approval');
  end loop;
 end loop;
 -- The exact original revision/token must recover the committed result after
 -- proposal expiry. No record, history or durable handoff may be duplicated.
 foreach customer_path in array array[false,true]loop
  q:=pg_temp.expiry_quote(clock_timestamp()+interval '600 milliseconds');token:=case when customer_path then pg_temp.expiry_token(q)else null end;
  select edit_revision into revision from public.quotes where id=q;
  first:=pg_temp.expiry_accept(q,token,revision);before_state:=pg_temp.expiry_facts(q);perform pg_sleep(0.7);
  again:=pg_temp.expiry_accept(q,token,revision);
  perform pg_temp.expiry_check(again->>'replayed'='true'and again->>'job_id'=first->>'job_id'and pg_temp.expiry_facts(q)=before_state,case when customer_path then 'customer'else 'staff'end||' committed approval survives proposal expiry without duplicate handoff');
 end loop;
 q:=pg_temp.expiry_quote(clock_timestamp()+interval '400 milliseconds');before_state:=pg_temp.expiry_facts(q);
 perform set_config('ats_test.expiry_delay','1',true);
 begin perform pg_temp.expiry_accept(q);raise exception using errcode='ZX001';exception when check_violation then null;end;
 perform set_config('ats_test.expiry_delay','0',true);
 perform pg_temp.expiry_check(pg_temp.expiry_facts(q)=before_state,'expiry during tentative work creation rolls back quote work history and source events');
 -- A proposal deadline never weakens the independent capability boundary.
 foreach state in array array['revoked','expired','wrong_party']loop
  q:=pg_temp.expiry_quote(null);token:=pg_temp.expiry_token(q);perform pg_temp.expiry_accept(q,token);
  if state='revoked'then update public.quote_portal_tokens set revoked_at=clock_timestamp()where token_hash=token;
  elsif state='expired'then update public.quote_portal_tokens set expires_at=clock_timestamp()-interval '1 day'where token_hash=token;
  else update public.quote_portal_tokens set customer_id=other_party where token_hash=token;end if;
  before_state:=pg_temp.expiry_facts(q);
  begin perform pg_temp.expiry_accept(q,token);raise exception using errcode='ZX001';exception when insufficient_privilege then null;end;
  perform pg_temp.expiry_check(pg_temp.expiry_facts(q)=before_state,state||' token still denies committed-result recovery');
 end loop;
 q:=pg_temp.expiry_quote(clock_timestamp()+interval '1 day');before_state:=pg_temp.expiry_facts(q);
 begin perform pg_temp.expiry_accept(q,null,0);raise exception using errcode='ZX001';exception when sqlstate 'PT409'then null;end;
 perform pg_temp.expiry_check(pg_temp.expiry_facts(q)=before_state,'stale revision still denies without side effects');
 perform set_config('ats_test.expiry_owner',crew::text,true);
 begin perform pg_temp.expiry_accept(q);raise exception using errcode='ZX001';exception when insufficient_privilege then null;end;
 perform pg_temp.expiry_check(pg_temp.expiry_facts(q)=before_state,'crew cannot approve a future proposal');
 perform set_config('ats_test.expiry_owner',owner_id::text,true);update public.profiles set status='disabled'where id=owner_id;
 begin perform pg_temp.expiry_accept(q);raise exception using errcode='ZX001';exception when insufficient_privilege then null;end;
 perform pg_temp.expiry_check(pg_temp.expiry_facts(q)=before_state,'disabled owner cannot approve');
 update public.profiles set status='active'where id=owner_id;
 q:=pg_temp.expiry_quote(clock_timestamp()-interval '1 day','approved');update public.quotes set approved_at=clock_timestamp()-interval '2 days'where id=q;
 perform pg_temp.expiry_check((pg_temp.expiry_accept(q)->>'job_id')is not null,'historical approved-record repair is preserved');
 for state in select r::text from unnest(array['public.approve_quote(uuid,integer)'::regprocedure,'public.approve_quote_by_portal(text,integer)'::regprocedure,'app_private.approve_quote_locked(uuid,integer,text)'::regprocedure])r loop
  perform pg_temp.expiry_check(not has_function_privilege('anon',state,'execute'),'anonymous cannot execute '||state);
 end loop;
 perform pg_temp.expiry_check(not has_function_privilege('authenticated','public.approve_quote_by_portal(text,integer)','execute')and not has_function_privilege('authenticated','app_private.approve_quote_locked(uuid,integer,text)','execute'),'staff cannot invoke trusted customer/core entry points');
end $test$;
select jsonb_build_object('syntheticOnly',true,'rolledBack',true,'assertions',jsonb_agg(label order by label))as verification from pg_temp.proposal_expiry_assertions;
rollback;
