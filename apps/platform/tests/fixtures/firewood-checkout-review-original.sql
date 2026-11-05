CREATE OR REPLACE FUNCTION public.check_invoice_checkout_lease(p_invoice_id uuid, p_token uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if auth.uid() is null or not app_private.has_platform_admin_role() then
    raise exception 'Only an owner or admin may review payment checkouts.' using errcode = '42501';
  end if;
  if not exists(select 1 from app_private.invoice_void_leases l where l.invoice_id = p_invoice_id
    and l.token = p_token and l.actor_user_id = auth.uid() and l.purpose in ('void', 'review')
    and l.expires_at > clock_timestamp()) then
    raise exception 'Invoice operation expired or ownership changed. Retry.' using errcode = '55P03';
  end if;
  return true;
end;
$function$;

CREATE OR REPLACE FUNCTION public.begin_invoice_checkout_review(p_invoice_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  lease_token uuid := gen_random_uuid();
begin
  if auth.uid() is null or not app_private.has_platform_admin_role() then
    raise exception 'Only an owner or admin may review payment checkouts.' using errcode = '42501';
  end if;
  perform 1 from public.invoices where id = p_invoice_id for update;
  if not found then raise exception 'Invoice not found.' using errcode = 'P0002'; end if;
  if exists(select 1 from app_private.invoice_void_leases l where l.invoice_id = p_invoice_id and l.expires_at > clock_timestamp()) then
    raise exception 'An invoice operation is already in progress. Retry shortly.' using errcode = '55P03';
  end if;
  insert into app_private.invoice_void_leases(invoice_id, token, actor_user_id, expires_at, purpose)
    values(p_invoice_id, lease_token, auth.uid(), clock_timestamp() + interval '2 minutes', 'review')
    on conflict (invoice_id) do update set token = excluded.token, actor_user_id = excluded.actor_user_id,
      expires_at = excluded.expires_at, purpose = 'review', finalizing = false;
  return jsonb_build_object('token', lease_token);
end;
$function$;
