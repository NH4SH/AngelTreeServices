// Compile a SEPARATE native authority from the reviewed protocol. No connection
// or installation occurs here. Its caller must verify the exact empty project,
// owner approval and account-wide carried-forward transfer reservations first.
import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
const files=['native-wal-ledger.sql','native-wal-verification-lease.sql','native-wal-inventory-prefix.sql','native-wal-file-patch.sql','native-chain-retention.sql'];
export function primaryBackupSchema(){
 const inputs=[],parts=[];
 for(const name of files){const source=fs.readFileSync(new URL('./'+name,import.meta.url),'utf8');inputs.push({name,sha256:createHash('sha256').update(source).digest('hex')});
  // Original hash guards bind the staging names, so they cannot describe this
  // newly created schema. All guarded edits retain their exact occurrence checks.
  let sql=source.replace(/do \$guard\$[\s\S]*?end \$guard\$;/,'').replace(/^begin;$/gm,'').replace(/^commit;$/gm,'');
  for(const[from,to]of [['ats_recovery_lab','ats_home_backup'],['ats_recovery_native','ats_home_native'],['ats-rehearsal-continuous-','ats-home-continuous-'],['crm-native-lab-','crm-native-home-'],['ats_crm_candidate_20261027','ats_crm_primary_20261029'],['/home/noelsierra.guest/candidate/','/home/noelsierra.guest/primary/']])sql=sql.replaceAll(from,to);
  if(name==='native-wal-ledger.sql'){
   const anchor="if action='configure' then\n";assert.equal(sql.split(anchor).length,3);
   sql=sql.replace(anchor,anchor+"  if p->'binding'->>'environment' is distinct from 'home-primary-v1' or p->'binding'->>'sourceMigrationCount' is distinct from '102' or p->'binding'->>'captureMode' is distinct from 'transaction-barrier' or p->'binding'->>'privateFileFormat' is distinct from 'patch-v1' or p->'binding'->>'admissionProtocol' is distinct from 'certified-native-wal-v1' then raise exception 'Explicit home primary binding required';end if;\n");
  }
  if(name==='native-wal-verification-lease.sql'){
   // The production account pool is distinct from the capped rehearsal pool.
   // 3.5 GiB INCLUDES an owner-installed reserve for existing account usage,
   // leaving over 1 GB below the verified 5 GB uncached free allowance.
   assert.equal(sql.split("'>3221225472'").length,2);
   sql=sql.replace("'>3221225472'","'>3758096384'");
  }
  if(name==='native-chain-retention.sql'){
   // Do not duplicate the full growing catalog in every small retired job.
   // The ledger retains its original rows; keep a bound, digestible observation.
   const observed='values(ns,j.id,inventory,snapshot)';assert.equal(sql.split(observed).length,2);
   sql=sql.replace(observed,"values(ns,j.id,inventory,jsonb_build_object('kind','native-retention-observation-v1','namespace',ns,'headJobId',n.last_job,'bindingSha256',snapshot->>'bindingSha256','jobs',jsonb_array_length(snapshot->'jobs'),'snapshotSha256',encode(sha256(convert_to(snapshot::text,'UTF8')),'hex')))");
   const anchor="'pinned',(select";assert.equal(sql.split(anchor).length,2);
   sql=sql.replace(anchor,"'retiredJobIds',(select coalesce(jsonb_agg(r.job_id order by r.job_id),'[]') from ats_home_backup.native_retirements r where r.namespace=n.namespace and r.completed_at is not null),\n 'pinned',(select");
   const bound='(select count(*) from ats_home_backup.native_jobs where namespace=ns)>8192';assert.equal(sql.split(bound).length,2);sql=sql.replace(bound,bound.replace('8192','65536'));
   const comparison="if p->'snapshot' is distinct from snapshot then";assert.equal(sql.split(comparison).length,2);
   sql=sql.replace(comparison,"if ((p->'snapshot')-'retiredJobIds') is distinct from (snapshot-'retiredJobIds') then");
  }
  parts.push(sql);
 }
 const preamble=`begin;
create schema ats_home_backup authorization postgres;
revoke all on schema ats_home_backup from public,anon,authenticated,service_role;
-- Carry-forward accounting is installed by the owner before enabling a source.
create table ats_home_backup.budgets(namespace text,period text,reserved_bytes bigint not null check(reserved_bytes>=0),primary key(namespace,period));
alter table ats_home_backup.budgets enable row level security;
revoke all on ats_home_backup.budgets from public,anon,authenticated,service_role;
`;
 const singleWriter=`
-- Meter retention replies too; an otherwise cheap cleanup must not evade the
-- same account-wide free-capacity reservation that protects backup admission.
alter function public.ats_home_native_retention(jsonb) set schema ats_home_backup;
alter function ats_home_backup.ats_home_native_retention(jsonb) rename to native_retention_command;
revoke all on function ats_home_backup.native_retention_command(jsonb) from public,anon,authenticated,service_role;
create function public.ats_home_native_retention(p jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,ats_home_backup as $meter$
declare result jsonb;amount bigint;prior_bytes bigint;head uuid;at timestamptz:=clock_timestamp();
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role required' using errcode='42501';end if;
 select last_job into strict head from ats_home_backup.native_sources where namespace=p->>'namespace' for update;
 if head is null then raise exception 'Verified recovery head required';end if;
 result:=ats_home_backup.native_retention_command(p);amount:=octet_length(result::text)+8192;
 if amount>33554432 then raise exception 'Retention catalog exceeds its reviewed transfer bound';end if;
 perform pg_advisory_xact_lock(178214,4280);
 select coalesce(sum(reserved_bytes),0) into prior_bytes from ats_home_backup.budgets where period in('m:'||to_char(at,'YYYY-MM'),'m:'||to_char(at-interval '1 month','YYYY-MM'));
 if prior_bytes+(select coalesce(sum(bytes),0) from ats_home_backup.native_charges where charged_at>at-interval '31 days')+amount>3758096384 then raise exception 'Account recovery budget exhausted';end if;
 select coalesce(sum(reserved_bytes),0) into prior_bytes from ats_home_backup.budgets where period in('d:'||to_char(at,'YYYY-MM-DD'),'d:'||to_char(at-interval '1 day','YYYY-MM-DD'));
 if prior_bytes+(select coalesce(sum(bytes),0) from ats_home_backup.native_charges where charged_at>at-interval '24 hours')+amount>536870912 then raise exception 'Daily recovery budget exhausted';end if;
 insert into ats_home_backup.native_charges(job_id,bytes) values(head,amount);return result;
end $meter$;
revoke all on function public.ats_home_native_retention(jsonb) from public,anon,authenticated;
grant execute on function public.ats_home_native_retention(jsonb) to service_role;
create unique index native_one_enabled_writer on ats_home_backup.native_sources((true)) where enabled;
create function ats_home_backup.require_single_writer() returns trigger language plpgsql security definer set search_path=pg_catalog,ats_home_backup as $writer$
declare latest_generation bigint;last_expiry timestamptz;
begin
 if new.enabled and not old.enabled then
  perform pg_advisory_xact_lock(178214,4410);
  select max((claims->>'generation')::bigint),max((claims->>'expiresAt')::timestamptz) into latest_generation,last_expiry
    from ats_home_backup.native_admissions where namespace<>new.namespace;
  if latest_generation is not null and (new.binding->>'generation')::bigint<=latest_generation then raise exception 'A newer writer generation is required';end if;
  if last_expiry is not null and last_expiry+interval '20 seconds'>clock_timestamp() then raise exception 'Previous writer deadline has not passed';end if;
 end if;
 return new;
end $writer$;
revoke all on function ats_home_backup.require_single_writer() from public,anon,authenticated,service_role;
create trigger native_single_writer before update of enabled on ats_home_backup.native_sources for each row execute function ats_home_backup.require_single_writer();
commit;
`;
 const sql=preamble+parts.join('\n')+singleWriter;
 assert.ok(!sql.includes('ats_recovery_lab')&&!sql.includes('ats_crm_candidate_20261027')&&!sql.includes('ats_staging_auth'));
 return {sql,inputs,sha256:createHash('sha256').update(sql).digest('hex'),installationPerformed:false};
}
