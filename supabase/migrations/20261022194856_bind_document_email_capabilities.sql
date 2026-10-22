-- Validate the exact document capability when admitting/retrying an email.
-- No delivery rewrite, history repair, provider I/O, grants or production switches.
begin;
set local lock_timeout='3s';set local statement_timeout='20s';
create function app_private.email_document_tokens_eligible(c jsonb)returns boolean
language plpgsql volatile security invoker set search_path='' as $$
declare tokens jsonb:=coalesce(c->'portal_tokens','[]'::jsonb);target jsonb;token uuid;matched boolean;
begin
 if jsonb_typeof(c)is distinct from 'object'or jsonb_typeof(tokens)is distinct from 'array'then return false;end if;
 -- These templates contain actionable document links. An older frozen reminder
 -- without its exact token identity needs review, never an automatic new copy.
 if c->>'email_type'in('quote_follow_up','invoice_payment_reminder','overdue_invoice_reminder')then
  if jsonb_array_length(tokens)<>1 or tokens->0->>'kind'is distinct from(case when c->>'email_type'='quote_follow_up'then 'quote'else 'invoice'end)then return false;end if;
 end if;
 for target in select value from jsonb_array_elements(tokens)loop
  if jsonb_typeof(target)is distinct from 'object'or coalesce(target->>'id','')!~*'^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$'then return false;end if;
  token:=(target->>'id')::uuid;matched:=false;
  if target->>'kind'='quote'then
   if jsonb_typeof(c->'quote_ids')is distinct from 'array'then return false;end if;
   select exists(select 1 from public.quote_portal_tokens t join public.quotes q on q.id=t.quote_id
    where t.id=token and coalesce(c->'quote_ids','[]'::jsonb)?q.id::text
    and q.customer_id::text is not distinct from nullif(c->>'customer_id','') and q.organization_id::text is not distinct from nullif(c->>'organization_id','')
    and t.customer_id is not distinct from q.customer_id and t.organization_id is not distinct from q.organization_id
    and t.revoked_at is null and(t.expires_at is null or t.expires_at>clock_timestamp()))into matched;
  elsif target->>'kind'='invoice'then
   select exists(select 1 from public.invoice_portal_tokens t join public.invoices i on i.id=t.invoice_id
    where t.id=token and i.id::text=c->>'invoice_id'
    and i.customer_id::text is not distinct from nullif(c->>'customer_id','') and i.organization_id::text is not distinct from nullif(c->>'organization_id','')
    and t.customer_id is not distinct from i.customer_id and t.organization_id is not distinct from i.organization_id
    and t.revoked_at is null and(t.expires_at is null or t.expires_at>clock_timestamp()))into matched;
  elsif target->>'kind'='change_order'then
   select exists(select 1 from public.change_order_portal_tokens t join public.change_orders co on co.id=t.change_order_id
    where t.id=token and co.id::text=c->>'change_order_id'
    and co.customer_id::text is not distinct from nullif(c->>'customer_id','') and co.organization_id::text is not distinct from nullif(c->>'organization_id','')
    and t.customer_id is not distinct from co.customer_id and t.organization_id is not distinct from co.organization_id
    and t.intended_contact_id is not distinct from co.approval_contact_id
    and t.revoked_at is null and(t.expires_at is null or t.expires_at>clock_timestamp()))into matched;
  end if;
  if not matched then return false;end if;
 end loop;
 return true;
end $$;
revoke all on function app_private.email_document_tokens_eligible(jsonb)from public,anon,authenticated,service_role;
-- Preserve the accumulated source/recipient, sender-block, notification and
-- appointment-notice predicates. Replace only the former id/expiry-only loop.
do $patch$
declare f text;first_at integer;last_at integer;anchor text:='  for target in select value from jsonb_array_elements(coalesce(c->''portal_tokens'',''[]'')) loop';tail text:='  if nullif(c->>''communication_id'','''') is not null then';
begin
 f:=pg_get_functiondef('app_private.email_source_eligible(jsonb,jsonb)'::regprocedure);
 first_at:=strpos(f,anchor);last_at:=strpos(substr(f,first_at),tail)+first_at-1;
 if first_at=0 or last_at<=first_at or(length(f)-length(replace(f,anchor,'')))/length(anchor)<>1 then raise exception 'Unexpected email capability guard preimage';end if;
 if md5(substr(f,first_at,last_at-first_at))<>'54dd602ea18e4ca80a17a4ea3d578a4d'then raise exception 'Unexpected document-token eligibility preimage';end if;
 execute substr(f,1,first_at-1)||'  if not app_private.email_document_tokens_eligible(c)then return false;end if;'||chr(10)||substr(f,last_at);
end $patch$;
notify pgrst,'reload schema';
commit;
