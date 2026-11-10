"""Guard cache reuse, asset invalidation, cascade and progressive rendering."""
from pathlib import Path
import ast
import contextlib
import importlib.util
import io
import json
import os
from unittest import mock
import hashlib
import re
import tempfile
import unittest
from public_styles import cache_page_styles, rebase_urls, stylesheet_asset


class PublicStylesTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.site = Path(self.temp.name)
        self.addCleanup(self.temp.cleanup)

    def write(self, path, value):
        target = self.site / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(value)
        return target

    def page(self, route='services/landscaping', between='', coverage=False):
        self.write('assets/css2.css', '@font-face{src:url("font.woff2")}h1{color:red}')
        self.write('site-pages.css', 'h1{color:green;background:url(assets/photo.webp)}')
        self.write('ats-service-areas.css', 'aside{color:blue}')
        self.write('ats-consent.css', '[hidden]{display:none!important}')
        return self.write(route + '/index.html',
                          '<head><title>Keep SEO</title><link rel="stylesheet" href="/assets/css2.css">' +
                          between + '<link rel="stylesheet" href="/site-pages.css?v=about1">' +
                          ('<link rel="stylesheet" href="/ats-service-areas.css?v=areas1">' if coverage else '') +
                          '<link rel="stylesheet" href="/ats-consent.css?v=consent3">' +
                          '</head><body><a href="/?service=Landscaping#contact">Estimate</a></body>')

    def test_relative_paths_rebased_and_external_values_untouched(self):
        css = 'a{src:url(../font.woff2?v=1#x);background:url("data:image/svg+xml,a(b)c");mask:url(#icon);other:url(https://example.com/f.woff2)}'
        output = rebase_urls(css, '/assets/versioned/style.css')
        self.assertIn('url("/assets/font.woff2?v=1#x")', output)
        for value in ['url("data:image/svg+xml,a(b)c")', 'url(#icon)', 'url(https://example.com/f.woff2)']:
            self.assertIn(value, output)

    def test_cascade_metadata_and_body_preserved_without_embedding_css(self):
        page = self.page(between='<style>h1{color:purple}</style>')
        original = page.read_text()
        cache_page_styles(self.site, page)
        html = page.read_text()
        for source in ['/assets/css2.css', '/site-pages.css', '/ats-consent.css']:
            href, css = stylesheet_asset(self.site, source)
            self.assertEqual((self.site / href.lstrip('/')).read_text(), css)
            old = re.search(r'<link rel="stylesheet" href="' + re.escape(source) + r'(?:\?[^\"]*)?">', original)[0]
            html = html.replace(f'<link rel="stylesheet" href="{href}">', old)
        self.assertEqual(html, original)
        self.assertNotIn('@font-face', page.read_text())
        self.assertNotIn('data-ats-stylesheet', page.read_text())

    def test_same_styles_reused_across_different_pages(self):
        first = self.page()
        second = self.page(route='privacy')
        cache_page_styles(self.site, first)
        cache_page_styles(self.site, second)
        links = lambda p: re.findall(r'<link[^>]+href="([^"]+)"', p.read_text())
        self.assertEqual(links(first), links(second))
        self.assertEqual(len(list((self.site / 'assets/versioned').glob('*.css'))), 3)

    def test_coverage_rules_keep_their_position(self):
        page = self.page(coverage=True)
        cache_page_styles(self.site, page)
        urls = re.findall(r'<link[^>]+href="([^"]+)"', page.read_text())
        self.assertEqual([u.split('/')[-1].split('.')[0] for u in urls],
                         ['css2', 'site-pages', 'ats-service-areas', 'ats-consent'])

    def test_content_hash_changes_with_css_and_only_that_asset_is_invalidated(self):
        self.page()
        before = {s: stylesheet_asset(self.site, s)[0] for s in ['/site-pages.css', '/ats-consent.css']}
        self.write('site-pages.css', 'h1{color:orange}')
        href, css = stylesheet_asset(self.site, '/site-pages.css')
        self.assertNotEqual(before['/site-pages.css'], href)
        self.assertIn(hashlib.sha256(css.encode()).hexdigest()[:10], href)
        self.assertEqual(before['/ats-consent.css'], stylesheet_asset(self.site, '/ats-consent.css')[0])

    def test_missing_unsafe_inputs_and_imports_fail_build(self):
        page = self.page()
        (self.site / 'site-pages.css').unlink()
        with self.assertRaisesRegex(ValueError, 'Missing'):
            cache_page_styles(self.site, page)
        self.write('site-pages.css', '@import "late.css";')
        with self.assertRaisesRegex(ValueError, 'handling'):
            cache_page_styles(self.site, page)
        with self.assertRaisesRegex(ValueError, 'unsafe'):
            stylesheet_asset(self.site, '/../private.css')

    def test_homepage_and_its_existing_hints_remain_byte_identical(self):
        source = '<head><link rel="preload" as="font" href="font.woff2" crossorigin><link rel="stylesheet" href="overrides.css?v=footer1"></head><body>Home</body>'
        page = self.write('index.html', source)
        cache_page_styles(self.site, page)
        self.assertEqual(page.read_text(), source)

    def test_no_javascript_dependency_and_consent_rules_are_unchanged(self):
        page = self.page()
        cache_page_styles(self.site, page)
        href, css = stylesheet_asset(self.site, '/ats-consent.css')
        self.assertEqual(css, (self.site / 'ats-consent.css').read_text())
        self.assertIn(f'<link rel="stylesheet" href="{href}">', page.read_text())
        self.assertNotIn('<script', page.read_text())
        self.assertNotIn('onload=', page.read_text())
        self.assertNotIn('rel="preload"', page.read_text())

    def test_existing_host_policy_caches_content_addressed_assets_immutably(self):
        config = (Path(__file__).resolve().parents[1] / 'netlify.toml').read_text()
        self.assertRegex(config, r'for = "/assets/versioned/\*"\s+\[headers.values\]\s+Cache-Control = "public, max-age=31536000, immutable"')



class PublicBuildPortabilityTest(unittest.TestCase):
    """Require the same public UTF-8/LF bytes on Windows and Linux."""

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.site = Path(self.temp.name)
        self.addCleanup(self.temp.cleanup)
        self.source = Path(__file__).resolve().parent
        self.unicode = 'Owner\u2019s tree \u2014 \u201capproved\u201d'

    def write(self, name, text):
        target = self.site / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(text.encode('utf-8'))
        return target

    def assert_utf8_lf(self, path, expected_text=None):
        raw = path.read_bytes()
        text = raw.decode('utf-8')
        self.assertNotIn(b'\r', raw, str(path))
        self.assertFalse(raw.startswith(b'\xef\xbb\xbf'), str(path))
        if expected_text is not None:
            self.assertEqual(raw, expected_text.encode('utf-8'))
        return text

    def builder(self):
        spec = importlib.util.spec_from_file_location(
            '_ats_portability_builder', self.source / 'build-public-site.py')
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        module.ROOT = self.site
        module.OUTPUT = self.site
        return module

    def test_cached_css_hash_matches_written_bytes(self):
        urls = ['/assets/css2.css', '/site-pages.css',
                '/ats-service-areas.css', '/ats-consent.css']
        css = 'a::before { content: "' + self.unicode + '"; }\n'
        for url in urls:
            self.write(url.lstrip('/'), css)
        page = self.write('service-areas/index.html',
                          '<head>\n' + ''.join(
                              '<link rel="stylesheet" href="' + url + '">\n'
                              for url in urls) + '</head><body>' +
                          self.unicode + '</body>\n')
        cache_page_styles(self.site, page)
        for url in urls:
            href, expected_css = stylesheet_asset(self.site, url)
            raw = (self.site / href.lstrip('/')).read_bytes()
            digest = hashlib.sha256(raw).hexdigest()[:10]
            self.assertTrue(href.endswith('.' + digest + '.css'), href)
            self.assertEqual(raw, expected_css.encode('utf-8'))
            self.assertNotIn(b'\r', raw)
        self.assertIn(self.unicode, self.assert_utf8_lf(page))

    def test_mobile_photo_rewrite_preserves_utf8_and_lf(self):
        import public_mobile_photos
        manifest = {
            key: {'variants': [
                {'src': '/assets/versioned/' + key + '-320.webp', 'width': 320}
            ]}
            for key in ['tree', 'landscaping', 'bucket']
        }
        self.write('public-mobile-photo-variants.json',
                   json.dumps(manifest, ensure_ascii=False) + '\n')
        sources = {
            'index.html': [
                'assets/versioned/service-tree-512.705dacd21f.webp',
                'assets/versioned/photo-landscaping-service-512.16653c31d4.webp',
                '/assets/versioned/project-bucket-access-840.aa86f67e80.webp',
            ],
            'services/tree-removal/index.html': [
                '/assets/AngelChainsawSquooshed_008.jpg',
                '/assets/versioned/project-bucket-access-1280.abe084e062.webp',
            ],
        }
        for name, photos in sources.items():
            self.write(name, '<p>' + self.unicode + '</p>\n' + ''.join(
                '<img src="' + photo + '" sizes="50vw">\n'
                for photo in photos))
        with mock.patch.object(public_mobile_photos, 'ROOT', self.site):
            public_mobile_photos.optimize_mobile_photos(self.site)
        for name, photos in sources.items():
            text = self.assert_utf8_lf(self.site / name)
            self.assertIn(self.unicode, text)
            self.assertEqual(text.count('<picture '), len(photos))
            for photo in photos:
                self.assertIn('src="' + photo + '"', text)

    def test_page_generator_writes_utf8_lf_documents(self):
        tree = ast.parse((self.source / 'build-public-pages.py').read_text(encoding='utf-8'))
        selected = [node for node in tree.body
                    if isinstance(node, ast.FunctionDef)
                    and node.name in {'build', 'llms_document'}]
        self.assertEqual(len(selected), 2)
        namespace = {
            'Path': Path, 'ROOT': self.site / 'source',
            'SITE': 'https://angeltreeservices.org',
            'TREE_PROJECT': {'path': '/projects/hollow-tree-removal/'},
            'LANDSCAPING_PROJECT': {'path': '/projects/bush-trimming-mulch/'},
            'TRIMMING_PROJECT': {'path': '/projects/holly-tree-trimming/'},
            'PAGES': [{'path': '/example/'}],
            'page_document': lambda page: self.unicode + '\n',
            'sitemap_document': lambda: '<urlset>' + self.unicode + '</urlset>\n',
            'robots_document': lambda: 'User-agent: *\nDisallow:\n',
        }
        exec(compile(ast.Module(body=selected, type_ignores=[]),
                     'build-public-pages.py', 'exec'), namespace)
        output = self.site / 'generated'
        with contextlib.redirect_stdout(io.StringIO()):
            namespace['build'](output)
        self.assert_utf8_lf(output / 'example/index.html', self.unicode + '\n')
        self.assert_utf8_lf(output / 'sitemap.xml', namespace['sitemap_document']())
        self.assert_utf8_lf(output / 'robots.txt', namespace['robots_document']())
        self.assert_utf8_lf(output / 'llms.txt', namespace['llms_document']())

    def test_emergency_copy_rewrite_keeps_utf8_lf(self):
        builder = self.builder()
        changes = builder.EMERGENCY_AVAILABILITY_REPLACEMENTS
        emergency = self.write('services/emergency-tree-service/index.html',
                               self.unicode + '\n' +
                               '\n'.join(old for old, new in changes[:3]) + '\n')
        llms = self.write('llms.txt', self.unicode + '\n' + changes[3][0] + '\n')
        builder.apply_emergency_availability_copy()
        self.assert_utf8_lf(emergency, self.unicode + '\n' +
                           '\n'.join(new for old, new in changes[:3]) + '\n')
        self.assert_utf8_lf(llms, self.unicode + '\n' + changes[3][1] + '\n')

    def test_consent_rewrite_keeps_utf8_lf(self):
        builder = self.builder()
        self.write('public-consent.html', '<div id="ats-consent"></div>\n')
        for name, footer in [
            ('index.html', '<footer class="sections" id="footer-sections">'),
            ('services/example/index.html', '<footer class="ats-page-footer">'),
        ]:
            self.write(name, '<head></head>\n<body>' + self.unicode + '\n' +
                       footer + '<a href="/privacy/">Privacy</a></footer></body>\n')
        builder.apply_public_consent_controls()
        for name in ['index.html', 'services/example/index.html']:
            text = self.assert_utf8_lf(self.site / name)
            self.assertIn(self.unicode, text)
            self.assertEqual(text.count('id="ats-consent"'), 1)
            self.assertEqual(text.count('data-ats-privacy '), 1)

    def test_autocomplete_rewrite_keeps_utf8_lf_with_or_without_key(self):
        builder = self.builder()
        for key in ['', 'synthetic-public-test-key']:
            with self.subTest(configured=bool(key)):
                script = self.write('ats-address-autocomplete.js',
                                    '// ' + self.unicode + '\nconst key = "' +
                                    builder.GOOGLE_MAPS_API_KEY_PLACEHOLDER + '";\n')
                homepage = self.write('index.html', '<head>\n' +
                                      builder.FORM_ENHANCEMENT_SCRIPT +
                                      '\n</head><body>' + self.unicode + '</body>\n')
                with mock.patch.dict(os.environ, {'NEXT_PUBLIC_GOOGLE_MAPS_API_KEY': key}):
                    with contextlib.redirect_stdout(io.StringIO()):
                        builder.configure_public_address_autocomplete()
                self.assert_utf8_lf(script, '// ' + self.unicode +
                                   '\nconst key = "' + key + '";\n')
                text = self.assert_utf8_lf(homepage)
                self.assertEqual(builder.ADDRESS_AUTOCOMPLETE_SCRIPT in text, bool(key))

    def test_public_text_io_declares_portable_encoding_and_newlines(self):
        names = ['public_mobile_photos.py', 'public_styles.py',
                 'build-public-pages.py', 'build-public-site.py']
        checked = 0
        for name in names:
            tree = ast.parse((self.source / name).read_text(encoding='utf-8'))
            for node in ast.walk(tree):
                if not (isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute)
                        and node.func.attr in {'read_text', 'write_text'}):
                    continue
                keywords = {item.arg: item.value for item in node.keywords}
                with self.subTest(source=name, line=node.lineno, operation=node.func.attr):
                    self.assertIn('encoding', keywords)
                    self.assertEqual(ast.literal_eval(keywords['encoding']), 'utf-8')
                    if node.func.attr == 'write_text':
                        self.assertIn('newline', keywords)
                        self.assertEqual(ast.literal_eval(keywords['newline']), '\n')
                checked += 1
        self.assertGreater(checked, 15)


if __name__ == '__main__':
    unittest.main()
