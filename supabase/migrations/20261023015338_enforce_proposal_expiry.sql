-- New acceptance must respect the proposal deadline, independently of link expiry.
-- Preserve committed approval replay, legacy approved-record repair, lock order,
-- capability checks, grants, source-event handoff and every existing write.
begin;
set local lock_timeout='3s';
set local statement_timeout='20s';
do $migration$
declare
  definition text;
  anchor text:=$anchor$  was_approved:=q.status='approved';$anchor$;
  final_anchor text:=$anchor$  update public.quotes set status='approved',approved_at=accepted_at,job_id=j.id,approved_from_revision=q.edit_revision where id=q.id;$anchor$;
  guard text:=$guard$  -- A saved approval above remains recoverable after its proposal deadline.
  -- Wall time is checked after all parent/quote/token lock waits.
  if q.status<>'approved' and q.expires_at is not null and q.expires_at<=clock_timestamp() then
    raise exception 'This proposal has expired. Contact our office for an updated proposal.' using errcode='23514';
  end if;
$guard$;
  final_guard text:=$guard$  -- Work/material validation can also cross the deadline. Any tentative
  -- work below the first check must roll back before a new acceptance is saved.
  if not was_approved and q.expires_at is not null and q.expires_at<=clock_timestamp() then
    raise exception 'This proposal has expired. Contact our office for an updated proposal.' using errcode='23514';
  end if;
$guard$;
begin
  definition:=pg_get_functiondef('app_private.approve_quote_locked(uuid,integer,text)'::regprocedure);
  if position(guard in definition)>0 and position(final_guard in definition)>0 then return;end if;
  if (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1
    or (length(definition)-length(replace(definition,final_anchor,'')))/length(final_anchor)<>1
    or position(guard in definition)>0 or position(final_guard in definition)>0
    or position('if q.status=''approved'' and q.approved_from_revision is not null then' in definition)=0
    or position('p_expected_revision' in definition)=0 then
    raise exception 'Proposal approval definition changed; review the expiry patch before applying.';
  end if;
  execute replace(replace(definition,anchor,guard||anchor),final_anchor,final_guard||final_anchor);
end $migration$;
notify pgrst,'reload schema';
commit;
