import { DatePicker, type PickerMode } from "../lib/DatePicker";
import { Check, ImagePlus, Loader2, Trash2, Upload, X } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { Lang } from "../lib/api";
import { admin, errMsg, type Media } from "./api";
import { MdBreadcrumb } from "../lib/MdShell";

/* ------------------------------------------------------------------ bildirishnomalar */
interface Toast {
  id: number;
  text: string;
  kind: "ok" | "error";
}
const ToastCtx = createContext<(text: string, kind?: Toast["kind"]) => void>(() => undefined);
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [list, setList] = useState<Toast[]>([]);
  const push = useCallback((text: string, kind: Toast["kind"] = "ok") => {
    const id = Date.now() + Math.random();
    setList((l) => [...l, { id, text, kind }]);
    setTimeout(() => setList((l) => l.filter((x) => x.id !== id)), 4200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="a-toasts">
        {list.map((t) => (
          <div key={t.id} className={`a-toast ${t.kind}`}>
            {t.kind === "ok" ? <Check size={16} /> : <X size={16} />}
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/** Asinxron amal: xato bo'lsa bildirishnoma */
export function useRun() {
  const toast = useToast();
  return useCallback(
    async <T,>(fn: () => Promise<T>, okText?: string): Promise<T | undefined> => {
      try {
        const r = await fn();
        if (okText) toast(okText);
        return r;
      } catch (e) {
        toast(errMsg(e), "error");
        return undefined;
      }
    },
    [toast],
  );
}

/* ------------------------------------------------------------------ oddiy elementlar */
export function Btn({ children, onClick, kind = "default", icon, disabled, busy, type = "button", size = "md", title, className = "", pressed }: { children?: ReactNode; onClick?: () => void; kind?: "default" | "primary" | "ghost" | "danger" | "accent"; icon?: ReactNode; disabled?: boolean; busy?: boolean; type?: "button" | "submit"; size?: "sm" | "md"; title?: string; className?: string; pressed?: boolean }) {
  return (
    <button type={type} className={`a-btn ${kind} ${size} ${className}`} onClick={onClick} disabled={disabled || busy} title={title} aria-label={title} aria-pressed={pressed}>
      {busy ? <Loader2 size={15} className="spin" /> : icon}
      {children && <span>{children}</span>}
    </button>
  );
}

export function Field({ label, hint, children, wide }: { label: ReactNode; hint?: ReactNode; children: ReactNode; wide?: boolean }) {
  return (
    <label className={`a-field ${wide ? "wide" : ""}`}>
      <span className="a-label">{label}</span>
      {children}
      {hint && <span className="a-hint">{hint}</span>}
    </label>
  );
}

export function Input(p: React.InputHTMLAttributes<HTMLInputElement>) {
  // sana/vaqt maydonlari — brauzerning standart tanlagichi o'rniga institut mavzusidagi kalendar
  if (p.type === "date" || p.type === "datetime-local" || p.type === "time") {
    const v = String(p.value ?? "");
    return (
      <DatePicker
        mode={p.type as PickerMode}
        value={p.type === "datetime-local" ? v.slice(0, 16) : v}
        disabled={p.disabled}
        className={p.className}
        style={p.style}
        min={typeof p.min === "string" ? p.min : undefined}
        max={typeof p.max === "string" ? p.max : undefined}
        placeholder={p.placeholder}
        clearable={!p.required}
        onChange={(value) => p.onChange?.({ target: { value }, currentTarget: { value } } as unknown as React.ChangeEvent<HTMLInputElement>)}
      />
    );
  }
  return <input {...p} className={`a-input ${p.className || ""}`} />;
}

export function Textarea(p: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...p} className={`a-input ${p.className || ""}`} />;
}

export function Select<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <select className="a-input" value={value} onChange={(e) => onChange(e.target.value as T)}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; hint?: ReactNode }) {
  return (
    <label className="a-toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="a-toggle-track" />
      <span className="a-toggle-text">
        {label}
        {hint && <small>{hint}</small>}
      </span>
    </label>
  );
}

export function Card({ title, sub, actions, children, className = "", pad = true }: { title?: ReactNode; sub?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; pad?: boolean }) {
  return (
    <section className={`a-card ${className}`}>
      {(title || actions) && (
        <header className="a-card-head">
          <div>
            {title && <h3>{title}</h3>}
            {sub && <p>{sub}</p>}
          </div>
          {actions && <div className="a-card-actions">{actions}</div>}
        </header>
      )}
      <div className={pad ? "a-card-body" : ""}>{children}</div>
    </section>
  );
}

/** Sahifa sarlavhasi (MatDash): chapda nom va izoh, o'ngda asosiy amallar va yo'l (breadcrumb). */
export function PageHead({ title, sub, actions }: { title: string; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className={`a-page-head ${actions ? "has-actions" : ""}`}>
      <div className="a-page-title">
        <h1>{title}</h1>
        {sub && <p>{sub}</p>}
      </div>
      <div className="a-page-side">
        <MdBreadcrumb />
        {actions && <div className="a-page-actions">{actions}</div>}
      </div>
    </div>
  );
}

export function Pill({ tone = "muted", children }: { tone?: "ok" | "warn" | "bad" | "muted" | "accent" | "info"; children: ReactNode }) {
  return <span className={`a-pill ${tone}`}>{children}</span>;
}

export function Empty({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="a-empty">
      {icon}
      <b>{title}</b>
      {children}
    </div>
  );
}

export function Spinner() {
  return (
    <div className="a-loading">
      <Loader2 size={24} className="spin" />
    </div>
  );
}

export function Modal({ open, onClose, title, children, footer, width = 560 }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; width?: number }) {
  const bg = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    // Escape faqat eng yuqoridagi oynani yopadi (ichma-ich oyna, kalendar ochiq bo'lsa — tahrirlash oynasi yopilib, kiritilgan ma'lumot yo'qolmaydi)
    const k = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      const all = document.querySelectorAll(".a-modal-bg");
      if (all.length && all[all.length - 1] !== bg.current) return;
      e.preventDefault();
      onClose();
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div ref={bg} className="a-modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="a-modal" style={{ maxWidth: width }} role="dialog" aria-modal="true">
        <header>
          <h3>{title}</h3>
          <button className="a-icon" onClick={onClose} aria-label="Yopish">
            <X size={18} />
          </button>
        </header>
        <div className="a-modal-body">{children}</div>
        {footer && <footer>{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}

/** Tasdiqlash oynasi (window.confirm o'rniga) */
const ConfirmCtx = createContext<(text: string, danger?: boolean) => Promise<boolean>>(async () => false);
export const useConfirm = () => useContext(ConfirmCtx);
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [st, setSt] = useState<{ text: string; danger: boolean; resolve: (v: boolean) => void } | null>(null);
  const ask = useCallback((text: string, danger = true) => new Promise<boolean>((resolve) => setSt({ text, danger, resolve })), []);
  const close = (v: boolean) => {
    st?.resolve(v);
    setSt(null);
  };
  return (
    <ConfirmCtx.Provider value={ask}>
      {children}
      <Modal
        open={!!st}
        onClose={() => close(false)}
        title="Tasdiqlang"
        width={420}
        footer={
          <>
            <Btn onClick={() => close(false)}>Bekor qilish</Btn>
            <Btn kind={st?.danger ? "danger" : "primary"} onClick={() => close(true)}>
              Ha
            </Btn>
          </>
        }
      >
        <p style={{ margin: 0 }}>{st?.text}</p>
      </Modal>
    </ConfirmCtx.Provider>
  );
}

/* ------------------------------------------------------------------ teglar */
export function TagInput({ value, onChange, placeholder = "Qo‘shish va Enter", suggestions = [] }: { value: string[]; onChange: (v: string[]) => void; placeholder?: string; suggestions?: string[] }) {
  const [text, setText] = useState("");
  const add = (s: string) => {
    const v = s.trim().replace(/,$/, "");
    if (v && !value.includes(v)) onChange([...value, v]);
    setText("");
  };
  const listId = useRef(`tags-${Math.random().toString(36).slice(2)}`).current;
  return (
    <div className="a-tags">
      {value.map((t) => (
        <span key={t} className="a-tag">
          {t}
          <button type="button" onClick={() => onChange(value.filter((x) => x !== t))} aria-label="O‘chirish">
            <X size={12} />
          </button>
        </span>
      ))}
      <input
        value={text}
        list={suggestions.length ? listId : undefined}
        onChange={(e) => (e.target.value.endsWith(",") ? add(e.target.value) : setText(e.target.value))}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add(text);
          } else if (e.key === "Backspace" && !text && value.length) onChange(value.slice(0, -1));
        }}
        onBlur={() => text && add(text)}
        placeholder={value.length ? "" : placeholder}
      />
      {suggestions.length > 0 && (
        <datalist id={listId}>
          {suggestions.filter((s) => !value.includes(s)).map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ media */
export function MediaLibrary({ open, onClose, onPick, accept = "image" }: { open: boolean; onClose: () => void; onPick: (m: Media) => void; accept?: "image" | "pdf" | "video" | "any" }) {
  const [items, setItems] = useState<Media[] | null>(null);
  const [busy, setBusy] = useState(false);
  const run = useRun();
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (open) admin.media().then((r) => setItems(r.items)).catch(() => setItems([]));
  }, [open]);
  const shown = (items || []).filter((m) =>
    accept === "any" ? true : accept === "video" ? m.mime.startsWith("video/") : accept === "pdf" ? !m.mime.startsWith("image/") && !m.mime.startsWith("video/") : m.mime.startsWith("image/"),
  );
  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    for (const f of Array.from(files)) {
      const m = await run(() => admin.upload(f));
      if (m) {
        setItems((l) => [m, ...(l || [])]);
        if (files.length === 1) {
          onPick(m);
          onClose();
        }
      }
    }
    setBusy(false);
  };
  return (
    <Modal open={open} onClose={onClose} title="Media kutubxona" width={860}>
      <div
        className="a-drop"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          upload(e.dataTransfer.files);
        }}
        onClick={() => input.current?.click()}
      >
        {busy ? <Loader2 className="spin" /> : <Upload size={20} />}
        <b>Fayl yuklash</b>
        <span>{accept === "video" ? "Sudrab tashlang yoki bosing · MP4, WEBM · 80 MB gacha" : "Sudrab tashlang yoki bosing · PNG, JPG, WEBP, GIF, PDF, DOCX, XLSX, PPTX · 15 MB gacha"}</span>
        <input ref={input} type="file" hidden multiple accept={accept === "video" ? "video/mp4,video/webm" : accept === "pdf" ? "application/pdf,.docx,.xlsx,.pptx" : accept === "image" ? "image/*" : "image/*,application/pdf,.docx,.xlsx,.pptx,video/mp4,video/webm"} onChange={(e) => upload(e.target.files)} />
      </div>
      {!items ? (
        <Spinner />
      ) : (
        <div className="a-media-grid">
          {shown.map((m) => (
            <button key={m.id} className="a-media" onClick={() => { onPick(m); onClose(); }} title={m.original}>
              {m.mime.startsWith("image/") ? <img src={m.url} alt="" loading="lazy" /> : m.mime.startsWith("video/") ? <video src={m.url} muted preload="metadata" /> : <span className="a-pdf">{m.filename.split(".").pop()?.toUpperCase()}</span>}
              <small>{m.original}</small>
            </button>
          ))}
        </div>
      )}
    </Modal>
  );
}

export function ImageField({ value, onChange, label, accept = "image", aspect = "16 / 9" }: { value: string; onChange: (v: string) => void; label?: string; accept?: "image" | "pdf"; aspect?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="a-imagefield">
      {label && <span className="a-label">{label}</span>}
      {value ? (
        <div className="a-image-prev" style={{ aspectRatio: accept === "pdf" ? undefined : aspect }}>
          {accept === "pdf" ? (
            <a href={value} target="_blank" rel="noreferrer" className="a-pdf-link">
              {value.split(".").pop()?.toUpperCase()}: {value.split("/").pop()}
            </a>
          ) : (
            <img src={value} alt="" />
          )}
          <div className="a-image-tools">
            <Btn size="sm" onClick={() => setOpen(true)}>
              Almashtirish
            </Btn>
            <Btn size="sm" kind="ghost" icon={<Trash2 size={14} />} onClick={() => onChange("")} title="Olib tashlash" />
          </div>
        </div>
      ) : (
        <button type="button" className="a-image-empty" onClick={() => setOpen(true)} style={{ aspectRatio: accept === "pdf" ? undefined : aspect }}>
          <ImagePlus size={22} />
          <span>{accept === "pdf" ? "Fayl tanlash (PDF, DOCX…)" : "Rasm tanlash"}</span>
        </button>
      )}
      <MediaLibrary open={open} onClose={() => setOpen(false)} onPick={(m) => onChange(m.url)} accept={accept} />
    </div>
  );
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function fmtNum(n: number | null | undefined, d = 0): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return n.toLocaleString("ru-RU", { maximumFractionDigits: d, minimumFractionDigits: d }).replace(/ /g, " ");
}

/* ------------------------------------------------------------------ tillar (tarjimalar) */
export const LANG_LABEL: Record<Lang, string> = { uz: "O‘zbekcha", ru: "Русский", en: "English" };

let baseLangPromise: Promise<Lang> | null = null;
/** Saytning asosiy tili (admin → Sayt): kontentning asl matni shu tilda yoziladi. */
export function useBaseLang(): Lang | null {
  const [l, setL] = useState<Lang | null>(null);
  useEffect(() => {
    baseLangPromise ||= admin
      .site()
      .then((s) => s.lang || "uz")
      .catch(() => "uz" as Lang);
    baseLangPromise.then(setL);
  }, []);
  return l;
}
export function resetBaseLang() {
  baseLangPromise = null;
}

/** Til tablari: asosiy til + tarjimalar; nuqta — shu tilda matn bor. */
export function LangTabs({ value, onChange, base, filled }: { value: Lang; onChange: (l: Lang) => void; base: Lang; filled: (l: Lang) => boolean }) {
  const order: Lang[] = [base, ...(["uz", "ru", "en"] as Lang[]).filter((x) => x !== base)];
  return (
    <div className="lang-tabs" role="tablist" aria-label="Til">
      {order.map((l) => (
        <button key={l} role="tab" aria-selected={value === l} className={`${value === l ? "on" : ""} ${filled(l) ? "filled" : ""}`} onClick={() => onChange(l)} title={l === base ? "Asosiy til — asl matn" : filled(l) ? "Tarjima bor" : "Tarjima hali yo‘q"}>
          <b>{l.toUpperCase()}</b>
          <span>{LANG_LABEL[l]}</span>
          {l === base ? <small>asosiy</small> : <i />}
        </button>
      ))}
    </div>
  );
}

/** Ro'yxatda: qaysi tillarda yozilgani. */
export function LangBadges({ langs }: { langs?: Lang[] }) {
  if (!langs || langs.length < 2) return null;
  return (
    <span className="lang-badges" title="Mavjud tillar">
      {langs.map((l) => (
        <span key={l}>{l.toUpperCase()}</span>
      ))}
    </span>
  );
}
