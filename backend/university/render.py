"""Headless Chromium orqali maqola PDF'i va ijtimoiy tarmoq kartasi (og:image) yaratish.

Sahifa saytning o'zi ichidagi maxsus «/print/...» yo'lida chiziladi: grafiklar (ECharts, SVG),
formulalar (KaTeX) va shriftlar xuddi saytdagidek chiqadi. Natija diskda keshlanadi.
"""
from __future__ import annotations

import os
import threading
from pathlib import Path
from typing import Callable


class RenderError(RuntimeError):
    pass


class Renderer:
    def __init__(self, cache_dir: Path):
        self.cache_dir = cache_dir
        (cache_dir / "pdf").mkdir(parents=True, exist_ok=True)
        (cache_dir / "og").mkdir(parents=True, exist_ok=True)
        # bir vaqtda ko'pi bilan N ta brauzer (xotira cheklangan serverlar uchun)
        self._slots = threading.Semaphore(max(1, int(os.environ.get("SITE_RENDER_CONCURRENCY", "2") or 2)))
        self._key_locks: dict[str, threading.Lock] = {}
        self._guard = threading.Lock()

    @staticmethod
    def available() -> bool:
        try:
            import playwright.sync_api  # noqa: F401
        except ImportError:
            return False
        return True

    # ------------------------------------------------------------------ kesh
    def cached(self, folder: str, prefix: str, key: str, ext: str, make: Callable[[], bytes]) -> bytes:
        """`prefix-key.ext` keshda bo'lsa — qaytaradi; bo'lmasa yaratadi va shu prefiksli eski fayllarni o'chiradi."""
        path = self.cache_dir / folder / f"{prefix}-{key}.{ext}"
        if path.exists():
            return path.read_bytes()
        with self._guard:
            lock = self._key_locks.setdefault(str(path), threading.Lock())
        try:
            with lock:  # bir xil hujjat parallel ravishda ikki marta chizilmasin
                if path.exists():
                    return path.read_bytes()
                data = make()
                tmp = path.with_suffix(f".{threading.get_ident()}.tmp")
                tmp.write_bytes(data)
                tmp.replace(path)
                for old in path.parent.glob(f"{prefix}-*.{ext}"):
                    if old != path:
                        old.unlink(missing_ok=True)
                return data
        finally:
            with self._guard:
                self._key_locks.pop(str(path), None)

    def is_cached(self, folder: str, prefix: str, key: str, ext: str) -> bool:
        return (self.cache_dir / folder / f"{prefix}-{key}.{ext}").exists()

    def clear(self) -> None:
        for sub in ("pdf", "og"):
            for f in (self.cache_dir / sub).glob("*"):
                f.unlink(missing_ok=True)

    # ------------------------------------------------------------------ chizish
    def _with_page(self, url: str, viewport: dict, job: Callable) -> bytes:
        try:
            from playwright.sync_api import Error as PwError
            from playwright.sync_api import sync_playwright
        except ImportError as e:
            raise RenderError("playwright_not_installed") from e
        with self._slots:
            try:
                with sync_playwright() as p:
                    browser = p.chromium.launch(
                        executable_path=os.environ.get("SITE_CHROMIUM_PATH") or None,
                        args=["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--font-render-hinting=none"],
                    )
                    try:
                        page = browser.new_page(viewport=viewport, device_scale_factor=viewport.get("scale", 1))
                        page.goto(url, wait_until="load", timeout=30_000)
                        # sahifa o'zi tayyorligini bildiradi: shriftlar, rasmlar, grafiklar va formulalar chizilgan
                        page.wait_for_function("window.__PRINT_READY === true || window.__PRINT_ERROR", timeout=30_000)
                        err = page.evaluate("window.__PRINT_ERROR || ''")
                        if err:
                            raise RenderError(str(err)[:200])
                        return job(page)
                    finally:
                        browser.close()
            except PwError as e:
                raise RenderError(f"chromium: {str(e).splitlines()[0][:200]}") from e

    def pdf(self, url: str) -> bytes:
        # kenglik = A4 (210 mm, 96 dpi) — grafiklar bosma sahifadagi kenglikda chiziladi
        return self._with_page(url, {"width": 794, "height": 1123}, lambda pg: pg.pdf(prefer_css_page_size=True, print_background=True))

    def png(self, url: str, width: int = 1200, height: int = 630) -> bytes:
        return self._with_page(url, {"width": width, "height": height}, lambda pg: pg.screenshot(type="png", clip={"x": 0, "y": 0, "width": width, "height": height}))
