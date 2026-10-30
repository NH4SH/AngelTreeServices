"""Pure versioned-candidate fixtures/source checks; no SQL execution."""
from pathlib import Path
import collections, copy, hashlib, importlib.util, json, re, unittest

HERE=Path(__file__).resolve().parent
target=HERE/'acl-map-candidate'
candidate=(target/'continuous-catalog.select.sql').read_text()
proof=json.loads((target/'OPTIMIZATION_SOURCE_PROOF.json').read_bytes())
base=HERE.parent/'continuous-catalog.select.sql'
assert hashlib.sha256(base.read_bytes()).hexdigest()==proof['baseSqlSha256']
assert hashlib.sha256(candidate.encode()).hexdigest()==proof['candidateSqlSha256']
spec=importlib.util.spec_from_file_location('baseline_observer_fixtures',HERE.parent/'test-observer-contract.py')
baseline=importlib.util.module_from_spec(spec);spec.loader.exec_module(baseline)
baseline.SQL=candidate

def map_fixture(rows):
    counts=collections.Counter(identity for identity,record in rows)
    duplicate_count=sum(n>1 for n in counts.values())
    if duplicate_count:return {},duplicate_count,None
    return dict(copy.deepcopy(rows)),0,'synthetic-only-digest'

class Candidate(baseline.Contract):
    def test_02_only_catalog_or_cte_relations(self):
        ctes=set(re.findall(r'\b([a-z_]+)\s+AS\s+(?:MATERIALIZED\s*)?\(',candidate,re.I))
        sources=re.findall(r'\b(?:FROM|JOIN)\s+([a-z_][a-z_0-9]*)',re.sub(r'--[^\n]*','',candidate),re.I)
        self.assertTrue(all(n.lower().startswith('pg_')or n.lower()in ctes or n.lower()in['aclexplode','unnest']for n in sources))
    def test_31_generator_is_offline_and_deterministic(self):
        inverse=candidate
        for span in reversed(proof['spans']):
            at=span['atInStep'];self.assertEqual(inverse[at:at+len(span['new'])],span['new'])
            inverse=inverse[:at]+span['old']+inverse[at+len(span['new']):]
        self.assertEqual(inverse,base.read_text())
        self.assertEqual(hashlib.sha256(inverse.encode()).hexdigest(),proof['baseSqlSha256'])
        self.assertTrue(proof['allOtherSourceBytesPreserved'])
    def test_35_map_is_materialized_and_replaces_all_large_lookup_joins(self):
        self.assertIn('acl AS MATERIALIZED (',candidate)
        self.assertIn('acl_map AS MATERIALIZED (',candidate)
        self.assertIn('acl_duplicate_count AS MATERIALIZED (',candidate)
        self.assertNotIn('JOIN acl a ON',candidate)
        self.assertNotIn('SELECT z.record FROM acl z',candidate)
        self.assertEqual(candidate.count('CROSS JOIN acl_map a'),6)
    def test_36_duplicate_acl_fails_closed(self):
        row=('["column","public","fixture","id"]',{'raw_is_null':True,'entries':[]})
        lookup,count,digest=map_fixture([row,row])
        self.assertEqual(lookup,{})
        self.assertEqual(count,1)
        self.assertIsNone(digest)
        self.assertIn('FROM acl WHERE(SELECT n FROM acl_duplicate_count)=0',candidate)
        self.assertIn("'duplicateAclIdentities',(SELECT n FROM acl_duplicate_count)",candidate)
        self.assertEqual(candidate.count("CASE WHEN(SELECT n FROM acl_duplicate_count)=0 THEN encode(sha256"),3)
    def test_37_exact_lookup_preserves_value_and_null_distinction(self):
        rows=[('column-a',{'raw_is_null':True,'entries':[]}),('column-b',{'raw_is_null':False,'entries':[]}),
              ('routine',{'raw_is_null':False,'entries':copy.deepcopy(baseline.ACL)})]
        lookup,count,digest=map_fixture(rows)
        self.assertEqual(count,0)
        self.assertIsNotNone(digest)
        for identity,record in rows:self.assertEqual(lookup[identity],record)
        self.assertNotEqual(lookup['column-a'],lookup['column-b'])
    def test_38_lookup_map_order_does_not_affect_records(self):
        rows=[('b',{'value':2}),('a',{'value':1})]
        self.assertEqual(map_fixture(rows),map_fixture(list(reversed(rows))))
    def test_39_all_record_definitions_remain_in_source(self):
        for span in proof['spans']:
            self.assertNotIn('definition_sha256',span['old'])
            self.assertNotIn('body_sha256',span['old'])
            self.assertNotIn('configuration_sha256',span['old'])
        self.assertEqual(proof['spanCount'],17)

if __name__=='__main__':
    suite=unittest.defaultTestLoader.loadTestsFromTestCase(Candidate)
    result=unittest.TextTestRunner(verbosity=1).run(suite)
    d={'scope':'Pure synthetic fixture/source/inverse-span tests only; no native SQL/database/provider execution',
       'tests':result.testsRun,'passed':result.wasSuccessful(),'failures':len(result.failures),'errors':len(result.errors),
       'baseSqlSha256':proof['baseSqlSha256'],'candidateSqlSha256':proof['candidateSqlSha256'],
       'nativeOutputEquivalenceVerified':False,'nativePerformanceVerified':False,'operativeRecipeModified':False,
       'productionAdmission':False}
    (target/'PURE_TEST_PROOF.json').write_text(json.dumps(d,indent=2)+'\n')
    print(json.dumps(d))
    raise SystemExit(0 if result.wasSuccessful()else 1)
