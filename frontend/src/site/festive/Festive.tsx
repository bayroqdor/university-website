// Bayram bezaklari: havodagi zarrachalar (canvas), bosganda portlash, salyut, sarlavhadagi gulchambar, logotip bezagi,
// tabrik banneri (Yangi yilgacha teskari sanoq bilan) va «bezaklarni o'chirish» tugmasi.
// Admin «Ko'rish» havolasi `/?festive=navruz` — shu brauzer sessiyasida ko'rinish (`?festive=off` — ko'rishni tugatish).
import { motionReduced } from "../../a11y/prefs";
import { AnimatePresence, motion } from "motion/react";
import { Sparkles, X } from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useLocation } from "react-router-dom";
import type { Festive } from "../../lib/api";
import { useSite } from "../../lib/site";
import { Engine } from "./engine";
import { Fireworks } from "./fireworks";
import { DEDMOROZ, PHOTO_SCENES } from "./photoScenes";
import { SceneFx } from "./sceneFx";
import { themeOf, type Theme } from "./themes";

/* ------------------------------------------------------------------ umumiy holat (Layer → Garland, Logo) */
interface State {
  f: Festive | null;
  theme: Theme | null;
  on: boolean;
}
let state: State = { f: null, theme: null, on: false };
const subs = new Set<() => void>();
function setState(s: State) {
  state = s;
  subs.forEach((fn) => fn());
}
function useFest(): State {
  return useSyncExternalStore(
    (fn) => {
      subs.add(fn);
      return () => subs.delete(fn);
    },
    () => state,
  );
}

const PREVIEW_KEY = "uni_festive_preview";
const ls = {
  get(k: string) {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k: string, v: string | null) {
    try {
      if (v === null) localStorage.removeItem(k);
      else localStorage.setItem(k, v);
    } catch {
      /* */
    }
  },
};

function previewWanted(): string | null {
  try {
    const q = new URLSearchParams(window.location.search).get("festive");
    if (q === "off" || q === "") sessionStorage.removeItem(PREVIEW_KEY);
    else if (q)
      sessionStorage.setItem(
        PREVIEW_KEY,
        q.replace(/[^a-z0-9_]/g, "").slice(0, 30),
      );
    return sessionStorage.getItem(PREVIEW_KEY);
  } catch {
    return null;
  }
}

// tizim sozlamasi yoki «Maxsus imkoniyatlar» → «Animatsiyalarni to'xtatish»
const reducedMotion = () => typeof window !== "undefined" && motionReduced();
const finePointer = () =>
  typeof window !== "undefined" &&
  !!window.matchMedia?.("(hover: hover) and (pointer: fine)").matches;

const TXT = {
  uz: {
    off: "Bezaklarni o‘chirish",
    on: "Bezaklarni yoqish",
    left: "qoldi",
    d: "kun",
    h: "soat",
    m: "daq",
    s: "son",
    today: "Bugun bayram!",
    preview: "Ko‘rish rejimi",
    end: "Tugatish",
  },
  ru: {
    off: "Выключить украшения",
    on: "Включить украшения",
    left: "осталось",
    d: "дн",
    h: "ч",
    m: "мин",
    s: "сек",
    today: "Сегодня праздник!",
    preview: "Режим просмотра",
    end: "Завершить",
  },
  en: {
    off: "Turn decorations off",
    on: "Turn decorations on",
    left: "to go",
    d: "days",
    h: "hrs",
    m: "min",
    s: "sec",
    today: "It’s today!",
    preview: "Preview mode",
    end: "Exit",
  },
};

/* ------------------------------------------------------------------ asosiy qatlam */
export function FestiveLayer() {
  const { data, lang } = useSite();
  const [preview] = useState(previewWanted);
  const [pf, setPf] = useState<Festive | null | undefined>(undefined);
  useEffect(() => {
    if (!preview) return;
    fetch(`/api/festive?preview=${encodeURIComponent(preview)}&lang=${lang}`)
      .then((r) => r.json())
      .then((j) => setPf(j.festive || null))
      .catch(() => setPf(null));
  }, [preview, lang]);

  const f: Festive | null = preview ? (pf ?? null) : (data?.festive ?? null);
  const offKey = f ? `uni_fest_off_${f.id}_${f.day}` : "";
  const [off, setOff] = useState(false);
  useEffect(
    () => setOff(!!offKey && !f?.preview && ls.get(offKey) === "1"),
    [offKey, f?.preview],
  );
  const theme = useMemo(() => (f ? themeOf(f.style) : null), [f]);
  const on = !!f && !off;

  useEffect(() => {
    setState({ f, theme, on });
    const root = document.documentElement;
    if (on && f && theme) {
      root.dataset.festive = f.style;
      root.classList.toggle("fest-buttons", f.effects?.buttons !== false);
      root.style.setProperty("--fest-glow", theme.glow);
      theme.colors
        .slice(0, 5)
        .forEach((c, i) => root.style.setProperty(`--fest-${i + 1}`, c));
    } else {
      delete root.dataset.festive;
      root.classList.remove("fest-buttons");
    }
  }, [f, theme, on]);

  const toggle = () => {
    if (!offKey) return;
    const v = !off;
    setOff(v);
    if (!f?.preview) ls.set(offKey, v ? "1" : null);
  };

  if (!f || !theme) return null;
  return (
    <>
      {on && <FestCanvas f={f} theme={theme} />}
      {on && <div className="fest-aura" aria-hidden />}
      <Banner f={f} theme={theme} on={on} toggle={toggle} />
    </>
  );
}

/* ------------------------------------------------------------------ canvas */
function FestCanvas({ f, theme }: { f: Festive; theme: Theme }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const eff = f.effects || {};
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const calm = reducedMotion();
    const eng = new Engine(
      cv,
      theme,
      Math.max(1, Math.min(3, f.intensity || 2)),
      {
        particles: eff.particles !== false,
        fireworks: eff.fireworks !== false && !calm,
      },
    );
    if (calm) {
      // harakatni kamaytirish so'ralgan: zarrachalar sekin va oz, portlashlarsiz
      eng.resize();
    }
    eng.start();
    const timers: number[] = [];
    // birinchi kirishda — salomlashuv portlashi (sessiyada bir marta)
    const hello = `uni_fest_hello_${f.id}`;
    try {
      if (!calm && !sessionStorage.getItem(hello) && theme.burst.length) {
        sessionStorage.setItem(hello, "1");
        [0, 520, 1050].forEach((d, i) =>
          timers.push(
            window.setTimeout(
              () =>
                eng.burst(
                  window.innerWidth * [0.24, 0.76, 0.5][i],
                  window.innerHeight * [0.34, 0.3, 0.22][i],
                ),
              700 + d,
            ),
          ),
        );
      }
    } catch {
      /* */
    }
    const onResize = () => eng.resize();
    const onVis = () => (document.hidden ? eng.stop() : eng.start());
    const skip = (el: EventTarget | null) =>
      el instanceof Element &&
      !!el.closest(
        "input, textarea, select, [contenteditable=true], .pop-root, .ck, .fest-banner, .fs2.has-fw, video, iframe",
      );
    const onDown = (e: PointerEvent) => {
      if (calm || eff.click === false || e.button !== 0 || skip(e.target))
        return;
      eng.burst(e.clientX, e.clientY);
    };
    let lastT = 0;
    const onMove = (e: PointerEvent) => {
      const now = performance.now();
      if (now - lastT < 28) return;
      lastT = now;
      eng.trail(e.clientX, e.clientY);
    };
    const trail = !calm && eff.cursor !== false && finePointer() && !theme.calm;
    window.addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pointerdown", onDown, { passive: true });
    if (trail)
      window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      timers.forEach(clearTimeout);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      eng.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f.id, f.style, f.intensity, JSON.stringify(eff), theme]);
  return <canvas ref={ref} className="fest-canvas" aria-hidden />;
}

/* ------------------------------------------------------------------ teskari sanoq */
function useCountdown(day: string, enabled: boolean) {
  const target = useMemo(() => {
    const [y, m, d] = day.split("-").map(Number);
    return new Date(y, (m || 1) - 1, d || 1).getTime();
  }, [day]);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    const h = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(h);
  }, [enabled]);
  const left = Math.max(0, target - now);
  return {
    left,
    d: Math.floor(left / 864e5),
    h: Math.floor(left / 36e5) % 24,
    m: Math.floor(left / 6e4) % 60,
    s: Math.floor(left / 1e3) % 60,
  };
}

/* ------------------------------------------------------------------ tabrik banneri + tugma */
function Banner({
  f,
  theme,
  on,
  toggle,
}: {
  f: Festive;
  theme: Theme;
  on: boolean;
  toggle: () => void;
}) {
  const { lang } = useSite();
  const tx = TXT[lang as keyof typeof TXT] || TXT.uz;
  const seenKey = `uni_fest_seen_${f.id}_${f.day}_${new Date().toDateString()}`;
  const [open, setOpen] = useState(false);
  const banner = f.effects?.banner !== false;
  // tabrik endi sahifa tepasidagi bayram sahnasida (FestiveScene) — kichik oyna faqat tugma bosilganda ochiladi
  void seenKey;
  useEffect(() => {
    if (!open) return;
    const h = window.setTimeout(() => close(), 14000); // o'zi yig'iladi
    return () => window.clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const close = () => {
    setOpen(false);
    ls.set(seenKey, "1");
  };
  const counting =
    f.countdown && new Date(f.day + "T00:00:00").getTime() > Date.now();
  const cd = useCountdown(f.day, counting && open);
  const isToday = f.day === isoToday();
  const endPreview = () => {
    try {
      sessionStorage.removeItem(PREVIEW_KEY);
    } catch {
      /* */
    }
    const u = new URL(window.location.href);
    u.searchParams.delete("festive");
    window.location.replace(u.pathname + u.search + u.hash);
  };

  return (
    <>
      <AnimatePresence>
        {open && on && banner && (
          <motion.div
            className="fest-banner"
            role="status"
            initial={{ opacity: 0, y: -40, scale: 0.9, filter: "blur(8px)" }}
            animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: -24, scale: 0.94, filter: "blur(6px)" }}
            transition={{ type: "spring", stiffness: 260, damping: 22 }}
          >
            <span className="fest-banner-ring" aria-hidden />
            <span className="fest-banner-icon" aria-hidden>
              <FestIcon name={theme.icon} />
            </span>
            <span className="fest-banner-body">
              <b className="fest-banner-name">{f.name}</b>
              {f.greeting && (
                <span className="fest-banner-text">{f.greeting}</span>
              )}
              {counting ? (
                <span
                  className="fest-count"
                  aria-label={`${cd.d} ${tx.d} ${cd.h} ${tx.h}`}
                >
                  {[
                    [cd.d, tx.d],
                    [cd.h, tx.h],
                    [cd.m, tx.m],
                    [cd.s, tx.s],
                  ].map(([v, l], i) => (
                    <span key={i} className="fest-count-cell">
                      <AnimatePresence mode="popLayout" initial={false}>
                        <motion.b
                          key={String(v)}
                          initial={{ y: -14, opacity: 0 }}
                          animate={{ y: 0, opacity: 1 }}
                          exit={{ y: 14, opacity: 0 }}
                          transition={{ duration: 0.28 }}
                        >
                          {String(v).padStart(2, "0")}
                        </motion.b>
                      </AnimatePresence>
                      <small>{l}</small>
                    </span>
                  ))}
                  <em>{tx.left}</em>
                </span>
              ) : isToday ? (
                <span className="fest-today">{tx.today}</span>
              ) : null}
              <button
                className="fest-banner-off"
                onClick={() => {
                  close();
                  toggle();
                }}
              >
                {tx.off}
              </button>
            </span>
            <button className="fest-banner-x" onClick={close} aria-label="×">
              <X size={16} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      {f.preview && (
        <div className="fest-preview">
          <Sparkles size={14} /> {tx.preview}: <b>{f.name}</b>
          <button onClick={endPreview}>{tx.end}</button>
        </div>
      )}
      <motion.button
        className={`fest-orb ${on ? "" : "off"}`}
        onClick={() =>
          on && banner ? (open ? close() : setOpen(true)) : toggle()
        }
        onContextMenu={(e) => {
          e.preventDefault();
          toggle();
        }}
        title={on ? tx.off : tx.on}
        aria-label={on ? tx.off : tx.on}
        initial={{ scale: 0, rotate: -90 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 18, delay: 1 }}
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.92 }}
      >
        <FestIcon name={theme.icon} />
        <span className="fest-orb-tip">
          {on && banner ? f.name : on ? tx.off : tx.on}
        </span>
      </motion.button>
    </>
  );
}

function isoToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/* ------------------------------------------------------------------ belgilar */
/** Interfeys belgisi (admin ro'yxati, burchakdagi tugma, banner): toza chiziqli SVG, rang — `currentColor`, fon va doirasiz. */
export function FestIcon({ name, size = 24 }: { name: string; size?: number }) {
  const p = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
  } as const;
  switch (name) {
    case "tree":
      return (
        <svg {...p}>
          <path d="M12 3.5 8 9h2.5L7 14h3L6 19.5h12L14 14h3l-3.5-5H16z" />
          <path d="M12 19.5V22" />
        </svg>
      );
    case "tulip":
      return (
        <svg {...p}>
          <path d="M12 21v-9" />
          <path d="M7 4.5c0 4 1.8 7.5 5 7.5s5-3.5 5-7.5L14.5 7 12 3.5 9.5 7z" />
          <path d="M12 17c-2.2 0-4-1.4-4.6-3.6M12 19c2.4 0 4.3-1.6 4.8-4" />
        </svg>
      );
    case "flower":
      return (
        <svg {...p}>
          <path d="M12 9.5c-1.6-2.4-1.2-5 0-6 1.2 1 1.6 3.6 0 6zM14.4 11.2c2.7-1 5.2 0 5.7 1.5-1.3.8-3.8.6-5.7-1.5zM13.5 14.1c1 2.7.2 5.2-1.3 5.8-.9-1.3-.8-3.8 1.3-5.8zM10.5 14.1c-1 2.7-.2 5.2 1.3 5.8M10.5 14.1c-1.9 2-4.4 2.2-5.6 1.3.4-1.5 2.8-2.6 5.6-1.3zM9.6 11.2c-1.9 2.1-4.4 2.3-5.7 1.5.5-1.5 3-2.5 5.7-1.5z" />
          <path d="M12 13.6a1.6 1.6 0 1 0 0-3.2 1.6 1.6 0 0 0 0 3.2z" />
        </svg>
      );
    case "candle":
      return (
        <svg {...p}>
          <path d="M12 3c1.6 2 1.6 3.6 0 4.6-1.6-1-1.6-2.6 0-4.6z" />
          <path d="M9 10h6v10H9zM12 7.6V10M6 20h12" />
        </svg>
      );
    case "flag":
      return (
        <svg {...p}>
          <path d="M5 21V3.5" />
          <path d="M5 4.5c2.5-1.5 5-1.5 7 0s4.5 1.5 7 0v9c-2.5 1.5-5 1.5-7 0s-4.5-1.5-7 0" />
          <path d="M5 8.8c2.5-1.5 5-1.5 7 0s4.5 1.5 7 0" />
        </svg>
      );
    case "book":
      return (
        <svg {...p}>
          <path d="M3 5.5c3-1 6-.6 9 1.5v13c-3-2.1-6-2.5-9-1.5zM21 5.5c-3-1-6-.6-9 1.5v13c3-2.1 6-2.5 9-1.5z" />
        </svg>
      );
    case "crescent":
      return (
        <svg {...p}>
          <path d="M15.5 3.6A8.5 8.5 0 1 0 20.4 16a7 7 0 1 1-4.9-12.4z" />
          <path d="m17.5 7 .6 1.4 1.5.1-1.1 1 .3 1.5-1.3-.8-1.3.8.3-1.5-1.1-1 1.5-.1z" />
        </svg>
      );
    case "lantern":
      return (
        <svg {...p}>
          <path d="M12 2v2.5M9.5 4.5h5M9.5 19.5h5M12 19.5V22" />
          <path d="M9.5 4.5C5.8 6 4.5 9 4.5 12s1.3 6 5 7.5h5c3.7-1.5 5-4.5 5-7.5s-1.3-6-5-7.5z" />
          <path d="M12 4.5v15M9 5.5c-1.4 4-1.4 9 0 13M15 5.5c1.4 4 1.4 9 0 13" />
        </svg>
      );
    case "balloon":
      return (
        <svg {...p}>
          <path d="M12 16c3.6 0 6-3.4 6-7a6 6 0 0 0-12 0c0 3.6 2.4 7 6 7z" />
          <path d="m11 16 1 1.5 1-1.5M12 17.5c0 2-2 2.5-1 4.5" />
        </svg>
      );
    case "moon":
      return (
        <svg {...p}>
          <path d="M12 3.5a7 7 0 1 1 0 14 7 7 0 0 1 0-14z" />
          <path d="M3 21c3-2.2 6-2.2 9 0 3-2.2 6-2.2 9 0" />
        </svg>
      );
    case "hangul":
      return (
        <svg {...p}>
          <path d="M6 5h6M9 5v1.5M6.5 9a2.5 2.5 0 1 0 5 0 2.5 2.5 0 0 0-5 0zM15.5 4v9M15.5 8.5H18M7 15v4.5h11" />
        </svg>
      );
    default:
      return <Sparkles size={size} strokeWidth={1.6} />;
  }
}

/** Rangli belgi — faqat sahna bezaklari ichida (ochiluvchi elementlar). Interfeys belgilari — FestIcon. */
function FestGlyph({ name }: { name: string }) {
  const p = {
    width: 26,
    height: 26,
    viewBox: "0 0 32 32",
    fill: "none",
    "aria-hidden": true,
  } as const;
  switch (name) {
    case "tree":
      return (
        <svg {...p}>
          <path d="M16 3l5 7h-3l5 7h-3l5 8H7l5-8H9l5-7h-3z" fill="#2fbf71" />
          <rect x="14" y="25" width="4" height="4" rx="1" fill="#8d5524" />
          <path
            d="M16 1.5l1 2.2 2.4.3-1.8 1.6.5 2.4L16 6.8 13.9 8l.5-2.4-1.8-1.6 2.4-.3z"
            fill="#ffd166"
          />
          <circle cx="13" cy="14" r="1.3" fill="#ff4d6d" />
          <circle cx="19" cy="18" r="1.3" fill="#4cc9f0" />
          <circle cx="12" cy="21" r="1.3" fill="#ffd166" />
          <circle cx="20" cy="22.5" r="1.3" fill="#ff4d6d" />
        </svg>
      );
    case "tulip":
      return (
        <svg {...p}>
          <path
            d="M16 30V15"
            stroke="#43aa8b"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <path
            d="M16 24c-4-1-7-4-8-8 4 0 7 3 8 8zM16 26c4-1 7-4 8-8-4 0-7 3-8 8z"
            fill="#90be6d"
          />
          <path
            d="M9 6c2 3 4 3 4 3l3-6 3 6s2 0 4-3c1 6-2 11-7 11S8 12 9 6z"
            fill="#ff4d6d"
          />
          <path d="M16 3l-3 6c1 4 2 7 3 8 1-1 2-4 3-8z" fill="#ff8fab" />
        </svg>
      );
    case "flower":
      return (
        <svg {...p}>
          {[0, 72, 144, 216, 288].map((a) => (
            <ellipse
              key={a}
              cx="16"
              cy="9"
              rx="4.6"
              ry="7"
              fill="#ff8fab"
              transform={`rotate(${a} 16 16)`}
            />
          ))}
          <circle cx="16" cy="16" r="4" fill="#ffd60a" />
        </svg>
      );
    case "candle":
      return (
        <svg {...p}>
          <path d="M16 3c3 4 3 7 0 9-3-2-3-5 0-9z" fill="#ffb703" />
          <rect x="12" y="13" width="8" height="16" rx="2" fill="#b23a48" />
          <path
            d="M8 29h16"
            stroke="#a1887f"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      );
    case "flag":
      return (
        <svg {...p}>
          <path
            d="M6 3v27"
            stroke="#8a8f98"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <path d="M7 5h20v6H7z" fill="#0099b5" />
          <path d="M7 11h20v1H7z" fill="#ce1126" />
          <path d="M7 12h20v5H7z" fill="#fff" />
          <path d="M7 17h20v1H7z" fill="#ce1126" />
          <path d="M7 18h20v6H7z" fill="#1eb53a" />
          <circle cx="11" cy="8" r="2" fill="#fff" />
          <circle cx="11.8" cy="8" r="1.7" fill="#0099b5" />
        </svg>
      );
    case "book":
      return (
        <svg {...p}>
          <path d="M3 7c5-2 9-1 13 2v19c-4-3-8-4-13-2z" fill="#4285f4" />
          <path d="M29 7c-5-2-9-1-13 2v19c4-3 8-4 13-2z" fill="#f4b400" />
          <path d="M16 9v19" stroke="#fff" strokeWidth="1.2" />
        </svg>
      );
    case "crescent":
      return (
        <svg {...p}>
          <path d="M20 4a12 12 0 1 0 8 19A10 10 0 1 1 20 4z" fill="#f5c542" />
          <path
            d="M23 9l1 2.3 2.4.2-1.8 1.6.6 2.4-2.2-1.3-2.1 1.3.5-2.4-1.8-1.6 2.4-.2z"
            fill="#ffe29a"
          />
        </svg>
      );
    case "lantern":
      return (
        <svg {...p}>
          <path d="M16 1v4" stroke="#f4c430" strokeWidth="1.6" />
          <rect x="11" y="4" width="10" height="3" rx="1" fill="#f4c430" />
          <ellipse cx="16" cy="16" rx="10" ry="9.5" fill="#d7263d" />
          <path
            d="M16 6.5v19M11 7.5c-2 5-2 12 0 17M21 7.5c2 5 2 12 0 17"
            stroke="#f4c430"
            strokeWidth="1"
            opacity=".75"
          />
          <rect x="11" y="25" width="10" height="3" rx="1" fill="#f4c430" />
          <path
            d="M14 28v3M16 28v4M18 28v3"
            stroke="#f4c430"
            strokeWidth="1.2"
          />
        </svg>
      );
    case "balloon":
      return (
        <svg {...p}>
          <path
            d="M16 23c0 3-3 4-2 8"
            stroke="#888"
            strokeWidth="1"
            fill="none"
          />
          <ellipse cx="16" cy="12" rx="8" ry="10" fill="#ff5d73" />
          <path d="M14.5 21.5h3l-1.5 2z" fill="#ff5d73" />
          <ellipse cx="13" cy="8" rx="2" ry="3.2" fill="#fff" opacity=".45" />
        </svg>
      );
    case "moon":
      return (
        <svg {...p}>
          <circle cx="16" cy="15" r="11" fill="#ffd166" />
          <circle cx="12" cy="11" r="2" fill="#f2c14e" />
          <circle cx="19" cy="18" r="2.6" fill="#f2c14e" />
          <path
            d="M5 27c4-3 8-3 11 0 3-3 7-3 11 0"
            stroke="#e07a1f"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      );
    case "hangul":
      return (
        <svg {...p}>
          <rect x="2" y="4" width="28" height="24" rx="6" fill="#1b4f9c" />
          <text
            x="16"
            y="22.5"
            textAnchor="middle"
            fontSize="15"
            fontWeight="800"
            fill="#fff"
            fontFamily="'Noto Sans KR', sans-serif"
          >
            한
          </text>
        </svg>
      );
    default:
      return <Sparkles size={22} />;
  }
}

/* ------------------------------------------------------------------ sarlavhadagi gulchambar */
const ARCS = 6;
function sag(x: number) {
  // x — 0..1 butun kenglik bo'yicha; har bir yoy ichida parabola
  const t = (x * ARCS) % 1;
  return 4 * t * (1 - t);
}

/** Sarlavha ostidagi chiroq shodasi — faqat «chiroqlar» turidagi bayramlarda (Yangi yil) */
export function FestiveHeaderLights() {
  const { theme } = useFest();
  return theme?.garland === "lights" ? <FestiveGarland /> : null;
}

export function FestiveGarland() {
  const { f, theme, on } = useFest();
  const [w, setW] = useState(() =>
    typeof window === "undefined" ? 1200 : window.innerWidth,
  );
  useEffect(() => {
    const r = () => setW(window.innerWidth);
    window.addEventListener("resize", r);
    return () => window.removeEventListener("resize", r);
  }, []);
  if (
    !on ||
    !f ||
    !theme ||
    theme.garland === "none" ||
    f.effects?.garland === false
  )
    return null;
  const g = theme.garland;
  const dense =
    g === "lights"
      ? 38
      : g === "bunting"
        ? 30
        : g === "flowers"
          ? 26
          : g === "balloons"
            ? 0
            : 12;
  const n = Math.max(6, Math.round((dense * Math.min(w, 1600)) / 1440));
  const depth = g === "lights" ? 14 : g === "bunting" ? 16 : 12;
  const wire = Array.from({ length: ARCS }, (_, i) => {
    const a = (i / ARCS) * 1000;
    const b = ((i + 1) / ARCS) * 1000;
    return `M${a} 2 Q${(a + b) / 2} ${2 + depth * 2} ${b} 2`;
  }).join(" ");
  const cols = theme.colors;
  return (
    <div className={`fest-garland fg-${g}`} aria-hidden>
      {g !== "balloons" && (
        <svg
          className="fg-wire"
          viewBox={`0 0 1000 ${depth + 6}`}
          preserveAspectRatio="none"
        >
          <path d={wire} />
        </svg>
      )}
      {g === "balloons" ? (
        <>
          <BalloonCluster side="l" colors={cols} />
          <BalloonCluster side="r" colors={cols} />
        </>
      ) : (
        Array.from({ length: n }, (_, i) => {
          const x = (i + 0.5) / n;
          const y = 2 + sag(x) * depth;
          const c = cols[i % cols.length];
          const style = {
            left: `${x * 100}%`,
            top: `${y}px`,
            "--c": c,
            "--d": `${(i * 0.37) % 3}s`,
            "--l": `${8 + ((i * 7) % 5) * 5}px`,
          } as React.CSSProperties;
          if (g === "lights")
            return <i key={i} className="fg-bulb" style={style} />;
          if (g === "bunting")
            return (
              <i key={i} className="fg-flag" style={style}>
                {theme.garlandText ? (
                  <b>{theme.garlandText[i % theme.garlandText.length]}</b>
                ) : null}
              </i>
            );
          if (g === "flowers")
            return (
              <i
                key={i}
                className={`fg-flower ${i % 3 === 1 ? "leaf" : ""}`}
                style={style}
              >
                {i % 3 === 1 ? <Leaf /> : <Bloom c={c} />}
              </i>
            );
          if (g === "ribbon")
            return i % 2 ? (
              <i key={i} className="fg-dot" style={style} />
            ) : null;
          if (g === "lanterns")
            return (
              <i key={i} className="fg-lantern" style={style}>
                <span className="fg-string" />
                <EidLantern c={c} />
              </i>
            );
          return (
            <i key={i} className="fg-lantern kr" style={style}>
              <span className="fg-string" />
              <KoreanLantern c={i % 2 ? "#1b4f9c" : "#d7263d"} />
            </i>
          );
        })
      )}
    </div>
  );
}

function Bloom({ c }: { c: string }) {
  return (
    <svg viewBox="0 0 20 20" width="20" height="20">
      {[0, 72, 144, 216, 288].map((a) => (
        <ellipse
          key={a}
          cx="10"
          cy="5"
          rx="3.2"
          ry="4.6"
          fill={c}
          transform={`rotate(${a} 10 10)`}
        />
      ))}
      <circle cx="10" cy="10" r="2.6" fill="#ffd166" />
    </svg>
  );
}
function Leaf() {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16">
      <path d="M3 17C3 8 9 3 17 3c0 8-5 14-14 14z" fill="#6ab04c" />
      <path d="M4 16L15 5" stroke="#3b7d2b" strokeWidth="1" />
    </svg>
  );
}
function EidLantern({ c }: { c: string }) {
  return (
    <svg viewBox="0 0 24 40" width="22" height="36">
      <path d="M12 0v4" stroke="#c99a2e" strokeWidth="1.4" />
      <path d="M7 6h10l-2-3H9z" fill="#c99a2e" />
      <path
        d="M6 8h12l2 6v12l-2 6H6l-2-6V14z"
        fill="#3b2a0a"
        stroke="#c99a2e"
        strokeWidth="1.4"
      />
      <path
        d="M8 11h8l1.5 4v10L16 29H8l-1.5-4V15z"
        fill={c}
        className="fg-flame"
      />
      <path
        d="M12 12v16M7 20h10"
        stroke="#c99a2e"
        strokeWidth=".8"
        opacity=".7"
      />
      <path d="M9 32h6l-3 5z" fill="#c99a2e" />
    </svg>
  );
}
function KoreanLantern({ c }: { c: string }) {
  return (
    <svg viewBox="0 0 24 40" width="22" height="38">
      <path d="M12 0v5" stroke="#f4c430" strokeWidth="1.2" />
      <rect x="6" y="4" width="12" height="3" rx="1" fill="#f4c430" />
      <path
        d="M5 7h14c2 4 2 14 0 18H5C3 21 3 11 5 7z"
        fill={c}
        className="fg-flame"
      />
      <path
        d="M5 7h14c.6 1.3 1 2.7 1.3 4H3.7C4 9.7 4.4 8.3 5 7z"
        fill={c === "#d7263d" ? "#1b4f9c" : "#d7263d"}
      />
      <rect x="6" y="25" width="12" height="3" rx="1" fill="#f4c430" />
      <path
        d="M8 28v8M10 28v10M12 28v9M14 28v10M16 28v8"
        stroke={c === "#d7263d" ? "#1b4f9c" : "#d7263d"}
        strokeWidth="1"
      />
    </svg>
  );
}
function BalloonCluster({
  side,
  colors,
}: {
  side: "l" | "r";
  colors: string[];
}) {
  return (
    <div className={`fg-balloons ${side}`}>
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          className="fg-balloon"
          style={
            {
              "--c": colors[(i + (side === "r" ? 2 : 0)) % colors.length],
              "--d": `${i * 0.6}s`,
              "--i": i,
            } as React.CSSProperties
          }
        >
          <svg viewBox="0 0 30 60" width="30" height="60">
            <path
              d="M15 36c0 8-4 12 0 22"
              stroke="currentColor"
              strokeWidth=".8"
              fill="none"
              opacity=".5"
            />
            <ellipse cx="15" cy="17" rx="12" ry="15" fill="var(--c)" />
            <path d="M13 31.5h4l-2 3z" fill="var(--c)" />
            <ellipse cx="10.5" cy="11" rx="3" ry="5" fill="#fff" opacity=".4" />
          </svg>
        </span>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ logotip bezagi */
export function FestiveLogo() {
  const { f, theme, on } = useFest();
  if (!on || !f || !theme || theme.logo === "none") return null;
  return (
    <span className={`fest-logo fl-${theme.logo}`} aria-hidden>
      <LogoArt kind={theme.logo} />
    </span>
  );
}

function LogoArt({ kind }: { kind: string }) {
  switch (kind) {
    case "snowcap":
      return (
        <svg viewBox="0 0 40 30" width="34" height="26">
          <path d="M4 24C8 10 18 3 30 6l4 10c-8-4-15 0-19 9z" fill="#e63946" />
          <path d="M2 22c6-3 14-3 18 2l-2 4c-5-3-11-3-16-1z" fill="#fff" />
          <circle cx="34" cy="17" r="4.5" fill="#fff" />
        </svg>
      );
    case "tulip":
    case "heart":
    case "crescent":
    case "lantern":
    case "flag":
    case "star":
    case "balloon":
    case "moon":
    case "hangul":
      return (
        <FestGlyph
          name={
            {
              tulip: "tulip",
              heart: "flower",
              crescent: "crescent",
              lantern: "lantern",
              flag: "flag",
              star: "book",
              balloon: "balloon",
              moon: "moon",
              hangul: "hangul",
            }[kind]!
          }
        />
      );
    case "taegeuk":
      return (
        <svg viewBox="0 0 32 32" width="24" height="24">
          <circle cx="16" cy="16" r="13" fill="#fff" stroke="#ddd" />
          <path
            d="M3 16a13 13 0 0 1 26 0 6.5 6.5 0 0 1-13 0 6.5 6.5 0 0 0-13 0z"
            fill="#cd2e3a"
          />
          <path
            d="M3 16a13 13 0 0 0 26 0 6.5 6.5 0 0 1-13 0 6.5 6.5 0 0 0-13 0z"
            fill="#0047a0"
          />
        </svg>
      );
    default:
      return null;
  }
}

/* ------------------------------------------------------------------ bayram sahnasi (sarlavha ostida) */
const SCENE_TX: Record<
  string,
  Record<string, { sub: string; chalk?: string; book?: string }>
> = {
  uz: {
    newyear: {
      sub: "Yangi yilda yangi bilim, yangi kashfiyot va yangi g‘alabalar tilaymiz!",
    },
    navruz: {
      sub: "Bahor — yangilanish, mehr va bunyodkorlik bayrami. Dasturxoningiz to‘kin, xonadoningiz fayzli bo‘lsin!",
    },
    remembrance: {
      sub: "Vatan ozodligi va tinchligi yo‘lida jon fido qilganlar xotirasi oldida bosh egamiz.",
    },
    independence: {
      sub: "Ozod va obod Vatan — barchamizning faxrimiz. Mustaqillik bayrami muborak!",
    },
    teachers: {
      sub: "Bilim nurini ulashayotgan barcha ustoz va murabbiylarga cheksiz minnatdorlik!",
      chalk: "Ustozlarga rahmat!",
    },
    constitution: {
      sub: "Asosiy qonunimiz — erkinlik, adolat va farovonlik kafolati.",
      book: "KONSTITUTSIYA",
    },
    flowers: {
      sub: "Onalarimiz, opa-singillarimiz va barcha mushtariy ayollarga bahoriy tabriklar!",
    },
    eid: {
      sub: "Hayit kunlari xonadonlaringizga tinchlik, baraka va shodlik olib kelsin.",
    },
  },
  ru: {
    newyear: { sub: "Желаем в новом году новых знаний, открытий и побед!" },
    navruz: {
      sub: "Весна — праздник обновления, доброты и созидания. Пусть ваш дастархан будет щедрым!",
    },
    remembrance: {
      sub: "Склоняем головы перед памятью тех, кто отдал жизнь за свободу и мир Родины.",
    },
    independence: {
      sub: "Свободная и процветающая Родина — наша общая гордость. С Днём независимости!",
    },
    teachers: {
      sub: "Безграничная благодарность всем учителям и наставникам, дарящим свет знаний!",
      chalk: "Спасибо, учителя!",
    },
    constitution: {
      sub: "Основной закон — гарантия свободы, справедливости и благополучия.",
      book: "КОНСТИТУЦИЯ",
    },
    flowers: {
      sub: "Весенние поздравления нашим мамам, сёстрам и всем женщинам!",
    },
    eid: { sub: "Пусть праздник принесёт в ваш дом мир, благодать и радость." },
  },
  en: {
    newyear: {
      sub: "Wishing you new knowledge, discoveries and achievements in the new year!",
    },
    navruz: {
      sub: "Spring is the festival of renewal, kindness and creation. May your table be generous!",
    },
    remembrance: {
      sub: "We bow our heads to the memory of those who gave their lives for the freedom and peace of our homeland.",
    },
    independence: {
      sub: "A free and prosperous homeland is our shared pride. Happy Independence Day!",
    },
    teachers: {
      sub: "Endless gratitude to every teacher and mentor who shares the light of knowledge!",
      chalk: "Thank you, teachers!",
    },
    constitution: {
      sub: "Our fundamental law guarantees freedom, justice and prosperity.",
      book: "CONSTITUTION",
    },
    flowers: { sub: "Spring greetings to our mothers, sisters and all women!" },
    eid: {
      sub: "May these holidays bring peace, blessings and joy to your home.",
    },
  },
};

export function FestiveScene() {
  const { f, on } = useFest();
  const { lang } = useSite();
  const { pathname } = useLocation();
  const tx = TXT[lang as keyof typeof TXT] || TXT.uz;
  const home = pathname === "/";
  const stripKey = f
    ? `uni_fest_strip_${f.id}_${f.day}_${new Date().toDateString()}`
    : "";
  const [stripOff, setStripOff] = useState(false);
  useEffect(
    () => setStripOff(!!stripKey && !f?.preview && ls.get(stripKey) === "1"),
    [stripKey, f?.preview],
  );
  const counting =
    !!f?.countdown &&
    !!f &&
    new Date(f.day + "T00:00:00").getTime() > Date.now();
  const cd = useCountdown(f?.day || "2000-01-01", counting && on);
  // sahna faqat tayyorlangan bayramlar uchun (boshqalarida — faqat havodagi bezaklar)
  const style = f && PHOTO_SCENES[f.style] ? f.style : "newyear";
  const cfg = PHOTO_SCENES[style];
  const known = !!f && !!PHOTO_SCENES[f.style];
  const band = useRef<HTMLElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const fxCv = useRef<HTMLCanvasElement>(null);
  const fwCv = useRef<HTMLCanvasElement>(null);
  const sleigh = useRef<HTMLDivElement>(null);
  const visible = !!f && known && on && (home || !stripOff);
  const fireworks = !!cfg.fireworks && f?.effects?.fireworks !== false;
  const intensity = Math.max(1, Math.min(3, f?.intensity || 2));

  useEffect(() => {
    if (!visible || !fxCv.current || !band.current) return;
    const calm = reducedMotion();
    const layers = cfg.layers.concat(
      cfg.extra === "newyear" ? [{ k: "trail", el: () => sleigh.current }] : [],
    );
    const fx = new SceneFx(
      fxCv.current,
      layers,
      () => stage.current?.getBoundingClientRect() ?? null,
      home ? 0.6 + intensity * 0.2 : 0.35,
    );
    const fw =
      fireworks && fwCv.current && !calm
        ? new Fireworks(fwCv.current, {
            palette: cfg.fireworks!.palette,
            shells: cfg.fireworks!.shells,
            auto: home,
            intensity,
            groundY: 1,
            // faqat surat ustidagi osmonda (matn paneli ustida emas)
            sky: () => {
              const b = band.current?.getBoundingClientRect();
              const p = band.current
                ?.querySelector(".fs2-photo")
                ?.getBoundingClientRect();
              if (!b || !p) return null;
              const left = cfg.side === "right";
              const x0 = p.left - b.left + p.width * (left ? 0.3 : 0.05);
              const x1 = p.left - b.left + p.width * (left ? 0.95 : 0.7);
              const top = p.top - b.top;
              return {
                x0,
                x1,
                y0: top + p.height * 0.08,
                y1: top + p.height * 0.4,
              };
            },
          })
        : null;
    let inView = true;
    const run = () => {
      if (calm) return fx.still();
      if (inView && !document.hidden) {
        fx.start();
        fw?.start();
      } else {
        fx.stop();
        fw?.stop();
      }
    };
    // surat yuklangach — bir kadr (harakatsiz rejimda ham chiroqlar ko'rinsin)
    const img = stage.current?.querySelector("img");
    const onImg = () => (calm ? fx.still() : undefined);
    img?.addEventListener("load", onImg);
    const io = new IntersectionObserver(([e]) => {
      inView = e.isIntersecting;
      run();
    });
    io.observe(band.current);
    const onVis = () => run();
    document.addEventListener("visibilitychange", onVis);
    run();
    // sahnani bosganda — o'sha nuqtaga raketa
    const el = band.current;
    const onDown = (e: PointerEvent) => {
      if (
        !fw ||
        e.button !== 0 ||
        (e.target instanceof Element && e.target.closest("a, button"))
      )
        return;
      const r = el.getBoundingClientRect();
      fw.launch(e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener("pointerdown", onDown);
    // birinchi ko'rishda — bayram avji
    const timers: number[] = [];
    if (fw && home) timers.push(window.setTimeout(() => fw.salvo(4), 900));
    return () => {
      timers.forEach(clearTimeout);
      io.disconnect();
      img?.removeEventListener("load", onImg);
      document.removeEventListener("visibilitychange", onVis);
      el.removeEventListener("pointerdown", onDown);
      fx.destroy();
      fw?.destroy();
    };
  }, [visible, style, home, fireworks, intensity, cfg]);

  if (!f || !visible) return null;
  const st = (SCENE_TX[lang] || SCENE_TX.uz)[style] || { sub: "" };
  const year = Number(f.day.slice(0, 4)) || new Date().getFullYear();
  const anniversary = style === "independence" ? year - 1991 : 0;
  const yearLabel =
    style === "newyear"
      ? String(year)
      : style === "remembrance"
        ? "1941 — 1945"
        : anniversary > 0
          ? `${anniversary} ${lang === "ru" ? "лет" : lang === "en" ? "years" : "yil"}`
          : "";
  const switchOff = () => {
    const btn = document.querySelector<HTMLButtonElement>(".fest-orb");
    btn?.dispatchEvent(
      new MouseEvent("contextmenu", { bubbles: true, cancelable: true }),
    );
  };
  const photo = f.image || cfg.photo;
  const custom = !!f.image;
  const vars = {
    "--panel": cfg.panel,
    "--ar": custom ? 1.6 : cfg.ar,
    "--fx": custom ? 0.5 : cfg.focal[0],
    "--fy": custom ? 0.5 : cfg.focal[1],
    "--accent": cfg.accent,
  } as React.CSSProperties;
  const fotoLbl = lang === "ru" ? "Фото" : lang === "en" ? "Photo" : "Foto";
  return (
    <section
      ref={band}
      className={`fs2 ${home ? "full" : "strip"} side-${cfg.side} fit-${custom ? "cover" : cfg.fit} tone-${cfg.tone} st-${style} ${fireworks ? "has-fw" : ""}`}
      style={vars}
      aria-label={f.name}
    >
      <div className="fs2-photo" aria-hidden>
        <div className="fs2-stage" ref={stage}>
          <img src={photo} alt="" decoding="async" />
        </div>
      </div>
      {cfg.extra === "newyear" && !custom && home && (
        <img
          className="fs2-dm"
          src={DEDMOROZ.src}
          alt=""
          aria-hidden
          decoding="async"
        />
      )}
      <canvas className="fs2-fx" ref={fxCv} aria-hidden />
      {cfg.extra === "newyear" && (
        <div className="fs2-sleigh" ref={sleigh} aria-hidden>
          <i />
        </div>
      )}
      {fireworks && <canvas className="fs2-fw" ref={fwCv} aria-hidden />}
      <div className="wrap fs2-in">
        <div className="fs2-copy">
          <p className="fs2-ey">
            <span>{f.name}</span>
            {yearLabel && <span className="fs2-year">{yearLabel}</span>}
          </p>
          <h2 className="fs2-h">{f.greeting || f.name}</h2>
          {home && st.sub && <p className="fs2-sub">{st.sub}</p>}
          {counting ? (
            <div
              className="fs2-count"
              aria-label={`${cd.d} ${tx.d} ${cd.h} ${tx.h}`}
            >
              {[
                [cd.d, tx.d],
                [cd.h, tx.h],
                [cd.m, tx.m],
                [cd.s, tx.s],
              ].map(([val, l], i) => (
                <span key={i} className="fs2-cell">
                  <b>{String(val).padStart(2, "0")}</b>
                  <small>{l}</small>
                </span>
              ))}
              <em>{tx.left}</em>
            </div>
          ) : f.day === isoToday() ? (
            <p className="fs2-today">{tx.today}</p>
          ) : null}
          {home && (
            <button type="button" className="fs2-off" onClick={switchOff}>
              {tx.off}
            </button>
          )}
        </div>
        {!home && (
          <button
            type="button"
            className="fs2-x"
            aria-label="×"
            onClick={() => {
              setStripOff(true);
              if (!f.preview) ls.set(stripKey, "1");
            }}
          >
            <X size={18} />
          </button>
        )}
      </div>
      {home && !custom && (
        <p className="fs2-credit">
          {fotoLbl}:{" "}
          <a href={cfg.credit.url} target="_blank" rel="noopener noreferrer">
            {cfg.credit.author}
          </a>
          , {cfg.credit.license}
          {cfg.extra === "newyear" && (
            <>
              {" · "}
              <a
                href={DEDMOROZ.credit.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                {DEDMOROZ.credit.author}
              </a>
              , {DEDMOROZ.credit.license}
            </>
          )}
        </p>
      )}
    </section>
  );
}
