// Kutubxona umumiy komponentlari: til konteksti, muqova, yulduzlar, format belgilari, kitob kartochkasi, javon tugmasi
import { BookOpen, Check, FileText, Headphones, Plus, Star } from "lucide-react";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate, type LinkProps } from "react-router-dom";
import { ApiError, auth } from "../lib/api";
import { lib, type BookCard, type Fmt, type LibFile } from "./api";
import { UZ, type LibDict } from "./i18n-uz";
import { EN, RU } from "./i18n-other";
import "../styles/library.css";

const DICTS: Record<string, LibDict> = { uz: UZ, ru: RU, en: EN };
const LangCtx = createContext<string>("uz");

export function LibLang({ lang, children }: { lang: string; children: ReactNode }) {
  return <LangCtx.Provider value={lang}>{children}</LangCtx.Provider>;
}
export function useLang(): string {
  return useContext(LangCtx);
}

/* ------------------------------------------------------------------ havolalar: ochiq sayt yoki kabinet ichida */
/** Kitob sahifalari qayerda ochiladi: ochiq saytda «/library», kabinetda «/student/library» va h.k.
 *  Kabinet ichidagi barcha kitob havolalari kabinetdagi kitob sahifasiga olib boradi. */
type LibNavT = { base: string; catalog: string; cabinet: boolean };
const NavCtx = createContext<LibNavT>({ base: "/library", catalog: "/library", cabinet: false });
export function LibNav({ base, catalog, cabinet, children }: LibNavT & { children: ReactNode }) {
  return <NavCtx.Provider value={{ base, catalog, cabinet }}>{children}</NavCtx.Provider>;
}
export function useLibNav(): LibNavT & { book: (id: string) => string } {
  const n = useContext(NavCtx);
  return { ...n, book: (id: string) => `${n.base}/book/${id}` };
}

/** Kabinet manzilining boshi (/student, /teacher, /xodim) yoki "" */
export function cabinetBase(path: string): string {
  const m = path.match(/^\/(student|teacher|xodim)(\/|$)/);
  return m ? `/${m[1]}` : "";
}

/** O'quvchi/pleyer qaytadigan sahifa — faqat sayt ichidagi kutubxona yoki kabinet manzillari */
export function safeFrom(v: string | null | undefined): string {
  return v && /^\/(library|student|teacher|xodim)(\/[\w\-/]*)?(\?[\w=&%.+-]*)?$/.test(v) ? v : "";
}

/** O'quvchi (PDF/EPUB) yoki pleyer manzili; `from` — yopilganda qaytiladigan sahifa */
export function readerPath(x: Pick<LibFile, "id" | "kind"> | { file_id: string; kind?: string }, from?: string): string {
  const id = "file_id" in x ? x.file_id : x.id;
  const f = safeFrom(from);
  return `/library/${x.kind === "audio" ? "listen" : "read"}/${id}${f ? `?from=${encodeURIComponent(f)}` : ""}`;
}
/** Hozirgi sahifadan o'quvchiga havola: `state.back` — o'quvchidagi «orqaga» tarixdan bir qadam qaytadi */
export function useReaderLink(): (x: Parameters<typeof readerPath>[0]) => { to: string; state: { back: true } } {
  const loc = useLocation();
  return (x) => ({ to: readerPath(x, loc.pathname + loc.search), state: { back: true } });
}

/** Kim o'qiyapti: undefined — aniqlanmoqda, "" — mehmon, aks holda bosh sahifasi (/student, /teacher, /xodim, /admin) */
export function useViewerHome(skip = false): string | undefined {
  const [home, setHome] = useState<string | undefined>(skip ? "/admin" : undefined);
  useEffect(() => {
    if (skip) return;
    let live = true;
    auth
      .me()
      .then((r) => live && setHome(r.home || "/"))
      .catch(() => live && setHome(""));
    return () => {
      live = false;
    };
  }, [skip]);
  return home;
}

/** O'quvchi/pleyerdagi «yopish» tugmasi: kelgan sahifaga qaytadi.
 *  Sayt ichidan ochilgan bo'lsa (state.back) — tarixda bir qadam orqaga (brauzerning «orqaga» tugmasi bilan bir xil natija);
 *  to'g'ridan-to'g'ri ochilgan bo'lsa — `from` manziliga, u bo'lmasa: kirgan foydalanuvchi — kabinetdagi kitob sahifasiga,
 *  mehmon — ochiq saytdagi kitob sahifasiga (o'quvchi yozuvi almashtiriladi). */
export function useReaderBack(bookId: string, admin: boolean, home: string | undefined): Pick<LinkProps, "to" | "replace" | "onClick"> {
  const loc = useLocation();
  const nav = useNavigate();
  const from = safeFrom(new URLSearchParams(loc.search).get("from"));
  const inApp = !!(loc.state as { back?: boolean } | null)?.back && (window.history.state?.idx ?? 0) > 0;
  const cab = home && /^\/(student|teacher|xodim)$/.test(home) ? home : "";
  const to = admin ? `/admin/library/books/${bookId}` : from || (cab ? `${cab}/library/book/${bookId}` : `/library/book/${bookId}`);
  return {
    to,
    replace: !admin,
    onClick: (e) => {
      if (admin || !inApp || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
      e.preventDefault();
      nav(-1);
    },
  };
}

/** Fayl ochiq fondmi (mehmonlar ham o'qiy oladi) va hozirgi foydalanuvchi uni o'qiy oladimi */
export function filePublic(x: LibFile): boolean {
  return x.access === "public";
}
export function canRead(x: LibFile, logged: boolean): boolean {
  return typeof x.can_read === "boolean" ? x.can_read : logged ? x.allowed !== false : filePublic(x);
}
export function useLT(): LibDict {
  return DICTS[useContext(LangCtx)] || UZ;
}
export function f(s: string, vars: Record<string, string | number>): string {
  return s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));
}
export function errText(e: unknown, T: LibDict): string {
  const d = e instanceof ApiError ? e.detail : "";
  return ((T as Record<string, string>)[`err_${d}`] as string) || d || T.err_generic;
}
const UZ_MONTHS = ["yan", "fev", "mar", "apr", "may", "iyun", "iyul", "avg", "sen", "okt", "noy", "dek"];
export function fmtDate(iso: string | null | undefined, lang: string): string {
  if (!iso) return "";
  const d = new Date(iso.length <= 10 ? iso + "T12:00:00" : iso);
  if (isNaN(d.getTime())) return iso;
  // brauzerlarda o'zbekcha oy nomlari turlicha chiqadi — o'zimiz yozamiz
  if (lang === "uz") return `${d.getDate()}-${UZ_MONTHS[d.getMonth()]}, ${d.getFullYear()}`;
  return d.toLocaleDateString(lang, { day: "numeric", month: "short", year: "numeric" });
}
export function money(n: number, cur: string): string {
  return `${Math.round(n).toLocaleString("ru-RU").replace(/,/g, " ")} ${cur}`;
}

export function readerLang(): string {
  try {
    // admin panelidan ochilgan ko'rib chiqish — panel tili
    const v = localStorage.getItem(window.location.pathname.startsWith("/admin") ? "admin_lang" : "lang");
    if (v === "ru" || v === "en" || v === "uz") return v;
  } catch {
    /* */
  }
  return "uz";
}

/* ------------------------------------------------------------------ muqova (rasm bo'lmasa — nom bilan chizilgan) */
/** Muqova: faqat haqiqiy rasm. Rasm yo'q (yoki yuklanmadi) — hech narsa chizilmaydi, sarlavhadan «soxta muqova» yasalmaydi. */
export function Cover({ title, src, size = "md", className = "" }: { title: string; src?: string; size?: "sm" | "md" | "lg"; className?: string }) {
  const [bad, setBad] = useState(false);
  if (!src || bad) return null;
  return (
    <span className={`lb-cover ${size} ${className}`}>
      <img src={src} alt={title} loading="lazy" onError={() => setBad(true)} />
    </span>
  );
}

export function Stars({ value, size = 14, onPick, label }: { value: number; size?: number; onPick?: (n: number) => void; label?: string }) {
  const [hover, setHover] = useState(0);
  const v = hover || value;
  return (
    <span className={`lb-stars ${onPick ? "pick" : ""}`} role={onPick ? "radiogroup" : "img"} aria-label={label || `${value.toFixed(1)} / 5`} onMouseLeave={() => setHover(0)}>
      {[1, 2, 3, 4, 5].map((i) => {
        const fill = Math.max(0, Math.min(1, v - (i - 1)));
        const el = (
          <span className="lb-star" key={i}>
            <Star size={size} className="bg" />
            <span className="fg" style={{ width: `${fill * 100}%` }}>
              <Star size={size} />
            </span>
          </span>
        );
        return onPick ? (
          <button key={i} type="button" role="radio" aria-checked={value === i} aria-label={`${i}`} onMouseEnter={() => setHover(i)} onClick={() => onPick(i)}>
            {el}
          </button>
        ) : (
          el
        );
      })}
    </span>
  );
}

export function FmtBadges({ formats }: { formats: Fmt[] }) {
  const T = useLT();
  const icon = { paper: <BookOpen size={12} />, pdf: <FileText size={12} />, epub: <BookOpen size={12} />, audio: <Headphones size={12} /> };
  const label = { paper: T.fmt_paper, pdf: T.fmt_pdf, epub: T.fmt_epub, audio: T.fmt_audio };
  return (
    <span className="lb-fmts">
      {formats.map((x) => (
        <span key={x} className={`lb-fmt f-${x}`}>
          {icon[x]} {label[x]}
        </span>
      ))}
    </span>
  );
}

export function AvailLine({ b }: { b: Pick<BookCard, "copies" | "free" | "formats"> }) {
  const T = useLT();
  if (!b.copies) return <span className="lb-avail e">{b.formats.length ? T.e_only : T.no_paper}</span>;
  return <span className={`lb-avail ${b.free ? "ok" : "busy"}`}>{b.free ? f(T.copies_of, { n: b.copies, free: b.free }) : T.all_busy}</span>;
}

export function BookTile({ b, base }: { b: BookCard; base?: string }) {
  const nb = useContext(NavCtx).base;
  base = base || nb;
  return (
    <Link to={`${base}/book/${b.id}`} className="lb-tile">
      <Cover title={b.title} src={b.cover} />
      <span className="lb-tile-body">
        <b className="lb-tile-t">{b.title}</b>
        <small className="lb-tile-a">{b.authors.join(", ")}</small>
        <span className="lb-tile-meta">
          {b.ratings > 0 && (
            <span className="lb-tile-r">
              <Stars value={b.rating} size={12} /> <em>{b.rating.toFixed(1)}</em>
            </span>
          )}
          <FmtBadges formats={b.formats} />
        </span>
        <AvailLine b={b} />
      </span>
    </Link>
  );
}

export function BookRow({ b, base, right }: { b: BookCard; base?: string; right?: ReactNode }) {
  const T = useLT();
  const nb = useContext(NavCtx).base;
  base = base || nb;
  return (
    <div className="lb-row">
      {b.cover && (
        <Link to={`${base}/book/${b.id}`} className="lb-row-cover" tabIndex={-1}>
          <Cover title={b.title} src={b.cover} size="sm" />
        </Link>
      )}
      <div className="lb-row-body">
        <Link to={`${base}/book/${b.id}`} className="lb-row-t">
          {b.title}
        </Link>
        <small>
          {b.authors.join(", ")}
          {b.year ? ` · ${b.year}` : ""}
        </small>
        {b.snippet && <p className="lb-snippet">…{b.snippet.replace(/\[|\]/g, "")}…</p>}
        <span className="lb-row-meta">
          {b.ratings > 0 && (
            <span className="lb-tile-r">
              <Stars value={b.rating} size={12} /> <em>{b.rating.toFixed(1)}</em>
              <i>({f(T.ratings_n, { n: b.ratings })})</i>
            </span>
          )}
          <FmtBadges formats={b.formats} />
          <AvailLine b={b} />
        </span>
      </div>
      {right}
    </div>
  );
}

export function Shelfbar({ title, items, base, icon }: { title: string; items: BookCard[] | undefined; base?: string; icon?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  if (!items?.length) return null;
  return (
    <section className="lb-strip">
      <div className="lb-strip-h">
        <h2>
          {icon} {title}
        </h2>
        <span className="lb-strip-nav">
          <button aria-label="‹" onClick={() => ref.current?.scrollBy({ left: -ref.current.clientWidth * 0.8, behavior: "smooth" })}>
            ‹
          </button>
          <button aria-label="›" onClick={() => ref.current?.scrollBy({ left: ref.current.clientWidth * 0.8, behavior: "smooth" })}>
            ›
          </button>
        </span>
      </div>
      <div className="lb-strip-row" ref={ref}>
        {items.map((b) => (
          <BookTile key={b.id} b={b} base={base} />
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ javonga qo'shish (menyu) */
export function ShelfButton({ bookId, shelves, onChange }: { bookId: string; shelves: string[]; onChange?: (ids: string[]) => void }) {
  const T = useLT();
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<{ id: string; name: string; kind: string }[] | null>(null);
  const [mine, setMine] = useState(shelves);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => setMine(shelves), [shelves]);
  useEffect(() => {
    if (!open) return;
    if (!list) lib.me().then((r) => setList(r.shelves)).catch(() => setList([]));
    const close = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open, list]);
  const name = (s: { name: string; kind: string }) => (s.kind === "reading" ? T.shelf_reading : s.kind === "want" ? T.shelf_want : s.kind === "done" ? T.shelf_done : s.name);
  const toggle = async (sid: string) => {
    const on = mine.includes(sid);
    const r = on ? await lib.shelfRemove(sid, bookId) : await lib.shelfAdd(sid, bookId);
    setMine(r.shelves);
    onChange?.(r.shelves);
  };
  return (
    <div className="lb-shelfbtn" ref={box}>
      <button className="lb-btn ghost" onClick={() => setOpen(!open)} aria-expanded={open}>
        {mine.length ? <Check size={16} /> : <Plus size={16} />} {mine.length && list ? name(list.find((s) => s.id === mine[0]) || { name: T.add_to_shelf, kind: "" }) : T.add_to_shelf}
      </button>
      {open && (
        <div className="lb-menu">
          {(list || []).map((s) => (
            <button key={s.id} className={mine.includes(s.id) ? "on" : ""} onClick={() => toggle(s.id)}>
              <span>{name(s)}</span>
              {mine.includes(s.id) && <Check size={14} />}
            </button>
          ))}
          <button
            className="new"
            onClick={async () => {
              const n = window.prompt(T.shelf_name);
              if (!n) return;
              const s = await lib.shelfCreate(n);
              setList([...(list || []), s]);
              await toggle(s.id);
            }}
          >
            <Plus size={14} /> {T.new_shelf}
          </button>
        </div>
      )}
    </div>
  );
}
