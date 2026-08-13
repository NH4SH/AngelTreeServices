#!/usr/bin/env python3
"""Generate content-addressed responsive images for the public homepage.

This stays separate from the regular build: deploys use committed derivatives,
while maintainers can reproducibly regenerate them when a source photo changes.
"""

from __future__ import annotations

import hashlib
import shutil
import subprocess
import tempfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "assets" / "versioned"
SOURCE = ROOT / "assets" / "AngelChainsawSquooshed_008.jpg"
WIDTHS = (320, 560, 840)


def require_tool(name: str) -> str:
    executable = shutil.which(name)
    if not executable:
        raise RuntimeError(f"Required image tool is unavailable: {name}")
    return executable


def destination_name(width: int, suffix: str, path: Path) -> str:
    digest = hashlib.sha256(path.read_bytes()).hexdigest()[:10]
    return f"testimonial-chainsaw-{width}.{digest}.{suffix}"


def main() -> None:
    cwebp = require_tool("cwebp")
    avifenc = require_tool("avifenc")
    sips = require_tool("sips")
    OUTPUT.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory(prefix="ats-public-images-") as temporary_directory:
        temporary = Path(temporary_directory)
        for width in WIDTHS:
            webp = temporary / f"chainsaw-{width}.webp"
            png = temporary / f"chainsaw-{width}.png"
            avif = temporary / f"chainsaw-{width}.avif"

            subprocess.run(
                [cwebp, "-quiet", "-mt", "-q", "82", "-resize", str(width), str(width), str(SOURCE), "-o", str(webp)],
                check=True,
            )
            subprocess.run(
                [sips, "-s", "format", "png", "-z", str(width), str(width), str(SOURCE), "--out", str(png)],
                check=True,
                stdout=subprocess.DEVNULL,
            )
            subprocess.run(
                [avifenc, "-q", "57", "--speed", "6", str(png), str(avif)],
                check=True,
                stdout=subprocess.DEVNULL,
            )

            for generated, suffix in ((avif, "avif"), (webp, "webp")):
                destination = OUTPUT / destination_name(width, suffix, generated)
                shutil.copy2(generated, destination)
                print(destination.relative_to(ROOT))


if __name__ == "__main__":
    main()
