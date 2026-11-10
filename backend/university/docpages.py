"""PDF sahifalarini serverda rasmga (WebP) aylantirib berish — sekin kanalda ham hujjat tez ko'rinsin.

Muammo: skaner qilingan PDF ning har bir sahifasi yuzlab KB–bir necha MB; pdf.js brauzerda sahifani chizish uchun shuncha ma'lumotni
64 KB lik bo'laklar bilan tortadi va serverning sekin chiqish kanalida (≈300 KB/s) 1–2 sahifadan keyin «osilib» qoladi.
Yechim: sahifa serverda pdfium (pypdfium2) bilan 800/1200 px kenglikdagi WebP ga chiziladi — skan sahifasi 15–150 KB bo'ladi.

  * kalit (key) = xesh(maxfiy tuz + fayl yo'li + hajmi + o'zgargan vaqti): fayl o'zgarsa — yangi kalit, shuning uchun rasmlar
    o'zgarmas (immutable) — Cloudflare va brauzer bir yil keshlaydi; tuz tufayli kalitni taxmin qilib bo'lmaydi (yopiq hujjatlar uchun ham);
  * kesh: $SITE_DATA_DIR/cache/docpages/<key>/{src.json, meta.json, <w>/<n>.webp} (atomik yozish);
  * chizish alohida jarayonlarda (spawn, bir vaqtda ko'pi bilan WORKERS ta): pdfium oqimlar uchun xavfsiz emas, buzuq/zararli PDF
    serverni yiqitmasin — ishchi jarayon yiqilsa yoki osilib qolsa, pul qayta yaratiladi;
  * navbat: foydalanuvchi kutayotgan sahifa (0) fonda tayyorlanayotganlardan (1) oldin chiziladi.
"""
from __future__ import annotations

import hashlib
import itertools
import json
import os
import queue
import secrets
import shutil
import sys
import threading
import time
from concurrent.futures import Future, ProcessPoolExecutor
from concurrent.futures import TimeoutError as FutTimeout
from pathlib import Path

MB = 1024 * 1024
MAX_PAGES = 500
MAX_BYTES = 200 * MB
WIDTHS = (800, 1200, 1600)  # ruxsat etilgan kengliklar (kesh variantlari cheklangan bo'lsin); eng kattasi — 1600
DEFAULT_W = 1200
QUALITY = 72
MAX_PIXELS = 12_000_000  # juda uzun sahifa (chizma, lenta) — balandligi shu chegaraga qadar kichraytiriladi
WORKERS = max(1, int(os.environ.get("SITE_DOCPAGES_WORKERS", "2")))
WARM_PAGES = 60  # meta so'ralganda fonda oldindan chiziladigan sahifalar (qolgani — so'ralganda)
RENDER_TIMEOUT = 60  # bitta sahifa — ko'pi bilan shuncha soniya (osilib qolgan ishchi o'ldiriladi)
WAIT = 90  # so'rov rasmni shuncha kutadi
CACHE_MAX = int(os.environ.get("SITE_DOCPAGES_CACHE_MB", "3072")) * MB  # kesh hajmi chegarasi (eski hujjatlar o'chiriladi)
CACHE_DAYS = 30
SWEEP_EVERY = 6 * 3600


class DocError(Exception):
    """not_found | not_pdf | too_large | too_many_pages | encrypted | broken | render_failed | unavailable"""

    def __init__(self, code: str, status: int = 400):
        super().__init__(code)
        self.code = code
        self.status = status


def available() -> bool:
    import importlib.util  # noqa: PLC0415

    return importlib.util.find_spec("pypdfium2") is not None


def base_dir() -> Path:
    return Path(os.environ.get("SITE_DATA_DIR", "./var")).resolve() / "cache" / "docpages"


def _atomic_write(p: Path, data: bytes) -> None:
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_name(f".{p.name}.{os.getpid()}.{threading.get_ident()}.tmp")
    tmp.write_bytes(data)
    os.replace(tmp, p)


_salt: bytes | None = None


def _get_salt() -> bytes:
    global _salt
    if _salt is None:
        f = base_dir() / ".salt"
        try:
            _salt = bytes.fromhex(f.read_text().strip())
        except (OSError, ValueError):
            _atomic_write(f, secrets.token_hex(32).encode())
            _salt = bytes.fromhex(f.read_text().strip())
    return _salt


def doc_key(path: Path) -> str:
    s = path.stat()
    return hashlib.sha256(_get_salt() + f"{path.resolve()}|{s.st_size}|{s.st_mtime_ns}".encode()).hexdigest()[:32]


def is_key(key: str) -> bool:
    return len(key) == 32 and all(c in "0123456789abcdef" for c in key)


def check_pdf(path: Path) -> None:
    try:
        size = path.stat().st_size
        with path.open("rb") as f:
            head = f.read(1024)
    except OSError as e:
        raise DocError("not_found", 404) from e
    if b"%PDF-" not in head:
        raise DocError("not_pdf")
    if size > MAX_BYTES:
        raise DocError("too_large", 413)


# ------------------------------------------------------------------ ishchi jarayonda bajariladigan funksiyalar (faqat oddiy argumentlar)
def _open(path: str):
    import pypdfium2 as pdfium  # noqa: PLC0415

    try:
        return pdfium.PdfDocument(path)
    except pdfium.PdfiumError as e:
        msg = str(e).lower()
        raise ValueError("encrypted" if "password" in msg or "security" in msg else "broken") from None


def _w_info(path: str) -> list[list[float]]:
    doc = _open(path)
    try:
        n = len(doc)
        if n < 1:
            raise ValueError("broken")
        if n > MAX_PAGES:
            raise ValueError("too_many_pages")
        sizes = []
        for i in range(n):
            w, h = doc.get_page_size(i)
            sizes.append([round(w, 1), round(h, 1)] if w > 0 and h > 0 else [612.0, 792.0])
        return sizes
    finally:
        doc.close()


def _w_render(path: str, index: int, width: int, out: str) -> int:
    import io  # noqa: PLC0415

    doc = _open(path)
    try:
        page = doc[index]
        try:
            pw, ph = page.get_size()
            scale = (width - 0.5) / pw if pw > 0 else 1.0  # pdfium o'lchamni yuqoriga yaxlitlaydi (800 → 801 bo'lmasin)
            if pw * ph * scale * scale > MAX_PIXELS:
                scale = (MAX_PIXELS / (pw * ph)) ** 0.5
            img = page.render(scale=scale, may_draw_forms=True).to_pil()
        finally:
            page.close()
    finally:
        doc.close()
    if img.mode not in ("RGB", "L"):
        img = img.convert("RGB")
    buf = io.BytesIO()
    img.save(buf, "WEBP", quality=QUALITY, method=4)
    data = buf.getvalue()
    p = Path(out)
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_name(f".{p.name}.{os.getpid()}.tmp")
    tmp.write_bytes(data)
    os.replace(tmp, p)
    return len(data)


# ------------------------------------------------------------------ jarayonlar puli va navbat
_lock = threading.Lock()
_pool: ProcessPoolExecutor | None = None
_q: queue.PriorityQueue = queue.PriorityQueue()
_seq = itertools.count()
_jobs: dict[tuple, dict] = {}  # (key, w, n) → {"fut": Future, "started": bool}
_warmed: set[tuple] = set()
_threads: list[threading.Thread] = []
_meta_mem: dict[str, dict] = {}
_last_sweep = 0.0


def _get_pool() -> ProcessPoolExecutor:
    global _pool
    with _lock:
        if _pool is None:
            import multiprocessing as mp  # noqa: PLC0415

            kw = {"max_tasks_per_child": 300} if sys.version_info >= (3, 11) else {}
            _pool = ProcessPoolExecutor(max_workers=WORKERS, mp_context=mp.get_context("spawn"), **kw)
        return _pool


def _reset_pool(pool: ProcessPoolExecutor, kill: bool = False) -> None:
    """Yiqilgan yoki osilib qolgan pul — o'rniga yangisi (keyingi so'rovda) yaratiladi."""
    global _pool
    with _lock:
        if _pool is pool:
            _pool = None
    if kill:
        for p in list(getattr(pool, "_processes", {}).values() or []):
            try:
                p.kill()
            except Exception:  # noqa: BLE001
                pass
    try:
        pool.shutdown(wait=False, cancel_futures=True)
    except Exception:  # noqa: BLE001
        pass


def _call(fn, *args, timeout: float = RENDER_TIMEOUT):
    pool = _get_pool()
    try:
        return pool.submit(fn, *args).result(timeout=timeout)
    except FutTimeout:
        _reset_pool(pool, kill=True)
        raise DocError("render_failed", 503) from None
    except ValueError as e:  # ishchi bergan aniq xato (encrypted, broken, ...)
        raise DocError(str(e) or "broken", 422) from None
    except DocError:
        raise
    except Exception as e:  # BrokenProcessPool va boshqalar
        if type(e).__name__ == "BrokenProcessPool":
            _reset_pool(pool)
        raise DocError("render_failed", 503) from None


def _dispatch() -> None:
    while True:
        _prio, _n, jk = _q.get()
        with _lock:
            job = _jobs.get(jk)
            if not job or job["started"]:
                continue
            job["started"] = True
        key, w, n = jk
        fut: Future = job["fut"]
        try:
            out = page_path(key, w, n)
            if not out.exists():
                src = source_of(key)
                if not src:
                    raise DocError("not_found", 404)
                _call(_w_render, str(src), n - 1, w, str(out))
            fut.set_result(out)
        except Exception as e:  # noqa: BLE001
            fut.set_exception(e if isinstance(e, DocError) else DocError("render_failed", 503))
        finally:
            with _lock:
                _jobs.pop(jk, None)


def _ensure_threads() -> None:
    with _lock:
        _threads[:] = [t for t in _threads if t.is_alive()]
        for i in range(WORKERS - len(_threads)):
            t = threading.Thread(target=_dispatch, name=f"docpages-{i}", daemon=True)
            t.start()
            _threads.append(t)


def _enqueue(key: str, w: int, n: int, prio: int) -> Future:
    _ensure_threads()
    jk = (key, w, n)
    with _lock:
        job = _jobs.get(jk)
        if job is None:
            job = _jobs[jk] = {"fut": Future(), "started": False}
        elif job["started"] or prio > 0:
            return job["fut"]
    # fonda navbatda turgan sahifani foydalanuvchi so'rasa — oldinroq (0) navbatga ham qo'yiladi; qaysi biri birinchi chiqsa, o'sha chizadi
    _q.put((prio, next(_seq), jk))
    return job["fut"]


# ------------------------------------------------------------------ hujjat (manba) va meta
def page_path(key: str, w: int, n: int) -> Path:
    return base_dir() / key / str(w) / f"{n}.webp"


def source_of(key: str) -> Path | None:
    """Kalit → diskdagi PDF (fayl o'zgargan bo'lsa — None: eski kalit endi yaroqsiz)."""
    if not is_key(key):
        return None
    m = _meta_mem.get(key)
    if m is None:
        try:
            m = json.loads((base_dir() / key / "src.json").read_text("utf-8"))
        except (OSError, ValueError):
            return None
    p = Path(m.get("path", ""))
    try:
        if not p.is_file() or doc_key(p) != key:
            return None
    except OSError:
        return None
    _meta_mem[key] = m
    return p


def meta(path: Path, private: bool = False, w: int = DEFAULT_W, first: int = 2) -> dict:
    """Hujjat haqida: {pages, sizes, version}; birinchi sahifalar javobdan oldin chiziladi (ko'rinish darhol chiqsin), qolganlari — fonda."""
    if not available():
        raise DocError("unavailable", 503)
    check_pdf(path)
    key = doc_key(path)
    d = base_dir() / key
    mf = d / "meta.json"
    info = None
    try:
        info = json.loads(mf.read_text("utf-8"))
    except (OSError, ValueError):
        pass
    if not info:
        sizes = _call(_w_info, str(path), timeout=30)
        info = {"pages": len(sizes), "sizes": sizes}
        _atomic_write(mf, json.dumps(info).encode())
    src = {"path": str(path.resolve()), "private": private}
    sf = d / "src.json"
    try:
        old = json.loads(sf.read_text("utf-8"))
    except (OSError, ValueError):
        old = None
    if old != src:
        _atomic_write(sf, json.dumps(src).encode())
    else:
        try:
            os.utime(sf)  # oxirgi foydalanish vaqti (eski keshni tozalash uchun)
        except OSError:
            pass
    _meta_mem[key] = src
    w = w if w in WIDTHS else DEFAULT_W
    n = info["pages"]
    futs = [_enqueue(key, w, i, 0) for i in range(1, min(first, n) + 1) if not page_path(key, w, i).exists()]
    if (key, w) not in _warmed:
        _warmed.add((key, w))
        for i in range(first + 1, min(n, WARM_PAGES) + 1):
            if not page_path(key, w, i).exists():
                _enqueue(key, w, i, 1)
    end = time.monotonic() + 10
    for f in futs:
        try:
            f.result(timeout=max(0.1, end - time.monotonic()))
        except Exception:  # noqa: BLE001  — birinchi sahifa chizilmasa ham meta qaytariladi (rasm so'rovi xatoni ko'rsatadi)
            break
    _maybe_sweep()
    return {"pages": n, "sizes": info["sizes"], "version": key, "widths": list(WIDTHS)}


def page_image(key: str, w: int, n: int) -> tuple[Path, bool]:
    """Sahifa rasmi (keshdan yoki shu zahoti chizib): (fayl, yopiqmi)."""
    if not is_key(key) or w not in WIDTHS or n < 1:
        raise DocError("not_found", 404)
    src = source_of(key)
    if not src:
        raise DocError("not_found", 404)
    private = bool(_meta_mem.get(key, {}).get("private"))
    try:
        pages = json.loads((base_dir() / key / "meta.json").read_text("utf-8"))["pages"]
    except (OSError, ValueError, KeyError):
        raise DocError("not_found", 404) from None
    if n > pages:
        raise DocError("not_found", 404)
    out = page_path(key, w, n)
    if not out.exists():
        try:
            _enqueue(key, w, n, 0).result(timeout=WAIT)
        except FutTimeout:
            raise DocError("render_failed", 503) from None
    return out, private


# ------------------------------------------------------------------ keshni tozalash
def _maybe_sweep() -> None:
    global _last_sweep
    now = time.time()
    if now - _last_sweep < SWEEP_EVERY:
        return
    _last_sweep = now
    threading.Thread(target=sweep, daemon=True).start()


def sweep(max_bytes: int = CACHE_MAX, days: int = CACHE_DAYS) -> None:
    """Uzoq ochilmagan hujjatlar keshi va hajm chegarasidan oshgan eng eski hujjatlar o'chiriladi."""
    base = base_dir()
    if not base.is_dir():
        return
    items = []
    for d in base.iterdir():
        if not d.is_dir() or not (is_key(d.name) or d.name == "src"):
            continue
        if d.name == "src":  # S3 dan olingan nusxalar
            for f in d.iterdir():
                try:
                    if time.time() - f.stat().st_mtime > days * 86400:
                        f.unlink()
                except OSError:
                    pass
            continue
        try:
            used = (d / "src.json").stat().st_mtime
        except OSError:
            used = 0
        size = sum(f.stat().st_size for f in d.rglob("*") if f.is_file())
        items.append((used, size, d))
    items.sort()
    total = sum(x[1] for x in items)
    for used, size, d in items:
        if time.time() - used > days * 86400 or total > max_bytes:
            shutil.rmtree(d, ignore_errors=True)
            _meta_mem.pop(d.name, None)
            total -= size


def reset() -> None:
    """Testlar uchun: xotiradagi holat va pul."""
    global _salt, _last_sweep
    with _lock:
        pool = _pool
    if pool:
        _reset_pool(pool)
    _meta_mem.clear()
    _warmed.clear()
    _salt = None
    _last_sweep = 0.0
