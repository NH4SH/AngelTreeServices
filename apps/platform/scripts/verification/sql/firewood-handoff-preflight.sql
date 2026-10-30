-- Read-only catalog evidence. Safe before or after a separately reviewed install.
-- Missing objects mean NOT READY, never an instruction to install or grant access.
begin read only;
with wanted(name) as (values
 ('app_private.firewood_handoff_sources'),('app_private.firewood_handoffs'),
 ('app_private.firewood_handoff_payment_events'),('app_private.firewood_handoff_observations')),
tables as (
 select w.name,c.oid is not null as present,coalesce(c.relrowsecurity,false) as rls,
 coalesce(not exists(select 1 from unnest(array['anon','authenticated','service_role']) r
   where has_table_privilege(r,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')),false) as direct_client_access_closed,
 (select jsonb_agg(t.tgname order by t.tgname) from pg_trigger t where t.tgrelid=c.oid and not t.tgisinternal) as triggers
 from wanted w left join pg_class c on c.oid=to_regclass(w.name)),
wanted_rpc(signature) as (values
 ('public.get_firewood_handoff_context(text)'),('public.prepare_firewood_handoff(text,jsonb,jsonb)'),
 ('public.renew_firewood_handoff(text,uuid,uuid,text,integer,jsonb)'),
 ('public.read_firewood_handoff(text,uuid,uuid,text)'),
 ('public.record_firewood_handoff_observation(text,uuid,uuid,text,text,jsonb)'),
 ('public.get_firewood_collector_context(uuid)')),
rpc as (
 select w.signature,p.oid is not null as present,coalesce(p.prosecdef,false) as security_definer,
 coalesce(not has_function_privilege('anon',p.oid,'EXECUTE') and not has_function_privilege('authenticated',p.oid,'EXECUTE')
   and has_function_privilege('service_role',p.oid,'EXECUTE'),false) as service_role_only,
 case when p.oid is not null then md5(pg_get_functiondef(p.oid)) end as definition_md5,
 p.proconfig as settings
 from wanted_rpc w left join pg_proc p on p.oid=to_regprocedure(w.signature))
select jsonb_build_object(
 'read_only',true,'ready_for_activation',false,
 'tables',(select jsonb_agg(to_jsonb(t)order by t.name)from tables t),
 'commands',(select jsonb_agg(to_jsonb(r)order by r.signature)from rpc r),
 'ordered_refund_ledger_present',to_regclass('app_private.stripe_refund_observations') is not null,
 'backup_fence_installed',to_regclass('hosting_guard.state') is not null,
 'required_next_evidence',jsonb_build_array('exact target and application/migration binding','disabled installation and independent staging credentials',
   'genuine dispute and bank return with terminal cleanup','paired archive restore of all new identity/history tables',
   'five-minute topology-bound write-fencing and one writable collector','reviewed app release and explicit activation')) as evidence;
rollback;
