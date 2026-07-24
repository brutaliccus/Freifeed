"""Trim SVG viewBox to tight bounds around path geometry."""

from __future__ import annotations

import re
import sys
from pathlib import Path


def _fmt(v: float) -> str:
    s = f"{v:.3f}".rstrip("0").rstrip(".")
    return s or "0"


def _path_bbox(path_d: str) -> tuple[float, float, float, float]:
    try:
        from svgpathtools import parse_path

        xmin, xmax, ymin, ymax = parse_path(path_d).bbox()
        return float(xmin), float(xmax), float(ymin), float(ymax)
    except ImportError:
        nums = [float(n) for n in re.findall(r"[-+]?(?:\d*\.\d+|\d+)(?:[eE][-+]?\d+)?", path_d)]
        xs = nums[0::2]
        ys = nums[1::2]
        return min(xs), max(xs), min(ys), max(ys)


def lock_icon_viewbox(
    svg_path: Path,
    *,
    width: float,
    height: float,
) -> tuple[float, float]:
    """Shift path to origin and use a fixed viewBox so stroke-weight tweaks stay visible."""
    from svgpathtools import parse_path

    text = svg_path.read_text(encoding="utf-8")
    match = re.search(r'\bd="([^"]+)"', text)
    if not match:
        raise ValueError(f"No path d attribute found in {svg_path}")

    path = parse_path(match.group(1))
    xmin, xmax, ymin, ymax = path.bbox()
    shifted = path.translated(-xmin - 1j * ymin)
    new_d = shifted.d()

    view_box = f"0 0 {_fmt(width)} {_fmt(height)}"
    text = re.sub(r'\bd="[^"]*"', f'd="{new_d}"', text, count=1)
    if re.search(r'\bviewBox="[^"]*"', text):
        text = re.sub(r'\bviewBox="[^"]*"', f'viewBox="{view_box}"', text, count=1)
    else:
        text = text.replace("<svg ", f'<svg viewBox="{view_box}" ', 1)
    text = re.sub(r'\s(width|height)="[^"]*"', "", text)
    svg_path.write_text(text, encoding="utf-8")
    content_w = xmax - xmin
    content_h = ymax - ymin
    print(f"Locked {svg_path} -> viewBox {view_box} (content {_fmt(content_w)}x{_fmt(content_h)})")
    return content_w, content_h


def trim_svg(svg_path: Path, *, padding: float = 0.0) -> tuple[float, float, float, float]:
    text = svg_path.read_text(encoding="utf-8")
    match = re.search(r'\bd="([^"]+)"', text)
    if not match:
        raise ValueError(f"No path d attribute found in {svg_path}")

    xmin, xmax, ymin, ymax = _path_bbox(match.group(1))
    xmin -= padding
    ymin -= padding
    xmax += padding
    ymax += padding
    width = xmax - xmin
    height = ymax - ymin

    view_box = f"{_fmt(xmin)} {_fmt(ymin)} {_fmt(width)} {_fmt(height)}"
    width_s = _fmt(width)
    height_s = _fmt(height)

    if re.search(r'\bviewBox="[^"]*"', text):
        text = re.sub(r'\bviewBox="[^"]*"', f'viewBox="{view_box}"', text, count=1)
    else:
        text = text.replace("<svg ", f'<svg viewBox="{view_box}" ', 1)

    text = re.sub(r'\bwidth="[^"]*"', f'width="{width_s}"', text, count=1)
    text = re.sub(r'\bheight="[^"]*"', f'height="{height_s}"', text, count=1)

    svg_path.write_text(text, encoding="utf-8")
    return xmin, ymin, width, height


def main() -> None:
    if len(sys.argv) < 2:
        print("Usage: python scripts/trim_svg_viewbox.py <file.svg> [more.svg ...]")
        raise SystemExit(1)

    for arg in sys.argv[1:]:
        path = Path(arg)
        xmin, ymin, w, h = trim_svg(path)
        print(f"Trimmed {path} -> viewBox origin ({xmin:.1f}, {ymin:.1f}), size {w:.1f}x{h:.1f}")


if __name__ == "__main__":
    main()
