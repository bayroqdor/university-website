// Maxsus imkoniyatlar: barcha sahifalarda (sayt, kabinetlar, admin) bitta marta ulanadi (main.tsx).
// Panel, Alt+Shift+A birikmasi, o'qish chizg'ichi / niqobi, rasm o'rnida tavsif, ovozli o'qish paneli.
import { Pause, Play, SkipBack, SkipForward, Square } from "lucide-react";
import { useEffect, useRef, useState, type RefObject } from "react";
import { useLocation } from "react-router-dom";
import "../styles/a11y.css";
import { useA11yT } from "./i18n";
import { A11yPanel, UniversalAccessIcon } from "./Panel";
import { applyPrefs, getPrefs, isCustomised, OPEN_EVENT, openA11yPanel, SHORTCUT, usePrefs } from "./prefs";
import { pause, readPage, resume, skip, stop, useSpeech } from "./speech";

// index.html dagi skript qo'ymagan bo'lsa ham (masalan, eski kesh) — sozlamalar darhol qo'llanadi
if (typeof document !== "undefined") applyPrefs(getPrefs());

/* ------------------------------------------------------------------ o'qish chizg'ichi va niqob */
function ReadingGuide({ mode }: { mode: "line" | "mask" }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0;
    let y = window.innerHeight / 3;
    const put = () => {
      raf = 0;
      box.current?.style.setProperty("--a11y-gy", `${Math.round(y)}px`);
    };
    const at = (ny: number) => {
      y = Math.max(0, Math.min(window.innerHeight, ny));
      if (!raf) raf = requestAnimationFrame(put);
    };
    const move = (e: PointerEvent) => e.pointerType !== "touch" && at(e.clientY);
    const touch = (e: TouchEvent) => e.touches[0] && at(e.touches[0].clientY - 40);
    // klaviatura: fokuslangan element yoki ovozli o'qilayotgan bo'lak markaziga
    const toEl = (el: Element | null) => {
      if (!el || !(el instanceof HTMLElement) || el === document.body) return;
      const r = el.getBoundingClientRect();
      if (r.height) at(r.top + Math.min(r.height, 120) / 2);
    };
    const focus = (e: FocusEvent) => toEl(e.target as Element);
    const reading = (e: Event) => window.setTimeout(() => toEl((e as CustomEvent).detail as Element), 350);
    put();
    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("touchmove", touch, { passive: true });
    document.addEventListener("focusin", focus);
    window.addEventListener("a11y:reading", reading);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("touchmove", touch);
      document.removeEventListener("focusin", focus);
      window.removeEventListener("a11y:reading", reading);
    };
  }, []);
  return (
    <div ref={box} className={`a11y-guide ${mode}`} aria-hidden>
      {mode === "mask" ? (
        <>
          <i className="a11y-mask-t" />
          <i className="a11y-mask-b" />
        </>
      ) : (
        <i className="a11y-line" />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ rasmlar yashirilganda — o'rnida tavsif (alt) */
const ALT = "a11y-alt";
function useAltText(on: boolean, label: string) {
  useEffect(() => {
    const clear = () => document.querySelectorAll(`.${ALT}`).forEach((s) => s.remove());
    if (!on) {
      clear();
      return;
    }
    let raf = 0;
    const scan = () => {
      raf = 0;
      // egasi o'chib ketgan tavsiflar
      document.querySelectorAll<HTMLElement>(`.${ALT}`).forEach((s) => {
        const img = s.previousElementSibling;
        if (!img || img.tagName !== "IMG" || (img.getAttribute("alt") || "").trim() !== s.dataset.alt) s.remove();
      });
      document.querySelectorAll<HTMLImageElement>("body img[alt]").forEach((img) => {
        const alt = (img.getAttribute("alt") || "").trim();
        if (!alt || img.closest("[aria-hidden='true'], .a11y-dlg, .a11y-keep, .ub, .ft") || img.width === 1) return;
        const sib = img.nextElementSibling as HTMLElement | null;
        if (sib?.classList.contains(ALT)) return;
        const s = document.createElement("span");
        s.className = ALT;
        s.dataset.alt = alt;
        s.setAttribute("role", "img");
        s.setAttribute("aria-label", `${label}: ${alt}`);
        s.textContent = alt;
        img.after(s);
      });
    };
    const queue = () => {
      if (!raf) raf = requestAnimationFrame(scan);
    };
    scan();
    const mo = new MutationObserver((list) => {
      // o'zimiz qo'shgan tavsiflar yana kuzatuvni ishga tushirmasin
      if (list.every((m) => Array.from(m.addedNodes).every((n) => n instanceof HTMLElement && n.classList.contains(ALT)) && !m.removedNodes.length && m.type === "childList")) return;
      queue();
    });
    mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["alt", "src"] });
    return () => {
      mo.disconnect();
      cancelAnimationFrame(raf);
      clear();
    };
  }, [on, label]);
}

/* ------------------------------------------------------------------ ovozli o'qish paneli (o'qish davomida ekranning pastida) */
function Player() {
  const t = useA11yT();
  const sp = useSpeech();
  if (sp.status === "idle") return null;
  const playing = sp.status === "playing";
  return (
    <div className="a11y-player" role="region" aria-label={t.reading}>
      <span className="a11y-player-t">
        <UniversalAccessIcon size={18} />
        {t.reading}
      </span>
      <button type="button" onClick={() => skip(-1)} aria-label={t.prev} title={t.prev}>
        <SkipBack size={20} aria-hidden />
      </button>
      <button type="button" className="main" onClick={() => (playing ? pause() : resume())} aria-label={playing ? t.pause : t.resume} title={playing ? t.pause : t.resume}>
        {playing ? <Pause size={20} aria-hidden /> : <Play size={20} aria-hidden />}
      </button>
      <button type="button" onClick={() => skip(1)} aria-label={t.next} title={t.next}>
        <SkipForward size={20} aria-hidden />
      </button>
      <button type="button" onClick={stop} aria-label={t.stop} title={t.stop}>
        <Square size={18} aria-hidden />
      </button>
    </div>
  );
}

export function A11yRoot() {
  const p = usePrefs();
  const t = useA11yT();
  const loc = useLocation();
  const [open, setOpen] = useState(false);
  const [selection, setSelection] = useState("");

  useEffect(() => {
    const show = () => {
      setSelection(window.getSelection()?.toString() || "");
      setOpen(true);
    };
    const key = (e: KeyboardEvent) => {
      // Alt+Shift+A (macOS: Option+Shift+A) — e.code klaviatura tartibiga bog'liq emas (kirill tartibida ham ishlaydi)
      if (e.altKey && e.shiftKey && !e.ctrlKey && !e.metaKey && e.code === "KeyA") {
        e.preventDefault();
        setOpen((o) => {
          if (!o) setSelection(window.getSelection()?.toString() || "");
          return !o;
        });
      }
    };
    window.addEventListener(OPEN_EVENT, show);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener(OPEN_EVENT, show);
      window.removeEventListener("keydown", key);
    };
  }, []);

  // boshqa sahifaga o'tilganda o'qish to'xtaydi va panel yopiladi
  useEffect(() => {
    stop();
    setOpen(false);
  }, [loc.pathname]);

  useAltText(p.images === "hide", t.img_alt);

  return (
    <>
      <A11yPanel open={open} onClose={() => setOpen(false)} selection={selection} />
      {p.guide !== "off" && <ReadingGuide key={p.guide} mode={p.guide} />}
      <Player />
    </>
  );
}

/* ------------------------------------------------------------------ panelni ochuvchi tugmalar */
/** Sayt sarlavhasidagi tugma: belgi + yozuv (tor ekranda faqat belgi, nom saqlanadi) */
export function A11yButton({ className = "", variant = "site" }: { className?: string; variant?: "site" | "md" }) {
  const t = useA11yT();
  const p = usePrefs();
  const on = isCustomised(p);
  return (
    <button
      type="button"
      className={`a11y-open ${variant} ${on ? "on" : ""} ${className}`}
      onClick={openA11yPanel}
      aria-haspopup="dialog"
      aria-keyshortcuts="Alt+Shift+A"
      title={`${t.title} (${SHORTCUT})`}
    >
      <UniversalAccessIcon size={variant === "md" ? 21 : 18} />
      <span className={variant === "md" ? "a11y-sr" : "a11y-open-t"}>{t.title}</span>
    </button>
  );
}

/** «Asosiy matnga o'tish» yonida ikkinchi o'tish havolasi — klaviatura bilan ikkinchi qadamda panel */
export function A11ySkip({ className = "" }: { className?: string }) {
  const t = useA11yT();
  return (
    <button type="button" className={`a11y-skip ${className}`} onClick={openA11yPanel}>
      {t.title} <kbd>{SHORTCUT}</kbd>
    </button>
  );
}

/** Maqola sahifalarida: «Tinglash» — maqolani boshidan o'qiydi */
export function ListenButton({ target }: { target: RefObject<HTMLElement | null> }) {
  const t = useA11yT();
  const sp = useSpeech();
  const [mine, setMine] = useState(false);
  useEffect(() => {
    if (sp.status === "idle") setMine(false);
  }, [sp.status]);
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;
  const active = mine && sp.status !== "idle";
  return (
    <button
      type="button"
      className={`a11y-listen ${active ? "on" : ""}`}
      onClick={() => {
        if (active) return sp.status === "playing" ? pause() : resume();
        if (target.current && readPage(target.current, t.img_alt)) setMine(true);
      }}
    >
      {active && sp.status === "playing" ? <Pause size={16} aria-hidden /> : <Play size={16} aria-hidden />}
      {active ? (sp.status === "playing" ? t.pause : t.resume) : t.listen}
    </button>
  );
}
