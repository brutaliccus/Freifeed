"""
Thicken line-art milk bag PNG with OpenCV, then trace to SVG (512 viewBox).

OpenCV ellipse dilation preserves the art shape better than heavy PIL max-filter passes.

Usage:
  python scripts/prepare_milkbag_trace.py [--radius 4] [--iterations 2]
  python scripts/prepare_milkbag_trace.py --thickness 1.15
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).parent))
from trace_milkbag import trace_png_to_svg

ROOT = Path(__file__).resolve().parents[1]
ART = ROOT / "src" / "assets" / "milkbag-art.png"
WORK = ROOT / "src" / "assets" / "milkbag-trace-input.png"
OUT = ROOT / "src" / "assets" / "milkbag.svg"

TRACE_SIZE = 512
UPSCALE = 4
BASE_RADIUS = 3
BASE_ITERATIONS = 2
# Fixed viewBox so OpenCV thickening changes visible stroke weight (auto-trim was scaling it away).
LOCKED_VIEW_W = 322.0
LOCKED_VIEW_H = 468.0


def dilation_params(*, thickness: float | None, radius: int | None, iterations: int | None) -> tuple[int, int]:
    """Map a thickness multiplier (~1.15 = 15% bolder) to OpenCV dilation settings."""
    if radius is not None and iterations is not None:
        return radius, iterations
    t = thickness if thickness is not None else 1.5
    if t <= 1.0:
        return BASE_RADIUS, BASE_ITERATIONS
    extra_radius = max(0, round((t - 1.0) / 0.15))
    return BASE_RADIUS + extra_radius, BASE_ITERATIONS


def load_flat_gray(src: Path) -> np.ndarray:
    img = Image.open(src).convert("RGBA")
    bg = Image.new("RGBA", img.size, (255, 255, 255, 255))
    flat = Image.alpha_composite(bg, img).convert("L")
    return np.array(flat)


def thicken_line_art(
    src: Path,
    dest: Path,
    *,
    scale: int = UPSCALE,
    radius: int = 3,
    iterations: int = 2,
) -> None:
    """Upscale art and thicken black strokes via OpenCV morphological dilation."""
    gray = load_flat_gray(src)
    h, w = gray.shape
    gray = cv2.resize(gray, (w * scale, h * scale), interpolation=cv2.INTER_LANCZOS4)

    # Black ink as white foreground for dilation.
    _, ink = cv2.threshold(gray, 200, 255, cv2.THRESH_BINARY_INV)

    if radius > 0 and iterations > 0:
        k = radius * 2 + 1
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k))
        ink = cv2.dilate(ink, kernel, iterations=iterations)

    result = cv2.bitwise_not(ink)
    result = cv2.resize(result, (TRACE_SIZE, TRACE_SIZE), interpolation=cv2.INTER_AREA)
    _, result = cv2.threshold(result, 127, 255, cv2.THRESH_BINARY)

    dest.parent.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(dest), result)
    print(f"OpenCV thicken: radius={radius}, iterations={iterations}, scale={scale}")


def normalize_svg(svg_path: Path, size: int = TRACE_SIZE) -> None:
    import re

    text = svg_path.read_text(encoding="utf-8")
    text = re.sub(
        r"<svg[^>]*>",
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size} {size}" fill="currentColor">',
        text,
        count=1,
    )
    text = re.sub(r'\s(width|height)="[^"]*"', "", text)
    if 'fill="currentColor"' not in text.split(">", 1)[0]:
        text = text.replace("<path ", '<path fill="currentColor" ', 1)
    svg_path.write_text(text, encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--thickness",
        type=float,
        default=1.5,
        help="Line width multiplier vs base art (default: 1.5)",
    )
    parser.add_argument(
        "--radius",
        type=int,
        default=None,
        help="Override ellipse kernel radius in upscaled pixels",
    )
    parser.add_argument(
        "--iterations",
        type=int,
        default=None,
        help="Override dilation passes",
    )
    parser.add_argument(
        "--no-thicken",
        action="store_true",
        help="Trace art as-is (radius=0)",
    )
    args = parser.parse_args()

    if not ART.is_file():
        raise SystemExit(f"Missing art: {ART}")

    if args.no_thicken:
        radius, iterations = 0, 0
    else:
        radius, iterations = dilation_params(
            thickness=args.thickness,
            radius=args.radius,
            iterations=args.iterations,
        )

    thicken_line_art(ART, WORK, scale=UPSCALE, radius=radius, iterations=iterations)
    trace_png_to_svg(
        WORK,
        OUT,
        threshold=128,
        invert=False,
        blacklevel=0.45,
        turdsize=2,
        fill="currentColor",
    )
    normalize_svg(OUT)
    from trim_svg_viewbox import lock_icon_viewbox

    lock_icon_viewbox(OUT, width=LOCKED_VIEW_W, height=LOCKED_VIEW_H)
    print(f"Done: {OUT}")


if __name__ == "__main__":
    main()
