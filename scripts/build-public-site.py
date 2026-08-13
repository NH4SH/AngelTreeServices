#!/usr/bin/env python3
"""Assemble the deployable Angel Tree Services static website."""

from __future__ import annotations

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
    print(f"Public release artifact assembled at {OUTPUT.relative_to(ROOT)}/")


if __name__ == "__main__":
    try:
        build()
    except Exception as error:
        print(f"Public-site build failed: {error}", file=sys.stderr)
        raise
