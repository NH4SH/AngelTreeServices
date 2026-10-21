"""Keep shared interior styles external and safely reusable between page visits."""
from __future__ import annotations

import json
import hashlib
import re
from pathlib import Path
from urllib.parse import urljoin, urlsplit

ORIGIN = "https://angeltreeservices.org"
CSS_URL = re.compile(r'''url\(\s*(?:"(?P<double>[^"\\]*(?:\\.[^"\\]*)*)"|'(?P<single>[^'\\]*(?:\\.[^'\\]*)*)'|(?P<bare>[^)]*))\s*\)''', re.IGNORECASE)
LINK = re.compile(r'<link rel="stylesheet" href="([^"]+)"\s*>')
SHARED_STYLES = ("/assets/css2.css", "/site-pages.css", "/ats-service-areas.css", "/ats-consent.css")


def rebase_urls(css: str, source_url: str) -> str:
    """Keep relative fonts/images pointing to the same files after moving CSS."""
    def replace(match: re.Match) -> str:
        value = next(v for v in match.groups() if v is not None).strip()
        if not value or value.startswith(("#", "/")) or urlsplit(value).scheme:
            return match.group(0)
        absolute = urlsplit(urljoin(ORIGIN + source_url, value))
        rebased = absolute.path
        if absolute.query:
            rebased += "?" + absolute.query
        if absolute.fragment:
            rebased += "#" + absolute.fragment
        return "url(" + json.dumps(rebased) + ")"
    return CSS_URL.sub(replace, css)


def stylesheet_asset(site: Path, url: str) -> tuple[str, str]:
    """Return a content-addressed URL and CSS, without changing the source file."""
    path = (site / url.lstrip("/")).resolve()
    if url not in SHARED_STYLES or not path.is_relative_to(site.resolve()) or not path.is_file():
        raise ValueError(f"Missing or unsafe stylesheet: {url}")
    css = path.read_text(encoding="utf-8")
    if re.search(r"@(?:import|charset|namespace)\b", css, re.IGNORECASE):
        raise ValueError(f"Stylesheet requires separate at-rule handling: {url}")
    css = rebase_urls(css, url)
    digest = hashlib.sha256(css.encode("utf-8")).hexdigest()[:10]
    return f"/assets/versioned/{path.stem}.{digest}.css", css


def cache_page_styles(site: Path, page: Path) -> None:
    source = page.read_text(encoding="utf-8")
    head, end, tail = source.partition("</head>")
    if not end:
        raise ValueError(f"Missing head in {page}")
    if page == site / "index.html":
        return
    selected = [match for match in LINK.finditer(head) if match.group(1).split("?")[0] in SHARED_STYLES]
    expected_paths = ["/assets/css2.css", "/site-pages.css", "/ats-consent.css"]
    actual_paths = [match.group(1).split("?")[0] for match in selected]
    if actual_paths not in (expected_paths, expected_paths[:2] + ["/ats-service-areas.css"] + expected_paths[2:]):
        raise ValueError(f"Missing or unexpected page-style inputs in {page}")
    for match in reversed(selected):
        url = urlsplit(urljoin("/" + page.relative_to(site).as_posix(), match.group(1))).path
        cached_url, css = stylesheet_asset(site, url)
        destination = site / cached_url.lstrip("/")
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_text(css, encoding="utf-8")
        replacement = f'<link rel="stylesheet" href="{cached_url}">'
        head = head[:match.start()] + replacement + head[match.end():]
    page.write_text(head + end + tail, encoding="utf-8")


def cache_public_styles(site: Path) -> None:
    for page in sorted(site.rglob("index.html")):
        cache_page_styles(site, page)
