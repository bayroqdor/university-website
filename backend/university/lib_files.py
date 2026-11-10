"""Kutubxona elektron fayllari: turini tekshirish (PDF/EPUB/MP3/M4B), sahifa/bob soni, mundarija, matn (qidiruv indeksi uchun),
EPUB muqovasi va PDF'ga suv belgisi (yuklab olishga ruxsat berilganda).

Fayllar to'g'ridan-to'g'ri havola bilan berilmaydi — `data/library/` papkasida, faqat tokenli manzil orqali (api/library.py).
"""
from __future__ import annotations

import io
import posixpath
import re
import unicodedata
import zipfile
from html import unescape
from xml.etree import ElementTree as ET


class FileError(ValueError):
    pass


def sniff(head: bytes, filename: str) -> tuple[str, str]:
    """(tur, kengaytma) — fayl mazmuni bo'yicha; nomiga ishonilmaydi."""
    low = (filename or "").lower()
    if head[:5] == b"%PDF-":
        return "pdf", "pdf"
    if head[:4] == b"PK\x03\x04" and (b"mimetypeapplication/epub+zip" in head[:200] or low.endswith(".epub")):
        return "epub", "epub"
    if head[:3] == b"ID3" or (len(head) > 1 and head[0] == 0xFF and (head[1] & 0xE0) == 0xE0):
        return "audio", "mp3"
    if head[4:8] == b"ftyp":
        brand = head[8:12]
        if brand in (b"M4B ", b"M4A ", b"mp42", b"isom", b"mp41", b"dash"):
            return "audio", "m4b" if brand == b"M4B " or low.endswith(".m4b") else "m4a"
    raise FileError("unsupported_type")


MIME = {"pdf": "application/pdf", "epub": "application/epub+zip", "mp3": "audio/mpeg", "m4b": "audio/mp4", "m4a": "audio/mp4"}


# ------------------------------------------------------------------ PDF
def pdf_info(path: str, max_text: int = 3_000_000) -> dict:
    from pypdf import PdfReader  # noqa: PLC0415

    r = PdfReader(path)
    if r.is_encrypted:
        try:
            r.decrypt("")
        except Exception as e:  # noqa: BLE001
            raise FileError("pdf_encrypted") from e
    pages = len(r.pages)
    toc: list[dict] = []

    def walk(items, level=0):
        for it in items:
            if isinstance(it, list):
                walk(it, level + 1)
                continue
            try:
                toc.append({"title": str(it.title)[:200], "page": r.get_destination_page_number(it) + 1, "level": level})
            except Exception:  # noqa: BLE001
                pass
            if len(toc) > 500:
                return

    try:
        walk(r.outline)
    except Exception:  # noqa: BLE001
        toc = []
    meta = {}
    try:
        m = r.metadata or {}
        meta = {"title": str(m.get("/Title") or "")[:300], "author": str(m.get("/Author") or "")[:300]}
    except Exception:  # noqa: BLE001
        pass
    return {"pages": pages, "toc": toc, "meta": meta, "reader": r, "max_text": max_text}


def pdf_text(info: dict) -> str:
    """Matnli PDF'dan matn (skaner qilingan — OCR yo'q, bo'sh qaytadi)."""
    out, total = [], 0
    for p in info["reader"].pages:
        try:
            t = p.extract_text() or ""
        except Exception:  # noqa: BLE001
            t = ""
        out.append(t)
        total += len(t)
        if total > info["max_text"]:
            break
    return "\n".join(out)


def ascii_text(s: str) -> str:
    s = re.sub(r"[ʻʼ‘’`]", "'", s or "")
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    return re.sub(r"[()\\]", "", s)[:120]


def _wm_page(w: float, h: float, text: str):
    from pypdf import PdfWriter  # noqa: PLC0415
    from pypdf.generic import DecodedStreamObject, DictionaryObject, FloatObject, NameObject  # noqa: PLC0415

    tw = PdfWriter()
    page = tw.add_blank_page(width=w, height=h)
    font = DictionaryObject({NameObject("/Type"): NameObject("/Font"), NameObject("/Subtype"): NameObject("/Type1"),
                             NameObject("/BaseFont"): NameObject("/Helvetica"), NameObject("/Encoding"): NameObject("/WinAnsiEncoding")})
    gs = DictionaryObject({NameObject("/Type"): NameObject("/ExtGState"), NameObject("/ca"): FloatObject(0.16), NameObject("/CA"): FloatObject(0.16)})
    page[NameObject("/Resources")] = DictionaryObject({NameObject("/Font"): DictionaryObject({NameObject("/KWf"): tw._add_object(font)}),
                                                        NameObject("/ExtGState"): DictionaryObject({NameObject("/KWgs"): tw._add_object(gs)})})
    size = max(10.0, min(w, h) / 22)
    content = (f"q /KWgs gs 0.55 0 0 rg BT /KWf {size:.1f} Tf 0.7071 0.7071 -0.7071 0.7071 {w * 0.16:.1f} {h * 0.2:.1f} Tm ({text}) Tj ET Q "
               f"q 0.35 g BT /KWf 7 Tf 1 0 0 1 18 10 Tm ({text}) Tj ET Q")
    stream = DecodedStreamObject()
    stream.set_data(content.encode("latin-1", "ignore"))
    page[NameObject("/Contents")] = tw._add_object(stream)
    return page


def watermark_pdf(path: str, label: str) -> bytes:
    """Har sahifaga yarim shaffof diagonal yozuv va pastki qatorda: «Ism · sana · kutubxona»."""
    from pypdf import PdfReader, PdfWriter  # noqa: PLC0415

    text = ascii_text(label)
    writer = PdfWriter(clone_from=PdfReader(path))
    cache: dict = {}
    for page in writer.pages:
        w, h = float(page.mediabox.width), float(page.mediabox.height)
        key = (round(w), round(h))
        if key not in cache:
            cache[key] = _wm_page(w, h, text)
        page.merge_page(cache[key], over=True)
    writer.add_metadata({"/Producer": "University library", "/Subject": text})
    buf = io.BytesIO()
    writer.write(buf)
    return buf.getvalue()


# ------------------------------------------------------------------ EPUB
NS = {"c": "urn:oasis:names:tc:opendocument:xmlns:container", "opf": "http://www.idpf.org/2007/opf", "dc": "http://purl.org/dc/elements/1.1/",
      "ncx": "http://www.daisy.org/z3986/2005/ncx/", "x": "http://www.w3.org/1999/xhtml", "ops": "http://www.idpf.org/2007/ops"}
_TAG = re.compile(r"<[^>]+>")


def epub_info(path: str, max_text: int = 3_000_000) -> dict:
    try:
        z = zipfile.ZipFile(path)
    except zipfile.BadZipFile as e:
        raise FileError("bad_epub") from e
    with z:
        try:
            cont = ET.fromstring(z.read("META-INF/container.xml"))
            opf_path = cont.find(".//c:rootfile", NS).attrib["full-path"]
            opf = ET.fromstring(z.read(opf_path))
        except Exception as e:  # noqa: BLE001
            raise FileError("bad_epub") from e
        base = posixpath.dirname(opf_path)
        join = lambda h: posixpath.normpath(posixpath.join(base, h)) if base else posixpath.normpath(h)  # noqa: E731
        manifest = {}
        for it in opf.findall(".//opf:manifest/opf:item", NS):
            manifest[it.attrib.get("id")] = {"href": join(it.attrib.get("href", "")), "type": it.attrib.get("media-type", ""), "props": it.attrib.get("properties", "")}
        spine = [manifest[i.attrib["idref"]]["href"] for i in opf.findall(".//opf:spine/opf:itemref", NS) if i.attrib.get("idref") in manifest]
        title = (opf.findtext(".//dc:title", "", NS) or "").strip()
        author = ", ".join((a.text or "").strip() for a in opf.findall(".//dc:creator", NS) if (a.text or "").strip())
        lang = (opf.findtext(".//dc:language", "", NS) or "").strip()[:10]
        # muqova: EPUB3 «cover-image» yoki EPUB2 <meta name="cover">
        cover = None
        for m in manifest.values():
            if "cover-image" in m["props"]:
                cover = m["href"]
        if not cover:
            meta = opf.find(".//opf:metadata/opf:meta[@name='cover']", NS)
            if meta is not None and meta.attrib.get("content") in manifest:
                cover = manifest[meta.attrib["content"]]["href"]
        cover_bytes = None
        if cover:
            try:
                cover_bytes = z.read(cover)
            except KeyError:
                cover_bytes = None
        # mundarija: nav.xhtml (EPUB3) yoki toc.ncx (EPUB2)
        toc: list[dict] = []
        nav = next((m for m in manifest.values() if "nav" in m["props"].split()), None)
        try:
            if nav:
                doc = z.read(nav["href"]).decode("utf-8", "ignore")
                for a in re.finditer(r"<a[^>]*href=\"([^\"]+)\"[^>]*>(.*?)</a>", doc, re.S):
                    toc.append({"title": unescape(_TAG.sub("", a.group(2))).strip()[:200], "href": a.group(1)})
            else:
                ncx = next((m for m in manifest.values() if m["type"] == "application/x-dtbncx+xml"), None)
                if ncx:
                    nx = ET.fromstring(z.read(ncx["href"]))
                    for np_ in nx.iter("{%s}navPoint" % NS["ncx"]):
                        lbl = np_.findtext("ncx:navLabel/ncx:text", "", NS)
                        src = np_.find("ncx:content", NS)
                        toc.append({"title": lbl.strip()[:200], "href": src.attrib.get("src", "") if src is not None else ""})
        except Exception:  # noqa: BLE001
            toc = []
        texts, total = [], 0
        for href in spine:
            try:
                raw = z.read(href).decode("utf-8", "ignore")
            except KeyError:
                continue
            t = unescape(_TAG.sub(" ", re.sub(r"<(script|style)[^>]*>.*?</\1>", " ", raw, flags=re.S | re.I)))
            t = re.sub(r"\s+", " ", t).strip()
            texts.append(t)
            total += len(t)
            if total > max_text:
                break
    return {"chapters": len(spine), "toc": toc[:500], "meta": {"title": title[:300], "author": author[:300], "lang": lang},
            "cover": cover_bytes, "text": "\n".join(texts)}


def epub_cover(path: str) -> bytes | None:
    """EPUB ichidagi muqova rasmi (EPUB3 «cover-image», EPUB2 <meta name="cover">, yoki nomida «cover» bo'lgan rasm) — matn o'qilmaydi."""
    try:
        z = zipfile.ZipFile(path)
    except (zipfile.BadZipFile, OSError):
        return None
    with z:
        try:
            cont = ET.fromstring(z.read("META-INF/container.xml"))
            opf_path = cont.find(".//c:rootfile", NS).attrib["full-path"]
            opf = ET.fromstring(z.read(opf_path))
        except Exception:  # noqa: BLE001
            return None
        base = posixpath.dirname(opf_path)
        join = lambda h: posixpath.normpath(posixpath.join(base, h)) if base else posixpath.normpath(h)  # noqa: E731
        items = [{"id": it.attrib.get("id", ""), "href": join(it.attrib.get("href", "")), "type": it.attrib.get("media-type", ""),
                  "props": it.attrib.get("properties", "")} for it in opf.findall(".//opf:manifest/opf:item", NS)]
        imgs = [m for m in items if m["type"].startswith("image/")]
        pick = next((m for m in imgs if "cover-image" in m["props"].split()), None)
        if not pick:
            meta = opf.find(".//opf:metadata/opf:meta[@name='cover']", NS)
            cid = meta.attrib.get("content") if meta is not None else None
            pick = next((m for m in imgs if m["id"] == cid), None)
        if not pick:
            pick = next((m for m in imgs if "cover" in (m["id"] + m["href"]).lower()), None)
        if not pick:
            return None
        try:
            return z.read(pick["href"])
        except KeyError:
            return None
