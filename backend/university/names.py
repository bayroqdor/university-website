"""Ism-familiyadan login / universitet pochtasi manzilini taklif qilish (lotin, kirill o'zbek va rus harflari)."""
from __future__ import annotations

import re

_CYR = {
    "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "е": "e", "ё": "yo", "ж": "j", "з": "z", "и": "i", "й": "y", "к": "k", "л": "l",
    "м": "m", "н": "n", "о": "o", "п": "p", "р": "r", "с": "s", "т": "t", "у": "u", "ф": "f", "х": "x", "ц": "ts", "ч": "ch", "ш": "sh",
    "щ": "sh", "ъ": "", "ы": "i", "ь": "", "э": "e", "ю": "yu", "я": "ya", "ў": "o", "қ": "q", "ғ": "g", "ҳ": "h",
}
_APOS = re.compile(r"[ʻʼ'`‘’]")


def translit(s: str) -> str:
    s = (s or "").strip().lower()
    s = "".join(_CYR.get(ch, ch) for ch in s)
    s = _APOS.sub("", s)  # o‘ → o, g‘ → g
    s = s.replace("ʃ", "sh")
    return re.sub(r"[^a-z0-9 .-]+", "", s)


def _clean(part: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", part)


def login_candidates(name: str) -> list[str]:
    """«Aziza Karimova» → aziza.karimova, karimova.aziza, a.karimova, karimova.a, aziza.k …"""
    parts = [_clean(p) for p in translit(name).replace(".", " ").replace("-", " ").split()]
    parts = [p for p in parts if p]
    if not parts:
        return []
    if len(parts) == 1:
        return [parts[0]]
    a, b = parts[0], parts[1]
    out = [f"{a}.{b}", f"{b}.{a}", f"{a[0]}.{b}", f"{b}.{a[0]}", f"{a}{b}", f"{a}_{b}"]
    seen: list[str] = []
    for x in out:
        x = x[:40]
        if len(x) >= 3 and x not in seen:
            seen.append(x)
    return seen


def suggest(name: str, taken, limit: int = 4) -> list[str]:
    """Bo'sh loginlar: avval tayyor variantlar, hammasi band bo'lsa — raqam qo'shiladi."""
    cands = login_candidates(name)
    free = [c for c in cands if not taken(c)]
    if cands and len(free) < limit:
        base, n = cands[0], 2
        while len(free) < limit and n < 200:
            c = f"{base}{n}"
            if not taken(c) and c not in free:
                free.append(c)
            n += 1
    return free[:limit]
