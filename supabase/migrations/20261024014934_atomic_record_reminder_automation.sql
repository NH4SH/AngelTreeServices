begin;

-- The existing staff action changes one opt-out and its pending reminder rows
-- together. Keep caller privileges/RLS; no delivery claim or sender is invoked.
create function public.set_record_reminder_automation(
  p_record_type text,p_record_id uuid,p_enabled boolean,p_expected_updated_at timestamptz
) returns jsonb language plpgsql security invoker
set search_path='' set lock_timeout='2s' as $$
declare parent uuid;actual_parent uuid;version timestamptz;enabled boolean;
  changed integer;cancelled integer:=0;
begin
  if current_setting('role',true)<>'authenticated' or auth.uid() is null
    or not app_private.has_staff_role() then
    raise exception 'Only internal staff can manage customer reminders' using errcode='42501';
  end if;
  if p_record_type is null or p_record_type not in('quote','invoice') or p_record_id is null
    or p_enabled is null or p_expected_updated_at is null or not isfinite(p_expected_updated_at) then
    raise exception 'Invalid record automation request' using errcode='22023';
  end if;

  -- Match the existing dispatch order: parent job -> source -> queue. If a
  -- parent changes during the wait, require a reload rather than lock backwards.
  if p_record_type='quote' then
    select job_id into parent from public.quotes where id=p_record_id;
  else
    select job_id into parent from public.invoices where id=p_record_id;
  end if;
  if parent is not null then perform id from public.jobs where id=parent for update;end if;
  if p_record_type='quote' then
    select job_id,updated_at,automatic_follow_ups_enabled into actual_parent,version,enabled
      from public.quotes where id=p_record_id for update;
  else
    select job_id,updated_at,automatic_reminders_enabled into actual_parent,version,enabled
      from public.invoices where id=p_record_id for update;
  end if;
  if not found or actual_parent is distinct from parent or version is distinct from p_expected_updated_at then
    raise exception 'Record changed or unavailable; reload before changing reminders' using errcode='40001';
  end if;
  if enabled is distinct from p_enabled then
    if p_record_type='quote' then
      update public.quotes set automatic_follow_ups_enabled=p_enabled where id=p_record_id returning updated_at into version;
    else
      update public.invoices set automatic_reminders_enabled=p_enabled where id=p_record_id returning updated_at into version;
    end if;
    get diagnostics changed=row_count;
    if changed<>1 then raise exception 'Record update unavailable' using errcode='40001';end if;
  end if;

  if not p_enabled then
    with targets as materialized(
      select c.id from public.customer_communications c
      where c.status='pending' and c.is_automatic and
        ((p_record_type='quote' and c.quote_id=p_record_id and c.communication_type='quote_follow_up') or
         (p_record_type='invoice' and c.invoice_id=p_record_id and c.communication_type in('invoice_payment_reminder','overdue_invoice_reminder')))
      order by c.id for update of c
    )update public.customer_communications c set cancelled_at=clock_timestamp(),
      skip_reason=case when p_record_type='quote' then 'Automatic follow-ups disabled by staff.' else 'Automatic reminders disabled by staff.' end,
      status='cancelled' from targets t where c.id=t.id and c.status='pending';
    get diagnostics cancelled=row_count;
  end if;
  return jsonb_build_object('record_type',p_record_type,'record_id',p_record_id,'enabled',p_enabled,'updated_at',version,'cancelled_count',cancelled);
end $$;
revoke all on function public.set_record_reminder_automation(text,uuid,boolean,timestamptz) from public,anon,authenticated,service_role;
grant execute on function public.set_record_reminder_automation(text,uuid,boolean,timestamptz) to authenticated;
notify pgrst,'reload schema';
commit;
