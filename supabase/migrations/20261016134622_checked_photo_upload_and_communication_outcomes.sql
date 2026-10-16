-- PR10: mandatory photo history in the existing metadata transaction. No historical backfill.
create function app_private.audit_job_photo_upload()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is not null and (not app_private.effective_platform_access(auth.uid())
      or new.uploaded_by_user_id is distinct from auth.uid()) then
    raise exception 'Photo uploads must record the active signed-in uploader.' using errcode='42501';
  end if;
  insert into public.activity_log(actor_user_id,actor_type,subject_type,subject_id,event_type,idempotency_key,metadata_json)
  values(new.uploaded_by_user_id,case when new.uploaded_by_user_id is null then 'system' else 'staff' end,
    'job',new.job_id,'job_photo_uploaded','job-photo-uploaded/'||new.id,
    jsonb_build_object('photo_id',new.id,'photo_type',new.photo_type));
  return new;
end;
$$;
revoke all on function app_private.audit_job_photo_upload() from public,anon,authenticated,service_role;
create trigger job_photos_required_upload_audit after insert on public.job_photos
  for each row execute function app_private.audit_job_photo_upload();

-- An expired processing lease is an uncertain delivery, not permission to send
-- again. Reconcile known acceptance; otherwise leave it failed for review. PR14
-- will supply durable attempts/payloads; this guard introduces no new attempt schema.
create or replace function public.claim_due_customer_communications(p_limit integer default 20)
returns setof public.customer_communications language plpgsql security invoker set search_path='' as $$
begin
  with stale as (
    select id from public.customer_communications where status='processing'
      and processing_started_at<now()-interval '15 minutes'
      order by id for update skip locked
  ), known as (
    select s.id,(select jsonb_build_object('id',e.provider_message_id,'at',e.sent_at)
      from public.email_events e where e.related_communication_id=s.id and e.status='sent'
        and e.provider_message_id is not null order by e.created_at desc,e.id desc limit 1) receipt
    from stale s
  ) update public.customer_communications c set
    status=case when k.receipt is null then 'failed' else 'sent' end,
    provider_message_id=coalesce(k.receipt->>'id',c.provider_message_id),
    sent_at=coalesce((k.receipt->>'at')::timestamptz,c.sent_at),processing_started_at=null,
    last_error=case when k.receipt is null then 'Delivery could not be confirmed. Review provider history before sending again.' else null end,
    skip_reason=case when k.receipt is null then 'Delivery outcome needs review; automatic retry was stopped.' else null end
  from known k where c.id=k.id;
  return query with candidates as (
    select id from public.customer_communications where status='pending' and scheduled_for<=now()
    order by scheduled_for,created_at for update skip locked limit least(greatest(p_limit,1),50)
  ) update public.customer_communications c set status='processing',processing_started_at=clock_timestamp(),
      attempt_count=c.attempt_count+1,last_error=null,skip_reason=null
    from candidates x where c.id=x.id returning c.*;
end;
$$;
revoke all on function public.claim_due_customer_communications(integer) from public,anon,authenticated;
grant execute on function public.claim_due_customer_communications(integer) to service_role;
notify pgrst,'reload schema';
