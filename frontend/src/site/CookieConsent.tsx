// Birinchi tashrifda cookie roziligi: zarur (doim) va statistika (ixtiyoriy). Tanlov «uni_consent» cookie'sida saqlanadi —
// server statistika cookie'sini (vid) faqat rozilik bo'lsa qo'yadi. Futerdagi «Cookie sozlamalari» oynani qayta ochadi.
import { AnimatePresence, motion } from "framer-motion";
import { Check, Cookie, Settings2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useMotionReduced } from "../a11y/prefs";
import { useSite } from "../lib/site";
import { PRIVACY_PATH } from "./official/Consent";

const POLICY: Record<string, string> = { uz: "Maxfiylik siyosati", ru: "Политика конфиденциальности", en: "Privacy policy" };

const NAME = "uni_consent";
const OPEN_EVENT = "uni:cookie-settings";

function read(): string[] | null {
  const m = document.cookie.match(/(?:^|;\s*)uni_consent=([^;]+)/);
  if (!m) return null;
  const v = decodeURIComponent(m[1]);
  return v.split(":").pop()!.split(",").filter(Boolean);
}

function write(cats: string[]) {
  const secure = window.location.protocol === "https:" ? "; secure" : "";
  document.cookie = `${NAME}=${encodeURIComponent("v1:" + ["necessary", ...cats].join(","))}; path=/; max-age=${180 * 86400}; samesite=lax${secure}`;
}

export function openCookieSettings() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

export function CookieConsent() {
  const { t, lang } = useSite();
  const [open, setOpen] = useState(false);
  const [more, setMore] = useState(false);
  const [stats, setStats] = useState(true);
  const still = useMotionReduced();
  const box = useRef<HTMLDivElement>(null);
  // oyna balandligi --ck-h ga: telefonda sahifa pastidan shuncha joy qo'shiladi (oxirgi kontent oyna ostida qolib ketmasin)
  // va chat tugmasi oynaning ustiga ko'tariladi
  useEffect(() => {
    const el = box.current;
    const root = document.documentElement;
    if (!open || !el) return;
    const set = () => root.style.setProperty("--ck-h", `${Math.ceil(el.getBoundingClientRect().height)}px`);
    set();
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(set);
    ro?.observe(el);
    return () => {
      ro?.disconnect();
      root.style.removeProperty("--ck-h");
    };
  }, [open]);
  useEffect(() => {
    const cur = read();
    if (!cur) {
      const h = window.setTimeout(() => setOpen(true), 900); // sahifa ko'ringach, yumshoq chiqadi
      return () => window.clearTimeout(h);
    }
    setStats(cur.includes("stats"));
  }, []);
  useEffect(() => {
    const on = () => {
      const cur = read();
      setStats(cur ? cur.includes("stats") : true);
      setMore(true);
      setOpen(true);
    };
    window.addEventListener(OPEN_EVENT, on);
    return () => window.removeEventListener(OPEN_EVENT, on);
  }, []);
  const done = (cats: string[]) => {
    write(cats);
    setOpen(false);
    window.dispatchEvent(new Event("uni:consent")); // kutib turgan e'lon oynasi endi chiqishi mumkin
    setMore(false);
  };
  if (!t) return null;
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={box}
          className="ck"
          role="dialog"
          aria-live="polite"
          aria-label={t.ck_title}
          // faqat pastdan suriladi, shaffoflik o'zgarmaydi — chiqayotganda ham orqadagi matn ko'rinib qolmaydi
          initial={still ? false : { y: "120%" }}
          animate={{ y: 0 }}
          exit={still ? { y: 0 } : { y: "120%" }}
          transition={still ? { duration: 0 } : { duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        >
          <button className="ck-x" onClick={() => done(read()?.filter((c) => c !== "necessary") || [])} aria-label="×">
            <X size={16} />
          </button>
          <div className="ck-head">
            <span className="ck-ic">
              <Cookie size={22} />
            </span>
            <b>{t.ck_title}</b>
          </div>
          <p className="ck-text">
            {t.ck_text}{" "}
            <Link to={PRIVACY_PATH} className="ck-policy" onClick={() => setOpen(false)}>
              {POLICY[lang] || POLICY.uz}
            </Link>
          </p>
          <AnimatePresence initial={false}>
            {more && (
              <motion.div className="ck-cats" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3 }}>
                <div className="ck-cat">
                  <span>
                    <b>{t.ck_nec_t}</b>
                    <small>{t.ck_nec_d}</small>
                  </span>
                  <em className="ck-always">
                    <Check size={13} /> {t.ck_always}
                  </em>
                </div>
                <label className="ck-cat">
                  <span>
                    <b>{t.ck_stats_t}</b>
                    <small>{t.ck_stats_d}</small>
                  </span>
                  <input type="checkbox" className="ck-switch" checked={stats} onChange={(e) => setStats(e.target.checked)} />
                </label>
              </motion.div>
            )}
          </AnimatePresence>
          <div className="ck-actions">
            {more ? (
              <button className="btn btn-primary ck-main" onClick={() => done(stats ? ["stats"] : [])}>
                {t.ck_save}
              </button>
            ) : (
              <button className="btn btn-primary ck-main" onClick={() => done(["stats"])}>
                {t.ck_accept}
              </button>
            )}
            <button className="btn btn-ghost" onClick={() => done([])}>
              {t.ck_necessary}
            </button>
            {!more && (
              <button className="ck-link" onClick={() => setMore(true)}>
                <Settings2 size={15} /> {t.ck_settings}
              </button>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
