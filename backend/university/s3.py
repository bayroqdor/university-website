"""S3 (AWS S3, MinIO, Cloudflare R2, Yandex Object Storage, DigitalOcean Spaces…) — media va fayllarni saqlash.

Sozlamalar admin → Sayt sozlamalari → «Fayl saqlash (S3)» (kv `s3`) yoki muhit o'zgaruvchilari (SITE_S3_*).
Fayl manzillari saytda o'zgarmaydi (`/media/<nom>`): fayl lokal diskda bo'lmasa server S3 dagi nusxaga yo'naltiradi
(ochiq `public_url` bo'lsa — to'g'ridan-to'g'ri, aks holda qisqa muddatli imzolangan havola).

AWS Signature V4 qo'lda (httpx bilan) — boto3 kabi og'ir kutubxona kerak emas.
"""
from __future__ import annotations

import hashlib
import hmac
import os
from datetime import datetime, timezone
from urllib.parse import quote, urlparse

import httpx

FIELDS = ("enabled", "endpoint", "region", "bucket", "access_key", "secret_key", "prefix", "public_url", "path_style", "keep_local")
SECRET = "secret_key"


class S3Error(RuntimeError):
    pass


def env_defaults() -> dict:
    e = os.environ.get
    return {
        "enabled": e("SITE_S3_ENABLED", "0").lower() in ("1", "true", "yes"),
        "endpoint": e("SITE_S3_ENDPOINT", ""),
        "region": e("SITE_S3_REGION", "us-east-1"),
        "bucket": e("SITE_S3_BUCKET", ""),
        "access_key": e("SITE_S3_ACCESS_KEY", ""),
        "secret_key": e("SITE_S3_SECRET_KEY", ""),
        "prefix": e("SITE_S3_PREFIX", "university/"),
        "public_url": e("SITE_S3_PUBLIC_URL", ""),
        "path_style": e("SITE_S3_PATH_STYLE", "1").lower() in ("1", "true", "yes"),
        "keep_local": e("SITE_S3_KEEP_LOCAL", "0").lower() in ("1", "true", "yes"),
    }


def config(st) -> dict:
    saved = st.kv_get("s3") or {}
    return env_defaults() | {k: v for k, v in saved.items() if k in FIELDS and v not in (None,)}


def clean(data: dict, current: dict) -> dict:
    out = dict(current)
    for k in FIELDS:
        if k not in data:
            continue
        v = data[k]
        if k in ("enabled", "path_style", "keep_local"):
            out[k] = bool(v)
        elif k == SECRET:
            if v:  # bo'sh qoldirilsa — eskisi saqlanadi
                out[k] = str(v).strip()[:200]
        else:
            out[k] = str(v or "").strip()[:300]
    if out.get("endpoint") and not out["endpoint"].startswith(("http://", "https://")):
        out["endpoint"] = "https://" + out["endpoint"]
    out["endpoint"] = (out.get("endpoint") or "").rstrip("/")
    out["public_url"] = (out.get("public_url") or "").rstrip("/")
    p = (out.get("prefix") or "").strip("/")
    out["prefix"] = p + "/" if p else ""
    return out


def public(cfg: dict) -> dict:
    return {k: v for k, v in cfg.items() if k != SECRET} | {"has_secret": bool(cfg.get(SECRET))}


def ready(cfg: dict) -> bool:
    return bool(cfg.get("enabled") and cfg.get("endpoint") and cfg.get("bucket") and cfg.get("access_key") and cfg.get(SECRET))


# ------------------------------------------------------------------ AWS Signature V4
def _h(key: bytes, msg: str) -> bytes:
    return hmac.new(key, msg.encode(), hashlib.sha256).digest()


def _signing_key(secret: str, day: str, region: str) -> bytes:
    return _h(_h(_h(_h(("AWS4" + secret).encode(), day), region), "s3"), "aws4_request")


class Client:
    def __init__(self, cfg: dict, timeout: float = 30.0):
        self.cfg = cfg
        u = urlparse(cfg["endpoint"])
        self.scheme, self.netloc = u.scheme or "https", u.netloc
        self.base_path = u.path.rstrip("/")
        self.bucket = cfg["bucket"]
        self.region = cfg.get("region") or "us-east-1"
        self.path_style = bool(cfg.get("path_style", True))
        self.timeout = timeout

    def key(self, name: str) -> str:
        return (self.cfg.get("prefix") or "") + name

    def _host_path(self, key: str) -> tuple[str, str]:
        k = quote(key, safe="/-_.~")
        if self.path_style:
            return self.netloc, f"{self.base_path}/{self.bucket}/{k}" if key else f"{self.base_path}/{self.bucket}/"
        return f"{self.bucket}.{self.netloc}", f"{self.base_path}/{k}"

    def _auth(self, method: str, host: str, path: str, query: dict, headers: dict, payload_hash: str, now: datetime) -> dict:
        amz = now.strftime("%Y%m%dT%H%M%SZ")
        day = amz[:8]
        h = {k.lower(): str(v).strip() for k, v in headers.items()} | {"host": host, "x-amz-date": amz, "x-amz-content-sha256": payload_hash}
        signed = ";".join(sorted(h))
        canon_q = "&".join(f"{quote(k, safe='-_.~')}={quote(str(v), safe='-_.~')}" for k, v in sorted(query.items()))
        canon = "\n".join([method, path, canon_q, "".join(f"{k}:{h[k]}\n" for k in sorted(h)), signed, payload_hash])
        scope = f"{day}/{self.region}/s3/aws4_request"
        sts = "\n".join(["AWS4-HMAC-SHA256", amz, scope, hashlib.sha256(canon.encode()).hexdigest()])
        sig = hmac.new(_signing_key(self.cfg[SECRET], day, self.region), sts.encode(), hashlib.sha256).hexdigest()
        h["authorization"] = f"AWS4-HMAC-SHA256 Credential={self.cfg['access_key']}/{scope}, SignedHeaders={signed}, Signature={sig}"
        return h

    def _req(self, method: str, key: str, body: bytes = b"", headers: dict | None = None, query: dict | None = None) -> httpx.Response:
        host, path = self._host_path(key)
        query = query or {}
        hdrs = self._auth(method, host, path, query, headers or {}, hashlib.sha256(body).hexdigest(), datetime.now(timezone.utc))
        url = f"{self.scheme}://{host}{path}"
        try:
            with httpx.Client(timeout=self.timeout) as c:
                r = c.request(method, url, params=query or None, content=body if body else None, headers=hdrs)
        except httpx.HTTPError as e:
            raise S3Error(f"network: {type(e).__name__}: {e}") from e
        return r

    @staticmethod
    def _check(r: httpx.Response, ok=(200, 204)) -> httpx.Response:
        if r.status_code not in ok:
            import re  # noqa: PLC0415

            code = re.search(r"<Code>([^<]+)</Code>", r.text or "")
            raise S3Error(f"{r.status_code} {code.group(1) if code else r.reason_phrase}")
        return r

    def put(self, name: str, data: bytes, mime: str = "application/octet-stream", cache: str = "public, max-age=31536000, immutable") -> None:
        self._check(self._req("PUT", self.key(name), data, {"content-type": mime, "cache-control": cache}))

    def get(self, name: str) -> bytes:
        return self._check(self._req("GET", self.key(name)), ok=(200,)).content

    def delete(self, name: str) -> None:
        self._check(self._req("DELETE", self.key(name)), ok=(200, 204, 404))

    def exists(self, name: str) -> bool:
        r = self._req("HEAD", self.key(name))
        if r.status_code == 404:
            return False
        self._check(r, ok=(200,))
        return True

    def presign(self, name: str, expires: int = 3600, now: datetime | None = None) -> str:
        """Imzolangan GET havola (yopiq bucket uchun)."""
        now = now or datetime.now(timezone.utc)
        host, path = self._host_path(self.key(name))
        amz = now.strftime("%Y%m%dT%H%M%SZ")
        day = amz[:8]
        scope = f"{day}/{self.region}/s3/aws4_request"
        q = {"X-Amz-Algorithm": "AWS4-HMAC-SHA256", "X-Amz-Credential": f"{self.cfg['access_key']}/{scope}", "X-Amz-Date": amz,
             "X-Amz-Expires": str(expires), "X-Amz-SignedHeaders": "host"}
        canon_q = "&".join(f"{quote(k, safe='-_.~')}={quote(v, safe='-_.~')}" for k, v in sorted(q.items()))
        canon = "\n".join(["GET", path, canon_q, f"host:{host}\n", "host", "UNSIGNED-PAYLOAD"])
        sts = "\n".join(["AWS4-HMAC-SHA256", amz, scope, hashlib.sha256(canon.encode()).hexdigest()])
        sig = hmac.new(_signing_key(self.cfg[SECRET], day, self.region), sts.encode(), hashlib.sha256).hexdigest()
        return f"{self.scheme}://{host}{path}?{canon_q}&X-Amz-Signature={sig}"

    def url(self, name: str) -> str:
        """Saytdagi havola: ochiq manzil (CDN / public bucket) yoki imzolangan havola."""
        if self.cfg.get("public_url"):
            return f"{self.cfg['public_url']}/{quote(self.key(name), safe='/-_.~')}"
        return self.presign(name)

    def test(self) -> dict:
        """Ulanishni tekshirish: kichik fayl yozish, o'qish, o'chirish."""
        name = f".site-check-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}.txt"
        self.put(name, b"ok", "text/plain", "no-store")
        got = self.get(name)
        self.delete(name)
        if got != b"ok":
            raise S3Error("read_mismatch")
        return {"ok": True, "bucket": self.bucket, "endpoint": self.cfg["endpoint"]}


def client(st) -> Client | None:
    cfg = config(st)
    return Client(cfg) if ready(cfg) else None
