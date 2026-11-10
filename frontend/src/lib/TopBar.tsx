// Admin panel va kabinetlarning yuqori paneli: qidiruv (menyu + kontent) va til tanlagich (saytdagidek)
import {
  ArrowUpRight,
  Briefcase,
  Building2,
  CalendarDays,
  Check,
  CornerDownLeft,
  FileText,
  FolderOpen,
  GraduationCap,
  HelpCircle,
  Inbox,
  Landmark,
  Languages,
  Link2,
  Mail,
  Megaphone,
  Newspaper,
  Search,
  User,
  Users,
  X,
  Zap,
  Gamepad2,
  BookOpen,
  Bell,
  Handshake,
  Layers,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import "../styles/topbar.css";

export type TopMenuItem = { label: string; to: string; icon?: ReactNode; hint?: string; alt?: string[] };
export type TopResult = { type: string; title: string; sub?: string; to: string; external?: boolean; photo?: string; status?: string };
export type TopLabels = {
  search: string;
  menu: string;
  results: string;
  none: string;
  hint: string;
  types: Record<string, string>;
};
type LangOpt = { id: string; label: string; native: string };

const ICONS: Record<string, ReactNode> = {
  news: <Newspaper size={16} />,
  announce: <Megaphone size={16} />,
  event: <CalendarDays size={16} />,
  page: <FileText size={16} />,
  program: <GraduationCap size={16} />,
  faculty: <Landmark size={16} />,
  department: <Building2 size={16} />,
  staff: <User size={16} />,
  vacancy: <Briefcase size={16} />,
  partner: <Handshake size={16} />,
  document: <Layers size={16} />,
  link: <Link2 size={16} />,
  faq: <HelpCircle size={16} />,
  user: <Users size={16} />,
  ticket: <Inbox size={16} />,
  subscriber: <Mail size={16} />,
  assignment: <BookOpen size={16} />,
  material: <FolderOpen size={16} />,
  notice: <Bell size={16} />,
  course: <Users size={16} />,
  test: <Zap size={16} />,
  game: <Gamepad2 size={16} />,
};

const norm = (s: string) =>
  s
    .replace(/[ʻʼ'`‘’]/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase();

function matchMenu(items: TopMenuItem[], q: string): TopMenuItem[] {
  const words = norm(q).split(" ").filter(Boolean);
  if (!words.length) return [];
  return items
    .map((it) => {
      const label = norm(it.label);
      const all = norm([it.label, it.hint || "", ...(it.alt || [])].join(" "));
      const score = label.startsWith(words.join(" ")) ? 3 : words.every((w) => label.includes(w)) ? 2 : words.every((w) => all.includes(w)) ? 1 : 0;
      return { it, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .map((x) => x.it);
}

function Highlight({ text, q }: { text: string; q: string }) {
  const words = norm(q).split(" ").filter((w) => w.length > 1);
  if (!words.length) return <>{text}</>;
  const low = text.toLocaleLowerCase();
  let best = -1;
  let len = 0;
  for (const w of words) {
    const i = low.indexOf(w);
    if (i >= 0 && (best < 0 || i < best)) {
      best = i;
      len = w.length;
    }
  }
  if (best < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, best)}
      <mark>{text.slice(best, best + len)}</mark>
      {text.slice(best + len)}
    </>
  );
}

export function TopSearch({ menu, fetcher, labels, modal = false, onDone, quickLabel }: { menu: TopMenuItem[]; fetcher: (q: string) => Promise<TopResult[]>; labels: TopLabels; modal?: boolean; onDone?: () => void; quickLabel?: string }) {
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [res, setRes] = useState<TopResult[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [cur, setCur] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const quick = modal && !q.trim();
  const menuHits = useMemo(() => (quick ? menu.slice(0, 8) : matchMenu(menu, q)), [menu, q, quick]);
  const flat = useMemo(
    () => [...menuHits.map((m) => ({ kind: "menu" as const, to: m.to, external: false })), ...(res || []).map((r) => ({ kind: "res" as const, to: r.to, external: !!r.external }))],
    [menuHits, res],
  );

  // Ctrl+K / "/" — qidiruvga o'tish (oyna rejimida tugma o'zi ochadi)
  useEffect(() => {
    if (modal) {
      input.current?.focus();
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const typing = tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable;
      if ((e.key === "k" && (e.ctrlKey || e.metaKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        input.current?.focus();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modal]);
  useEffect(() => {
    if (!open || modal) return;
    const close = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open, modal]);
  useEffect(() => {
    setCur(0);
    const s = q.trim();
    if (s.length < 2) {
      setRes(null);
      setBusy(false);
      return;
    }
    setBusy(true);
    let alive = true;
    const h = window.setTimeout(() => {
      fetcher(s)
        .then((r) => alive && setRes(r))
        .catch(() => alive && setRes([]))
        .finally(() => alive && setBusy(false));
    }, 220);
    return () => {
      alive = false;
      window.clearTimeout(h);
    };
  }, [q, fetcher]);

  const go = useCallback(
    (to: string, external: boolean) => {
      setOpen(false);
      setQ("");
      input.current?.blur();
      onDone?.();
      if (external || !to.startsWith("/") || !/^\/(admin|student|teacher|xodim)(\/|$|\?)/.test(to)) window.location.href = to;
      else nav(to);
    },
    [nav, onDone],
  );

  const show = modal || (open && q.trim().length > 0);
  return (
    <div className={`tb-search ${show ? "open" : ""} ${modal ? "modal" : ""}`} ref={box}>
      <Search size={17} className="tb-search-ic" />
      <input
        ref={input}
        value={q}
        placeholder={labels.search}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            if (modal) onDone?.();
            setOpen(false);
            input.current?.blur();
          } else if (e.key === "ArrowDown") {
            e.preventDefault();
            setCur((c) => Math.min(flat.length - 1, c + 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setCur((c) => Math.max(0, c - 1));
          } else if (e.key === "Enter" && flat[cur]) {
            e.preventDefault();
            go(flat[cur].to, flat[cur].external);
          }
        }}
        aria-label={labels.search}
        role="combobox"
        aria-expanded={show}
      />
      {q ? (
        <button className="tb-clear" onClick={() => setQ("")} aria-label="×">
          <X size={14} />
        </button>
      ) : (
        <kbd className="tb-kbd">{modal ? "Esc" : "Ctrl K"}</kbd>
      )}
      {show && (
        <div className="tb-drop" role="listbox" data-no-tr="">
          {menuHits.length > 0 && (
            <div className="tb-group">
              <div className="tb-glabel">{quick ? quickLabel || labels.menu : labels.menu}</div>
              {menuHits.map((m, i) => (
                <button key={m.to} className={`tb-item ${cur === i ? "cur" : ""}`} onMouseEnter={() => setCur(i)} onClick={() => go(m.to, false)} role="option" aria-selected={cur === i}>
                  <span className="tb-ic menu">{m.icon || <CornerDownLeft size={16} />}</span>
                  <span className="tb-txt">
                    <b>
                      <Highlight text={m.label} q={q} />
                    </b>
                    {m.hint && <small>{m.hint}</small>}
                  </span>
                  <CornerDownLeft size={14} className="tb-enter" />
                </button>
              ))}
            </div>
          )}
          {q.trim().length >= 2 && (
            <div className="tb-group">
              <div className="tb-glabel">
                {labels.results}
                {busy && <span className="tb-spin" />}
              </div>
              {(res || []).map((r, k) => {
                const i = menuHits.length + k;
                return (
                  <button key={r.type + r.to + k} className={`tb-item ${cur === i ? "cur" : ""}`} onMouseEnter={() => setCur(i)} onClick={() => go(r.to, !!r.external)} role="option" aria-selected={cur === i}>
                    <span className={`tb-ic t-${r.type}`}>{r.photo ? <img src={r.photo} alt="" /> : ICONS[r.type] || <FileText size={16} />}</span>
                    <span className="tb-txt">
                      <b>
                        <Highlight text={r.title} q={q} />
                      </b>
                      <small>
                        <em>{labels.types[r.type] || r.type}</em>
                        {r.sub ? ` · ${r.sub}` : ""}
                      </small>
                    </span>
                    {r.external ? <ArrowUpRight size={14} className="tb-enter" /> : <CornerDownLeft size={14} className="tb-enter" />}
                  </button>
                );
              })}
              {res && !res.length && !busy && !menuHits.length && <div className="tb-none">{labels.none}</div>}
              {res && !res.length && !busy && menuHits.length > 0 && <div className="tb-none sm">{labels.none}</div>}
            </div>
          )}
          {q.trim().length < 2 && !menuHits.length && !quick && <div className="tb-none">{labels.hint}</div>}
        </div>
      )}
    </div>
  );
}

export function TopLang({ value, options, onChange, title }: { value: string; options: LangOpt[]; onChange: (id: string) => void; title: string }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  return (
    <div className="tb-lang" ref={box} data-no-tr="">
      <button className="tb-lang-btn" onClick={() => setOpen(!open)} aria-haspopup="listbox" aria-expanded={open} title={title} aria-label={title}>
        <Languages size={16} />
        <span>{value.toUpperCase()}</span>
      </button>
      {open && (
        <ul className="tb-lang-menu" role="listbox">
          {options.map((l) => (
            <li key={l.id}>
              <button
                role="option"
                aria-selected={l.id === value}
                className={l.id === value ? "on" : ""}
                onClick={() => {
                  setOpen(false);
                  if (l.id !== value) onChange(l.id);
                }}
              >
                <b>{l.label}</b>
                <span>{l.native}</span>
                {l.id === value && <Check size={14} />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ telefon/planshet: yon menyu (chapdan chiqadigan panel) */
function setSide(open: boolean) {
  document.documentElement.classList.toggle("side-open", open);
}

/** Qobiqda chaqiriladi: sahifa almashganda, Esc bosilganda yoki ekran kengayganda menyu yopiladi */
export function useSideDrawer(path: string) {
  useEffect(() => setSide(false), [path]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setSide(false);
    // menyudagi havola bosilsa (hozirgi sahifaniki bo'lsa ham) — yopiladi
    const onClick = (e: MouseEvent) => (e.target as Element | null)?.closest?.(".a-side a, .md-panel a") && setSide(false);
    const mq = window.matchMedia("(min-width: 1001px)");
    const onMq = () => mq.matches && setSide(false);
    window.addEventListener("keydown", onKey);
    document.addEventListener("click", onClick);
    mq.addEventListener?.("change", onMq);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("click", onClick);
      mq.removeEventListener?.("change", onMq);
      setSide(false);
    };
  }, []);
}

export function SideBackdrop() {
  return <div className="a-side-backdrop" onClick={() => setSide(false)} aria-hidden />;
}

export function SideClose({ label = "×" }: { label?: string }) {
  return (
    <button type="button" className="a-side-close" onClick={() => setSide(false)} aria-label={label} title={label}>
      <X size={20} />
    </button>
  );
}

export function TopBar({ children, left, menuLabel = "Menu" }: { children: ReactNode; left?: ReactNode; menuLabel?: string }) {
  return (
    <header className="tb">
      <div className="tb-left">
        <button
          type="button"
          className="tb-burger"
          aria-label={menuLabel}
          title={menuLabel}
          onClick={() => setSide(!document.documentElement.classList.contains("side-open"))}
        >
          <span />
          <span />
          <span />
        </button>
        {left}
      </div>
      <div className="tb-right">{children}</div>
    </header>
  );
}
