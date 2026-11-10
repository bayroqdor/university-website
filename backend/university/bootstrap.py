"""Server ishga tushganda kerakli narsalarni o'zi tayyorlaydi — qo'lda hech narsa qilish shart emas.

  * Python kutubxonalari (requirements.txt): yetishmasa — `pip install -r requirements.txt` (masalan, yangilanishdan keyin
    Docker obrazi qayta yig'ilmagan bo'lsa: yuzni aniqlash uchun OpenCV);
  * yuzni aniqlash modeli (YuNet ONNX): fayl yo'q bo'lsa — yuklab olinadi;
  * PDF va og:image uchun Chromium (Playwright): o'rnatilmagan bo'lsa — `playwright install chromium`.

Hammasi fon oqimida bajariladi (sayt darhol ishlay boshlaydi); holat — `/api/admin/system` va jurnal.
O'chirish: SITE_AUTO_SETUP=0.
"""
from __future__ import annotations

import importlib
import importlib.util
import os
import subprocess
import sys
import threading
import time
import urllib.request
from pathlib import Path

REQ = Path(__file__).resolve().parents[1] / "requirements.txt"
# paket → import nomi
MODULES = {"fastapi": "fastapi", "uvicorn": "uvicorn", "python-multipart": "multipart", "jinja2": "jinja2", "pillow": "PIL", "nh3": "nh3", "openpyxl": "openpyxl",
           "opencv-python-headless": "cv2", "playwright": "playwright", "segno": "segno", "pypdf": "pypdf", "tzdata": "tzdata", "httpx": "httpx",
           "psycopg": "psycopg", "psycopg-pool": "psycopg_pool", "libarchive-c": "libarchive", "pypdfium2": "pypdfium2"}
FACE_URL = "https://media.githubusercontent.com/media/opencv/opencv_zoo/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx"

STATUS: dict = {"state": "idle", "steps": [], "started": None, "finished": None}


def _log(msg: str) -> None:
    STATUS["steps"].append({"t": time.strftime("%H:%M:%S"), "msg": msg})
    print(f"University setup: {msg}", file=sys.stderr, flush=True)


def missing_modules() -> list[str]:
    return [pkg for pkg, mod in MODULES.items() if importlib.util.find_spec(mod) is None]


def _pip(args: list[str]) -> bool:
    try:
        r = subprocess.run([sys.executable, "-m", "pip", "install", "--disable-pip-version-check", "-q", *args], capture_output=True, text=True, timeout=900)
    except Exception as e:  # noqa: BLE001
        _log(f"pip ishlamadi: {e}")
        return False
    if r.returncode != 0:
        _log("pip xatosi: " + (r.stderr or r.stdout).strip().splitlines()[-1][:300] if (r.stderr or r.stdout).strip() else "pip xatosi")
        return False
    return True


def ensure_packages() -> None:
    miss = missing_modules()
    if not miss:
        return
    _log(f"yetishmayotgan kutubxonalar: {', '.join(miss)} — o'rnatilmoqda")
    ok = _pip(["-r", str(REQ)]) if REQ.exists() else _pip(miss)
    importlib.invalidate_caches()
    still = missing_modules()
    _log("kutubxonalar o'rnatildi" if ok and not still else f"o'rnatilmadi: {', '.join(still)}")


def ensure_face_model() -> None:
    from . import faces  # noqa: PLC0415

    if faces.MODEL.exists() and faces.MODEL.stat().st_size > 100_000:
        return
    _log("yuzni aniqlash modeli yuklab olinmoqda")
    try:
        faces.MODEL.parent.mkdir(parents=True, exist_ok=True)
        with urllib.request.urlopen(FACE_URL, timeout=60) as r:  # noqa: S310
            data = r.read(5_000_000)
        if len(data) < 100_000:
            raise ValueError("fayl juda kichik")
        faces.MODEL.write_bytes(data)
        _log("yuzni aniqlash modeli tayyor")
    except Exception as e:  # noqa: BLE001
        _log(f"model yuklanmadi: {e}")


def chromium_ready() -> bool:
    if os.environ.get("SITE_CHROMIUM_PATH"):
        return Path(os.environ["SITE_CHROMIUM_PATH"]).exists()
    # Docker obrazida «headless shell» o'rnatiladi (playwright install --only-shell) — Playwright headless rejimda aynan uni ishlatadi
    roots = [Path(os.environ["PLAYWRIGHT_BROWSERS_PATH"])] if os.environ.get("PLAYWRIGHT_BROWSERS_PATH") else []
    roots.append(Path.home() / ".cache" / "ms-playwright")
    for r in roots:
        if any((d / "INSTALLATION_COMPLETE").exists() for d in r.glob("chromium*")):
            return True
    try:
        from playwright.sync_api import sync_playwright  # noqa: PLC0415

        with sync_playwright() as p:
            return Path(p.chromium.executable_path).exists()
    except Exception:  # noqa: BLE001
        return False


def ensure_chromium() -> None:
    if importlib.util.find_spec("playwright") is None or chromium_ready():
        return
    _log("Chromium (PDF va og:image uchun) o'rnatilmoqda")
    try:
        r = subprocess.run([sys.executable, "-m", "playwright", "install", "chromium"], capture_output=True, text=True, timeout=1200)
        _log("Chromium tayyor" if r.returncode == 0 else "Chromium o'rnatilmadi: " + (r.stderr or r.stdout).strip()[-300:])
    except Exception as e:  # noqa: BLE001
        _log(f"Chromium o'rnatilmadi: {e}")


def run() -> None:
    STATUS.update(state="running", started=time.strftime("%Y-%m-%d %H:%M:%S"), steps=[])
    for fn in (ensure_packages, ensure_face_model, ensure_chromium):
        try:
            fn()
        except Exception as e:  # noqa: BLE001
            _log(f"{fn.__name__}: {e}")
    try:
        from . import faces  # noqa: PLC0415

        faces._det = None  # yangi o'rnatilgan OpenCV bilan qayta yuklansin  # noqa: SLF001
    except Exception:  # noqa: BLE001
        pass
    STATUS.update(state="done", finished=time.strftime("%Y-%m-%d %H:%M:%S"))


def start() -> None:
    if os.environ.get("SITE_AUTO_SETUP", "1") == "0" or STATUS["state"] == "running":
        return
    threading.Thread(target=run, daemon=True).start()
