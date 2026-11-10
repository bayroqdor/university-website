"""/accessibility — «Maxsus imkoniyatlar bayonoti»: server tomonidagi sarlavha, tavsif va sayt xaritasi yozuvi.
Sahifaning o'zi statik (frontend/src/a11y/Statement.tsx); bu yerda faqat seo.EXTRA_PAGES ga ro'yxatdan o'tkaziladi,
shunda sahifa 404 emas, 200 holat va to'g'ri <title> bilan beriladi."""

from __future__ import annotations

from . import seo

PATH = "/accessibility"
UPDATED = "2026-10-12"

TITLE = {"uz": "Maxsus imkoniyatlar bayonoti", "ru": "Заявление о доступности", "en": "Accessibility statement"}
DESC = {
    "uz": "Saytning maxsus imkoniyatlari: WCAG 2.2 AA maqsadi, zaif ko‘radiganlar uchun panel (matn o‘lchami, yuqori kontrast, "
          "shriftlar, ovozli o‘qish), klaviatura birikmalari, ma’lum cheklovlar va murojaat yo‘li.",
    "ru": "Доступность сайта: цель — WCAG 2.2 AA, версия для слабовидящих (размер текста, высокий контраст, шрифты, озвучивание), "
          "сочетания клавиш, известные ограничения и обратная связь.",
    "en": "Website accessibility: WCAG 2.2 AA target, the accessibility panel (text size, high contrast, fonts, text to speech), "
          "keyboard shortcuts, known limitations and how to give feedback.",
}


def seo_page(svc, path: str, lang: str) -> dict:
    lang = lang if lang in TITLE else "uz"
    return {"title": TITLE[lang], "description": DESC[lang], "text": DESC[lang], "links": [], "jsonld": [], "lastmod": UPDATED}


seo.EXTRA_PAGES[PATH] = seo_page
