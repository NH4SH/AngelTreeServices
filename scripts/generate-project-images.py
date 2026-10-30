#!/usr/bin/env python3
"""Prepare uncropped WebP variants from the approved private frame exports.

Requires Pillow. This is a maintainer operation, not part of deploy builds:
python3 scripts/generate-project-images.py --source-dir /path/to/frame-exports
The source directory contains <photo-key>.jpg files; originals are not published.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
CONTENT = ROOT / "public-tree-removal-project.json"
WIDTHS = (480, 840, 1280, 1600)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-dir", type=Path, required=True)
    args = parser.parse_args()
    project = json.loads(CONTENT.read_text(encoding="utf-8"))
    output = ROOT / "assets" / "versioned"
    output.mkdir(parents=True, exist_ok=True)
    for photo in project["photos"]:
        source = args.source_dir / f"{photo['key']}.jpg"
        photo["source_sha256"] = hashlib.sha256(source.read_bytes()).hexdigest()
        origin = (
            "Origin: original documentary footage supplied by Angel Tree Services. "
            f"Original frame SHA-256: {photo['source_sha256']}. "
            "Uncropped responsive WebP derivative; resized and encoded only, with no generative alteration."
        )
        variants = []
        with Image.open(source) as original:
            image = ImageOps.exif_transpose(original).convert("RGB")
            for width in WIDTHS:
                actual_width = min(width, image.width)
                height = round(image.height * actual_width / image.width)
                resized = image.resize((actual_width, height), Image.Resampling.LANCZOS)
                temporary = output / f".project-{photo['key']}-{width}.webp"
                resized.save(temporary, "WEBP", quality=82, method=6, exif=b"", icc_profile=b"")
                digest = hashlib.sha256(temporary.read_bytes()).hexdigest()[:10]
                name = f"project-{photo['key']}-{width}.{digest}.webp"
                temporary.replace(output / name)
                # WebP provenance uses the same sidecar format as Impeccable's embed-prompt tool.
                (output / f"{name}.json").write_text(
                    json.dumps({"prompt": origin}, indent=2) + "\n", encoding="utf-8"
                )
                variants.append({"src": f"/assets/versioned/{name}", "width": actual_width, "height": height})
        photo["variants"] = variants
        photo.update(variants[2])
        print(f"{photo['key']}: {len(variants)} uncropped variants")
    CONTENT.write_text(json.dumps(project, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
