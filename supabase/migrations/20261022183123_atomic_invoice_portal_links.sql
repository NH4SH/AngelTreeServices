-- Office link authority only. No payment, checkout, invoice-total or delivery changes.
begin;
set local lock_timeout='3s';set local statement_timeout='20s';
create table app_private.invoice_link_requests(
 request_id uuid primary key,actor_user_id uuid not null,input_hash text not null check(input_hash~'^[a-f0-9]{64}$'),
 invoice_id uuid references public.invoices(id)on delete set null,
 token_id uuid references public.invoice_portal_tokens(id)on delete set null,
 receipt jsonb not null,created_at timestamptz not null default clock_timestamp()
);
create index invoice_link_requests_target on app_private.invoice_link_requests(invoice_id);
create index invoice_link_requests_token on app_private.invoice_link_requests(token_id);
alter table app_private.invoice_link_requests enable row level security;
create policy "No direct invoice link request access"on app_private.invoice_link_requests as restrictive for all to public using(false)with check(false);
revoke all on app_private.invoice_link_requests from public,anon,authenticated,service_role;

-- Read the invoice and token authority in one snapshot. View telemetry is not authority.
create function app_private.invoice_link_version(p_id uuid)returns text
language sql stable security invoker set search_path='' as $$
 select encode(sha256(convert_to(jsonb_build_array(to_jsonb(i),
  (select coalesce(jsonb_agg(jsonb_build_array(t.id,t.customer_id,t.organization_id,t.token_hash,t.token_hint,t.token_encrypted,
   t.expires_at,t.revoked_at,t.created_at,t.created_by_user_id)order by t.id),'[]'::jsonb)from public.invoice_portal_tokens t where t.invoice_id=i.id))::text,'UTF8')),'hex')
 from public.invoices i where i.id=p_id;
$$;
revoke all on function app_private.invoice_link_version(uuid)from public,anon,authenticated,service_role;
create function app_private.guard_invoice_link_authority()returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if current_user in('authenticated','anon')then raise exception 'Use the reviewed invoice-link action.'using errcode='42501';end if;
 if tg_op='DELETE'then return old;else return new;end if;
end $$;
revoke all on function app_private.guard_invoice_link_authority()from public,anon,authenticated,service_role;
create trigger invoice_link_authority before insert or update or delete on public.invoice_portal_tokens for each row execute function app_private.guard_invoice_link_authority();
revoke insert,update,delete on public.invoice_portal_tokens from authenticated;

create function public.get_invoice_link_state(p_invoice_id uuid)returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if auth.uid()is null or not app_private.has_platform_admin_role()then raise exception 'Active owner or admin access is required.'using errcode='42501';end if;
 select jsonb_build_object('link_version',app_private.invoice_link_version(i.id),'tokens',
  (select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'invoice_id',t.invoice_id,'token_hint',t.token_hint,'token_encrypted',t.token_encrypted,'token_hash',t.token_hash,
    'expires_at',t.expires_at,'revoked_at',t.revoked_at,'created_at',t.created_at,
    'usable',t.revoked_at is null and(t.expires_at is null or t.expires_at>statement_timestamp())
     and t.customer_id is not distinct from i.customer_id and t.organization_id is not distinct from i.organization_id)
    order by t.created_at desc,t.id desc),'[]'::jsonb)from public.invoice_portal_tokens t where t.invoice_id=i.id))into result
 from public.invoices i where i.id=p_invoice_id;
 return result;
end $$;
create function app_private.invoice_link_result(p_request uuid)returns jsonb
language plpgsql security invoker set search_path='' as $$
declare r app_private.invoice_link_requests%rowtype;i public.invoices%rowtype;t public.invoice_portal_tokens%rowtype;available boolean:=false;
begin
 select * into strict r from app_private.invoice_link_requests where request_id=p_request;
 select * into i from public.invoices where id=r.invoice_id;
 if not found then raise exception 'The earlier invoice was removed. Review its link history.'using errcode='23514';end if;
 select * into t from public.invoice_portal_tokens where invoice_id=i.id and revoked_at is null and(expires_at is null or expires_at>clock_timestamp())order by created_at desc,id desc limit 1;
 available:=coalesce(found and r.receipt->>'intent'<>'revoke'and t.id=r.token_id and t.customer_id is not distinct from i.customer_id and t.organization_id is not distinct from i.organization_id,false);
 return r.receipt||jsonb_build_object('current_link_version',app_private.invoice_link_version(i.id),
  'token_available',available,'token_encrypted',case when available then t.token_encrypted end,'token_hash',case when available then t.token_hash end,'expires_at',case when available then t.expires_at end);
end $$;
revoke all on function app_private.invoice_link_result(uuid)from public,anon,authenticated,service_role;

create function public.get_invoice_link_request(p_request_id uuid,p_invoice_id uuid,p_expected_version text,p_intent text,p_token_id uuid default null)returns jsonb
language plpgsql security definer set search_path='' set lock_timeout='5s' as $$
declare r app_private.invoice_link_requests%rowtype;fingerprint text;
begin
 if auth.uid()is null or not app_private.has_platform_admin_role()then raise exception 'Active owner or admin access is required.'using errcode='42501';end if;
 if p_request_id is null or p_invoice_id is null or p_expected_version is null or p_expected_version!~'^[a-f0-9]{64}$'or p_intent is null or p_intent<>all(array['generate','regenerate','revoke'])
  or(p_intent='revoke')<>(p_token_id is not null)then raise exception 'Reload the invoice before changing its customer link.'using errcode='22023';end if;
 select * into r from app_private.invoice_link_requests where request_id=p_request_id;
 if not found then return null;end if;
 fingerprint:=encode(sha256(convert_to(jsonb_build_array(p_invoice_id,p_expected_version,p_intent,p_token_id)::text,'UTF8')),'hex');
 if r.actor_user_id<>auth.uid()or r.input_hash<>fingerprint then raise exception 'This request belongs to another link action. Review the current invoice.'using errcode='22023';end if;
 perform id from public.invoices where id=r.invoice_id for update;
 if not found then raise exception 'The earlier invoice is unavailable. Review its link history.'using errcode='23514';end if;
 perform id from public.invoice_portal_tokens where invoice_id=r.invoice_id order by id for update;
 if not app_private.has_platform_admin_role()then raise exception 'Active owner or admin access is required.'using errcode='42501';end if;
 return app_private.invoice_link_result(p_request_id)||jsonb_build_object('replayed',true);
end $$;

create function public.manage_invoice_portal_link(p_request_id uuid,p_invoice_id uuid,p_expected_version text,p_intent text,p_token_id uuid default null,p_candidate jsonb default null)returns jsonb
language plpgsql security definer set search_path='' set lock_timeout='5s' as $$
declare actor uuid:=auth.uid();i public.invoices%rowtype;t public.invoice_portal_tokens%rowtype;ack jsonb;fingerprint text;
 new_token uuid;revoked integer:=0;outcome text;expires timestamptz;
begin
 if actor is null or not app_private.has_platform_admin_role()then raise exception 'Active owner or admin access is required.'using errcode='42501';end if;
 if p_request_id is null then raise exception 'Reload the invoice before changing its customer link.'using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('invoice-link/'||p_request_id::text,0));
 ack:=public.get_invoice_link_request(p_request_id,p_invoice_id,p_expected_version,p_intent,p_token_id);
 if ack is not null then return ack;end if;
 select * into i from public.invoices where id=p_invoice_id for update;
 if not found then raise exception 'Invoice not found.'using errcode='23514';end if;
 perform id from public.invoice_portal_tokens where invoice_id=i.id order by id for update;
 if not app_private.has_platform_admin_role()then raise exception 'Active owner or admin access is required.'using errcode='42501';end if;
 if app_private.invoice_link_version(i.id)<>p_expected_version then raise exception 'The invoice or its customer links changed. Reload before choosing another link action.'using errcode='PT409';end if;
 if p_intent='revoke'then
  select * into t from public.invoice_portal_tokens where id=p_token_id and invoice_id=i.id;
  if not found then raise exception 'The selected link does not belong to this invoice.'using errcode='23514';end if;
  update public.invoice_portal_tokens set revoked_at=clock_timestamp()where id=p_token_id and revoked_at is null;get diagnostics revoked=row_count;new_token:=p_token_id;outcome:='revoked';
 else
  if(i.customer_id is null)=(i.organization_id is null)then raise exception 'Review the invoice customer before creating a link.'using errcode='23514';end if;
  if p_intent='generate'then
   select * into t from public.invoice_portal_tokens where invoice_id=i.id and revoked_at is null and(expires_at is null or expires_at>clock_timestamp())order by created_at desc,id desc limit 1;
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
   if p_intent='regenerate'then update public.invoice_portal_tokens set revoked_at=clock_timestamp()where invoice_id=i.id and revoked_at is null;get diagnostics revoked=row_count;end if;
   insert into public.invoice_portal_tokens(invoice_id,customer_id,organization_id,token_hash,token_hint,token_encrypted,expires_at,created_by_user_id)
    values(i.id,i.customer_id,i.organization_id,p_candidate->>'token_hash',p_candidate->>'token_hint',p_candidate->>'token_encrypted',expires,actor)returning id into new_token;
   outcome:=case p_intent when 'regenerate'then 'regenerated'else 'created'end;
  end if;
 end if;
 insert into public.activity_log(actor_user_id,actor_type,subject_type,subject_id,event_type,metadata_json)values(actor,'staff','invoice',i.id,
  case outcome when 'created'then 'invoice_portal_link_generated'when 'reused'then 'invoice_portal_link_reused'when 'regenerated'then 'invoice_portal_link_regenerated'else 'invoice_portal_link_revoked'end,
  jsonb_build_object('request_id',p_request_id,'token_id',new_token,'revoked_count',revoked,'email_sent',false));
 fingerprint:=encode(sha256(convert_to(jsonb_build_array(i.id,p_expected_version,p_intent,p_token_id)::text,'UTF8')),'hex');
 ack:=jsonb_build_object('request_id',p_request_id,'id',i.id,'intent',p_intent,'reviewed_version',p_expected_version,'target_token_id',p_token_id,
  'token_id',new_token,'outcome',outcome,'revoked_count',revoked,'link_version',app_private.invoice_link_version(i.id),'replayed',false);
 insert into app_private.invoice_link_requests(request_id,actor_user_id,input_hash,invoice_id,token_id,receipt)values(p_request_id,actor,fingerprint,i.id,new_token,ack);
 if not app_private.has_platform_admin_role()then raise exception 'Active owner or admin access is required.'using errcode='42501';end if;
 return app_private.invoice_link_result(p_request_id);
end $$;

-- Existing email preparation may generate/reuse, but cannot replace or revoke.
-- Preserve that interface while routing it through the same serialized authority.
create or replace function public.create_or_get_invoice_portal_token(p_invoice_id uuid,p_token_hash text,p_token_hint text,p_token_encrypted text,p_expires_at timestamptz)
returns table(id uuid,token_encrypted text,expires_at timestamptz,created boolean)
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if auth.uid()is null or not app_private.has_platform_admin_role()then raise exception 'Active owner or admin access is required.'using errcode='42501';end if;
 perform i.id from public.invoices i where i.id=p_invoice_id for update;
 if not found then raise exception 'Invoice not found.'using errcode='23514';end if;
 result:=public.manage_invoice_portal_link(gen_random_uuid(),p_invoice_id,app_private.invoice_link_version(p_invoice_id),'generate',null,
  jsonb_build_object('token_hash',p_token_hash,'token_hint',p_token_hint,'token_encrypted',p_token_encrypted,'expires_at',p_expires_at));
 return query select(result->>'token_id')::uuid,result->>'token_encrypted',(result->>'expires_at')::timestamptz,result->>'outcome'='created';
end $$;
revoke all on function public.get_invoice_link_state(uuid),public.get_invoice_link_request(uuid,uuid,text,text,uuid),public.manage_invoice_portal_link(uuid,uuid,text,text,uuid,jsonb),public.create_or_get_invoice_portal_token(uuid,text,text,text,timestamptz)from public,anon,authenticated,service_role;
grant execute on function public.get_invoice_link_state(uuid),public.get_invoice_link_request(uuid,uuid,text,text,uuid),public.manage_invoice_portal_link(uuid,uuid,text,text,uuid,jsonb),public.create_or_get_invoice_portal_token(uuid,text,text,text,timestamptz)to authenticated;
-- Preference requests already take the invoice lock. Recheck token authority
-- afterwards so a request queued behind revocation cannot use its old snapshot.
-- Keep all payment calculations, preferences and source-event behavior intact.
do $preference_binding$
declare f text:=pg_get_functiondef('public.record_invoice_payment_preference(text,text)'::regprocedure);
 anchor text:='if target.id is null then';
begin
 if(length(f)-length(replace(f,anchor,'')))/length(anchor)<>1 then raise exception 'Unexpected invoice preference preimage';end if;
 execute replace(f,anchor,$body$perform t.id from public.invoice_portal_tokens t where t.token_hash=p_token_hash and t.invoice_id=target.id
  and t.revoked_at is null and(t.expires_at is null or t.expires_at>clock_timestamp())
  and t.customer_id is not distinct from target.customer_id and t.organization_id is not distinct from target.organization_id for update;
 if not found then raise exception 'Invoice link is unavailable.'using errcode='P0002';end if;
 if target.id is null then$body$);
end $preference_binding$;
notify pgrst,'reload schema';
commit;
