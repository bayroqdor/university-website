"""Eski o'rnatishni ko'chirish: `site.sqlite3` fayli (SQLite davridagi baza) → PostgreSQL. Bir martalik.

Ilova faqat PostgreSQL bilan ishlaydi; bu modul faqat eski faylni o'qish uchun. Sxema avval ilova tomonidan yaratiladi
(`schema.ensure_all_schemas`), keyin har bir jadvalning umumiy ustunlari `COPY` bilan yoziladi. Fayl `site.sqlite3.migrated-…` nomi bilan saqlab qo'yiladi.
Qo'lda ishga tushirish: `python -m university.legacy_sqlite /yo'l/site.sqlite3`.
"""
from __future__ import annotations

import sqlite3
import sys
from datetime import datetime
from pathlib import Path

from .schema import ensure_all_schemas


def import_sqlite(path: Path, st, log=lambda m: print(m, flush=True)) -> dict:
    ensure_all_schemas(st)
    src = sqlite3.connect(path)
    stats: dict[str, int] = {}
    skipped: list[str] = []
    try:
        names = [r[0] for r in src.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")]
        # FTS5 ichki jadvallari (lib_fts_data, lib_fts_idx …) — matn qayta indekslanadi
        names = [n for n in names if not any(n.startswith(f"{b}_") for b in ("lib_fts",))]
        with st._tx():
            for t in names:
                if not st.db.has_table(t):
                    skipped.append(t)  # bu versiyada yo'q jadval
                    continue
                have = st.db.columns(t)
                cols = [r[1] for r in src.execute(f'PRAGMA table_info("{t}")')] or ["book_id", "src", "body"]
                cols = [c for c in cols if c in have]
                if not cols:
                    continue
                qc = ", ".join(f'"{c}"' for c in cols)
                st.db.execute(f'TRUNCATE "{t}"')
                stats[t] = st.db.copy_rows(t, cols, src.execute(f'SELECT {qc} FROM "{t}"'))  # oqim bilan — xotiraga yuklanmaydi
                if "id" in cols and st.db.execute("SELECT pg_get_serial_sequence(%s, 'id')", (t,)).fetchone()[0]:
                    st.db.reset_sequence(t)
            st.kv_invalidate()
    finally:
        src.close()
    path.rename(path.with_name(f"{path.name}.migrated-{datetime.now().strftime('%Y%m%d-%H%M%S')}"))
    msg = f"SQLite → PostgreSQL: {sum(stats.values())} qator, {len(stats)} jadval ko'chirildi"
    if skipped:
        msg += f"; bu versiyada yo'q jadvallar o'tkazib yuborildi: {', '.join(skipped)}"
    log(msg)
    return stats


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Foydalanish: python -m university.legacy_sqlite /yo'l/site.sqlite3")
        sys.exit(2)
    import os

    from .storage import Storage  # noqa: PLC0415

    import_sqlite(Path(sys.argv[1]), Storage(os.environ.get("SITE_DATA_DIR")))
