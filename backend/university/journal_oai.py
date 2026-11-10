"""Ilmiy jurnal uchun OAI-PMH 2.0 (https://www.openarchives.org/OAI/openarchivesprotocol.html): /journal/oai.

Fe'llar: Identify, ListMetadataFormats, ListSets, ListIdentifiers, ListRecords, GetRecord. Format: oai_dc.
To'plamlar (setSpec): «issue-<jild>-<raqam>» (sonlar) va «section-<id>» (rubrikalar) — tekis (ierarxiyasiz).
Identifikator: oai:<host>:journal/<num>. Sana aniqligi: YYYY-MM-DDThh:mm:ssZ (YYYY-MM-DD ham qabul qilinadi).
resumptionToken — so'rov argumentlari va siljish (offset) base64url JSON ko'rinishida (holatsiz, server qayta ishga tushsa ham ishlaydi).
"""
from __future__ import annotations

import base64
import json
import re
from datetime import datetime, timezone
from urllib.parse import urlparse
from xml.sax.saxutils import escape, quoteattr

from . import journal as J

PAGE = 100  # bitta javobdagi yozuvlar (testlarda kichraytiriladi)
VERBS = {
    "Identify": (set(), set()),
    "ListMetadataFormats": (set(), {"identifier"}),
    "ListSets": (set(), {"resumptionToken"}),
    "ListIdentifiers": ({"metadataPrefix"}, {"from", "until", "set", "resumptionToken"}),
    "ListRecords": ({"metadataPrefix"}, {"from", "until", "set", "resumptionToken"}),
    "GetRecord": ({"identifier", "metadataPrefix"}, set()),
}
FORMATS = {"oai_dc": ("http://www.openarchives.org/OAI/2.0/oai_dc.xsd", "http://www.openarchives.org/OAI/2.0/oai_dc/")}
NS = ('xmlns="http://www.openarchives.org/OAI/2.0/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" '
      'xsi:schemaLocation="http://www.openarchives.org/OAI/2.0/ http://www.openarchives.org/OAI/2.0/OAI-PMH.xsd"')


class OaiError(Exception):
    def __init__(self, code: str, msg: str):
        super().__init__(msg)
        self.code = code
        self.msg = msg


def _x(v) -> str:
    """XML matni: escape + XML 1.0 da ruxsat etilmagan boshqaruv belgilari olib tashlanadi."""
    s = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f￾￿]", "", str(v if v is not None else ""))
    return escape(s)


def _stamp(iso: str) -> str:
    """Bazadagi vaqt → 2026-01-02T03:04:05Z."""
    try:
        d = datetime.fromisoformat((iso or "").replace("Z", "+00:00"))
    except ValueError:
        d = datetime(1970, 1, 1, tzinfo=timezone.utc)
    if d.tzinfo is None:
        d = d.replace(tzinfo=timezone.utc)
    return d.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _parse_date(v: str, end: bool) -> tuple[str, str]:
    """→ (normallashgan qiymat, aniqlik «day»|«sec»); noto'g'ri bo'lsa badArgument."""
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", v):
        try:
            datetime.strptime(v, "%Y-%m-%d")
        except ValueError:
            raise OaiError("badArgument", f"Invalid date: {v}") from None
        return (v + ("T23:59:59Z" if end else "T00:00:00Z")), "day"
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z", v):
        try:
            datetime.strptime(v, "%Y-%m-%dT%H:%M:%SZ")
        except ValueError:
            raise OaiError("badArgument", f"Invalid date: {v}") from None
        return v, "sec"
    raise OaiError("badArgument", f"Invalid date format: {v}")


def host_of(svc) -> str:
    return (urlparse(svc.base_url()).hostname or "localhost").lower()


def oai_id(svc, a: dict) -> str:
    return f"oai:{host_of(svc)}:journal/{a['num']}"


def _sets_of(svc, a: dict, issues: dict) -> list[str]:
    out = []
    i = issues.get(a.get("issue_id") or "")
    if i:
        out.append(f"issue-{i['volume']}-{i['number']}")
    if a.get("section_id"):
        out.append(f"section-{a['section_id']}")
    return out


def _encode(d: dict) -> str:
    return base64.urlsafe_b64encode(json.dumps(d, separators=(",", ":")).encode()).decode().rstrip("=")


def _decode(tok: str) -> dict:
    try:
        d = json.loads(base64.urlsafe_b64decode(tok + "=" * (-len(tok) % 4)).decode())
    except Exception:  # noqa: BLE001
        raise OaiError("badResumptionToken", "The resumptionToken is invalid") from None
    if not isinstance(d, dict) or not isinstance(d.get("o"), int) or d["o"] < 0 or d.get("v") not in ("ListIdentifiers", "ListRecords", "ListSets"):
        raise OaiError("badResumptionToken", "The resumptionToken is invalid")
    return d


def _records(svc) -> tuple[list[dict], dict]:
    st = svc.st
    issues = {i["id"]: i for i in J.issues(st, public=True)}
    arts = sorted(J.public_articles(st), key=lambda a: (_stamp(a.get("updated") or ""), a["num"]))
    return arts, issues


def _header(svc, a: dict, issues: dict) -> str:
    return ("<header><identifier>" + _x(oai_id(svc, a)) + "</identifier><datestamp>" + _stamp(a.get("updated") or "") + "</datestamp>"
            + "".join(f"<setSpec>{_x(s)}</setSpec>" for s in _sets_of(svc, a, issues)) + "</header>")


def _dc(svc, a: dict, i: dict) -> str:
    s = J.settings(svc.st)
    bl = svc.base_lang()
    base = svc.base_url()
    lang = a.get("lang") or bl
    jt = J.journal_title(s, bl, bl)
    code, lurl = J.license_of(a, s)
    el = []

    def add(tag: str, v, xml_lang: str = ""):
        if v:
            el.append(f"<dc:{tag}{' xml:lang=' + quoteattr(xml_lang) if xml_lang else ''}>{_x(v)}</dc:{tag}>")
    add("title", a.get("title"), lang)
    for k, v in (a.get("title_i18n") or {}).items():
        add("title", v, k)
    for p in a.get("authors") or []:
        add("creator", ", ".join(x for x in (p.get("family"), p.get("given")) if x))
    for k, kws in (a.get("keywords") or {}).items():
        for kw in kws:
            add("subject", kw, k)
    for k, v in (a.get("abstract") or {}).items():
        add("description", J.plain(v, 20000), k)
    add("publisher", J.pick(s.get("publisher"), bl, bl), bl)
    add("date", J.pub_date(a, i))
    add("type", "info:eu-repo/semantics/article")
    add("type", "info:eu-repo/semantics/publishedVersion")
    add("type", "Peer-reviewed Article")
    add("format", "application/pdf" if a.get("pdf") else "text/html")
    add("identifier", base + J.article_path(a))
    if a.get("doi"):
        add("identifier", f"https://doi.org/{a['doi']}")
    pages = J._range(a, "-")  # noqa: SLF001
    add("source", f"{jt}; Vol. {i['volume']} No. {i['number']} ({i['year']})" + (f"; {pages}" if pages else ""), bl)
    for k in ("issn_print", "issn_online"):
        if s.get(k):
            add("source", s[k])
    add("language", lang)
    if a.get("pdf"):
        add("relation", base + J.pdf_path(a))
    add("rights", lurl)
    add("rights", code)
    return ('<oai_dc:dc xmlns:oai_dc="http://www.openarchives.org/OAI/2.0/oai_dc/" xmlns:dc="http://purl.org/dc/elements/1.1/" '
            'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" '
            'xsi:schemaLocation="http://www.openarchives.org/OAI/2.0/oai_dc/ http://www.openarchives.org/OAI/2.0/oai_dc.xsd">' + "".join(el) + "</oai_dc:dc>")


def _find_by_id(svc, ident: str) -> dict | None:
    m = re.fullmatch(r"oai:([^:]+):journal/(\d{1,9})", ident or "")
    if not m or m.group(1).lower() != host_of(svc):
        return None
    hit = J.public_article(svc.st, m.group(2))
    return hit[0] if hit else None


def _token_xml(d: dict, total: int, cursor: int, next_offset: int) -> str:
    if next_offset < total:
        return f'<resumptionToken completeListSize="{total}" cursor="{cursor}">{_encode(d | {"o": next_offset})}</resumptionToken>'
    if cursor > 0:  # oxirgi bo'lak: bo'sh token
        return f'<resumptionToken completeListSize="{total}" cursor="{cursor}"/>'
    return ""


def respond(svc, args: list[tuple[str, str]]) -> tuple[str, int]:
    """args — so'rovdagi (nom, qiymat) juftlari (GET yoki POST). → (XML, HTTP holati)."""
    base = svc.base_url() + "/journal/oai"
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    req_attrs = ""
    try:
        names = [k for k, _ in args]
        if any(names.count(k) > 1 for k in set(names)):
            raise OaiError("badArgument" if "verb" not in [k for k in names if names.count(k) > 1] else "badVerb", "Repeated argument")
        q = dict(args)
        verb = q.get("verb", "")
        if verb not in VERBS:
            raise OaiError("badVerb", "Illegal OAI verb" if verb else "Missing verb")
        required, optional = VERBS[verb]
        given = set(q) - {"verb"}
        if "resumptionToken" in given:
            if given != {"resumptionToken"}:
                raise OaiError("badArgument", "resumptionToken is an exclusive argument")
        else:
            missing = required - given
            if missing:
                raise OaiError("badArgument", "Missing required argument: " + ", ".join(sorted(missing)))
        extra = given - required - optional
        if extra:
            raise OaiError("badArgument", "Illegal argument: " + ", ".join(sorted(extra)))
        req_attrs = "".join(f" {k}={quoteattr(v)}" for k, v in sorted(q.items()))
        body = _VERB_FN[verb](svc, q)
        status = 200
    except OaiError as e:
        # badVerb / badArgument javobida <request> atributsiz bo'ladi (protokol 3.6)
        if e.code in ("badVerb", "badArgument"):
            req_attrs = ""
        body = f'<error code="{e.code}">{_x(e.msg)}</error>'
        status = 200
    xml = (f'<?xml version="1.0" encoding="UTF-8"?>\n<OAI-PMH {NS}><responseDate>{now}</responseDate>'
           f"<request{req_attrs}>{_x(base)}</request>{body}</OAI-PMH>")
    return xml, status


def _identify(svc, q: dict) -> str:
    s = J.settings(svc.st)
    bl = svc.base_lang()
    arts, _ = _records(svc)
    earliest = min((_stamp(a.get("updated") or "") for a in arts), default="2000-01-01T00:00:00Z")
    email = s.get("email") or s.get("submission_email") or (svc.uni().get("email") or "") or f"admin@{host_of(svc)}"
    host = host_of(svc)
    sample = f"oai:{host}:journal/1"
    return ("<Identify>"
            f"<repositoryName>{_x(J.journal_title(s, bl, bl))}</repositoryName><baseURL>{_x(svc.base_url() + '/journal/oai')}</baseURL>"
            f"<protocolVersion>2.0</protocolVersion><adminEmail>{_x(email)}</adminEmail><earliestDatestamp>{earliest}</earliestDatestamp>"
            "<deletedRecord>transient</deletedRecord><granularity>YYYY-MM-DDThh:mm:ssZ</granularity>"
            '<description><oai-identifier xmlns="http://www.openarchives.org/OAI/2.0/oai-identifier" '
            'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.openarchives.org/OAI/2.0/oai-identifier '
            'http://www.openarchives.org/OAI/2.0/oai-identifier.xsd"><scheme>oai</scheme>'
            f"<repositoryIdentifier>{_x(host)}</repositoryIdentifier><delimiter>:</delimiter><sampleIdentifier>{_x(sample)}</sampleIdentifier>"
            "</oai-identifier></description></Identify>")


def _formats(svc, q: dict) -> str:
    if q.get("identifier") and not _find_by_id(svc, q["identifier"]):
        raise OaiError("idDoesNotExist", "No matching identifier")
    return "<ListMetadataFormats>" + "".join(
        f"<metadataFormat><metadataPrefix>{k}</metadataPrefix><schema>{v[0]}</schema><metadataNamespace>{v[1]}</metadataNamespace></metadataFormat>"
        for k, v in FORMATS.items()) + "</ListMetadataFormats>"


def _all_sets(svc) -> list[tuple[str, str]]:
    s = J.settings(svc.st)
    bl = svc.base_lang()
    out = [(f"issue-{i['volume']}-{i['number']}", f"Vol. {i['volume']} No. {i['number']} ({i['year']})") for i in J.issues(svc.st, public=True)]
    out += [(f"section-{x['id']}", J.pick(x["title"], bl, bl)) for x in s.get("sections") or []]
    return out


def _list_sets(svc, q: dict) -> str:
    sets = _all_sets(svc)
    offset, d = 0, {"v": "ListSets"}
    if q.get("resumptionToken"):
        d = _decode(q["resumptionToken"])
        if d["v"] != "ListSets" or d["o"] >= max(len(sets), 1):
            raise OaiError("badResumptionToken", "The resumptionToken is invalid")
        offset = d["o"]
    page = sets[offset: offset + PAGE]
    return ("<ListSets>" + "".join(f"<set><setSpec>{_x(k)}</setSpec><setName>{_x(n)}</setName></set>" for k, n in page)
            + _token_xml({"v": "ListSets"}, len(sets), offset, offset + len(page)) + "</ListSets>")


def _select(svc, q: dict, verb: str) -> tuple[list[dict], dict, int, dict]:
    if q.get("resumptionToken"):
        d = _decode(q["resumptionToken"])
        if d["v"] != verb:
            raise OaiError("badResumptionToken", "The resumptionToken does not belong to this verb")
        prefix, frm, until, sset, offset = d.get("p"), d.get("f"), d.get("u"), d.get("s"), d["o"]
    else:
        prefix, frm, until, sset, offset = q.get("metadataPrefix"), q.get("from"), q.get("until"), q.get("set"), 0
    if prefix not in FORMATS:
        raise OaiError("cannotDisseminateFormat", f"Unsupported metadataPrefix: {prefix}")
    lo = hi = None
    if frm:
        lo, g1 = _parse_date(frm, end=False)
    if until:
        hi, g2 = _parse_date(until, end=True)
    if frm and until:
        if g1 != g2:
            raise OaiError("badArgument", "from and until must have the same granularity")
        if lo > hi:
            raise OaiError("badArgument", "from is later than until")
    arts, issues = _records(svc)
    if sset:
        known = {k for k, _ in _all_sets(svc)}
        if sset not in known:
            raise OaiError("noRecordsMatch", "No records in the requested set")
    out = []
    for a in arts:
        ds = _stamp(a.get("updated") or "")
        if lo and ds < lo:
            continue
        if hi and ds > hi:
            continue
        if sset and sset not in _sets_of(svc, a, issues):
            continue
        out.append(a)
    if q.get("resumptionToken") and offset >= len(out):
        raise OaiError("badResumptionToken", "The resumptionToken is invalid or expired")
    if not out:
        raise OaiError("noRecordsMatch", "No records match the request")
    d = {"v": verb, "p": prefix, "f": frm, "u": until, "s": sset}
    return out, issues, offset, {k: v for k, v in d.items() if v}


def _list(svc, q: dict, verb: str) -> str:
    recs, issues, offset, d = _select(svc, q, verb)
    page = recs[offset: offset + PAGE]
    if verb == "ListIdentifiers":
        items = "".join(_header(svc, a, issues) for a in page)
    else:
        items = "".join(f"<record>{_header(svc, a, issues)}<metadata>{_dc(svc, a, issues[a['issue_id']])}</metadata></record>" for a in page)
    return f"<{verb}>{items}{_token_xml(d, len(recs), offset, offset + len(page))}</{verb}>"


def _get_record(svc, q: dict) -> str:
    if q.get("metadataPrefix") not in FORMATS:
        raise OaiError("cannotDisseminateFormat", f"Unsupported metadataPrefix: {q.get('metadataPrefix')}")
    a = _find_by_id(svc, q.get("identifier", ""))
    if not a:
        raise OaiError("idDoesNotExist", "No matching identifier")
    _, issues = _records(svc)
    return f"<GetRecord><record>{_header(svc, a, issues)}<metadata>{_dc(svc, a, issues[a['issue_id']])}</metadata></record></GetRecord>"


_VERB_FN = {
    "Identify": _identify,
    "ListMetadataFormats": _formats,
    "ListSets": _list_sets,
    "ListIdentifiers": lambda svc, q: _list(svc, q, "ListIdentifiers"),
    "ListRecords": lambda svc, q: _list(svc, q, "ListRecords"),
    "GetRecord": _get_record,
}
