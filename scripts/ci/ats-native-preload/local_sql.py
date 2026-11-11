"""Synthetic SQL/commit acceptance in the already owned, networkless fixture.

No captured production schema, settings, rows, activation identity or providers.
The exact candidate migration is a separate digest-checked source file. This is
native primitive acceptance, not full-schema or original-host guardian proof.
"""
from pathlib import Path
import hashlib,json,time

CANDIDATE_SHA='58c40f6662966ccf59306a965c411e8de9a3d94276ce246259cce46d22736b67'
NATIVE_KEYS=['admitted','admissionProtocol','database','systemIdentifier','databaseStartedAtMs','leaseEpoch','nodeIdentity','topologyFingerprint','operationObservedAtMs','leaseIssuedAtMs','expiresAtMs','observedAtMs']

def local_sql_checks(execute,restart,publication,note):
    checks=[]
    def passed(name):checks.append(name)
    def query(q,role='supabase_admin',code=None):
        p=execute(q,role)
        if code:
            assert p.returncode!=0 and code in p.stderr.decode(), 'Expected SQLSTATE '+code
            return None
        assert p.returncode==0,'Synthetic SQL command failed'
        return p.stdout.decode().strip()
    def scalar(q):return query(q)
    def deny(name,q,role='qa_api',code='PT503'):
        query(q,role,code);passed(name)
    def renew():query("SELECT hosting_guard.renew_local_primary_operation(20,'ats-home-primary',pg_postmaster_start_time(),hosting_guard.catalog_fingerprint());")
    def native(role='ats_firewood_request'):return json.loads(query('SELECT app_private.fwofficev2_native_context();',role))
    def good():
        query("UPDATE hosting_guard.state SET availability_policy='local-primary-operation-v1',capture_in_progress=false,topology_verified=true,holder='ats-home-primary',local_node='ats-home-primary',topology_fingerprint=hosting_guard.catalog_fingerprint() WHERE singleton;")
        renew()
    root=Path(__file__).parent
    baseline=(root/'synthetic-baseline.sql').read_bytes()
    candidate=(root/'local-primary-candidate.sql').read_bytes()
    assert hashlib.sha256(candidate).hexdigest()==CANDIDATE_SHA
    # Only this newly initialized fixture administrator can create these roles.
    query(baseline.decode(),'fixture_admin')
    policy="SELECT md5(coalesce(string_agg(to_jsonb(p)::text,'|' ORDER BY schemaname,tablename,policyname),'')) FROM pg_policies p WHERE schemaname='public';"
    acl="SELECT proacl::text FROM pg_proc WHERE oid='app_private.fwofficev2_native_context()'::regprocedure;"
    before_policy,before_acl=scalar(policy),scalar(acl)
    query(candidate.decode())
    assert (scalar(policy),scalar(acl))==(before_policy,before_acl)
    passed('Exact candidate applies without changing synthetic RLS or native function ACL')
    deny('Closed default rejects business write',"INSERT INTO public.qa_records VALUES(1,session_user,'closed');")
    deny('Ordinary login cannot renew operation',"SELECT hosting_guard.renew_local_primary_operation(20,'ats-home-primary',pg_postmaster_start_time(),repeat('a',32));",code='42501')
    query("UPDATE hosting_guard.state SET availability_policy='local-primary-operation-v1',capture_in_progress=false,topology_verified=true,topology_fingerprint=hosting_guard.catalog_fingerprint(),capture_started_at=clock_timestamp()-interval '2 days';")
    renew();passed('Real local renewal succeeds while genuine backup remains two days stale')
    for role in ['ats_firewood_request','ats_firewood_worker','ats_firewood_health']:
        p=native(role)
        assert sorted(p)==sorted(NATIVE_KEYS) and p['leaseEpoch']=='20'
        assert p['admitted'] is True and p['admissionProtocol']=='local-primary-operation-v1'
        assert p['systemIdentifier']==scalar('SELECT system_identifier::text FROM pg_control_system();')
        assert p['operationObservedAtMs']==int(scalar('SELECT floor(extract(epoch FROM local_operation_observed_at)*1000)::bigint FROM hosting_guard.state;'))
        assert p['operationObservedAtMs']==p['leaseIssuedAtMs'] and p['expiresAtMs']<=p['operationObservedAtMs']+14000
        passed(role+' returns exact committed SQL timestamp and twelve-key proof')
    query("INSERT INTO public.qa_records VALUES(1,session_user,'synthetic');",'qa_api')
    assert scalar("SELECT capture_started_at<clock_timestamp()-interval '1 day' FROM hosting_guard.state;")=='t'
    passed('Business write succeeds despite old backup and preserves genuine backup age')
    deny('RLS still denies reassignment',"UPDATE public.qa_records SET owner_role='other' WHERE id=1;",code='42501')
    deny('Ordinary login cannot edit guard state',"UPDATE hosting_guard.state SET expires_at='infinity';",code='42501')
    deny('Ordinary login cannot truncate history','TRUNCATE public.qa_records;',code='42501')
    deny('Duplicate operation remains unique',"INSERT INTO public.qa_records VALUES(1,session_user,'duplicate');",code='23505')
    deny('JWT and SET ROLE cannot impersonate native session',"SET request.jwt.claims='{\"role\":\"ats_firewood_request\"}';SET ROLE ats_firewood_request;SELECT app_private.fwofficev2_native_context();",role='qa_other',code='42501')
    deny('Repeatable-read native transaction denied','BEGIN ISOLATION LEVEL REPEATABLE READ;SELECT app_private.fwofficev2_native_context();',role='ats_firewood_request',code='42501')
    for name,patch in [
        ('Operator hold','capture_in_progress=true'),
        ('Unverified topology','topology_verified=false'),
        ('Wrong database boot',"database_started_at=clock_timestamp()-interval '1 day'"),
        ('Other primary holder',"holder='another-primary'"),
        ('Expired lease',"expires_at=clock_timestamp()-interval '1 second'"),
        ('Future issuance',"issued_at=clock_timestamp()+interval '1 minute'"),
        ('Stale operation despite future expiry',"local_operation_observed_at=clock_timestamp()-interval '15 seconds',issued_at=clock_timestamp()-interval '15 seconds',expires_at=clock_timestamp()+interval '5 seconds'"),
        ('Operation after issuance',"local_operation_observed_at=issued_at+interval '1 second'")]:
        good();query('UPDATE hosting_guard.state SET '+patch+' WHERE singleton;')
        deny(name+' rejects native proof','SELECT app_private.fwofficev2_native_context();',role='ats_firewood_request')
        deny(name+' rejects business write',"UPDATE public.qa_records SET value='forbidden' WHERE id=1;")
    good()
    for name,args in [
        ('Wrong renewal boot',"20,'ats-home-primary',now()-interval '1 day',hosting_guard.catalog_fingerprint()"),
        ('Lower renewal epoch',"19,'ats-home-primary',pg_postmaster_start_time(),hosting_guard.catalog_fingerprint()"),
        ('Different renewal primary',"21,'clone',pg_postmaster_start_time(),hosting_guard.catalog_fingerprint()"),
        ('Changed renewal topology',"20,'ats-home-primary',pg_postmaster_start_time(),repeat('0',32)")]:
        deny(name,'SELECT hosting_guard.renew_local_primary_operation('+args+');',role='supabase_admin',code='22023')
    query('UPDATE hosting_guard.state SET capture_in_progress=true;')
    deny('Operator cannot renew through hold',"SELECT hosting_guard.renew_local_primary_operation(20,'ats-home-primary',pg_postmaster_start_time(),hosting_guard.catalog_fingerprint());",role='supabase_admin',code='22023')
    good()
    # The adapter opens two real competing backend sessions. It waits until the
    # writer reaches pg_sleep, commits a hold, and joins the failed writer.
    publication('concurrent-hold',query)
    assert scalar('SELECT count(*) FROM public.qa_records WHERE id=9;')=='0'
    passed('Concurrent hold before deferred COMMIT rolls back the whole business transaction')
    good()
    query("WITH t AS MATERIALIZED(SELECT clock_timestamp() at) UPDATE hosting_guard.state SET availability_policy='backup-fenced-v1',capture_started_at=t.at,issued_at=t.at,expires_at=t.at+interval '14 seconds' FROM t;")
    p=native();assert 'captureStartedAtMs'in p and 'admissionProtocol'not in p
    passed('Legacy native backup proof shape remains unchanged')
    query("UPDATE hosting_guard.state SET capture_started_at=clock_timestamp()-interval '2 days';")
    deny('Legacy policy still rejects stale backup','SELECT app_private.fwofficev2_native_context();',role='ats_firewood_request')
    good();publication('committed-operation',query)
    passed('Real committed SQL observation passes the JavaScript wall/boot publication bridge')
    old=scalar('SELECT pg_postmaster_start_time()::text;');restart()
    assert scalar('SELECT pg_postmaster_start_time()::text;')!=old
    deny('Database restart rejects old native proof','SELECT app_private.fwofficev2_native_context();',role='ats_firewood_request')
    deny('Database restart rejects old business lease',"UPDATE public.qa_records SET value='old-boot' WHERE id=1;")
    renew();assert native()['admitted']is True
    passed('Explicit operator renewal restores same fixture operation after restart')
    assert scalar(policy)==before_policy and scalar('SELECT count(*) FROM public.qa_records;')=='1'
    passed('RLS policy and original synthetic business history survive failures and restart')
    note('Native local-primary SQL checks: '+str(len(checks)))
    return {'passed':True,'checksPassed':len(checks),'checks':checks,'candidateSha256':CANDIDATE_SHA,'syntheticOnly':True,'fullSchemaAccepted':False,'originalHostGuardianAccepted':False,'restoreAccepted':False}
