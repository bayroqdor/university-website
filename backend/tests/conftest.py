"""Testlar PostgreSQL'da ishlaydi (ilova faqat PostgreSQL bilan ishlaydi):

    SITE_TEST_PG_URL=postgresql://user@127.0.0.1:5432/site_test pytest -q

Har bir test moduli (ma'lumotlar papkasi) alohida PostgreSQL sxemasida ishlaydi; eski test sxemalari boshida o'chiriladi.
"""
from __future__ import annotations

import os

import pytest

os.environ.setdefault("SITE_LIBRARY_SEED", "0")  # testlarda ochiq fond internetdan yuklanmaydi
os.environ.setdefault("SITE_GDRIVE_WARM", "0")  # testlarda Drive arxivlari oldindan yuklanmaydi
PG = (os.environ.get("SITE_TEST_PG_URL") or "").strip()
if not PG:
    pytest.exit("PostgreSQL test bazasi kerak: SITE_TEST_PG_URL=postgresql://user@host:5432/site_test pytest -q", returncode=2)
os.environ["SITE_DATABASE_URL"] = PG
os.environ["SITE_DATABASE_SCHEMA"] = "auto"
os.environ.setdefault("SITE_DATABASE_POOL", "6")

import psycopg  # noqa: E402

with psycopg.connect(PG, autocommit=True) as _c:
    for (_name,) in _c.execute("SELECT nspname FROM pg_namespace WHERE nspname LIKE 't\\_%'").fetchall():
        _c.execute(f'DROP SCHEMA "{_name}" CASCADE')
