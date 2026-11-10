"""Media fayllarni tekshirib saqlash (admin yuklashi va kabinet fayllari uchun umumiy)."""
from __future__ import annotations

import io
import uuid

IMAGE_FORMATS = {"PNG": ("png", "image/png"), "JPEG": ("jpg", "image/jpeg"), "WEBP": ("webp", "image/webp"), "GIF": ("gif", "image/gif")}
MAX_MEDIA = 15 * 1024 * 1024
MAX_VIDEO = 80 * 1024 * 1024  # e'lon oynasi va sahifalar uchun qisqa videolar (MP4 / WebM)
MAX_SIDE = 2400
OFFICE_MIME = {
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
}


class MediaError(ValueError):
    """too_large | unsupported_type"""


def _svg_to_png(raw: bytes) -> bytes | None:
    """SVG logotiplar: xavfsizlik uchun SVG o'zi saqlanmaydi (skript bo'lishi mumkin) — imkon bo'lsa PNG ga aylantiriladi."""
    try:
        import cairosvg  # type: ignore  # noqa: PLC0415

        return cairosvg.svg2png(bytestring=raw, output_width=512)
    except Exception:  # noqa: BLE001
        return None


IMAGE_BRANDS = (b"heic", b"heix", b"hevc", b"heim", b"heis", b"mif1", b"msf1", b"avif", b"avis")


def is_video(raw: bytes) -> bool:
    """MP4/MOV (ftyp, rasm bo'lmagan brend) yoki WebM."""
    return (raw[4:8] == b"ftyp" and raw[8:12] not in IMAGE_BRANDS) or raw[:4] == b"\x1a\x45\xdf\xa3"


def store_media(st, raw: bytes, filename: str, allow_video: bool = False) -> dict:
    """Fayl mazmunini tekshirib media papkasiga saqlaydi: rasm (PNG/JPG/WEBP/GIF), PDF, DOCX/XLSX/PPTX, video (MP4/WebM)."""
    video = is_video(raw)
    if video and not allow_video:
        raise MediaError("unsupported_type")
    if len(raw) > (MAX_VIDEO if video else MAX_MEDIA):
        raise MediaError("too_large")
    mid = uuid.uuid4().hex[:16]
    width = height = None
    low = (filename or "").lower()
    head = raw[:400].lstrip().lower()
    if head.startswith(b"<?xml") or head.startswith(b"<svg"):
        png = _svg_to_png(raw)
        if not png:
            raise MediaError("unsupported_type")
        raw, low = png, low.rsplit(".", 1)[0] + ".png"
    if video:
        ext, mime, data = ("webm", "video/webm", raw) if raw[:4] == b"\x1a\x45\xdf\xa3" else ("mp4", "video/mp4", raw)
    elif raw[:5] == b"%PDF-":
        ext, mime, data = "pdf", "application/pdf", raw
    elif raw[:4] == b"PK\x03\x04" and low.endswith((".docx", ".xlsx", ".pptx")):
        ext = low.rsplit(".", 1)[1]
        mime, data = OFFICE_MIME[ext], raw
    else:
        try:
            from PIL import Image, ImageOps  # noqa: PLC0415

            with Image.open(io.BytesIO(raw)) as im:
                fmt = (im.format or "").upper()
                im.verify()
            if fmt not in IMAGE_FORMATS:
                raise ValueError(fmt)
            ext, mime = IMAGE_FORMATS[fmt]
            data = raw
            with Image.open(io.BytesIO(raw)) as im:
                width, height = im.size
                if fmt != "GIF" and max(im.size) > MAX_SIDE:
                    im = ImageOps.exif_transpose(im)
                    im.thumbnail((MAX_SIDE, MAX_SIDE))
                    out = io.BytesIO()
                    if fmt == "JPEG" and im.mode not in ("RGB", "L"):
                        im = im.convert("RGB")
                    im.save(out, fmt, quality=86, optimize=True)
                    data = out.getvalue()
                    width, height = im.size
        except Exception as e:  # noqa: BLE001
            raise MediaError("unsupported_type") from e
    name = f"{mid}.{ext}"
    put_blob(st, name, data, mime)
    m = st.add_media(name, filename or name, mime, len(data), width, height)
    return m | {"url": f"/media/{name}"}


# ------------------------------------------------------------------ saqlash joyi: lokal disk va/yoki S3
def put_blob(st, name: str, data: bytes, mime: str, private: bool = False) -> None:
    """Faylni saqlash: S3 yoqilgan bo'lsa — S3 ga (keep_local bo'lsa diskda ham nusxa), aks holda lokal diskka.
    private=True — yopiq fayllar (rezyume): diskda `private/`, S3 da `private/` kaliti bilan."""
    from . import s3  # noqa: PLC0415

    local = (st.dir / "private" / name) if private else (st.media_dir / name)
    cfg = s3.config(st)
    if s3.ready(cfg):
        s3.Client(cfg).put(("private/" if private else "media/") + name, data, mime, "private, no-store" if private else "public, max-age=31536000, immutable")
        if not cfg.get("keep_local"):
            return
    local.parent.mkdir(parents=True, exist_ok=True)
    local.write_bytes(data)


def blob_url(st, name: str, private: bool = False) -> str | None:
    """Diskda yo'q fayl uchun S3 havolasi (ochiq yoki imzolangan)."""
    from . import s3  # noqa: PLC0415

    c = s3.client(st)
    if not c:
        return None
    key = ("private/" if private else "media/") + name
    return c.presign(key, 900) if private else c.url(key)


def get_blob(st, name: str, private: bool = False) -> bytes | None:
    local = (st.dir / "private" / name) if private else (st.media_dir / name)
    if local.exists():
        return local.read_bytes()
    from . import s3  # noqa: PLC0415

    c = s3.client(st)
    if not c:
        return None
    try:
        return c.get(("private/" if private else "media/") + name)
    except s3.S3Error:
        return None


def delete_blob(st, name: str) -> None:
    from . import s3  # noqa: PLC0415

    c = s3.client(st)
    if c:
        try:
            c.delete("media/" + name)
        except s3.S3Error:
            pass


# ------------------------------------------------------------------ tashqi URL'dan yuklab olish (SSRF himoyasi bilan)
class FetchError(ValueError):
    """invalid_url | blocked_host | fetch_failed | too_large"""


def _host_ok(host: str) -> bool:
    """Ichki tarmoq, localhost va maxsus manzillarga so'rov yuborilmaydi (server ichidagi xizmatlarni o'qib olishning oldini olish)."""
    import ipaddress  # noqa: PLC0415
    import os  # noqa: PLC0415
    import socket  # noqa: PLC0415

    host = (host or "").strip("[]").lower()
    if not host or host == "localhost" or host.endswith((".localhost", ".local", ".internal")):
        return False

    def public(ip: str) -> bool:
        a = ipaddress.ip_address(ip.split("%")[0])
        return not (a.is_private or a.is_loopback or a.is_link_local or a.is_multicast or a.is_reserved or a.is_unspecified)

    try:
        return public(host)  # IP manzil to'g'ridan-to'g'ri yozilgan
    except ValueError:
        pass
    try:
        ips = {x[4][0] for x in socket.getaddrinfo(host, None)}
    except OSError:
        # proksi orqali chiqiladigan muhitda nom proksida aniqlanadi
        return bool(os.environ.get("HTTPS_PROXY") or os.environ.get("https_proxy"))
    return bool(ips) and all(public(ip) for ip in ips)


def safe_fetch(url: str, max_bytes: int = MAX_MEDIA, timeout: int = 25, ua: str | None = None) -> tuple[bytes, str]:
    """http(s) URL'ni yuklaydi; har bir yo'naltirish (redirect) ham tekshiriladi. → (mazmun, fayl nomi)."""
    import urllib.request  # noqa: PLC0415
    from urllib.parse import urlparse  # noqa: PLC0415

    def check(u: str) -> None:
        p = urlparse(u)
        if p.scheme not in ("http", "https") or not p.hostname:
            raise FetchError("invalid_url")
        if not _host_ok(p.hostname):
            raise FetchError("blocked_host")

    class Redirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, req, fp, code, msg, headers, newurl):  # noqa: ANN001, PLR0913
            check(newurl)
            return super().redirect_request(req, fp, code, msg, headers, newurl)

    check(url)
    opener = urllib.request.build_opener(Redirect)
    try:
        with opener.open(urllib.request.Request(url, headers={"User-Agent": ua or "Mozilla/5.0 (University media)"}), timeout=timeout) as r:
            raw = r.read(max_bytes + 1)
    except FetchError:
        raise
    except Exception as e:  # noqa: BLE001
        raise FetchError(f"fetch_failed:{type(e).__name__}") from e
    if len(raw) > max_bytes:
        raise FetchError("too_large")
    return raw, (urlparse(url).path.rsplit("/", 1)[-1] or "file")
