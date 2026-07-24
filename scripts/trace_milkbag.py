"""
Trace milk-bag PNG to SVG using Pillow + potracer (pure-Python potrace).

Install: pip install pillow potracer

Usage:
  python scripts/trace_milkbag.py [input.png] [output.svg]
"""

from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image
from potrace import Bitmap, POTRACE_TURNPOLICY_MINORITY


def trace_png_to_svg(
    input_path: Path,
    output_path: Path,
    *,
    threshold: int = 127,
    invert: bool = False,
    blacklevel: float = 0.5,
    turdsize: int = 2,
    fill: str = "currentColor",
) -> None:
    image = Image.open(input_path).convert("L")
    # Binary threshold (same idea as: image.point(lambda p: p > 127 and 255))
    binary = image.point(lambda p: 255 if p > threshold else 0)
    if invert:
        binary = Image.eval(binary, lambda p: 255 - p)

    bm = Bitmap(binary, blacklevel=blacklevel)
    plist = bm.trace(
        turdsize=turdsize,
        turnpolicy=POTRACE_TURNPOLICY_MINORITY,
        alphamax=1,
        opticurve=False,
        opttolerance=0.2,
    )

    w, h = binary.size
    parts: list[str] = []
    for curve in plist:
        fs = curve.start_point
        parts.append(f"M{fs.x},{fs.y}")
        for segment in curve.segments:
            if segment.is_corner:
                a = segment.c
                b = segment.end_point
                parts.append(f"L{a.x},{a.y}L{b.x},{b.y}")
            else:
                a = segment.c1
                b = segment.c2
                c = segment.end_point
                parts.append(f"C{a.x},{a.y} {b.x},{b.y} {c.x},{c.y}")
        parts.append("z")

    path_d = "".join(parts)
    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}">
  <path fill="{fill}" fill-rule="evenodd" d="{path_d}"/>
</svg>
"""
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(svg, encoding="utf-8")
    print(f"Wrote {output_path} ({w}x{h}, {len(plist)} curves)")


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    # Prefer clean black-on-white art; fall back to legacy app PNG.
    art = root / "src" / "assets" / "milkbag-art.png"
    legacy = root / "src" / "assets" / "milkbag.png"
    default_in = art if art.is_file() else legacy
    default_out = root / "src" / "assets" / "milkbag.svg"

    input_path = Path(sys.argv[1]) if len(sys.argv) > 1 else default_in
    output_path = Path(sys.argv[2]) if len(sys.argv) > 2 else default_out

    # Black strokes on white: trace as-is. White-on-black legacy PNG needs invert.
    invert = "--invert" in sys.argv or (
        "--no-invert" not in sys.argv and default_in == legacy
    )
    trace_png_to_svg(input_path, output_path, invert=invert)


if __name__ == "__main__":
    main()
