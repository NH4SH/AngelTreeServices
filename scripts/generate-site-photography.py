#!/usr/bin/env python3
"""Prepare responsive derivatives from the owner's selected Sony photographs.

Maintainer-only: requires Pillow with WebP and AVIF support. Deploy builds use
the committed assets/manifest and never access the SD card or original photos.
Run with --source-dir /path/to/originals. Originals are read without modification.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "assets/versioned"
SELECTIONS = (
    ("landscaping-service", "DSC00690.JPG", "1c9ea04b87b104541f07beb82c78a1579b8cbcd2b5478ca15f8acde041c28e0f", "Curved hedges, planting beds and a bench in a residential garden.", (320, 512, 840), True),
    ("garden-path", "DSC00693.JPG", "d33e9f44ba4603330a6071928b0feb94068ebf267e789cc9a636773602ae048d", "A gravel garden path beside curved hedges, planting beds and a bench.", (480, 840, 1280, 1600), False),
    ("flowering-tree", "DSC00717.JPG", "868673ce34b06b45c07b9d7073d6ef9fb742f933623c3382f4cb7baf6ba706bd", "A pink-flowering ornamental tree beside a curved driveway and mature trees.", (480, 840, 900, 1280, 1600), False),
    ("commercial-overview", "DSC00763.JPG", "39c2caebaec9ef34124b3ee3409f32447437518c7a2af92779ff9257023ca543", "Shrubs and dark mulched beds around a brick commercial building.", (480, 840, 1280, 1600), False),
    ("commercial-detail", "DSC00753.JPG", "887d9683b48fcb7dc76c469571191fce1403f3cb1e1188a5f8d123ca6cc36fa0", "A hedge row and dark mulch beside a clear walkway and brick building.", (480, 840, 1280, 1600), False),
)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-dir", type=Path, required=True)
    args = parser.parse_args()
    OUTPUT.mkdir(parents=True, exist_ok=True)
    result = {}
    for key, name, expected_hash, alt, widths, square in SELECTIONS:
        source = args.source_dir / name
        source_hash = hashlib.sha256(source.read_bytes()).hexdigest()
        if source_hash != expected_hash:
            raise ValueError(f"Selected original does not match its review hash: {name}")
        with Image.open(source) as original:
            frame = ImageOps.exif_transpose(original).convert("RGB")
            if square:
                side = min(frame.size)
                left, top = (frame.width - side) // 2, (frame.height - side) // 2
                crop = [left, top, left + side, top + side]
                frame = frame.crop(crop)
            else:
                crop = None
            origin = (
                "Origin: original photograph supplied by Angel Tree Services, "
                f"{name}, original SHA-256 {source_hash}. "
                + (f"Square service-image crop {crop}; " if square else "Complete original frame; ")
                + "resized and encoded only, without retouching or generative alteration. "
                "EXIF and location metadata omitted from derivative."
            )
            variants, avif_variants = [], []
            for width in widths:
                height = round(frame.height * width / frame.width)
                resized = frame.resize((width, height), Image.Resampling.LANCZOS)
                formats = [("webp", "WEBP", {"quality": 75, "method": 6})]
                if key == "flowering-tree" and width in (900, 1600):
                    formats.append(("avif", "AVIF", {"quality": 50, "speed": 6}))
                for extension, image_format, options in formats:
                    temporary = OUTPUT / f".photo-{key}-{width}.{extension}"
                    resized.save(temporary, image_format, exif=b"", icc_profile=b"", **options)
                    digest = hashlib.sha256(temporary.read_bytes()).hexdigest()[:10]
                    destination = OUTPUT / f"photo-{key}-{width}.{digest}.{extension}"
                    temporary.replace(destination)
                    destination.with_suffix(destination.suffix + ".json").write_text(
                        json.dumps({"prompt": origin}, indent=2) + "\n", encoding="utf-8"
                    )
                    entry = {"src": "/" + destination.relative_to(ROOT).as_posix(), "width": width, "height": height}
                    (variants if extension == "webp" else avif_variants).append(entry)
            selected = next(v for v in variants if v["width"] == (512 if square else 1280))
            result[key] = {"alt": alt, "source_filename": name, "source_sha256": source_hash,
                           "crop": crop, **selected, "variants": variants}
            if avif_variants:
                result[key]["avif_variants"] = avif_variants
            print(f"{key}: {len(variants)} WebP + {len(avif_variants)} AVIF derivatives")
    (ROOT / "public-site-photography.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
