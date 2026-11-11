-- Verified local-primary transition candidate. Apply only in the reviewed runtime cutover.
-- The owner explicitly chose availability independent of backup freshness.
begin;
alter table hosting_guard.state
  add column availability_policy text not null default 'backup-fenced-v1'
    check (availability_policy in ('backup-fenced-v1','local-primary-operation-v1')),
  add column local_operation_observed_at timestamptz;
CREATE OR REPLACE FUNCTION "hosting_guard"."enforce_write"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare s hosting_guard.state%rowtype;
begin
  -- SESSION_USER stays the API/GoTrue/Storage login even inside a business
  -- SECURITY DEFINER command. CURRENT_USER would incorrectly bypass this fence.
  if session_user not in ('postgres','supabase_admin') then
    select * into s from hosting_guard.state where singleton;
    if s.availability_policy = 'local-primary-operation-v1' then
      if not found or not s.topology_verified
        or s.capture_in_progress is distinct from false
        or s.holder is distinct from s.local_node
        or s.database_started_at is distinct from pg_catalog.pg_postmaster_start_time()
        or s.issued_at is null or s.issued_at > pg_catalog.clock_timestamp()
        or s.expires_at is null or s.expires_at <= pg_catalog.clock_timestamp()
        or s.local_operation_observed_at is null
        or s.local_operation_observed_at > s.issued_at
        or s.local_operation_observed_at + interval '14 seconds' <= pg_catalog.clock_timestamp() then
        raise exception 'CRM primary operation is held.' using errcode='PT503';
      end if;
    elsif not found or not s.topology_verified or s.holder is distinct from s.local_node
      or s.database_started_at is distinct from pg_catalog.pg_postmaster_start_time()
      or s.issued_at is null or s.issued_at>pg_catalog.clock_timestamp()
      or s.expires_at is null or s.expires_at<=pg_catalog.clock_timestamp()
      or s.capture_started_at is null
      or s.capture_started_at>pg_catalog.clock_timestamp()
      or s.capture_started_at+interval '5 minutes'<=pg_catalog.clock_timestamp() then
      raise exception 'CRM writes are temporarily unavailable.' using errcode='PT503';
    end if;
  end if;
  if tg_op='DELETE' then return old; else return new; end if;
end $$;


create function hosting_guard.renew_local_primary_operation(
  p_epoch bigint,p_holder text,p_database_boot timestamptz,p_topology text
) returns void language plpgsql security definer set search_path='' as $$
declare s hosting_guard.state%rowtype;t timestamptz:=pg_catalog.clock_timestamp();
begin
  perform hosting_guard.require_operator();
  select * into strict s from hosting_guard.state where singleton for update;
  if s.availability_policy is distinct from 'local-primary-operation-v1'
    or s.capture_in_progress is distinct from false
    or p_epoch is null or p_epoch < s.epoch
    or p_holder is null or p_holder is distinct from s.local_node
    or (p_epoch = s.epoch and s.holder is not null and s.holder is distinct from p_holder)
    or p_database_boot is distinct from pg_catalog.pg_postmaster_start_time()
    or s.topology_verified is distinct from true
    or p_topology is null or p_topology is distinct from s.topology_fingerprint
    or p_topology is distinct from hosting_guard.catalog_fingerprint() then
    raise exception 'Local primary operation not verified.' using errcode='22023';
  end if;
  update hosting_guard.state set epoch=p_epoch,holder=p_holder,
    database_started_at=p_database_boot,issued_at=t,expires_at=t+interval '14 seconds',
    local_operation_observed_at=t where singleton;
  -- capture_started_at is historical backup data. Never refresh it to make an
  -- old backup appear current. This command does not enable any login/worker.
end $$;
alter function hosting_guard.renew_local_primary_operation(bigint,text,timestamptz,text) owner to supabase_admin;
revoke all on function hosting_guard.renew_local_primary_operation(bigint,text,timestamptz,text) from public;
CREATE OR REPLACE FUNCTION "app_private"."fwofficev2_native_context"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
DECLARE
  s hosting_guard.state%ROWTYPE;
  t timestamptz := pg_catalog.clock_timestamp();
  boot timestamptz := pg_catalog.pg_postmaster_start_time();
  deadline timestamptz;
  sid text;
BEGIN
  -- CURRENT_USER is the definer here. Never use a caller-set JWT GUC as identity.
  IF SESSION_USER NOT IN ('ats_firewood_request','ats_firewood_worker','ats_firewood_health')
     OR pg_catalog.current_database() <> 'postgres'
     OR pg_catalog.current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'Native Website identity required.' USING ERRCODE='42501';
  END IF;
  SELECT * INTO s FROM hosting_guard.state WHERE singleton;
  IF s.availability_policy = 'local-primary-operation-v1' THEN
    IF NOT FOUND OR s.topology_verified IS DISTINCT FROM true
       OR s.capture_in_progress IS DISTINCT FROM false
       OR s.holder IS DISTINCT FROM s.local_node OR s.local_node IS NULL
       OR s.database_started_at IS DISTINCT FROM boot
       OR s.epoch IS NULL OR s.epoch < 0
       OR s.topology_fingerprint IS NULL OR s.topology_fingerprint !~ '^[a-f0-9]{32}$'
       OR s.issued_at IS NULL OR s.issued_at > t
       OR s.expires_at IS NULL OR s.expires_at <= t
       OR s.local_operation_observed_at IS NULL
       OR s.local_operation_observed_at > s.issued_at
       OR s.local_operation_observed_at + interval '14 seconds' <= t THEN
      RAISE EXCEPTION 'Local native operation is held.' USING ERRCODE='PT503';
    END IF;
    SELECT system_identifier::text INTO STRICT sid FROM pg_catalog.pg_control_system();
    deadline := least(s.expires_at,s.local_operation_observed_at+interval '14 seconds',t+interval '14 seconds');
    RETURN pg_catalog.jsonb_build_object(
      'admitted',true,'admissionProtocol','local-primary-operation-v1',
      'database',pg_catalog.current_database(),'systemIdentifier',sid,
      'databaseStartedAtMs',floor(extract(epoch FROM boot)*1000)::bigint,
      'leaseEpoch',s.epoch::text,'nodeIdentity',s.local_node,'topologyFingerprint',s.topology_fingerprint,
      'operationObservedAtMs',floor(extract(epoch FROM s.local_operation_observed_at)*1000)::bigint,
      'leaseIssuedAtMs',floor(extract(epoch FROM s.issued_at)*1000)::bigint,
      'expiresAtMs',floor(extract(epoch FROM deadline)*1000)::bigint,
      'observedAtMs',floor(extract(epoch FROM t)*1000)::bigint);
  END IF;

  IF NOT FOUND OR s.topology_verified IS DISTINCT FROM true
     OR s.capture_in_progress IS DISTINCT FROM false
     OR s.holder IS DISTINCT FROM s.local_node OR s.local_node IS NULL
     OR s.database_started_at IS DISTINCT FROM boot
     OR s.epoch IS NULL OR s.epoch < 0
     OR s.topology_fingerprint IS NULL OR s.topology_fingerprint !~ '^[a-f0-9]{32}$'
     OR s.issued_at IS NULL OR s.issued_at > t
     OR s.expires_at IS NULL OR s.expires_at <= t
     OR s.capture_started_at IS NULL OR s.capture_started_at > s.issued_at
     OR s.capture_started_at + interval '280 seconds' <= t THEN
    RAISE EXCEPTION 'Native Website admission pending.' USING ERRCODE='PT503';
  END IF;
  SELECT system_identifier::text INTO STRICT sid FROM pg_catalog.pg_control_system();
  deadline := least(s.expires_at,s.capture_started_at+interval '280 seconds',t+interval '14 seconds');
  RETURN pg_catalog.jsonb_build_object(
    'admitted',true,
    'database',pg_catalog.current_database(),
    'systemIdentifier',sid,
    'databaseStartedAtMs',floor(extract(epoch FROM boot)*1000)::bigint,
    'leaseEpoch',s.epoch::text,
    'nodeIdentity',s.local_node,
    'topologyFingerprint',s.topology_fingerprint,
    'captureStartedAtMs',floor(extract(epoch FROM s.capture_started_at)*1000)::bigint,
    'leaseIssuedAtMs',floor(extract(epoch FROM s.issued_at)*1000)::bigint,
    'expiresAtMs',floor(extract(epoch FROM deadline)*1000)::bigint,
    'observedAtMs',floor(extract(epoch FROM t)*1000)::bigint
  );
END;
$_$;

commit;
