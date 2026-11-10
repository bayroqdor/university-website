// ONLYOFFICE Docs: holat va api.js yuklash (faqat kabinet va admin paneli; ochiq sayt ONLYOFFICE'ni ishlatmaydi)
import { useEffect, useState } from "react";

export type OfficeStatus = { enabled: boolean; url: string; create: string[]; kinds: Record<string, string> };
export type DocKind = "word" | "cell" | "slide" | "pdf";

let statusP: Promise<OfficeStatus> | null = null;
export function officeStatus(): Promise<OfficeStatus> {
  if (!statusP)
    statusP = fetch("/api/office/status", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : { enabled: false, url: "", create: [], kinds: {} }))
      .catch(() => ({ enabled: false, url: "", create: [], kinds: {} }));
  return statusP;
}

export function useOfficeStatus(): OfficeStatus | null {
  const [s, setS] = useState<OfficeStatus | null>(null);
  useEffect(() => {
    let alive = true;
    officeStatus().then((x) => alive && setS(x));
    return () => {
      alive = false;
    };
  }, []);
  return s;
}

type DocsApiWin = Window & { DocsAPI?: { DocEditor: new (id: string, cfg: unknown) => { destroyEditor: () => void } } };
const loading: Record<string, Promise<void>> = {};

/** Document Server'ning api.js skripti (bir marta yuklanadi) */
export function loadDocsApi(server: string): Promise<void> {
  const base = server.replace(/\/$/, "");
  if ((window as DocsApiWin).DocsAPI) return Promise.resolve();
  if (!loading[base])
    loading[base] = new Promise<void>((res, rej) => {
      const s = document.createElement("script");
      s.src = `${base}/web-apps/apps/api/documents/api.js`;
      s.async = true;
      s.onload = () => ((window as DocsApiWin).DocsAPI ? res() : rej(new Error("no_docsapi")));
      s.onerror = () => {
        delete loading[base];
        s.remove();
        rej(new Error("docs_server_unreachable"));
      };
      document.head.appendChild(s);
    });
  return loading[base];
}

/** api.js ni oldindan yuklash: tahrirlagich konfiguratsiyasi so'ralayotgan paytda parallel yuklanadi (ketma-ket emas).
 *  Hujjatlar ro'yxatida ham chaqiriladi — foydalanuvchi hujjatni bosguncha skript tayyor turadi. */
export function preloadDocsApi(): void {
  officeStatus()
    .then((s) => (s.enabled ? loadDocsApi(s.url || "/office-ds") : undefined))
    .catch(() => null);
}

/** Telefon ekranida yengil mobil tahrirlagich (to'liq desktop interfeysi telefon uchun og'ir) */
export function uiType(): "mobile" | "desktop" {
  try {
    return window.matchMedia("(max-width: 720px)").matches ? "mobile" : "desktop";
  } catch {
    return "desktop";
  }
}

export function createEditor(placeholder: string, config: unknown) {
  const api = (window as DocsApiWin).DocsAPI;
  if (!api) throw new Error("no_docsapi");
  return new api.DocEditor(placeholder, config);
}

export function fmtSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export const OT = {
  uz: {
    docs: "Hujjatlar",
    docs_sub: "Word, Excel va PowerPoint hujjatlari — brauzerda yarating, tahrirlang va saqlang (ONLYOFFICE)",
    create: "Yaratish",
    upload: "Yuklash",
    choose_type: "Qanday hujjat yaratamiz?",
    t_docx: "Hujjat",
    t_xlsx: "Jadval",
    t_pptx: "Taqdimot",
    name: "Nomi",
    name_ph: "Masalan: Kurs ishi rejasi",
    empty: "Hali hujjat yo‘q",
    open: "Ochish",
    rename: "Nomini o‘zgartirish",
    download: "Yuklab olish",
    delete: "O‘chirish",
    delete_q: "Hujjat butunlay o‘chirilsinmi?",
    updated: "O‘zgartirilgan",
    starred: "Muhim",
    back: "Orqaga",
    off: "ONLYOFFICE hujjat serveri ulanmagan — hujjatlarni faqat yuklab olish mumkin. Administrator: admin → ONLYOFFICE.",
    loading: "Hujjat ochilmoqda…",
    unreachable: "Hujjat serveri javob bermadi. Bir oz kutib qayta urinib ko‘ring (server birinchi ishga tushishda 1–2 daqiqa tayyorlanadi).",
    all: "Barchasi",
    view_only: "faqat ko‘rish",
    edited_by: "tahrir",
  },
  ru: {
    docs: "Документы",
    docs_sub: "Документы Word, Excel и PowerPoint — создавайте, редактируйте и сохраняйте в браузере (ONLYOFFICE)",
    create: "Создать",
    upload: "Загрузить",
    choose_type: "Какой документ создать?",
    t_docx: "Документ",
    t_xlsx: "Таблица",
    t_pptx: "Презентация",
    name: "Название",
    name_ph: "Например: План курсовой работы",
    empty: "Документов пока нет",
    open: "Открыть",
    rename: "Переименовать",
    download: "Скачать",
    delete: "Удалить",
    delete_q: "Удалить документ безвозвратно?",
    updated: "Изменён",
    starred: "Важное",
    back: "Назад",
    off: "Сервер документов ONLYOFFICE не подключён — документы можно только скачать. Администратору: админ → ONLYOFFICE.",
    loading: "Документ открывается…",
    unreachable: "Сервер документов не ответил. Подождите немного и повторите (при первом запуске подготовка занимает 1–2 минуты).",
    all: "Все",
    view_only: "только просмотр",
    edited_by: "правка",
  },
  en: {
    docs: "Documents",
    docs_sub: "Word, Excel and PowerPoint documents — create, edit and save right in the browser (ONLYOFFICE)",
    create: "Create",
    upload: "Upload",
    choose_type: "What would you like to create?",
    t_docx: "Document",
    t_xlsx: "Spreadsheet",
    t_pptx: "Presentation",
    name: "Name",
    name_ph: "e.g. Course paper plan",
    empty: "No documents yet",
    open: "Open",
    rename: "Rename",
    download: "Download",
    delete: "Delete",
    delete_q: "Delete this document permanently?",
    updated: "Updated",
    starred: "Starred",
    back: "Back",
    off: "The ONLYOFFICE document server is not connected — documents can only be downloaded. Administrators: admin → ONLYOFFICE.",
    loading: "Opening the document…",
    unreachable: "The document server did not respond. Please wait a moment and retry (on first start it needs 1–2 minutes).",
    all: "All",
    view_only: "view only",
    edited_by: "edited by",
  },
};
export type OfficeDict = (typeof OT)["uz"];
export const otOf = (lang: string): OfficeDict => (OT as Record<string, OfficeDict>)[lang] || OT.uz;
