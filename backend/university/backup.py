"""Kunlik avtomatik zaxira (baza + fayllar) va bitirganlar ma'lumotini anonimlashtirish.

Zaxira: har kuni (02:00 dan keyin, kuniga bir marta) `data/backups/YYYY-MM-DD/` papkasiga:
  • `db/<jadval>.csv` — PostgreSQL bazaning izchil nusxasi (bitta REPEATABLE READ tranzaksiyada `COPY … TO STDOUT`);
  • `files/` — media va kutubxona fayllari: o'zgarmagan fayllar oldingi kungi nusxaga «hard link» qilinadi (qo'shimcha joy olmaydi).
30 kundan eski zaxiralar o'chiriladi. Tiklash: `python -m university.backup restore data/backups/YYYY-MM-DD` (README).

Anonimlashtirish: faolsizlantirilgan (bitirgan) talaba 1 yildan keyin kutubxona tarixida shaxssiz yozuvga aylanadi.
"""
from __future__ import annotations

import os
import json
import shutil
import sys
from datetime import date, datetime, timedelta
from pathlib import Path

KEEP_DAYS = int(os.environ.get("SITE_BACKUP_DAYS", "30") or 30)
SOURCES = ("media", "library")


def _root(st) -> Path:
    p = Path(os.environ.get("SITE_BACKUP_DIR") or (st.dir / "backups"))
    p.mkdir(parents=True, exist_ok=True)
    return p


def make(st, day: str | None = None) -> Path:
    day = day or date.today().isoformat()
    root = _root(st)
    dest = root / day
    tmp = root / f".{day}.tmp"
    if tmp.exists():
        shutil.rmtree(tmp, ignore_errors=True)
    tmp.mkdir(parents=True)
    # 1) baza — izchil nusxa (yozuvlar to'xtamaydi): bitta snapshot-tranzaksiyada har bir jadval CSV'ga
    dump_db(st, tmp / "db")
    # 2) fayllar — oxirgi zaxiradagi bir xil fayl bo'lsa hard link
    prev = sorted([p for p in root.iterdir() if p.is_dir() and not p.name.startswith(".") and p.name < day], reverse=True)
    prev_files = prev[0] / "files" if prev else None
    for src_name in SOURCES:
        src = st.dir / src_name
        if not src.exists():
            continue
        for f in src.rglob("*"):
            if not f.is_file():
                continue
            rel = f.relative_to(st.dir)
            target = tmp / "files" / rel
            target.parent.mkdir(parents=True, exist_ok=True)
            old = prev_files / rel if prev_files else None
            try:
                if old and old.exists() and old.stat().st_size == f.stat().st_size and old.stat().st_mtime >= f.stat().st_mtime:
                    os.link(old, target)
                else:
                    try:
                        os.link(f, target)  # bir xil disk — nusxa joy olmaydi; fayl keyin o'zgarsa ham eski inode saqlanadi
                    except OSError:
                        shutil.copy2(f, target)
            except OSError:
                shutil.copy2(f, target)
    if dest.exists():
        shutil.rmtree(dest, ignore_errors=True)
    tmp.rename(dest)
    (dest / "INFO.txt").write_text(f"University backup: {datetime.now().isoformat(timespec='seconds')}\n", encoding="utf-8")
    prune(st)
    return dest


def dump_db(st, dest: Path) -> dict:
    """Barcha jadvallar → `dest/<jadval>.csv` (+ `tables.json`: ustunlar tartibi)."""
    dest.mkdir(parents=True, exist_ok=True)
    meta: dict[str, list[str]] = {}
    with st._tx(snapshot=True):  # bitta tranzaksiya — izchil holat
        for t in st.db.tables():
            cols = st.db.columns(t)
            with open(dest / f"{t}.csv", "wb") as f:
                st.db.copy_to(t, cols, f)
            meta[t] = cols
    (dest / "tables.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")
    return meta


def restore_db(st, src: Path) -> dict:
    """Zaxiradan tiklash: jadvallar tozalanib, CSV'dan qayta yoziladi (bitta tranzaksiyada). Sxema ilova tomonidan yaratilgan bo'ladi."""
    src = src / "db" if (src / "db").is_dir() else src
    meta = json.loads((src / "tables.json").read_text(encoding="utf-8"))
    stats: dict[str, int] = {}
    from .schema import ensure_all_schemas  # noqa: PLC0415

    ensure_all_schemas(st)  # bo'sh bazaga tiklashda ham jadvallar asl turlari va indekslari bilan bo'ladi
    with st._tx():
        existing = set(st.db.tables())
        for t, cols in meta.items():
            if t not in existing:
                decl = ", ".join(f'"{c}" TEXT' for c in cols)
                st.db.execute(f'CREATE TABLE "{t}" ({decl})')
            else:
                have = set(st.db.columns(t))
                for c in cols:
                    if c not in have:
                        st.db.execute(f'ALTER TABLE "{t}" ADD COLUMN "{c}" TEXT')
            st.db.execute(f'TRUNCATE "{t}"')
            with open(src / f"{t}.csv", "rb") as f:
                st.db.copy_from(t, cols, f)
            stats[t] = st.db.execute(f'SELECT COUNT(*) FROM "{t}"').fetchone()[0]
        for t, cols in meta.items():
            if "id" in cols and st.db.execute("SELECT pg_get_serial_sequence(%s, 'id')", (t,)).fetchone()[0]:
                st.db.reset_sequence(t)
        st.kv_invalidate()  # ishlab turgan saytdagi sozlamalar keshi ham yangilanadi
    return stats


def prune(st) -> None:
    root = _root(st)
    limit = (date.today() - timedelta(days=KEEP_DAYS)).isoformat()
    for p in root.iterdir():
        if p.is_dir() and not p.name.startswith(".") and p.name < limit:
            shutil.rmtree(p, ignore_errors=True)


def list_backups(st) -> list[dict]:
    root = _root(st)
    out = []
    for p in sorted(root.iterdir(), reverse=True):
        if p.is_dir() and not p.name.startswith("."):
            db = p / "db"
            out.append({"day": p.name, "db_size": sum(f.stat().st_size for f in db.glob("*.csv")) if db.exists() else 0})
    return out


def anonymize_graduates(st, lib) -> int:
    """Faol bo'lmagan talaba — birinchi ko'rilgan sanasi eslab qolinadi; 365 kundan keyin kutubxona tarixi anonimlashtiriladi."""
    seen = dict(st.kv_get("lib_inactive_since") or {})
    done = set(st.kv_get("lib_anonymized") or [])
    today = date.today()
    n = 0
    inactive = {r["id"] for r in st._q("SELECT id FROM users WHERE role='student' AND active=0")}
    for uid in list(seen):
        if uid not in inactive:
            seen.pop(uid)  # qayta faollashtirilgan
    for uid in inactive:
        if uid in done:
            continue
        since = seen.setdefault(uid, today.isoformat())
        if date.fromisoformat(since) <= today - timedelta(days=365):
            lib.anonymize_user(uid)
            done.add(uid)
            n += 1
    st.kv_put("lib_inactive_since", seen)
    st.kv_put("lib_anonymized", sorted(done))
    return n


def daily(st, lib) -> None:
    if os.environ.get("SITE_BACKUP", "1") == "0":
        return
    now = datetime.now().astimezone()
    key = now.date().isoformat()
    if now.hour < 2 or st.kv_get("backup_last") == key:
        return
    st.kv_put("backup_last", key)
    try:
        make(st, key)
    except Exception as e:  # noqa: BLE001
        print(f"backup: {e}", flush=True)
    try:
        anonymize_graduates(st, lib)
    except Exception as e:  # noqa: BLE001
        print(f"anonymize: {e}", flush=True)


if __name__ == "__main__":  # python -m university.backup restore <zaxira papkasi>
    if len(sys.argv) != 3 or sys.argv[1] != "restore":
        print("Foydalanish: python -m university.backup restore data/backups/YYYY-MM-DD")
        sys.exit(2)
    from .storage import Storage  # noqa: PLC0415

    folder = Path(sys.argv[2])
    stats = restore_db(Storage(os.environ.get("SITE_DATA_DIR")), folder)
    print(f"Tiklandi: {sum(stats.values())} qator, {len(stats)} jadval. Fayllar: {folder / 'files'} → ma'lumotlar papkasiga nusxalang.")
