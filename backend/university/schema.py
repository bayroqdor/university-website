"""Butun sxema: har bir modul o'z jadvallarini o'zi yaratadi (ko'pi birinchi murojaatda). Ko'chirish va zaxiradan tiklashdan oldin
hammasi bir joyda yaratiladi — jadvallar asl turlari, kalitlari va indekslari bilan bo'ladi."""
from __future__ import annotations


def ensure_all_schemas(st) -> None:
    """Barcha modullarning jadvallari (ba'zilari odatda birinchi murojaatda yaratiladi) — ko'chirishdan oldin hammasi bo'lishi kerak."""
    from . import hemis, telegram  # noqa: PLC0415
    from .api import chat, grants  # noqa: PLC0415
    from .community import Community  # noqa: PLC0415
    from .desk import Desk  # noqa: PLC0415
    from .interactive import Store  # noqa: PLC0415
    from .library import Library  # noqa: PLC0415
    from .office import Docs  # noqa: PLC0415

    for make in (Community, Desk, Library, Store, Docs):
        make(st)
    for ensure in (hemis._cache_init, telegram.ensure_schema, chat.ensure_schema, grants.ensure_schema):  # noqa: SLF001
        ensure(st)
    from . import journal  # noqa: PLC0415

    journal.ensure_schema(st)
