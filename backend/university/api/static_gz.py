"""Frontend fayllarini (JS/CSS/SVG) siqilgan holda berish.

Sayt to'g'ridan-to'g'ri uvicorn orqali ochilganda (run.sh, Docker) /assets/* fayllari siqilmasdan ketardi: masalan, PDF ko'rish uchun
pdf.js ishchi fayli 1,4 MB (gzip bilan ~0,4 MB). Fayl nomlari xeshli va o'zgarmas — gzip nusxasi bir marta yaratilib,
ma'lumotlar papkasida (cache/gz) saqlanadi. Brauzer gzip qabul qilmasa yoki nusxa yaratib bo'lmasa — asl fayl beriladi.
"""
from __future__ import annotations

import gzip
import hashlib
import mimetypes
import os
import tempfile
from pathlib import Path

from fastapi import Request
from fastapi.responses import FileResponse

EXTS = {".js", ".mjs", ".css", ".svg", ".json", ".map", ".txt", ".xml", ".webmanifest"}
MIN_SIZE = 1024


def _cache_dir() -> Path:
    return Path(os.environ.get("SITE_DATA_DIR", "./var")).resolve() / "cache" / "gz"


def gzipped(f: Path, request: Request, headers: dict) -> FileResponse | None:
    """Siqilgan javob (yoki None — asl faylni berish kerak)."""
    if f.suffix.lower() not in EXTS or "gzip" not in (request.headers.get("accept-encoding") or "").lower():
        return None
    try:
        st = f.stat()
        if st.st_size < MIN_SIZE:
            return None
        key = hashlib.sha1(f"{f}:{st.st_size}:{st.st_mtime_ns}".encode()).hexdigest()[:16]
        gz = _cache_dir() / f"{f.name}.{key}.gz"
        if not gz.exists():
            gz.parent.mkdir(parents=True, exist_ok=True)
            fd, tmp = tempfile.mkstemp(dir=gz.parent, suffix=".tmp")
            with os.fdopen(fd, "wb") as out:
                out.write(gzip.compress(f.read_bytes(), compresslevel=9, mtime=0))
            os.replace(tmp, gz)  # bir vaqtdagi so'rovlar chala faylni ko'rmaydi
    except OSError:
        return None
    mime = mimetypes.guess_type(f.name)[0] or "application/octet-stream"
    if f.suffix.lower() == ".mjs":
        mime = "text/javascript"
    return FileResponse(gz, media_type=mime, headers={**headers, "Content-Encoding": "gzip", "Vary": "Accept-Encoding"})
