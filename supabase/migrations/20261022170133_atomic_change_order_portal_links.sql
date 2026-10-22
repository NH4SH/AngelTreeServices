-- Atomic office capability management. Never send email from these commands.
begin;
set local lock_timeout='3s';set local statement_timeout='20s';
create table app_private.change_order_link_requests(
 request_id uuid primary key,actor_user_id uuid not null,input_hash text not null check(input_hash~'^[a-f0-9]{64}$'),
 change_order_id uuid references public.change_orders(id)on delete set null,
 token_id uuid references public.change_order_portal_tokens(id)on delete set null,
 receipt jsonb not null,created_at timestamptz not null default clock_timestamp()
);
create index change_order_link_requests_target on app_private.change_order_link_requests(change_order_id);
create index change_order_link_requests_token on app_private.change_order_link_requests(token_id);
alter table app_private.change_order_link_requests enable row level security;
create policy "No direct link request access"on app_private.change_order_link_requests as restrictive for all to public using(false)with check(false);
revoke all on app_private.change_order_link_requests from public,anon,authenticated,service_role;

create function app_private.change_order_link_version(p_id uuid)returns text
language sql stable security invoker set search_path='' as $$
 select encode(sha256(convert_to(coalesce(jsonb_agg(jsonb_build_array(t.id,t.customer_id,t.organization_id,t.intended_contact_id,
  t.token_hash,t.token_hint,t.token_encrypted,t.expires_at,t.revoked_at,t.created_at,t.created_by_user_id)order by t.id),'[]'::jsonb)::text,'UTF8')),'hex')
 from public.change_order_portal_tokens t where t.change_order_id=p_id;
$$;
revoke all on function app_private.change_order_link_version(uuid)from public,anon,authenticated,service_role;

create function app_private.guard_change_order_link_authority()returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if current_user in('authenticated','anon')then raise exception 'Use the reviewed customer-link action.'using errcode='42501';end if;
 if tg_op='DELETE'then return old;else return new;end if;
end $$;
revoke all on function app_private.guard_change_order_link_authority()from public,anon,authenticated,service_role;
create trigger change_order_link_authority before insert or update or delete on public.change_order_portal_tokens for each row execute function app_private.guard_change_order_link_authority();
revoke insert,update,delete on public.change_order_portal_tokens from authenticated;
revoke execute on function public.create_or_get_change_order_portal_token(uuid,text,text,text,timestamptz)from authenticated,service_role;

create function public.get_change_order_link_state(p_change_order_id uuid)returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if auth.uid()is null or not app_private.has_staff_role()then raise exception 'Active office access is required.'using errcode='42501';end if;
 select jsonb_build_object('link_version',app_private.change_order_link_version(c.id),'tokens',
  (select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'token_hint',t.token_hint,'token_encrypted',t.token_encrypted,'token_hash',t.token_hash,
    'expires_at',t.expires_at,'viewed_at',t.viewed_at,'used_at',t.used_at,'revoked_at',t.revoked_at,'created_at',t.created_at,
    'usable',t.revoked_at is null and(t.expires_at is null or t.expires_at>statement_timestamp())
     and t.customer_id is not distinct from c.customer_id and t.organization_id is not distinct from c.organization_id
     and t.intended_contact_id is not distinct from c.approval_contact_id and(t.intended_contact_id is null or exists(select 1 from public.organization_contacts oc where oc.id=t.intended_contact_id and oc.organization_id=c.organization_id and oc.is_active)))
    order by t.created_at desc,t.id desc),'[]'::jsonb)from public.change_order_portal_tokens t where t.change_order_id=c.id))into result
 from public.change_orders c where c.id=p_change_order_id;
 return result;
end $$;

create function app_private.change_order_link_result(p_request uuid)returns jsonb
language plpgsql security invoker set search_path='' as $$
declare r app_private.change_order_link_requests%rowtype;c public.change_orders%rowtype;t public.change_order_portal_tokens%rowtype;available boolean:=false;
begin
 select * into strict r from app_private.change_order_link_requests where request_id=p_request;
 select * into c from public.change_orders where id=r.change_order_id;
 if not found then raise exception 'The earlier record was removed. Review its link history.'using errcode='23514';end if;
 select * into t from public.change_order_portal_tokens where change_order_id=c.id and revoked_at is null and(expires_at is null or expires_at>clock_timestamp())order by created_at desc,id desc limit 1;
 available:=coalesce(found and t.id=r.token_id and t.customer_id is not distinct from c.customer_id and t.organization_id is not distinct from c.organization_id and t.intended_contact_id is not distinct from c.approval_contact_id and(t.intended_contact_id is null or exists(select 1 from public.organization_contacts oc where oc.id=t.intended_contact_id and oc.organization_id=c.organization_id and oc.is_active)),false);
 return r.receipt||jsonb_build_object('current_link_version',app_private.change_order_link_version(c.id),'current_revision',c.edit_revision,'current_status',c.status,
  'token_available',available,'token_encrypted',case when available then t.token_encrypted end,'token_hash',case when available then t.token_hash end,'expires_at',case when available then t.expires_at end);
end $$;
revoke all on function app_private.change_order_link_result(uuid)from public,anon,authenticated,service_role;

create function public.get_change_order_link_request(p_request_id uuid,p_change_order_id uuid,p_expected_revision integer,p_expected_link_version text,p_intent text)returns jsonb
language plpgsql security definer set search_path='' set lock_timeout='5s' as $$
declare r app_private.change_order_link_requests%rowtype;parent uuid;actual_parent uuid;fingerprint text;
begin
 if auth.uid()is null or not app_private.has_staff_role()then raise exception 'Active office access is required.'using errcode='42501';end if;
 if p_request_id is null or p_change_order_id is null or p_expected_revision is null or p_expected_revision<0 or p_expected_link_version is null or p_expected_link_version!~'^[a-f0-9]{64}$'
  or p_intent is null or p_intent<>all(array['generate','regenerate','revoke'])then raise exception 'Reload the record before changing its customer link.'using errcode='22023';end if;
 select * into r from app_private.change_order_link_requests where request_id=p_request_id;
 if not found then return null;end if;
 fingerprint:=encode(sha256(convert_to(jsonb_build_array(p_change_order_id,p_expected_revision,p_expected_link_version,p_intent)::text,'UTF8')),'hex');
 if r.actor_user_id<>auth.uid()or r.input_hash<>fingerprint then raise exception 'This request belongs to another link action. Review the current link.'using errcode='22023';end if;
 select job_id into parent from public.change_orders where id=r.change_order_id;
 if parent is not null then perform id from public.jobs where id=parent for update;end if;
 select job_id into actual_parent from public.change_orders where id=r.change_order_id for update;
 if not found or actual_parent is distinct from parent then raise exception 'The earlier record is unavailable. Review its link history.'using errcode='23514';end if;
 perform id from public.change_order_portal_tokens where change_order_id=r.change_order_id order by id for update;
 if not app_private.has_staff_role()then raise exception 'Active office access is required.'using errcode='42501';end if;
 return app_private.change_order_link_result(p_request_id)||jsonb_build_object('replayed',true);
end $$;

create function public.manage_change_order_portal_link(p_request_id uuid,p_change_order_id uuid,p_expected_revision integer,p_expected_link_version text,p_intent text,p_candidate jsonb default null)returns jsonb
language plpgsql security definer set search_path='' set lock_timeout='5s' as $$
declare actor uuid:=auth.uid();c public.change_orders%rowtype;t public.change_order_portal_tokens%rowtype;parent uuid;ack jsonb;fingerprint text;
 new_token uuid;revoked integer:=0;outcome text;expires timestamptz;
begin
 if actor is null or not app_private.has_staff_role()then raise exception 'Active office access is required.'using errcode='42501';end if;
 if p_request_id is null then raise exception 'Reload the record before changing its customer link.'using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('change-order-link/'||p_request_id::text,0));
 ack:=public.get_change_order_link_request(p_request_id,p_change_order_id,p_expected_revision,p_expected_link_version,p_intent);
 if ack is not null then return ack;end if;
 select job_id into parent from public.change_orders where id=p_change_order_id;
 if parent is not null then perform id from public.jobs where id=parent for update;end if;
 select * into c from public.change_orders where id=p_change_order_id for update;
 if not found or c.job_id is distinct from parent or c.edit_revision<>p_expected_revision then raise exception 'This addition changed. Review the current record before changing its link.'using errcode='PT409';end if;
 perform id from public.change_order_portal_tokens where change_order_id=c.id order by id for update;
 if not app_private.has_staff_role()then raise exception 'Active office access is required.'using errcode='42501';end if;
 if app_private.change_order_link_version(c.id)<>p_expected_link_version then raise exception 'The customer links changed. Reload before choosing another link action.'using errcode='PT409';end if;
 if p_intent='revoke'then
  update public.change_order_portal_tokens set revoked_at=clock_timestamp()where change_order_id=c.id and revoked_at is null;get diagnostics revoked=row_count;outcome:='revoked';
 else
  if(c.customer_id is null)=(c.organization_id is null)or c.approval_contact_id is not null and not exists(select 1 from public.organization_contacts where id=c.approval_contact_id and organization_id=c.organization_id and is_active)then
   raise exception 'Review the customer and active approval contact before creating a link.'using errcode='23514';end if;
  if p_intent='generate'then
   select * into t from public.change_order_portal_tokens where change_order_id=c.id and revoked_at is null and(expires_at is null or expires_at>clock_timestamp())order by created_at desc,id desc limit 1;
   if found then
    if t.customer_id is distinct from c.customer_id or t.organization_id is distinct from c.organization_id or t.intended_contact_id is distinct from c.approval_contact_id then
     raise exception 'The active link belongs to an earlier approval contact. Use Regenerate link to replace it explicitly.'using errcode='23514';end if;
    new_token:=t.id;outcome:='reused';
   end if;
  end if;
  if new_token is null then
   if p_candidate is null or jsonb_typeof(p_candidate)<>'object'or exists(select 1 from jsonb_object_keys(p_candidate)k where k<>all(array['token_hash','token_hint','token_encrypted','expires_at']))
    or coalesce(p_candidate->>'token_hash','')!~'^[a-f0-9]{64}$'or coalesce(p_candidate->>'token_hint','')!~'^[A-Za-z0-9_-]{6}$'
    or coalesce(p_candidate->>'token_encrypted','')!~'^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{54,255}[A-Za-z0-9_-]{0,12}\.[A-Za-z0-9_-]{22}$'then
    raise exception 'A recoverable secure link is required. Reload and try again.'using errcode='22023';end if;
   expires:=(p_candidate->>'expires_at')::timestamptz;
   if expires is null or not isfinite(expires)or expires<=clock_timestamp()or expires>clock_timestamp()+interval '30 days 5 minutes'then raise exception 'Choose a valid secure-link expiry.'using errcode='22023';end if;
   if p_intent='regenerate'then update public.change_order_portal_tokens set revoked_at=clock_timestamp()where change_order_id=c.id and revoked_at is null;get diagnostics revoked=row_count;end if;
   insert into public.change_order_portal_tokens(change_order_id,customer_id,organization_id,intended_contact_id,token_hash,token_hint,token_encrypted,expires_at,created_by_user_id)
    values(c.id,c.customer_id,c.organization_id,c.approval_contact_id,p_candidate->>'token_hash',p_candidate->>'token_hint',p_candidate->>'token_encrypted',expires,actor)returning id into new_token;
   outcome:=case p_intent when 'regenerate'then 'regenerated'else 'created'end;
  end if;
 end if;
 insert into public.activity_log(actor_user_id,actor_type,subject_type,subject_id,event_type,metadata_json)values(actor,'staff','change_order',c.id,
  case outcome when 'created'then 'change_order_portal_link_created'when 'reused'then 'change_order_portal_link_reused'when 'regenerated'then 'change_order_portal_link_regenerated'else 'change_order_portal_link_revoked'end,
  jsonb_build_object('request_id',p_request_id,'token_id',new_token,'revoked_count',revoked,'reviewed_revision',p_expected_revision,'email_sent',false));
 fingerprint:=encode(sha256(convert_to(jsonb_build_array(c.id,p_expected_revision,p_expected_link_version,p_intent)::text,'UTF8')),'hex');
 ack:=jsonb_build_object('request_id',p_request_id,'id',c.id,'intent',p_intent,'reviewed_revision',p_expected_revision,'reviewed_link_version',p_expected_link_version,
  'token_id',new_token,'outcome',outcome,'revoked_count',revoked,'link_version',app_private.change_order_link_version(c.id),'replayed',false);
 insert into app_private.change_order_link_requests(request_id,actor_user_id,input_hash,change_order_id,token_id,receipt)values(p_request_id,actor,fingerprint,c.id,new_token,ack);
 if not app_private.has_staff_role()then raise exception 'Active office access is required.'using errcode='42501';end if;
 return app_private.change_order_link_result(p_request_id);
end $$;

-- Declines/change requests must obey the same capability binding as reads/approval.
do $response_binding$
declare f text:=pg_get_functiondef('public.respond_to_change_order_by_portal(uuid,text,timestamptz,text,text)'::regprocedure);
 anchor text:='if not found or t.revoked_at is not null or (t.expires_at is not null and t.expires_at<=clock_timestamp()) then';
begin
 if(length(f)-length(replace(f,anchor,'')))/length(anchor)<>1 then raise exception 'Unexpected change-order response preimage';end if;
 execute replace(f,anchor,$body$if not found or t.revoked_at is not null or (t.expires_at is not null and t.expires_at<=clock_timestamp())
  or t.customer_id is distinct from co.customer_id or t.organization_id is distinct from co.organization_id
  or(t.intended_contact_id is not null and not exists(select 1 from public.organization_contacts oc where oc.id=t.intended_contact_id and oc.id=co.approval_contact_id and oc.organization_id=co.organization_id and oc.is_active))then$body$);
end $response_binding$;
revoke all on function public.get_change_order_link_state(uuid),public.get_change_order_link_request(uuid,uuid,integer,text,text),public.manage_change_order_portal_link(uuid,uuid,integer,text,text,jsonb)from public,anon,authenticated,service_role;
grant execute on function public.get_change_order_link_state(uuid),public.get_change_order_link_request(uuid,uuid,integer,text,text),public.manage_change_order_portal_link(uuid,uuid,integer,text,text,jsonb)to authenticated;
notify pgrst,'reload schema';
commit;
