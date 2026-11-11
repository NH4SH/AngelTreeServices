import hashlib,importlib.util,pathlib,unittest
path=pathlib.Path(__file__).with_name('probe.py');spec=importlib.util.spec_from_file_location('public_probe',path);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
sha=lambda x:hashlib.sha256(x.encode()).hexdigest()
class Tests(unittest.TestCase):
    def test_unquoted_vendor_style(self):
        raw=b'ALTER ROLE authenticator SET session_preload_libraries TO fixture_a,fixture_b;'
        self.assertEqual(m.public_preload(raw,sha('fixture_a,fixture_b'),hashlib.sha256(raw).hexdigest()),'fixture_a,fixture_b')
    def test_fixed_alter_role(self):
        raw=b"ALTER ROLE authenticator SET session_preload_libraries TO 'fixture_a,fixture_b';"
        self.assertEqual(m.public_preload(raw,sha('fixture_a,fixture_b'),hashlib.sha256(raw).hexdigest()),'fixture_a,fixture_b')
    def test_equals_and_case(self):
        raw=b"alter role authenticator set session_preload_libraries='fixture_a';"
        self.assertEqual(m.public_preload(raw,sha('fixture_a'),hashlib.sha256(raw).hexdigest()),'fixture_a')
    def test_duplicate_denied(self):
        raw=b"ALTER ROLE authenticator SET session_preload_libraries='fixture_a';"*2
        with self.assertRaises(AssertionError):m.public_preload(raw,sha('fixture_a'),hashlib.sha256(raw).hexdigest())
    def test_source_change_denied(self):
        raw=b"ALTER ROLE authenticator SET session_preload_libraries='fixture_a';"
        with self.assertRaises(AssertionError):m.public_preload(raw+b' ',sha('fixture_a'),hashlib.sha256(raw).hexdigest())
    def test_changed_value_denied(self):
        raw=b"ALTER ROLE authenticator SET session_preload_libraries='fixture_b';"
        with self.assertRaises(AssertionError):m.public_preload(raw,sha('fixture_a'),hashlib.sha256(raw).hexdigest())
    def test_sql_quote_decoding(self):
        raw=b"ALTER ROLE authenticator SET session_preload_libraries='fixture''a';"
        self.assertEqual(m.public_preload(raw,sha("fixture'a"),hashlib.sha256(raw).hexdigest()),"fixture'a")
if __name__=='__main__':unittest.main()
