"""Focused invariants for the Colonial Beach service-area guide.

Run after build: python3 -m unittest discover -s scripts -p test_local_search.py
"""
import json
import re
import unittest
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class Links(HTMLParser):
    def __init__(self, source):
        super().__init__()
        self.ids = []
        self.links = []
        self.feed(source)

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if attrs.get("id"):
            self.ids.append(attrs["id"])
        if tag == "a":
            self.links.append(attrs)


class LocalSearchGuideTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = (ROOT / "dist-public/service-areas/index.html").read_text(encoding="utf-8")
        cls.page = Links(cls.source)
        cls.guide = re.search(
            r'<section[^>]*aria-labelledby="colonial-beach-tree-service".*?</section>',
            cls.source, re.S,
        ).group()

    def test_existing_hub_remains_canonical(self):
        self.assertIn('rel="canonical" href="https://angeltreeservices.org/service-areas/"', self.source)
        self.assertFalse((ROOT / "dist-public/service-areas/colonial-beach").exists())

    def test_east_directory_links_to_unique_visible_heading(self):
        self.assertEqual(self.page.ids.count("colonial-beach-tree-service"), 1)
        self.assertIn('href="#colonial-beach-tree-service"', self.source)
        self.assertIn('tabindex="-1">Tree service in Colonial Beach and King George.', self.guide)

    def test_coverage_and_tree_only_restrictions_preserved(self):
        coverage = json.loads((ROOT / "public-service-areas.json").read_text(encoding="utf-8"))
        for group in coverage["groups"]:
            for place in group["places"]:
                self.assertIn(place, self.source)
        self.assertIn("Woodbridge is served for tree services only; landscaping is not offered there.", self.source)
        self.assertIn("Landscaping is not offered in these Richmond-area communities.", self.source)

    def test_real_base_and_project_location_are_explicit(self):
        self.assertIn("from our Fredericksburg-area base", self.guide)
        self.assertIn("This example is from Fredericksburg, not Colonial Beach.", self.guide)
        self.assertNotRegex(self.guide.lower(), r"colonial beach (office|branch|headquarters)")

    def test_local_permit_resource_does_not_promise_approval(self):
        self.assertIn('href="https://colonialbeachva.gov/166/Planning-and-Community-Development"', self.guide)
        self.assertIn("For property inside the Town of Colonial Beach", self.guide)
        self.assertIn("Confirm the current requirements for your property with the town", self.guide)
        self.assertIn("mailing address alone does not establish which jurisdiction", self.guide)
        self.assertNotRegex(self.guide, r"[23] to 1|[23]:1|permit fee|permit guaranteed")

    def test_service_and_estimate_links_reuse_existing_routes(self):
        for route in ("/services/tree-removal/", "/services/tree-pruning/", "/services/stump-grinding/", "/projects/hollow-tree-removal/"):
            self.assertIn(f'href="{route}"', self.guide)
            self.assertTrue((ROOT / "dist-public" / route.strip("/") / "index.html").is_file())
        self.assertIn('href="/?service=Tree%20Care#contact"', self.guide)
        self.assertIn('href="tel:+15403888715"', self.guide)
        self.assertNotIn("<form", self.guide)

    def test_schema_does_not_add_a_fake_business_location(self):
        nodes = []
        for raw in re.findall(r'<script type="application/ld\+json">(.*?)</script>', self.source, re.S):
            nodes.extend(json.loads(raw).get("@graph", []))
        self.assertEqual({node["@type"] for node in nodes}, {"BreadcrumbList", "WebPage"})

    def test_anchor_offset_covers_mobile_and_desktop(self):
        css = (ROOT / "ats-service-areas.css").read_text(encoding="utf-8")
        self.assertEqual(css.count("#colonial-beach-tree-service"), 3)

    def test_hub_description_matches_confirmed_tree_service_coverage(self):
        self.assertIn('name="description" content="Serving Fredericksburg, Stafford, King George and Colonial Beach with tree removal, pruning and stump grinding. Explore all confirmed service areas."', self.source)
        self.assertIn("Woodbridge is served for tree services only; landscaping is not offered there.", self.source)

    def test_core_service_pages_link_to_verified_coverage_anchors(self):
        for route in ("tree-removal", "tree-pruning", "stump-grinding"):
            source = (ROOT / "dist-public/services" / route / "index.html").read_text(encoding="utf-8")
            self.assertEqual(source.count("data-tree-service-coverage"), 1)
            self.assertIn('href="/service-areas/#area-stafford"', source)
            self.assertIn('href="/service-areas/#colonial-beach-tree-service"', source)
            self.assertIn('href="/service-areas/">Check coverage for your community</a>', source)
        self.assertEqual(self.page.ids.count("area-stafford"), 1)
        self.assertEqual(self.page.ids.count("colonial-beach-tree-service"), 1)
        for route in ("landscaping", "emergency-tree-service", "commercial-hoa-tree-care"):
            path = ROOT / "dist-public/services" / route / "index.html"
            self.assertTrue(path.is_file())
            self.assertNotIn("data-tree-service-coverage", path.read_text(encoding="utf-8"))

    def test_home_alias_is_a_narrow_permanent_redirect(self):
        rules = [line.strip() for line in (ROOT / "dist-public/_redirects").read_text(encoding="utf-8").splitlines()
                 if line.strip() and not line.lstrip().startswith("#")]
        self.assertEqual([rule for rule in rules if rule.startswith("/")], ["/home / 301"])
        self.assertEqual(len(rules), 9)
        self.assertTrue((ROOT / "dist-public/index.html").is_file())
        self.assertFalse((ROOT / "dist-public/home").exists())


if __name__ == "__main__":
    unittest.main()
