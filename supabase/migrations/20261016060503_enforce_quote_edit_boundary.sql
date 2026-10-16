-- PR05 phase 2: publish all coordinated create/edit callers before this grant
-- transition in any future approved rollout. Both phases are local-only here.
revoke insert,update on public.quotes from public,anon,authenticated;
grant update(status,approved_at,job_id,sent_at,sent_method,sent_by_user_id,
  automatic_follow_ups_enabled,archived_at,archived_by_user_id,estimator_user_id,estimator_employee_id)
  on public.quotes to authenticated;
revoke insert,update,delete on public.quote_line_items from public,anon,authenticated;
notify pgrst,'reload schema';

-- Match the existing owner-only permanent-delete UI; deleting the parent must
-- not bypass closed-document or billed/source-history protections.
create function app_private.guard_quote_delete() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is not null and (not app_private.has_staff_role() or not exists(select 1 from public.user_roles ur join public.roles r on r.id=ur.role_id where ur.user_id=auth.uid() and r.name='owner')) then
    raise exception 'Only an owner may permanently delete draft quotes.' using errcode='42501';end if;
  if old.status<>'draft' or exists(select 1 from public.jobs where source_quote_id=old.id)
    or exists(select 1 from public.invoices where quote_id=old.id) or exists(select 1 from public.documents where quote_id=old.id)
    or exists(select 1 from public.change_orders where source_quote_id=old.id) then
    raise exception 'Quote history must be retained. Archive this quote instead.' using errcode='23514';end if;
  return old;
end; $$;
revoke all on function app_private.guard_quote_delete() from public,anon,authenticated,service_role;
create trigger quote_history_delete_gate before delete on public.quotes for each row execute function app_private.guard_quote_delete();
