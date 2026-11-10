// «Maxsus imkoniyatlar» paneli — o'ng tomondan ochiladigan modal oyna (telefonda — pastdan).
// Native <dialog> + showModal(): fokus oyna ichida qoladi, sahifaning qolgan qismi «inert», Esc yopadi,
// yopilganda fokus panelni ochgan tugmaga qaytadi. Har bir o'zgarish darhol qo'llanadi va saqlanadi.
import { RotateCcw, X } from "lucide-react";
import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useFocusTrap } from "./focus";
import { useA11yT, usePageLang } from "./i18n";
import { isCustomised, resetPrefs, setPrefs, SHORTCUT, SIZES, useForcedColors, usePrefs, useSystemReducedMotion, type Prefs } from "./prefs";
import { pause, pickVoice, RATES, readPage, readText, resume, setRate, setVoice, stop, ttsSupported, useSpeech, useVoices, voicesFor } from "./speech";

/** Xalqaro «universal kirish» belgisi (doira ichida qo'llarini yoygan odam) */
export function UniversalAccessIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false">
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="6.8" r="1.4" fill="currentColor" stroke="none" />
      <path d="M7 9.6l5 1.1 5-1.1" />
      <path d="M12 10.7v3.3" />
      <path d="M9.4 18l2.6-4 2.6 4" />
    </svg>
  );
}

type Opt<V> = { v: V; label: ReactNode; style?: CSSProperties; className?: string; aria?: string };

/** Radio guruh (fieldset + legend): strelkalar bilan tanlanadi, tugmalar ko'rinishida */
function Seg<V extends string | number>({ legend, value, options, onChange, cols, hint, kind = "seg", srLegend }: { legend: string; value: V; options: Opt<V>[]; onChange: (v: V) => void; cols?: number; hint?: string; kind?: "seg" | "cards"; srLegend?: boolean }) {
  const name = useId();
  const hintId = useId();
  return (
    <fieldset className={`a11y-fs a11y-${kind}`} aria-describedby={hint ? hintId : undefined}>
      <legend className={srLegend ? "a11y-sr" : undefined}>{legend}</legend>
      <div className="a11y-opts" style={cols ? ({ "--cols": cols } as CSSProperties) : undefined}>
        {options.map((o) => (
          <label key={String(o.v)} className={`a11y-opt ${o.className || ""}`} style={o.style}>
            <input type="radio" name={name} value={String(o.v)} checked={value === o.v} onChange={() => onChange(o.v)} aria-label={o.aria} />
            <span className="a11y-opt-in">{o.label}</span>
          </label>
        ))}
      </div>
      {hint && (
        <p className="a11y-hint" id={hintId}>
          {hint}
        </p>
      )}
    </fieldset>
  );
}

function Switch({ label, checked, onChange, disabled, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; hint?: string }) {
  const hintId = useId();
  return (
    <label className={`a11y-sw ${disabled ? "dis" : ""}`}>
      <input type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} aria-describedby={hint ? hintId : undefined} />
      <span className="a11y-sw-txt">
        {label}
        {hint && (
          <small id={hintId} className="a11y-hint">
            {hint}
          </small>
        )}
      </span>
      <span className="a11y-sw-track" aria-hidden>
        <i />
      </span>
    </label>
  );
}

const SCHEMES: Prefs["scheme"][] = ["default", "hc-dark", "hc-light", "yellow", "blue", "gray"];

function Speech({ selection }: { selection: string }) {
  const t = useA11yT();
  const lang = usePageLang();
  const sp = useSpeech();
  const voices = useVoices();
  const [msg, setMsg] = useState("");
  if (!ttsSupported()) return <p className="a11y-note">{t.no_tts}</p>;
  const { voice, exact } = pickVoice(lang, voices);
  const fallbackCodes = lang === "uz" ? ["uz", "tr", "kk", "ru"] : [lang];
  const list = fallbackCodes.flatMap((c) => voicesFor(c as typeof lang, voices));
  const chosen = sp.voices[lang] || "";
  return (
    <>
      {voices.length > 0 && !exact && <p className="a11y-note">{lang === "uz" ? t.no_voice_uz : t.no_voice}</p>}
      <div className="a11y-row">
        {sp.status === "idle" ? (
          <>
            <button type="button" className="a11y-btn primary" onClick={() => readPage(undefined, t.img_alt)}>
              {t.read_page}
            </button>
            <button
              type="button"
              className="a11y-btn"
              onClick={() => {
                const s = (window.getSelection()?.toString() || selection).trim();
                if (!s) setMsg(t.no_sel);
                else {
                  setMsg("");
                  readText(s);
                }
              }}
            >
              {t.read_sel}
            </button>
          </>
        ) : (
          <>
            <button type="button" className="a11y-btn primary" onClick={() => (sp.status === "playing" ? pause() : resume())}>
              {sp.status === "playing" ? t.pause : t.resume}
            </button>
            <button type="button" className="a11y-btn" onClick={stop}>
              {t.stop}
            </button>
          </>
        )}
      </div>
      <p className="a11y-live" role="status">
        {msg}
      </p>
      <Seg legend={t.rate} value={sp.rate} onChange={setRate} options={RATES.map((r) => ({ v: r, label: `${r}×` }))} />
      {list.length > 1 && (
        <label className="a11y-field">
          <span>{t.voice}</span>
          <select value={chosen} onChange={(e) => setVoice(lang, e.target.value)}>
            <option value="">
              {t.voice_auto}
              {voice ? ` — ${voice.name}` : ""}
            </option>
            {list.map((v) => (
              <option key={v.voiceURI} value={v.voiceURI}>
                {v.name} ({v.lang})
              </option>
            ))}
          </select>
        </label>
      )}
    </>
  );
}

export function A11yPanel({ open, onClose, selection }: { open: boolean; onClose: () => void; selection: string }) {
  const t = useA11yT();
  const p = usePrefs();
  const forced = useForcedColors();
  const sysStill = useSystemReducedMotion();
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const [status, setStatus] = useState("");
  // Tab oxirgi elementdan keyin brauzer paneliga emas, panelning boshiga qaytadi
  useFocusTrap(ref, open, false);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      opener.current = document.activeElement as HTMLElement | null;
      setStatus("");
      try {
        d.showModal();
      } catch {
        d.setAttribute("open", "");
      }
      // sarlavha emas, birinchi sozlama fokuslanadi (yopish tugmasini tasodifan bosib yubormaslik uchun)
      d.querySelector<HTMLInputElement>("input:checked")?.focus();
      document.documentElement.classList.add("a11y-lock");
    } else if (!open && d.open) {
      d.close();
    }
  }, [open]);

  const onDialogClose = () => {
    document.documentElement.classList.remove("a11y-lock");
    onClose();
    const o = opener.current;
    if (o && document.contains(o)) window.setTimeout(() => o.focus({ preventScroll: true }), 0);
  };

  const set = <K extends keyof Prefs>(k: K) => (v: Prefs[K]) => setPrefs({ [k]: v } as Partial<Prefs>);
  const sp = (k: "line" | "letter" | "word") => (
    <Seg legend={t[k]} value={p[k]} onChange={set(k)} options={[0, 1, 2].map((v) => ({ v, label: t.sp[v] }))} />
  );

  return (
    <dialog
      ref={ref}
      className="a11y-dlg"
      aria-labelledby={titleId}
      onClose={onDialogClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onMouseDown={(e) => {
        // fon (dialog tashqarisi) bosilganda yopiladi
        if (e.target !== e.currentTarget) return;
        const r = e.currentTarget.getBoundingClientRect();
        if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) onClose();
      }}
    >
      <div className="a11y-in">
        <header className="a11y-head">
          <h2 id={titleId}>
            <UniversalAccessIcon size={24} />
            {t.title}
          </h2>
          <button type="button" className="a11y-x" onClick={onClose} aria-label={t.close} title={`${t.close} (Esc)`}>
            <X size={22} aria-hidden />
          </button>
        </header>

        <div className="a11y-body">
          <section className="a11y-sec" aria-labelledby={`${titleId}-t`}>
            <h3 id={`${titleId}-t`}>{t.sec_text}</h3>
            <Seg legend={t.size} value={p.size} onChange={set("size")} options={SIZES.map((s) => ({ v: s, label: `${s}%` }))} />
            <Seg
              legend={t.font}
              kind="cards"
              cols={3}
              value={p.font}
              onChange={set("font")}
              options={[
                { v: "default", label: <FontSample name={t.font_default} cls="a11y-f-default" /> },
                { v: "legible", label: <FontSample name={t.font_legible} cls="a11y-f-legible" /> },
                { v: "dyslexic", label: <FontSample name={t.font_dyslexic} cls="a11y-f-dyslexic" /> },
              ]}
            />
            {sp("line")}
            {sp("letter")}
            {sp("word")}
          </section>

          <section className="a11y-sec" aria-labelledby={`${titleId}-c`}>
            <h3 id={`${titleId}-c`}>{t.sec_colour}</h3>
            {forced && <p className="a11y-note">{t.forced}</p>}
            <Seg
              legend={t.sec_colour}
              srLegend
              kind="cards"
              cols={3}
              value={p.scheme}
              onChange={set("scheme")}
              options={SCHEMES.map((s) => ({
                v: s,
                className: `a11y-sw-${s}`,
                label: (
                  <>
                    <span className="a11y-swatch a11y-keep" aria-hidden>
                      Aa
                    </span>
                    <span className="a11y-opt-name">{t[`sc_${s}` as const]}</span>
                  </>
                ),
              }))}
            />
          </section>

          <section className="a11y-sec" aria-labelledby={`${titleId}-i`}>
            <h3 id={`${titleId}-i`}>{t.sec_images}</h3>
            <Seg
              legend={t.sec_images}
              srLegend
              value={p.images}
              onChange={set("images")}
              hint={p.images === "hide" ? t.img_hide_hint : undefined}
              options={[
                { v: "show", label: t.img_show },
                { v: "hide", label: t.img_hide },
                { v: "gray", label: t.img_gray },
              ]}
            />
          </section>

          <section className="a11y-sec" aria-labelledby={`${titleId}-n`}>
            <h3 id={`${titleId}-n`}>{t.sec_nav}</h3>
            <div className="a11y-sws">
              <Switch label={t.links} checked={p.links} onChange={set("links")} />
              <Switch label={t.focus} checked={p.focus} onChange={set("focus")} />
              <Switch label={t.cursor} checked={p.cursor} onChange={set("cursor")} />
              <Switch label={t.still} checked={p.still || sysStill} disabled={sysStill && !p.still} hint={sysStill && !p.still ? t.still_sys : undefined} onChange={set("still")} />
            </div>
            <Seg
              legend={t.guide}
              value={p.guide}
              onChange={set("guide")}
              options={[
                { v: "off", label: t.guide_off },
                { v: "line", label: t.guide_line },
                { v: "mask", label: t.guide_mask },
              ]}
            />
          </section>

          <section className="a11y-sec" aria-labelledby={`${titleId}-s`}>
            <h3 id={`${titleId}-s`}>{t.sec_speech}</h3>
            <Speech selection={selection} />
          </section>

          <section className="a11y-sec" aria-labelledby={`${titleId}-k`}>
            <h3 id={`${titleId}-k`}>{t.keys}</h3>
          <dl className="a11y-keys">
            <div>
              <dt>
                <kbd>{SHORTCUT}</kbd>
              </dt>
              <dd>{t.shortcut_open}</dd>
            </div>
            <div>
              <dt>
                <kbd>Esc</kbd>
              </dt>
              <dd>{t.shortcut_close}</dd>
            </div>
          </dl>
          </section>
        </div>

        <footer className="a11y-foot">
          <button
            type="button"
            className="a11y-btn"
            disabled={!isCustomised(p)}
            onClick={() => {
              resetPrefs();
              setStatus(t.reset_done);
            }}
          >
            <RotateCcw size={18} aria-hidden />
            {t.reset}
          </button>
          <p className="a11y-live" role="status">
            {status}
          </p>
          <Link to="/accessibility" className="a11y-link" onClick={onClose}>
            {t.statement}
          </Link>
        </footer>
      </div>
    </dialog>
  );
}

function FontSample({ name, cls }: { name: string; cls: string }) {
  return (
    <>
      <span className={`a11y-fsample ${cls}`} aria-hidden>
        Aa Бб
      </span>
      <span className="a11y-opt-name">{name}</span>
    </>
  );
}

