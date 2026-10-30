#!/usr/bin/env python3
"""Local versioned candidate only. Never connects to PostgreSQL or an adapter."""
from pathlib import Path
import hashlib,json

HERE=Path(__file__).resolve().parent
BASE=HERE.parent/'continuous-catalog.select.sql'
EXPECTED='fbb2cf2cc5d5c9469d5ee0af8742d4eb1806a33534c561566588441f087909a8'
source=BASE.read_text()
assert hashlib.sha256(source.encode()).hexdigest()==EXPECTED
out=source
proof=[]
def replace_once(old,new,kind):
    global out
    assert out.count(old)==1,kind
    at=out.index(old)
    out=out[:at]+new+out[at+len(old):]
    proof.append({'kind':kind,'atInStep':at,'old':old,'new':new})

replace_once('), acl AS (','), acl AS MATERIALIZED (','materialize-canonical-acl-once')
replace_once('), role_records AS (',"""), acl_duplicate_count AS MATERIALIZED (
 SELECT count(*)::bigint n FROM(SELECT identity FROM acl GROUP BY identity HAVING count(*)>1)x
), acl_map AS MATERIALIZED (
 -- A duplicate identity produces no lookup map and NULL attestation digests.
 -- There is no last-value-wins authority or permission substitution.
 SELECT coalesce(jsonb_object_agg(identity,record),'{}'::jsonb)records
 FROM acl WHERE(SELECT n FROM acl_duplicate_count)=0
), role_records AS (""",'one-unique-canonical-acl-lookup-map')

relation_key="jsonb_build_array('relation',r.nspname,r.relname)::text"
routine_key="jsonb_build_array('routine',p.nspname,p.proname,pg_get_function_identity_arguments(p.oid))::text"
type_key="jsonb_build_array('type',t.nspname,t.typname)::text"
schema_key="jsonb_build_array('schema',n.nspname)::text"
database_key="jsonb_build_array('database',d.datname)::text"
column_key="jsonb_build_array('column',r.nspname,r.relname,x.attname)::text"
replace_once("'acl',a.record)record FROM rel r JOIN acl a ON a.identity="+relation_key,
             "'acl',a.records->"+relation_key+")record FROM rel r CROSS JOIN acl_map a",
             'relation-access-exact-map-lookup')
replace_once("'owner',pg_get_userbyid(r.relowner),'acl',a.record,'rls'",
             "'owner',pg_get_userbyid(r.relowner),'acl',a.records->"+relation_key+",'rls'",
             'relation-record-exact-map-lookup')
replace_once("'acl',(SELECT z.record FROM acl z WHERE z.identity="+column_key+"))",
             "'acl',a.records->"+column_key+")",'column-exact-map-lookup')
replace_once("FROM rel r JOIN acl a ON a.identity="+relation_key,
             "FROM rel r CROSS JOIN acl_map a",'relation-map-cross-join')
replace_once("'owner',pg_get_userbyid(p.proowner),'acl',a.record,'security_definer'",
             "'owner',pg_get_userbyid(p.proowner),'acl',a.records->"+routine_key+",'security_definer'",
             'routine-exact-map-lookup')
replace_once("FROM proc p JOIN acl a ON a.identity="+routine_key,
             "FROM proc p CROSS JOIN acl_map a",'routine-map-cross-join')
replace_once("SELECT "+schema_key+" identity,a.record FROM ns n\n JOIN acl a ON a.identity="+schema_key,
             "SELECT "+schema_key+" identity,a.records->"+schema_key+" record FROM ns n\n CROSS JOIN acl_map a",
             'namespace-exact-map-lookup')
replace_once("'owner',pg_get_userbyid(t.typowner),'acl',a.record,'defined'",
             "'owner',pg_get_userbyid(t.typowner),'acl',a.records->"+type_key+",'defined'",
             'type-exact-map-lookup')
replace_once("JOIN acl a ON a.identity="+type_key,
             "CROSS JOIN acl_map a",'type-map-cross-join')
replace_once("jsonb_build_object('name',d.datname,'acl',a.record,",
             "jsonb_build_object('name',d.datname,'acl',a.records->"+database_key+",",
             'database-exact-map-lookup')
replace_once("JOIN acl a ON a.identity="+database_key+" WHERE d.datname=current_database()",
             "CROSS JOIN acl_map a WHERE d.datname=current_database()",'database-map-cross-join')

for name,field in [('semanticSchemaSha256','semantic'),('ownerAclSha256','owner_acl'),('guardEnrollmentSha256','guard')]:
    old="'"+name+"',encode(sha256(convert_to("+field+"::text,'UTF8')),'hex')"
    new="'"+name+"',CASE WHEN(SELECT n FROM acl_duplicate_count)=0 THEN encode(sha256(convert_to("+field+"::text,'UTF8')),'hex')ELSE NULL END"
    replace_once(old,new,'duplicate-acl-denies-'+name)
replace_once("'duplicateSemanticIdentities',","'duplicateAclIdentities',(SELECT n FROM acl_duplicate_count),\n 'duplicateSemanticIdentities',",
             'mandatory-duplicate-acl-count')
assert 'JOIN acl a ON'not in out and 'SELECT z.record FROM acl z'not in out
# Reversal proves all other bytes/record definitions and hash inputs unchanged.
inverse=out
for span in reversed(proof):
    at=span['atInStep']
    assert inverse[at:at+len(span['new'])]==span['new'],span['kind']
    inverse=inverse[:at]+span['old']+inverse[at+len(span['new']):]
assert inverse==source
target=HERE/'acl-map-candidate'
target.mkdir(exist_ok=True)
sql=target/'continuous-catalog.select.sql'
sql.write_text(out)
result={'kind':'acl-map-query-optimization-review-only-v1','baseSqlSha256':EXPECTED,
        'candidateSqlSha256':hashlib.sha256(out.encode()).hexdigest(),'candidateBytes':len(out.encode()),
        'inverseBaseSha256':hashlib.sha256(inverse.encode()).hexdigest(),'allOtherSourceBytesPreserved':True,
        'spanCount':len(proof),'spans':proof,'newMandatoryZeroCount':'duplicateAclIdentities',
        'duplicateAclMakesThreeAttestationDigestsNull':True,'nativeSqlExecutionVerified':False,
        'nativeOutputEquivalenceVerified':False,'operativeRecipeModified':False,'productionAdmission':False}
(target/'OPTIMIZATION_SOURCE_PROOF.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({k:v for k,v in result.items()if k!='spans'}))
