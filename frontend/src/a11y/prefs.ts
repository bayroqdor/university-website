// Maxsus imkoniyatlar (zaif ko'radiganlar uchun versiya): sozlamalar ombori.
// Sozlamalar <html> ga data-a11y-* atributlari sifatida qo'yiladi, butun ko'rinish CSS orqali (styles/a11y.css) o'zgaradi.
// Birinchi chizilishdan oldin xuddi shu atributlarni index.html dagi kichik skript qo'yadi (miltillamasligi uchun):
// localStorage["a11y"] da faqat standartdan farq qiladigan qiymatlar saqlanadi, kalit = atribut nomi.
import { useSyncExternalStore } from "react";

export type Scheme = "default" | "hc-dark" | "hc-light" | "yellow" | "blue" | "gray";
export type FontChoice = "default" | "legible" | "dyslexic";
export type Images = "show" | "hide" | "gray";
export type Guide = "off" | "line" | "mask";

export interface Prefs {
  /** matn o'lchami, % */
  size: number;
  /** qatorlar, harflar, so'zlar oralig'i: 0 — standart, 1 — kengroq, 2 — eng keng (WCAG 1.4.12 qiymatlari) */
  line: number;
  letter: number;
  word: number;
  font: FontChoice;
  scheme: Scheme;
  images: Images;
  links: boolean;
  focus: boolean;
  cursor: boolean;
  guide: Guide;
  /** animatsiyalarni to'xtatish */
  still: boolean;
}

export const DEFAULTS: Prefs = {
  size: 100,
  line: 0,
  letter: 0,
  word: 0,
  font: "default",
  scheme: "default",
  images: "show",
  links: false,
  focus: false,
  cursor: false,
  guide: "off",
  still: false,
};

export const SIZES = [100, 125, 150, 175, 200] as const;
const KEY = "a11y";
const KEYS = Object.keys(DEFAULTS) as (keyof Prefs)[];

const ALLOWED: { [K in keyof Prefs]: readonly Prefs[K][] } = {
  size: SIZES,
  line: [0, 1, 2],
  letter: [0, 1, 2],
  word: [0, 1, 2],
  font: ["default", "legible", "dyslexic"],
  scheme: ["default", "hc-dark", "hc-light", "yellow", "blue", "gray"],
  images: ["show", "hide", "gray"],
  links: [false, true],
  focus: [false, true],
  cursor: [false, true],
  guide: ["off", "line", "mask"],
  still: [false, true],
};

function load(): Prefs {
  const p: Prefs = { ...DEFAULTS };
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "null") as Record<string, unknown> | null;
    if (raw && typeof raw === "object")
      for (const k of KEYS) {
        // saqlangan qiymat atribut ko'rinishida: "on" — true, sonlar — satr
        const v = raw[k];
        const cand = v === "on" ? true : typeof v === "string" && /^\d+$/.test(v) ? Number(v) : v;
        if ((ALLOWED[k] as readonly unknown[]).includes(cand)) (p as unknown as Record<string, unknown>)[k] = cand;
      }
  } catch {
    /* */
  }
  return p;
}

function attrValue(v: Prefs[keyof Prefs]): string {
  return v === true ? "on" : String(v);
}

/** <html> atributlari: standart qiymatlar atributsiz (CSS faqat o'zgartirilgan sozlamaga ta'sir qiladi) */
export function applyPrefs(p: Prefs, root: HTMLElement = document.documentElement) {
  let any = false;
  for (const k of KEYS) {
    const name = `data-a11y-${k}`;
    if (p[k] === DEFAULTS[k]) root.removeAttribute(name);
    else {
      any = true;
      root.setAttribute(name, attrValue(p[k]));
    }
  }
  root.toggleAttribute("data-a11y", any);
}

function save(p: Prefs) {
  try {
    const diff: Record<string, string> = {};
    for (const k of KEYS) if (p[k] !== DEFAULTS[k]) diff[k] = attrValue(p[k]);
    if (Object.keys(diff).length) localStorage.setItem(KEY, JSON.stringify(diff));
    else localStorage.removeItem(KEY);
  } catch {
    /* */
  }
}

let state: Prefs = typeof window === "undefined" ? DEFAULTS : load();
const subs = new Set<() => void>();

export function getPrefs(): Prefs {
  return state;
}

export function setPrefs(patch: Partial<Prefs>) {
  state = { ...state, ...patch };
  applyPrefs(state);
  save(state);
  subs.forEach((f) => f());
}

export function resetPrefs() {
  setPrefs({ ...DEFAULTS });
}

export function isCustomised(p: Prefs = state): boolean {
  return KEYS.some((k) => p[k] !== DEFAULTS[k]);
}

function subscribe(f: () => void) {
  subs.add(f);
  return () => {
    subs.delete(f);
  };
}

export function usePrefs(): Prefs {
  return useSyncExternalStore(subscribe, getPrefs, () => DEFAULTS);
}

/* ------------------------------------------------------------------ tizim sozlamalari (OS) */
function mq(q: string): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.(q).matches;
}
function useMedia(q: string): boolean {
  return useSyncExternalStore(
    (f) => {
      const m = window.matchMedia?.(q);
      m?.addEventListener?.("change", f);
      return () => m?.removeEventListener?.("change", f);
    },
    () => mq(q),
    () => false,
  );
}

export const systemReducedMotion = () => mq("(prefers-reduced-motion: reduce)");
export const useSystemReducedMotion = () => useMedia("(prefers-reduced-motion: reduce)");
export const useForcedColors = () => useMedia("(forced-colors: active)");

/** Harakat o'chirilganmi: tizimda «harakatni kamaytirish» yoki panelda «animatsiyani to'xtatish» */
export function motionReduced(): boolean {
  return state.still || systemReducedMotion();
}

/** React komponentlar uchun: panel yoki tizim harakatni o'chirgan bo'lsa true */
export function useMotionReduced(): boolean {
  const p = usePrefs();
  const sys = useSystemReducedMotion();
  return p.still || sys;
}

/* ------------------------------------------------------------------ panelni ochish (sarlavhadagi tugma, klaviatura, havola) */
export const OPEN_EVENT = "a11y:open";
export function openA11yPanel() {
  window.dispatchEvent(new CustomEvent(OPEN_EVENT));
}

/** Panelni ochish uchun klaviatura birikmasi (barcha sahifalarda ishlaydi) */
export const SHORTCUT = "Alt + Shift + A";
