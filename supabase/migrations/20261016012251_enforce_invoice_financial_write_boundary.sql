-- PR03 rollout phase 2. Apply only after all invoice-writing app instances use
-- the phase-1 commands. Stage this separately from command installation; older
-- application instances still issue table writes and must be drained first.
-- For local review both phases are installed. No production rollout authorized.

-- Remove table-level privileges first: a column REVOKE cannot override them.
-- Keep SELECT intact and metadata updates behind existing RLS (archive/settings).
revoke insert, update on public.invoices from public, anon, authenticated;
grant update(automatic_reminders_enabled,archived_at,archived_by_user_id) on public.invoices to authenticated;
revoke insert, update, delete on public.invoice_line_items from public, anon, authenticated;

-- Match the existing permanent-delete UI at the DB boundary too. Draft deletion
-- remains available to owners/admins; money/checkout/document history survives.
create function app_private.guard_invoice_delete() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null and not app_private.has_platform_admin_role() then
    raise exception 'Only an owner or admin may delete draft invoices.' using errcode = '42501';
  end if;
  if old.status <> 'draft' or old.sent_at is not null
    or exists(select 1 from public.payments p where p.invoice_id = old.id)
    or exists(select 1 from public.invoice_checkout_sessions s where s.invoice_id = old.id)
    or exists(select 1 from public.documents d where d.invoice_id = old.id)
    or exists(select 1 from app_private.invoice_void_leases l where l.invoice_id = old.id and l.expires_at > clock_timestamp()) then
    raise exception 'Invoice history must be retained. Archive this invoice instead.' using errcode = '23514';
  end if;
  return old;
end;
$$;
revoke all on function app_private.guard_invoice_delete() from public, anon, authenticated, service_role;
create trigger invoice_history_delete_gate before delete on public.invoices
  for each row execute function app_private.guard_invoice_delete();

notify pgrst,'reload schema';
