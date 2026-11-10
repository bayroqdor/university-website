"""Kutubxona muqovalari: kitob ma'lumotidan avtomatik (tipografik) muqova, yuklangan rasmni me'yorlash va PDF sahifasi / EPUB
muqovasidan muqova.

Avtomatik muqova — ochiq fonddagi tayyor muqovalar (`seed_library/covers`) uslubida: tekis fon (sayt ranglari), oltin rangli
bo'lim nomi va qisqa chiziq, katta sarlavha (Onest), pastda muallif va nashr satri, pastki qismda nozik sakkiz qirrali yulduz
(girih) to'ri. Gradient, soya va yorqinlik yo'q. Shrift — `seed_library/fonts` (Onest, SIL OFL 1.1).
"""
from __future__ import annotations

import hashlib
import io
import json
from functools import lru_cache
from pathlib import Path

W, H = 600, 900  # muqova o'lchami (ochiq fond muqovalari bilan bir xil)
S = 2  # chizish masshtabi: 2x da chizilib kichraytiriladi — chiziqlar va harflar silliq chiqadi
MAX_W, MAX_H = 900, 900  # yuklangan rasm / sahifa muqovasi chegarasi
VERSION = 1  # chizish uslubi o'zgarsa — oshiriladi (avtomatik muqovalar qayta chiziladi)
FONTS = Path(__file__).resolve().parent / "seed_library" / "fonts"

THEMES = {
    # fon, matn, urg'u (oltin)
    "blue": ((0x0A, 0x2E, 0x73), (0xF3, 0xF5, 0xF8), (0xE3, 0xC2, 0x7A)),
    "green": ((0x1E, 0x4A, 0x38), (0xF3, 0xF5, 0xF8), (0xE3, 0xC2, 0x7A)),
    "light": ((0xF3, 0xF5, 0xF8), (0x0A, 0x2E, 0x73), (0xB0, 0x8D, 0x3C)),
}
SCI = ("kimyo", "biolog", "mikrobiolog", "iqtisod", "menejment", "statistik", "matemat", "fizika", "oziq-ovqat", "biznes", "buxgalter",
       "moliya", "marketing", "informat", "dasturlash", "texnolog", "muhandis", "ekolog", "agro", "tibbiyot", "huquq")


class CoverError(ValueError):
    pass


@lru_cache(maxsize=64)
def _font(weight: str, px: int):
    from PIL import ImageFont  # noqa: PLC0415

    return ImageFont.truetype(str(FONTS / f"Onest-{weight}.ttf"), px)


def theme_of(book: dict) -> str:
    cats = " ".join(book.get("categories") or []).lower()
    if (book.get("lang") or "") == "uz":
        return "blue"
    if any(k in cats for k in SCI):
        return "light"
    return "green"


def signature(book: dict) -> str:
    """Avtomatik muqovaga ta'sir qiladigan maydonlar xeshi — o'zgarsa muqova qayta chiziladi."""
    keys = {k: book.get(k) for k in ("title", "subtitle", "authors", "year", "publisher", "lang")}
    keys["cat"] = (book.get("categories") or [""])[:1]
    keys["v"] = VERSION
    return hashlib.sha1(json.dumps(keys, ensure_ascii=False, sort_keys=True, default=str).encode()).hexdigest()[:20]


# ------------------------------------------------------------------ matn yordamchilari
def _mix(a: tuple, b: tuple, t: float) -> tuple:
    return tuple(round(a[i] * t + b[i] * (1 - t)) for i in range(3))


def _width(text: str, font, tracking: float = 0.0) -> float:
    return font.getlength(text) + tracking * max(0, len(text) - 1)


def _wrap(text: str, font, maxw: float, tracking: float = 0.0) -> list[str]:
    lines: list[str] = []
    cur = ""
    for w in text.split():
        t = f"{cur} {w}" if cur else w
        if cur and _width(t, font, tracking) > maxw:
            lines.append(cur)
            cur = w
        else:
            cur = t
    if cur:
        lines.append(cur)
    return lines


def _balanced(text: str, font, maxw: float, tracking: float = 0.0) -> list[str]:
    """CSS `text-wrap: balance` kabi: qatorlar soni o'zgarmagan holda eng tor kenglik."""
    base = _wrap(text, font, maxw, tracking)
    if len(base) < 2:
        return base
    lo, hi = maxw * 0.4, maxw
    for _ in range(14):
        mid = (lo + hi) / 2
        if len(_wrap(text, font, mid, tracking)) == len(base) and all(_width(x, font, tracking) <= mid + 0.5 for x in _wrap(text, font, mid, tracking)):
            hi = mid
        else:
            lo = mid
    return _wrap(text, font, hi, tracking)


def _draw(d, x: float, base: float, text: str, font, fill: tuple, tracking: float = 0.0) -> None:
    """Asos chizig'i (baseline) bo'yicha; harflar orasi (tracking) bilan — kerning saqlanadi (prefiks uzunligi bo'yicha)."""
    if not tracking:
        d.text((x, base), text, font=font, fill=fill, anchor="ls")
        return
    for i, ch in enumerate(text):
        if ch.strip():
            d.text((x + font.getlength(text[:i]) + tracking * i, base), ch, font=font, fill=fill, anchor="ls")


def _girih(d, x0: int, y0: int, tile: int, color: tuple, width: int) -> None:
    """Sakkiz qirrali yulduz to'ri (ochiq fond muqovalaridagi kabi): 120×120 lik katak."""
    k = tile / 120.0

    def p(x, y):
        return (x0 + x * k, y0 + y * k)

    star1 = [(60, 10), (74, 46), (110, 60), (74, 74), (60, 110), (46, 74), (10, 60), (46, 46)]
    star2 = [(25, 25), (60, 40), (95, 25), (80, 60), (95, 95), (60, 80), (25, 95), (40, 60)]
    for star in (star1, star2):
        pts = [p(*a) for a in star]
        d.line(pts + [pts[0]], fill=color, width=width, joint="curve")
    r = 12 * k
    cx, cy = p(60, 60)
    d.ellipse((cx - r, cy - r, cx + r, cy + r), outline=color, width=width)
    for a, b in (((0, 0), (25, 25)), ((120, 0), (95, 25)), ((0, 120), (25, 95)), ((120, 120), (95, 95))):
        d.line([p(*a), p(*b)], fill=color, width=width)


# ------------------------------------------------------------------ avtomatik muqova
def render(book: dict) -> bytes:
    """Kitob ma'lumotidan 600×900 JPEG muqova."""
    from PIL import Image, ImageDraw  # noqa: PLC0415

    bg, fg, acc = THEMES[theme_of(book)]
    w, h = W * S, H * S
    im = Image.new("RGB", (w, h), bg)

    # pastki 300 px — nozik girih to'ri (bir xil shaffoflik, gradient yo'q)
    band_top = (H - 300) * S
    layer = Image.new("L", (w, h - band_top), 0)
    ld = ImageDraw.Draw(layer)
    tile = 120 * S
    for ty in range(0, h - band_top, tile):
        for tx in range(0, w, tile):
            _girih(ld, tx, ty, tile, 255, max(1, S))
    alpha = layer.point(lambda v: round(v * 0.12))
    im.paste(Image.new("RGB", layer.size, fg), (0, band_top), alpha)

    d = ImageDraw.Draw(im)
    left, right, top, bottom = 52 * S, 52 * S, 56 * S, 56 * S
    maxw = w - left - right
    y = top

    # bo'lim (janr) — oltin, bosh harflar, harflar orasi keng
    cats = book.get("categories") or []
    eyebrow = (cats[0] if cats else "").upper()[:60]
    f_eb = _font("SemiBold", 15 * S)
    if eyebrow:
        tr = 0.14 * 15 * S
        while _width(eyebrow, f_eb, tr) > maxw and len(eyebrow) > 4:
            eyebrow = eyebrow[:-2].rstrip() + "…"
        _draw(d, left, y + 15 * S, eyebrow, f_eb, acc, tr)
        y += 18 * S
    y += 22 * S
    d.rectangle((left, y, left + 56 * S - 1, y + 3 * S - 1), fill=acc)
    y += 3 * S + 28 * S

    # pastki blok: muallif(lar) va nashr satri — balandligi oldindan hisoblanadi
    authors = [a for a in (book.get("authors") or []) if a]
    auth = ", ".join(authors[:3]) + (" va boshq." if len(authors) > 3 else "")
    a_px = 24
    f_au = _font("Medium", a_px * S)
    au_lines = _balanced(auth, f_au, maxw) if auth else []
    while len(au_lines) > 2 and a_px > 17:
        a_px -= 2
        f_au = _font("Medium", a_px * S)
        au_lines = _balanced(auth, f_au, maxw)
    au_lines = au_lines[:2]
    mark_parts = [x for x in ((book.get("publisher") or "").strip(), str(book.get("year") or "").strip()) if x]
    mark = (" · ".join(mark_parts) or "University · Library").upper()[:70]
    f_mk = _font("Regular", 13 * S)
    mk_tr = 0.1 * 13 * S
    while _width(mark, f_mk, mk_tr) > maxw and len(mark) > 4:
        mark = mark[:-2].rstrip() + "…"
    au_lh = round(a_px * 1.25) * S
    foot_h = len(au_lines) * au_lh + 14 * S + 16 * S
    foot_top = h - bottom - foot_h

    # sarlavha va kichik sarlavha — sig'maguncha shrift kichrayadi
    title = " ".join((book.get("title") or "").split()) or "—"
    sub = " ".join((book.get("subtitle") or "").split())
    n = len(title)
    size = 64 if n < 14 else 56 if n < 24 else 48 if n < 40 else 40 if n < 60 else 34
    room = foot_top - y - 32 * S
    while True:
        f_t = _font("Bold", size * S)
        tr = 0.0  # butun satr bir yo'la chiziladi — kerning to'liq saqlanadi
        t_lines = _balanced(title, f_t, maxw, tr)
        too_wide = any(_width(x, f_t, tr) > maxw for x in t_lines)
        lh = round(size * 1.04 * S)
        s_px = 22 if size >= 40 else 19
        f_s = _font("Regular", s_px * S)
        s_lines = _balanced(sub, f_s, maxw) if sub else []
        s_lh = round(s_px * 1.3 * S)
        need = len(t_lines) * lh + ((18 * S + len(s_lines) * s_lh) if s_lines else 0)
        if (need <= room and not too_wide) or size <= 22:
            break
        size -= 2
    if need > room:  # juda uzun: sarlavha qatorlari qisqartiriladi
        keep = max(1, (room - ((18 * S + len(s_lines) * s_lh) if s_lines else 0)) // lh)
        if keep < len(t_lines):
            t_lines = t_lines[:keep]
            t_lines[-1] = t_lines[-1].rstrip(" ,.;:") + "…"
        if s_lines and len(t_lines) * lh + 18 * S + len(s_lines) * s_lh > room:
            s_lines = []
    asc, desc = f_t.getmetrics()
    for ln in t_lines:
        base = y + (lh - (asc + desc)) / 2 + asc
        _draw(d, left, base, ln, f_t, fg, tr)
        y += lh
    if s_lines:
        y += 18 * S
        asc_s, desc_s = f_s.getmetrics()
        col = _mix(fg, bg, 0.82)
        for ln in s_lines:
            _draw(d, left, y + (s_lh - (asc_s + desc_s)) / 2 + asc_s, ln, f_s, col)
            y += s_lh

    # pastki blok
    y = foot_top
    asc_a, desc_a = f_au.getmetrics()
    for ln in au_lines:
        _draw(d, left, y + (au_lh - (asc_a + desc_a)) / 2 + asc_a, ln, f_au, fg)
        y += au_lh
    y += 14 * S
    _draw(d, left, y + 13 * S, mark, f_mk, _mix(fg, bg, 0.6), mk_tr)

    out = im.resize((W, H), Image.LANCZOS)
    buf = io.BytesIO()
    out.save(buf, "JPEG", quality=86, optimize=True, progressive=True)
    return buf.getvalue()


# ------------------------------------------------------------------ yuklangan rasm / sahifa
def normalize(raw: bytes) -> bytes:
    """Har qanday rasm (JPG/PNG/WEBP/GIF…) → EXIF bo'yicha burilgan, ko'pi bilan 900 px, JPEG. Yuzni kesish yo'q — rasm butunligicha."""
    from PIL import Image, ImageOps  # noqa: PLC0415

    try:
        with Image.open(io.BytesIO(raw)) as src:
            src.load()
            im = ImageOps.exif_transpose(src)
    except Exception as e:  # noqa: BLE001
        raise CoverError("unsupported_type") from e
    if im.width < 40 or im.height < 40:
        raise CoverError("image_too_small")
    if im.mode in ("RGBA", "LA", "P"):
        im = im.convert("RGBA")
        bgim = Image.new("RGB", im.size, (255, 255, 255))
        bgim.paste(im, mask=im.split()[-1])
        im = bgim
    elif im.mode != "RGB":
        im = im.convert("RGB")
    im.thumbnail((MAX_W, MAX_H), Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, "JPEG", quality=86, optimize=True, progressive=True)
    return buf.getvalue()


def pdf_page(path: str, page: int, width: int = 1000) -> bytes:
    """PDF sahifasini (1 dan boshlab) rasmga — pdfium alohida ishchi jarayonda (docpages puli), so'ng JPEG."""
    import os  # noqa: PLC0415
    import tempfile  # noqa: PLC0415

    from . import docpages  # noqa: PLC0415

    if not docpages.available():
        raise CoverError("render_unavailable")
    fd, tmp = tempfile.mkstemp(suffix=".webp")
    os.close(fd)
    try:
        try:
            docpages._call(docpages._w_render, path, max(0, int(page) - 1), int(width), tmp)
        except docpages.DocError as e:
            raise CoverError("bad_page" if e.code in ("broken",) else e.code) from e
        with open(tmp, "rb") as f:
            raw = f.read()
    finally:
        try:
            os.unlink(tmp)
        except OSError:
            pass
    return normalize(raw)
