-- One read snapshot for portal payment readiness. No invoice/payment mutation,
-- financial command replacement, browser grant or collection authorization.
create function public.get_invoice_payment_principal(p_invoice_id uuid)
returns jsonb
language plpgsql stable security invoker
set search_path = ''
as $$
declare receipt jsonb;
begin
  -- Backend calls carry no end-user subject. A browser session passed through
  -- a privileged client must not acquire an invoice lookup capability.
  if current_user <> 'service_role' or auth.uid() is not null then
    raise exception 'Server-only payment read.' using errcode = '42501';
  end if;
  if p_invoice_id is null then
    raise exception 'Invoice identity is required.' using errcode = '22023';
  end if;
  select pg_catalog.jsonb_build_object(
    'invoice_id', i.id,
    'successful_payment_count', pg_catalog.count(p.id),
    'paid_principal_cents', coalesce(pg_catalog.sum(greatest(0::bigint,
      p.amount_cents::bigint - greatest(0, p.refunded_principal_cents)::bigint
      - case when p.dispute_status = 'lost' then greatest(0, p.disputed_principal_cents)::bigint else 0 end
    )) filter (where p.id is not null), 0)
  ) into receipt
  from public.invoices i
  left join public.payments p on p.invoice_id = i.id and p.status = 'succeeded'
  where i.id = p_invoice_id
  group by i.id;
  return receipt;
end;
$$;
comment on function public.get_invoice_payment_principal(uuid) is
  'Service-only read of successful net invoice principal and count in one statement snapshot; no collection authority or writes.';
revoke all on function public.get_invoice_payment_principal(uuid) from public, anon, authenticated, service_role;
grant execute on function public.get_invoice_payment_principal(uuid) to service_role;
