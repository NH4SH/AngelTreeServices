#!/usr/bin/env python3
"""Generate approved Drive-photo derivatives from the private review originals.

Maintainer-only: requires Pillow/WebP. Supply --source-dir for the downloaded
review originals; deploy builds use committed derivatives and the manifest.
Sources are hash checked and never modified. Private Drive URLs stay out of
shipping assets; derivatives strip EXIF/GPS and retain complete framing.
"""
import argparse
import hashlib
import json
from pathlib import Path

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
SELECTIONS = (
    ("tree-trimming-climber", "0420.jpg", "DSC02674.JPG", "0711a01deb4ade2cafd5b670d53b5f4348c9a3bc9456ebb2213881cfc248da1b", "Angel Tree Services climber with ropes and a harness during tree trimming."),
    ("stump-grinding-operator", "0270.jpg", "DSC02540.JPG", "c73c726b4117044a3dd6c55394dd58e818cad69211ff5d0e7d8de1ade9364e3d", "An Angel Tree Services operator using a yellow stump grinder, with cut logs behind the machine."),
    ("tree-job-cleanup", "0373.jpg", "DSC02650.JPG", "b90791cf3a7661c352ac7b3a63273a9fa39fee01c629f12a0acc1d30b66a30c9", "Angel Tree Services crew using a leaf blower beside a stump grinder in a wooded yard."),
    ("fredericksburg-tower-trimming", "0017.jpg", "SquooshedTowerSunset.jpg", "e3787ef2fc91081276bd33a1b71daaf6df517ea2662bcfbcba4873f20061a81c", "The Fredericksburg tower at sunset, with trees and shrubs beside the adjoining building."),
)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-dir", type=Path, required=True)
    args = parser.parse_args()
    output = ROOT / "assets/versioned"
    output.mkdir(parents=True, exist_ok=True)
    manifest = {}
    for key, local_name, source_name, expected_hash, alt in SELECTIONS:
        source = args.source_dir / local_name
        source_hash = hashlib.sha256(source.read_bytes()).hexdigest()
        if source_hash != expected_hash:
            raise ValueError(f"Source does not match the reviewed photograph: {source_name}")
        with Image.open(source) as original:
            frame = ImageOps.exif_transpose(original).convert("RGB")
            variants = []
            for width in (480, 840, 1280, 1600):
                height = round(frame.height * width / frame.width)
                resized = frame.resize((width, height), Image.Resampling.LANCZOS)
                temporary = output / f".photo-{key}-{width}.webp"
                resized.save(temporary, "WEBP", quality=75, method=6, exif=b"", icc_profile=b"")
                digest = hashlib.sha256(temporary.read_bytes()).hexdigest()[:10]
                destination = output / f"photo-{key}-{width}.{digest}.webp"
                temporary.replace(destination)
                destination.with_suffix(".webp.json").write_text(json.dumps({"prompt": (
                    "Origin: original photograph supplied by Angel Tree Services, "
                    f"{source_name}, original SHA-256 {source_hash}. "
                    "Owner cleared website use on October 20, 2026. Complete original frame; "
                    "resized and encoded only, without retouching or generative alteration. "
                    "EXIF and location metadata omitted from derivative."
                )}, indent=2) + "\n")
                variants.append({"src": "/" + destination.relative_to(ROOT).as_posix(), "width": width, "height": height})
        selected = next(v for v in variants if v["width"] == 1280)
        manifest[key] = {"alt": alt, "source_filename": source_name, "source_sha256": source_hash,
                         "crop": None, **selected, "variants": variants}
        print(f"{key}: {len(variants)} responsive WebP derivatives")
    (ROOT / "public-drive-photography.json").write_text(json.dumps(manifest, indent=2) + "\n")


if __name__ == "__main__":
    main()
