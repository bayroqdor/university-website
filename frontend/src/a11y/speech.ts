// Ovozli o'qish (Web Speech API, speechSynthesis): sahifaning asosiy qismini (menyu va pastki qismsiz) bo'lakma-bo'lak o'qiydi,
// o'qilayotgan bo'lakni ajratib ko'rsatadi va ekranga olib keladi. Pauza — joriy bo'lakni eslab qolib to'xtatish
// (brauzerlardagi pause()/resume() Android va Chrome'da ishonchsiz), «Davom ettirish» — o'sha bo'lakdan qayta boshlash.
import { useSyncExternalStore } from "react";
import { motionReduced } from "./prefs";
import { pageLang, type A11yLang } from "./i18n";

export type SpeechStatus = "idle" | "playing" | "paused";
interface Chunk {
  el: HTMLElement | null;
  text: string;
}
interface State {
  status: SpeechStatus;
  rate: number;
  /** foydalanuvchi tanlagan ovoz (til bo'yicha), bo'sh — avtomatik */
  voices: Partial<Record<A11yLang, string>>;
}

const KEY = "a11y-tts";
export const RATES = [0.75, 1, 1.25, 1.5, 1.75] as const;

export const ttsSupported = (): boolean => typeof window !== "undefined" && "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined";

function loadState(): State {
  const s: State = { status: "idle", rate: 1, voices: {} };
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "null") as Partial<State> | null;
    if (raw && typeof raw.rate === "number" && raw.rate >= 0.5 && raw.rate <= 2) s.rate = raw.rate;
    if (raw && raw.voices && typeof raw.voices === "object") s.voices = raw.voices;
  } catch {
    /* */
  }
  return s;
}

let state: State = typeof window === "undefined" ? { status: "idle", rate: 1, voices: {} } : loadState();
const subs = new Set<() => void>();
function emit(patch: Partial<State>) {
  state = { ...state, ...patch };
  subs.forEach((f) => f());
}
function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify({ rate: state.rate, voices: state.voices }));
  } catch {
    /* */
  }
}
export function useSpeech(): State {
  return useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => state,
    () => state,
  );
}

/* ------------------------------------------------------------------ ovozlar */
let voiceCache: SpeechSynthesisVoice[] = [];
const voiceSubs = new Set<() => void>();
function refreshVoices() {
  if (!ttsSupported()) return;
  const v = window.speechSynthesis.getVoices();
  if (v.length !== voiceCache.length || v.some((x, i) => x.voiceURI !== voiceCache[i]?.voiceURI)) {
    voiceCache = v;
    voiceSubs.forEach((f) => f());
  }
}
if (ttsSupported()) {
  refreshVoices();
  window.speechSynthesis.addEventListener?.("voiceschanged", refreshVoices);
}
export function useVoices(): SpeechSynthesisVoice[] {
  return useSyncExternalStore(
    (f) => {
      voiceSubs.add(f);
      refreshVoices();
      return () => voiceSubs.delete(f);
    },
    () => voiceCache,
    () => voiceCache,
  );
}

/** O'zbek ovozi bo'lmasa — eng yaqin: turk (lotin yozuvi, turkiy til), keyin rus */
const FALLBACK: Record<A11yLang, string[]> = { uz: ["uz", "tr", "kk", "ru"], ru: ["ru"], en: ["en"] };

export function voicesFor(lang: A11yLang, all: SpeechSynthesisVoice[] = voiceCache): SpeechSynthesisVoice[] {
  return all.filter((v) => v.lang.toLowerCase().replace("_", "-").startsWith(lang));
}

export function pickVoice(lang: A11yLang, all: SpeechSynthesisVoice[] = voiceCache): { voice: SpeechSynthesisVoice | null; exact: boolean } {
  const chosen = state.voices[lang];
  if (chosen) {
    const v = all.find((x) => x.voiceURI === chosen);
    if (v) return { voice: v, exact: v.lang.toLowerCase().startsWith(lang) };
  }
  for (const code of FALLBACK[lang]) {
    const list = voicesFor(code as A11yLang, all);
    if (list.length) {
      // tabiiy (neural) ovozlar odatda aniqroq
      const best = list.find((v) => /natural|neural|online/i.test(v.name)) || list.find((v) => v.localService) || list[0];
      return { voice: best, exact: code === lang };
    }
  }
  return { voice: null, exact: false };
}

export function setRate(rate: number) {
  emit({ rate });
  persist();
  if (state.status === "playing") restartCurrent();
}
export function setVoice(lang: A11yLang, uri: string) {
  emit({ voices: { ...state.voices, [lang]: uri || undefined } });
  persist();
  if (state.status === "playing") restartCurrent();
}

/* ------------------------------------------------------------------ o'qiladigan bo'laklar */
const BLOCKS = "h1,h2,h3,h4,h5,h6,p,li,blockquote,figcaption,dt,dd,th,td,caption,summary,pre";
const SKIP = "nav,footer,aside,[aria-hidden='true'],[hidden],script,style,noscript,template,button,select,textarea,.a11y-noread,.toc,.share,.cw,.ck,.pop-root";

function visible(el: HTMLElement): boolean {
  if (!el.getClientRects().length) return false;
  const cs = getComputedStyle(el);
  return cs.visibility !== "hidden" && cs.display !== "none";
}

function mainRoot(): HTMLElement {
  return (document.querySelector("main#main") || document.querySelector("main") || document.body) as HTMLElement;
}

/** Ekranda ko'rinadigan matn: aria-hidden qismlar (masalan, harflarga bo'lingan sarlavha nusxasi) tashlab yuboriladi */
function textOf(el: HTMLElement): string {
  if (!el.querySelector("[aria-hidden='true']")) return (el.innerText || "").replace(/\s+/g, " ").trim();
  const c = el.cloneNode(true) as HTMLElement;
  c.querySelectorAll("[aria-hidden='true']").forEach((n) => n.remove());
  return (c.textContent || "").replace(/\s+/g, " ").trim();
}

/** Sahifadan o'qiladigan bloklar: eng ichki matnli bloklar (li ichidagi p kabi takrorlanmasin), rasmlar — tavsifi bilan */
export function collectBlocks(root: HTMLElement = mainRoot(), imgLabel = ""): Chunk[] {
  const out: Chunk[] = [];
  const candidates = Array.from(root.querySelectorAll<HTMLElement>(`${BLOCKS},img[alt]`));
  for (const el of candidates) {
    if (el.closest(SKIP) && !root.matches(SKIP)) continue;
    if (el.tagName === "IMG") {
      // faqat maqola ichidagi rasmlar (kartalardagi rasmlar sarlavhani takrorlaydi)
      const alt = (el.getAttribute("alt") || "").trim();
      const fig = el.closest("figure");
      if (!imgLabel || !alt || !(fig || el.closest(".post-content")) || fig?.querySelector("figcaption")) continue;
      if (out.some((c) => c.text.includes(alt))) continue; // tavsif sarlavhani takrorlasa — o'qilmaydi
      const sib = el.nextElementSibling as HTMLElement | null;
      out.push({ el: sib?.classList.contains("a11y-alt") ? sib : visible(el) ? el : null, text: `${imgLabel}: ${alt}` });
      continue;
    }
    if (el.querySelector(BLOCKS)) continue; // ichida boshqa blok bor — o'shalari o'qiladi
    if (!visible(el) || el.classList.contains("a11y-sr")) continue;
    const text = textOf(el);
    if (text.length < 2) continue;
    out.push({ el, text });
  }
  return out;
}

/** Uzun matnni gaplarga bo'lish (Chrome uzun matnni ~15 soniyadan keyin uzib qo'yadi) */
function split(text: string, max = 220): string[] {
  if (text.length <= max) return [text];
  const parts = text.match(/[^.!?…;:]+[.!?…;:]*\s*/g) || [text];
  const out: string[] = [];
  let buf = "";
  for (const p of parts) {
    if ((buf + p).length > max && buf) {
      out.push(buf.trim());
      buf = "";
    }
    if (p.length > max) {
      // juda uzun gap — vergul yoki bo'shliq bo'yicha
      let rest = p;
      while (rest.length > max) {
        const cut = Math.max(rest.lastIndexOf(", ", max), rest.lastIndexOf(" ", max));
        const at = cut > max / 2 ? cut + 1 : max;
        out.push(rest.slice(0, at).trim());
        rest = rest.slice(at);
      }
      buf = rest;
    } else buf += p;
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}

/* ------------------------------------------------------------------ o'qish */
let queue: Chunk[] = [];
let pos = 0;
let gen = 0; // eski utterance hodisalari yangi o'qishga xalaqit bermasin
let litEl: HTMLElement | null = null;
const LIT = "a11y-speaking";

function light(el: HTMLElement | null) {
  if (litEl === el) return;
  litEl?.classList.remove(LIT);
  litEl = el;
  if (!el) return;
  el.classList.add(LIT);
  const r = el.getBoundingClientRect();
  if (r.top < 90 || r.bottom > window.innerHeight - 90) el.scrollIntoView({ block: "center", behavior: motionReduced() ? "auto" : "smooth" });
  window.dispatchEvent(new CustomEvent("a11y:reading", { detail: el }));
}

function speakAt(i: number) {
  const synth = window.speechSynthesis;
  const my = ++gen;
  if (i >= queue.length) {
    stop();
    return;
  }
  pos = i;
  const c = queue[i];
  light(c.el);
  const lang = pageLang();
  const { voice } = pickVoice(lang);
  const u = new SpeechSynthesisUtterance(c.text);
  u.lang = voice?.lang || { uz: "uz-UZ", ru: "ru-RU", en: "en-GB" }[lang];
  try {
    if (voice) u.voice = voice;
  } catch {
    /* ovozni tanlab bo'lmasa — til bo'yicha brauzer o'zi tanlaydi */
  }
  u.rate = state.rate;
  u.onend = () => {
    if (my === gen && state.status === "playing") speakAt(pos + 1);
  };
  u.onerror = (e) => {
    if (my !== gen || e.error === "interrupted" || e.error === "canceled") return;
    if (state.status === "playing") speakAt(pos + 1);
  };
  synth.speak(u);
}

function restartCurrent() {
  if (!ttsSupported()) return;
  gen++;
  window.speechSynthesis.cancel();
  const at = pos;
  window.setTimeout(() => state.status === "playing" && speakAt(at), 60);
}

function startQueue(chunks: Chunk[]) {
  if (!ttsSupported() || !chunks.length) return false;
  gen++;
  window.speechSynthesis.cancel();
  queue = chunks.flatMap((c) => split(c.text).map((text) => ({ el: c.el, text })));
  pos = 0;
  emit({ status: "playing" });
  // cancel() dan keyin darhol speak() ba'zi brauzerlarda yutilib ketadi
  window.setTimeout(() => state.status === "playing" && speakAt(0), 60);
  return true;
}

export function readPage(root?: HTMLElement, imgLabel = ""): boolean {
  return startQueue(collectBlocks(root || mainRoot(), imgLabel));
}

export function readText(text: string): boolean {
  const t = text.replace(/\s+/g, " ").trim();
  return t ? startQueue([{ el: null, text: t }]) : false;
}

export function pause() {
  if (state.status !== "playing") return;
  gen++;
  window.speechSynthesis.cancel();
  emit({ status: "paused" });
}

export function resume() {
  if (state.status !== "paused") return;
  emit({ status: "playing" });
  speakAt(pos);
}

export function stop() {
  gen++;
  if (ttsSupported()) window.speechSynthesis.cancel();
  light(null);
  queue = [];
  pos = 0;
  if (state.status !== "idle") emit({ status: "idle" });
}

/** Oldingi / keyingi bo'lak (o'yinchi panelidagi tugmalar) */
export function skip(delta: number) {
  if (state.status === "idle" || !queue.length) return;
  // shu element bo'laklarini o'tkazib yuborish
  let i = pos;
  const el = queue[pos]?.el;
  if (delta > 0) while (i < queue.length - 1 && queue[i].el === el && el) i++;
  else {
    while (i > 0 && queue[i - 1].el === el && el) i--;
    if (i > 0) {
      i--;
      const prevEl = queue[i].el;
      while (i > 0 && queue[i - 1].el === prevEl && prevEl) i--;
    }
  }
  if (delta > 0 && i === pos) i = pos + 1;
  gen++;
  window.speechSynthesis.cancel();
  if (state.status === "paused") {
    pos = Math.max(0, Math.min(queue.length - 1, i));
    light(queue[pos]?.el || null);
    return;
  }
  window.setTimeout(() => speakAt(Math.max(0, i)), 60);
}

if (typeof window !== "undefined") {
  // sahifadan chiqilganda yoki boshqa sahifaga o'tilganda ovoz to'xtaydi
  window.addEventListener("pagehide", () => stop());
}
