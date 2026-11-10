"""Logotipdan sayt palitrasini chiqarish: asosiy (accent) va ikkinchi (accent2) rang.

Logotipning eng ko'p uchraydigan to'yingan ranglari olinadi; oq/kulrang fon e'tiborga olinmaydi.
Asosiy rang oq fonda o'qiladigan bo'lishi uchun (kontrast >= 4.5) kerak bo'lsa to'qlashtiriladi."""
from __future__ import annotations

import colorsys
import io


def _hex(rgb: tuple[float, float, float]) -> str:
    return "#{:02X}{:02X}{:02X}".format(*(max(0, min(255, round(c))) for c in rgb))


def _lum(rgb: tuple[float, float, float]) -> float:
    def ch(c: float) -> float:
        c /= 255
        return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4

    r, g, b = rgb
    return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b)


def contrast(a: tuple[float, float, float], b: tuple[float, float, float] = (255, 255, 255)) -> float:
    la, lb = sorted((_lum(a), _lum(b)), reverse=True)
    return (la + 0.05) / (lb + 0.05)


def _darken_until(rgb: tuple[float, float, float], target: float = 4.5) -> tuple[float, float, float]:
    h, l, s = colorsys.rgb_to_hls(*(c / 255 for c in rgb))
    for _ in range(40):
        cur = tuple(c * 255 for c in colorsys.hls_to_rgb(h, l, s))
        if contrast(cur) >= target:
            return cur
        l = max(0.0, l - 0.025)
    return tuple(c * 255 for c in colorsys.hls_to_rgb(h, l, s))


def _hue_dist(a: float, b: float) -> float:
    d = abs(a - b) % 1.0
    return min(d, 1 - d) * 360


def palette_from_image(raw: bytes) -> dict | None:
    """Qaytaradi: {"accent": "#RRGGBB", "accent2": "#RRGGBB", "colors": [...]} yoki rang topilmasa None."""
    try:
        from PIL import Image  # noqa: PLC0415

        with Image.open(io.BytesIO(raw)) as im:
            im = im.convert("RGBA")
            im.thumbnail((96, 96))
            bg = Image.new("RGBA", im.size, (255, 255, 255, 255))
            bg.alpha_composite(im)
            rgb = bg.convert("RGB")
            q = rgb.quantize(colors=10, method=Image.Quantize.MEDIANCUT)
            pal = q.getpalette() or []
            counts = sorted(q.getcolors() or [], reverse=True)
    except Exception:  # noqa: BLE001
        return None
    colors = []
    total = sum(c for c, _ in counts) or 1
    for count, idx in counts:
        r, g, b = pal[idx * 3 : idx * 3 + 3]
        h, l, s = colorsys.rgb_to_hls(r / 255, g / 255, b / 255)
        colors.append({"rgb": (r, g, b), "share": count / total, "h": h, "l": l, "s": s})
    vivid = [c for c in colors if c["s"] >= 0.25 and 0.12 <= c["l"] <= 0.85 and c["share"] >= 0.01]
    if not vivid:
        dark = [c for c in colors if c["l"] < 0.35 and c["share"] >= 0.02]
        if not dark:
            return None
        main = dark[0]["rgb"]
        return {"accent": _hex(_darken_until(main)), "accent2": "", "colors": [_hex(c["rgb"]) for c in colors[:6]]}
    vivid.sort(key=lambda c: -(c["share"] * (0.6 + c["s"])))
    first = vivid[0]
    second = next((c for c in vivid[1:] if _hue_dist(c["h"], first["h"]) > 40), None)
    accent = _darken_until(first["rgb"])
    accent2 = _darken_until(second["rgb"], 3.0) if second else None
    return {"accent": _hex(accent), "accent2": _hex(accent2) if accent2 else "", "colors": [_hex(c["rgb"]) for c in colors[:6]]}
