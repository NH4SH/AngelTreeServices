import hashlib,importlib.util,pathlib,unittest
path=pathlib.Path(__file__).with_name('probe.py');spec=importlib.util.spec_from_file_location('public_probe',path);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
sha=lambda x:hashlib.sha256(x.encode()).hexdigest()
class Tests(unittest.TestCase):
    def test_error_values_and_paths_are_redacted(self):
        d=m.diagnostic_summary(b'FATAL: could not access file "/private/value.so": No such file or directory\n')
        self.assertIn('could not access file',d);self.assertNotIn('/private/',d);self.assertNotIn('value.so',d)
    def test_sql_source_context_is_not_published(self):
        d=m.diagnostic_summary(b'ERROR: syntax error at "token"\nLINE 1: SELECT secret_value\nCONTEXT: private_statement\n')
        self.assertNotIn('secret_value',d);self.assertNotIn('private_statement',d);self.assertNotIn('"token"',d)
    def test_sql_input_keeps_docker_stdin_open(self):
        self.assertEqual(m.docker_exec_args('a'*64,['psql'],input_supplied=True),['exec','-i','a'*64,'psql'])
    def test_no_input_does_not_attach_stdin(self):
        self.assertEqual(m.docker_exec_args('a'*64,['initdb']),['exec','a'*64,'initdb'])
    def test_exec_options_precede_container(self):
        self.assertEqual(m.docker_exec_args('a'*64,['psql'],input_supplied=True,extra=['--env','PGAPPNAME=fixture']),['exec','-i','--env','PGAPPNAME=fixture','a'*64,'psql'])
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
