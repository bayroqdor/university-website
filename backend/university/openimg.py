"""Ochiq rasm bazalari (Openverse): muharrirda rasm qidirish va tanlanganini sayt mediasiga ko'chirish.

Brauzer uchinchi tomon serverlariga to'g'ridan-to'g'ri murojaat qilmaydi: qidiruv, kichik rasmlar (thumb) va asl fayl
shu modul orqali o'tadi. Natijalar qisqa muddat xotirada saqlanadi. Har bir rasmda litsenziya va muallif ma'lumoti
bo'ladi — muharrir rasmni «Foto: muallif / manba, litsenziya» izohi bilan qo'yadi (CC litsenziyalari talabi).

Provayder: `SITE_OPENIMG_PROVIDER` — `openverse` (standart) yoki `fake` (internetsiz ishlab chiqish va skrinshotlar uchun).
"""
from __future__ import annotations

import io
import json
import os
import re
import threading
import time
import urllib.error
import urllib.parse
import urllib.request

from .media import IMAGE_FORMATS, MAX_MEDIA, safe_fetch

PAGE_SIZE = 20  # Openverse anonim so'rovlar uchun eng ko'pi 20
MAX_PAGE = 12  # anonim so'rovlarda 240 tagacha natija
MAX_THUMB = 3 * 1024 * 1024
ID_RX = re.compile(r"^[A-Za-z0-9_-]{1,64}$")
THUMB_SIDE = 480


def ua() -> str:
    """Wikimedia va boshqa manbalar talabi: dastur nomi + aloqa manzili (umumiy «bot» UA'lar cheklanadi)."""
    site = (os.environ.get("SITE_URL") or "https://example.edu").strip().rstrip("/")
    return f"UniversitySite/1.0 (+{site}) python-urllib/3"
# muassasa sayti: tijoriy foydalanish va o'zgartirishga ruxsat beruvchi litsenziyalar (CC BY, CC BY-SA, CC0, PDM).
# NC (notijoriy) va ND (o'zgartirmaslik) litsenziyalari chiqarilmaydi — rasmni qirqish/kichraytirish ham o'zgartirish hisoblanadi.
LICENSE_TYPE = "commercial,modification"

SOURCES = {
    "flickr": "Flickr", "wikimedia": "Wikimedia Commons", "stocksnap": "StockSnap", "rawpixel": "rawpixel", "nappy": "nappy",
    "smithsonian": "Smithsonian", "met": "The Met", "nasa": "NASA", "spacex": "SpaceX", "europeana": "Europeana",
    "geographorguk": "Geograph Britain and Ireland", "wordpress": "WordPress Photo Directory", "iha": "IHA", "sketchfab": "Sketchfab",
    "inaturalist": "iNaturalist", "brooklynmuseum": "Brooklyn Museum", "clevelandmuseum": "Cleveland Museum of Art",
}


class ProviderError(RuntimeError):
    """provider_unavailable | provider_busy | not_found"""


class ImageError(ValueError):
    """not_image | too_large | fetch_failed"""


def license_label(lic: str, ver: str = "") -> str:
    lic = (lic or "").strip().lower()
    ver = (ver or "").strip()
    if lic == "cc0":
        return "CC0 " + (ver or "1.0")
    if lic == "pdm":
        return "Public Domain Mark " + (ver or "1.0")
    return f"CC {lic.upper()} {ver}".strip() if lic else ""


def source_label(src: str) -> str:
    src = (src or "").strip()
    return SOURCES.get(src.lower()) or src.replace("_", " ").strip().title()


def _http(url: str) -> str | None:
    u = str(url or "").strip()
    return u[:1000] if re.match(r"^https?://", u, re.I) else None


class _TTL:
    """Oddiy xotiradagi kesh: muddat + hajm chegarasi."""

    def __init__(self, ttl: float, size: int):
        self.ttl, self.size, self.d, self.lock = ttl, size, {}, threading.Lock()

    def get(self, k):
        with self.lock:
            v = self.d.get(k)
            if not v:
                return None
            if time.monotonic() - v[0] > self.ttl:
                self.d.pop(k, None)
                return None
            return v[1]

    def put(self, k, v) -> None:
        with self.lock:
            if len(self.d) >= self.size:
                for old in sorted(self.d, key=lambda x: self.d[x][0])[: max(1, self.size // 5)]:
                    self.d.pop(old, None)
            self.d[k] = (time.monotonic(), v)

    def clear(self) -> None:
        with self.lock:
            self.d.clear()


class Openverse:
    name = "openverse"
    api = "https://api.openverse.org/v1"

    # tarmoq — testlarda almashtiriladi
    def _get_json(self, url: str) -> dict:
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": ua(), "Accept": "application/json"}), timeout=15) as r:
                return json.loads(r.read(4_000_000).decode("utf-8"))
        except urllib.error.HTTPError as e:
            if e.code == 404:
                raise ProviderError("not_found") from e
            if e.code == 429:
                raise ProviderError("provider_busy") from e
            raise ProviderError("provider_unavailable") from e
        except (OSError, ValueError) as e:
            raise ProviderError("provider_unavailable") from e

    def _fetch(self, url: str, max_bytes: int) -> bytes:
        from .media import FetchError  # noqa: PLC0415

        try:
            return safe_fetch(url, max_bytes=max_bytes, timeout=25, ua=ua())[0]
        except FetchError as e:
            raise ImageError("too_large" if str(e) == "too_large" else "fetch_failed") from e

    @staticmethod
    def norm(r: dict) -> dict | None:
        iid = str(r.get("id") or "")
        url = _http(r.get("url"))
        if not ID_RX.match(iid) or not url:
            return None
        return {
            "id": iid,
            "title": str(r.get("title") or "").strip()[:200],
            "width": r.get("width") if isinstance(r.get("width"), int) else None,
            "height": r.get("height") if isinstance(r.get("height"), int) else None,
            "creator": str(r.get("creator") or "").strip()[:120],
            "creator_url": _http(r.get("creator_url")),
            "source": source_label(str(r.get("source") or r.get("provider") or "")),
            "source_url": _http(r.get("foreign_landing_url")),
            "license": license_label(str(r.get("license") or ""), str(r.get("license_version") or "")),
            "license_url": _http(r.get("license_url")),
            "provider": "Openverse",
            "_url": url,
            "_thumb": _http(r.get("thumbnail")),
        }

    def search(self, q: str, page: int) -> dict:
        qs = urllib.parse.urlencode({"q": q, "page": page, "page_size": PAGE_SIZE, "license_type": LICENSE_TYPE, "mature": "false"})
        d = self._get_json(f"{self.api}/images/?{qs}")
        items = [x for x in (self.norm(r) for r in d.get("results") or [] if isinstance(r, dict)) if x]
        pages = min(int(d.get("page_count") or 0), MAX_PAGE)
        return {"items": items, "page": page, "pages": pages, "total": int(d.get("result_count") or 0)}

    def get(self, iid: str) -> dict:
        x = self.norm(self._get_json(f"{self.api}/images/{iid}/"))
        if not x:
            raise ProviderError("not_found")
        return x

    def _first(self, urls: list[str], max_bytes: int) -> bytes:
        """Birinchi muvaffaqiyatli manzil; «juda katta» va oxirgi xato qaytariladi."""
        err: ImageError | None = None
        for u in urls:
            try:
                return self._fetch(u, max_bytes)
            except ImageError as e:
                if str(e) == "too_large":
                    raise
                err = e
        raise err or ImageError("fetch_failed")

    def thumb(self, item: dict) -> bytes:
        # Openverse kichik rasmi; manba vaqtincha javob bermasa (424) — Wikimedia'ning tayyor kichik o'lchami yoki asl fayl
        urls = [item.get("_thumb") or f"{self.api}/images/{item['id']}/thumb/"]
        w = item.get("width") or 0
        small = wikimedia_thumb(item["_url"], 330) if not w or w > 330 else None
        urls += [small] if small else [item["_url"]]
        return self._first(urls, MAX_MEDIA)

    def original(self, item: dict) -> bytes:
        # Wikimedia asl fayllarni avtomatik yuklashni cheklaydi va standart kichik o'lchamlardan foydalanishni so'raydi
        w = item.get("width") or 0
        urls = [item["_url"]]
        if w > 1920 and wikimedia_thumb(item["_url"], 1920):
            urls.insert(0, wikimedia_thumb(item["_url"], 1920))
        elif w > 1280 and wikimedia_thumb(item["_url"], 1280):
            urls.append(wikimedia_thumb(item["_url"], 1280))
        return self._first([u for u in urls if u], MAX_MEDIA)


def wikimedia_thumb(url: str, px: int) -> str | None:
    """upload.wikimedia.org/.../commons/a/ab/Nom.jpg → .../commons/thumb/a/ab/Nom.jpg/{px}px-Nom.jpg (faqat rastrli rasmlar)."""
    m = re.match(r"^(https://upload\.wikimedia\.org/wikipedia/[\w-]+/)([0-9a-f]/[0-9a-f]{2}/)([^/?#]+\.(?:jpe?g|png|webp|gif))$", url or "", re.I)
    return f"{m.group(1)}thumb/{m.group(2)}{m.group(3)}/{px}px-{m.group(3)}" if m else None


class Fake(Openverse):
    """Internetsiz provayder: turli nisbatdagi rang-barang rasmlar (ishlab chiqish va skrinshotlar uchun)."""

    name = "fake"
    SHAPES = [(1600, 1000), (900, 1350), (2400, 800), (1200, 1200), (1500, 1000), (800, 1200), (2000, 1125), (1000, 1500)]
    COLORS = [(10, 46, 115), (30, 74, 56), (176, 141, 60), (86, 92, 105), (43, 90, 148), (125, 97, 32), (7, 31, 80), (90, 120, 160)]

    def _item(self, n: int, q: str = "") -> dict:
        w, h = self.SHAPES[n % len(self.SHAPES)]
        return {
            "id": f"fake-{n}", "title": f"{(q or 'Rasm').strip()[:40]} {n + 1}", "width": w, "height": h,
            "creator": f"Muallif {n + 1}", "creator_url": f"https://example.org/people/{n + 1}",
            "source": "Flickr" if n % 2 == 0 else "Wikimedia Commons", "source_url": f"https://example.org/photos/{n + 1}",
            "license": "CC BY 2.0" if n % 3 else "CC BY-SA 4.0",
            "license_url": "https://creativecommons.org/licenses/by/2.0/" if n % 3 else "https://creativecommons.org/licenses/by-sa/4.0/",
            "provider": "Openverse", "_url": f"fake://{n}", "_thumb": f"fake://{n}/thumb",
        }

    def search(self, q: str, page: int) -> dict:
        start = (page - 1) * PAGE_SIZE
        total = 90
        return {"items": [self._item(n, q) for n in range(start, min(start + PAGE_SIZE, total))], "page": page, "pages": -(-total // PAGE_SIZE), "total": total}

    def get(self, iid: str) -> dict:
        m = re.fullmatch(r"fake-(\d+)", iid)
        if not m:
            raise ProviderError("not_found")
        return self._item(int(m.group(1)))

    def _render(self, item: dict, scale: float) -> bytes:
        from PIL import Image, ImageDraw  # noqa: PLC0415

        n = int(item["id"].split("-")[1])
        w, h = int(item["width"] * scale), int(item["height"] * scale)
        im = Image.new("RGB", (w, h), self.COLORS[n % len(self.COLORS)])
        d = ImageDraw.Draw(im)
        for i in range(0, w + h, max(8, (w + h) // 24)):
            d.line([(i, 0), (i - h, h)], fill=(255, 255, 255), width=max(1, w // 300))
        d.rectangle([w // 10, h // 10, w - w // 10, h - h // 10], outline=(255, 255, 255), width=max(2, w // 150))
        out = io.BytesIO()
        im.save(out, "JPEG", quality=80)
        return out.getvalue()

    def thumb(self, item: dict) -> bytes:
        return self._render(item, 300 / max(item["width"], item["height"]))

    def original(self, item: dict) -> bytes:
        return self._render(item, 1.0)


_provider: Openverse | None = None
search_cache = _TTL(600, 300)  # (provayder, so'rov, sahifa) → natija
item_cache = _TTL(3600, 5000)  # id → rasm ma'lumoti (import va thumb uchun)
thumb_cache = _TTL(3600, 400)  # id → (bayt, mime)


def provider() -> Openverse:
    global _provider
    if _provider is None:
        _provider = Fake() if os.environ.get("SITE_OPENIMG_PROVIDER", "").strip().lower() == "fake" else Openverse()
    return _provider


def set_provider(p: Openverse | None) -> None:
    """Testlar uchun: provayderni almashtirish va keshni tozalash."""
    global _provider
    _provider = p
    for c in (search_cache, item_cache, thumb_cache):
        c.clear()


def public(item: dict) -> dict:
    return {k: v for k, v in item.items() if not k.startswith("_")}


def search(q: str, page: int) -> dict:
    p = provider()
    key = (p.name, q.lower(), page)
    hit = search_cache.get(key)
    if hit is None:
        hit = p.search(q, page)
        search_cache.put(key, hit)
        for x in hit["items"]:
            item_cache.put(x["id"], x)
    return {**hit, "items": [public(x) for x in hit["items"]]}


def get_item(iid: str) -> dict:
    if not ID_RX.match(iid or ""):
        raise ProviderError("not_found")
    x = item_cache.get(iid)
    if x is None:
        x = provider().get(iid)
        item_cache.put(iid, x)
    return x


def image_kind(raw: bytes) -> tuple[str, str] | None:
    """Rastrli rasm (PNG/JPG/WEBP/GIF) bo'lsa → (kengaytma, mime)."""
    try:
        from PIL import Image  # noqa: PLC0415

        with Image.open(io.BytesIO(raw)) as im:
            fmt = (im.format or "").upper()
            im.verify()
    except Exception:  # noqa: BLE001
        return None
    return IMAGE_FORMATS.get(fmt)


def thumb(iid: str) -> tuple[bytes, str]:
    hit = thumb_cache.get(iid)
    if hit:
        return hit
    item = get_item(iid)
    raw = provider().thumb(item)
    if not image_kind(raw):
        raise ImageError("not_image")
    out = small_jpeg(raw)
    thumb_cache.put(iid, out)
    return out


def small_jpeg(raw: bytes, side: int = THUMB_SIDE) -> tuple[bytes, str]:
    """Kichik rasm qayta kodlanadi (≤ side px, JPEG): hajm kichik, uchinchi tomon baytlari o'zgarmasdan berilmaydi."""
    from PIL import Image, ImageOps  # noqa: PLC0415

    with Image.open(io.BytesIO(raw)) as im:
        im = ImageOps.exif_transpose(im)
        im.thumbnail((side, side))
        if im.mode not in ("RGB", "L"):
            bg = Image.new("RGB", im.size, (243, 245, 248))
            im = im.convert("RGBA")
            bg.paste(im, mask=im.split()[-1])
            im = bg
        out = io.BytesIO()
        im.save(out, "JPEG", quality=78, optimize=True)
    return out.getvalue(), "image/jpeg"


def credit_line(item: dict) -> str:
    """«Foto: muallif / manba, litsenziya» — matn ko'rinishi (HTML izohdan tashqari joylar uchun)."""
    who = item.get("creator") or "—"
    return f"Foto: {who} / {item.get('source') or item.get('provider') or ''}, {item.get('license') or ''}".strip().rstrip(",")
