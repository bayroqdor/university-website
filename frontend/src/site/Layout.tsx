import { ArrowUp, ArrowUpRight, Check, ChevronDown, Clock, Globe, Languages, LogIn, Mail, MapPin, Moon, Phone, Play, Rss, Send, Sun, Cookie } from "lucide-react";
import { ChatWidget } from "./chrome/ChatWidget";
import { AnimatePresence, motion, useMotionValueEvent, useScroll } from "motion/react";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { documentHref, viewablePath } from "./pages/DocView";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { ApiError, LANGS, pub } from "../lib/api";
import { LANG_NATIVE } from "../lib/i18n";
import { useSite } from "../lib/site";
import { usePageTracking } from "../lib/track";
import { useDocMeta } from "../lib/meta";
import { EASE, Magnetic, ScrollToTopOnRoute, scrollToTop } from "./fx";
import { SiteFooter, SiteHeader } from "./chrome/Chrome";
import { TopBar } from "./uni";
import { CookieConsent, openCookieSettings } from "./CookieConsent";
import { FestiveGarland, FestiveLayer, FestiveLogo, FestiveScene } from "./festive/Festive";
import { PopupHost } from "./Popup";
import { A11ySkip } from "../a11y/Root";

/* ------------------------------------------------------------------ ijtimoiy tarmoqlar */
const SOCIAL_META: Record<string, { label: string; mono?: string; icon?: ReactNode }> = {
  telegram: { label: "Telegram", icon: <Send size={16} /> },
  facebook: { label: "Facebook", mono: "f" },
  instagram: { label: "Instagram", mono: "Ig" },
  youtube: { label: "YouTube", icon: <Play size={16} /> },
  linkedin: { label: "LinkedIn", mono: "in" },
  x: { label: "X", mono: "𝕏" },
  website: { label: "Website", icon: <Globe size={16} /> },
};

export function Socials({ className = "", email = true }: { className?: string; email?: boolean }) {
  const { data } = useSite();
  if (!data) return null;
  const s = data.uni.socials || {};
  const items = Object.keys(SOCIAL_META).filter((k) => s[k]);
  return (
    <div className={`socials ${className}`}>
      {email && data.uni.email && (
        <a href={`mailto:${data.uni.email}`} className="social" aria-label="Email" title="Email">
          <Mail size={16} />
        </a>
      )}
      {items.map((k) => (
        <a key={k} href={s[k]} target="_blank" rel="noopener noreferrer me" className="social" aria-label={SOCIAL_META[k].label} title={SOCIAL_META[k].label}>
          {SOCIAL_META[k].icon || <span className="mono">{SOCIAL_META[k].mono}</span>}
        </a>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ obuna formasi */
export function SubscribeForm({ compact = false, source = "site" }: { compact?: boolean; source?: string }) {
  const { t } = useSite();
  const [email, setEmail] = useState("");
  const [hp, setHp] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "pending" | "active" | "error">("idle");
  const [err, setErr] = useState("");
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setState("busy");
    try {
      const r = await pub.subscribe(email.trim(), source, hp);
      setState(r.status);
    } catch (e2) {
      const d = e2 instanceof ApiError ? e2.detail : "";
      setErr(d === "invalid_email" ? t.err_invalid_email : d === "too_many_attempts" ? t.err_too_many : t.err_generic);
      setState("error");
    }
  };
  if (state === "pending" || state === "active")
    return (
      <motion.p className="subscribe-done" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        ✦ {state === "pending" ? t.subscribe_pending : t.subscribe_active}
      </motion.p>
    );
  return (
    <form className={`subscribe-form ${compact ? "compact" : ""}`} onSubmit={submit}>
      <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t.subscribe_placeholder} aria-label={t.subscribe_placeholder} autoComplete="email" />
      <input type="text" tabIndex={-1} autoComplete="off" value={hp} onChange={(e) => setHp(e.target.value)} className="hp" aria-hidden />
      <button type="submit" disabled={state === "busy"}>
        {t.subscribe_button}
        <ArrowUpRight size={16} />
      </button>
      {state === "error" && <span className="form-error">{err}</span>}
    </form>
  );
}

/* ------------------------------------------------------------------ til tanlash */
function LangSwitch() {
  const { lang, setLang, t } = useSite();
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
    <div className="lang-switch" ref={box}>
      <button className="lang-btn" onClick={() => setOpen(!open)} aria-haspopup="listbox" aria-expanded={open} aria-label={t.lang_switch} title={t.lang_switch}>
        <Languages size={16} />
        <span>{lang.toUpperCase()}</span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.ul className="lang-menu" role="listbox" initial={{ opacity: 0, y: -6, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6, scale: 0.97 }} transition={{ duration: 0.18 }}>
            {LANGS.map((l) => (
              <li key={l}>
                <button
                  role="option"
                  aria-selected={l === lang}
                  className={l === lang ? "on" : ""}
                  onClick={() => {
                    setOpen(false);
                    if (l !== lang) setLang(l);
                  }}
                >
                  <b>{l.toUpperCase()}</b>
                  <span>{LANG_NATIVE[l]}</span>
                  {l === lang && <Check size={14} />}
                </button>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}

function LangPills() {
  const { lang, setLang } = useSite();
  return (
    <div className="lang-pills">
      {LANGS.map((l) => (
        <button key={l} className={l === lang ? "on" : ""} onClick={() => setLang(l)} aria-pressed={l === lang}>
          {LANG_NATIVE[l]}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ menyu
   Yuqorida faqat asosiy bo'limlar; qolganlari guruhlangan ochiluvchi panel ichida.
   Admin «Menyu» bo'limida o'z menyusini tuzsa — o'sha ishlatiladi. */
export interface NavChild {
  to: string;
  label: string;
  group?: string;
}
export interface NavItem {
  to: string;
  label: string;
  children?: NavChild[];
}

export const isExt = (u: string) => /^(https?:|mailto:|tel:)/.test(u);

export function SmartLink({ to, className, children, onClick }: { to: string; className?: string; children: ReactNode; onClick?: () => void }) {
  if (isExt(to))
    return (
      <a href={to} className={className} target="_blank" rel="noopener noreferrer" onClick={onClick}>
        {children}
      </a>
    );
  return (
    <NavLink to={to || "/"} end className={({ isActive }) => `${className || ""} ${isActive ? "active" : ""}`} onClick={onClick}>
      {children}
    </NavLink>
  );
}

export function useNav(): NavItem[] {
  const { t, data } = useSite();
  const c = data?.counts || {};
  const custom = data?.site.menu || [];
  if (custom.length)
    return custom.map((m) => ({ to: m.url || "/", label: m.label, children: (m.children || []).map((x) => ({ to: x.url || "/", label: x.label, group: x.group || undefined })) }));
  const u = data?.uni;
  const aboutPages = (data?.menu_pages || []).filter((p) => p.section === "about");
  const about: NavChild[] = aboutPages.slice(0, aboutPages.length > 6 ? 5 : 6).map((p) => ({ to: `/about/${p.slug}`, label: p.title, group: t.nav_g_about }));
  if (aboutPages.length > 6) about.push({ to: "/about", label: `${t.more_all} →`, group: t.nav_g_about });
  const org: NavChild[] = [
    ...((c.staff ?? 0) > 0 ? [{ to: "/staff?kind=leadership", label: t.nav_leadership }] : []),
    ...((c.department ?? 0) > 0 ? [{ to: "/structure", label: t.nav_structure }] : []),
    ...((c.document ?? 0) > 0 ? [{ to: "/documents", label: t.nav_documents }] : []),
    ...((c.partner ?? 0) > 0 ? [{ to: "/partners", label: t.nav_partners }] : []),
    ...((c.link ?? 0) > 0 ? [{ to: "/links", label: t.links_title }] : []),
  ].map((x) => ({ ...x, group: t.nav_g_org }));
  return [
    { to: "/about", label: t.nav_about, children: [...about, ...org] },
    {
      to: "/programs",
      label: t.nav_programs,
      children: [
        { to: "/programs", label: t.programs_title },
        ...((c.faculty ?? 0) > 0 ? [{ to: "/faculties", label: t.nav_faculties }] : []),
        ...((c.department ?? 0) > 0 ? [{ to: "/structure", label: t.nav_kafedras }] : []),
      ],
    },
    {
      to: "/admission",
      label: t.nav_admission,
      children: [{ to: "/admission", label: t.nav_rules }, ...(u?.admission_url ? [{ to: u.admission_url, label: t.nav_apply }] : [])],
    },
    {
      to: "/students",
      label: t.nav_students,
      children: [
        { to: "/students", label: t.nav_students },
        { to: "/login", label: t.portal },
        { to: "/login?next=schedule", label: t.nav_schedule },
        { to: u?.hemis_url || "/students", label: t.hemis },
        { to: "/library", label: t.library },
      ],
    },
    {
      to: "/news",
      label: t.nav_news,
      children: [
        { to: "/news", label: t.news_title },
        { to: "/announcements", label: t.nav_announcements },
        ...((c.event ?? 0) > 0 ? [{ to: "/events", label: t.nav_events }] : []),
      ],
    },
    { to: "/careers", label: t.nav_careers },
    {
      to: "/contact",
      label: t.nav_contact,
      children: [
        { to: "/contact", label: t.nav_reception },
        { to: data?.telegram_bot || "/telegram", label: t.nav_tgbot },
      ],
    },
  ];
}

/** Ochiluvchi panel: guruhlar bo'lsa — ustunlar (mega menyu) */
function DropPanel({ items }: { items: NavChild[] }) {
  const groups: [string, NavChild[]][] = [];
  for (const it of items) {
    const g = it.group || "";
    const last = groups.find((x) => x[0] === g);
    if (last) last[1].push(it);
    else groups.push([g, [it]]);
  }
  const mega = groups.length > 1;
  return (
    <div className={`nav-drop ${mega ? "mega" : ""}`} style={mega ? { ["--cols" as string]: groups.length } : undefined}>
      {groups.map(([g, list]) => (
        <div key={g || "-"} className="nav-drop-col">
          {mega && g && <span className="nav-drop-head">{g}</span>}
          {list.map((x) => (
            <SmartLink key={x.to + x.label} to={x.to} className="nav-drop-link">
              {x.label}
              {isExt(x.to) && <ArrowUpRight size={12} className="ext-ic" />}
            </SmartLink>
          ))}
        </div>
      ))}
    </div>
  );
}

function Brand() {
  const { data } = useSite();
  if (!data) return <span className="brand" />;
  const name = data.site.title || data.uni.abbr;
  return (
    <Link to="/" className="brand" data-cursor="">
      <FestiveLogo />
      {data.uni.logo ? <img className="brand-logo" src={data.uni.logo} alt={name} /> : <span className="brand-mark">{data.site.logo_text}</span>}
      <span className="brand-text">
        <span className="brand-name">{name}</span>
        <small>{data.uni.short_name}</small>
      </span>
    </Link>
  );
}

function Header() {
  const { t, theme, toggleTheme, data } = useSite();
  const nav = useNav();
  const [hidden, setHidden] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const [closed, setClosed] = useState("");
  const { scrollY } = useScroll();
  const loc = useLocation();
  useMotionValueEvent(scrollY, "change", (y) => {
    const prev = scrollY.getPrevious() ?? 0;
    setScrolled(y > 24);
    setHidden(y > 240 && y > prev && !open);
  });
  useEffect(() => setOpen(false), [loc.pathname]);
  useEffect(() => {
    document.documentElement.classList.toggle("menu-open", open);
  }, [open]);
  const portal = data?.site.portal_enabled !== false;
  return (
    <>
      <motion.header className={`site-header ${scrolled ? "scrolled" : ""}`} animate={{ y: hidden ? "-110%" : "0%" }} transition={{ duration: 0.45, ease: EASE }}>
        <TopBar />
        <div className="container header-inner">
          <Brand />
          <nav className="main-nav" aria-label="Main">
            {nav.map((n) => (
              <div
                key={n.to}
                className={`nav-item ${n.children?.length ? "has-drop" : ""} ${closed === n.to ? "closed" : ""}`}
                onMouseLeave={() => closed === n.to && setClosed("")}
                onClickCapture={() => {
                  // bosilgach panel yopiladi (sichqoncha chiqib, qayta kirganda yana ochiladi)
                  setClosed(n.to);
                  window.setTimeout(() => (document.activeElement as HTMLElement | null)?.blur(), 0);
                }}
              >
                <NavLink to={n.to} className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}>
                  <span>
                    {n.label}
                    {n.children?.length ? <ChevronDown size={13} className="nav-chev" /> : null}
                  </span>
                </NavLink>
                {n.children?.length ? <DropPanel items={n.children} /> : null}
              </div>
            ))}
          </nav>
          <div className="header-tools">
            <LangSwitch />
            <button className="icon-btn" onClick={toggleTheme} aria-label={theme === "dark" ? t.theme_light : t.theme_dark} title={theme === "dark" ? t.theme_light : t.theme_dark}>
              <AnimatePresence mode="wait" initial={false}>
                <motion.span key={theme} initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }} transition={{ duration: 0.25 }} style={{ display: "grid" }}>
                  {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
                </motion.span>
              </AnimatePresence>
            </button>
            {portal && (
              <Link to="/login" className="login-btn" data-cursor="">
                <LogIn size={16} />
                <span>{t.portal}</span>
              </Link>
            )}
            <button className={`burger ${open ? "open" : ""}`} onClick={() => setOpen(!open)} aria-label={open ? t.close : t.menu} aria-expanded={open}>
              <span />
              <span />
            </button>
          </div>
        </div>
        <FestiveGarland />
      </motion.header>
      <AnimatePresence>
        {open && (
          <motion.div className="mobile-menu" initial={{ clipPath: "circle(0% at 100% 0%)" }} animate={{ clipPath: "circle(150% at 100% 0%)" }} exit={{ clipPath: "circle(0% at 100% 0%)" }} transition={{ duration: 0.7, ease: EASE }}>
            <nav className="container">
              {[{ to: "/", label: t.nav_home, children: undefined as NavItem["children"] }, ...nav].map((n, i) => (
                <motion.div key={n.to} initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.15 + i * 0.06, duration: 0.7, ease: EASE }}>
                  <NavLink to={n.to} end className={({ isActive }) => `mobile-link ${isActive ? "active" : ""}`}>
                    <span className="mobile-idx">0{i + 1}</span>
                    {n.label}
                  </NavLink>
                  {n.children?.length ? (
                    <div className="mobile-sub">
                      {n.children.map((c) => (
                        <SmartLink key={c.to + c.label} to={c.to}>
                          {c.label}
                        </SmartLink>
                      ))}
                    </div>
                  ) : null}
                </motion.div>
              ))}
              {portal && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}>
                  <Link to="/login" className="btn btn-primary" style={{ marginTop: 26 }}>
                    <LogIn size={17} /> {t.portal}
                  </Link>
                </motion.div>
              )}
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.55 }}>
                <LangPills />
              </motion.div>
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }}>
                <Socials className="mobile-socials" />
              </motion.div>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

/* ------------------------------------------------------------------ pastki qism */
function Footer() {
  const { t, data, lang, defaultLang } = useSite();
  const nav = useNav();
  if (!data) return null;
  const u = data.uni;
  const year = new Date().getFullYear();
  return (
    <>
    <section className="sub-strip">
      <div className="container">
        <div className="subscribe-band mini">
          <div className="subscribe-copy">
            <span className="section-num">✦ Newsletter</span>
            <h3>{t.subscribe_title}</h3>
            <p>{t.subscribe_text}</p>
          </div>
          <SubscribeForm source="footer" />
        </div>
      </div>
    </section>
    <footer className="site-footer compact">
      <div className="container">
        <div className="footer-top uni">
          <div className="footer-sub">
            <Link to="/" className="footer-brand">
              {u.logo_light || u.logo ? <img src={u.logo_light || u.logo} alt={u.abbr} className="footer-logo" /> : <span className="brand-mark">{data.site.logo_text}</span>}
              <span>
                <b>{u.abbr}</b>
                <small>{u.name}</small>
              </span>
            </Link>
            <address className="footer-addr">
              {u.address && (
                <span>
                  <MapPin size={14} /> {u.address}
                </span>
              )}
              {u.phones?.map((p) => (
                <a key={p} href={`tel:${p.replace(/[^+\d]/g, "")}`}>
                  <Phone size={14} /> {p}
                </a>
              ))}
              {u.email && (
                <a href={`mailto:${u.email}`}>
                  <Mail size={14} /> {u.email}
                </a>
              )}
              {u.hours && (
                <span>
                  <Clock size={14} /> {u.hours}
                </span>
              )}
            </address>
          </div>
          <div className="footer-cols">
            {nav
              .filter((n) => n.children?.length)
              .map((n) => {
                const kids = (n.children || []).filter((c) => !c.label.endsWith("→"));
                const shown = kids.slice(0, 5);
                return (
                  <nav key={n.to} className="footer-col">
                    <SmartLink to={n.to} className="footer-col-title">
                      {n.label}
                    </SmartLink>
                    {shown.map((c) => (
                      <SmartLink key={c.to + c.label} to={c.to}>
                        {c.label}
                      </SmartLink>
                    ))}
                    {kids.length > shown.length && (
                      <SmartLink to={n.to} className="footer-more">
                        {t.more_all} →
                      </SmartLink>
                    )}
                  </nav>
                );
              })}
          </div>
        </div>
        <div className="footer-bottom">
          <span>
            © {year} {u.name}. {data.site.footer_text || t.made_with}
            {data.former_domains?.length ? (
              <span className="footer-aka">
                {" "}
                · {t.also_known}: {data.former_domains.join(", ")}
              </span>
            ) : null}
          </span>
          <a href={lang === defaultLang ? "/rss.xml" : `/rss.xml?lang=${lang}`} className="rss footer-rss">
            <Rss size={14} /> {t.rss}
          </a>
          <button className="rss footer-rss footer-ck" onClick={openCookieSettings}>
            <Cookie size={14} /> {t.ck_footer}
          </button>
          <Socials />
          <Magnetic>
            <button className="to-top" onClick={() => scrollToTop(false)} aria-label={t.scroll_top} data-cursor="">
              <ArrowUp size={18} />
            </button>
          </Magnetic>
        </div>
      </div>
    </footer>
    </>
  );
}

/* ------------------------------------------------------------------ sahifa qolipi (sayt boshi + menyu, kontent, pastki qism) */
/** Saytdagi hujjat havolalari: PDF — sayt ichidagi /document sahifasida (pdf.js), Word/Excel/PowerPoint — oddiy havola (yuklab olinadi).
 *  Ochiq saytda ONLYOFFICE ishlatilmaydi (har bir mehmonga ~30 MB tahrirlagich + serverda konvertatsiya — juda sekin edi).
 *  `data-no-office` belgili, `download` atributli va DocViewer (.dv) ichidagi havolalarga tegilmaydi. */
function useDocLinks() {
  const navigate = useNavigate();
  useEffect(() => {
    const click = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.hasAttribute("download") || a.dataset.noOffice !== undefined || a.closest(".dv")) return;
      const src = viewablePath(a.getAttribute("href") || "");
      if (!src) return;
      e.preventDefault();
      // sarlavha: havola matni (agar «Yuklab olish» kabi umumiy so'z bo'lmasa) yoki kartadagi sarlavha
      let title = (a.getAttribute("title") || a.textContent || "").replace(/\s+/g, " ").trim();
      if (title.length < 4 || /yuklab|скачать|download|ochish|открыть|^open|^pdf|^docx?$/i.test(title)) {
        const card = a.closest("li, article, .doc, .doc-row, .a-card, div");
        title = (card?.querySelector("h2, h3, h4, b, strong")?.textContent || "").trim();
      }
      const to = documentHref(src, title.slice(0, 160));
      if (a.target === "_blank") window.open(to, "_blank", "noopener");
      else navigate(to);
    };
    document.addEventListener("click", click);
    return () => document.removeEventListener("click", click);
  }, [navigate]);
}

export function SiteLayout() {
  const { data, error, lang, t } = useSite();
  usePageTracking();
  useDocMeta(lang);
  useDocLinks();
  return (
    <div className="site uni">
      <a href="#main" className="skip">
        {t.h_skip}
      </a>
      <A11ySkip />
      <ScrollToTopOnRoute />
      <SiteHeader />
      <FestiveScene />
      <main id="main" tabIndex={-1}>
        {data ? <Outlet key={lang} /> : error ? <div className="wrap sec"><p>{t.api_error}</p></div> : <div className="boot" aria-busy="true" />}
      </main>
      <SiteFooter />
      <CookieConsent />
      <FestiveLayer />
      <PopupHost />
      <ChatWidget />
    </div>
  );
}

// eski sarlavha/pastki qism komponentlari boshqa sahifalarda ishlatilmaydi
void Header;
void Footer;
