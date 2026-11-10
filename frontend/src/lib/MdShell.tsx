// Admin panel va kabinetlar uchun umumiy qobiq (MatDash tuzilmasi): chapda ikonka-relsi + bo'limlar paneli,
// yuqorida panel (qidiruv, tezkor ilovalar, mavzu, bildirishnomalar, til, profil), o'rtada tekis kontent maydoni.
// Shrift — Onest (main.tsx'da global yuklangan), ranglar va qutilar asosiy sayt bilan bir xil (styles/matdash.css).
import { AlignLeft, Bell, ChevronDown, ExternalLink, Home, LayoutGrid, LogOut, Moon, Search, Sun, X } from "lucide-react";
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import "../styles/matdash.css";
import "../styles/md-apps.css";
import { Avatar } from "./Avatar";
import { BrandMark } from "./brand";
import { SideBackdrop, SideClose, useSideDrawer } from "./TopBar";
import { A11yButton, A11ySkip } from "../a11y/Root";
import { useFocusTrap } from "../a11y/focus";
import { A11Y_DICTS, pageLang } from "../a11y/i18n";

export type MdItem = { to: string; label: string; icon: ReactNode; end?: boolean; badge?: number; hint?: string };
export type MdSection = { cap: string; items: MdItem[] };
export type MdGroup = { id: string; label: string; icon: ReactNode; sections: MdSection[] };
export type MdLink = {
  to: string;
  label: string;
  sub?: string;
  icon: ReactNode;
  external?: boolean;
  count?: number;
  tone?: MdTone;
  /** bitta o'qilmagan bildirishnoma (qo'ng'iroqchada jami songa qo'shiladi; matni ikki qatorgacha) */
  unread?: boolean;
  onOpen?: () => void;
};
export type MdTone = "primary" | "green" | "gold" | "red" | "sky";
export type MdUser = { name: string; role: string; email?: string; photo?: string | null; links: MdLink[]; onLogout: () => void };
export type MdLabels = {
  menu: string;
  search: string;
  apps: string;
  appsTitle: string;
  notes: string;
  notesEmpty: string;
  theme: string;
  profile: string;
  logout: string;
  home: string;
  site: string;
};

/* ------------------------------------------------------------------ sahifa sarlavhasi uchun yo'l (breadcrumb) */
export type MdCrumb = { home: string; homeLabel: string; group: string; page: string };
export const MdCrumbCtx = createContext<MdCrumb | null>(null);
export const useMdCrumb = () => useContext(MdCrumbCtx);

export function MdBreadcrumb() {
  const c = useMdCrumb();
  if (!c) return null;
  return (
    <nav className="md-crumb" aria-label="breadcrumb">
      <Link to={c.home} title={c.homeLabel} aria-label={c.homeLabel}>
        <Home size={17} />
      </Link>
      {c.group && <span className="md-crumb-g">{c.group}</span>}
      <span className="md-crumb-cur">
        <em>{c.page}</em>
      </span>
    </nav>
  );
}

/* ------------------------------------------------------------------ yuqori paneldagi ochiluvchi oynalar */
function useDropdown() {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  const loc = useLocation();
  useEffect(() => setOpen(false), [loc.pathname]);
  return { open, setOpen, box };
}

function LinkRow({ l, onGo }: { l: MdLink; onGo: () => void }) {
  const inner = (
    <>
      <span className={`md-tile ${l.tone || "primary"}`}>{l.icon}</span>
      <span className={`md-row-txt ${l.unread ? "wrap" : ""}`}>
        <b>{l.label}</b>
        {l.sub && <small>{l.sub}</small>}
      </span>
      {l.count ? <i className="md-count">{l.count}</i> : l.external ? <ExternalLink size={14} className="md-row-ext" /> : null}
    </>
  );
  if (l.external || /^https?:/.test(l.to))
    return (
      <a className="md-row" href={l.to} target="_blank" rel="noreferrer" onClick={() => (l.onOpen?.(), onGo())}>
        {inner}
      </a>
    );
  return (
    <Link className="md-row" to={l.to} onClick={() => (l.onOpen?.(), onGo())}>
      {inner}
    </Link>
  );
}

function AppsMenu({ apps, label, title }: { apps: MdLink[]; label: string; title: string }) {
  const d = useDropdown();
  if (!apps.length) return null;
  return (
    <div className="md-dd" ref={d.box}>
      <button type="button" className={`md-tb-btn ${d.open ? "on" : ""}`} onClick={() => d.setOpen(!d.open)} title={label} aria-label={label} aria-expanded={d.open}>
        <LayoutGrid size={20} />
      </button>
      {d.open && (
        <div className="md-dd-menu md-apps" role="menu">
          <div className="md-dd-head">
            <h5>{title}</h5>
          </div>
          <div className="md-apps-grid">
            {apps.map((a) => (
              <LinkRow key={a.to + a.label} l={a} onGo={() => d.setOpen(false)} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function NotesMenu({ notes, label, empty, foot }: { notes: MdLink[]; label: string; empty: string; foot?: ReactNode }) {
  const d = useDropdown();
  const total = notes.reduce((n, x) => n + (x.count || 0) + (x.unread ? 1 : 0), 0);
  return (
    <div className="md-dd" ref={d.box}>
      <button type="button" className={`md-tb-btn ${d.open ? "on" : ""}`} onClick={() => d.setOpen(!d.open)} title={label} aria-label={label} aria-expanded={d.open}>
        <Bell size={20} />
        {total > 0 && <i className="md-dot" />}
      </button>
      {d.open && (
        <div className="md-dd-menu md-notes right" role="menu">
          <div className="md-dd-head">
            <h5>{label}</h5>
            {total > 0 && <span className="md-badge primary">{total}</span>}
          </div>
          <div className="md-dd-list">
            {notes.filter((n) => n.count || n.unread).map((n, i) => (
              <LinkRow key={n.to + i} l={n} onGo={() => d.setOpen(false)} />
            ))}
            {!total && <p className="md-dd-empty">{empty}</p>}
          </div>
          {total > 0 && foot && <div className="md-dd-foot">{foot}</div>}
        </div>
      )}
    </div>
  );
}

function ProfileMenu({ user, labels }: { user: MdUser; labels: MdLabels }) {
  const d = useDropdown();
  return (
    <div className="md-dd" ref={d.box}>
      <button type="button" className="md-me-btn" onClick={() => d.setOpen(!d.open)} aria-expanded={d.open} title={labels.profile} aria-label={labels.profile}>
        <Avatar name={user.name} photo={user.photo} size={35} />
        <ChevronDown size={15} />
      </button>
      {d.open && (
        <div className="md-dd-menu md-profile right" role="menu">
          <div className="md-dd-head">
            <h5>{labels.profile}</h5>
          </div>
          <div className="md-prof-card">
            <Avatar name={user.name} photo={user.photo} size={72} />
            <span>
              <b>{user.name}</b>
              <small>{user.role}</small>
              {user.email && <em>{user.email}</em>}
            </span>
          </div>
          <div className="md-dd-list">
            {user.links.map((l) => (
              <LinkRow key={l.to + l.label} l={l} onGo={() => d.setOpen(false)} />
            ))}
          </div>
          <button type="button" className="md-logout" onClick={user.onLogout}>
            <LogOut size={16} />
            {labels.logout}
          </button>
        </div>
      )}
    </div>
  );
}

/** Qidiruv — MatDash'dagidek ikonka tugmasi va oyna; Ctrl+K yoki «/» bilan ham ochiladi. */
function SearchModal({ label, render }: { label: string; render: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useFocusTrap(box, open);
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [open]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = t?.tagName === "INPUT" || t?.tagName === "TEXTAREA" || t?.isContentEditable;
      if ((e.key === "k" && (e.ctrlKey || e.metaKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => {
    if (!open) return;
    document.documentElement.classList.add("md-lock");
    return () => document.documentElement.classList.remove("md-lock");
  }, [open]);
  return (
    <>
      <button type="button" className="md-tb-btn" onClick={() => setOpen(true)} title={`${label} (Ctrl K)`} aria-label={label}>
        <Search size={20} />
      </button>
      {open &&
        createPortal(
          <div className="md-search-bg" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
            <div className="md-search-modal" role="dialog" aria-modal="true" aria-label={label} ref={box}>
              <button type="button" className="md-search-x" onClick={() => setOpen(false)} aria-label={A11Y_DICTS[pageLang()].close}>
                <X size={18} />
              </button>
              {render(() => setOpen(false))}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

/* ------------------------------------------------------------------ qobiq */
const MINI_KEY = "md-mini";

function matchItem(path: string, it: MdItem) {
  return it.end ? path === it.to || path === it.to + "/" : path === it.to || path.startsWith(it.to.replace(/\/$/, "") + "/");
}

export function MdShell({
  groups,
  brand,
  home,
  labels,
  search,
  apps,
  notes,
  notesFoot,
  lang,
  user,
  dark,
  onTheme,
  editing = false,
  children,
}: {
  groups: MdGroup[];
  brand: { name: string; sub: string; href: string };
  home: string;
  labels: MdLabels;
  search: (close: () => void) => ReactNode;
  apps: MdLink[];
  notes: MdLink[];
  /** qo'ng'iroqcha ostidagi amal (masalan, «Hammasini o'qilgan deb belgilash») */
  notesFoot?: ReactNode;
  lang: ReactNode;
  user: MdUser;
  dark: boolean;
  onTheme: () => void;
  editing?: boolean;
  children: ReactNode;
}) {
  const loc = useLocation();
  const nav = useNavigate();
  useSideDrawer(loc.pathname);
  // joriy sahifa qaysi guruh / bo'limga tegishli (eng uzun mos keluvchi manzil)
  const active = useMemo(() => {
    let best: { g: MdGroup; s: MdSection; it: MdItem } | null = null;
    for (const g of groups)
      for (const s of g.sections)
        for (const it of s.items)
          if (matchItem(loc.pathname, it) && (!best || it.to.length > best.it.to.length)) best = { g, s, it };
    return best;
  }, [groups, loc.pathname]);
  const [sel, setSel] = useState<string>(active?.g.id || groups[0]?.id || "");
  useEffect(() => {
    if (active) setSel(active.g.id);
  }, [active?.g.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const [mini, setMini] = useState(() => {
    try {
      return localStorage.getItem(MINI_KEY) === "1";
    } catch {
      return false;
    }
  });
  const toggleMini = () => {
    setMini(!mini);
    try {
      localStorage.setItem(MINI_KEY, mini ? "0" : "1");
    } catch {
      /* */
    }
  };
  const group = groups.find((g) => g.id === sel) || groups[0];
  const crumb = useMemo<MdCrumb>(
    () => ({ home, homeLabel: labels.home, group: active && active.it.to !== home ? active.s.cap || active.g.label : "", page: active?.it.label || labels.home }),
    [active, home, labels.home],
  );

  if (editing) return <MdCrumbCtx.Provider value={crumb}>{children}</MdCrumbCtx.Provider>;

  return (
    <MdCrumbCtx.Provider value={crumb}>
      <div className={`md-shell ${mini ? "mini" : ""}`}>
        <a href="#md-main" className="md-skip">
          {A11Y_DICTS[pageLang()].skip_main}
        </a>
        <A11ySkip className="md" />
        <aside className="md-side" aria-label={labels.menu}>
          <div className="md-rail">
            <button type="button" className="md-rail-burger" onClick={toggleMini} title={labels.menu} aria-label={labels.menu} aria-pressed={!mini}>
              <AlignLeft size={22} />
            </button>
            <ul className="md-rail-list">
              {groups.map((g) => {
                const count = g.sections.reduce((n, s) => n + s.items.reduce((m, it) => m + (it.badge || 0), 0), 0);
                return (
                  <li key={g.id}>
                    <button
                      type="button"
                      className={`md-rail-btn ${g.id === group?.id ? "on" : ""} ${active?.g.id === g.id ? "cur" : ""}`}
                      data-tip={g.label}
                      aria-label={g.label}
                      aria-current={g.id === group?.id}
                      onClick={() => {
                        setSel(g.id);
                        if (mini) toggleMini();
                        // telefonda va bitta bo'limli guruhda — to'g'ridan-to'g'ri o'sha sahifaga
                        const items = g.sections.flatMap((s) => s.items);
                        if (items.length === 1 && !window.matchMedia("(max-width: 1000px)").matches) nav(items[0].to);
                      }}
                    >
                      {g.icon}
                      {count > 0 && <i className="md-dot" />}
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="md-rail-foot">
              <button type="button" className="md-rail-btn" data-tip={labels.theme} aria-label={labels.theme} onClick={onTheme}>
                {dark ? <Sun size={21} /> : <Moon size={21} />}
              </button>
              <button type="button" className="md-rail-btn" data-tip={labels.logout} aria-label={labels.logout} onClick={user.onLogout}>
                <LogOut size={21} />
              </button>
            </div>
          </div>
          <div className="md-panel">
            <SideClose label={labels.menu} />
            <a href={brand.href} className="md-brand" target="_blank" rel="noreferrer" title={labels.site}>
              <BrandMark size={38} />
              <span>
                <b>{brand.name}</b>
                <small>{brand.sub}</small>
              </span>
            </a>
            <nav className="md-nav" aria-label={group?.label || labels.menu}>
              {group?.sections.map((s, i) => (
                <div key={s.cap + i} className="md-nav-sec">
                  {i > 0 && <hr className="md-nav-hr" />}
                  <div className="md-cap">{s.cap}</div>
                  {s.items.map((it) => (
                    <NavLink key={it.to} to={it.to} end={it.end} title={it.hint} className={() => `md-link ${active?.it.to === it.to ? "on" : ""}`}>
                      {it.icon}
                      <span>{it.label}</span>
                      {!!it.badge && <i className="md-count">{it.badge}</i>}
                    </NavLink>
                  ))}
                </div>
              ))}
            </nav>
          </div>
        </aside>
        <SideBackdrop />
        <div className="md-body">
          <header className="md-top">
            <div className="md-top-l">
              <button
                type="button"
                className="md-tb-btn md-burger"
                aria-label={labels.menu}
                title={labels.menu}
                onClick={() => document.documentElement.classList.toggle("side-open")}
              >
                <AlignLeft size={22} />
              </button>
              <SearchModal label={labels.search} render={search} />
              <AppsMenu apps={apps} label={labels.apps} title={labels.appsTitle} />
            </div>
            <a href={brand.href} className="md-top-brand" target="_blank" rel="noreferrer">
              <BrandMark size={34} />
            </a>
            <div className="md-top-r">
              <A11yButton variant="md" className="md-tb-btn" />
              <button type="button" className="md-tb-btn md-theme" onClick={onTheme} title={labels.theme} aria-label={labels.theme}>
                {dark ? <Sun size={20} /> : <Moon size={20} />}
              </button>
              <NotesMenu notes={notes} label={labels.notes} empty={labels.notesEmpty} foot={notesFoot} />
              {lang}
              <ProfileMenu user={user} labels={labels} />
            </div>
          </header>
          <main className="md-wrap" id="md-main" tabIndex={-1}>
            <div className="md-container">{children}</div>
            <footer className="md-made">
              <span className="ft-made">
                Made with{" "}
                <a href="https://t.me/uktamovpro" target="_blank" rel="noopener noreferrer">
                  Bayroqdor
                </a>
              </span>
            </footer>
          </main>
        </div>
      </div>
    </MdCrumbCtx.Provider>
  );
}
