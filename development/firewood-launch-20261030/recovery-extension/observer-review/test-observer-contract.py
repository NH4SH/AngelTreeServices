"""Pure fixture/source checks. Does not execute PostgreSQL or any adapter."""
from pathlib import Path
import ast, copy, hashlib, json, re, unittest

HERE=Path(__file__).resolve().parent
SQL=(HERE/'continuous-catalog.select.sql').read_text()
ROOT=HERE.parent.parent

def digest(value):
    # Fixture oracle for invariance tests, NOT a claim to reproduce PG jsonb text.
    return hashlib.sha256(json.dumps(value,sort_keys=True,separators=(',',':')).encode()).hexdigest()

def configuration_digest(value):
    # NULL and [] stay distinct. Native SQL equivalence must be checked by Root.
    return digest(value)

def role_static(role):
    keys=['name','superuser','inherit','create_role','create_database','replication','bypass_rls','connection_limit']
    return {**{key:role[key]for key in keys},'configuration_sha256':configuration_digest(role['configuration'])}

def acl_static(acl,default):
    return {'raw_is_null':acl is None,
            'entries':sorted(copy.deepcopy(default if acl is None else acl),
                             key=lambda a:tuple(str(a[k]).encode()for k in ['grantor','grantee_kind','grantee','privilege','grantable']))}

def inventory_digest(names):
    assert len(set(names))==len(names)
    assert all(re.fullmatch(r'(?:public|app_private|auth|storage|supabase_migrations)\.[A-Za-z_][A-Za-z0-9_$]*',n)for n in names)
    return hashlib.sha256(json.dumps(sorted(names,key=lambda n:n.encode()),ensure_ascii=True,separators=(',',':')).encode()).hexdigest()

def map_fixture(rows):
    seen={}
    duplicates=set()
    for identity,record in rows:
        if identity in seen:duplicates.add(identity)
        seen[identity]=record
    if duplicates:return {},len(duplicates),None
    return copy.deepcopy(seen),0,'synthetic-only-digest'

def guard_valid(triggers):
    expected={'ats_hosting_admission':(31,'enforce_write',False,False,False),
              'ats_hosting_commit':(29,'enforce_write',True,True,True),
              'ats_hosting_truncate':(34,'operator_truncate_only',False,False,False)}
    if len(triggers)!=3 or {t['name']for t in triggers}!=set(expected):return False
    for t in triggers:
        if t['enabled']!='O' or t['args']or t['qualification']is not None or t['attributes']or t['old']is not None or t['new']is not None:return False
        if t['function_schema']!='hosting_guard' or t['function_arguments']!='':return False
        if tuple(t[k]for k in ['type','function_name','deferrable','deferred','constraint'])!=expected[t['name']]:return False
    return True

ROLE={'name':'synthetic_request','superuser':False,'inherit':False,'create_role':False,'create_database':False,
      'replication':False,'bypass_rls':False,'connection_limit':-1,'configuration':None,'can_login':False,
      'valid_until':'2026-01-01','oid':1234}
ACL=[{'grantor':'owner','grantee_kind':'role','grantee':'synthetic_request','privilege':'SELECT','grantable':False},
     {'grantor':'owner','grantee_kind':'public','grantee':'PUBLIC','privilege':'SELECT','grantable':False}]
TRIGGERS=[{'name':name,'type':bits,'function_schema':'hosting_guard','function_name':fn,'function_arguments':'',
           'enabled':'O','deferrable':defer,'deferred':defer,'constraint':defer,'args':b'',
           'qualification':None,'attributes':'','old':None,'new':None}
          for name,bits,fn,defer in [('ats_hosting_admission',31,'enforce_write',False),
                                    ('ats_hosting_commit',29,'enforce_write',True),
                                    ('ats_hosting_truncate',34,'operator_truncate_only',False)]]

class Contract(unittest.TestCase):
    def test_01_read_only_single_select_source(self):
        clean=re.sub(r'--[^\n]*','',SQL)
        clean=re.sub(r"'(?:[^']|'')*'", "''", clean)
        clean=re.sub(r'"(?:[^"]|"")*"', '""', clean)
        self.assertFalse(re.search(r'\b(?:insert|update|delete|truncate|create|alter|drop|grant|revoke|copy|call|do)\b',clean,re.I))
        self.assertEqual(clean.count(';'),1)
        self.assertTrue(clean.lstrip().startswith('WITH'))
    def test_02_only_catalog_or_cte_relations(self):
        ctes=set(re.findall(r'\b([a-z_]+)\s+AS\s+(?:MATERIALIZED\s*)?\(',SQL,re.I))
        sources=re.findall(r'\b(?:FROM|JOIN)\s+([a-z_][a-z_0-9]*)',re.sub(r'--[^\n]*','',SQL),re.I)
        self.assertTrue(all(n.lower().startswith('pg_')or n.lower()in ctes or n.lower()in['aclexplode','unnest']for n in sources))
    def test_03_no_raw_record_output(self):
        final=SQL[SQL.rfind('SELECT jsonb_build_object('):]
        self.assertIn("'semanticSchemaSha256'",final)
        self.assertIn("'guardEnrollmentSha256'",final)
        self.assertIn("'ownerAclSha256'",final)
        self.assertNotIn(',records',final)
        self.assertNotIn('rolconfig',final)
        self.assertNotIn('prosrc',final)
    def test_04_role_config_hashed_server_side(self):
        self.assertIn("sha256(convert_to(coalesce(to_jsonb(r.rolconfig),'null'::jsonb)::text,'UTF8'))",SQL)
        self.assertIn("sha256(convert_to(coalesce(to_jsonb(p.proconfig),'null'::jsonb)::text,'UTF8'))",SQL)
        self.assertIn("sha256(convert_to(coalesce(to_jsonb(s.setconfig),'null'::jsonb)::text,'UTF8'))",SQL)
        self.assertNotRegex(SQL,r"'configuration'\s*,\s*(?:r\.rolconfig|p\.proconfig|s\.setconfig)")
    def test_05_only_operational_role_values_excluded(self):
        role_block=SQL.split('), role_records AS (',1)[1].split('), bootstrap_records AS (',1)[0]
        self.assertNotIn('rolcanlogin',role_block)
        self.assertNotIn('rolvaliduntil',role_block)
        for field in ['rolsuper','rolinherit','rolcreaterole','rolcreatedb','rolreplication','rolbypassrls','rolconnlimit','rolconfig']:
            self.assertIn(field,role_block)
    def test_06_login_change_static_invariant(self):
        other={**ROLE,'can_login':True}
        self.assertEqual(role_static(ROLE),role_static(other))
    def test_07_validity_change_static_invariant(self):
        self.assertEqual(role_static(ROLE),role_static({**ROLE,'valid_until':None}))
    def test_08_ordinary_oid_change_static_invariant(self):
        self.assertEqual(role_static(ROLE),role_static({**ROLE,'oid':9999}))
    def test_09_bootstrap_identity_is_not_normalized_away(self):
        self.assertIn("r.oid=10",SQL)
        self.assertIn("'bootstrap-role'",SQL)
        self.assertNotEqual(digest({'name':'supabase_admin'}),digest({'name':'other_operator'}))
    def test_10_privilege_change_changes_static(self):
        for field in ['superuser','inherit','create_role','create_database','replication','bypass_rls']:
            self.assertNotEqual(role_static(ROLE),role_static({**ROLE,field:not ROLE[field]}))
    def test_11_connection_limit_changes_static(self):
        self.assertNotEqual(role_static(ROLE),role_static({**ROLE,'connection_limit':3}))
    def test_12_null_config_distinct(self):
        self.assertNotEqual(configuration_digest(None),configuration_digest([]))
    def test_13_acl_order_is_not_authority(self):
        self.assertEqual(acl_static(ACL,[]),acl_static(list(reversed(ACL)),[]))
    def test_14_acl_grantor_preserved(self):
        other=copy.deepcopy(ACL);other[0]['grantor']='other'
        self.assertNotEqual(acl_static(ACL,[]),acl_static(other,[]))
    def test_15_acl_grant_option_preserved(self):
        other=copy.deepcopy(ACL);other[0]['grantable']=True
        self.assertNotEqual(acl_static(ACL,[]),acl_static(other,[]))
    def test_16_null_acl_distinct_even_when_effective_same(self):
        self.assertNotEqual(acl_static(None,ACL),acl_static(ACL,ACL))
    def test_16a_explicit_empty_acl_does_not_expand_defaults(self):
        self.assertEqual(acl_static([],ACL),{'raw_is_null':False,'entries':[]})
        self.assertNotEqual(acl_static([],ACL),acl_static(None,ACL))
    def test_16b_zero_dimension_acl_never_passed_to_aclexplode(self):
        self.assertIn("CASE WHEN cardinality(i.acl)>0 THEN i.acl",SQL)
        self.assertIn("WHEN i.acl IS NULL AND i.default_kind IS NOT NULL THEN acldefault(i.default_kind,i.owner_oid)",SQL)
        self.assertIn("ELSE NULL::aclitem[] END",SQL)
        self.assertNotIn("THEN '{}'::aclitem[]",SQL)
    def test_17_public_is_distinct_from_role_named_public(self):
        other=copy.deepcopy(ACL);other[1]['grantee_kind']='role'
        self.assertNotEqual(acl_static(ACL,[]),acl_static(other,[]))
    def test_18_inventory_order_locale_independent(self):
        names=['public.z_a','public.za','public.A_b','auth.users']
        self.assertEqual(inventory_digest(names),inventory_digest(list(reversed(names))))
        self.assertIn('COLLATE "C"',SQL)
    def test_19_same_count_replacement_changes_inventory(self):
        self.assertNotEqual(inventory_digest(['public.a','public.b']),inventory_digest(['public.a','public.c']))
    def test_20_non_ascii_inventory_rejected_by_model(self):
        with self.assertRaises(AssertionError):inventory_digest(['public.é'])
    def test_21_raw_function_crlf_changes_digest(self):
        self.assertNotEqual(hashlib.sha256(b'BEGIN\r\nEND').hexdigest(),hashlib.sha256(b'BEGIN\nEND').hexdigest())
        self.assertIn("sha256(convert_to(p.prosrc,'UTF8'))",SQL)
        self.assertNotIn("replace(p.prosrc",SQL)
    def test_22_policy_role_order_canonical(self):
        roles=['PUBLIC','synthetic_request']
        self.assertEqual(digest(sorted(roles)),digest(sorted(reversed(roles))))
        self.assertIn("'using_sha256'",SQL);self.assertIn("'check_sha256'",SQL)
    def test_23_valid_guard_triplet(self):
        self.assertTrue(guard_valid(TRIGGERS))
    def test_24_disabled_guard_rejected(self):
        other=copy.deepcopy(TRIGGERS);other[0]['enabled']='D';self.assertFalse(guard_valid(other))
    def test_25_wrong_timing_or_events_rejected(self):
        for index in range(3):
            other=copy.deepcopy(TRIGGERS);other[index]['type']+=1;self.assertFalse(guard_valid(other))
    def test_26_deferred_commit_required(self):
        for field in ['deferrable','deferred','constraint']:
            other=copy.deepcopy(TRIGGERS);other[1][field]=False;self.assertFalse(guard_valid(other))
    def test_27_wrong_function_rejected(self):
        other=copy.deepcopy(TRIGGERS);other[0]['function_name']='other';self.assertFalse(guard_valid(other))
    def test_28_extra_guard_rejected(self):
        self.assertFalse(guard_valid(TRIGGERS+TRIGGERS[:1]))
    def test_29_qualification_or_arguments_rejected(self):
        for field,value in [('args',b'x'),('qualification','true'),('attributes','1'),('old','rows'),('new','rows')]:
            other=copy.deepcopy(TRIGGERS);other[0][field]=value;self.assertFalse(guard_valid(other))
    def test_30_exact_actual_named_scope(self):
        approved=json.loads((ROOT/'native-full-baseline/V3_APPROVED_NAMED_SOURCE_INVENTORY.json').read_bytes())
        self.assertEqual(len(approved['protectedTableNames']),175)
        self.assertEqual(len(approved['captureTableNames']),176)
        self.assertNotIn('supabase_migrations.schema_migrations',approved['protectedTableNames'])
        self.assertIn('supabase_migrations.schema_migrations',approved['captureTableNames'])
        self.assertNotEqual(inventory_digest(approved['protectedTableNames']),inventory_digest(approved['captureTableNames']))
    def test_31_generator_is_offline_and_deterministic(self):
        source=(HERE/'build-observers.py').read_text();tree=ast.parse(source)
        value=next(n.value.value for n in tree.body if isinstance(n,ast.Assign)and any(isinstance(t,ast.Name)and t.id=='SQL'for t in n.targets))
        self.assertEqual(value,SQL)
        self.assertFalse(any(x in source for x in ['subprocess','socket','requests','psycopg','getenv','ssh','limactl']))
    def test_32_file_components_unbound(self):
        self.assertNotIn("'documentFamilySha256'",SQL)
        self.assertNotIn("'releaseComponentDigest'",SQL)
    def test_33_unique_category_frames_and_guard_scope(self):
        self.assertIn("jsonb_build_array('acl-projection',identity)::text",SQL)
        self.assertIn("'duplicateSemanticIdentities'",SQL)
        self.assertIn("'ledgerGuardTriggers'",SQL)
        self.assertIn("'unsupportedInventoryNames'",SQL)
        self.assertIn("r.nspname IN('public','app_private','auth','storage')",SQL)
    def test_34_locale_and_sequence_ownership_are_static(self):
        for field in ['datcollate','datctype','datlocprovider','datcollversion','dep.deptype']:
            if field=='dep.deptype':self.assertIn("d.deptype IN('a','i')",SQL)
            else:self.assertIn(field,SQL)
        self.assertIn("to_jsonb(d)->>'datlocale'",SQL)
    def test_35_map_is_materialized_and_replaces_large_lookup_joins(self):
        self.assertIn('acl AS MATERIALIZED (',SQL)
        self.assertIn('acl_map AS MATERIALIZED (',SQL)
        self.assertIn('acl_duplicate_count AS MATERIALIZED (',SQL)
        self.assertNotIn('JOIN acl a ON',SQL)
        self.assertNotIn('SELECT z.record FROM acl z',SQL)
        self.assertEqual(SQL.count('CROSS JOIN acl_map a'),6)
    def test_36_duplicate_acl_denies_three_digests(self):
        row=('column',{'raw_is_null':True,'entries':[]})
        self.assertEqual(map_fixture([row,row]),({},1,None))
        self.assertIn('FROM acl WHERE(SELECT n FROM acl_duplicate_count)=0',SQL)
        self.assertIn("'duplicateAclIdentities',(SELECT n FROM acl_duplicate_count)",SQL)
        self.assertEqual(SQL.count("CASE WHEN(SELECT n FROM acl_duplicate_count)=0 THEN encode(sha256"),3)
    def test_37_lookup_preserves_all_acl_record_values(self):
        rows=[('a',{'raw_is_null':True,'entries':[]}),('b',{'raw_is_null':False,'entries':[]}),
              ('routine',{'raw_is_null':False,'entries':copy.deepcopy(ACL)})]
        lookup,count,result=map_fixture(rows)
        self.assertEqual(count,0)
        self.assertIsNotNone(result)
        for identity,record in rows:self.assertEqual(lookup[identity],record)
        self.assertNotEqual(lookup['a'],lookup['b'])
        self.assertEqual(map_fixture(rows),map_fixture(list(reversed(rows))))
    def test_38_old_recipe_and_inverse_source_proof_preserved(self):
        proof=json.loads((HERE/'performance-only/acl-map-candidate/OPTIMIZATION_SOURCE_PROOF.json').read_bytes())
        old=(HERE/'history-before-acl-map-v2/continuous-catalog.select.sql').read_text()
        inverse=SQL
        for span in reversed(proof['spans']):
            at=span['atInStep'];self.assertEqual(inverse[at:at+len(span['new'])],span['new'])
            inverse=inverse[:at]+span['old']+inverse[at+len(span['new']):]
        self.assertEqual(inverse,old)
        self.assertEqual(hashlib.sha256(old.encode()).hexdigest(),'fbb2cf2cc5d5c9469d5ee0af8742d4eb1806a33534c561566588441f087909a8')
        self.assertEqual(hashlib.sha256(SQL.encode()).hexdigest(),'2bfb48790f2fd52f8e2457b07f6480f46d3ab06f296659a720a676a8c0759456')
    def test_39_root_native_five_hashes_and_original_counts_equal(self):
        reference=json.loads((HERE/'NATIVE_REFERENCE_EQUIVALENCE_PROOF.json').read_bytes())
        optimized=json.loads((HERE/'NATIVE_ACL_MAP_PERFORMANCE_PROOF.json').read_bytes())
        self.assertTrue(reference['passed']and optimized['passed'])
        self.assertTrue(reference['allFiveDigestsAndOriginalCountsEquivalent'])
        self.assertEqual(reference['querySha256'],'fbb2cf2cc5d5c9469d5ee0af8742d4eb1806a33534c561566588441f087909a8')
        self.assertEqual(optimized['querySha256'],hashlib.sha256(SQL.encode()).hexdigest())
        self.assertEqual(reference['targetId'],optimized['targetId'])
        self.assertEqual(reference['qaSid'],optimized['qaSid'])
        self.assertNotEqual(reference['qaSid'],'7701955335415689249')
        keys=['semanticSchemaSha256','ownerAclSha256','guardEnrollmentSha256','protectedInventorySha256','captureInventorySha256']
        for key in keys:self.assertEqual(reference['result'][key],optimized['result'][key])
        old_counts=reference['result']['counts']
        new_counts=dict(optimized['result']['counts'])
        self.assertEqual(new_counts.pop('duplicateAclIdentities'),0)
        self.assertEqual(old_counts,new_counts)
        self.assertLess(optimized['elapsedMs'],5000)
        self.assertEqual(reference['operativeStatementBoundMs'],5000)
        self.assertTrue(reference['jitDisabledForProbe']and optimized['jitDisabledForProbe'])
        self.assertTrue(reference['baselineStillKnownAclMismatch']and optimized['baselineStillKnownAclMismatch'])
        self.assertFalse(reference['productionAdmission']or optimized['productionAdmission'])
    def test_40_native_query_evidence_does_not_bind_production(self):
        contract=json.loads((HERE/'OBSERVER_CONTRACT_UNBOUND.json').read_bytes())
        self.assertEqual(contract['recipeVersion'],2)
        self.assertEqual(contract['recipeSqlSha256'],hashlib.sha256(SQL.encode()).hexdigest())
        self.assertEqual(contract['state'],'UNBOUND')
        self.assertTrue(all(value is None for value in contract['expectedProduction'].values()))
        self.assertIn('duplicateAclIdentities',contract['mandatoryZeroCounts'])
        self.assertEqual(contract['callerRequirements']['statementTimeoutMs'],5000)
        self.assertEqual(contract['callerRequirements']['jit'],'off')
        self.assertFalse(contract['operativeAdapterWired']or contract['productionAdmission'])

if __name__=='__main__':
    suite=unittest.defaultTestLoader.loadTestsFromTestCase(Contract)
    result=unittest.TextTestRunner(verbosity=1).run(suite)
    proof={'scope':'Pure synthetic fixture and SQL/Python source inspection; no native query/VM/HOME/provider execution',
           'tests':result.testsRun,'passed':result.wasSuccessful(),'failures':len(result.failures),'errors':len(result.errors),
           'sqlSha256':hashlib.sha256(SQL.encode()).hexdigest(),'nativeSqlExecutionVerifiedByAuthor':False,
           'nativeQueryEquivalenceVerifiedByRoot':True,'rootNativeBaselineStillKnownAclMismatch':True,
           'nativeFullSourcePostimageVerified':False,
           'operativeAdapterWired':False,'expectedProductionDigests':None,'productionAdmission':False}
    (HERE/'PURE_TEST_PROOF.json').write_text(json.dumps(proof,indent=2)+'\n')
    print(json.dumps(proof))
    raise SystemExit(0 if result.wasSuccessful()else 1)
