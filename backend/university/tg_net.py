"""Telegram Bot API tarmoq qatlami: doimiy (keep-alive) ulanishlar, IPv6 → IPv4 zaxirasi, o'lchovlar va «Tezlikni tekshirish».

Nega kerak (bot 20–30 soniya kechikib javob berardi):
  * avval har bir Bot API chaqiruvi yangi `httpx.Client` ochardi: har safar DNS + TCP + TLS (Markaziy Osiyodan ~0.5–1.5 s) va CA
    to'plamini qayta yuklash. Endi jarayonda bitta mijoz (ulanishlar puli, 100 s keep-alive): issiq ulanishda chaqiruv ≈ 1 RTT;
  * serverda IPv6 manzil bo'lsa-yu, IPv6 marshruti ishlamasa, `socket.create_connection` avval IPv6 ga to'liq timeout (avval 30–40 s)
    kutib, keyin IPv4 ga o'tardi — har bir chaqiruvda. Endi: IPv6 urinishi ko'pi bilan 3 s; muvaffaqiyatsiz bo'lsa — jarayon oxirigacha
    IPv4 (sabab jurnalga va «Tezlikni tekshirish»ga yoziladi). IPv4 ni majburlash: SITE_TELEGRAM_IPV4=1 yoki admin sozlamasi;
  * DNS javobi 5 daqiqa keshlanadi (sekin rezolver har chaqiruvga qo'shilmaydi); TCP ulanish — 5 s, so'rov o'qish — usulga qarab;
  * long polling (getUpdates) alohida mijozda — kutib turgan so'rov yuborishlarni band qilmaydi.

Muhitda HTTPS_PROXY (api.telegram.org uchun) bo'lsa — httpx proksi orqali ishlaydi (o'z IPv4/DNS mantiqimiz qo'llanmaydi).
Testlar: `telegram.TRANSPORT` (httpx.MockTransport) o'rnatilsa — mijozlar shu transport bilan quriladi.
"""
from __future__ import annotations

import logging
import os
import socket
import ssl
import threading
import time
import urllib.request
from collections import deque

import httpcore
import httpx

log = logging.getLogger("university.telegram")

HOST = "api.telegram.org"
CONNECT = 5.0  # TCP ulanish (bitta manzil) uchun
V6_TRY = 3.0  # IPv4 ham bo'lsa, IPv6 urinishi uchun
DNS_TTL = 300.0
KEEPALIVE = 100.0  # bo'sh ulanish pulda shuncha soniya saqlanadi
READ = 20.0  # oddiy chaqiruvlar uchun javob kutish
FILE = 120.0  # fayl yuklash / yuborish
CONFLICT_RECENT = 900  # 409 «yaqinda» deb hisoblanadigan oraliq (s)


def _env_ipv4() -> bool:
    return (os.environ.get("SITE_TELEGRAM_IPV4") or "").strip().lower() in ("1", "true", "yes", "on")


class _State:
    def __init__(self):
        self.lock = threading.RLock()
        self.clients: dict[str, httpx.Client] = {}
        self.built_for: object = ()  # mijozlar qaysi TRANSPORT bilan qurilgan (testlarda almashtiriladi)
        self.forced = False  # admin sozlamasi: faqat IPv4
        self.ipv4 = False  # IPv6 ishlamadi — jarayon oxirigacha IPv4
        self.ipv4_reason = ""
        self.ipv4_at = 0.0
        self.dns: dict[tuple[str, int], tuple[float, list[tuple[int, str]]]] = {}
        self.dns_log: deque = deque(maxlen=50)  # {"at", "ms", "ok"}
        self.connects: deque = deque(maxlen=50)  # {"at", "ip", "family", "ms", "ok", "err"}
        self.calls: deque = deque(maxlen=600)  # {"at", "method", "ms", "ok", "err"}
        self.handlers: deque = deque(maxlen=600)  # {"at", "kind", "ms", "wait"}
        self.conflict_at = 0.0
        self.conflict_msg = ""


S = _State()


def use_ipv4() -> bool:
    return S.forced or S.ipv4 or _env_ipv4()


def set_forced(on: bool) -> None:
    S.forced = bool(on)


def switch_ipv4(reason: str) -> None:
    """IPv6 ishlamadi: jarayon oxirigacha IPv4 (bir marta jurnalga yoziladi)."""
    with S.lock:
        if S.ipv4:
            return
        S.ipv4, S.ipv4_reason, S.ipv4_at = True, reason[:300], time.time()
    log.warning("telegram: IPv6 ulanishi ishlamayapti — IPv4 ga o'tildi (%s)", reason)


# ------------------------------------------------------------------ DNS va ulanish
def _getaddrinfo(host: str, port: int, family: int = 0) -> list[tuple[int, str]]:
    out: list[tuple[int, str]] = []
    for fam, _t, _p, _c, sa in socket.getaddrinfo(host, port, family, socket.SOCK_STREAM):
        if fam in (socket.AF_INET, socket.AF_INET6) and (fam, sa[0]) not in out:
            out.append((fam, sa[0]))
    return out


def resolve(host: str, port: int) -> list[tuple[int, str]]:
    """getaddrinfo (tizim tartibi: RFC 6724) — 5 daqiqa kesh; rezolver xato bersa — eski natija."""
    key = (host, port)
    hit = S.dns.get(key)
    if hit and time.time() - hit[0] < DNS_TTL:
        return hit[1]
    t0 = time.perf_counter()
    try:
        addrs = _getaddrinfo(host, port)
    except OSError as e:
        S.dns_log.append({"at": time.time(), "ms": round((time.perf_counter() - t0) * 1000), "ok": False})
        if hit:
            return hit[1]
        raise httpcore.ConnectError(f"DNS: {host}: {e}") from e
    S.dns_log.append({"at": time.time(), "ms": round((time.perf_counter() - t0) * 1000), "ok": True})
    S.dns[key] = (time.time(), addrs)
    return addrs


class Backend(httpcore.SyncBackend):
    """TCP ulanish: keshlangan DNS, IPv6 urinishi qisqa (IPv4 bo'lsa), IPv6 ishlamasa — IPv4 ga doimiy o'tish."""

    def connect_tcp(self, host, port, timeout=None, local_address=None, socket_options=None):
        addrs = resolve(host, port)
        v4 = [a for a in addrs if a[0] == socket.AF_INET]
        order = v4 if (use_ipv4() and v4) else addrs
        last: Exception | None = None
        for fam, ip in order:
            t = min(timeout or CONNECT, CONNECT)
            if fam == socket.AF_INET6 and v4:
                t = min(t, V6_TRY)
            t0 = time.perf_counter()
            try:
                stream = super().connect_tcp(ip, port, timeout=t, local_address=local_address, socket_options=socket_options)
            except (httpcore.ConnectError, httpcore.ConnectTimeout) as e:
                ms = round((time.perf_counter() - t0) * 1000)
                S.connects.append({"at": time.time(), "ip": ip, "family": 6 if fam == socket.AF_INET6 else 4, "ms": ms, "ok": False,
                                   "err": f"{type(e).__name__}: {e}"[:200]})
                if fam == socket.AF_INET6 and v4:
                    switch_ipv4(f"{ip}: {type(e).__name__} {ms} ms")
                last = e
                continue
            S.connects.append({"at": time.time(), "ip": ip, "family": 6 if fam == socket.AF_INET6 else 4,
                               "ms": round((time.perf_counter() - t0) * 1000), "ok": True, "err": ""})
            return stream
        raise last or httpcore.ConnectError(f"{host}: manzil yo'q")


def env_proxy(url: str = f"https://{HOST}/") -> str:
    """Muhitdagi proksi (HTTPS_PROXY, NO_PROXY hisobga olingan) — bo'lsa, httpx uning orqali ishlaydi."""
    try:
        if urllib.request.proxy_bypass(HOST):
            return ""
    except Exception:  # noqa: BLE001
        pass
    p = urllib.request.getproxies().get("https") or ""
    return p if url.startswith("https") else ""


def _limits(kind: str) -> httpx.Limits:
    if kind == "poll":
        return httpx.Limits(max_connections=2, max_keepalive_connections=1, keepalive_expiry=KEEPALIVE)
    return httpx.Limits(max_connections=24, max_keepalive_connections=12, keepalive_expiry=KEEPALIVE)


def _transport(kind: str) -> httpx.HTTPTransport:
    lim = _limits(kind)
    t = httpx.HTTPTransport(limits=lim)
    t._pool = httpcore.ConnectionPool(  # noqa: SLF001 — o'z DNS/IPv4 mantiqimiz (network_backend) bilan
        ssl_context=httpx.create_ssl_context(), max_connections=lim.max_connections, max_keepalive_connections=lim.max_keepalive_connections,
        keepalive_expiry=lim.keepalive_expiry, http1=True, http2=False, network_backend=Backend())
    return t


def new_client(kind: str = "api") -> httpx.Client:
    from . import telegram as TG  # noqa: PLC0415

    timeout = httpx.Timeout(READ, connect=CONNECT, pool=10.0)
    if TG.TRANSPORT is not None:
        return httpx.Client(transport=TG.TRANSPORT, timeout=timeout)
    proxy = env_proxy()
    if proxy:
        return httpx.Client(proxy=proxy, timeout=timeout, limits=_limits(kind))
    return httpx.Client(transport=_transport(kind), timeout=timeout)


def client(kind: str = "api") -> httpx.Client:
    """Jarayon bo'yicha umumiy mijoz: «api» (yuborish, tahrirlash, fayllar) va «poll» (getUpdates). Thread-safe."""
    from . import telegram as TG  # noqa: PLC0415

    tr = TG.TRANSPORT
    c = S.clients.get(kind)
    if c is not None and S.built_for is tr:
        return c
    with S.lock:
        if S.built_for is not tr:  # testda transport almashtirildi — eski mijozlar yopiladi
            for old in S.clients.values():
                try:
                    old.close()
                except Exception:  # noqa: BLE001
                    pass
            S.clients.clear()
            S.built_for = tr
        c = S.clients.get(kind)
        if c is None:
            c = S.clients[kind] = new_client(kind)
        return c


def reset() -> None:
    """Mijozlarni yopish (masalan, IPv4 majburlash yoqilganda — yangi ulanishlar)."""
    with S.lock:
        for c in S.clients.values():
            try:
                c.close()
            except Exception:  # noqa: BLE001
                pass
        S.clients.clear()


# ------------------------------------------------------------------ so'rov
SAFE_RETRY = ("get", "edit", "delete", "answer", "set", "pin", "unpin")


def request(kind: str, method: str, verb: str, url: str, timeout: httpx.Timeout, **kw) -> httpx.Response:
    """Bitta HTTP so'rov + o'lchov. Ulanish bo'lmadi (so'rov yuborilmagan) — bir marta qayta (IPv6 bo'lgan bo'lsa — IPv4 bilan);
    keep-alive ulanish server tomonidan yopilgan bo'lsa — takrorlansa zarari yo'q usullar bir marta qayta yuboriladi."""
    t0 = time.perf_counter()
    err = ""
    try:
        for attempt in (0, 1):
            err = ""
            try:
                return client(kind).request(verb, url, timeout=timeout, **kw)
            except (httpx.ConnectError, httpx.ConnectTimeout) as e:
                err = f"{type(e).__name__}: {e}"
                if attempt or use_ipv4():
                    raise
                had_v6 = any(f == socket.AF_INET6 for f, _ in (S.dns.get((HOST, 443)) or (0, []))[1])
                if not had_v6:
                    raise
                switch_ipv4(err)
            except httpx.RemoteProtocolError as e:
                err = f"{type(e).__name__}: {e}"
                if attempt or not method.lower().startswith(SAFE_RETRY):
                    raise
        raise RuntimeError("unreachable")  # pragma: no cover
    except Exception as e:
        err = err or f"{type(e).__name__}: {e}"
        raise
    finally:
        ms = round((time.perf_counter() - t0) * 1000)
        S.calls.append({"at": time.time(), "method": method, "ms": ms, "ok": not err, "err": err[:200]})


def mark_error(method: str, desc: str) -> None:
    """Bot API `ok: false` qaytardi — oxirgi yozuvni xato deb belgilash (o'lchov uchun)."""
    for x in reversed(S.calls):
        if x["method"] == method:
            x["ok"], x["err"] = False, desc[:200]
            break


def conflict(desc: str) -> None:
    S.conflict_at, S.conflict_msg = time.time(), desc[:300]
    log.warning("telegram 409: %s", desc)


def handled(kind: str, ms: float, wait: float = 0.0) -> None:
    S.handlers.append({"at": time.time(), "kind": kind, "ms": round(ms, 1), "wait": round(wait, 1)})


# ------------------------------------------------------------------ statistika
def _pct(vals: list[float], p: float) -> float | None:
    if not vals:
        return None
    v = sorted(vals)
    k = max(0, min(len(v) - 1, int(round(p / 100 * (len(v) - 1)))))
    return round(v[k], 1)


def stats() -> dict:
    hs = list(S.handlers)
    cs = [c for c in S.calls if c["method"] != "getUpdates"]
    by: dict[str, list] = {}
    for c in cs:
        by.setdefault(c["method"], []).append(c)
    methods = sorted(({"method": m, "count": len(v), "p50": _pct([x["ms"] for x in v], 50), "p95": _pct([x["ms"] for x in v], 95),
                       "max": max(x["ms"] for x in v), "errors": sum(1 for x in v if not x["ok"]),
                       "last_error": next((x["err"] for x in reversed(v) if not x["ok"]), "")} for m, v in by.items()),
                     key=lambda x: -x["count"])
    since = min([x["at"] for x in hs] + [x["at"] for x in cs], default=None)
    return {
        "since": since,
        "handlers": {"count": len(hs), "p50": _pct([x["ms"] for x in hs], 50), "p95": _pct([x["ms"] for x in hs], 95),
                     "wait_p95": _pct([x["wait"] for x in hs], 95),
                     "slowest": sorted(hs, key=lambda x: -x["ms"])[:5]},
        "calls": {"count": len(cs), "p50": _pct([x["ms"] for x in cs], 50), "p95": _pct([x["ms"] for x in cs], 95),
                  "errors": sum(1 for x in cs if not x["ok"]), "methods": methods[:12]},
        "connects": list(S.connects)[-8:],
    }


def state() -> dict:
    return {"ipv4": use_ipv4(), "ipv4_auto": S.ipv4, "ipv4_forced": S.forced or _env_ipv4(), "ipv4_reason": S.ipv4_reason,
            "ipv4_at": S.ipv4_at or None, "proxy": _mask(env_proxy()),
            "conflict_at": S.conflict_at or None, "conflict_msg": S.conflict_msg,
            "conflict_recent": bool(S.conflict_at and time.time() - S.conflict_at < CONFLICT_RECENT)}


def _mask(p: str) -> str:
    if not p:
        return ""
    try:
        u = httpx.URL(p)
        return f"{u.scheme}://{u.host}:{u.port or ''}".rstrip(":")
    except Exception:  # noqa: BLE001
        return "bor"


# ------------------------------------------------------------------ «Tezlikni tekshirish»
def _dns(host: str, family: int) -> tuple[list[str], float, str]:
    """Bitta oila bo'yicha DNS (keshsiz): (manzillar, ms, xato)."""
    t0 = time.perf_counter()
    try:
        ips = [ip for _f, ip in _getaddrinfo(host, 443, family)]
        return ips, (time.perf_counter() - t0) * 1000, ""
    except OSError as e:
        return [], (time.perf_counter() - t0) * 1000, str(e)[:120]


def _probe(ip: str, family: int, timeout: float = CONNECT) -> dict:
    """TCP ulanish va TLS qo'l siqishish vaqti (bitta manzilga)."""
    out = {"ip": ip, "ok": False, "tcp_ms": None, "tls_ms": None, "err": ""}
    t0 = time.perf_counter()
    try:
        with socket.socket(family, socket.SOCK_STREAM) as s:
            s.settimeout(timeout)
            s.connect((ip, 443))
            out["tcp_ms"] = round((time.perf_counter() - t0) * 1000)
            t1 = time.perf_counter()
            with httpx.create_ssl_context().wrap_socket(s, server_hostname=HOST):
                out["tls_ms"] = round((time.perf_counter() - t1) * 1000)
        out["ok"] = True
    except (OSError, ssl.SSLError) as e:
        out["err"] = ("timeout" if isinstance(e, TimeoutError | socket.timeout) else f"{type(e).__name__}: {e}")[:160]
        if out["tcp_ms"] is None:
            out["tcp_ms"] = round((time.perf_counter() - t0) * 1000)
    return out


def _getme(c: httpx.Client, base: str) -> dict:
    t0 = time.perf_counter()
    try:
        r = c.post(base + "getMe", json={}, timeout=httpx.Timeout(15, connect=CONNECT))
        j = r.json()
        return {"ms": round((time.perf_counter() - t0) * 1000), "ok": bool(j.get("ok")), "err": "" if j.get("ok") else str(j.get("description") or r.status_code)}
    except Exception as e:  # noqa: BLE001
        return {"ms": round((time.perf_counter() - t0) * 1000), "ok": False, "err": f"{type(e).__name__}: {e}"[:160]}


def network_check(token: str) -> dict:
    """DNS (A/AAAA), IPv4 va IPv6 bo'yicha TCP+TLS, getMe: sovuq (yangi ulanish) va issiq (shu ulanish qayta), umumiy puldagi."""
    a, a_ms, a_err = _dns(HOST, socket.AF_INET)
    aaaa, aaaa_ms, aaaa_err = _dns(HOST, socket.AF_INET6)
    proxy = env_proxy()
    v4 = _probe(a[0], socket.AF_INET) if a and not proxy else None
    v6 = _probe(aaaa[0], socket.AF_INET6, V6_TRY) if aaaa and not proxy else None
    if v6 is not None and not v6["ok"] and v4 and v4["ok"]:
        switch_ipv4(f"tekshiruv: {aaaa[0]} — {v6['err']}")
    base = f"https://{HOST}/bot{token}/"
    with new_client("api") as c:  # sovuq: yangi TCP + TLS
        cold = _getme(c, base)
        warm = _getme(c, base)  # issiq: o'sha ulanish
    pooled = _getme(client("api"), base)  # bot ishlatadigan umumiy pul
    return {"dns": {"a": a, "aaaa": aaaa, "a_ms": round(a_ms), "aaaa_ms": round(aaaa_ms), "a_err": a_err, "aaaa_err": aaaa_err},
            "ipv4": v4, "ipv6": v6, "getme": {"cold": cold, "warm": warm, "pooled": pooled}, "proxy": _mask(proxy)}


def fmt_ms(v) -> str:
    return f"{v / 1000:.1f} s" if v >= 1000 else f"{int(v)} ms"


def verdicts(net: dict, info: dict, st: dict, mode: str, running: bool, https_site: bool, our_hook: str) -> list[dict]:
    """Aniq sabab(lar) — o'zbekcha, eng muhimi birinchi. level: bad | warn | ok | info."""
    out: list[dict] = []
    s = state()
    hook = info.get("webhook") or {}
    if s["conflict_recent"]:
        out.append({"level": "bad", "text": "Boshqa server shu token bilan ishlayapti (409): yangilanishlar ikki joyga bo‘linib, bot kechikadi "
                                            "yoki javob bermaydi. Eski nusxa, test serveri yoki boshqa saytdagi botni o‘chiring yoki yangi token oling."})
    if mode == "webhook" and hook.get("url") and our_hook and hook["url"] != our_hook:
        out.append({"level": "bad", "text": f"Webhook boshqa manzilga o‘rnatilgan: {hook['url']} — boshqa server shu tokenni ishlatmoqda."})
    if mode == "polling" and hook.get("url"):
        out.append({"level": "bad", "text": f"Polling rejimida, lekin Telegram'da webhook o‘rnatilgan ({hook['url']}): boshqa server shu tokenni ishlatmoqda."})
    if hook.get("last_error_date") and time.time() - int(hook["last_error_date"]) < 3600:
        out.append({"level": "bad", "text": f"Telegram webhook'ga yetib bora olmayapti: {hook.get('last_error_message') or '—'}"})
    if not running:
        out.append({"level": "bad", "text": "Bot fon jarayoni ishlamayapti — sozlamalarni saqlab qayta ishga tushiring."})
    v4, v6 = net.get("ipv4"), net.get("ipv6")
    gm = net.get("getme") or {}
    if v4 and not v4["ok"] and not (v6 and v6["ok"]):
        out.append({"level": "bad", "text": f"Server Telegram'ga ulana olmayapti ({v4['err']}) — server tarmog‘i yoki firewall'ni tekshiring."})
    if v6 is not None and not v6["ok"] and v4 and v4["ok"]:
        out.append({"level": "warn", "text": "IPv6 ulanishi ishlamayapti — IPv4 ga o‘tkazildi (bot endi IPv6 ni kutmaydi)."})
    elif s["ipv4_auto"]:
        out.append({"level": "warn", "text": f"IPv6 ulanishi ishlamagan — IPv4 ga o‘tkazilgan ({s['ipv4_reason']})."})
    dns_ms = max((net.get("dns") or {}).get("a_ms") or 0, (net.get("dns") or {}).get("aaaa_ms") or 0)
    if dns_ms > 1000:
        out.append({"level": "warn", "text": f"DNS sekin: {fmt_ms(dns_ms)} (endi natija 5 daqiqa keshlanadi). Server DNS sozlamasini tekshiring."})
    warm = (gm.get("warm") or {})
    cold = (gm.get("cold") or {})
    if gm and not cold.get("ok") and cold.get("err"):
        if "Unauthorized" in cold["err"] or "Not Found" in cold["err"]:
            out.append({"level": "bad", "text": "Token noto‘g‘ri yoki bekor qilingan (getMe: Unauthorized)."})
        else:
            out.append({"level": "bad", "text": f"getMe ishlamadi: {cold['err']}"})
    elif warm.get("ok"):
        if warm["ms"] > 1500:
            out.append({"level": "bad", "text": f"Telegram serverigacha tarmoq sekin: {fmt_ms(warm['ms'])} (bitta so‘rov, issiq ulanishda)."})
        elif warm["ms"] > 600:
            out.append({"level": "warn", "text": f"Telegram serverigacha tarmoq o‘rtacha: {fmt_ms(warm['ms'])} bir so‘rovga."})
        if cold.get("ok") and cold["ms"] - warm["ms"] > 300:
            out.append({"level": "info", "text": f"Yangi ulanish {fmt_ms(cold['ms'])}, qayta ishlatilgani {fmt_ms(warm['ms'])} — bot endi ulanishni qayta ishlatadi."})
    if (info.get("pending") or 0) > 5:
        out.append({"level": "warn", "text": f"Telegram'da {info['pending']} ta yangilanish navbatda turibdi."})
    h = st.get("handlers") or {}
    if (h.get("p95") or 0) > 1500:
        out.append({"level": "warn", "text": f"Bot ichki ishlovi sekin: p95 {fmt_ms(h['p95'])} (eng sekinlari pastda)."})
    if (h.get("wait_p95") or 0) > 1500:
        out.append({"level": "warn", "text": f"Yangilanishlar navbatda kutib qolmoqda: p95 {fmt_ms(h['wait_p95'])}."})
    if mode == "polling" and https_site:
        out.append({"level": "info", "text": "Webhook rejimiga o‘tish tavsiya etiladi: sayt HTTPS — Telegram xabarni darhol yuboradi (polling kutmaydi)."})
    if not any(x["level"] in ("bad", "warn") for x in out):
        msg = "Muammo topilmadi"
        if warm.get("ok"):
            msg += f": Telegram'gacha {fmt_ms(warm['ms'])}"
        if h.get("p50") is not None:
            msg += f", bot ishlovi p50 {fmt_ms(h['p50'])}"
        out.insert(0, {"level": "ok", "text": msg + "."})
    return out

