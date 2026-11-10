// Institut mavzusidagi kalendar (brauzerning standart sana tanlagichi o'rniga): sana, sana+vaqt va vaqt.
// Qiymat formati native input bilan bir xil: "YYYY-MM-DD", "YYYY-MM-DDTHH:mm", "HH:mm" — shuning uchun mavjud kod o'zgarmaydi.
import { CalendarDays, ChevronLeft, ChevronRight, Clock, X } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import "../styles/datepicker.css";

export type PickerMode = "date" | "datetime-local" | "time";

const UZ_MONTHS = ["Yanvar", "Fevral", "Mart", "Aprel", "May", "Iyun", "Iyul", "Avgust", "Sentabr", "Oktabr", "Noyabr", "Dekabr"];
const UZ_DAYS = ["Du", "Se", "Ch", "Pa", "Ju", "Sh", "Ya"];
const WORDS: Record<string, { today: string; clear: string; done: string; pick: string; time: string }> = {
  uz: { today: "Bugun", clear: "Tozalash", done: "Tayyor", pick: "Sanani tanlang", time: "Vaqt" },
  ru: { today: "Сегодня", clear: "Очистить", done: "Готово", pick: "Выберите дату", time: "Время" },
  en: { today: "Today", clear: "Clear", done: "Done", pick: "Pick a date", time: "Time" },
};

const pad = (n: number) => String(n).padStart(2, "0");

function pageLang(): string {
  const l = (document.documentElement.lang || "uz").slice(0, 2);
  return WORDS[l] ? l : "uz";
}

function monthNames(lang: string): string[] {
  if (lang === "uz") return UZ_MONTHS;
  const f = new Intl.DateTimeFormat(lang, { month: "long" });
  return Array.from({ length: 12 }, (_, i) => {
    const s = f.format(new Date(2024, i, 1));
    return s.charAt(0).toUpperCase() + s.slice(1);
  });
}

function dayNames(lang: string): string[] {
  if (lang === "uz") return UZ_DAYS;
  const f = new Intl.DateTimeFormat(lang, { weekday: "short" });
  return Array.from({ length: 7 }, (_, i) => f.format(new Date(2024, 0, 1 + i))); // 2024-01-01 — dushanba
}

interface Parts {
  y: number;
  m: number; // 0..11
  d: number;
  hh: number;
  mm: number;
}

function parse(value: string, mode: PickerMode): Parts | null {
  if (!value) return null;
  if (mode === "time") {
    const m = /^(\d{1,2}):(\d{2})/.exec(value);
    return m ? { y: 2000, m: 0, d: 1, hh: +m[1], mm: +m[2] } : null;
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(value);
  return m ? { y: +m[1], m: +m[2] - 1, d: +m[3], hh: m[4] ? +m[4] : 9, mm: m[5] ? +m[5] : 0 } : null;
}

function format(p: Parts, mode: PickerMode): string {
  if (mode === "time") return `${pad(p.hh)}:${pad(p.mm)}`;
  const date = `${p.y}-${pad(p.m + 1)}-${pad(p.d)}`;
  return mode === "date" ? date : `${date}T${pad(p.hh)}:${pad(p.mm)}`;
}

function display(p: Parts | null, mode: PickerMode, lang: string): string {
  if (!p) return "";
  if (mode === "time") return `${pad(p.hh)}:${pad(p.mm)}`;
  const date = lang === "en" ? `${pad(p.d)}/${pad(p.m + 1)}/${p.y}` : `${pad(p.d)}.${pad(p.m + 1)}.${p.y}`;
  return mode === "date" ? date : `${date}, ${pad(p.hh)}:${pad(p.mm)}`;
}

function TimeColumn({ max, step, value, onPick }: { max: number; step: number; value: number; onPick: (v: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const opts = useMemo(() => Array.from({ length: Math.ceil(max / step) }, (_, i) => i * step), [max, step]);
  useLayoutEffect(() => {
    const el = ref.current?.querySelector<HTMLElement>(".on");
    if (el && ref.current) ref.current.scrollTop = el.offsetTop - ref.current.clientHeight / 2 + el.clientHeight / 2;
  }, [value]);
  return (
    <div className="dp-tcol" ref={ref}>
      {opts.map((v) => (
        <button type="button" key={v} className={v === value ? "on" : ""} onClick={() => onPick(v)}>
          {pad(v)}
        </button>
      ))}
    </div>
  );
}

export function DatePicker({
  value,
  onChange,
  mode = "date",
  placeholder,
  min,
  max,
  disabled,
  className,
  style,
  lang: langProp,
  clearable = true,
}: {
  value: string;
  onChange: (v: string) => void;
  mode?: PickerMode;
  placeholder?: string;
  min?: string;
  max?: string;
  disabled?: boolean;
  className?: string;
  style?: CSSProperties;
  lang?: string;
  clearable?: boolean;
}) {
  const lang = langProp || pageLang();
  const w = WORDS[lang] || WORDS.uz;
  const cur = parse(value, mode);
  const now = new Date();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<{ y: number; m: number }>({ y: cur?.y ?? now.getFullYear(), m: cur?.m ?? now.getMonth() });
  const [level, setLevel] = useState<"days" | "months" | "years">("days");
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; up: boolean }>({ top: 0, left: 0, up: false });
  const months = useMemo(() => monthNames(lang), [lang]);
  const days = useMemo(() => dayNames(lang), [lang]);
  const minP = parse(min || "", mode === "time" ? "date" : mode);
  const maxP = parse(max || "", mode === "time" ? "date" : mode);

  useEffect(() => {
    if (open) {
      setView({ y: cur?.y ?? now.getFullYear(), m: cur?.m ?? now.getMonth() });
      setLevel("days");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !btn.current) return;
    const place = () => {
      const r = btn.current!.getBoundingClientRect();
      const h = pop.current?.offsetHeight || 360;
      const wdt = pop.current?.offsetWidth || 300;
      const up = r.bottom + h + 8 > window.innerHeight && r.top - h - 8 > 0;
      setPos({ top: up ? r.top - h - 6 : r.bottom + 6, left: Math.max(8, Math.min(r.left, window.innerWidth - wdt - 8)), up });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, level]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!pop.current?.contains(t) && !btn.current?.contains(t)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // faqat kalendar yopiladi — u ichida turgan oyna (Modal) emas
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const emit = (p: Parts) => onChange(format(p, mode));
  const base: Parts = cur || { y: view.y, m: view.m, d: 1, hh: mode === "time" ? now.getHours() : 9, mm: 0 };
  const outOfRange = (y: number, m: number, d: number) => {
    const k = y * 10000 + m * 100 + d;
    return (minP && k < minP.y * 10000 + minP.m * 100 + minP.d) || (maxP && k > maxP.y * 10000 + maxP.m * 100 + maxP.d);
  };

  // oy jadvali: dushanbadan boshlanadi
  const first = new Date(view.y, view.m, 1);
  const lead = (first.getDay() + 6) % 7;
  const total = new Date(view.y, view.m + 1, 0).getDate();
  const cells: { y: number; m: number; d: number; other: boolean }[] = [];
  for (let i = 0; i < Math.ceil((lead + total) / 7) * 7; i++) {
    const dt = new Date(view.y, view.m, 1 - lead + i);
    cells.push({ y: dt.getFullYear(), m: dt.getMonth(), d: dt.getDate(), other: dt.getMonth() !== view.m });
  }
  const shift = (n: number) => {
    const dt = new Date(view.y, view.m + n, 1);
    setView({ y: dt.getFullYear(), m: dt.getMonth() });
  };
  const yearStart = Math.floor(view.y / 12) * 12;

  const label = display(cur, mode, lang);
  return (
    <>
      <button
        type="button"
        ref={btn}
        disabled={disabled}
        className={`a-input dp-field ${open ? "open" : ""} ${className || ""}`}
        style={style}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        {mode === "time" ? <Clock size={15} /> : <CalendarDays size={15} />}
        <span className={label ? "" : "ph"}>{label || placeholder || (mode === "time" ? "--:--" : w.pick)}</span>
        {clearable && value && !disabled && (
          <i
            className="dp-x"
            role="button"
            aria-label={w.clear}
            onClick={(e) => {
              e.stopPropagation();
              onChange("");
            }}
          >
            <X size={13} />
          </i>
        )}
      </button>
      {open &&
        createPortal(
          <div ref={pop} className={`dp-pop ${pos.up ? "up" : ""} ${mode}`} style={{ top: pos.top, left: pos.left }} role="dialog">
            {mode !== "time" && (
              <>
                <div className="dp-head">
                  <button type="button" className="dp-nav" onClick={() => (level === "days" ? shift(-1) : setView({ ...view, y: view.y - (level === "years" ? 12 : 1) }))} aria-label="prev">
                    <ChevronLeft size={17} />
                  </button>
                  <button type="button" className="dp-title" onClick={() => setLevel(level === "days" ? "months" : level === "months" ? "years" : "days")}>
                    {level === "days" ? `${months[view.m]} ${view.y}` : level === "months" ? view.y : `${yearStart} – ${yearStart + 11}`}
                  </button>
                  <button type="button" className="dp-nav" onClick={() => (level === "days" ? shift(1) : setView({ ...view, y: view.y + (level === "years" ? 12 : 1) }))} aria-label="next">
                    <ChevronRight size={17} />
                  </button>
                </div>
                {level === "days" && (
                  <div className="dp-grid">
                    {days.map((x, i) => (
                      <span key={x} className={`dp-dow ${i >= 5 ? "we" : ""}`}>
                        {x}
                      </span>
                    ))}
                    {cells.map((c) => {
                      const sel = cur && cur.y === c.y && cur.m === c.m && cur.d === c.d;
                      const today = now.getFullYear() === c.y && now.getMonth() === c.m && now.getDate() === c.d;
                      const off = !!outOfRange(c.y, c.m, c.d);
                      const we = (new Date(c.y, c.m, c.d).getDay() + 6) % 7 >= 5;
                      return (
                        <button
                          type="button"
                          key={`${c.y}-${c.m}-${c.d}`}
                          disabled={off}
                          className={`dp-day ${c.other ? "other" : ""} ${sel ? "sel" : ""} ${today ? "today" : ""} ${we ? "we" : ""}`}
                          onClick={() => {
                            emit({ ...base, y: c.y, m: c.m, d: c.d });
                            if (mode === "date") setOpen(false);
                            else setView({ y: c.y, m: c.m });
                          }}
                        >
                          {c.d}
                        </button>
                      );
                    })}
                  </div>
                )}
                {level === "months" && (
                  <div className="dp-grid3">
                    {months.map((x, i) => (
                      <button
                        type="button"
                        key={x}
                        className={`dp-cell ${view.m === i ? "sel" : ""}`}
                        onClick={() => {
                          setView({ ...view, m: i });
                          setLevel("days");
                        }}
                      >
                        {x.slice(0, 3)}
                      </button>
                    ))}
                  </div>
                )}
                {level === "years" && (
                  <div className="dp-grid3">
                    {Array.from({ length: 12 }, (_, i) => yearStart + i).map((y) => (
                      <button
                        type="button"
                        key={y}
                        className={`dp-cell ${view.y === y ? "sel" : ""} ${now.getFullYear() === y ? "today" : ""}`}
                        onClick={() => {
                          setView({ ...view, y });
                          setLevel("months");
                        }}
                      >
                        {y}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
            {mode !== "date" && (
              <div className="dp-time">
                <span className="dp-time-l">
                  <Clock size={14} /> {w.time}
                </span>
                <TimeColumn max={24} step={1} value={base.hh} onPick={(hh) => emit({ ...base, hh })} />
                <b>:</b>
                <TimeColumn max={60} step={5} value={base.mm} onPick={(mm) => emit({ ...base, mm })} />
              </div>
            )}
            <div className="dp-foot">
              <button
                type="button"
                onClick={() => {
                  const n = new Date();
                  emit({ y: n.getFullYear(), m: n.getMonth(), d: n.getDate(), hh: mode === "date" ? 9 : n.getHours(), mm: mode === "date" ? 0 : Math.floor(n.getMinutes() / 5) * 5 });
                  setView({ y: n.getFullYear(), m: n.getMonth() });
                  if (mode === "date") setOpen(false);
                }}
              >
                {mode === "time" ? w.time : w.today}
              </button>
              {clearable && (
                <button
                  type="button"
                  onClick={() => {
                    onChange("");
                    setOpen(false);
                  }}
                >
                  {w.clear}
                </button>
              )}
              {mode !== "date" && (
                <button type="button" className="primary" onClick={() => setOpen(false)}>
                  {w.done}
                </button>
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
