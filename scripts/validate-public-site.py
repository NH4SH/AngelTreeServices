#!/usr/bin/env python3
"""Validate the deployable Angel Tree Services public-site artifact."""

from __future__ import annotations

import argparse
import json
import re
import sys
from collections import Counter
from datetime import datetime
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urljoin, urlparse
from xml.etree import ElementTree
from public_styles import stylesheet_asset


ROOT = Path(__file__).resolve().parents[1]
SITE = "https://angeltreeservices.org"
PHONE_LINK = "+15403888715"

EXPECTED_PATHS = (
    "/",
    "/firewood/",
    "/service-areas/",
    "/services/",
    "/services/tree-removal/",
    "/services/tree-pruning/",
    "/services/stump-grinding/",
    "/services/emergency-tree-service/",
    "/services/commercial-hoa-tree-care/",
    "/services/landscaping/",
    "/credentials-safety/",
    "/projects/",
    "/projects/hollow-tree-removal/",
    "/projects/bush-trimming-mulch/",
    "/projects/holly-tree-trimming/",
    "/about/",
    "/recognition/",
    "/privacy/",
    "/privacy-request/",
)

EXPECTED_PREFILL = {
    "/projects/holly-tree-trimming/": {"service": "Tree Care", "estimate_context": "tree-pruning"},
    "/projects/bush-trimming-mulch/": {"service": "Landscaping"},
    "/services/landscaping/": {"service": "Landscaping"},
    "/projects/hollow-tree-removal/": {"service": "Tree Care", "estimate_context": "tree-removal"},
    "/services/tree-removal/": {"service": "Tree Care", "estimate_context": "tree-removal"},
    "/services/tree-pruning/": {"service": "Tree Care", "estimate_context": "tree-pruning"},
    "/services/stump-grinding/": {"service": "Tree Care", "estimate_context": "stump-grinding"},
    "/services/emergency-tree-service/": {"service": "Storm Cleanup", "estimate_context": "emergency-tree-service"},
    "/services/commercial-hoa-tree-care/": {
        "service": "Multiple Services / Not Sure Yet",
        "customer_type": "Commercial / Property Management",
        "estimate_context": "commercial-hoa-tree-care",
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
        self.sources: list[dict[str, str]] = []
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
            if tag == "source":
                self.sources.append(values)
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

    def validate_video_structured_data(self) -> None:
        video_keys: Counter[str] = Counter()

        def objects(value: object):
            if isinstance(value, dict):
                yield value
                for child in value.values():
                    yield from objects(child)
            elif isinstance(value, list):
                for child in value:
                    yield from objects(child)

        def is_absolute_https(value: object) -> bool:
            if not isinstance(value, str):
                return False
            parsed = urlparse(value)
            return parsed.scheme == "https" and bool(parsed.netloc)

        for route, page in self.pages.items():
            for index, document in enumerate(page.json_ld, start=1):
                try:
                    schema = json.loads(document)
                except Exception:
                    continue

                for item in objects(schema):
                    if item.get("@type") != "VideoObject":
                        continue

                    label = str(item.get("name") or f"JSON-LD block {index}")
                    upload_date = item.get("uploadDate")
                    if not isinstance(upload_date, str) or not re.fullmatch(
                        r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})",
                        upload_date,
                    ):
                        self.error(f"{route}: VideoObject {label!r} needs an ISO 8601 uploadDate with a timezone")
                    else:
                        try:
                            datetime.fromisoformat(upload_date.replace("Z", "+00:00"))
                        except ValueError:
                            self.error(f"{route}: VideoObject {label!r} has an invalid uploadDate")

                    media_urls = [item.get("contentUrl"), item.get("embedUrl")]
                    if not any(is_absolute_https(value) for value in media_urls):
                        self.error(f"{route}: VideoObject {label!r} needs an absolute HTTPS contentUrl or embedUrl")
                    for field in ("contentUrl", "embedUrl"):
                        if field in item and not is_absolute_https(item[field]):
                            self.error(f"{route}: VideoObject {label!r} has an invalid {field}")

                    thumbnails = item.get("thumbnailUrl")
                    if isinstance(thumbnails, str):
                        thumbnails = [thumbnails]
                    if not isinstance(thumbnails, list) or not thumbnails or not all(
                        is_absolute_https(value) for value in thumbnails
                    ):
                        self.error(f"{route}: VideoObject {label!r} needs absolute HTTPS thumbnailUrl values")

                    identity = str(item.get("contentUrl") or item.get("embedUrl") or item.get("url") or label)
                    video_keys[f"{route}\0{identity}"] += 1

        for key, count in video_keys.items():
            if count > 1:
                route, identity = key.split("\0", 1)
                self.error(f"{route}: duplicate VideoObject emitted for {identity}")

    def validate_public_entity_graph(self) -> None:
        homepage = self.pages.get("/")
        if not homepage:
            return

        direct_nodes: list[dict] = []
        for index, document in enumerate(homepage.json_ld, start=1):
            try:
                schema = json.loads(document)
            except Exception:
                continue

            graph = schema.get("@graph", [schema])
            if not isinstance(graph, list):
                self.error(f"/: JSON-LD block {index} must use an object or @graph array")
                continue
            direct_nodes.extend(node for node in graph if isinstance(node, dict))

        websites = [node for node in direct_nodes if node.get("@type") == "WebSite"]
        businesses = [node for node in direct_nodes if node.get("@type") == "LocalBusiness"]
        if len(websites) != 1:
            self.error(f"/: expected one WebSite entity, found {len(websites)}")
        if len(businesses) != 1:
            self.error(f"/: expected one LocalBusiness entity, found {len(businesses)}")
            return

        business_id = f"{SITE}/#business"
        website_id = f"{SITE}/#website"
        business = businesses[0]
        expected_business_values = {
            "@id": business_id,
            "name": "Angel Tree Services",
            "legalName": "Angel Tree Services LLC",
            "url": f"{SITE}/",
            "telephone": "+1-540-388-8715",
            "foundingDate": "2015",
        }
        for key, expected in expected_business_values.items():
            if business.get(key) != expected:
                self.error(f"/: LocalBusiness {key} must be {expected!r}")

        if "address" in business:
            self.error("/: service-area LocalBusiness must not publish an unverified or private street address")

        expected_areas = {
            "Fredericksburg, Virginia",
            "Spotsylvania County, Virginia",
            "Stafford County, Virginia",
            "King George County, Virginia",
            "Caroline County, Virginia",
            "Orange County, Virginia",
            "Louisa County, Virginia",
            "Culpeper County, Virginia",
        }
        actual_areas = {
            area.get("name")
            for area in business.get("areaServed", [])
            if isinstance(area, dict) and isinstance(area.get("name"), str)
        }
        if actual_areas != expected_areas:
            self.error("/: LocalBusiness areaServed must contain the eight verified core service areas")

        expected_topics = {
            "Tree removal",
            "Tree pruning",
            "Stump grinding",
            "Storm-damaged tree work",
            "Commercial and HOA tree care",
            "Scientific arboriculture",
        }
        if set(business.get("knowsAbout", [])) != expected_topics:
            self.error("/: LocalBusiness knowsAbout must contain only the approved service topics")

        expected_profiles = {
            "https://www.google.com/maps/search/?api=1&query=Angel%20Tree%20Services&query_place_id=ChIJkTtDRfXAtokRlO24zHOF67o",
            "https://www.angi.com/companylist/us/va/fredericksburg/angel-tree-services-llc-reviews-9311977.htm",
            "https://www.bbb.org/us/va/fredericksburg/profile/tree-service/angel-tree-services-llc-0603-63424263",
            "https://www.instagram.com/angeltreeservices/",
        }
        if set(business.get("sameAs", [])) != expected_profiles:
            self.error("/: LocalBusiness sameAs must contain the four verified public profiles")

        if websites:
            website = websites[0]
            if website.get("@id") != website_id or website.get("url") != f"{SITE}/":
                self.error("/: WebSite identity must use the canonical homepage and stable @id")
            if website.get("publisher") != {"@id": business_id}:
                self.error("/: WebSite publisher must reference the LocalBusiness entity")

        service_areas = {
            "Fredericksburg",
            "Spotsylvania",
            "Stafford",
            "King George",
            "Caroline",
            "Orange",
            "Louisa",
            "Culpeper",
        }
        for route, page in self.pages.items():
            if not route.startswith("/services/") or route == "/services/":
                continue
            service_nodes: list[dict] = []
            for document in page.json_ld:
                try:
                    schema = json.loads(document)
                except Exception:
                    continue
                graph = schema.get("@graph", [schema])
                if isinstance(graph, list):
                    service_nodes.extend(
                        node for node in graph if isinstance(node, dict) and node.get("@type") == "Service"
                    )
            if len(service_nodes) != 1:
                self.error(f"{route}: expected one Service entity, found {len(service_nodes)}")
                continue
            service = service_nodes[0]
            if service.get("provider") != {"@id": business_id}:
                self.error(f"{route}: Service provider must reference the homepage LocalBusiness")
            if set(service.get("areaServed", [])) != service_areas:
                self.error(f"{route}: Service areaServed must contain the eight verified core areas")

    def validate_homepage_responsive_images(self) -> None:
        homepage = self.pages.get("/")
        if not homepage:
            return

        references = [reference for _, reference in homepage.references]
        if "assets/AngelChainsawSquooshed_008.jpg" in references:
            self.error("/: testimonial must not deliver the full-size legacy JPEG")

        testimonial_candidates = set(
            reference
            for reference in references
            if re.fullmatch(
                r"assets/versioned/testimonial-chainsaw-(?:320|560|840)\.[a-f0-9]{10}\.(?:avif|webp)",
                reference,
            )
        )
        if len(testimonial_candidates) != 6:
            self.error("/: testimonial must provide three hashed AVIF and three hashed WebP candidates")

        testimonial_sizes = sum(
            1
            for values in homepage.sources
            if values.get("sizes") == "(max-width: 700px) 100vw, 36vw"
        )
        if testimonial_sizes != 2:
            self.error("/: testimonial AVIF and WebP sources must share accurate responsive sizes")

        service_sizes = "(max-width: 800px) 112px, (max-width: 1500px) calc(35vw - 37px), 488px"
        if sum(image.get("sizes") == service_sizes for image in homepage.images) != 2:
            self.error("/: service images must retain the compact mobile and measured desktop width hints")

    def validate_homepage_footer_visibility(self) -> None:
        homepage_path = self.site_dir / "index.html"
        if not homepage_path.is_file():
            return

        source = homepage_path.read_text(encoding="utf-8")
        footer_match = re.search(
            r'<footer\b[^>]*\bid="footer-sections"[^>]*>(.*?)</footer>',
            source,
            re.DOTALL | re.IGNORECASE,
        )
        if not footer_match:
            self.error("/: homepage must include the public footer section")
            return

        footer = footer_match.group(1)
        if re.search(r'class="[^"]*\bpre(?:Fade|Flex)\b', footer):
            self.error("/: static footer content must not retain an unresolved animation state")
        required_links = {
            "tel:+15403888715": "(540) 388-8715",
            "mailto:info@angeltreeservice.org": "info@angeltreeservice.org",
            "/services/": "Tree services",
            "/services/landscaping/": "Landscaping",
            "/service-areas/": "Service areas",
            "#contact": "Request a free estimate",
            "/privacy/": "Privacy",
        }
        for href, label in required_links.items():
            if not re.search(r'<a\b[^>]*href="' + re.escape(href) + r'"[^>]*>' + re.escape(label) + r'</a>', footer):
                self.error(f"/: homepage footer needs a visible {label} link to {href}")
        if 'aria-label="Footer services"' not in footer:
            self.error("/: homepage footer service navigation needs an accessible label")
        if not re.search(
            r'<a\b[^>]*href="https://www\.fredericksburgchamber\.org/"[^>]*>\s*'
            r'<img\b[^>]*src="angeltreeservices_backup_files/200x200-hortz-logo\.jpg"'
            r'[^>]*alt="Fredericksburg Regional Chamber of Commerce"', footer,
        ):
            self.error("/: homepage footer must preserve the linked Chamber badge and its accessible name")

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
            measurement_scripts = [item for item in page.scripts if item.get("src", "").split("?", 1)[0] == "/ats-website.js"]
            if len(measurement_scripts) != 1 or "defer" not in measurement_scripts[0]:
                self.error(f"{route}: expected one deferred shared website initializer")
            if "google-analytics_analytics.js" in self.page_sources[route] or "gtag(" in self.page_sources[route]:
                self.error(f"{route}: legacy or duplicate analytics initialization")
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
                stylesheet_sources = [item.get("href", "") for item in page.links
                                      if "stylesheet" in item.get("rel", "").lower().split()]
                originals = ["/assets/css2.css", "/site-pages.css"]
                if route == "/service-areas/":
                    originals.append("/ats-service-areas.css")
                originals.append("/ats-consent.css")
                expected = []
                for original in originals:
                    href, css = stylesheet_asset(self.site_dir, original)
                    expected.append(href)
                    asset = self.site_dir / href.lstrip("/")
                    if not asset.is_file() or asset.read_text(encoding="utf-8") != css:
                        self.error(f"{route}: cached stylesheet is missing or stale: {href}")
                    for match in CSS_URL_PATTERN.finditer(css):
                        reference = match.group(2).strip()
                        target = self.resolve_local_reference(href, reference)
                        if target is not None and not target.is_file():
                            self.error(f"{route}: broken cached CSS asset {reference!r}")
                if stylesheet_sources != expected or 'data-ats-stylesheet=' in self.page_sources[route]:
                    self.error(f"{route}: preserve external shared stylesheet caching and cascade order")
                if "/site-pages.js" not in script_sources:
                    self.error(f"{route}: site-pages.js is not loaded")
                if not any(item.get("href") == "#main-content" for item in page.links):
                    self.error(f"{route}: skip link to #main-content is missing")
                if not any("ats-estimate-link" in item.get("class", "").split() for item in page.links):
                    self.error(f"{route}: estimate CTA class is missing")

    def validate_prefill_links(self) -> None:
        for route, expected_parameters in EXPECTED_PREFILL.items():
            page = self.pages.get(route)
            if not page:
                continue
            estimate_links = [
                item.get("href", "")
                for item in page.links
                if "ats-button--primary" in item.get("class", "").split()
            ]
            if route == "/services/emergency-tree-service/":
                buttons = [item for item in page.links if "ats-button" in item.get("class", "").split()]
                if len(buttons) != 4 or any(
                    ("ats-button--primary" if index % 2 == 0 else "ats-button--secondary")
                    not in button.get("class", "").split()
                    or (index % 2 == 0 and button.get("href") != f"tel:{PHONE_LINK}")
                    or (index % 2 == 1 and "ats-estimate-link" not in button.get("class", "").split())
                    for index, button in enumerate(buttons)
                ):
                    self.error(f"{route}: hero and final actions must put the primary phone link before the secondary estimate")
                estimate_links = [item.get("href", "") for item in buttons
                                 if "ats-estimate-link" in item.get("class", "").split()]
                if len(estimate_links) != 2:
                    self.error(f"{route}: preserve both storm estimate buttons")
            if not estimate_links:
                self.error(f"{route}: estimate CTA is missing")
                continue
            from urllib.parse import parse_qs

            for href in estimate_links:
                parsed = urlparse(href)
                if parsed.path != "/" or parsed.fragment != "contact":
                    self.error(f"{route}: estimate CTA must route to the homepage form")
                    continue
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
        desktop_keys = ["about", "services", "landscaping", "firewood", "projects", "commercial"]
        mobile_keys = [
            "services", "landscaping", "firewood", "projects", "service-areas",
            "contact", "about", "commercial", "credentials", "recognition",
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
                        self.error("/: desktop navigation must be About, Tree services, Landscaping, Firewood, Projects, Commercial")

                mobile_match = re.search(
                    r'<details\b[^>]*class="[^"]*ats-home-mobile-menu[^"]*"[^>]*>.*?'
                    r'<nav\b[^>]*>(.*?)</nav>.*?</details>',
                    source,
                    re.IGNORECASE | re.DOTALL,
                )
                if not mobile_match or keys_in(mobile_match.group(1)) != mobile_keys:
                    self.error("/: mobile navigation does not match the approved task-first order")
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

            for key, href, label in [
                ("services", "/services/", "Tree services"),
                ("landscaping", "/services/landscaping/", "Landscaping"),
                ("firewood", "/firewood/", "Firewood"),
            ]:
                matches = re.findall(r'<a\b([^>]*data-ats-nav="' + key + r'"[^>]*)>(.*?)</a>', source, re.DOTALL)
                for attrs, content in matches:
                    text = re.sub(r"<[^>]+>", "", content).strip()
                    if f'href="{href}"' not in attrs or text != label:
                        self.error(f"{route}: {key} navigation needs its own destination and sentence-case label")
                if route == "/services/landscaping/" and key == "landscaping":
                    if len(matches) != 2 or any('aria-current="page"' not in attrs for attrs, _ in matches):
                        self.error(f"{route}: Landscaping must be current in both navigation menus")
                if route == "/services/landscaping/" and key == "services":
                    if any('aria-current=' in attrs for attrs, _ in matches):
                        self.error(f"{route}: Tree services must not be marked current on Landscaping")
                if route == "/firewood/" and key == "firewood":
                    if len(matches) != 2 or any('aria-current="page"' not in attrs for attrs, _ in matches):
                        self.error(f"{route}: Firewood must be current in both navigation menus")

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
        transparent_logo_count = (
            homepage.count('/assets/angel-tree-logo-transparent.webp')
            + homepage.count('/assets/versioned/angel-tree-logo-128.')
        )
        if transparent_logo_count < 3:
            self.error("/: responsive layout headers must use the transparent logo asset")
        for route, source in self.page_sources.items():
            if route != "/" and '/assets/angel-tree-logo-transparent.webp' not in source:
                self.error(f"{route}: shared header must use the transparent logo asset")

    def validate_service_areas(self) -> None:
        route = "/service-areas/"
        source = self.page_sources.get(route, "")
        homepage = self.page_sources.get("/", "")
        coverage = json.loads((ROOT / "public-service-areas.json").read_text(encoding="utf-8"))
        expected = {
            "Fredericksburg", "Falmouth", "Spotsylvania Courthouse", "Chancellorsville",
            "Massaponax", "Lee’s Hill", "Salem Fields", "Five Mile Fork", "Stafford",
            "Hartwood", "Aquia Harbour", "Garrisonville", "Brooke", "White Oak",
            "Triangle", "Dumfries", "Montclair", "Woodbridge", "Locust Grove",
            "Lake of the Woods", "Culpeper", "Orange", "Bealeton", "Remington", "Opal",
            "Warrenton", "Thornburg", "Woodford", "Ladysmith", "Ruther Glen",
            "Bowling Green", "Lake Caroline", "Lake Land’Or", "Ashland", "Lake Anna",
            "Bumpass", "Mineral", "Louisa", "King George", "Port Royal", "Dahlgren", "Colonial Beach",
            "Westmoreland County",
            "Belmont", "Burr Hill", "Carmel Church", "Chatham", "Corbin", "Dale City", "Doswell",
            "Ferry Farm", "Four Mile Fork", "Goldvein", "Gordonsville", "Hague", "Kinsale",
            "Lake Ridge", "Leavells", "Lignum", "Mine Run", "Montross", "Morrisville", "New Post",
            "Ninde", "Oak Grove", "Occoquan", "Partlow", "Passapatanzy", "Post Oak", "Ramoth",
            "Rhoadesville", "Richardsville", "Rock Hill", "Ruby", "Sealston", "Shiloh", "Snell",
            "Stevensburg", "Sumerduck", "Todds Tavern", "Unionville", "Verdiersville", "Widewater",
            "Zion Crossroads",
        }
        places = [place for group in coverage["groups"] for place in group["places"]]
        if set(places) != expected or len(places) != len(expected):
            self.error("Service-area data must contain every confirmed non-Richmond location once")
        if coverage["richmond_tree_only"] != ["Richmond", "Glen Allen", "Short Pump", "Mechanicsville"]:
            self.error("Richmond-area tree-only locations must match the owner-confirmed list")
        tree_only = [place for group in coverage["groups"] for place in group.get("tree_only_places", [])]
        if tree_only != ["Woodbridge"]:
            self.error("Grouped tree-only exceptions must identify Woodbridge")
        if "Woodbridge (tree services only)" not in source or "landscaping is not offered there" not in source:
            self.error("Woodbridge must clearly exclude landscaping in the coverage directory")
        for group in coverage["groups"]:
            section = re.search(
                rf'<section class="ats-area-group" aria-labelledby="area-{re.escape(group["id"])}">(.*?)</section>',
                source, re.DOTALL,
            )
            actual = re.findall(r'<li>(.*?)</li>', section.group(1)) if section else []
            expected_labels = [
                place + (" (tree services only)" if place in group.get("tree_only_places", []) else "")
                for place in group["places"]
            ]
            if actual != expected_labels:
                self.error(f"Service-area group missing or incomplete: {group['id']}")
            if f'href="#area-{group["id"]}"' not in source:
                self.error(f"Service-area jump link missing: {group['id']}")
        for term in ("farther reaches of Lake Anna", "within about an hour of Fredericksburg",
                     "named places are included even when they are farther away",
                     "Landscaping is not offered in these Richmond-area communities.",
                     "Richmond, Glen Allen, Short Pump and Mechanicsville"):
            if term not in source:
                self.error(f"Service-area scope qualifier missing: {term}")
        for term in ("lawn care", "lawn-care", "all surrounding counties", "travel fee", "minimum job"):
            if term in source.lower():
                self.error(f"Service-area page includes an unapproved offering/restriction: {term}")
        position = homepage.find('id="service-areas"')
        if not homepage.find('id="faq"') < position < homepage.find('id="contact"'):
            self.error("Homepage coverage must appear between FAQ and the estimate invitation")
        block = re.search(r'<section class="ats-home-coverage".*?</section>', homepage, re.DOTALL)
        if not block or 'href="/service-areas/"' not in block.group() or "tree services only" not in block.group() or "Woodbridge" not in block.group():
            self.error("Homepage coverage needs the directory link and Woodbridge/Richmond tree-only qualifiers")
        for path, html in self.page_sources.items():
            if 'data-ats-nav="service-areas"' not in html or 'href="/service-areas/"' not in html:
                self.error(f"{path}: Service areas must be discoverable in navigation")
        if 'href="/?service=Tree%20Care#contact"' not in source:
            self.error("Richmond-area estimate must select existing Tree Care category")
        if 'href="/service-areas/"' not in self.page_sources.get("/about/", ""):
            self.error("About must link to full service coverage")
        llms = (self.site_dir / "llms.txt").read_text(encoding="utf-8")
        if "Woodbridge, Richmond, Glen Allen, Short Pump and Mechanicsville are served for tree services only, not landscaping" not in llms or "Louisa County, Culpeper County" in llms:
            self.error("Machine-readable summary must reflect named coverage and Richmond tree-only scope")

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
            "body.ok !== true",
            "form.dataset.submitting",
            "form.reset()",
        )
        combined = source + "\n" + script + "\n" + (self.site_dir / "ats-website.js").read_text(encoding="utf-8")
        for term in required_runtime_terms:
            if term not in combined:
                self.error(f"/: lead-form release invariant is missing: {term}")
        if 'credentials: "omit"' not in script:
            self.error("/: cross-origin lead request must omit credentials")

    def validate_privacy_layer(self) -> None:
        policy = self.page_sources.get("/privacy/", "")
        request = self.page_sources.get("/privacy-request/", "")
        if not policy or not request:
            self.error("Public privacy policy and request pages must both be generated")
            return

        policy_terms = (
            "Google Analytics",
            "Maps/Places",
            "Supabase",
            "Stripe",
            "Resend",
            "employee iOS app",
            "authentication",
            "retention",
        )
        for term in policy_terms:
            if term.lower() not in policy.lower():
                self.error(f"/privacy/: required disclosure is missing: {term}")

        request_terms = ("Access", "Correction", "Deletion", "Account or access removal", "verify")
        for term in request_terms:
            if term.lower() not in request.lower():
                self.error(f"/privacy-request/: required request guidance is missing: {term}")

        if re.search(r"<(?:form|input|textarea|select)\b", request, re.IGNORECASE):
            self.error("/privacy-request/: V1 must use the verified manual request workflow, not a direct mutation form")

        for route, source in self.page_sources.items():
            if 'href="/privacy/"' not in source:
                self.error(f"{route}: footer must expose the public privacy policy")

    def validate_homepage_address_autocomplete(self) -> None:
        homepage = self.page_sources.get("/", "")
        script_path = self.site_dir / "ats-address-autocomplete.js"
        if not homepage or not script_path.is_file():
            self.error("/: address autocomplete source is missing from the public artifact")
            return

        script = script_path.read_text(encoding="utf-8")
        if "__ATS_GOOGLE_MAPS_API_KEY__" in script:
            self.error("/: address autocomplete API-key placeholder was not replaced")

        key_assignment = re.search(r'^\s*var apiKey = "([^"]*)";', script, re.MULTILINE)
        if not key_assignment:
            self.error("/: address autocomplete API-key assignment is missing")
            return

        script_is_enabled = bool(key_assignment.group(1))
        autocomplete_sources = [
            item.get("src", "")
            for item in self.pages["/"].scripts
            if item.get("src", "").split("?", 1)[0] == "ats-address-autocomplete.js"
        ]
        if script_is_enabled:
            if autocomplete_sources != ["ats-address-autocomplete.js?v=release3"]:
                self.error("/: enabled address autocomplete must load the release3 script exactly once")
        elif autocomplete_sources:
            self.error("/: address autocomplete must remain optional when its public API key is absent")

        source = self.page_sources["/"]
        if 'class="ats-contact-form"' not in source or 'name="address"' not in source:
            self.error("/: autocomplete target form or address field is missing")

        required_runtime_terms = (
            '.ats-contact-form input[name="address"]',
            "enhanceAddressInput",
            'input.dataset.atsAddressAutocomplete = "true"',
            'setAttribute("role", "combobox")',
            'setAttribute("aria-autocomplete", "list")',
            'setAttribute("aria-expanded", "false")',
            "ats-address-status",
            'importLibrary("places")',
            "AutocompleteSuggestion.fetchAutocompleteSuggestions",
        )
        for term in required_runtime_terms:
            if term not in script:
                self.error(f"/: address-autocomplete release invariant is missing: {term}")

    def validate_homepage_search_alignment(self) -> None:
        homepage = self.page_sources.get("/", "")
        page = self.pages.get("/")
        if not homepage or not page:
            return

        # The owner retired this service. Check all shipped page content, metadata,
        # embedded legacy card data and the generated machine-readable summary.
        for route, source in self.page_sources.items():
            if re.search(r"lawn[\s-]+care", source, re.IGNORECASE):
                self.error(f"{route}: retired lawn-care offering must not be published")
        summary = self.site_dir / "llms.txt"
        if summary.is_file() and re.search(r"lawn[\s-]+care", summary.read_text(encoding="utf-8"), re.IGNORECASE):
            self.error("llms.txt: retired lawn-care offering must not be published")
        explore_links = [link for link in page.links if "ats-service-explore" in link.get("class", "").split()]
        if len(explore_links) != 2 or {link.get("href") for link in explore_links} != {"/services/", "/services/landscaping/"}:
            self.error("/: service cards need matching Explore actions to the services hub and Landscaping page")
        if any(link.get("data-estimate-service") for link in explore_links):
            self.error("/: service exploration must navigate to its page, not be intercepted as estimate selection")
        if '<option value="Landscaping">Landscaping</option>' not in homepage:
            self.error("/: landscaping must remain available in the estimate form")

        expected_title = "Tree Service in Fredericksburg, VA | Angel Tree Services"
        expected_heading = "Your yard’s best friend."
        expected_eyebrow = "Fredericksburg Tree Service"
        expected_description = (
            "Certified-arborist-led tree service in Fredericksburg for removal, pruning, storm "
            "cleanup, stump grinding, and landscaping. Free estimates."
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

    def validate_homepage_faq(self) -> None:
        homepage = self.page_sources.get("/", "")
        if not homepage:
            return

        faq_match = re.search(
            r'<section class="ats-home-faq".*?</section>',
            homepage,
            re.IGNORECASE | re.DOTALL,
        )
        if not faq_match:
            self.error("/: pre-hire FAQ section is missing")
            return

        faq = faq_match.group(0)
        required_terms = (
            "What homeowners ask",
            "Straight answers before you book.",
            "From tree removal costs to cleanup, here’s what to expect before you request an estimate.",
            "How much does tree removal cost?",
            "Are estimates free, and what will my quote include?",
            "Can my tree be saved instead of removed?",
            "Can you work near my house, fence or garden?",
            "Is stump grinding included with tree removal?",
            "Do you haul away the wood and clean up?",
            "Are you insured and led by an ISA Certified Arborist?",
            "What should I do about a fallen or storm-damaged tree?",
            "Do you offer a veterans discount?",
            "Do you also offer landscaping?",
            "Only when it is listed in your written estimate.",
            "certificate of insurance on request",
            "Call 911 for immediate danger",
            "electric utility",
            "24/7 emergency storm response for serious damage and urgent hazards",
            "timing depends on conditions, crew safety, location and severity",
            "5% discount for work at residential properties only",
            "full service and material subtotal before taxes and fees",
            "cannot be combined with other discounts",
            "bush and hedge trimming, weeding, edging and mulch work",
            'href="/services/landscaping/"',
            'href="/credentials-safety/"',
            'href="/services/tree-removal/"',
            'href="/services/tree-pruning/"',
            'href="/projects/"',
            'href="/services/stump-grinding/"',
            'href="/services/emergency-tree-service/"',
            'href="/service-areas/"',
            'href="tel:+15403888715"',
            'href="#contact"',
        )
        for term in required_terms:
            if term not in faq:
                self.error(f"/: FAQ invariant is missing: {term}")

        if len(re.findall(r"<details\b", faq, re.IGNORECASE)) != 10:
            self.error("/: homepage FAQ must contain exactly ten native disclosures")
        if len(re.findall(r"<summary\b", faq, re.IGNORECASE)) != 10:
            self.error("/: every homepage FAQ disclosure must have a native summary")
        if faq.count('name="ats-home-faq"') != 10:
            self.error("/: FAQ disclosures must share the single-open native group name")
        if '"FAQPage"' in homepage or "'FAQPage'" in homepage:
            self.error("/: homepage must not add FAQPage structured data")

        recognition_position = homepage.find('class="ats-home-recognition"')
        faq_position = homepage.find('class="ats-home-faq"')
        contact_position = homepage.find('id="contact"')
        if min(recognition_position, faq_position, contact_position) < 0 or not (
            recognition_position < faq_position < contact_position
        ):
            self.error("/: FAQ must remain after recognition and before the estimate form")

    def validate_recognition_layer(self) -> None:
        homepage = self.page_sources.get("/", "")
        recognition = self.page_sources.get("/recognition/", "")
        if not homepage or not recognition:
            return
        combined_public_html = "\n".join(self.page_sources.values())

        required_homepage_terms = (
            "Certified Arborist-led &middot; Insured &middot; 30+ years of tree-industry experience",
            "Saul Sierra Hernandez",
            "ISA Certified Arborist&reg; &middot; MA-381822A",
            "angeltreeservices_backup_files/isamember1_004.jpg",
            'alt="ISA Certified Arborist"',
            "Insured &middot; 30+ years of tree-industry experience",
            "140+",
            "4.9 average",
            "Voted a 2026 Best of the Burg Finalist",
            "Featured by NBC4",
            "5.0 out of 5 stars",
            "44 customer reviews",
            "A+",
            "BBB rating",
            "Mark Mayer",
            "I was pleased with the quote... and then thrilled with the fantastic job the crew did in every respect... We will use them again, and have already referred them to others!",
            "Google Review &middot; July 2026",
            "/recognition/",
            "2026 Best of the Burg Finalist, Best Tree Trim/Removal Services",
            '"@type": "NewsArticle"',
            '"@type": "VideoObject"',
        )
        for term in required_homepage_terms:
            if term not in homepage:
                self.error(f"/: recognition invariant is missing: {term}")
        if "Not BBB Accredited" in homepage:
            self.error("/: homepage BBB card must not include the negative accreditation qualifier")

        homepage_images = {
            image.get("alt", ""): image for image in self.pages["/"].images
        }
        for alt in (
            "ISA Member",
            "ISA Certified Arborist",
        ):
            image = homepage_images.get(alt)
            if image is None:
                self.error(f"/: static homepage credential image is missing: {alt}")
                continue
            if image.get("loading", "").lower() == "lazy":
                self.error(f"/: homepage credential image must load on first paint, not lazily: {alt}")
            if not image.get("width") or not image.get("height"):
                self.error(f"/: homepage credential image must reserve explicit dimensions: {alt}")

        public_scripts = "\n".join(
            path.read_text(encoding="utf-8")
            for path in self.site_dir.rglob("*.js")
        )
        if "ats-mobile-trust" in public_scripts or "isamember1_004.jpg" in public_scripts or "certified-arborist.png" in public_scripts:
            self.error("/: homepage credential card must remain static HTML and must not be injected by JavaScript")

        hierarchy_positions = (
            homepage.find("ats-mobile-hero"),
            homepage.find("ats-mobile-trust"),
            homepage.find("ats-home-recognition-strip"),
            homepage.find('id="about"'),
            homepage.find("ats-home-testimonial"),
        )
        if any(position < 0 for position in hierarchy_positions) or hierarchy_positions != tuple(sorted(hierarchy_positions)):
            self.error("/: hero, credential card, immediate recognition, services, and testimonial must retain the approved order")

        required_recognition_terms = (
            "140+",
            "4.9 average",
            "5.0 out of 5 stars",
            "44 customer reviews",
            "A+",
            "BBB rating",
            "Independent platforms, shown separately.",
            "Certified Arborist-led",
            "Certificates of insurance are available upon request",
            "Previously recognized with Angi’s Super Service Award",
            "K P",
            "2nd 5 star review from me... They literally left no ‘tree/leaf crumbs.’ Would hire again!",
            "Google · Updated July 2026",
            "Carolyn K.",
            "Tim S.",
            "Google · 2023",
            "Anne L.",
            "JOHN P.",
            "Angi · 2024",
            "Best Tree Trim/Removal Services",
            "Best of the Burg finalist",
            "September 19, 2024",
            "NBC4 Responds",
            "data-video-id=\"QwfdLmPTQAk\"",
            "https://www.google.com/maps/search/?api=1",
            "https://www.angi.com/companylist/us/va/fredericksburg/angel-tree-services-llc-reviews-9311977.htm",
            "https://www.bbb.org/us/va/fredericksburg/profile/tree-service/angel-tree-services-llc-0603-63424263",
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
        if "Not BBB Accredited" in recognition:
            self.error("/recognition/: BBB metric must not include the negative accreditation qualifier")

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
            "Kathleen Humphries",
            "Saul was extremely knowledgeable... assessed the health of our trees and offered guidance for future work.",
            "Google · 2026",
        ):
            if term not in credentials:
                self.error(f"/credentials-safety/: professional-affiliation invariant is missing: {term}")

        commercial = self.page_sources.get("/services/commercial-hoa-tree-care/", "")
        for term in (
            "donnysmooth",
            "Chancellor Green HOA President",
            "Some trees in between houses... required all sorts of ropes, pulleys and bucket trucks to bring down safely while not damaging anyone’s property.",
            "Google · 2026",
        ):
            if term not in commercial:
                self.error(f"/services/commercial-hoa-tree-care/: customer-proof invariant is missing: {term}")
        if "[trees]" in commercial:
            self.error("/services/commercial-hoa-tree-care/: obsolete bracketed testimonial text found")

        if re.search(r"\b212\s+(?:referral|referrals)\b", combined_public_html, re.IGNORECASE):
            self.error("Public pages must not include the unsupported 212 referrals claim")

        if "biz.yelp.com" in combined_public_html:
            self.error("Public pages must not link to the Yelp owner-management interface")

        if re.search(r"(?<!Not )BBB Accredited", combined_public_html, re.IGNORECASE):
            self.error("Public pages must not claim BBB Accreditation")

        if re.search(r"\b(?:fully insured|Certified Arborists|ISA-certified company|ISA-approved)\b", combined_public_html, re.IGNORECASE):
            self.error("Public pages contain an unsupported credential or insurance phrase")

        if re.search(r"\b165\+ five-star reviews\b", combined_public_html, re.IGNORECASE):
            self.error("Public pages must not combine review-platform counts")

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
            "4.9 stars from 140+ Google reviews",
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

    def validate_project_case_study(self) -> None:
        route = "/projects/hollow-tree-removal/"
        page = self.pages.get(route)
        if not page:
            return
        project = json.loads((ROOT / "public-tree-removal-project.json").read_text(encoding="utf-8"))
        source = self.page_sources[route]
        photos = [image for image in page.images if image.get("src", "").startswith("/assets/versioned/project-")]
        if len(photos) != 6:
            self.error(f"{route}: expected all six approved project images")
        from html import escape
        for expected in project["photos"]:
            matches = [image for image in photos if image.get("src") == expected["src"]]
            if len(matches) != 1:
                self.error(f"{route}: missing or duplicate project image {expected['key']}")
                continue
            image = matches[0]
            if image.get("alt") != expected["alt"] or not image.get("width") or not image.get("height"):
                self.error(f"{route}: project image {expected['key']} needs its approved alt and dimensions")
            for variant in expected["variants"]:
                if f"{variant['src']} {variant['width']}w" not in image.get("srcset", ""):
                    self.error(f"{route}: responsive variant missing for {expected['key']}")
            if escape(expected["caption"]) not in source:
                self.error(f"{route}: approved caption missing for {expected['key']}")
        if 'fetchpriority="high"' not in source or sum(image.get("loading") == "lazy" for image in photos) != 5:
            self.error(f"{route}: prioritize the lead photo and lazy-load the five later photos")
        for key in ("identification", "tree_risk"):
            if escape(project[key]["body"]) not in source:
                self.error(f"{route}: approved {key} wording is missing")
        for private_note in ("Before publication", "Private case study draft", "Owner confirmed", "/Volumes/"):
            if private_note in source:
                self.error(f"{route}: private review notes must not enter the public artifact")
        for entry in ("/projects/", "/services/tree-removal/"):
            if not any(link.get("href") == route for link in self.pages[entry].links):
                self.error(f"{entry}: case study is not linked")
        removal = self.page_sources["/services/tree-removal/"]
        spotlights = re.findall(r'<section[^>]*data-tree-removal-spotlight[^>]*>.*?</section>', removal, re.DOTALL)
        if len(spotlights) != 1:
            self.error("Tree Removal must contain its project spotlight exactly once")
        else:
            spotlight = spotlights[0]
            if removal.index(spotlight) > removal.index("Scope and expectations"):
                self.error("Tree Removal spotlight must precede the scope section")
            bucket = next(photo for photo in project["photos"] if photo["key"] == "bucket-access")
            if f'src="{bucket["src"]}"' not in spotlight or escape(bucket["caption"]) not in spotlight:
                self.error("Tree Removal spotlight must use the approved bucket-access photo and caption")
            if f'href="{escape(project["estimate_href"], quote=True)}"' not in spotlight:
                self.error("Tree Removal spotlight estimate must preserve its existing service/context destination")
        for link in page.links:
            if "ats-estimate-link" in link.get("class", "").split() and link.get("href") != project["estimate_href"]:
                self.error(f"{route}: an estimate action lost the existing tree-removal context")
        works = [item for block in page.json_ld for item in json.loads(block).get("@graph", []) if item.get("@type") == "CreativeWork"]
        if len(works) != 1 or len(works[0].get("image", [])) != 6:
            self.error(f"{route}: expected one CreativeWork with all six project images")
        elif any(key in works[0] for key in ("datePublished", "dateCreated", "review", "aggregateRating")):
            self.error(f"{route}: do not invent job dates or customer-review schema")

    def validate_landscaping_case_study(self) -> None:
        from html import escape
        project = json.loads((ROOT / "public-landscaping-project.json").read_text(encoding="utf-8"))
        photography = json.loads((ROOT / "public-site-photography.json").read_text(encoding="utf-8"))
        route = project["path"]
        page = self.pages.get(route)
        if not page:
            return
        source = self.page_sources[route]
        expected_photos = [photography[item["key"]] for item in project["photos"]]
        photos = [item for item in page.images if item.get("src") in {photo["src"] for photo in expected_photos}]
        if len(photos) != 2:
            self.error(f"{route}: expected both approved finished-work photos exactly once")
        for index, (expected, content) in enumerate(zip(expected_photos, project["photos"])):
            matches = [item for item in photos if item.get("src") == expected["src"]]
            if len(matches) != 1:
                self.error(f"{route}: missing or duplicate approved photo {content['key']}")
                continue
            image = matches[0]
            if image.get("alt") != expected["alt"] or not image.get("width") or not image.get("height"):
                self.error(f"{route}: photo needs descriptive alt and intrinsic dimensions")
            if any(f"{variant['src']} {variant['width']}w" not in image.get("srcset", "") for variant in expected["variants"]):
                self.error(f"{route}: approved responsive photo variants are missing")
            if escape(content["caption"]) not in source:
                self.error(f"{route}: approved photo caption is missing")
            if (index == 0 and image.get("fetchpriority") != "high") or (index == 1 and image.get("loading") != "lazy"):
                self.error(f"{route}: prioritize the lead photo and lazy-load the later photo")
        for term in ("existing bushes", "Weeding", "Edging", "Mulch work"):
            if term not in source:
                self.error(f"{route}: confirmed work is missing: {term}")
        for entry in ("/projects/", "/services/landscaping/"):
            if not any(link.get("href") == route for link in self.pages[entry].links):
                self.error(f"{entry}: Landscaping case study must be discoverable")
        for link in page.links:
            if "ats-estimate-link" in link.get("class", "").split() and link.get("href") != project["estimate_href"]:
                self.error(f"{route}: estimate action lost its Landscaping category")
        works = [item for block in page.json_ld for item in json.loads(block).get("@graph", []) if item.get("@type") == "CreativeWork"]
        if len(works) != 1:
            self.error(f"{route}: expected one CreativeWork")
        else:
            work = works[0]
            if work.get("image") != [f"{SITE}{photo['src']}" for photo in expected_photos] or work.get("about") != {"@id": f"{SITE}/services/landscaping/#service"}:
                self.error(f"{route}: project schema must describe its own photos and Landscaping service")
            if any(key in work for key in ("datePublished", "dateCreated", "review", "aggregateRating", "locationCreated")):
                self.error(f"{route}: do not invent job dates, location or reviews")

    def validate_trimming_case_study(self) -> None:
        from html import escape
        project = json.loads((ROOT / "public-trimming-project.json").read_text(encoding="utf-8"))
        photography = json.loads((ROOT / "public-drive-photography.json").read_text(encoding="utf-8"))
        route = project["path"]
        page = self.pages.get(route)
        if not page:
            return
        source = self.page_sources[route]
        expected = [photography[item["key"]] for item in project["photos"]]
        images = [image for image in page.images if image.get("src") in {photo["src"] for photo in expected}]
        if [image.get("src") for image in images] != [photo["src"] for photo in expected]:
            self.error(f"{route}: red-building photo must appear first and tower photo second, each once")
        for index, (photo, content) in enumerate(zip(expected, project["photos"])):
            matches = [image for image in images if image.get("src") == photo["src"]]
            if len(matches) != 1:
                continue
            image = matches[0]
            if image.get("alt") != photo["alt"] or image.get("width") != str(photo["width"]) or image.get("height") != str(photo["height"]):
                self.error(f"{route}: approved photo needs its descriptive alt and intrinsic dimensions")
            if any(f"{variant['src']} {variant['width']}w" not in image.get("srcset", "") for variant in photo["variants"]):
                self.error(f"{route}: responsive photo variants are missing")
            if escape(content["caption"]) not in source:
                self.error(f"{route}: approved caption is missing")
            if (index == 0 and image.get("fetchpriority") != "high") or (index == 1 and image.get("loading") != "lazy"):
                self.error(f"{route}: prioritize the red-building photo and lazy-load the tower photo")
        main = re.search(r'<main\b[^>]*>(.*?)</main>', source, re.DOTALL)
        if not main or re.search(r'\b20\d{2}\b|before.and.after|Greenwell Fitness', main[1], re.IGNORECASE):
            self.error(f"{route}: omit the job year, before/after claim and unverified business spelling")
        for term in ("holly", "Purina Tower", "Green Fitness &amp; Wellness"):
            if term not in source:
                self.error(f"{route}: confirmed project detail is missing: {term}")
        for entry in ("/projects/", "/services/tree-pruning/"):
            if not any(link.get("href") == route for link in self.pages[entry].links):
                self.error(f"{entry}: trimming case study must be discoverable")
        for link in page.links:
            if "ats-estimate-link" in link.get("class", "").split() and link.get("href") != project["estimate_href"]:
                self.error(f"{route}: estimate action lost the existing pruning context")
        works = [item for block in page.json_ld for item in json.loads(block).get("@graph", []) if item.get("@type") == "CreativeWork"]
        if len(works) != 1 or works[0].get("image") != [f"{SITE}{photo['src']}" for photo in expected] or works[0].get("about") != {"@id": f"{SITE}/services/tree-pruning/#service"}:
            self.error(f"{route}: project schema must describe its own two photos and pruning service")
        elif any(key in works[0] for key in ("datePublished", "dateCreated", "review", "aggregateRating")):
            self.error(f"{route}: do not invent project dates or customer-review schema")

    def validate_artifact_contents(self) -> None:
        # Every estimate action on the new service page must keep its category,
        # including shared footer and mobile actions; no new intent is needed.
        landscaping = self.pages.get("/services/landscaping/")
        if landscaping:
            for link in landscaping.links:
                if "ats-estimate-link" in link.get("class", "").split():
                    if link.get("href") != "/?service=Landscaping#contact":
                        self.error("/services/landscaping/: an estimate action lost its existing Landscaping category")
        for route, page in self.pages.items():
            for link in page.links:
                if link.get("target", "").lower() != "_blank":
                    continue
                relationships = set(link.get("rel", "").lower().split())
                if not {"noopener", "noreferrer"}.issubset(relationships):
                    self.error(f"{route}: new-tab link must use rel=\"noopener noreferrer\"")

        responsive_image_expectations = {
            "/services/landscaping/": ("photo-garden-path-480", "photo-commercial-detail-480"),
            "/projects/": ("photo-garden-path-480", "photo-flowering-tree-480", "photo-commercial-overview-480", "photo-commercial-detail-480"),
            "/about/": ("service-tree-320",),
            "/services/tree-removal/": ("service-tree-320",),
            "/services/commercial-hoa-tree-care/": ("photo-commercial-overview-480",),
        }
        for route, expected_assets in responsive_image_expectations.items():
            source = self.page_sources.get(route, "")
            for expected_asset in expected_assets:
                if expected_asset not in source:
                    self.error(f"{route}: responsive image candidate is missing: {expected_asset}")

        shared_styles = (self.site_dir / "site-pages.css").read_text(encoding="utf-8")
        if re.search(r"transition\s*:[^;]*(?:padding|margin|width|height|top|left)", shared_styles):
            self.error("Generated-page interaction styles must not animate layout properties")

        expected_legacy_assets = {
            "200x200-hortz-logo.jpg",
            "LightroomGrassPictureSquooshed_013.jpg",
            "isamember1_004.jpg",
        }
        if list(self.site_dir.rglob("google-analytics_analytics.js")):
            self.error("Public artifact must not ship the legacy analytics no-op")
        analytics = (self.site_dir / "ats-website.js").read_text(encoding="utf-8")
        if "var COLLECTION_ENABLED = true;" not in analytics or 'var MEASUREMENT_ID = "G-8WMD200TXP";' not in analytics:
            self.error("Analytics must use the owner-approved public website property")
        if 'consent !== "granted"' not in analytics or 'allow_google_signals: false' not in analytics or 'allow_ad_personalization_signals: false' not in analytics:
            self.error("Analytics requires opt-in and disabled advertising features")
        for route, source in self.page_sources.items():
            if source.count('id="ats-consent"') != 1 or source.count('src="/ats-consent.js?v=consent3"') != 1:
                self.error(f"{route}: public consent controls must load exactly once")
            if source.count('data-ats-privacy aria-controls="ats-consent"') != 1:
                self.error(f"{route}: expose exactly one keyboard-accessible Privacy settings control")
            footer_marker = '<footer class="ats-page-footer">' if '<footer class="ats-page-footer">' in source else '<footer class="sections" id="footer-sections"'
            footer = source.partition(footer_marker)[2].partition("</footer>")[0]
            if 'data-ats-privacy aria-controls="ats-consent"' not in footer:
                self.error(f"{route}: Privacy settings control must be in the public footer")
            consent_href = "/ats-consent.css?v=consent3" if route == "/" else stylesheet_asset(self.site_dir, "/ats-consent.css")[0]
            if f'href="{consent_href}"' not in source:
                self.error(f"{route}: public consent styles missing")
        legacy_directory = self.site_dir / "angeltreeservices_backup_files"
        delivered_legacy_assets = (
            {path.name for path in legacy_directory.iterdir() if path.is_file()}
            if legacy_directory.is_dir()
            else set()
        )
        if delivered_legacy_assets != expected_legacy_assets:
            self.error("Public artifact must include only the three homepage legacy assets still in use")

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
            self.site_dir / "ats-estimate-draft.js",
            self.site_dir / "site-pages.css",
            self.site_dir / "site-pages.js",
            self.site_dir / "tree-removal-mobile.js",
            self.site_dir / "tree-pruning-mobile.js",
            self.site_dir / "stump-grinding-mobile.js",
            self.site_dir / "emergency-tree-mobile.js",
            self.site_dir / "commercial-hoa-mobile.js",
            self.site_dir / "about-mobile.js",
            self.site_dir / "landscaping-mobile.js",
            self.site_dir / "services-overview-mobile.js",
            self.site_dir / "projects-mobile.js",
            self.site_dir / "recognition-mobile.js",
            self.site_dir / "credentials-mobile.js",
            self.site_dir / "service-areas-mobile.js",
            self.site_dir / "case-studies-mobile.js",
            self.site_dir / "ats-website.js",
            self.site_dir / "sitemap.xml",
            self.site_dir / "robots.txt",
            self.site_dir / "llms.txt",
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

    def validate_llms_document(self) -> None:
        llms = self.site_dir / "llms.txt"
        if not llms.is_file():
            self.error("llms.txt is missing")
            return

        raw = llms.read_bytes()
        if raw.startswith(b"\xef\xbb\xbf"):
            self.error("llms.txt must use UTF-8 without a byte-order mark")
        if b"\r\n" in raw or b"\r" in raw:
            self.error("llms.txt must use Unix line endings")

        try:
            source = raw.decode("utf-8")
        except UnicodeDecodeError as error:
            self.error(f"llms.txt is not valid UTF-8: {error}")
            return

        if not source.startswith("# Angel Tree Services\n"):
            self.error("llms.txt must begin with the Angel Tree Services heading")
        if not source.endswith("\n"):
            self.error("llms.txt must end with a newline")

        word_count = len(re.findall(r"\b[\w’'-]+\b", source))
        if not 900 <= word_count <= 1500:
            self.error(f"llms.txt should contain 900–1,500 words; found {word_count}")

        required_terms = (
            "Angel Tree Services LLC",
            "family-operated",
            "founded in 2015",
            "more than 30 years of tree-industry experience",
            "Fredericksburg",
            "Spotsylvania",
            "Stafford",
            "ISA Certified Arborist",
            "ISA member",
            "general liability insurance",
            "workers' compensation coverage",
            "Best of the Burg finalist",
            "NBC4",
            f"{SITE}/",
            f"{SITE}/services/",
            f"{SITE}/services/tree-removal/",
            f"{SITE}/services/tree-pruning/",
            f"{SITE}/services/stump-grinding/",
            f"{SITE}/services/emergency-tree-service/",
            f"{SITE}/services/commercial-hoa-tree-care/",
            f"{SITE}/credentials-safety/",
            f"{SITE}/projects/",
            f"{SITE}/about/",
            f"{SITE}/recognition/",
        )
        lower_source = source.lower()
        for term in required_terms:
            if term.lower() not in lower_source:
                self.error(f"llms.txt is missing required public fact or resource: {term}")

        forbidden_terms = (
            "lawn care",
            "lawn-care",
            "lawn and property-care",
            "admin.angeltreeservices.org",
            "netlify.app",
            "supabase",
            "customer portal",
            "employee portal",
            "quote portal",
            "invoice portal",
            "service role",
            "internal api",
            "trademark strategy",
            "github.com",
            "asplundh",
            "competitor",
        )
        for term in forbidden_terms:
            if term in lower_source:
                self.error(f"llms.txt includes forbidden private or noncanonical content: {term}")

        urls = re.findall(r"https://[^\s)>]+", source)
        for url in urls:
            parsed = urlparse(url)
            if parsed.netloc != "angeltreeservices.org":
                self.error(f"llms.txt includes a noncanonical URL: {url}")
            if re.search(r"[?&](?:token|access_token|quote_token|invoice_token)=", url, re.IGNORECASE):
                self.error(f"llms.txt includes a tokenized URL: {url}")

        robots = self.site_dir / "robots.txt"
        if robots.is_file() and "llms.txt" in robots.read_text(encoding="utf-8"):
            self.error("robots.txt must not list llms.txt as a sitemap or directive")

        netlify_config = (ROOT / "netlify.toml").read_text(encoding="utf-8")
        if not re.search(
            r'for\s*=\s*"/llms\.txt"[\s\S]*?Content-Type\s*=\s*"text/plain;\s*charset=utf-8"',
            netlify_config,
        ):
            self.error("netlify.toml must explicitly serve llms.txt as text/plain; charset=utf-8")

    def validate_domain_redirects(self) -> None:
        redirects = self.site_dir / "_redirects"
        expected_rules = [
            "http://angeltreeservice.com/* https://angeltreeservices.org/:splat 301!",
            "https://angeltreeservice.com/* https://angeltreeservices.org/:splat 301!",
            "http://www.angeltreeservice.com/* https://angeltreeservices.org/:splat 301!",
            "https://www.angeltreeservice.com/* https://angeltreeservices.org/:splat 301!",
            "http://angeltreeservice.org/* https://angeltreeservices.org/:splat 301!",
            "https://angeltreeservice.org/* https://angeltreeservices.org/:splat 301!",
            "http://www.angeltreeservice.org/* https://angeltreeservices.org/:splat 301!",
            "https://www.angeltreeservice.org/* https://angeltreeservices.org/:splat 301!",
        ]

        if not redirects.is_file():
            self.error("_redirects is missing from the public artifact")
            return

        rules = [
            line.strip()
            for line in redirects.read_text(encoding="utf-8").splitlines()
            if line.strip() and not line.lstrip().startswith("#")
        ]
        if rules != expected_rules:
            self.error("_redirects must contain only the approved alternate-domain 301 rules in order")

        for rule in rules:
            if "admin.angeltreeservices.org" in rule:
                self.error("_redirects must not target the admin application")
            if rule.startswith(("http://angeltreeservices.org/", "https://angeltreeservices.org/")):
                self.error("_redirects must not redirect the canonical plural domain")

    def validate_netlify_security_headers(self) -> None:
        source = (ROOT / "netlify.toml").read_text(encoding="utf-8")
        expected_headers = (
            'Permissions-Policy = "camera=(), microphone=(), geolocation=()"',
            'Referrer-Policy = "strict-origin-when-cross-origin"',
            'X-Content-Type-Options = "nosniff"',
            'X-Frame-Options = "SAMEORIGIN"',
        )
        for header in expected_headers:
            if header not in source:
                self.error(f"netlify.toml is missing the public security header: {header}")

    def validate_firewood(self) -> None:
        source = self.page_sources.get('/firewood/', '')
        data = json.loads((ROOT / 'public-firewood.json').read_text())
        rows = re.findall(r'<article class="ats-firewood-price">.*?</article>', source, re.DOTALL)
        if len(rows) != 3:
            self.error('Firewood must show three clearly separated quantity/price rows')
        for row, item in zip(rows, data['quantities']):
            total = item['delivered_price'] + data['stacking_fee']
            if total != item['delivered_stacked_price']:
                self.error('Firewood stacked total must include the stacking fee exactly once')
            for text in (item['label'], f"${item['delivered_price']}", f'With stacking: ${total}'):
                if text not in row:
                    self.error(f'Firewood pricing row is missing {text}')
        if not data['delivery_included'] or 'Delivered prices' not in source:
            self.error('Firewood base prices must clearly include delivery')
        if data['stacking_fee'] != 150 or data['stacking_fee_basis'] != 'per delivery':
            self.error('Firewood must use the confirmed $150 stacking charge per delivery')
        if 'Optional stacking: +$150 per delivery.' not in source or '$150 delivery' in source:
            self.error('Firewood must separate optional stacking from the delivered price')
        if [(x['label'], x['delivered_price'], x['delivered_stacked_price']) for x in data['quantities']] != [('Full cord', 450, 600), ('Half cord', 300, 450)]:
            self.error('Firewood prices must match the owner-confirmed delivered and stacked totals')
        checkout = data.get('checkout', {})
        checkout_url = 'https://checkout.angeltreeservices.org/firewood/checkout/'
        if checkout != {'url': checkout_url, 'maximum_cords': 2, 'two_cords_delivered_price': 840, 'two_cords_stacked_price': 990}:
            self.error('Firewood ordering must use the approved address, quantity limit and two-cord prices')
        if len(rows) == 3 and any(text not in rows[2] for text in ('Two cords', '$840', 'With stacking: $990', 'Save 30%', 'four half-cord orders, before stacking')):
            self.error('Two-cord savings must state the correct prices and half-cord comparison before stacking')
        half_price = next(item['delivered_price'] for item in data['quantities'] if item['label'] == 'Half cord')
        comparison_price = half_price * 4
        two_price = checkout.get('two_cords_delivered_price', 0)
        if (comparison_price - two_price) * 100 != comparison_price * 30 or two_price + data['stacking_fee'] != checkout.get('two_cords_stacked_price'):
            self.error('Two-cord pricing must give exactly 30% savings before the single stacking charge')
        if source.count(f'href="{checkout_url}"') != 3 or 'for personal household use' not in source or 'before paying' not in source:
            self.error('Firewood must link to the permanent checkout and explain household ordering and payment review')
        coverage = re.search(r'<ul class="ats-firewood-areas">(.*?)</ul>', source, re.DOTALL)
        if not coverage or re.findall(r'<li>(.*?)</li>', coverage[1]) != data['delivery_areas']:
            self.error('Firewood delivery must list only its confirmed areas')
        confirmed_terms = ('red oak', 'hickory', 'white oak', 'after splitting', '14 inches', 'wheelbarrow', 'reasonable distance')
        for term in confirmed_terms:
            if term not in source.lower():
                self.error(f'Firewood buying guidance is missing its confirmed {term!r} detail')
        if data.get('minimum_seasoning_months_after_splitting') != 12 or data.get('typical_log_length_inches') != 14:
            self.error('Firewood seasoning and approximate length must match the owner-confirmed facts')
        faq = re.search(r'<h2\b[^>]*id="firewood-faq"[^>]*>.*?</h2>(.*?)</section>', source, re.DOTALL)
        if not faq or len(re.findall(r'<summary\b', faq[1])) != 5:
            self.error('Firewood buying guidance must include five FAQs')
        if any(term in source.lower() for term in ('kiln-dried', 'ready to burn', 'free delivery', 'in stock')):
            self.error('Firewood must not invent drying, stock or delivery claims')
        if '<form' in source or 'estimate_context=firewood' in source:
            self.error('Firewood must not introduce a form or unsupported CRM estimate category')
        for anchor in ('firewood-prices', 'firewood-delivery'):
            if f'id="{anchor}"' not in source:
                self.error(f'Firewood page is missing its {anchor} anchor')

    def run(self) -> None:
        if not self.site_dir.is_dir():
            self.error(f"Public artifact does not exist: {self.site_dir}")
        else:
            self.parse_pages()
            self.validate_metadata()
            self.validate_public_entity_graph()
            self.validate_homepage_responsive_images()
            self.validate_homepage_footer_visibility()
            self.validate_video_structured_data()
            self.validate_references()
            self.validate_prefill_links()
            self.validate_navigation_graph()
            self.validate_shared_navigation()
            self.validate_firewood()
            self.validate_service_areas()
            self.validate_homepage_form()
            self.validate_privacy_layer()
            self.validate_homepage_address_autocomplete()
            self.validate_homepage_search_alignment()
            self.validate_homepage_faq()
            self.validate_recognition_layer()
            self.validate_about_page()
            self.validate_project_case_study()
            self.validate_landscaping_case_study()
            self.validate_trimming_case_study()
            self.validate_artifact_contents()
            self.validate_sitemap_and_robots()
            self.validate_llms_document()
            self.validate_domain_redirects()
            self.validate_netlify_security_headers()

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
