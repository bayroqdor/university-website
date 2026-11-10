"""Google Drive'dagi arxiv (RAR/ZIP/7z/tar) ichidagi hujjatlarni saytning o'zida ochish.

Google'ning ko'rish oynasi arxiv ichidagi papkalarni ko'rsatadi, lekin faylni bosish faqat nomini nusxalaydi. Shuning uchun arxivni
o'zimiz yuklab olamiz (API kalitisiz, `drive.usercontent.google.com/download`), libarchive bilan ochamiz va
$SITE_DATA_DIR/cache/gdrive-arch/<ID>/ ga yozamiz: `index.json` (ro'yxat) + `files/<xesh>` (fayllar).
Diskdagi fayl nomi — arxiv ichidagi yo'lning xeshi: arxivdagi nom («../», mutlaq yo'l, g'alati belgilar) diskka umuman tegmaydi;
fayl faqat index'dagi yo'l orqali beriladi.

Ish fon oqimida (bitta ID — bitta ish, bir vaqtda ko'pi bilan MAX_JOBS ta); frontend holatni so'rab turadi (yuklanish foizi).
Nusxa REFRESH muddatdan eskirsa — eski nusxa berilaveradi, fonda yangisi tayyorlanadi va almashtiriladi.
"""
from __future__ import annotations

import hashlib
import html
import json
import mimetypes
import os
import re
import shutil
import sys
import threading
import time
import uuid
from collections import deque
from pathlib import Path

import httpx

MB = 1024 * 1024
MAX_DOWNLOAD = int(os.environ.get("SITE_GDRIVE_ARCH_MAX_MB", "600")) * MB  # arxivning o'zi
MAX_TOTAL = int(os.environ.get("SITE_GDRIVE_ARCH_MAX_TOTAL_MB", "2048")) * MB  # ochilgan fayllar jami
MAX_FILES = 5000  # arxivdagi yozuvlar soni
MIN_FREE = int(os.environ.get("SITE_GDRIVE_ARCH_MIN_FREE_MB", "512")) * MB  # yuklab/ochgandan keyin diskda kamida shuncha joy qolsin
REFRESH = 7 * 86400  # shundan eski nusxa fonda yangilanadi
ERR_TTL = 600  # xato — 10 daqiqa eslab qolinadi (Google'ni qayta-qayta yuklamaslik uchun)
MAX_JOBS = 2  # bir vaqtda yuklanadigan arxivlar
MAX_STARTS = 30  # soatiga yangi ishlar (barcha foydalanuvchilar bo'yicha)
DL_DEADLINE = 1800  # bitta yuklash — ko'pi bilan 30 daqiqa
DL_TIMEOUT = httpx.Timeout(60.0, connect=10.0)
LINKED_TTL = 60
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"

ID_RE = re.compile(r"[\w-]{10,120}")
ARCH_RE = re.compile(r"\.(zip|rar|7z|tar|tgz|tbz2?|txz|tar\.(gz|bz2|xz))$", re.I)
# saytdagi Drive fayl havolalari: /file/d/ID, open?id=ID, uc?id=ID (Workspace domeni /a/<domen>/ bilan ham)
LINK_RE = re.compile(r"(?:drive|docs)\.google\.com/(?:a/[^/\"'\s]+/)?(?:file/(?:u/\d+/)?d/|(?:open|uc)\?(?:[^\"'\s<>]*?&(?:amp;)?)?id=)([\w-]{10,120})")
JUNK = {"__MACOSX", ".DS_Store", "Thumbs.db", "desktop.ini"}

# brauzerda shu yerning o'zida ochiladigan turlar; qolganlari — faqat yuklab olish (HTML/SVG/JS saytning domenida ishga tushmasin)
INLINE = {"application/pdf", "image/png", "image/jpeg", "image/gif", "image/webp", "image/bmp", "text/plain", "video/mp4", "video/webm", "audio/mpeg", "audio/ogg", "audio/wav"}
UNSAFE = re.compile(r"html|xml|svg|javascript|ecmascript|x-sh|x-httpd", re.I)
EXTRA_TYPES = {".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
               ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
               ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation", ".webp": "image/webp"}


class ArchiveFail(Exception):
    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


_lock = threading.Lock()
_slots = threading.Semaphore(MAX_JOBS)
_jobs: dict[str, dict] = {}  # ID → {"phase", "done", "total", "x_done", "x_total"}
_errors: dict[str, tuple[float, str]] = {}
_starts: deque[float] = deque()
_index: dict[str, tuple[int, dict, dict]] = {}  # ID → (index.json mtime, index, {yo'l: diskdagi nom})
_linked: tuple[float, set[str]] = (0.0, set())


def log(msg: str) -> None:
    print(f"gdrive-arch: {msg}", file=sys.stderr, flush=True)


def base_dir() -> Path:
    return Path(os.environ.get("SITE_DATA_DIR", "./var")).resolve() / "cache" / "gdrive-arch"


def is_archive_name(name: str) -> bool:
    return bool(ARCH_RE.search((name or "").strip()))


def mime_of(name: str) -> str:
    ext = os.path.splitext(name)[1].lower()
    return EXTRA_TYPES.get(ext) or mimetypes.guess_type(name)[0] or "application/octet-stream"


# ------------------------------------------------------------------ arxiv ichidagi yo'lni tozalash
def clean_path(raw) -> str | None:
    """Arxivdagi nom → «papka/ichki papka/fayl.pdf»; xavfli yoki keraksiz yozuv — None (o'tkazib yuboriladi)."""
    if raw is None:
        return None
    if isinstance(raw, bytes):
        try:
            raw = raw.decode("utf-8")
        except UnicodeDecodeError:
            raw = raw.decode("cp866", "replace")  # Windows'da (rus tilidagi tizim) yaratilgan ZIP'lar
    s = str(raw).replace("\\", "/")
    if s.startswith("/") or re.match(r"[A-Za-z]:", s):
        return None  # mutlaq yo'l
    parts = []
    for p in s.split("/"):
        if p in ("", "."):
            continue
        if p == ".." or re.search(r"[\x00-\x1f\x7f]", p) or len(p.encode("utf-8", "replace")) > 255:
            return None
        parts.append(p)
    if not parts or len(parts) > 32 or parts[0] in JUNK or parts[-1] in JUNK or parts[-1].startswith("._"):
        return None
    return "/".join(parts)


def _disk_name(path: str) -> str:
    return hashlib.sha1(path.encode("utf-8")).hexdigest()[:24]


# ------------------------------------------------------------------ yuklab olish
def _google_host(host: str) -> bool:
    host = (host or "").lower()
    return host in ("google.com", "googleusercontent.com") or host.endswith((".google.com", ".googleusercontent.com"))


def _disposition_name(cd: str) -> str:
    m = re.search(r"filename\*\s*=\s*(?:UTF-8|utf-8)''([^;]+)", cd)
    if m:
        from urllib.parse import unquote  # noqa: PLC0415

        return unquote(m[1].strip().strip('"'))
    m = re.search(r'filename\s*=\s*"([^"]*)"', cd) or re.search(r"filename\s*=\s*([^;]+)", cd)
    return m[1].strip() if m else ""


def _confirm_form(page: str) -> tuple[str, dict] | None:
    """Google'ning «viruslar tekshirilmadi, baribir yuklash» sahifasi: shaklning manzili va yashirin maydonlari."""
    m = re.search(r'<form[^>]*id="download-form"[^>]*action="([^"]+)"(.*?)</form>', page, re.S)
    if not m:
        return None
    params = {html.unescape(n): html.unescape(v) for n, v in re.findall(r'<input[^>]*type="hidden"[^>]*name="([^"]+)"[^>]*value="([^"]*)"', m[2])}
    return html.unescape(m[1]), params


def download(fid: str, dest: Path, job: dict) -> str:
    """Ochiq Drive faylini `dest` ga yozadi; Google bergan fayl nomini qaytaradi. Faqat Google manzillariga, hajm cheklangan."""
    url, params = "https://drive.usercontent.google.com/download", {"id": fid, "export": "download", "confirm": "t"}
    deadline = time.monotonic() + DL_DEADLINE
    try:
        with httpx.Client(timeout=DL_TIMEOUT, follow_redirects=False, headers={"User-Agent": UA}) as c:
            for _ in range(6):
                with c.stream("GET", url, params=params) as r:
                    if r.status_code in (301, 302, 303, 307, 308):
                        nxt = r.url.join(r.headers.get("location", ""))
                        if nxt.scheme != "https" or not _google_host(nxt.host) or "accounts.google" in nxt.host:
                            raise ArchiveFail("private")
                        url, params = str(nxt), None
                        continue
                    if r.status_code in (401, 403):
                        raise ArchiveFail("private")
                    if r.status_code == 404:
                        raise ArchiveFail("not_found")
                    if r.status_code != 200:
                        raise ArchiveFail("unreachable")
                    if r.headers.get("content-type", "").startswith("text/html"):
                        body = b""
                        for chunk in r.iter_bytes():
                            body += chunk
                            if len(body) > 2 * MB:
                                break
                        form = _confirm_form(body.decode("utf-8", "replace"))
                        if form and httpx.URL(form[0]).scheme == "https" and _google_host(httpx.URL(form[0]).host):
                            url, params = form
                            continue
                        raise ArchiveFail("unavailable")  # yopiq fayl, kunlik limit tugagan va h.k.
                    total = int(r.headers.get("content-length") or 0)
                    if total > MAX_DOWNLOAD:
                        raise ArchiveFail("too_large")
                    if shutil.disk_usage(dest.parent).free - 2 * total < MIN_FREE:  # arxiv + ochilgan fayllar uchun joy
                        raise ArchiveFail("no_space")
                    job["total"] = total
                    done = 0
                    with open(dest, "wb") as f:
                        for chunk in r.iter_bytes(1 << 16):
                            done += len(chunk)
                            if done > MAX_DOWNLOAD:
                                raise ArchiveFail("too_large")
                            if time.monotonic() > deadline:
                                raise ArchiveFail("timeout")
                            f.write(chunk)
                            job["done"] = done
                    if total and done != total:
                        raise ArchiveFail("unreachable")  # ulanish uzildi
                    return _disposition_name(r.headers.get("content-disposition", ""))
    except httpx.HTTPError as e:
        raise ArchiveFail("unreachable") from e
    raise ArchiveFail("unreachable")


# ------------------------------------------------------------------ ochish (libarchive: RAR4/RAR5, ZIP, 7z, tar...)
def extract(arc: Path, out: Path, job: dict) -> list[dict]:
    """Ikki o'tish: avval sarlavhalar (cheklovlar tekshiriladi), so'ng fayllar `out/<xesh>` ga yoziladi. Yozuvlar ro'yxatini qaytaradi."""
    try:
        import libarchive  # noqa: PLC0415  (tizimdagi libarchive.so.13 kerak)
        from libarchive.exception import ArchiveError  # noqa: PLC0415
    except (ImportError, OSError) as ex:
        raise ArchiveFail("no_libarchive") from ex

    files: dict[str, int] = {}
    dirs: set[str] = set()
    try:
        n = 0
        with libarchive.file_reader(str(arc)) as a:
            for e in a:
                n += 1
                if n > MAX_FILES:
                    raise ArchiveFail("too_many")
                path = clean_path(e.pathname)
                if path is None or e.issym or e.islnk or e.isdev:
                    continue
                if e.isdir:
                    dirs.add(path)
                elif e.isreg and path not in files and path not in dirs:
                    files[path] = max(int(e.size or 0), 0)
        total = sum(files.values())
        if total > MAX_TOTAL:
            raise ArchiveFail("too_large")
        out.mkdir(parents=True, exist_ok=True)
        if shutil.disk_usage(out).free - total < MIN_FREE:
            raise ArchiveFail("no_space")
        job.update(phase="extract", x_total=total or 1, x_done=0)
        written = 0
        sizes: dict[str, int] = {}
        with libarchive.file_reader(str(arc)) as a:
            for e in a:
                path = clean_path(e.pathname)
                if path is None or path not in files or path in sizes or not e.isreg or e.issym or e.islnk:
                    continue
                size = 0
                with open(out / _disk_name(path), "wb") as f:
                    for block in e.get_blocks(1 << 16):
                        size += len(block)
                        written += len(block)
                        if written > MAX_TOTAL:  # sarlavhada kichik deb yozilgan bo'lsa ham
                            raise ArchiveFail("too_large")
                        f.write(block)
                        job["x_done"] = written
                sizes[path] = size
    except ArchiveError as ex:
        raise ArchiveFail("bad_archive") from ex
    for path in sizes:  # fayllarning ota papkalari ham ro'yxatda bo'lsin
        parts = path.split("/")[:-1]
        for i in range(1, len(parts) + 1):
            dirs.add("/".join(parts[:i]))
    dirs -= set(sizes)
    entries = [{"path": d, "name": d.rsplit("/", 1)[-1], "kind": "folder"} for d in dirs]
    entries += [{"path": p, "name": p.rsplit("/", 1)[-1], "kind": "file", "size": s, "mime": mime_of(p), "f": _disk_name(p)} for p, s in sizes.items()]
    entries.sort(key=lambda x: (x["path"].rsplit("/", 1)[0] if "/" in x["path"] else "", x["kind"] != "folder", x["name"].casefold()))
    return entries


# ------------------------------------------------------------------ tayyor nusxa
def load_index(fid: str) -> dict | None:
    p = base_dir() / fid / "index.json"
    try:
        mt = p.stat().st_mtime_ns
    except OSError:
        _index.pop(fid, None)
        return None
    hit = _index.get(fid)
    if hit and hit[0] == mt:
        return hit[1]
    try:
        idx = json.loads(p.read_text("utf-8"))
    except (OSError, ValueError):
        return None
    _index[fid] = (mt, idx, {e["path"]: e["f"] for e in idx.get("entries", []) if e.get("kind") == "file"})
    return idx


def entry_file(fid: str, path: str) -> tuple[Path, str] | None:
    """Arxiv ichidagi fayl: (diskdagi yo'l, nomi). Faqat index'da bor yo'llar — boshqa hech narsa."""
    if not ID_RE.fullmatch(fid) or load_index(fid) is None:
        return None
    stored = _index[fid][2].get(path)
    if not stored or not re.fullmatch(r"[0-9a-f]{24}", stored):
        return None
    disk = base_dir() / fid / "files" / stored
    return (disk, path.rsplit("/", 1)[-1]) if disk.is_file() else None


def public(idx: dict) -> dict:
    return {"status": "ready", "name": idx.get("name", ""), "size": idx.get("size", 0), "fetched": idx.get("fetched", 0),
            "entries": [{k: v for k, v in e.items() if k != "f"} for e in idx.get("entries", [])]}


def _progress(job: dict) -> float:
    dl = job["done"] / job["total"] if job.get("total") else 0.0
    if job.get("phase") == "extract":
        return round(0.9 + 0.1 * min(job.get("x_done", 0) / (job.get("x_total") or 1), 1.0), 3)
    return round(0.9 * min(dl, 1.0), 3)


def state(fid: str) -> dict | None:
    """Joriy holat: ready / preparing / error; hali hech narsa bo'lmasa — None. Eskirgan nusxa fonda yangilanadi."""
    idx = load_index(fid)
    job = _jobs.get(fid)
    err = _errors.get(fid)
    fresh_err = bool(err and time.time() - err[0] < ERR_TTL)
    if idx:
        if not job and not fresh_err and time.time() - float(idx.get("fetched") or 0) > REFRESH:
            start(fid, idx.get("name", ""), force=True)
        return public(idx)
    if job:
        return {"status": "preparing", "progress": _progress(job)}
    if fresh_err:
        return {"status": "error", "code": err[1]}
    return None


def start(fid: str, name: str = "", force: bool = False) -> bool:
    """Fon ishini boshlaydi (shu ID uchun ish bo'lmasa). Soatlik umumiy chegara: MAX_STARTS (`force` — eskirgan nusxani yangilash)."""
    if not ID_RE.fullmatch(fid):
        return False
    with _lock:
        if fid in _jobs:
            return True
        now = time.monotonic()
        while _starts and now - _starts[0] > 3600:
            _starts.popleft()
        if len(_starts) >= MAX_STARTS and not force:
            return False
        _starts.append(now)
        _jobs[fid] = {"phase": "queue", "done": 0, "total": 0}
        _errors.pop(fid, None)
    threading.Thread(target=_run, args=(fid, name), name=f"gdrive-arch-{fid[:8]}", daemon=True).start()
    return True


def _run(fid: str, name: str) -> None:
    job = _jobs[fid]
    try:
        with _slots:
            job["phase"] = "download"
            prepare(fid, name, job)
    except ArchiveFail as e:
        log(f"{fid}: {e.code}")
        _errors[fid] = (time.time(), e.code)
    except Exception as e:  # noqa: BLE001 — fon oqimi yiqilmasin
        log(f"{fid}: {e!r}")
        _errors[fid] = (time.time(), "failed")
    finally:
        _jobs.pop(fid, None)


def _sweep(base: Path) -> None:
    """To'xtab qolgan ishlardan qolgan vaqtinchalik papkalar (1 soatdan eski)."""
    for p in base.glob(".*-*"):
        try:
            if time.time() - p.stat().st_mtime > 3600 and not any(j in p.name for j in _jobs):
                shutil.rmtree(p, ignore_errors=True)
        except OSError:
            pass


def prepare(fid: str, name: str, job: dict) -> None:
    """Yuklash → ochish → index.json → tayyor papka bilan atomik almashtirish (vaqtinchalik papka nomini o'zgartirib)."""
    base = base_dir()
    base.mkdir(parents=True, exist_ok=True)
    _sweep(base)
    tmp = base / f".tmp-{fid}-{uuid.uuid4().hex[:8]}"
    tmp.mkdir()
    try:
        arc = tmp / "archive.bin"
        dl_name = download(fid, arc, job)
        size = arc.stat().st_size
        entries = extract(arc, tmp / "files", job)
        arc.unlink()
        idx = {"id": fid, "name": name or dl_name or fid, "size": size, "fetched": time.time(), "entries": entries}
        (tmp / "index.json").write_text(json.dumps(idx, ensure_ascii=False), "utf-8")
        final = base / fid
        old = base / f".old-{fid}-{uuid.uuid4().hex[:8]}"
        with _lock:
            if final.exists():
                final.rename(old)
            tmp.rename(final)
        if old.exists():
            # ochiq turgan fayllar (Linux'da) o'qilaveradi; yo'llar xeshlangani uchun yangi nusxada ham o'sha nomlar
            threading.Timer(120, shutil.rmtree, args=(old,), kwargs={"ignore_errors": True}).start()
        log(f"{fid}: tayyor — {sum(1 for e in entries if e['kind'] == 'file')} fayl")
    finally:
        if tmp.exists():
            shutil.rmtree(tmp, ignore_errors=True)


# ------------------------------------------------------------------ saytdagi havolalar (faqat shular yuklanadi) va oldindan tayyorlash
def linked_ids(force: bool = False) -> set[str]:
    """Sayt kontentida (items, kv) uchraydigan Drive fayl ID'lari — server begona arxivlarni yuklamasligi uchun."""
    global _linked
    age = time.time() - _linked[0]
    if age < (5 if force else LINKED_TTL):  # majburiy yangilash ham 5 soniyada ko'pi bilan bir marta
        return _linked[1]
    from .api.deps import svc  # noqa: PLC0415

    st = svc().st
    ids: set[str] = set()
    for sql in ("SELECT data AS t FROM items WHERE data LIKE %s", "SELECT value AS t FROM kv WHERE value LIKE %s"):
        for r in st._q(sql, ("%google.com%",)):
            ids.update(LINK_RE.findall(r["t"] or ""))
    _linked = (time.time(), ids)
    return ids


def ids_in(text: str) -> set[str]:
    return set(LINK_RE.findall(text or ""))


def warm_enabled() -> bool:
    return os.environ.get("SITE_GDRIVE_WARM", "1") != "0"


def warm(ids=None, delay: float = 0) -> None:
    """Fonda: havolalardan arxivlarini topib, birma-bir tayyorlab qo'yadi (birinchi tashrif buyuruvchi kutmasin)."""
    def run():
        time.sleep(delay)
        from .api.gdrive import DriveError, meta  # noqa: PLC0415

        try:
            todo = sorted(ids if ids is not None else linked_ids(force=True))
        except Exception as e:  # noqa: BLE001
            log(f"warm: {e!r}")
            return
        for fid in todo:
            try:
                m = meta(fid)
            except DriveError:
                continue
            if not m.get("archive"):
                continue
            idx = load_index(fid)
            if idx and time.time() - float(idx.get("fetched") or 0) < REFRESH:
                continue
            if start(fid, m.get("name", ""), force=True):
                while fid in _jobs:  # navbat bilan — tarmoq va diskni band qilib qo'ymaslik uchun
                    time.sleep(2)
            time.sleep(1)

    threading.Thread(target=run, name="gdrive-arch-warm", daemon=True).start()


def on_content_saved(data) -> None:
    """Admin sahifani saqlaganda: havolalar ro'yxati yangilanadi, yangi arxivlar fonda tayyorlanadi."""
    global _linked
    try:
        text = data if isinstance(data, str) else json.dumps(data, ensure_ascii=False)
    except (TypeError, ValueError):
        return
    new = ids_in(text)
    if not new:
        return
    _linked = (0.0, set())
    if warm_enabled():
        warm(new, delay=2)


def reset() -> None:
    """Testlar uchun: xotiradagi holat."""
    global _linked
    _jobs.clear()
    _errors.clear()
    _starts.clear()
    _index.clear()
    _linked = (0.0, set())
