#!/usr/bin/env python3
"""Assemble the deployable Angel Tree Services static website."""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "dist-public"

STATIC_FILES = (
    "_redirects",
    "index.html",
    "overrides.css",
    "ats-form-enhancements.js",
    "ats-address-autocomplete.js",
    "site-pages.css",
    "site-pages.js",
)

STATIC_DIRECTORIES = (
    "assets",
    "angeltreeservices_backup_files",
)

HOMEPAGE_FOOTER_ALIGNMENT_CSS = """

/* Center the legacy Chamber membership block in the homepage footer. */
@media (min-width: 768px) {
  #footer-sections .fe-block-yui_3_17_2_1_1695766381503_12458 {
    grid-column: 1 / -1 !important;
    justify-self: center !important;
    width: min(320px, 100%) !important;
  }
}

#footer-sections .fe-block-yui_3_17_2_1_1695766381503_12458 .sqs-block,
#footer-sections .fe-block-yui_3_17_2_1_1695766381503_12458 .sqs-block-content,
#footer-sections #mni-membership-638313265276444260 {
  width: 100%;
  margin-inline: auto;
  text-align: center;
}
"""

GOOGLE_MAPS_API_KEY_PLACEHOLDER = "__ATS_GOOGLE_MAPS_API_KEY__"
FORM_ENHANCEMENT_SCRIPT = '<script defer src="ats-form-enhancements.js?v=release1"></script>'
ADDRESS_AUTOCOMPLETE_SCRIPT = '<script defer src="ats-address-autocomplete.js?v=release3"></script>'


def require_source(path: Path) -> None:
    if not path.exists():
        raise FileNotFoundError(f"Required public-site source is missing: {path.relative_to(ROOT)}")


def prepare_output() -> None:
    resolved_output = OUTPUT.resolve()
    expected_output = (ROOT / "dist-public").resolve()

    if resolved_output != expected_output or resolved_output == ROOT.resolve():
        raise RuntimeError(f"Refusing to replace unsafe output directory: {resolved_output}")

    if OUTPUT.exists():
        shutil.rmtree(OUTPUT)
    OUTPUT.mkdir(parents=True)


def copy_static_sources() -> None:
    for relative_path in STATIC_FILES:
        source = ROOT / relative_path
        require_source(source)
        shutil.copy2(source, OUTPUT / relative_path)

    for relative_path in STATIC_DIRECTORIES:
        source = ROOT / relative_path
        require_source(source)
        shutil.copytree(source, OUTPUT / relative_path)


def apply_homepage_footer_alignment() -> None:
    stylesheet = OUTPUT / "overrides.css"
    with stylesheet.open("a", encoding="utf-8") as output:
        output.write(HOMEPAGE_FOOTER_ALIGNMENT_CSS)


def configure_public_address_autocomplete() -> None:
    api_key = os.environ.get("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY", "").strip()
    script_path = OUTPUT / "ats-address-autocomplete.js"
    script = script_path.read_text(encoding="utf-8")

    placeholder_count = script.count(GOOGLE_MAPS_API_KEY_PLACEHOLDER)
    if placeholder_count != 1:
        raise RuntimeError(
            "Public address autocomplete must contain exactly one API-key placeholder; "
            f"found {placeholder_count}."
        )

    escaped_api_key = json.dumps(api_key)[1:-1]
    script_path.write_text(
        script.replace(GOOGLE_MAPS_API_KEY_PLACEHOLDER, escaped_api_key, 1),
        encoding="utf-8",
    )

    if not api_key:
        print("Public Google address autocomplete disabled: NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is not set.")
        return

    homepage_path = OUTPUT / "index.html"
    homepage = homepage_path.read_text(encoding="utf-8")
    if ADDRESS_AUTOCOMPLETE_SCRIPT not in homepage:
        if FORM_ENHANCEMENT_SCRIPT not in homepage:
            raise RuntimeError("Could not find the public form enhancement script tag for autocomplete injection.")
        homepage = homepage.replace(
            FORM_ENHANCEMENT_SCRIPT,
            ADDRESS_AUTOCOMPLETE_SCRIPT + "\n" + FORM_ENHANCEMENT_SCRIPT,
            1,
        )
        homepage_path.write_text(homepage, encoding="utf-8")


def generate_pages() -> None:
    subprocess.run(
        [
            sys.executable,
            str(ROOT / "scripts" / "build-public-pages.py"),
            "--output-dir",
            str(OUTPUT),
        ],
        cwd=ROOT,
        check=True,
    )


def build() -> None:
    prepare_output()
    copy_static_sources()
    apply_homepage_footer_alignment()
    generate_pages()
    # Configure the final homepage artifact so future page-generation changes
    # cannot overwrite the injected progressive-enhancement script.
    configure_public_address_autocomplete()
    print(f"Public release artifact assembled at {OUTPUT.relative_to(ROOT)}/")


if __name__ == "__main__":
    try:
        build()
    except Exception as error:
        print(f"Public-site build failed: {error}", file=sys.stderr)
        raise
