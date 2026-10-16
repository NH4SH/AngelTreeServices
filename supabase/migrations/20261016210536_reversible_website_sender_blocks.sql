-- Exact, operator-selected website intake blocks. No account/financial bans,
-- inferred matches, data deletion, backfill, or automatic sending.
create table app_private.website_sender_blocks (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('email','phone')),
  value text not null check (length(value) between 3 and 254),
  source_job_id uuid not null references public.jobs(id),
  reason text not null check (length(btrim(reason)) between 5 and 500),
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references public.profiles(id) on delete set null,
  unblocked_at timestamptz,
  unblocked_by uuid references public.profiles(id) on delete set null,
  unblock_reason text,
  check ((unblocked_at is null and unblocked_by is null and unblock_reason is null)
    or (unblocked_at is not null and length(btrim(unblock_reason)) between 5 and 500))
);
create unique index website_sender_blocks_active_identity on app_private.website_sender_blocks(kind,value) where unblocked_at is null;
create index website_sender_blocks_register on app_private.website_sender_blocks((unblocked_at is null) desc,created_at desc,id);
create index website_sender_blocks_source on app_private.website_sender_blocks(source_job_id);
create table app_private.blocked_website_submissions (
  submission_id text primary key check (length(submission_id) between 1 and 120),
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  block_ids uuid[] not null check (cardinality(block_ids)>0),
  created_at timestamptz not null default clock_timestamp()
);
create index blocked_website_submissions_blocks on app_private.blocked_website_submissions using gin(block_ids);
alter table app_private.website_sender_blocks enable row level security;
alter table app_private.blocked_website_submissions enable row level security;
revoke all on app_private.website_sender_blocks,app_private.blocked_website_submissions from public,anon,authenticated,service_role;

create function app_private.normalize_website_sender(p_kind text,p_value text) returns text
language sql immutable security invoker set search_path='' as $$
 select case when p_kind='email' then nullif(lower(btrim(p_value)),'')
 when p_kind='phone' then (select case when length(d)=10 then '+1'||d
   when length(d) between 10 and 15 then '+'||d end from (select regexp_replace(p_value,'[^0-9]','','g') d) s) end;
$$;

-- Same ordered contact locks for intake, block and unblock. Hash collisions only
-- serialize unrelated requests; exact indexed comparisons still decide matches.
create function app_private.lock_website_senders(p_email text,p_phone text) returns void
language plpgsql security invoker set search_path='' as $$
declare k integer;
begin
 for k in select distinct hashtext(v) from (values
   ('email/'||app_private.normalize_website_sender('email',p_email)),
   ('phone/'||app_private.normalize_website_sender('phone',p_phone))) s(v) where v is not null order by 1
 loop perform pg_advisory_xact_lock(175,k);end loop;
end $$;

create function app_private.website_sender_contacts(p_job uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('email',app_private.normalize_website_sender('email',case when s.job_id is not null then s.submission->>'email' else coalesce(c.email,o.billing_email) end),
   'phone',app_private.normalize_website_sender('phone',case when s.job_id is not null then s.submission->>'phone' else coalesce(c.phone,o.billing_phone) end))
 from public.jobs j left join app_private.website_lead_submissions s on s.job_id=j.id
 left join public.customers c on c.id=j.customer_id left join public.organizations o on o.id=j.organization_id
 where j.id=p_job and j.website_submission_id is not null;
$$;

create function app_private.website_sender_is_blocked(p_job uuid) returns boolean
language sql stable security invoker set search_path='' as $$
 select exists(select 1 from app_private.website_sender_blocks b
 where b.unblocked_at is null and b.value=app_private.website_sender_contacts(p_job)->>b.kind);
$$;

-- Keep the full PR13 validation/dedup/transaction body. Insert the decision after
-- its validation and submission lock, before any party/work/notice creation.
do $migration$
declare d text; needle text;
begin
 d:=pg_get_functiondef('app_private.submit_website_lead(jsonb)'::regprocedure);
 needle:='  k text;';
 if strpos(d,needle)=0 then raise exception 'Unexpected intake variables';end if;
 d:=replace(d,needle,needle||E'\n  v_blocks uuid[];\n  v_blocked app_private.blocked_website_submissions%rowtype;');
 needle:='  perform pg_advisory_xact_lock(13,hashtext(v_submission));';
 if strpos(d,needle)=0 then raise exception 'Unexpected intake lock';end if;
 d:=replace(d,needle,E'  perform app_private.lock_website_senders(s->>''email'',s->>''phone'');\n'||needle);
 needle:='  -- Separate submissions still create separate leads.';
 if strpos(d,needle)=0 then raise exception 'Unexpected intake decision boundary';end if;
 d:=replace(d,needle,$decision$
  select * into v_blocked from app_private.blocked_website_submissions where submission_id=v_submission;
  if found then
    if v_blocked.payload_hash<>v_hash then raise exception 'Submission ID already used for a different request' using errcode='23505';end if;
    return jsonb_build_object('blocked',true,'created',false,'job_id',null,'duplicate_mode',null,'submission_id',v_submission);
  end if;
  select array_agg(id order by id) into v_blocks from app_private.website_sender_blocks
    where unblocked_at is null and value=app_private.normalize_website_sender(kind,case kind when 'email' then s->>'email' else s->>'phone' end);
  if v_blocks is not null then
    insert into app_private.blocked_website_submissions(submission_id,payload_hash,block_ids) values(v_submission,v_hash,v_blocks);
    return jsonb_build_object('blocked',true,'created',false,'job_id',null,'duplicate_mode',null,'submission_id',v_submission);
  end if;
$decision$||needle);
 execute d;
end $migration$;

-- PR14 claims and supervised repair already use this eligibility boundary.
-- Limit the extra check to website office notices: never suppress legitimate
-- invoice/quote/payment mail merely because a contact used the public form.
do $migration$
declare d text; needle text:='  -- Sender-specific kinds preserve existing access; internal notices do not use';
begin
 d:=pg_get_functiondef('app_private.email_source_eligible(jsonb,jsonb)'::regprocedure);
 if strpos(d,needle)=0 then raise exception 'Unexpected delivery eligibility boundary';end if;
 execute replace(d,needle,E'  if c->>''kind''=''office'' and app_private.website_sender_is_blocked(nullif(c->>''job_id'','''')::uuid) then return false;end if;\n'||needle);
end $migration$;

-- Privilege elevation stays in the private schema. Every staff entry checks live
-- employee/profile state and roles, with the PR02 role-management lock on writes.
create function app_private.website_block_staff() returns void
language plpgsql security invoker set search_path='' as $$
begin
 if current_setting('role',true)<>'authenticated' or auth.uid() is null or not app_private.has_platform_admin_role() then
   raise exception 'Only an active owner or admin can manage sender blocks' using errcode='42501';end if;
end $$;

create function app_private.website_sender_controls(p_jobs uuid[]) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 perform app_private.website_block_staff();
 if p_jobs is null or cardinality(p_jobs)>100 then raise exception 'Choose up to 100 leads' using errcode='22023';end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('jobId',j.id,'contacts',app_private.website_sender_contacts(j.id),
   'blockedKinds',(select coalesce(jsonb_agg(b.kind order by b.kind),'[]') from app_private.website_sender_blocks b
     where b.unblocked_at is null and b.value=app_private.website_sender_contacts(j.id)->>b.kind)) order by j.id),'[]')
   from public.jobs j where j.id=any(p_jobs) and j.website_submission_id is not null);
end $$;

create function app_private.change_website_sender_block(p_job uuid,p_contacts jsonb,p_email boolean,p_phone boolean,p_block uuid,p_reason text,p_request uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare contacts jsonb; j public.jobs%rowtype; b app_private.website_sender_blocks%rowtype;
 k text; v text; ids uuid[]:='{}'::uuid[]; changed boolean:=false; result jsonb; previous public.activity_log%rowtype;
 command_hash text:=encode(sha256(convert_to(jsonb_build_array(p_job,p_contacts,p_email,p_phone,p_block,p_reason,auth.uid())::text,'UTF8')),'hex');
begin
 perform pg_advisory_xact_lock(hashtext('platform-role-management'));
 perform app_private.website_block_staff();
 if p_request is null or p_reason is null or length(btrim(p_reason)) not between 5 and 500 then
   raise exception 'Provide a reason of 5 to 500 characters' using errcode='22023';end if;
 select * into previous from public.activity_log where idempotency_key='website-sender-block/'||p_request;
 if found then
   if previous.metadata_json->>'command_hash' is distinct from command_hash then raise exception 'Confirmation already used for another change' using errcode='23505';end if;
   return previous.metadata_json->'result';
 end if;
 if p_block is null then
   if p_job is null or p_email is null or p_phone is null or not (p_email or p_phone) then raise exception 'Choose an email or phone to block' using errcode='22023';end if;
   contacts:=app_private.website_sender_contacts(p_job);
   perform app_private.lock_website_senders(contacts->>'email',contacts->>'phone');
   select * into j from public.jobs where id=p_job for update;
   contacts:=app_private.website_sender_contacts(p_job);
   if not found or j.website_submission_id is null or j.lead_disposition<>'spam' then raise exception 'Mark this website lead as spam first' using errcode='23514';end if;
   if p_contacts is distinct from contacts then raise exception 'Contact details changed. Refresh and review the sender again' using errcode='40001';end if;
   foreach k in array array['email','phone'] loop
     if (k='email' and not p_email) or (k='phone' and not p_phone) then continue;end if;
     v:=contacts->>k;
     if v is null or (k='email' and v !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') then raise exception 'The selected contact cannot be blocked' using errcode='22023';end if;
     select * into b from app_private.website_sender_blocks where kind=k and value=v and unblocked_at is null;
     if not found then
       insert into app_private.website_sender_blocks(kind,value,source_job_id,reason,created_by) values(k,v,p_job,btrim(p_reason),auth.uid()) returning * into b;
       changed:=true;
     end if;
     ids:=array_append(ids,b.id);
   end loop;
 else
   select * into b from app_private.website_sender_blocks where id=p_block;
   if not found then raise exception 'Sender block not found' using errcode='P0002';end if;
   perform app_private.lock_website_senders(case when b.kind='email' then b.value end,case when b.kind='phone' then b.value end);
   select * into b from app_private.website_sender_blocks where id=p_block for update;
   if b.unblocked_at is null then
     update app_private.website_sender_blocks set unblocked_at=clock_timestamp(),unblocked_by=auth.uid(),unblock_reason=btrim(p_reason) where id=b.id;
     changed:=true;
   end if;
   ids:=array[b.id];
 end if;
 result:=jsonb_build_object('changed',changed,'blockIds',ids,'unblocked',p_block is not null);
 insert into public.activity_log(actor_user_id,actor_type,subject_type,subject_id,event_type,idempotency_key,metadata_json)
 values(auth.uid(),case when exists(select 1 from public.user_roles ur join public.roles r on r.id=ur.role_id where ur.user_id=auth.uid() and r.name='owner') then 'owner' else 'admin' end,
   'job',coalesce(p_job,b.source_job_id),case when p_block is null then 'website_sender_blocked' else 'website_sender_unblocked' end,
   'website-sender-block/'||p_request,jsonb_build_object('reason',btrim(p_reason),'block_ids',ids,'changed',changed,'reversible',true,'command_hash',command_hash,'result',result));
 return result;
end $$;

create function app_private.list_website_sender_blocks(p_page integer,p_all boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 perform app_private.website_block_staff();
 if p_page is null or p_page not between 1 and 10000 or p_all is null then raise exception 'Invalid block page' using errcode='22023';end if;
 return jsonb_build_object('count',(select count(*) from app_private.website_sender_blocks where p_all or unblocked_at is null),
   'activeCount',(select count(*) from app_private.website_sender_blocks where unblocked_at is null),
   'rows',(select coalesce(jsonb_agg(to_jsonb(s) order by (s.unblocked_at is null) desc,s.created_at desc,s.id),'[]') from (
     select id,kind,value,source_job_id,reason,created_at,unblocked_at,unblock_reason,
       (select count(*) from app_private.blocked_website_submissions r where r.block_ids @> array[b.id]) blocked_requests
     from app_private.website_sender_blocks b where p_all or unblocked_at is null order by (unblocked_at is null) desc,created_at desc,id limit 25 offset (p_page-1)*25) s));
end $$;

create function public.get_website_sender_controls(p_jobs uuid[]) returns jsonb
language sql security invoker set search_path='' as $$ select app_private.website_sender_controls(p_jobs); $$;
create function public.block_website_sender(p_job uuid,p_contacts jsonb,p_email boolean,p_phone boolean,p_reason text,p_request uuid) returns jsonb
language sql security invoker set search_path='' as $$ select app_private.change_website_sender_block(p_job,p_contacts,p_email,p_phone,null,p_reason,p_request); $$;
create function public.unblock_website_sender(p_block uuid,p_reason text,p_request uuid) returns jsonb
language sql security invoker set search_path='' as $$ select app_private.change_website_sender_block(null,null,null,null,p_block,p_reason,p_request); $$;
create function public.list_website_sender_blocks(p_page integer default 1,p_all boolean default false) returns jsonb
language sql security invoker set search_path='' as $$ select app_private.list_website_sender_blocks(p_page,p_all); $$;

revoke all on function app_private.normalize_website_sender(text,text),app_private.lock_website_senders(text,text),app_private.website_sender_contacts(uuid),app_private.website_sender_is_blocked(uuid),app_private.website_block_staff() from public,anon,authenticated,service_role;
revoke all on function app_private.website_sender_controls(uuid[]),app_private.change_website_sender_block(uuid,jsonb,boolean,boolean,uuid,text,uuid),app_private.list_website_sender_blocks(integer,boolean) from public,anon,authenticated,service_role;
revoke all on function public.get_website_sender_controls(uuid[]),public.block_website_sender(uuid,jsonb,boolean,boolean,text,uuid),public.unblock_website_sender(uuid,text,uuid),public.list_website_sender_blocks(integer,boolean) from public,anon,authenticated,service_role;
grant execute on function app_private.website_sender_controls(uuid[]),app_private.change_website_sender_block(uuid,jsonb,boolean,boolean,uuid,text,uuid),app_private.list_website_sender_blocks(integer,boolean) to authenticated;
grant execute on function public.get_website_sender_controls(uuid[]),public.block_website_sender(uuid,jsonb,boolean,boolean,text,uuid),public.unblock_website_sender(uuid,text,uuid),public.list_website_sender_blocks(integer,boolean) to authenticated;
notify pgrst,'reload schema';
