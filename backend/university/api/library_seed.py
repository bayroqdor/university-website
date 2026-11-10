"""Ochiq fond: erkin litsenziyali / jamoat mulki bo'lgan kitoblar (PDF, EPUB) va audiokitoblar (MP3).

Ro'yxat — `university/seed_library/catalog.json` (meta ma'lumot, o'zbekcha annotatsiya, litsenziya, manba, fayl manzillari),
muqovalar — `university/seed_library/covers/<key>.jpg`. Fayllarning o'zi omborga qo'yilmaydi: server ularni manbadan
(Project Gutenberg, OpenStax, LibriVox/archive.org, Wikisource …) fon oqimida yuklab, oddiy yuklangan fayl kabi
fondga qo'shadi (sahifalar, mundarija, matn indeksi).

Birinchi ishga tushishda o'zi boshlanadi (`SITE_LIBRARY_SEED=0` — o'chiradi). Holat kv'da: «lib_seed» —
{key: {"bid", "files": [url…], "error"}}. Admin o'chirgan kitob qayta qo'shilmaydi — faqat qo'lda, alohida tugma bilan.
"""
from __future__ import annotations

import json
import os
import threading
import time
import uuid
from pathlib import Path

from fastapi import APIRouter, Body, Depends, HTTPException

from .. import lib_files as LF
from .deps import current_admin, ok, svc
from ..library import access_value
from .library import _files_dir, _need_settings, lib, register_file

router = APIRouter()

ROOT = Path(__file__).resolve().parent.parent / "seed_library"
KV = "lib_seed"
UA = "UniversityLibrary/1.0 python-httpx"
ACTOR = {"id": "", "name": "Ochiq fond", "login": "system", "role": "admin"}
_RUN: dict = {"thread": None, "stop": threading.Event(), "current": "", "done": 0, "total": 0, "bytes": 0, "errors": []}


def catalog() -> list[dict]:
    try:
        return json.loads((ROOT / "catalog.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return []


def seed_access() -> str:
    """Ochiq fond fayllari kimga ochiq: «registered» (ro'yxatdan o'tganlar, standart) yoki «public» (hammaga)."""
    v = access_value((svc().st.kv_get("lib_seed_access") or {}).get("access"), "registered")
    return v if v in ("public", "registered") else "registered"


def _state() -> dict:
    return svc().st.kv_get(KV) or {}


def _save_state(s: dict) -> None:
    svc().st.kv_put(KV, s)


def _annotation(it: dict) -> str:
    a = (it.get("annotation") or "").strip()
    src = f"Manba: {it.get('source') or '—'}" + (f" ({it['source_url']})" if it.get("source_url") else "")
    return f"{a}\n\n{src}. Litsenziya: {it.get('license') or '—'}.".strip()


def _download(url: str, dest: Path, limit: int) -> int:
    """Faylni qismlab yuklaydi (3 urinish). Qaytaradi: hajm (bayt)."""
    import httpx  # noqa: PLC0415

    err: Exception | None = None
    for attempt in range(3):
        if _RUN["stop"].is_set():
            raise RuntimeError("stopped")
        part = dest.with_suffix(dest.suffix + ".part")
        try:
            size = 0
            with httpx.stream("GET", url, headers={"User-Agent": UA}, follow_redirects=True, timeout=httpx.Timeout(60, read=120)) as r:
                r.raise_for_status()
                with open(part, "wb") as out:
                    for chunk in r.iter_bytes(1024 * 256):
                        size += len(chunk)
                        if size > limit:
                            raise ValueError("file_too_large")
                        out.write(chunk)
                        _RUN["bytes"] += len(chunk)
            part.replace(dest)
            return size
        except ValueError:
            part.unlink(missing_ok=True)
            raise
        except Exception as e:  # noqa: BLE001
            part.unlink(missing_ok=True)
            err = e
            _RUN["stop"].wait(5 * (attempt + 1))
    raise RuntimeError(f"download: {err}")


def _mp3_seconds(path: Path, size: int) -> float | None:
    """Davomiylik ma'lum bo'lmasa — MP3 kadr sarlavhasidagi bitreytdan taxmin (LibriVox — CBR 64 kbit/s)."""
    rates = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320]
    try:
        raw = path.read_bytes()[:200_000]
    except OSError:
        return None
    i = 0
    if raw[:3] == b"ID3" and len(raw) > 10:
        i = 10 + ((raw[6] & 0x7F) << 21 | (raw[7] & 0x7F) << 14 | (raw[8] & 0x7F) << 7 | (raw[9] & 0x7F))
    while i < len(raw) - 4:
        if raw[i] == 0xFF and (raw[i + 1] & 0xE6) == 0xE2:  # MPEG-1 Layer III
            br = rates[(raw[i + 2] >> 4) & 0x0F] if ((raw[i + 2] >> 4) & 0x0F) < 15 else 0
            if br:
                return round((size - i) * 8 / (br * 1000), 1)
        i += 1
    return None


def _cover(it: dict) -> str:
    from ..media import MediaError, store_media  # noqa: PLC0415

    raw = b""
    p = ROOT / "covers" / f"{it['key']}.jpg"
    if p.exists():
        raw = p.read_bytes()
    elif it.get("cover_url"):
        try:
            import httpx  # noqa: PLC0415

            r = httpx.get(it["cover_url"], headers={"User-Agent": UA}, follow_redirects=True, timeout=30)
            if r.status_code == 200 and len(r.content) < 8 * 1024 * 1024:
                raw = r.content
        except Exception:  # noqa: BLE001
            raw = b""
    if not raw:
        return ""
    try:
        return store_media(svc().st, raw, "cover.jpg")["url"]
    except MediaError:
        return ""


def import_item(it: dict, state: dict) -> None:
    L = lib()
    rec = state.get(it["key"]) or {}
    bid = rec.get("bid") if rec.get("bid") and L.book(rec["bid"]) else None
    if not bid:
        meta = {k: it.get(k) for k in ("title", "subtitle", "authors", "publisher", "year", "lang", "categories", "keywords", "isbn")}
        meta["annotation"] = _annotation(it)
        meta["cover"] = _cover(it)
        meta["pages"] = it.get("pages")
        bid = L.save_book(meta, ACTOR)["id"]
        rec = {"bid": bid, "files": []}
        state[it["key"]] = rec
        _save_state(state)
    # ochiq fond — ishonchli manbalar: rangli darsliklar (OpenStax) 200 MB dan katta bo'lishi mumkin
    limit = max(int(L.settings()["max_file_mb"]), 600) * 1024 * 1024
    for n, f in enumerate(it.get("files") or []):
        if f["url"] in rec["files"]:
            continue
        _RUN["current"] = f"{it['title']} — {f.get('title') or f['kind']}"
        fid = uuid.uuid4().hex[:12]
        tmp = _files_dir() / bid / f"{fid}.download"
        tmp.parent.mkdir(parents=True, exist_ok=True)
        size = _download(f["url"], tmp, limit)
        with open(tmp, "rb") as fh:
            head = fh.read(512)
        try:
            kind, ext = LF.sniff(head, f["url"])
        except LF.FileError:
            tmp.unlink(missing_ok=True)
            raise
        dest = tmp.with_name(f"{fid}.{ext}")
        tmp.replace(dest)
        dur = f.get("duration") or (_mp3_seconds(dest, size) if ext == "mp3" else None)
        register_file(bid, fid, kind, dest, size, f.get("title") or it["title"], f["url"].rsplit("/", 1)[-1], sort=n, duration=dur, access=seed_access(),
                      actor=ACTOR, wait_index=True)
        rec["files"].append(f["url"])
        rec.pop("error", None)
        _save_state(state)


def run(keys: list[str] | None = None, restore: bool = False) -> None:
    items = catalog()
    state = _state()
    L = lib()

    def wanted(it: dict) -> bool:
        if keys is not None and it["key"] not in keys:
            return False
        rec = state.get(it["key"])
        if not rec:
            return True
        alive = bool(rec.get("bid")) and bool(L.book(rec["bid"]))
        if not alive:
            return restore  # admin o'chirgan kitob — faqat qo'lda tiklanadi
        return len(rec.get("files") or []) < len(it.get("files") or [])

    todo = [it for it in items if wanted(it)]
    _RUN.update(done=0, total=len(todo), bytes=0, errors=[], current="")
    for it in todo:
        if _RUN["stop"].is_set():
            break
        _RUN["current"] = it["title"]
        try:
            import_item(it, state)
        except Exception as e:  # noqa: BLE001
            msg = str(e)[:300]
            _RUN["errors"].append({"key": it["key"], "title": it["title"], "error": msg})
            state.setdefault(it["key"], {}).update(error=msg)
            _save_state(state)
            print(f"library seed {it['key']}: {msg}", flush=True)
        _RUN["done"] += 1
    _RUN["current"] = ""
    st = svc().st
    st.kv_put("lib_seed_meta", (st.kv_get("lib_seed_meta") or {}) | {"auto_done": True, "finished": time.strftime("%Y-%m-%dT%H:%M:%S")})


def running() -> bool:
    t = _RUN["thread"]
    return bool(t and t.is_alive())


def start(keys: list[str] | None = None, restore: bool = False) -> bool:
    if running():
        return False
    _RUN["stop"].clear()
    _RUN["thread"] = threading.Thread(target=run, args=(keys, restore), daemon=True, name="library-seed")
    _RUN["thread"].start()
    return True


def autostart() -> None:
    """Server ishga tushganda: ochiq fond hali yuklanmagan bo'lsa — fon rejimida boshlaydi (bir marta)."""
    if os.environ.get("SITE_LIBRARY_SEED", "1") == "0" or not catalog():
        return
    if (svc().st.kv_get("lib_seed_meta") or {}).get("auto_done") and not any(r.get("error") for r in _state().values()):
        return

    def later():
        if not _RUN["stop"].wait(20):  # server to'liq ishga tushib olsin
            start()

    threading.Thread(target=later, daemon=True).start()


def stop() -> None:
    _RUN["stop"].set()


def status() -> dict:
    state = _state()
    L = lib()
    rows = []
    for it in catalog():
        rec = state.get(it["key"]) or {}
        alive = bool(rec.get("bid")) and bool(L.book(rec["bid"]))
        nfiles = len(it.get("files") or [])
        st = ("done" if len(rec.get("files") or []) >= nfiles else "partial") if alive else ("deleted" if rec.get("bid") else "pending")
        if rec.get("error") and st != "done":
            st = "error"
        kinds = sorted({f["kind"] for f in it.get("files") or []})
        rows.append({"key": it["key"], "title": it["title"], "authors": it.get("authors") or [], "lang": it.get("lang") or "", "kinds": kinds,
                     "files": nfiles, "size": sum(int(f.get("size") or 0) for f in it.get("files") or []), "license": it.get("license") or "",
                     "source": it.get("source") or "", "status": st, "book_id": rec.get("bid") if alive else None, "error": rec.get("error") or ""})
    return {"items": rows, "access": seed_access(), "running": running(), "current": _RUN["current"], "done": _RUN["done"], "total": _RUN["total"], "bytes": _RUN["bytes"],
            "errors": _RUN["errors"][-20:]}


@router.get("/api/admin/library/seed")
def seed_status(a: dict = Depends(current_admin)):
    return ok(status())


@router.post("/api/admin/library/seed")
def seed_start(data: dict = Body(default={}), a: dict = Depends(current_admin)):
    _need_settings(a)
    keys = data.get("keys")
    if keys is not None and not isinstance(keys, list):
        raise HTTPException(400, "bad_keys")
    if not start([str(k) for k in keys] if keys is not None else None, restore=bool(data.get("restore"))):
        raise HTTPException(409, "already_running")
    return ok(status())


@router.post("/api/admin/library/seed/stop")
def seed_stop(a: dict = Depends(current_admin)):
    _need_settings(a)
    stop()
    return ok({"stopping": True})


@router.put("/api/admin/library/seed/access")
def seed_access_save(data: dict = Body(...), a: dict = Depends(current_admin)):
    """Ochiq fond: «Kimga ochiq» — ro'yxatdan o'tganlar yoki hammaga. Mavjud ochiq fond fayllariga ham darhol qo'llanadi."""
    _need_settings(a)
    acc = access_value(data.get("access"), "")
    if acc not in ("public", "registered"):
        raise HTTPException(400, "bad_access")
    st = svc().st
    st.kv_put("lib_seed_access", {"access": acc})
    bids = [r.get("bid") for r in _state().values() if r.get("bid")]
    n = 0
    if bids:
        with st._tx() as c:
            n = c.execute("UPDATE lib_files SET access=%s WHERE book_id = ANY(%s)", (acc, bids)).rowcount or 0
    lib().audit(a, "seed.access", "fund", "", None, {"access": acc, "files": n})
    return ok(status() | {"updated": n})
