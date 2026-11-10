"""ONLYOFFICE: saytdagi hujjatni ko'rish, kabinet/admin hujjatlari (yaratish, tahrirlash, yuklash), Document Server proksisi."""
from __future__ import annotations

import asyncio
import logging
import os
import re
import secrets
import time
from pathlib import Path
from urllib.parse import urlencode, urlparse

import anyio
import httpx
from fastapi import APIRouter, Body, Depends, File, HTTPException, Request, UploadFile, WebSocket
from fastapi.responses import FileResponse, JSONResponse, Response, StreamingResponse

from .. import office as O
from .deps import current_admin, current_user, ok, optional_user, rate_limit, svc

router = APIRouter()
log = logging.getLogger("university.office")
PROXY = "/office-ds"
TRANSPORT: httpx.AsyncBaseTransport | None = None  # testlar uchun (soxta Document Server)
SYNC_TRANSPORT: httpx.BaseTransport | None = None  # testlar uchun: «Ulanishni tekshirish»


def _cfg() -> dict:
    return O.config(svc().st)


def _docs() -> O.Docs:
    s = svc()
    d = getattr(s, "_office_docs", None)
    if d is None:
        d = s._office_docs = O.Docs(s.st)  # noqa: SLF001
    return d


def _need_on() -> dict:
    cfg = _cfg()
    if not O.ready(cfg):
        raise HTTPException(400, "office_disabled")
    return cfg


def _signed(cfg: dict, did: str, path: str, hours: int = 6, extra: dict | None = None) -> str:
    """Document Server uchun ichki tarmoqdagi (app_url) imzoli havola — sessiyasiz, qisqa muddatli."""
    exp = int(time.time()) + hours * 3600
    q = (extra or {}) | {"exp": exp, "sig": O.link_sig(cfg.get("secret", ""), did, exp)}
    return f"{cfg['app_url'].rstrip('/')}{path}?{urlencode(q)}"


def _lang(request: Request) -> str:
    v = request.query_params.get("lang") or ""
    return v if v in ("uz", "ru", "en") else "uz"


def _ui(request: Request) -> str:
    """Telefonda mobil tahrirlagich (brauzer ekran kengligiga qarab `ui=mobile` yuboradi)."""
    return "mobile" if request.query_params.get("ui") == "mobile" else "desktop"


# ====================================================================== holat va sozlamalar
@router.get("/api/office/status")
def office_status():
    cfg = _cfg()
    return ok({"enabled": O.ready(cfg), "url": cfg.get("url") or PROXY, "create": list(O.CREATE), "kinds": O.KINDS})


@router.get("/api/admin/office")
def office_get(a: dict = Depends(current_admin)):
    return ok({"config": O.public(_cfg())})


@router.put("/api/admin/office")
def office_put(data: dict = Body(...), a: dict = Depends(current_admin)):
    st = svc().st
    st.kv_put("office", O.clean(data, st.kv_get("office") or {}))
    return office_get(a)


_PROBE: dict[str, float] = {}  # tekshiruv kaliti → Document Server faylni so'ragan payt


def _public_like(url: str) -> bool:
    """app_url tashqi (internet) manzilga o'xshaydimi: https yoki nuqtali domen (ichki docker nomi emas)."""
    host = (urlparse(url).hostname or "").lower()
    if not host or host in ("localhost",) or re.fullmatch(r"[\d.]+", host) or host.endswith((".local", ".internal", ".lan")):
        return False
    return url.startswith("https://") or "." in host


@router.post("/api/admin/office/test")
def office_test(a: dict = Depends(current_admin)):
    """Ikki yo'nalishni ham tekshiradi va vaqtini o'lchaydi:
    1) sayt → hujjat serveri (healthcheck);
    2) hujjat serveri → sayt: serverdan kichik .docx'ni konvertatsiya qilish so'raladi — u faylni `app_url` orqali yuklab oladi.
    Sekinlikning eng ko'p sababi aynan 2-yo'nalish: app_url tashqi domen (Cloudflare/nginx aylanib o'tadi) yoki umuman
    ochilmaydi — Document Server faylni 2 daqiqagacha kutadi (downloadTimeout), foydalanuvchi esa shuncha «Hujjat ochilmoqda…» ni ko'radi."""
    cfg = _cfg()
    base = cfg["internal_url"].rstrip("/")
    out: dict = {"ok": True, "secret": bool(cfg.get("secret")), "app_url": cfg.get("app_url", "")}
    with httpx.Client(timeout=httpx.Timeout(60, connect=8), transport=SYNC_TRANSPORT) as c:
        t0 = time.monotonic()
        try:
            r = c.get(f"{base}/healthcheck", timeout=8)
            good = r.status_code == 200 and r.text.strip().lower() == "true"
        except httpx.HTTPError as e:
            raise HTTPException(502, f"office:{type(e).__name__}") from e
        if not good:
            raise HTTPException(502, f"office:status_{r.status_code}")
        out["health_ms"] = round((time.monotonic() - t0) * 1000)
        # 2) Document Server → sayt
        key = "probe-" + secrets.token_hex(6)
        payload = {"async": False, "filetype": "docx", "key": key, "outputtype": "pdf", "title": "probe.docx",
                   "url": _signed(cfg, key, "/api/office/probe", 1, {"key": key})}
        headers = {"Accept": "application/json"}
        body = dict(payload)
        if cfg.get("secret"):
            headers["Authorization"] = "Bearer " + O.jwt_encode({"payload": payload}, cfg["secret"])
            body["token"] = O.jwt_encode(payload, cfg["secret"])
        t1 = time.monotonic()
        try:
            res = c.post(f"{base}/converter", json=body, headers=headers).json()
        except (httpx.HTTPError, ValueError) as e:
            res = {"error": f"{type(e).__name__}"}
        t2 = time.monotonic()
        hit = _PROBE.pop(key, None)
        out["fetch_ms"] = round((hit - t1) * 1000) if hit else None
        out["convert_ms"] = round((t2 - (hit or t1)) * 1000)
        err = res.get("error") if isinstance(res, dict) else "bad_response"
        problems = []
        if err not in (None, 0):
            out["ok"] = False
            if err == -8:
                problems.append("JWT kaliti hujjat serveridagi bilan bir xil emas (-8)")
            elif not hit or err == -4:
                problems.append(f"Hujjat serveri saytdan faylni yuklab ololmadi ({err}) — «Saytning ichki manzili» noto‘g‘ri yoki tarmoqdan ochilmaydi. Docker’da: http://web:8000")
            else:
                problems.append(f"Konvertatsiya xatosi: {err}")
        if _public_like(cfg.get("app_url", "")):
            problems.append("«Saytning ichki manzili» tashqi domen: hujjat serveri faylni internet (Cloudflare/nginx) orqali aylanib yuklaydi — sekinlik sababi. Ichki manzil qo‘ying: http://web:8000")
        if out["fetch_ms"] and out["fetch_ms"] > 3000:
            problems.append(f"Hujjat serveri faylni sekin yuklayapti ({out['fetch_ms']} ms)")
        out["problems"] = problems
    return ok(out)


@router.get("/api/office/probe")
def office_probe(key: str = "", exp: int = 0, sig: str = ""):
    """«Ulanishni tekshirish»: Document Server shu havoladan kichik hujjatni yuklab oladi (payti qayd etiladi)."""
    cfg = _cfg()
    if not key.startswith("probe-") or not O.link_ok(cfg.get("secret", ""), key, exp, sig):
        raise HTTPException(403, "bad_signature")
    _PROBE[key] = time.monotonic()
    return FileResponse(O.TEMPLATES / "new.docx", filename="probe.docx")


# ====================================================================== saytdagi hujjatni ko'rish (faqat o'qish)
def _site_file(src: str) -> Path | None:
    st = svc().st
    name = src.rsplit("/", 1)[-1]
    if not name or "/" in name or name.startswith("."):
        return None
    if src.startswith("/media/"):
        p = st.media_dir / name
    else:
        return None
    return p if p.exists() else None


@router.get("/api/office/view")
def office_view(request: Request, src: str, title: str = "", u: dict | None = Depends(optional_user)):
    """Saytdagi fayl (/media/…) — ONLYOFFICE ko'rish rejimi uchun konfiguratsiya.

    Ochiq saytda endi ishlatilmaydi (PDF — pdf.js, Word/Excel — yuklab olish); kabinet ichidagi /docs/view uchun qoldirilgan."""
    cfg = _need_on()
    src = src.split("?")[0].split("#")[0]
    ext = O.ext_of(src)
    if ext not in O.KINDS or not src.startswith("/media/"):
        raise HTTPException(400, "unsupported")
    p = _site_file(src)
    st_ = p.stat() if p else None
    key = O.site_key(src, st_.st_size if st_ else 0, st_.st_mtime if st_ else 0)
    name = (title or "").strip()[:200] or src.rsplit("/", 1)[-1]
    # fayl /media/… orqali emas, imzoli ichki havoladan beriladi: S3'dagi fayl uchun /media/ tashqi S3 manziliga 302 qaytaradi va
    # Document Server uni internet orqali (ko'pincha 2 daqiqalik downloadTimeout bilan) yuklashga urinardi
    url = _signed(cfg, src, "/api/office/src", 6, {"src": src})
    conf = O.editor_config(cfg, kind=O.KINDS[ext], ext=ext, title=name, key=key, url=url, mode="view", user=u, lang=_lang(request), ui=_ui(request))
    return ok({"config": conf, "server": cfg["url"], "download": src})


@router.get("/api/office/src")
def office_src(src: str = "", exp: int = 0, sig: str = ""):
    """Document Server → saytdagi fayl (imzoli): diskdan to'g'ridan-to'g'ri, S3'dagisi esa sayt orqali (yo'naltirishsiz)."""
    cfg = _cfg()
    if not O.link_ok(cfg.get("secret", ""), src, exp, sig):
        raise HTTPException(403, "bad_signature")
    p = _site_file(src)
    if p:
        return FileResponse(p, filename=p.name)
    name = src.rsplit("/", 1)[-1]
    if src.startswith("/media/") and re.fullmatch(r"[a-f0-9]{16}\.[a-z0-9]{2,5}", name):
        from ..media import get_blob  # noqa: PLC0415

        raw = get_blob(svc().st, name)
        if raw is not None:
            return Response(raw, media_type="application/octet-stream", headers={"Content-Disposition": f'attachment; filename="{name}"'})
    raise HTTPException(404, "not_found")


# ====================================================================== foydalanuvchi hujjatlari (kabinet va admin panel)
def _own(did: str, u: dict) -> dict:
    d = _docs().get(did)
    if not d or d["owner_id"] != u["id"]:
        raise HTTPException(404, "not_found")
    return d


@router.get("/api/docs")
def docs_list(u: dict = Depends(current_user)):
    cfg = _cfg()
    return ok({"items": _docs().list(u["id"]), "enabled": O.ready(cfg), "create": list(O.CREATE)})


@router.post("/api/docs")
def docs_create(data: dict = Body(...), u: dict = Depends(current_user)):
    rate_limit(f"docs:{u['id']}", 60, 3600)
    try:
        return ok(_docs().create(u["id"], str(data.get("ext") or ""), str(data.get("title") or "")))
    except ValueError as e:
        raise HTTPException(400, str(e)) from e


@router.post("/api/docs/upload")
async def docs_upload(file: UploadFile = File(...), u: dict = Depends(current_user)):
    rate_limit(f"docs:{u['id']}", 60, 3600)
    raw = await file.read(O.MAX_SIZE + 1)
    try:
        return ok(_docs().upload(u["id"], file.filename or "", raw))
    except ValueError as e:
        raise HTTPException(400, str(e)) from e


@router.put("/api/docs/{did}")
def docs_update(did: str, data: dict = Body(...), u: dict = Depends(current_user)):
    _own(did, u)
    if "title" in data:
        _docs().rename(did, str(data["title"]))
    if "starred" in data:
        _docs().star(did, bool(data["starred"]))
    return ok(_docs().get(did))


@router.delete("/api/docs/{did}")
def docs_delete(did: str, u: dict = Depends(current_user)):
    _own(did, u)
    _docs().delete(did)
    return ok({"ok": True})


@router.get("/api/docs/{did}/download")
def docs_download(did: str, u: dict = Depends(current_user)):
    d = _own(did, u)
    p = _docs().path(d)
    if not p.exists():
        raise HTTPException(404, "not_found")
    return FileResponse(p, filename=f"{d['title']}.{d['ext']}")


@router.get("/api/docs/{did}/editor")
def docs_editor(request: Request, did: str, back: str = "", u: dict = Depends(current_user)):
    cfg = _need_on()
    d = _own(did, u)
    mode = "edit" if d["editable"] else "view"
    conf = O.editor_config(cfg, kind=d["kind"], ext=d["ext"], title=d["title"], key=d["doc_key"], url=_signed(cfg, did, f"/api/office/file/{did}"),
                           mode=mode, user=u, lang=_lang(request), callback=_signed(cfg, did, f"/api/office/callback/{did}", 48),
                           back_url=back if back.startswith("/") else "", ui=_ui(request))
    return ok({"config": conf, "server": cfg["url"], "doc": d})


# ====================================================================== Document Server → sayt
@router.get("/api/office/file/{did}")
def office_file(did: str, exp: int = 0, sig: str = ""):
    cfg = _cfg()
    if not O.link_ok(cfg.get("secret", ""), did, exp, sig):
        raise HTTPException(403, "bad_signature")
    d = _docs().get(did)
    if not d or not _docs().path(d).exists():
        raise HTTPException(404, "not_found")
    return FileResponse(_docs().path(d), filename=f"{d['id']}.{d['ext']}")


def _internal(cfg: dict, url: str) -> str:
    """Document Server bergan havola (brauzer manzili bilan) → ichki tarmoqdagi manzil."""
    if PROXY + "/" in url:
        return cfg["internal_url"].rstrip("/") + url.split(PROXY, 1)[1]
    return url


@router.post("/api/office/callback/{did}")
async def office_callback(request: Request, did: str, exp: int = 0, sig: str = ""):
    cfg = _cfg()
    if not O.link_ok(cfg.get("secret", ""), did, exp, sig):
        return JSONResponse({"error": 1, "message": "bad_signature"})
    try:
        body = await request.json()
    except ValueError:
        return JSONResponse({"error": 1})
    secret = cfg.get("secret") or ""
    if secret:
        tok = body.get("token") or (request.headers.get("authorization") or "").removeprefix("Bearer ").strip()
        data = O.jwt_decode(tok, secret) if tok else None
        if data is None:
            return JSONResponse({"error": 1, "message": "bad_token"})
        body = data.get("payload", data) if isinstance(data, dict) else body
    status = int(body.get("status") or 0)
    if status in (2, 6) and body.get("url"):
        try:
            async with httpx.AsyncClient(timeout=120, transport=TRANSPORT) as c:
                r = await c.get(_internal(cfg, str(body["url"])))
                r.raise_for_status()
        except httpx.HTTPError:
            return JSONResponse({"error": 1, "message": "download_failed"})
        users = body.get("users") or []
        editor = ""
        if users:
            uu = svc().st.get_user(str(users[0]))
            editor = (uu or {}).get("name") or ""
        ext = str(body.get("filetype") or "").lower()
        _docs().save_version(did, r.content, editor, ext if ext in O.KINDS else "")
    return JSONResponse({"error": 0})


# ====================================================================== /office-ds/… — Document Server proksisi (HTTP + WebSocket)
_HOP = {"connection", "keep-alive", "proxy-authenticate", "proxy-authorization", "te", "trailers", "transfer-encoding", "upgrade", "host", "content-length"}
_client: httpx.AsyncClient | None = None
# Ulanishlar puli. Avval httpx standarti edi: 100 ta ulanish va 120 s «pool» kutish. Brauzer → sayt bo'g'ini sekin (telefon, 3G),
# sayt → server esa tez: katta fayl (sdk-all ~8 MB) sekin mijozga uzatilguncha ichki ulanish band turadi; socket.io «polling» so'rovi
# ham 25 s gacha ushlab turadi. 100 ta band ulanishdan keyin BARCHA foydalanuvchilarning so'rovlari (api.js, tahrirlagich fayllari)
# navbatda 2 daqiqagacha kutib qolardi. Endi chegara katta, bo'sh ulanish kutish esa qisqa.
_LIMITS = httpx.Limits(max_connections=2000, max_keepalive_connections=100, keepalive_expiry=30)
_TIMEOUT = httpx.Timeout(connect=10, read=120, write=60, pool=15)
# Document Server'ning versiyali statik fayllari: /9.0.4-abc123/web-apps/…, /sdkjs/…, /fonts/… — o'zgarmaydi
_VERSIONED = re.compile(r"^\d+\.\d+\.\d+[.-][\w.-]+/(web-apps|sdkjs|sdkjs-plugins|fonts|dictionaries)/")
_STATIC = re.compile(r"^(web-apps|sdkjs|sdkjs-plugins|fonts|dictionaries)/.+\.(js|css|png|svg|jpg|gif|woff2?|ttf|json|wasm|html|bin|ico)$")


def _http() -> httpx.AsyncClient:
    global _client
    if _client is None:
        _client = httpx.AsyncClient(timeout=_TIMEOUT, limits=_LIMITS, follow_redirects=False, transport=TRANSPORT)
    return _client


def _fwd_headers(request_headers, host: str, scheme: str, client_ip: str) -> dict:
    # tashqi proksining X-Forwarded-* sarlavhalari tashlanadi: aks holda ular biznikining yonida ikkinchi nusxa bo'lib ketadi
    # va Document Server birinchisini (masalan, noto'g'ri `http`) oladi
    h = {k: v for k, v in request_headers.items()
         if k.lower() not in _HOP and k.lower() != "cookie" and not k.lower().startswith("x-forwarded-") and k.lower() != "forwarded"}
    h["X-Forwarded-Host"] = f"{host}{PROXY}"
    h["X-Forwarded-Proto"] = scheme
    h["X-Forwarded-For"] = client_ip
    # javob baytlari o'zgarishsiz uzatiladi: brauzer siqishni so'ramagan bo'lsa, httpx o'zidan «gzip» so'rab qo'ymasin
    if not any(k.lower() == "accept-encoding" for k in h):
        h["Accept-Encoding"] = "identity"
    return h


def _host(request) -> str:
    """Brauzer ko'rgan domen (tashqi proksi Host'ni ichki nomga almashtirgan bo'lsa ham)."""
    h = request.headers
    return (h.get("x-forwarded-host") or h.get("host") or "").split(",")[0].strip()


def _scheme(request) -> str:
    """Brauzer saytni qaysi protokolda ochgan (http/https).

    Document Server yuklab olish havolalarini shu asosda yasaydi: sahifa https bo'lib havola http bo'lsa, brauzer uni bloklaydi
    («Mixed Content» → ONLYOFFICE'da «Download failed»). Tashqi proksi (Cloudflare «Flexible SSL», nginx) ko'pincha ilovaga
    `X-Forwarded-Proto: http` yuboradi yoki umuman yubormaydi — shuning uchun avval brauzerning o'z belgilariga qaraladi."""
    h = request.headers
    host = _host(request).split(":")[0].lower()
    cf = (h.get("cf-visitor") or "").replace(" ", "")
    if '"scheme":"https"' in cf:
        return "https"
    # brauzer yuborgan Origin / Referer — sahifaning haqiqiy manzili
    for v in (h.get("origin"), h.get("referer")):
        m = re.match(r"^(https?)://([^/:]+)", v or "")
        if m and (not host or m.group(2).lower() == host):
            return m.group(1)
    if (h.get("x-forwarded-ssl") or h.get("front-end-https") or "").lower() == "on":
        return "https"
    fwd = re.search(r"proto=(https?)", h.get("forwarded") or "", re.I)
    v = (h.get("x-forwarded-proto") or h.get("x-forwarded-scheme") or (fwd.group(1) if fwd else "")).split(",")[0].strip().lower()
    if v == "https":
        return "https"
    site = (os.environ.get("SITE_URL") or "").strip()
    if site.startswith("https://") and (urlparse(site).hostname or "").lower() == host:
        return "https"
    if os.environ.get("SITE_COOKIE_SECURE", "").lower() in ("1", "true", "yes"):
        return "https"
    sch = v or request.url.scheme or "http"
    return {"wss": "https", "ws": "http"}.get(sch, sch)


class _Upstream(StreamingResponse):
    """Document Server javobi oqim bilan uzatiladi; mijoz uzilsa ham (iframe yopildi, sahifadan chiqildi) ichki ulanish albatta
    yopilib pulga qaytadi — avval generator hali boshlanmagan bo'lsa, javob yopilmay ulanish «osilib» qolishi mumkin edi."""

    def __init__(self, up: httpx.Response, headers: dict):
        self._up = up

        async def body():
            async for chunk in up.aiter_raw():
                yield chunk

        super().__init__(body(), status_code=up.status_code, headers=headers)

    async def __call__(self, scope, receive, send):
        try:
            await super().__call__(scope, receive, send)
        finally:
            with anyio.CancelScope(shield=True):
                await self._up.aclose()


def _out_headers(cfg: dict, path: str, method: str, up: httpx.Response) -> dict:
    h = {k: v for k, v in up.headers.items() if k.lower() not in _HOP}
    # siqilgan (gzip) baytlar o'zgarishsiz uzatiladi — Content-Length to'g'ri, brauzer va Cloudflare uni ko'radi
    if "content-length" in up.headers and "transfer-encoding" not in up.headers:
        h["content-length"] = up.headers["content-length"]
    loc = h.get("location")
    if loc and loc.startswith(cfg["internal_url"]):
        h["location"] = PROXY + loc[len(cfg["internal_url"].rstrip("/")):]
    # statik fayllar keshlanishi: Document Server bermagan bo'lsa ham versiyali fayllar «immutable» — har ochilishda
    # ~30 MB qayta yuklanmaydi (brauzer va Cloudflare keshi)
    if method in ("GET", "HEAD") and up.status_code == 200 and not any(k.lower() == "cache-control" for k in h):
        if _VERSIONED.match(path):
            h["cache-control"] = "public, max-age=31536000, immutable"
        elif _STATIC.match(path) and not path.endswith("api/documents/api.js"):
            h["cache-control"] = "public, max-age=86400"
    return h


@router.api_route(PROXY + "/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "HEAD", "OPTIONS", "PATCH"])
async def office_proxy(request: Request, path: str):
    """Brauzer → Document Server. Tavsiya: tashqi nginx /office-ds/ ni to'g'ridan-to'g'ri onlyoffice konteyneriga yo'naltirsin
    (README «Hujjatlar (ONLYOFFICE)») — shunda tahrirlagichning ~150 ta fayli Python ilovasidan umuman o'tmaydi. Bu proksi zaxira yo'l."""
    cfg = _cfg()
    if not cfg.get("enabled"):
        raise HTTPException(404, "not_found")
    url = f"{cfg['internal_url'].rstrip('/')}/{path}"
    if request.url.query:
        url += "?" + request.url.query
    headers = _fwd_headers(request.headers, _host(request), _scheme(request), request.client.host if request.client else "")
    content = None
    if request.method not in ("GET", "HEAD", "OPTIONS"):
        # so'rov tanasi xotiraga to'planmaydi (rasm yuklash va h.k.) — oqim bilan, uzunligi saqlanadi
        if request.headers.get("content-length"):
            headers["Content-Length"] = request.headers["content-length"]
        content = request.stream()
    c = _http()
    try:
        up = await c.send(c.build_request(request.method, url, headers=headers, content=content), stream=True)
    except httpx.PoolTimeout:
        return Response("ONLYOFFICE: band, qayta urinib ko'ring", status_code=503, media_type="text/plain; charset=utf-8", headers={"Retry-After": "2"})
    except httpx.HTTPError:
        return Response("ONLYOFFICE Document Server javob bermadi", status_code=502, media_type="text/plain; charset=utf-8")
    out = _out_headers(cfg, path, request.method, up)
    if request.method == "HEAD" or up.status_code in (204, 304):
        await up.aclose()
        return Response(status_code=up.status_code, headers=out)
    return _Upstream(up, out)


@router.websocket(PROXY + "/{path:path}")
async def office_ws(ws: WebSocket, path: str):
    import websockets  # noqa: PLC0415

    cfg = _cfg()
    if not cfg.get("enabled"):
        await ws.close(code=1008)
        return
    base = cfg["internal_url"].rstrip("/").replace("http://", "ws://").replace("https://", "wss://")
    url = f"{base}/{path}" + (f"?{ws.url.query}" if ws.url.query else "")
    headers = {"X-Forwarded-Host": f"{_host(ws)}{PROXY}", "X-Forwarded-Proto": _scheme(ws)}
    if ws.client:
        headers["X-Forwarded-For"] = ws.client.host
    try:
        # avval server bilan ulanamiz: u javob bermasa mijoz darhol xato oladi (socket.io tez qayta ulanadi / polling'ga o'tadi),
        # «qabul qilingan, lekin jim» ulanishda kutib qolmaydi. Ichki tarmoqda siqish (permessage-deflate) keraksiz — CPU tejaladi;
        # tirikligini socket.io o'zi tekshiradi (ping), websockets ping'i band paytda ulanishni uzib yubormasin.
        up = await websockets.connect(url, additional_headers=headers, max_size=None, open_timeout=10, compression=None, ping_interval=None)
    except Exception as e:  # noqa: BLE001
        log.warning("office ws: %s ga ulanib bo'lmadi: %s", url.split("?")[0], e)
        await ws.close(code=1011)
        return
    await ws.accept()
    try:

        async def a2b():
            while True:
                m = await ws.receive()
                if m.get("type") == "websocket.disconnect":
                    return
                if m.get("text") is not None:
                    await up.send(m["text"])
                elif m.get("bytes") is not None:
                    await up.send(m["bytes"])

        async def b2a():
            async for m in up:
                if isinstance(m, bytes):
                    await ws.send_bytes(m)
                else:
                    await ws.send_text(m)

        tasks = [asyncio.create_task(a2b()), asyncio.create_task(b2a())]
        _done, pending = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
        for t in pending:
            t.cancel()
    except Exception:  # noqa: BLE001
        pass
    finally:
        try:
            await up.close()
        except Exception:  # noqa: BLE001
            pass
        try:
            await ws.close()
        except Exception:  # noqa: BLE001
            pass
