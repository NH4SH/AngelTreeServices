-- Office link authority only. No payment, checkout, quote-total or delivery changes.
begin;
set local lock_timeout='3s';set local statement_timeout='20s';
create table app_private.quote_link_requests(
 request_id uuid primary key,actor_user_id uuid not null,input_hash text not null check(input_hash~'^[a-f0-9]{64}$'),
 quote_id uuid references public.quotes(id)on delete set null,
 token_id uuid references public.quote_portal_tokens(id)on delete set null,
 receipt jsonb not null,created_at timestamptz not null default clock_timestamp()
);
create index quote_link_requests_target on app_private.quote_link_requests(quote_id);
create index quote_link_requests_token on app_private.quote_link_requests(token_id);
alter table app_private.quote_link_requests enable row level security;
create policy "No direct quote link request access"on app_private.quote_link_requests as restrictive for all to public using(false)with check(false);
revoke all on app_private.quote_link_requests from public,anon,authenticated,service_role;

-- Read the quote and token authority in one snapshot. View telemetry is not authority.
create function app_private.quote_link_version(p_id uuid)returns text
language sql stable security invoker set search_path='' as $$
 select encode(sha256(convert_to(jsonb_build_array(to_jsonb(i)-array['updated_at','first_viewed_at','last_viewed_at','view_count'],
  (select coalesce(jsonb_agg(jsonb_build_array(t.id,t.customer_id,t.organization_id,t.token_hash,t.token_hint,t.token_encrypted,
   t.expires_at,t.revoked_at,t.created_at,t.created_by_user_id)order by t.id),'[]'::jsonb)from public.quote_portal_tokens t where t.quote_id=i.id))::text,'UTF8')),'hex')
 from public.quotes i where i.id=p_id;
$$;
revoke all on function app_private.quote_link_version(uuid)from public,anon,authenticated,service_role;
create function app_private.guard_quote_link_authority()returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if current_user in('authenticated','anon')then raise exception 'Use the reviewed quote-link action.'using errcode='42501';end if;
 if tg_op='DELETE'then return old;else return new;end if;
end $$;
revoke all on function app_private.guard_quote_link_authority()from public,anon,authenticated,service_role;
create trigger quote_link_authority before insert or update or delete on public.quote_portal_tokens for each row execute function app_private.guard_quote_link_authority();
revoke insert,update,delete on public.quote_portal_tokens from authenticated;

create function public.get_quote_link_state(p_quote_id uuid)returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if auth.uid()is null or not app_private.has_staff_role()then raise exception 'Active office access is required.'using errcode='42501';end if;
 select jsonb_build_object('link_version',app_private.quote_link_version(i.id),'tokens',
  (select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'quote_id',t.quote_id,'token_hint',t.token_hint,'token_encrypted',t.token_encrypted,'token_hash',t.token_hash,
    'expires_at',t.expires_at,'revoked_at',t.revoked_at,'created_at',t.created_at,'used_at',t.used_at,
    'usable',t.revoked_at is null and(t.expires_at is null or t.expires_at>statement_timestamp())
     and t.customer_id is not distinct from i.customer_id and t.organization_id is not distinct from i.organization_id)
    order by t.created_at desc,t.id desc),'[]'::jsonb)from public.quote_portal_tokens t where t.quote_id=i.id))into result
 from public.quotes i where i.id=p_quote_id;
 return result;
end $$;
create function app_private.quote_link_result(p_request uuid)returns jsonb
language plpgsql security invoker set search_path='' as $$
declare r app_private.quote_link_requests%rowtype;i public.quotes%rowtype;t public.quote_portal_tokens%rowtype;available boolean:=false;
begin
 select * into strict r from app_private.quote_link_requests where request_id=p_request;
 select * into i from public.quotes where id=r.quote_id;
 if not found then raise exception 'The earlier quote was removed. Review its link history.'using errcode='23514';end if;
 select * into t from public.quote_portal_tokens where quote_id=i.id and revoked_at is null and(expires_at is null or expires_at>clock_timestamp())order by created_at desc,id desc limit 1;
 available:=coalesce(found and r.receipt->>'intent'<>'revoke'and t.id=r.token_id and t.customer_id is not distinct from i.customer_id and t.organization_id is not distinct from i.organization_id,false);
 return r.receipt||jsonb_build_object('current_link_version',app_private.quote_link_version(i.id),
  'token_available',available,'token_encrypted',case when available then t.token_encrypted end,'token_hash',case when available then t.token_hash end,'expires_at',case when available then t.expires_at end);
end $$;
revoke all on function app_private.quote_link_result(uuid)from public,anon,authenticated,service_role;

create function app_private.lock_quote_link_source(p_id uuid)returns void
language plpgsql security invoker set search_path='' as $$
declare parent uuid;actual_parent uuid;
begin
 select coalesce(q.job_id,(select id from public.jobs where source_quote_id=q.id))into parent from public.quotes q where q.id=p_id;
 if parent is not null then perform id from public.jobs where id=parent for update;if not found then raise exception 'The linked work changed. Reload the quote.'using errcode='PT409';end if;end if;
 select coalesce(q.job_id,(select id from public.jobs where source_quote_id=q.id))into actual_parent from public.quotes q where q.id=p_id for update;
 if not found then raise exception 'Quote not found.'using errcode='23514';end if;
 if actual_parent is distinct from parent then raise exception 'The linked work changed. Reload the quote.'using errcode='PT409';end if;
 perform id from public.quote_portal_tokens where quote_id=p_id order by id for update;
end $$;
revoke all on function app_private.lock_quote_link_source(uuid)from public,anon,authenticated,service_role;

create function public.get_quote_link_request(p_request_id uuid,p_quote_id uuid,p_expected_version text,p_intent text,p_token_id uuid default null)returns jsonb
language plpgsql security definer set search_path='' set lock_timeout='5s' as $$
declare r app_private.quote_link_requests%rowtype;fingerprint text;
begin
 if auth.uid()is null or not app_private.has_staff_role()then raise exception 'Active office access is required.'using errcode='42501';end if;
 if p_request_id is null or p_quote_id is null or p_expected_version is null or p_expected_version!~'^[a-f0-9]{64}$'or p_intent is null or p_intent<>all(array['generate','regenerate','revoke'])
  or(p_intent='revoke')<>(p_token_id is not null)then raise exception 'Reload the quote before changing its customer link.'using errcode='22023';end if;
 select * into r from app_private.quote_link_requests where request_id=p_request_id;
 if not found then return null;end if;
 fingerprint:=encode(sha256(convert_to(jsonb_build_array(p_quote_id,p_expected_version,p_intent,p_token_id)::text,'UTF8')),'hex');
 if r.actor_user_id<>auth.uid()or r.input_hash<>fingerprint then raise exception 'This request belongs to another link action. Review the current quote.'using errcode='22023';end if;
 perform app_private.lock_quote_link_source(r.quote_id);
 if not app_private.has_staff_role()then raise exception 'Active office access is required.'using errcode='42501';end if;
 return app_private.quote_link_result(p_request_id)||jsonb_build_object('replayed',true);
end $$;

create function public.manage_quote_portal_link(p_request_id uuid,p_quote_id uuid,p_expected_version text,p_intent text,p_token_id uuid default null,p_candidate jsonb default null)returns jsonb
language plpgsql security definer set search_path='' set lock_timeout='5s' as $$
declare actor uuid:=auth.uid();i public.quotes%rowtype;t public.quote_portal_tokens%rowtype;ack jsonb;fingerprint text;
 new_token uuid;revoked integer:=0;outcome text;expires timestamptz;
begin
 if actor is null or not app_private.has_staff_role()then raise exception 'Active office access is required.'using errcode='42501';end if;
 if p_request_id is null then raise exception 'Reload the quote before changing its customer link.'using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('quote-link/'||p_request_id::text,0));
 ack:=public.get_quote_link_request(p_request_id,p_quote_id,p_expected_version,p_intent,p_token_id);
 if ack is not null then return ack;end if;
 perform app_private.lock_quote_link_source(p_quote_id);
 select * into strict i from public.quotes where id=p_quote_id;
 if not app_private.has_staff_role()then raise exception 'Active office access is required.'using errcode='42501';end if;
 if app_private.quote_link_version(i.id)<>p_expected_version then raise exception 'The quote or its customer links changed. Reload before choosing another link action.'using errcode='PT409';end if;
 if p_intent='revoke'then
  select * into t from public.quote_portal_tokens where id=p_token_id and quote_id=i.id;
  if not found then raise exception 'The selected link does not belong to this quote.'using errcode='23514';end if;
  update public.quote_portal_tokens set revoked_at=clock_timestamp()where id=p_token_id and revoked_at is null;get diagnostics revoked=row_count;new_token:=p_token_id;outcome:='revoked';
 else
  if(i.customer_id is null)=(i.organization_id is null)then raise exception 'Review the quote customer before creating a link.'using errcode='23514';end if;
  if p_intent='generate'then
   select * into t from public.quote_portal_tokens where quote_id=i.id and revoked_at is null and(expires_at is null or expires_at>clock_timestamp())order by created_at desc,id desc limit 1;
   if found then
    if t.customer_id is distinct from i.customer_id or t.organization_id is distinct from i.organization_id then raise exception 'The active link belongs to an earlier customer. Regenerate explicitly to replace it.'using errcode='23514';end if;
    new_token:=t.id;outcome:='reused';
   end if;
  end if;
  if new_token is null then
   if p_candidate is null or jsonb_typeof(p_candidate)<>'object'or exists(select 1 from jsonb_object_keys(p_candidate)k where k<>all(array['token_hash','token_hint','token_encrypted','expires_at']))
    or coalesce(p_candidate->>'token_hash','')!~'^[a-f0-9]{64}$'or coalesce(p_candidate->>'token_hint','')!~'^[A-Za-z0-9_-]{6}$'
    or coalesce(p_candidate->>'token_encrypted','')!~'^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{54,255}[A-Za-z0-9_-]{0,12}\.[A-Za-z0-9_-]{22}$'then raise exception 'A recoverable secure link is required. Reload and try again.'using errcode='22023';end if;
   expires:=(p_candidate->>'expires_at')::timestamptz;
   if expires is null or not isfinite(expires)or expires<=clock_timestamp()or expires>clock_timestamp()+interval '30 days 5 minutes'then raise exception 'Choose a valid secure-link expiry.'using errcode='22023';end if;
   if p_intent='regenerate'then update public.quote_portal_tokens set revoked_at=clock_timestamp()where quote_id=i.id and revoked_at is null;get diagnostics revoked=row_count;end if;
   insert into public.quote_portal_tokens(quote_id,customer_id,organization_id,token_hash,token_hint,token_encrypted,expires_at,created_by_user_id)
    values(i.id,i.customer_id,i.organization_id,p_candidate->>'token_hash',p_candidate->>'token_hint',p_candidate->>'token_encrypted',expires,actor)returning id into new_token;
   outcome:=case p_intent when 'regenerate'then 'regenerated'else 'created'end;
  end if;
 end if;
 insert into public.activity_log(actor_user_id,actor_type,subject_type,subject_id,event_type,metadata_json)values(actor,'staff','quote',i.id,
  case outcome when 'created'then 'quote_portal_link_generated'when 'reused'then 'quote_portal_link_reused'when 'regenerated'then 'quote_portal_link_regenerated'else 'quote_portal_link_revoked'end,
  jsonb_build_object('request_id',p_request_id,'token_id',new_token,'revoked_count',revoked,'email_sent',false));
 fingerprint:=encode(sha256(convert_to(jsonb_build_array(i.id,p_expected_version,p_intent,p_token_id)::text,'UTF8')),'hex');
 ack:=jsonb_build_object('request_id',p_request_id,'id',i.id,'intent',p_intent,'reviewed_version',p_expected_version,'target_token_id',p_token_id,
  'token_id',new_token,'outcome',outcome,'revoked_count',revoked,'link_version',app_private.quote_link_version(i.id),'replayed',false);
 insert into app_private.quote_link_requests(request_id,actor_user_id,input_hash,quote_id,token_id,receipt)values(p_request_id,actor,fingerprint,i.id,new_token,ack);
 if not app_private.has_staff_role()then raise exception 'Active office access is required.'using errcode='42501';end if;
 return app_private.quote_link_result(p_request_id);
end $$;

-- Existing email preparation may generate/reuse, but cannot replace or revoke.
-- Preserve that interface while routing it through the same serialized authority.
create or replace function public.create_or_get_quote_portal_token(p_quote_id uuid,p_token_hash text,p_token_hint text,p_token_encrypted text,p_expires_at timestamptz)
returns table(id uuid,token_encrypted text,expires_at timestamptz,created boolean)
language plpgsql security definer set search_path='' set lock_timeout='5s' as $$
declare result jsonb;request uuid:=gen_random_uuid();
begin
 if auth.uid()is null or not app_private.has_staff_role()then raise exception 'Active office access is required.'using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('quote-link/'||request::text,0));
 perform app_private.lock_quote_link_source(p_quote_id);
 result:=public.manage_quote_portal_link(request,p_quote_id,app_private.quote_link_version(p_quote_id),'generate',null,
  jsonb_build_object('token_hash',p_token_hash,'token_hint',p_token_hint,'token_encrypted',p_token_encrypted,'expires_at',p_expires_at));
 return query select(result->>'token_id')::uuid,result->>'token_encrypted',(result->>'expires_at')::timestamptz,result->>'outcome'='created';
end $$;
revoke all on function public.get_quote_link_state(uuid),public.get_quote_link_request(uuid,uuid,text,text,uuid),public.manage_quote_portal_link(uuid,uuid,text,text,uuid,jsonb),public.create_or_get_quote_portal_token(uuid,text,text,text,timestamptz)from public,anon,authenticated,service_role;
grant execute on function public.get_quote_link_state(uuid),public.get_quote_link_request(uuid,uuid,text,text,uuid),public.manage_quote_portal_link(uuid,uuid,text,text,uuid,jsonb),public.create_or_get_quote_portal_token(uuid,text,text,text,timestamptz)to authenticated;
-- One explicit legacy-link recovery selection is one transaction.
create table app_private.quote_link_batches(request_id uuid primary key,actor_user_id uuid not null,input_hash text not null,receipt jsonb not null,created_at timestamptz not null default clock_timestamp());
alter table app_private.quote_link_batches enable row level security;
create policy "No direct quote link batch access"on app_private.quote_link_batches as restrictive for all to public using(false)with check(false);
revoke all on app_private.quote_link_batches from public,anon,authenticated,service_role;
create function app_private.quote_link_selection(p_entries jsonb)returns jsonb
language plpgsql security invoker set search_path='' as $$
declare result jsonb;
begin
 if p_entries is null or jsonb_typeof(p_entries)<>'array'or jsonb_array_length(p_entries)not between 1 and 25 then raise exception 'Review between one and 25 proposal links.'using errcode='22023';end if;
 if exists(select 1 from jsonb_array_elements(p_entries)e where jsonb_typeof(e)<>'object'or coalesce(e->>'id','')!~*'^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$'or coalesce(e->>'version','')!~'^[a-f0-9]{64}$')then raise exception 'Reload the selected proposal links.'using errcode='22023';end if;
 if(select count(distinct(e->>'id')::uuid)from jsonb_array_elements(p_entries)e)<>jsonb_array_length(p_entries)then raise exception 'Each proposal must appear once.'using errcode='22023';end if;
 select jsonb_agg(jsonb_build_object('id',(e->>'id')::uuid,'version',e->>'version')order by(e->>'id')::uuid)into result from jsonb_array_elements(p_entries)e;
 return result;
end $$;
create function app_private.quote_link_batch_child(p_request uuid,p_quote uuid)returns uuid
language sql immutable security invoker set search_path='' as $$select substr(encode(sha256(convert_to('quote-link-batch/'||p_request::text||'/'||p_quote::text,'UTF8')),'hex'),1,32)::uuid;$$;
create function app_private.lock_quote_link_selection(p_selection jsonb)returns void
language plpgsql security invoker set search_path='' as $$
declare parents jsonb;after_parents jsonb;found_count integer;
begin
 select jsonb_object_agg(q.id::text,coalesce(q.job_id,(select id from public.jobs where source_quote_id=q.id))),count(*)into parents,found_count
 from public.quotes q where q.id in(select(e->>'id')::uuid from jsonb_array_elements(p_selection)e);
 if found_count<>jsonb_array_length(p_selection)then raise exception 'A selected proposal is unavailable.'using errcode='23514';end if;
 perform j.id from public.jobs j where j.id in(select value::uuid from jsonb_each_text(parents)where value is not null)order by j.id for update;
 perform q.id from public.quotes q where q.id in(select(e->>'id')::uuid from jsonb_array_elements(p_selection)e)order by q.id for update;
 select jsonb_object_agg(q.id::text,coalesce(q.job_id,(select id from public.jobs where source_quote_id=q.id)))into after_parents from public.quotes q where q.id in(select(e->>'id')::uuid from jsonb_array_elements(p_selection)e);
 if after_parents is distinct from parents then raise exception 'The selected work changed. Reload the proposals.'using errcode='PT409';end if;
 perform t.id from public.quote_portal_tokens t where t.quote_id in(select(e->>'id')::uuid from jsonb_array_elements(p_selection)e)order by t.id for update;
end $$;
create function public.get_quote_link_batch_request(p_request_id uuid,p_entries jsonb)returns jsonb
language plpgsql security definer set search_path='' set lock_timeout='5s' as $$
declare selection jsonb;fingerprint text;r app_private.quote_link_batches%rowtype;results jsonb;
begin
 if auth.uid()is null or not app_private.has_staff_role()then raise exception 'Active office access is required.'using errcode='42501';end if;
 if p_request_id is null then raise exception 'Reload before recovering proposal links.'using errcode='22023';end if;
 selection:=app_private.quote_link_selection(p_entries);fingerprint:=encode(sha256(convert_to(selection::text,'UTF8')),'hex');
 select * into r from app_private.quote_link_batches where request_id=p_request_id;
 if not found then return null;end if;
 if r.actor_user_id<>auth.uid()or r.input_hash<>fingerprint then raise exception 'This request belongs to a different link selection.'using errcode='22023';end if;
 perform app_private.lock_quote_link_selection(selection);
 if not app_private.has_staff_role()then raise exception 'Active office access is required.'using errcode='42501';end if;
 select jsonb_agg(app_private.quote_link_result((e->>'child_request_id')::uuid)order by(e->>'id')::uuid)into results from jsonb_array_elements(r.receipt->'entries')e;
 return r.receipt||jsonb_build_object('results',results,'replayed',true);
end $$;
create function public.recover_quote_portal_links(p_request_id uuid,p_entries jsonb)returns jsonb
language plpgsql security definer set search_path='' set lock_timeout='5s' as $$
declare actor uuid:=auth.uid();selection jsonb;ack jsonb;entry jsonb;child uuid;results jsonb:='[]';saved_entries jsonb:='[]';fingerprint text;parties integer;
begin
 if actor is null or not app_private.has_staff_role()then raise exception 'Active office access is required.'using errcode='42501';end if;
 if p_request_id is null then raise exception 'Reload before recovering proposal links.'using errcode='22023';end if;
 selection:=app_private.quote_link_selection(p_entries);
 perform pg_advisory_xact_lock(hashtextextended('quote-link-batch/'||p_request_id::text,0));
 ack:=public.get_quote_link_batch_request(p_request_id,selection);if ack is not null then return ack;end if;
 -- Child requests are locked before any business rows; single-record actions
 -- take the same request -> job -> quote -> token order.
 for entry in select * from jsonb_array_elements(selection)loop
  child:=app_private.quote_link_batch_child(p_request_id,(entry->>'id')::uuid);perform pg_advisory_xact_lock(hashtextextended('quote-link/'||child::text,0));
 end loop;
 perform app_private.lock_quote_link_selection(selection);
 if not app_private.has_staff_role()then raise exception 'Active office access is required.'using errcode='42501';end if;
 select count(distinct jsonb_build_array(customer_id,organization_id))into parties from public.quotes where id in(select(e->>'id')::uuid from jsonb_array_elements(selection)e);
 if parties<>1 then raise exception 'Recover proposal links for one customer or organization at a time.'using errcode='23514';end if;
 for entry in select e from jsonb_array_elements(p_entries)e order by(e->>'id')::uuid loop
  if entry->>'intent'is null or entry->>'intent'not in('generate','regenerate')then raise exception 'Review the selected replacement actions.'using errcode='22023';end if;
  child:=app_private.quote_link_batch_child(p_request_id,(entry->>'id')::uuid);
  ack:=public.manage_quote_portal_link(child,(entry->>'id')::uuid,entry->>'version',entry->>'intent',null,entry->'candidate');
  results:=results||jsonb_build_array(ack);saved_entries:=saved_entries||jsonb_build_array(jsonb_build_object('id',entry->>'id','version',entry->>'version','child_request_id',child));
 end loop;
 fingerprint:=encode(sha256(convert_to(selection::text,'UTF8')),'hex');
 ack:=jsonb_build_object('request_id',p_request_id,'entries',saved_entries,'replayed',false);
 insert into app_private.quote_link_batches(request_id,actor_user_id,input_hash,receipt)values(p_request_id,actor,fingerprint,ack);
 if not app_private.has_staff_role()then raise exception 'Active office access is required.'using errcode='42501';end if;
 return ack||jsonb_build_object('results',results);
end $$;
revoke all on function app_private.quote_link_selection(jsonb),app_private.quote_link_batch_child(uuid,uuid),app_private.lock_quote_link_selection(jsonb)from public,anon,authenticated,service_role;
revoke all on function public.get_quote_link_batch_request(uuid,jsonb),public.recover_quote_portal_links(uuid,jsonb)from public,anon,authenticated,service_role;
grant execute on function public.get_quote_link_batch_request(uuid,jsonb),public.recover_quote_portal_links(uuid,jsonb)to authenticated;

-- Match portal document reads and both response paths to the current party.
do $party_binding$
declare f text;routine regprocedure;anchor text:='if not found or t.revoked_at is not null or (t.expires_at is not null and t.expires_at<=clock_timestamp())';
begin
 foreach routine in array array['app_private.approve_quote_locked(uuid,integer,text)'::regprocedure,'app_private.request_quote_changes_locked(uuid,text,integer,text)'::regprocedure]loop
  f:=pg_get_functiondef(routine);
  if(length(f)-length(replace(f,anchor,'')))/length(anchor)<>1 then raise exception 'Unexpected quote response preimage: %',routine;end if;
  execute replace(f,anchor,anchor||' or t.customer_id is distinct from q.customer_id or t.organization_id is distinct from q.organization_id');
 end loop;
end $party_binding$;

notify pgrst,'reload schema';
commit;
