-- Rollback-only staging/local fixtures for the copy-only completed-job workspace.
-- No migration, delivery queue write or outbound provider call is performed.
begin;
set local lock_timeout='3s';
set local statement_timeout='45s';
create temporary table review_request_assertions(label text);
create function pg_temp.review_request_check(ok boolean,label text) returns void
language plpgsql as $$begin
  if ok is distinct from true then raise exception 'Review request assertion failed: %',label;end if;
  insert into pg_temp.review_request_assertions values(label);
end $$;
do $test$
declare actor uuid:=gen_random_uuid();crew uuid:=gen_random_uuid();party uuid:=gen_random_uuid();site uuid:=gen_random_uuid();
  job uuid;state text;visible_count bigint;original_customer jsonb;
begin
  insert into public.roles(name)values('owner'),('crew')on conflict(name)do nothing;
  insert into auth.users(id,email,raw_user_meta_data)
    select x,'review-readiness-'||x||'@example.invalid','{}'from unnest(array[actor,crew])x;
  update public.profiles set status='active'where id=any(array[actor,crew]);
  insert into public.employee_records(auth_user_id,legal_name,is_active,employment_status)
    select x,'Synthetic review draft operator',true,'active'from unnest(array[actor,crew])x;
  insert into public.user_roles(user_id,role_id)select actor,id from public.roles where name='owner';
  insert into public.user_roles(user_id,role_id)select crew,id from public.roles where name='crew';
  insert into public.customers(id,display_name,email)
    values(party,'Synthetic review homeowner','review-readiness-'||party||'@example.invalid');
  insert into public.service_locations(id,customer_id,label,street,city,state,postal_code)
    values(site,party,'Synthetic review site','1 Test Lane','Fredericksburg','VA','22401');
  select to_jsonb(c) into original_customer from public.customers c where id=party;
  foreach state in array array['completed','ready_to_invoice','invoiced','paid','in_progress']loop
    job:=gen_random_uuid();
    insert into public.jobs(id,customer_id,service_location_id,status,service_type,requested_scope,completed_at)
      values(job,party,site,state,'tree_trimming','Synthetic review readiness scope',
        case when state='in_progress'then null else now()end);
  end loop;
  insert into public.jobs(customer_id,service_location_id,status,service_type,archived_at,completed_at)
    values(party,site,'completed','tree_trimming',now(),now());
  perform set_config('ats_test.review_party',party::text,true);
  perform set_config('request.jwt.claim.sub',actor::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',actor)::text,true);
  perform set_config('role','authenticated',true);
  select count(*) into visible_count from public.jobs
    where customer_id=party and archived_at is null and status in('completed','ready_to_invoice','invoiced','paid');
  perform set_config('role','none',true);
  perform pg_temp.review_request_check(visible_count=4,'owner can read the four eligible synthetic follow-up jobs');
  perform set_config('request.jwt.claim.sub',crew::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',crew)::text,true);
  perform set_config('role','authenticated',true);
  select count(*) into visible_count from public.jobs where customer_id=party;
  perform set_config('role','none',true);
  perform pg_temp.review_request_check(visible_count=0,'unassigned crew cannot read these synthetic jobs');
  perform pg_temp.review_request_check((select count(*)=1 from public.jobs where customer_id=party and status='in_progress'and archived_at is null),'unfinished job is retained outside follow-up filter');
  perform pg_temp.review_request_check((select count(*)=1 from public.jobs where customer_id=party and archived_at is not null),'archived job is retained outside follow-up filter');
  perform pg_temp.review_request_check((select to_jsonb(c)=original_customer from public.customers c where id=party),'reading follow-up inputs does not modify customer contact data');
end $test$;
select jsonb_build_object('syntheticOnly',true,'rolledBack',true,
  'assertions',(select jsonb_agg(label order by label)from review_request_assertions),
  'renderFixtures',(select jsonb_agg(to_jsonb(j)||jsonb_build_object(
    'customers',(select jsonb_build_object('id',c.id,'display_name',c.display_name,'email',c.email,'phone',c.phone)from public.customers c where c.id=j.customer_id),
    'organizations',null,
    'service_locations',(select to_jsonb(l)from public.service_locations l where l.id=j.service_location_id),
    'job_photos','[]'::jsonb)order by j.status)
    from public.jobs j where j.customer_id=current_setting('ats_test.review_party')::uuid
      and j.archived_at is null and j.status in('completed','ready_to_invoice','invoiced','paid')))verification;
rollback;
