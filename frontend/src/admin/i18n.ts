// Boshqaruv paneli tili (uz / ru / en). Panel matnlari o'zbekcha yozilgan; tanlangan tilda ko'rsatish uchun
// sahifadagi matnlar (va placeholder / title / aria-label) lug'at bo'yicha almashtiriladi — komponentlar o'zgarmaydi.
// Foydalanuvchi kiritgan kontent (muharrir, input qiymatlari, xat matnlari) tegilmaydi: faqat lug'atdagi aniq UI matnlari tarjima qilinadi.
import DICT from "./i18n-dict.json";
import CAREER_DICT from "./i18n-career.json"; // hamkorlik va karyera bo'limlari (umumiy lug'at ustun)

export type AdminLang = "uz" | "ru" | "en";
type Tr = { ru: string; en: string };
const dict = { ...(CAREER_DICT as Record<string, Tr>), ...(DICT as Record<string, Tr>) };

const KEY = "admin_lang";
export const ADMIN_LANGS: { id: AdminLang; label: string }[] = [
  { id: "uz", label: "UZ" },
  { id: "ru", label: "RU" },
  { id: "en", label: "EN" },
];

export function getAdminLang(): AdminLang {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "ru" || v === "en" || v === "uz") return v;
  } catch {
    /* */
  }
  return "uz";
}

export function setAdminLang(l: AdminLang) {
  try {
    localStorage.setItem(KEY, l);
  } catch {
    /* */
  }
}

const norm = (s: string) => s.replace(/\s+/g, " ").trim();
// tutuq belgilari turlicha yozilgan bo'lishi mumkin
const loose = (s: string) => norm(s).replace(/[ʻʼ'`‘’]/g, "'");
const exact = new Map<string, Tr>();
const looseMap = new Map<string, Tr>();
const patterns: { re: RegExp; tr: Tr }[] = [];
for (const [k, v] of Object.entries(dict)) {
  if (k.includes("{}")) {
    const src = norm(k)
      .split("{}")
      .map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/[ʻʼ'`‘’]/g, "[ʻʼ'`‘’]"))
      .join("(.+?)");
    if (src.replace(/\(\.\+\?\)/g, "").trim().length >= 2) patterns.push({ re: new RegExp(`^${src}$`), tr: v });
  } else {
    exact.set(norm(k), v);
    looseMap.set(loose(k), v);
  }
}

/** Bitta matnni tarjima qilish (topilmasa — null). */
export function translate(text: string, lang: AdminLang): string | null {
  if (lang === "uz") return null;
  const n = norm(text);
  if (n.length < 2 || !/[A-Za-z]/.test(n)) return null;
  const hit = exact.get(n) || looseMap.get(loose(n));
  if (hit) return hit[lang];
  if (!/\d|«|»|"/.test(n) && n.length > 120) return null;
  for (const p of patterns) {
    const m = p.re.exec(n);
    if (m) {
      let i = 1;
      return p.tr[lang].replace(/\{\}/g, () => m[i++] ?? "");
    }
  }
  return null;
}

/** Komponent ichida: t("O‘zbekcha matn") — tanlangan tilga. */
export function at(text: string, lang: AdminLang = getAdminLang()): string {
  return translate(text, lang) ?? text;
}

/* ------------------------------------------------------------------ DOM tarjimon */
const ATTRS = ["placeholder", "title", "aria-label"] as const;
const SKIP = "[data-no-tr], .ProseMirror, [contenteditable='true'], textarea, code, pre, .mono-src, .sd-text, .mail-body, .rich-html";
type Orig = { src: string; out: string };
const textOrig = new WeakMap<Text, Orig>();
const attrOrig = new WeakMap<Element, Record<string, Orig>>();

function skipped(el: Element | null): boolean {
  return !!el?.closest(SKIP);
}

function doText(node: Text, lang: AdminLang) {
  const v = node.nodeValue || "";
  if (!v.trim()) return;
  let o = textOrig.get(node);
  if (o && v === o.out) return; // o'zimiz qo'ygan tarjima
  if (!o || v !== o.out) o = { src: v, out: v }; // React yangi matn qo'ydi — bu yangi asl matn
  if (skipped(node.parentElement)) return;
  const tr = translate(o.src, lang);
  const lead = o.src.match(/^\s*/)?.[0] || "";
  const trail = o.src.match(/\s*$/)?.[0] || "";
  const out = tr == null ? o.src : lead + tr + trail;
  o.out = out;
  textOrig.set(node, o);
  if (node.nodeValue !== out) node.nodeValue = out;
}

function doAttrs(el: Element, lang: AdminLang) {
  if (skipped(el)) return;
  let rec = attrOrig.get(el);
  for (const a of ATTRS) {
    const v = el.getAttribute(a);
    if (v == null || !v.trim()) continue;
    rec ||= {};
    let o = rec[a];
    if (!o || v !== o.out) o = { src: v, out: v };
    const tr = translate(o.src, lang);
    o.out = tr ?? o.src;
    rec[a] = o;
    if (v !== o.out) el.setAttribute(a, o.out);
  }
  if (rec) attrOrig.set(el, rec);
}

function walk(root: Node, lang: AdminLang) {
  if (root.nodeType === Node.TEXT_NODE) return doText(root as Text, lang);
  if (root.nodeType !== Node.ELEMENT_NODE) return;
  const el = root as Element;
  if (skipped(el)) return;
  doAttrs(el, lang);
  const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let n = w.nextNode();
  while (n) {
    if (n.nodeType === Node.TEXT_NODE) doText(n as Text, lang);
    else doAttrs(n as Element, lang);
    n = w.nextNode();
  }
}

/** Panel ishlayotgan vaqtda: hujjatdagi barcha yangi va o'zgargan matnlarni tanlangan tilga o'giradi. Qaytaradi: to'xtatish funksiyasi. */
export function startTranslator(lang: AdminLang): () => void {
  document.documentElement.lang = lang;
  walk(document.body, lang);
  if (lang === "uz") {
    return () => undefined;
  }
  let busy = false;
  const obs = new MutationObserver((list) => {
    if (busy) return;
    busy = true;
    try {
      for (const m of list) {
        if (m.type === "characterData") doText(m.target as Text, lang);
        else if (m.type === "attributes") doAttrs(m.target as Element, lang);
        else m.addedNodes.forEach((n) => walk(n, lang));
      }
    } finally {
      obs.takeRecords();
      busy = false;
    }
  });
  obs.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: [...ATTRS] });
  return () => obs.disconnect();
}
