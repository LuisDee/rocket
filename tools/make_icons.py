#!/usr/bin/env python3
"""Generate the app icons from one drawn source.

    uv run python tools/make_icons.py

The mark: an upward chevron over a horizon line, on the app's accent colour.
Deliberately geometric rather than a rocket glyph or lettering -- it has to read
at 48px in a home-screen grid, where thin strokes and text turn to mush.

marathonApp ships only SVG icons, which iOS silently ignores for home-screen
install, which is why its icon is a Safari screenshot rather than the intended
art. These are PNGs for that reason.

ponytail: Pillow is already installed system-wide, so no dependency is added.
"""

from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
ICON_DIR = ROOT / "public" / "icons"
APPLE_ICON = ROOT / "src" / "app" / "apple-icon.png"

SOURCE_PX = 1024
BACKGROUND = (10, 10, 12)
ACCENT = (99, 179, 237)


def draw_mark(size: int, *, safe_zone: bool) -> Image.Image:
    """The mark at `size` px.

    `safe_zone` shrinks the artwork to the inner 60% that Android's maskable
    spec guarantees survives any mask shape. Apple applies its own rounded
    rect and does not want padding, so the plain variant fills the tile.
    """
    img = Image.new("RGB", (size, size), BACKGROUND)
    draw = ImageDraw.Draw(img)

    scale = size / SOURCE_PX
    inset = 0.20 if safe_zone else 0.0
    span = size * (1 - inset * 2)
    left = size * inset

    def x(fraction: float) -> float:
        return left + span * fraction

    def y(fraction: float) -> float:
        return left + span * fraction

    stroke = max(2, round(74 * scale * (1 - inset * 2)))

    # Ascending chevron: three rising segments, the shape of a fitness curve.
    draw.line(
        [(x(0.16), y(0.68)), (x(0.38), y(0.44)), (x(0.58), y(0.56)), (x(0.86), y(0.20))],
        fill=ACCENT,
        width=stroke,
        joint="curve",
    )

    # Horizon: the baseline the curve climbs away from.
    draw.line(
        [(x(0.16), y(0.84)), (x(0.86), y(0.84))],
        fill=(70, 74, 82),
        width=max(2, round(stroke * 0.5)),
    )
    return img


def main() -> int:
    ICON_DIR.mkdir(parents=True, exist_ok=True)

    # Render each size directly rather than downscaling one master: a 1024px
    # stroke resampled to 192 goes soft, and the whole point is legibility.
    outputs = [
        (ICON_DIR / "icon-192.png", 192, False),
        (ICON_DIR / "icon-512.png", 512, False),
        (ICON_DIR / "icon-512-maskable.png", 512, True),
        (APPLE_ICON, 180, False),
    ]
    for path, size, safe_zone in outputs:
        draw_mark(size, safe_zone=safe_zone).save(path, "PNG", optimize=True)
        print(f"{path.relative_to(ROOT)}  {size}x{size}  {path.stat().st_size:,} bytes")
    return 0


if __name__ == "__main__":
    sys.exit(main())
