"""Mavjud baza yangilanishi va eski SQLite bazadan ko'chirish + zaxira/tiklash."""
from __future__ import annotations

import os
from pathlib import Path

from university import content as C


def test_migration_preserves_admin_edits(tmp_path):
    """Qayta ishga tushganda admin tahrir qilgan sahifa va menyu saqlanadi."""
    from university.service import Service

    os.environ["SITE_DEMO_ACADEMIC"] = "0"
    os.environ["SITE_ADMIN_PASSWORD"] = "Test-admin-9"
    s = Service(tmp_path)
    about = next(x for x in s.st.list_items("page") if x.get("slug") == "about-university")
    s.st.patch_item_data(about["id"], title="O'zgartirilgan sarlavha")
    s.st.kv_put("site", {"title": "MyUni", "menu": [{"label": "Dasturlar", "url": "/programs", "children": []}]})
    s2 = Service(tmp_path)
    about2 = next(x for x in s2.st.list_items("page") if x.get("slug") == "about-university")
    assert about2["title"] == "O'zgartirilgan sarlavha"
    assert s2.st.kv_get("site")["title"] == "MyUni"
    assert C.SEED_VERSION >= 1


def test_legacy_sqlite_import_and_backup_restore(tmp_path, monkeypatch):
    """Eski (SQLite davridagi) o'rnatish: `site.sqlite3` bir marta PostgreSQL'ga ko'chiriladi; zaxira (CSV, COPY) va tiklash."""
    import sqlite3

    monkeypatch.setenv("SITE_DEMO_ACADEMIC", "0")
    from university import backup
    from university.community import Community
    from university.storage import Storage

    # 1) eski SQLite fayli (avvalgi versiya sxemasining bir qismi)
    old = sqlite3.connect(tmp_path / "site.sqlite3")
    old.executescript("""
        CREATE TABLE kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);
        CREATE TABLE users (id TEXT PRIMARY KEY, login TEXT NOT NULL UNIQUE, name TEXT NOT NULL, email TEXT, role TEXT NOT NULL DEFAULT 'student',
            group_id TEXT, active INTEGER NOT NULL DEFAULT 1, pw_hash TEXT NOT NULL, created TEXT NOT NULL, last_login TEXT, data TEXT NOT NULL DEFAULT '{}',
            old_unused TEXT);
        CREATE TABLE email_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL, kind TEXT NOT NULL, recipient TEXT NOT NULL,
            subject TEXT, status TEXT NOT NULL, error TEXT);
        CREATE TABLE grant_apps (id TEXT PRIMARY KEY, full_name TEXT NOT NULL, course TEXT NOT NULL, group_name TEXT NOT NULL, field TEXT NOT NULL,
            edu_lang TEXT NOT NULL, phone TEXT NOT NULL, email TEXT, reason TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'new', note TEXT, ip TEXT,
            created TEXT NOT NULL, updated TEXT NOT NULL);
        INSERT INTO grant_apps(id, full_name, course, group_name, field, edu_lang, phone, reason, created, updated)
            VALUES ('g1', 'Ariza Egasi', '2', 'B-21', 'Iqtisodiyot', 'uz', '+998901234567', 'sabab', '2024-01-01', '2024-01-01');
        INSERT INTO kv VALUES ('hello', '{"x": 1}');
        INSERT INTO users(id, login, name, email, role, active, pw_hash, created, data) VALUES ('u1', 'eski.talaba', 'Eski Talaba', '', 'student', 1, 'x', '2024-01-01', '{}');
        INSERT INTO email_log(ts, kind, recipient, status) VALUES ('2024-01-01', 'test', 'a@b.c', 'sent'), ('2024-01-02', 'test', 'a@b.c', 'sent');
    """)
    old.commit()
    old.close()

    # 2) PostgreSQL bilan birinchi ishga tushish — ma'lumotlar o'zi ko'chadi
    st = Storage(tmp_path)
    assert not (tmp_path / "site.sqlite3").exists() and list(tmp_path.glob("site.sqlite3.migrated-*"))
    assert st.kv_get("hello") == {"x": 1}
    assert st.get_user("u1")["login"] == "eski.talaba"
    assert st._one("SELECT full_name FROM grant_apps WHERE id='g1'") == "Ariza Egasi"  # noqa: SLF001
    st.log_email("test", "a@b.c", "s", "sent")
    assert st._one("SELECT MAX(id) FROM email_log") == 3  # noqa: SLF001
    cm = Community(st)
    cm.save_post("u1", {"title": "PostgreSQL'dagi yozuv", "body": "<p>Yangi</p>"})

    # 3) zaxira: har bir jadval CSV (bitta snapshot tranzaksiyada), keyin tiklash
    dest = backup.make(st, "2099-01-01")
    assert (dest / "db" / "users.csv").exists() and (dest / "db" / "tables.json").exists()
    st.kv_put("hello", {"x": 2})
    cm.save_post("u1", {"title": "Zaxiradan keyingi yozuv", "body": "<p>Zaxira nusxadan keyin yozilgan matn.</p>"})
    stats = backup.restore_db(st, dest)
    assert stats["blog_posts"] == 1 and st.kv_get("hello") == {"x": 1}
    st.log_email("test", "a@b.c", "s", "sent")
