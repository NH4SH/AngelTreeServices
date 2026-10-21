"""Guard cache reuse, asset invalidation, cascade and progressive rendering."""
from pathlib import Path
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


if __name__ == '__main__':
    unittest.main()
