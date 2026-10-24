-- Run in a caller-owned rollback-only transaction after candidate 122's GRANT.
-- Only synthetic identities and a benign numeric offset are changed. Sending
-- switches remain OFF throughout; no worker, provider, source or history write.
set local lock_timeout='3s';
set local statement_timeout='45s';
create temporary table settings_save_assertions(label text);
create function pg_temp.settings_check(ok boolean,label text)returns void language plpgsql as $$begin
  if ok is distinct from true then raise exception 'Settings save assertion failed: %',label;end if;
  insert into pg_temp.settings_save_assertions values(label);
end $$;
do $test$
declare actor uuid;owner_id uuid;admin_id uuid;disabled_id uuid;separated_id uuid;no_role_id uuid;
  role_name text;column_name text;old_version timestamptz;new_version timestamptz;
  changed integer;denied boolean;original_settings jsonb;baseline_policies jsonb;
  editable text[]:=array['automated_sending_enabled','business_timezone','minimum_send_interval_hours',
    'estimate_confirmation_enabled','estimate_reminder_enabled','estimate_reminder_hours_before',
    'work_confirmation_enabled','work_reminder_enabled','work_reminder_hours_before',
    'quote_follow_up_enabled','quote_first_follow_up_days','quote_second_follow_up_days',
    'invoice_reminder_enabled','invoice_first_reminder_days','invoice_second_reminder_days',
    'payment_confirmation_enabled','appointment_change_notices_enabled'];
begin
  insert into public.roles(name)values('owner'),('admin'),('estimator'),('crew'),('payroll_admin'),('customer'),('property_manager')on conflict(name)do nothing;
  select to_jsonb(s),s.updated_at into original_settings,old_version from public.communication_settings s where singleton;
  perform pg_temp.settings_check(original_settings->>'automated_sending_enabled'='false'and original_settings->>'appointment_change_notices_enabled'='false','both sending switches start OFF');
  foreach column_name in array editable loop
    perform pg_temp.settings_check(has_column_privilege('authenticated','public.communication_settings',column_name,'UPDATE'),'editable column only: '||column_name);
  end loop;
  perform pg_temp.settings_check(not has_table_privilege('authenticated','public.communication_settings','UPDATE'),'no table-wide authenticated UPDATE');
  perform pg_temp.settings_check(not has_table_privilege('authenticated','public.communication_settings','INSERT,DELETE'),'no authenticated insert/delete grant');
  foreach column_name in array array['singleton','created_at','updated_at']loop
    perform pg_temp.settings_check(not has_column_privilege('authenticated','public.communication_settings',column_name,'UPDATE'),'protected column stays unwritable: '||column_name);
  end loop;
  perform pg_temp.settings_check(not has_any_column_privilege('anon','public.communication_settings','UPDATE'),'anonymous role has no editable columns');
  perform pg_temp.settings_check((select relrowsecurity from pg_class where oid='public.communication_settings'::regclass),'RLS remains enabled');
  foreach role_name in array array['owner','admin','estimator','crew','payroll_admin','customer','property_manager','none','disabled','separated']loop
    actor:=gen_random_uuid();
    insert into auth.users(id,email,raw_user_meta_data)values(actor,'settings-'||actor||'@example.invalid','{}');
    update public.profiles set status=case when role_name='disabled'then 'disabled'else 'active'end where id=actor;
    insert into public.employee_records(auth_user_id,legal_name,is_active,employment_status)
      values(actor,'Synthetic settings reviewer',true,'active');
    if role_name='separated'then update public.employee_records set is_active=false,employment_status='separated'where auth_user_id=actor;end if;
    if role_name<>'none'then
      insert into public.user_roles(user_id,role_id)select actor,id from public.roles where name=case when role_name in('disabled','separated')then 'owner'else role_name end;
    end if;
    if role_name='owner'then owner_id:=actor;end if;
    if role_name='admin'then admin_id:=actor;end if;
    perform set_config('request.jwt.claim.sub',actor::text,true);
    -- A forged owner role in JWT metadata cannot replace stored membership.
    perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated','user_metadata',jsonb_build_object('role','owner'))::text,true);
    perform set_config('role','authenticated',true);
    with updated as(update public.communication_settings set minimum_send_interval_hours=minimum_send_interval_hours where singleton returning 1)select count(*)into changed from updated;
    perform set_config('role','none',true);
    perform pg_temp.settings_check(changed=case when role_name in('owner','admin')then 1 else 0 end,role_name||': settings writes follow current stored roles and access');
  end loop;
  select updated_at into new_version from public.communication_settings where singleton;
  perform pg_temp.settings_check(new_version<>old_version,'successful settings write advances native version');
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated')::text,true);perform set_config('role','authenticated',true);
  with updated as(update public.communication_settings set minimum_send_interval_hours=12 where singleton and updated_at=old_version returning 1)select count(*)into changed from updated;
  perform set_config('role','none',true);perform pg_temp.settings_check(changed=0,'stale version updates zero rows');
  perform set_config('role','authenticated',true);
  with updated as(update public.communication_settings set minimum_send_interval_hours=12 where singleton and updated_at=new_version returning singleton,updated_at)select count(*)into changed from updated;
  perform set_config('role','none',true);perform pg_temp.settings_check(changed=1,'exact current version returns one acknowledgement');
  foreach column_name in array array['singleton','created_at','updated_at']loop
    denied:=false;perform set_config('role','authenticated',true);
    begin execute format('update public.communication_settings set %I=%I where singleton',column_name,column_name);exception when insufficient_privilege then denied:=true;end;
    perform set_config('role','none',true);perform pg_temp.settings_check(denied,'owner cannot directly rewrite protected column: '||column_name);
  end loop;
  denied:=false;perform set_config('role','authenticated',true);
  begin update public.communication_settings set minimum_send_interval_hours=0 where singleton;exception when check_violation then denied:=true;end;
  perform set_config('role','none',true);perform pg_temp.settings_check(denied,'database offset constraint remains enforced');
  delete from public.user_roles where user_id=owner_id;
  perform set_config('role','authenticated',true);
  with updated as(update public.communication_settings set minimum_send_interval_hours=24 where singleton returning 1)select count(*)into changed from updated;
  perform set_config('role','none',true);perform pg_temp.settings_check(changed=0,'removing a current owner role denies the old subject');
  perform set_config('request.jwt.claim.sub','',true);perform set_config('request.jwt.claims','{"role":"authenticated","user_metadata":{"role":"owner"}}',true);perform set_config('role','authenticated',true);
  with updated as(update public.communication_settings set minimum_send_interval_hours=24 where singleton returning 1)select count(*)into changed from updated;
  perform set_config('role','none',true);perform pg_temp.settings_check(changed=0,'authenticated role without a subject cannot edit');
  denied:=false;perform set_config('request.jwt.claim.sub',admin_id::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','anon')::text,true);perform set_config('role','anon',true);
  begin update public.communication_settings set minimum_send_interval_hours=24 where singleton;exception when insufficient_privilege then denied:=true;end;
  perform set_config('role','none',true);perform pg_temp.settings_check(denied,'anonymous role with a forged admin subject is denied');
  perform pg_temp.settings_check((select not automated_sending_enabled and not appointment_change_notices_enabled from public.communication_settings where singleton),'both sending switches remain OFF');
  perform pg_temp.settings_check((select to_jsonb(s)-array['minimum_send_interval_hours','updated_at'] from public.communication_settings s where singleton)=original_settings-array['minimum_send_interval_hours','updated_at'],'unrelated settings remain byte-identical');
end $test$;
select jsonb_build_object('syntheticOnly',true,'sendingSwitchesStayedOff',true,'assertions',(select jsonb_agg(label order by label)from settings_save_assertions)) verification;
