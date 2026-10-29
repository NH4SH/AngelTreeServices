-- Explicit opt-in extension. Legacy native receipts keep unchanged-file pairing.
-- Staging recovery infrastructure only; no business tables or permissions change.
begin;
do $guard$ begin
 if md5(pg_get_functiondef('public.ats_recovery_native_control(jsonb)'::regprocedure))<>'ee585f4f9812e7fea62eb89ecdd635a7'
 then raise exception 'Reviewed native authority required';end if;
end $guard$;
do $patch$
declare d text:=pg_get_functiondef('public.ats_recovery_native_control(jsonb)'::regprocedure);old text;replacement text;
begin
 old:='bytes:=total+32768+jsonb_array_length(objects)*512;';
 replacement:=$replace$if n.binding->>'privateFileFormat'='patch-v1' then
   if coalesce(t->>'fileIndexBytes','')!~'^[0-9]{1,5}$' or (t->>'fileIndexBytes')::bigint<2 or (t->>'fileIndexBytes')::bigint>65536 then raise exception 'Bounded file index reservation required';end if;
  end if;
  bytes:=total+32768+jsonb_array_length(objects)*512+case when n.binding->>'privateFileFormat'='patch-v1' then
   4*(t->>'fileIndexBytes')::bigint+2*coalesce((select octet_length((q.proof->'fileIndex')::text) from ats_recovery_lab.native_jobs q where q.id=n.last_job),0) else 0 end;$replace$;
 if (length(d)-length(replace(d,old,'')))/length(old)<>1 then raise exception 'Unexpected budget definition';end if;d:=replace(d,old,replacement);
 old:='proof:=p->''proof'';';
 replacement:=$replace$proof:=p->'proof';
  if n.binding->>'privateFileFormat'='patch-v1' then
   if proof->>'privateFileStateVerified' is distinct from 'true'
    or jsonb_typeof(proof->'fileIndex') is distinct from 'array' or jsonb_array_length(proof->'fileIndex')>512
    or proof->>'fileIndexBytes' is distinct from j.ticket->>'fileIndexBytes'
    or coalesce(proof->>'fileIndexSha256','')!~'^[a-f0-9]{64}$' or coalesce(proof->>'staticPairSha256','')!~'^[a-f0-9]{64}$'
    or coalesce(proof->>'databaseRuntimeSha256','')!~'^[a-f0-9]{64}$' or coalesce(proof->>'baseManifestSha256','')!~'^[a-f0-9]{64}$'
    or proof->>'privatePairSha256' is distinct from encode(sha256(convert_to('{"kind":"native-wal-file-state-v1","staticSha256":"'||(proof->>'staticPairSha256')||'","fileIndexSha256":"'||(proof->>'fileIndexSha256')||'"}','UTF8')),'hex')
    then raise exception 'Incomplete private file recovery proof';end if;
  end if;$replace$;
 if (length(d)-length(replace(d,old,'')))/length(old)<>1 then raise exception 'Unexpected proof definition';end if;d:=replace(d,old,replacement);
 old:='or proof->>''privatePairSha256'' is distinct from parent.proof->>''privatePairSha256''';
 replacement:=$replace$or (n.binding->>'privateFileFormat' is distinct from 'patch-v1' and proof->>'privatePairSha256' is distinct from parent.proof->>'privatePairSha256')
    or (n.binding->>'privateFileFormat'='patch-v1' and
     (proof->>'staticPairSha256' is distinct from parent.proof->>'staticPairSha256'
      or proof->>'databaseRuntimeSha256' is distinct from parent.proof->>'databaseRuntimeSha256'
      or proof->>'baseManifestSha256' is distinct from parent.proof->>'baseManifestSha256'
      or proof->>'parentFileIndexSha256' is distinct from parent.proof->>'fileIndexSha256'))$replace$;
 if (length(d)-length(replace(d,old,'')))/length(old)<>1 then raise exception 'Unexpected parent definition';end if;d:=replace(d,old,replacement);
 old:='chain:=jsonb_build_object(''version'',1,''kind'',''native-wal-chain-reference''';
 replacement:=$replace$if n.binding->>'privateFileFormat'='patch-v1' then
   claims:=claims||jsonb_build_object('privateFileStateVerified',true,'staticPairSha256',j.proof->>'staticPairSha256','fileIndexSha256',j.proof->>'fileIndexSha256');
  end if;
  chain:=jsonb_build_object('version',1,'kind','native-wal-chain-reference'$replace$;
 if (length(d)-length(replace(d,old,'')))/length(old)<>1 then raise exception 'Unexpected claims definition';end if;d:=replace(d,old,replacement);
 execute d;
end $patch$;
-- Only the per-reservation metadata bound grows. Account/day/payload caps stay.
alter table ats_recovery_lab.native_charges drop constraint native_charges_bytes_check;
alter table ats_recovery_lab.native_charges add constraint native_charges_bytes_check check(bytes>0 and bytes<=135266304);
commit;
