#!/usr/bin/env python3
"""Validate the deployable Angel Tree Services public-site artifact."""

from __future__ import annotations

import argparse
import json
import re
import sys
from collections import Counter
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urljoin, urlparse
from xml.etree import ElementTree


ROOT = Path(__file__).resolve().parents[1]
SITE = "https://angeltreeservices.org"
PHONE_LINK = "+15403888715"

EXPECTED_PATHS = (
    "/",
    "/services/",
    "/services/tree-removal/",
    "/services/tree-pruning/",
    "/services/stump-grinding/",
    "/services/emergency-tree-service/",
    "/services/commercial-hoa-tree-care/",
    "/credentials-safety/",
    "/projects/",
    "/about/",
    "/recognition/",
)

EXPECTED_PREFILL = {
    "/services/tree-removal/": {"service": "Tree Care"},
    "/services/tree-pruning/": {"service": "Tree Care"},
    "/services/stump-grinding/": {"service": "Tree Care"},
    "/services/emergency-tree-service/": {"service": "Storm Cleanup"},
    "/services/commercial-hoa-tree-care/": {
        "service": "Multiple Services / Not Sure Yet",
        "customer_type": "Commercial / Property Management",
    },
}

FORBIDDEN_PUBLIC_PARTS = {
    ".git",
    ".netlify",
    ".playwright-cli",
    "admin",
    "apps",
    "audit",
    "landing-clean",
    "localbuild",
    "output",
    "scripts",
}

FORBIDDEN_PUBLIC_SUFFIXES = {
    ".log",
    ".md",
    ".py",
    ".ts",
    ".tsx",
    ".yaml",
    ".yml",
}

TRAQ_PATTERN = re.compile(
    r"\bTRAQ\b|Tree\s+Risk\s+Assessment\s+Qualification|TRAQ\s+Qualified|tree\s+risk\s+qualified",
    re.IGNORECASE,
)

LOCAL_PATH_PATTERN = re.compile(r"/Users/|file://|\blocalhost\b|127\.0\.0\.1", re.IGNORECASE)
SECRET_PATTERN = re.compile(
    r"SUPABASE_SERVICE_ROLE_KEY|RESEND_API_KEY|NETLIFY_AUTH_TOKEN|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----",
    re.IGNORECASE,
)
CSS_URL_PATTERN = re.compile(r"url\(\s*(['\"]?)([^)'\"]+)\1\s*\)", re.IGNORECASE)


class PublicHTMLParser(HTMLParser):
    """Collect the release metadata and references needed for deterministic checks."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.title_parts: list[str] = []
        self.in_title = False
        self.h1_count = 0
        self.ids: list[str] = []
        self.meta: list[dict[str, str]] = []
        self.links: list[dict[str, str]] = []
        self.scripts: list[dict[str, str]] = []
        self.images: list[dict[str, str]] = []
        self.references: list[tuple[str, str]] = []
        self.json_ld: list[str] = []
        self._json_ld_depth = 0
        self._json_ld_parts: list[str] = []
        self.forms: list[dict[str, str]] = []
        self.controls: list[tuple[str, dict[str, str]]] = []
        self.label_fors: set[str] = set()
        self._label_depth = 0
        self._wrapped_control_ids: set[str] = set()

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = {name.lower(): value or "" for name, value in attrs}
        tag = tag.lower()

        if values.get("id"):
            self.ids.append(values["id"])

        if tag == "title":
            self.in_title = True
        elif tag == "h1":
            self.h1_count += 1
        elif tag == "meta":
            self.meta.append(values)
        elif tag == "a":
            self.links.append(values)
            if values.get("href"):
                self.references.append(("href", values["href"]))
        elif tag == "link":
            self.links.append(values)
            if values.get("href"):
                self.references.append(("href", values["href"]))
        elif tag == "script":
            self.scripts.append(values)
            if values.get("src"):
                self.references.append(("src", values["src"]))
            if values.get("type", "").lower() == "application/ld+json":
                self._json_ld_depth = 1
                self._json_ld_parts = []
        elif tag == "img":
            self.images.append(values)
            if values.get("src"):
                self.references.append(("src", values["src"]))
            if values.get("srcset"):
                for candidate in values["srcset"].split(","):
                    source = candidate.strip().split()[0] if candidate.strip() else ""
                    if source:
                        self.references.append(("srcset", source))
        elif tag in {"source", "video", "audio", "iframe"}:
            for attribute in ("src", "poster"):
                if values.get(attribute):
                    self.references.append((attribute, values[attribute]))
            if values.get("srcset"):
                for candidate in values["srcset"].split(","):
                    source = candidate.strip().split()[0] if candidate.strip() else ""
                    if source:
                        self.references.append(("srcset", source))
        elif tag == "form":
            self.forms.append(values)
        elif tag == "label":
            self._label_depth += 1
            if values.get("for"):
                self.label_fors.add(values["for"])

        if tag in {"input", "select", "textarea", "button"}:
            self.controls.append((tag, values))
            if self._label_depth and values.get("id"):
                self._wrapped_control_ids.add(values["id"])

        if values.get("style"):
            for match in CSS_URL_PATTERN.finditer(values["style"]):
                self.references.append(("style", match.group(2).strip()))

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self.handle_starttag(tag, attrs)

    def handle_endtag(self, tag: str) -> None:
        tag = tag.lower()
        if tag == "title":
            self.in_title = False
        elif tag == "script" and self._json_ld_depth:
            self.json_ld.append("".join(self._json_ld_parts).strip())
            self._json_ld_depth = 0
            self._json_ld_parts = []
        elif tag == "label" and self._label_depth:
            self._label_depth -= 1

    def handle_data(self, data: str) -> None:
        if self.in_title:
            self.title_parts.append(data)
        if self._json_ld_depth:
            self._json_ld_parts.append(data)

    @property
    def title(self) -> str:
        return " ".join("".join(self.title_parts).split())

    def meta_value(self, key: str, value: str, attribute: str = "content") -> str:
        key = key.lower()
        value = value.lower()
        for item in self.meta:
            if item.get(key, "").lower() == value:
                return item.get(attribute, "").strip()
        return ""

    def link_value(self, rel_value: str) -> str:
        rel_value = rel_value.lower()
        for item in self.links:
            if rel_value in item.get("rel", "").lower().split():
                return item.get("href", "").strip()
        return ""


class Validator:
    def __init__(self, site_dir: Path) -> None:
        self.site_dir = site_dir.resolve()
        self.errors: list[str] = []
        self.pages: dict[str, PublicHTMLParser] = {}
        self.page_sources: dict[str, str] = {}

    def error(self, message: str) -> None:
        self.errors.append(message)

    @staticmethod
    def page_file(site_dir: Path, route: str) -> Path:
        if route == "/":
            return site_dir / "index.html"
        return site_dir / route.strip("/") / "index.html"

    def parse_pages(self) -> None:
        actual_routes: set[str] = set()
        for path in self.site_dir.rglob("index.html"):
            relative = path.relative_to(self.site_dir)
            route = "/" if relative == Path("index.html") else f"/{relative.parent.as_posix()}/"
            actual_routes.add(route)

        expected = set(EXPECTED_PATHS)
        for missing in sorted(expected - actual_routes):
            self.error(f"Missing approved page: {missing}")
        for unexpected in sorted(actual_routes - expected):
            self.error(f"Unexpected indexable page in artifact: {unexpected}")

        for route in EXPECTED_PATHS:
            path = self.page_file(self.site_dir, route)
            if not path.is_file():
                continue
            source = path.read_text(encoding="utf-8")
            parser = PublicHTMLParser()
            try:
                parser.feed(source)
                parser.close()
            except Exception as error:
                self.error(f"{route}: HTML parsing failed: {error}")
                continue
            self.pages[route] = parser
            self.page_sources[route] = source

    def validate_metadata(self) -> None:
        titles: list[str] = []
        descriptions: list[str] = []

        for route, page in self.pages.items():
            expected_url = f"{SITE}{route}"
            if not page.title:
                self.error(f"{route}: missing title")
            else:
                titles.append(page.title)

            description = page.meta_value("name", "description")
            if not description:
                self.error(f"{route}: missing meta description")
            else:
                descriptions.append(description)

            if page.h1_count != 1:
                self.error(f"{route}: expected exactly one H1, found {page.h1_count}")
            if page.link_value("canonical") != expected_url:
                self.error(f"{route}: canonical must be {expected_url}")
            if page.meta_value("property", "og:url") != expected_url:
                self.error(f"{route}: Open Graph URL must be {expected_url}")

            duplicate_ids = sorted(value for value, count in Counter(page.ids).items() if count > 1)
            if duplicate_ids:
                self.error(f"{route}: duplicate IDs: {', '.join(duplicate_ids[:8])}")

            if not page.json_ld:
                self.error(f"{route}: missing JSON-LD")
            for index, document in enumerate(page.json_ld, start=1):
                try:
                    json.loads(document)
                except Exception as error:
                    self.error(f"{route}: JSON-LD block {index} does not parse: {error}")

            for image in page.images:
                if "alt" not in image:
                    self.error(f"{route}: image is missing an alt attribute ({image.get('src', 'unknown source')})")

        duplicate_titles = sorted(value for value, count in Counter(titles).items() if count > 1)
        duplicate_descriptions = sorted(value for value, count in Counter(descriptions).items() if count > 1)
        if duplicate_titles:
            self.error(f"Duplicate page title(s): {'; '.join(duplicate_titles)}")
        if duplicate_descriptions:
            self.error(f"Duplicate meta description(s): {'; '.join(duplicate_descriptions)}")

    @staticmethod
    def is_external_reference(reference: str) -> bool:
        reference = reference.strip()
        if not reference or reference.startswith(("#", "data:", "blob:", "javascript:", "mailto:", "tel:")):
            return True
        if reference.startswith("//"):
            return True
        parsed = urlparse(reference)
        return parsed.scheme in {"http", "https"}

    def resolve_local_reference(self, route: str, reference: str) -> Path | None:
        if self.is_external_reference(reference):
            return None

        absolute = urljoin(f"{SITE}{route}", reference)
        parsed = urlparse(absolute)
        if parsed.netloc and parsed.netloc != "angeltreeservices.org":
            return None
        path = unquote(parsed.path)
        if path.endswith("/"):
            path += "index.html"
        elif not Path(path).suffix and (self.site_dir / path.lstrip("/") / "index.html").is_file():
            path += "/index.html"
        return self.site_dir / path.lstrip("/")

    def validate_references(self) -> None:
        for route, page in self.pages.items():
            for attribute, reference in page.references:
                target = self.resolve_local_reference(route, reference)
                if target is not None and not target.is_file():
                    self.error(f"{route}: broken local {attribute} reference {reference!r}")

            phone_links = [item.get("href", "") for item in page.links if item.get("href", "").startswith("tel:")]
            for href in phone_links:
                if href != f"tel:{PHONE_LINK}":
                    self.error(f"{route}: unexpected phone link {href!r}")

            if route != "/":
                script_sources = {item.get("src", "").split("?", 1)[0] for item in page.scripts}
                stylesheet_sources = {
                    item.get("href", "").split("?", 1)[0]
                    for item in page.links
                    if "stylesheet" in item.get("rel", "").lower().split()
                }
                if "/site-pages.js" not in script_sources:
                    self.error(f"{route}: site-pages.js is not loaded")
                if "/site-pages.css" not in stylesheet_sources:
                    self.error(f"{route}: site-pages.css is not loaded")
                if not any(item.get("href") == "#main-content" for item in page.links):
                    self.error(f"{route}: skip link to #main-content is missing")
                if not any("ats-estimate-link" in item.get("class", "").split() for item in page.links):
                    self.error(f"{route}: estimate CTA class is missing")

    def validate_prefill_links(self) -> None:
        for route, expected_parameters in EXPECTED_PREFILL.items():
            page = self.pages.get(route)
            if not page:
                continue
            primary_links = [
                item.get("href", "")
                for item in page.links
                if "ats-button--primary" in item.get("class", "").split()
            ]
            if not primary_links:
                self.error(f"{route}: primary estimate CTA is missing")
                continue
            parsed = urlparse(primary_links[0])
            if parsed.path != "/" or parsed.fragment != "contact":
                self.error(f"{route}: primary estimate CTA must route to the homepage form")
                continue
            from urllib.parse import parse_qs

            actual_parameters = {key: values[-1] for key, values in parse_qs(parsed.query).items()}
            for name, expected_value in expected_parameters.items():
                if actual_parameters.get(name) != expected_value:
                    self.error(
                        f"{route}: expected {name}={expected_value!r}, found {actual_parameters.get(name)!r}"
                    )

    def validate_navigation_graph(self) -> None:
        graph: dict[str, set[str]] = {route: set() for route in self.pages}

        for route, page in self.pages.items():
            for link in page.links:
                href = link.get("href", "")
                if self.is_external_reference(href):
                    continue
                target_url = urlparse(urljoin(f"{SITE}{route}", href))
                target_route = target_url.path
                if target_route in self.pages:
                    graph[route].add(target_route)

        reachable = {"/"}
        pending = ["/"]
        while pending:
            current = pending.pop()
            for target in graph.get(current, set()):
                if target not in reachable:
                    reachable.add(target)
                    pending.append(target)

        for route in sorted(set(self.pages) - reachable):
            self.error(f"Orphan page is not reachable from the homepage: {route}")
        for route in sorted(set(self.pages) - {"/"}):
            if "/" not in graph.get(route, set()):
                self.error(f"{route}: no internal link returns to the homepage")

        if "/services/" not in graph.get("/", set()):
            self.error("/: services hub is not linked from the homepage")
        for route in EXPECTED_PATHS:
            if route.startswith("/services/") and route != "/services/":
                if route not in graph.get("/services/", set()):
                    self.error(f"/services/: service page is not linked from the hub: {route}")

    def validate_shared_navigation(self) -> None:
        desktop_keys = ["about", "services", "projects", "commercial"]
        mobile_keys = [
            "about",
            "services",
            "projects",
            "commercial",
            "credentials",
            "recognition",
            "contact",
        ]

        def keys_in(block: str) -> list[str]:
            return re.findall(r'data-ats-nav="([^"]+)"', block, re.IGNORECASE)

        for route, source in self.page_sources.items():
            if route == "/":
                desktop_blocks = re.findall(
                    r'<nav\b[^>]*class="[^"]*header-nav-list[^"]*"[^>]*>(.*?)</nav>',
                    source,
                    re.IGNORECASE | re.DOTALL,
                )
                if not desktop_blocks:
                    self.error("/: desktop navigation is missing")
                for block in desktop_blocks:
                    if keys_in(block) != desktop_keys:
                        self.error("/: desktop navigation must be About, Services, Projects, Commercial")

                mobile_match = re.search(
                    r'<details\b[^>]*class="[^"]*ats-home-mobile-menu[^"]*"[^>]*>.*?'
                    r'<nav\b[^>]*>(.*?)</nav>.*?</details>',
                    source,
                    re.IGNORECASE | re.DOTALL,
                )
                if not mobile_match or keys_in(mobile_match.group(1)) != mobile_keys:
                    self.error("/: mobile navigation does not match the approved expanded order")
            else:
                desktop_match = re.search(
                    r'<nav\b[^>]*class="[^"]*ats-page-nav[^"]*"[^>]*>(.*?)</nav>',
                    source,
                    re.IGNORECASE | re.DOTALL,
                )
                if not desktop_match or keys_in(desktop_match.group(1)) != desktop_keys:
                    self.error(f"{route}: shared desktop navigation order is incorrect")

                mobile_match = re.search(
                    r'<details\b[^>]*class="[^"]*ats-mobile-menu[^"]*"[^>]*>.*?'
                    r'<nav\b[^>]*>(.*?)</nav>.*?</details>',
                    source,
                    re.IGNORECASE | re.DOTALL,
                )
                if not mobile_match or keys_in(mobile_match.group(1)) != mobile_keys:
                    self.error(f"{route}: shared mobile navigation order is incorrect")

            if re.search(r'data-ats-nav="home"', source, re.IGNORECASE):
                self.error(f"{route}: Home must remain the brand link rather than a navigation label")

        for route, page in self.pages.items():
            if page.link_value("apple-touch-icon") != "/assets/apple-touch-icon.png":
                self.error(f"{route}: Apple touch icon reference is missing")
            icon_links = {
                item.get("href", "")
                for item in page.links
                if "icon" in item.get("rel", "").lower().split()
            }
            for expected_icon in ("/assets/favicon-32.png", "/assets/favicon-192.png"):
                if expected_icon not in icon_links:
                    self.error(f"{route}: favicon reference is missing: {expected_icon}")

        expected_pngs = {
            "assets/favicon-32.png": (32, 32),
            "assets/favicon-192.png": (192, 192),
            "assets/apple-touch-icon.png": (180, 180),
        }
        for relative, expected_size in expected_pngs.items():
            icon = self.site_dir / relative
            if not icon.is_file():
                self.error(f"Icon asset is missing: {relative}")
                continue
            header = icon.read_bytes()[:24]
            if len(header) < 24 or header[:8] != b"\x89PNG\r\n\x1a\n":
                self.error(f"Icon asset must be a PNG: {relative}")
            else:
                width = int.from_bytes(header[16:20], "big")
                height = int.from_bytes(header[20:24], "big")
                if (width, height) != expected_size:
                    self.error(f"{relative} must be {expected_size[0]}x{expected_size[1]}, found {width}x{height}")

        homepage = self.page_sources.get("/", "")
        expected_structured_logo = "https://angeltreeservices.org/assets/angel-tree-logo-square.webp"
        if expected_structured_logo not in homepage:
            self.error("/: LocalBusiness logo must use the self-contained green-square asset")
        if homepage.count('/assets/angel-tree-logo-transparent.webp') < 3:
            self.error("/: responsive layout headers must use the transparent logo asset")
        for route, source in self.page_sources.items():
            if route != "/" and '/assets/angel-tree-logo-transparent.webp' not in source:
                self.error(f"{route}: shared header must use the transparent logo asset")

    def validate_homepage_form(self) -> None:
        page = self.pages.get("/")
        if not page:
            return

        contact_forms = [item for item in page.forms if item.get("name") == "contact"]
        if len(contact_forms) != 1:
            self.error(f"/: expected one contact form, found {len(contact_forms)}")
            return
        form = contact_forms[0]
        if form.get("method", "").upper() != "POST":
            self.error("/: contact form method must be POST")
        if form.get("data-netlify") != "true" or form.get("data-netlify-honeypot") != "bot-field":
            self.error("/: Netlify fallback form or honeypot metadata is missing")

        controls_by_name = {values.get("name", ""): (tag, values) for tag, values in page.controls if values.get("name")}
        for name in ("name", "phone", "service", "customer_type", "address", "message", "bot-field"):
            if name not in controls_by_name:
                self.error(f"/: contact form control {name!r} is missing")

        for tag, values in page.controls:
            if "required" not in values:
                continue
            control_id = values.get("id", "")
            if not control_id or (
                control_id not in page.label_fors and control_id not in page._wrapped_control_ids
            ):
                self.error(f"/: required {tag} {values.get('name', control_id)!r} does not have an associated label")

        source = self.page_sources.get("/", "")
        script = (self.site_dir / "ats-form-enhancements.js").read_text(encoding="utf-8")
        required_runtime_terms = (
            "https://admin.angeltreeservices.org/api/leads",
            r"angeltreeservices?\.org",
            "submission_id",
            "page_url",
            "referrer",
            "utm_source",
            "utm_medium",
            "utm_campaign",
            "body.ok === false",
            "form.dataset.submitting",
            "form.reset()",
        )
        combined = source + "\n" + script
        for term in required_runtime_terms:
            if term not in combined:
                self.error(f"/: lead-form release invariant is missing: {term}")
        if 'credentials: "omit"' not in script:
            self.error("/: cross-origin lead request must omit credentials")

    def validate_homepage_search_alignment(self) -> None:
        homepage = self.page_sources.get("/", "")
        page = self.pages.get("/")
        if not homepage or not page:
            return

        expected_title = "Tree Service in Fredericksburg, VA | Angel Tree Services"
        expected_heading = "Your yard’s best friend."
        expected_eyebrow = "Fredericksburg Tree Service"
        expected_description = (
            "Certified-arborist-led tree service in Fredericksburg for removal, pruning, storm "
            "cleanup, stump grinding, landscaping, and lawn care. Free estimates."
        )

        if page.title != expected_title:
            self.error(f"/: homepage title must remain {expected_title!r}")
        if page.meta_value("name", "description") != expected_description:
            self.error("/: homepage description must align tree care services with Fredericksburg")
        if f'<link rel="canonical" href="{SITE}/">' not in homepage:
            self.error("/: homepage canonical must remain the root public URL")
        if homepage.count(expected_eyebrow) != 1:
            self.error("/: Fredericksburg Tree Service must appear once beside the shared responsive hero H1")

        h1_match = re.search(r"<h1\b[^>]*>(.*?)</h1>", homepage, re.IGNORECASE | re.DOTALL)
        if not h1_match:
            self.error("/: homepage H1 is missing")
        else:
            h1_text = " ".join(re.sub(r"<[^>]+>", " ", h1_match.group(1)).split())
            if h1_text != expected_heading:
                self.error(f"/: homepage H1 must be {expected_heading!r}")

    def validate_recognition_layer(self) -> None:
        homepage = self.page_sources.get("/", "")
        recognition = self.page_sources.get("/recognition/", "")
        if not homepage or not recognition:
            return
        combined_public_html = "\n".join(self.page_sources.values())

        required_homepage_terms = (
            "4.9 stars from 120+ Google reviews",
            "/recognition/",
            "Connected with local business organizations and community tree-planting efforts.",
            "2026 Best of the Burg Finalist, Best Tree Trim/Removal Services",
            '"@type": "NewsArticle"',
            '"@type": "VideoObject"',
        )
        for term in required_homepage_terms:
            if term not in homepage:
                self.error(f"/: recognition invariant is missing: {term}")

        required_recognition_terms = (
            "4.9 stars from 120+ Google reviews",
            "Best Tree Trim/Removal Services",
            "Best of the Burg finalist",
            "September 19, 2024",
            "NBC4 Responds",
            "data-video-id=\"QwfdLmPTQAk\"",
            "https://www.google.com/maps/search/?api=1",
            "https://fredericksburgfreelance-star.secondstreetapp.com/",
            "https://www.nbcwashington.com/news/consumer/nbc4-responds/",
            "https://www.nbcwashington.com/video/news/consumer/nbc4-responds/",
            "https://www.youtube.com/watch?v=QwfdLmPTQAk",
            "Member of the Fredericksburg Regional Chamber of Commerce",
            "Member of the Fredericksburg Area Builders Association",
            "https://members.fredericksburgchamber.org/list/member/angel-tree-services-llc-29385",
            "https://members.fabava.com/list/member/angel-tree-services-llc-27366840",
            "regularly donates arborist wood chips to",
            "https://treefredericksburg.org/",
            "uses <a href=\"https://getchipdrop.com/\"",
            "local gardeners and other nearby recipients",
        )
        for term in required_recognition_terms:
            if term not in recognition:
                self.error(f"/recognition/: required source or claim is missing: {term}")

        if "youtube.com/embed" in recognition or "youtube-nocookie.com/embed" in recognition:
            self.error("/recognition/: the initial HTML must not contain a YouTube iframe")
        if re.search(
            r"\b(?:award[- ]winning|named (?:a )?winner|voted\s+#?1|NBC4\s+(?:recommends|endorses)|Google\s+endorsed)\b",
            recognition,
            re.IGNORECASE,
        ):
            self.error("/recognition/: unsupported winner, ranking, or endorsement wording found")

        if re.search(
            r"(?:Tree Fredericksburg|ChipDrop|Fredericksburg Regional Chamber of Commerce|Fredericksburg Area Builders Association).{0,80}\b(?:partner|sponsor|endorser|endorses|certifies|approved)\b|"
            r"\b(?:partner|sponsor|endorser|endorses|certifies|approved).{0,80}(?:Tree Fredericksburg|ChipDrop|Fredericksburg Regional Chamber of Commerce|Fredericksburg Area Builders Association)",
            recognition,
            re.IGNORECASE | re.DOTALL,
        ):
            self.error("/recognition/: unsupported organization relationship wording found")

        credentials = self.page_sources.get("/credentials-safety/", "")
        for term in (
            "Professional affiliations",
            "Member of the Fredericksburg Regional Chamber of Commerce",
            "Member of the Fredericksburg Area Builders Association",
            "/recognition/#community",
        ):
            if term not in credentials:
                self.error(f"/credentials-safety/: professional-affiliation invariant is missing: {term}")

        if re.search(r"\b212\s+(?:referral|referrals)\b", combined_public_html, re.IGNORECASE):
            self.error("Public pages must not include the unsupported 212 referrals claim")

        if "AggregateRating" in combined_public_html or '"@type":"Review"' in combined_public_html:
            self.error("Public pages must not add AggregateRating or Review structured data for this release")

        script = (self.site_dir / "site-pages.js").read_text(encoding="utf-8")
        for term in ("youtube-nocookie.com/embed/", "replaceChildren", "allowFullscreen"):
            if term not in script:
                self.error(f"/recognition/: click-to-load video behavior is missing: {term}")
        if "autoplay" in script.lower():
            self.error("/recognition/: video loader must not enable autoplay")

    def validate_about_page(self) -> None:
        about = self.page_sources.get("/about/", "")
        if not about:
            return

        required_terms = (
            "Angel Tree Services has served the Fredericksburg region since 2015",
            "more than 30 years of tree-industry experience",
            "more than 20 years working in tree care and utility vegetation management",
            "crew leader with Asplundh",
            "advanced to General Foreman",
            "approximately 40 employees",
            "multiple Virginia service territories",
            "family-operated business",
            "Member of the Fredericksburg Regional Chamber of Commerce",
            "Member of the Fredericksburg Area Builders Association",
            "4.9 stars from 120+ Google reviews",
            "View Reviews, Recognition &amp; Media",
            "/recognition/",
        )
        for term in required_terms:
            if term not in about:
                self.error(f"/about/: required company-story invariant is missing: {term}")

        if "General Regional Foreman" in about:
            self.error("/about/: unconfirmed General Regional Foreman title must not be published")

        combined_public_html = "\n".join(self.page_sources.values())
        if "30+ years of tree-industry experience" not in combined_public_html:
            self.error("Public pages must preserve the verified 30+ years tree-industry experience claim")
        if re.search(r"\bcombined (?:staff |team )?experience\b", combined_public_html, re.IGNORECASE):
            self.error("The verified 30+ years claim must not be mislabeled as combined staff experience")
        if re.search(
            r"(?:founded|established|operating|in business) (?:for )?(?:more than )?30\+? years",
            combined_public_html,
            re.IGNORECASE,
        ):
            self.error("Public wording must not imply Angel Tree Services was founded more than 30 years ago")

        if re.search(
            r"(?:Asplundh|Lewis Tree Service).{0,80}\b(?:endorses?|partner|affiliate|authorized)\b|"
            r"\b(?:endorses?|partner|affiliate|authorized).{0,80}(?:Asplundh|Lewis Tree Service)",
            about,
            re.IGNORECASE | re.DOTALL,
        ):
            self.error("/about/: former-employer wording implies a current affiliation or endorsement")

    def validate_artifact_contents(self) -> None:
        for path in self.site_dir.rglob("*"):
            if not path.is_file():
                continue
            relative = path.relative_to(self.site_dir)
            lower_parts = {part.lower() for part in relative.parts}
            if lower_parts & FORBIDDEN_PUBLIC_PARTS:
                self.error(f"Private/non-release path included in artifact: {relative}")
            if path.suffix.lower() in FORBIDDEN_PUBLIC_SUFFIXES:
                self.error(f"Non-public source/report file included in artifact: {relative}")
            if path.name.lower().startswith(".env"):
                self.error(f"Environment file included in artifact: {relative}")

        text_files = [
            *self.site_dir.rglob("*.html"),
            self.site_dir / "overrides.css",
            self.site_dir / "ats-form-enhancements.js",
            self.site_dir / "site-pages.css",
            self.site_dir / "site-pages.js",
            self.site_dir / "sitemap.xml",
            self.site_dir / "robots.txt",
        ]
        seen: set[Path] = set()
        for path in text_files:
            if path in seen or not path.is_file():
                continue
            seen.add(path)
            source = path.read_text(encoding="utf-8", errors="replace")
            relative = path.relative_to(self.site_dir)
            if TRAQ_PATTERN.search(source):
                self.error(f"Public TRAQ reference found in {relative}")
            if LOCAL_PATH_PATTERN.search(source):
                self.error(f"Local development path or host found in {relative}")
            if SECRET_PATTERN.search(source):
                self.error(f"Potential secret found in {relative}")

        for stylesheet_name in ("overrides.css", "site-pages.css"):
            path = self.site_dir / stylesheet_name
            if not path.is_file():
                continue
            source = path.read_text(encoding="utf-8", errors="replace")
            for match in CSS_URL_PATTERN.finditer(source):
                reference = match.group(2).strip()
                target = self.resolve_local_reference("/", reference)
                if target is not None and not target.is_file():
                    self.error(f"/{stylesheet_name}: broken local CSS asset {reference!r}")

    def validate_sitemap_and_robots(self) -> None:
        sitemap = self.site_dir / "sitemap.xml"
        robots = self.site_dir / "robots.txt"
        if not sitemap.is_file():
            self.error("sitemap.xml is missing")
        else:
            try:
                root = ElementTree.parse(sitemap).getroot()
                namespace = {"s": "http://www.sitemaps.org/schemas/sitemap/0.9"}
                urls = {element.text.strip() for element in root.findall("s:url/s:loc", namespace) if element.text}
                expected = {f"{SITE}{route}" for route in EXPECTED_PATHS}
                for missing in sorted(expected - urls):
                    self.error(f"sitemap.xml is missing {missing}")
                for unexpected in sorted(urls - expected):
                    self.error(f"sitemap.xml includes unapproved URL {unexpected}")
            except Exception as error:
                self.error(f"sitemap.xml does not parse: {error}")

        if not robots.is_file():
            self.error("robots.txt is missing")
        else:
            source = robots.read_text(encoding="utf-8")
            expected_sitemap = f"Sitemap: {SITE}/sitemap.xml"
            if expected_sitemap not in source:
                self.error(f"robots.txt must contain {expected_sitemap}")
            if re.search(r"Disallow:\s*/(?:assets|site-pages|angeltreeservices_backup_files)", source, re.IGNORECASE):
                self.error("robots.txt blocks required public assets")

    def run(self) -> None:
        if not self.site_dir.is_dir():
            self.error(f"Public artifact does not exist: {self.site_dir}")
        else:
            self.parse_pages()
            self.validate_metadata()
            self.validate_references()
            self.validate_prefill_links()
            self.validate_navigation_graph()
            self.validate_shared_navigation()
            self.validate_homepage_form()
            self.validate_homepage_search_alignment()
            self.validate_recognition_layer()
            self.validate_about_page()
            self.validate_artifact_contents()
            self.validate_sitemap_and_robots()

        if self.errors:
            print(f"Public-site validation failed with {len(self.errors)} error(s):", file=sys.stderr)
            for message in self.errors:
                print(f"- {message}", file=sys.stderr)
            raise SystemExit(1)

        print(f"Public-site validation passed: {len(self.pages)} approved pages in {self.site_dir}.")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--site-dir",
        type=Path,
        default=ROOT / "dist-public",
        help="Deployable public-site directory to validate (default: dist-public).",
    )
    return parser.parse_args()


if __name__ == "__main__":
    Validator(parse_args().site_dir).run()
