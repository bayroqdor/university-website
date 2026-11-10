/* Sayt navigatsiyasi: yuqori xizmat qatori, asosiy menyu (ikki ustunli ochiluvchi panel), mobil menyu va pastki qism. */
import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { ApiError, pub, type Lang } from "../../lib/api";
import { useSite } from "../../lib/site";
import { useNav, type NavChild, type NavItem } from "../Layout";
import { Moon, Music, Sun } from "lucide-react";
import { FestiveHeaderLights } from "../festive/Festive";
import { SearchButton } from "./Search";
import { A, withAdmissionYear } from "./ui";
import { Consent } from "../official/Consent";
import { A11yButton } from "../../a11y/Root";
import { A11Y_DICTS } from "../../a11y/i18n";

/** Landmark nomlari (ekran o'qish dasturlari uchun) */
const LM = {
  uz: { main: "Asosiy menyu", footer: "Pastki menyu", lang: "Til" },
  ru: { main: "Главное меню", footer: "Нижнее меню", lang: "Язык" },
  en: { main: "Main menu", footer: "Footer menu", lang: "Language" },
} as const;

/** Saytda ko'rsatiladigan tartib: UZ / EN / RU */
const LANG_ORDER: Lang[] = ["uz", "en", "ru"];

function LangLinks({ className = "" }: { className?: string }) {
  const { lang, setLang, data } = useSite();
  const langs = LANG_ORDER.filter((l) => !data?.langs?.length || data.langs.includes(l));
  return (
    <div className={`lx ${className}`} role="group" aria-label={LM[lang].lang}>
      {langs.map((l, i) => (
        <span key={l} className="lx-i">
          {i > 0 && <span className="lx-sep" aria-hidden>/</span>}
          <button type="button" className={l === lang ? "on" : ""} aria-pressed={l === lang} lang={l} onClick={() => l !== lang && setLang(l)}>
            {l.toUpperCase()}
          </button>
        </span>
      ))}
    </div>
  );
}

/** Xizmat havolalari: Hemis, Moodle, korporativ pochta, korrupsiyaga qarshi (manzili kiritilmaganlari ko'rsatilmaydi) */
function useUtil() {
  const { data, t } = useSite();
  const u = data?.uni;
  if (!u) return [];
  return [
    { to: u.hemis_url, label: t.u_hemis },
    // masofaviy ta'lim va korporativ pochta — kabinet orqali (kirmagan bo'lsa /login, pochta — kabinetdagi «Pochta» bo'limi)
    { to: u.moodle_url ? "/login?next=moodle" : "", label: t.u_moodle },
    { to: u.mail_url ? "/login?next=mail" : "", label: t.u_mail },
    { to: u.anticorruption_url, label: t.u_anticorr },
  ].filter((x) => x.to);
}

function UtilLinks({ className }: { className: string }) {
  const { t } = useSite();
  const items = useUtil();
  return (
    <nav className={className} aria-label={t.quick_title}>
      {items.map((x) => (
        <A key={x.label} to={x.to} className="ub-link">
          {x.label}
        </A>
      ))}
      <SdgLink />
    </nav>
  );
}

const SDG_COLORS = ["#E5243B", "#DDA63A", "#4C9F38", "#C5192D", "#FF3A21", "#26BDE2", "#FCC30B", "#A21942", "#FD6925", "#DD1367", "#FD9D24", "#BF8B2E", "#3F7E44", "#0A97D9", "#56C02B", "#00689D", "#19486A"];

/** 17 rangli kichik halqa — BRM belgisi (yuqori qatorda alohida ajralib turadi) */
function SdgRing({ size = 18 }: { size?: number }) {
  const r = 7,
    c = 9,
    seg = 360 / 17;
  const pt = (a: number) => [c + r * Math.cos(((a - 90) * Math.PI) / 180), c + r * Math.sin(((a - 90) * Math.PI) / 180)];
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" aria-hidden>
      {SDG_COLORS.map((col, i) => {
        const [x0, y0] = pt(i * seg + 1.5);
        const [x1, y1] = pt((i + 1) * seg - 1.5);
        return <path key={i} d={`M${x0} ${y0} A${r} ${r} 0 0 1 ${x1} ${y1}`} stroke={col} strokeWidth="3.2" fill="none" />;
      })}
    </svg>
  );
}

function SdgLink() {
  const { lang } = useSite();
  const label = { uz: "Barqaror rivojlanish maqsadlari", ru: "Цели устойчивого развития", en: "Sustainable Development Goals" }[lang];
  return (
    <Link to="/upgoals" className="ub-sdg" title={label} aria-label={label}>
      <SdgRing />
      <span>SDGs</span>
    </Link>
  );
}

/** Davlat ramzlari — saytning eng yuqorisida (davlat tashkiloti sayti talabi) */
function SymbolLinks() {
  const { t } = useSite();
  return (
    <nav className="ub-sym" aria-label={t.sym_title}>
      <Link to="/symbols/flag" className="ub-sym-i" title={t.sym_flag}>
        <img src="/symbols/flag.svg" alt="" width={24} height={12} />
        <span>{t.sym_flag}</span>
      </Link>
      <Link to="/symbols/emblem" className="ub-sym-i" title={t.sym_emblem}>
        <img src="/symbols/emblem.svg" alt="" width={18} height={18} />
        <span>{t.sym_emblem}</span>
      </Link>
      <Link to="/symbols/anthem" className="ub-sym-i" title={t.sym_anthem}>
        <Music size={15} aria-hidden />
        <span>{t.sym_anthem}</span>
      </Link>
    </nav>
  );
}

/** Kunduzgi / tungi rejim */
function ThemeToggle({ className = "" }: { className?: string }) {
  const { t, theme, toggleTheme } = useSite();
  const dark = theme === "dark";
  return (
    <button type="button" className={`ub-theme ${className}`} onClick={toggleTheme} title={dark ? t.theme_light : t.theme_dark} aria-label={dark ? t.theme_light : t.theme_dark}>
      {dark ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}

function UtilityBar() {
  return (
    <div className="ub">
      <div className="wrap ub-in">
        <SymbolLinks />
        <UtilLinks className="ub-links" />
        <div className="ub-end">
          <A11yButton />
          <ThemeToggle />
          <LangLinks />
        </div>
      </div>
    </div>
  );
}

function Brand({ onClick }: { onClick?: () => void }) {
  const { data } = useSite();
  if (!data) return <span className="br" />;
  const u = data.uni;
  return (
    <Link to="/" className="br" onClick={onClick} aria-label={`${u.abbr} — ${u.name}`}>
      {u.logo ? <img className="br-logo" src={u.logo} alt="" width={48} height={48} /> : <span className="br-mark">{data.site.logo_text || u.abbr}</span>}
      <span className="br-name">{u.name}</span>
    </Link>
  );
}

const pathOf = (to: string) => to.split(/[?#]/)[0];

/** Joriy sahifaga eng aniq mos keladigan bo'lim (bir vaqtda faqat bittasi belgilanadi; «#» havolalar hisobga olinmaydi) */
function activeIndex(nav: NavItem[], path: string): number {
  let best = -1;
  let score = 0;
  nav.forEach((n, i) => {
    for (const to of [n.to, ...(n.children || []).map((c) => c.to)]) {
      if (to.includes("#")) continue;
      const p = pathOf(to);
      if (!p || p === "/") continue;
      const hit = path === p ? p.length + 1000 : path.startsWith(p + "/") ? p.length : 0;
      if (hit > score) {
        score = hit;
        best = i;
      }
    }
  });
  return best;
}

function groupsOf(items: NavChild[]): [string, NavChild[]][] {
  const out: [string, NavChild[]][] = [];
  for (const it of items) {
    const g = it.group || "";
    const hit = out.find((x) => x[0] === g);
    if (hit) hit[1].push(it);
    else out.push([g, [it]]);
  }
  return out;
}

function DropLink({ c, onClick }: { c: NavChild; onClick?: () => void }) {
  if (/^(https?:|mailto:|tel:)/.test(c.to))
    return (
      <a href={c.to} className="dd-link" target="_blank" rel="noopener noreferrer" onClick={onClick}>
        {c.label} <span aria-hidden>↗</span>
      </a>
    );
  return (
    <NavLink to={c.to} end className={({ isActive: a }) => `dd-link ${a ? "on" : ""}`} onClick={onClick}>
      {c.label}
    </NavLink>
  );
}

/** Ochiluvchi menyu klaviaturada: ↓ — birinchi bandga, ↑/↓ — bandlar bo'ylab, Esc — yopib, bo'lim havolasiga qaytish */
function ddKeys(e: ReactKeyboardEvent<HTMLLIElement>, close: () => void) {
  const li = e.currentTarget;
  const links = Array.from(li.querySelectorAll<HTMLElement>(".dd a"));
  if (!links.length) return;
  const top = li.querySelector<HTMLElement>(".nb-link");
  const i = links.indexOf(document.activeElement as HTMLElement);
  if (e.key === "Escape") {
    close();
    top?.focus();
  } else if (e.key === "ArrowDown") {
    e.preventDefault();
    links[Math.min(links.length - 1, i + 1)]?.focus();
  } else if (e.key === "ArrowUp" && i >= 0) {
    e.preventDefault();
    (i === 0 ? top : links[i - 1])?.focus();
  }
}

function Header() {
  const { t, data, lang } = useSite();
  const nav = useNav();
  const loc = useLocation();
  const [open, setOpen] = useState(false);
  const [sub, setSub] = useState<string | null>(null);
  const [shut, setShut] = useState("");
  const menuId = useId();
  const burger = useRef<HTMLButtonElement>(null);
  const firstPath = useRef(true);
  useEffect(() => {
    setOpen(false);
    setSub(null);
    if (firstPath.current) {
      firstPath.current = false;
      return;
    }
    // yangi sahifa: fokus asosiy qismga (klaviatura va ekran o'qish dasturi foydalanuvchilari sahifa boshidan davom etadi)
    const panelOpen = !!document.querySelector("dialog[open]");
    if (!panelOpen) document.getElementById("main")?.focus({ preventScroll: true });
  }, [loc.pathname]);
  useEffect(() => {
    document.documentElement.classList.toggle("nav-open", open);
    if (!open) return;
    const esc = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      burger.current?.focus();
    };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [open]);
  const act = activeIndex(nav, loc.pathname);
  const cta = data?.site.hero;
  const ctaTo = cta?.cta_primary_url || "/admission";
  const showCta = data?.site.admission_cta !== false;
  const ctaLabel = withAdmissionYear(t.h_admission_btn, data?.site.admission_year);
  return (
    <header className="hdr">
      <UtilityBar />
      <div className="nb">
        <div className="wrap nb-in">
          <Brand />
          <nav className="nb-nav" aria-label={LM[lang].main}>
            <ul>
              {nav.map((n, i) => (
                <li
                  key={n.to + n.label}
                  className={`nb-item ${n.children?.length ? "has-dd" : ""} ${shut === n.to ? "shut" : ""}`}
                  onMouseLeave={() => shut === n.to && setShut("")}
                  onKeyDown={(e) => ddKeys(e, () => setShut(n.to))}
                  onBlur={(e) => shut === n.to && !e.currentTarget.contains(e.relatedTarget as Node) && setShut("")}
                >
                  <Link to={n.to} className={`nb-link ${i === act ? "on" : ""}`} aria-current={i === act ? (loc.pathname === pathOf(n.to) ? "page" : "true") : undefined}>
                    {n.label}
                  </Link>
                  {n.children?.length ? (
                    <div className="dd" onClick={() => setShut(n.to)}>
                      {groupsOf(n.children).map(([g, list]) => (
                        <div key={g || "-"} className="dd-col">
                          {g && <p className="ey dd-head">{g}</p>}
                          {list.map((c) => (
                            <DropLink key={c.to + c.label} c={c} />
                          ))}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          </nav>
          <SearchButton />
          {showCta && (
            <A to={ctaTo} className="bt bt-blue nb-cta">
              {ctaLabel}
            </A>
          )}
          <button ref={burger} type="button" className="nb-burger" aria-expanded={open} aria-controls={menuId} aria-label={open ? t.close : t.menu} onClick={() => setOpen(!open)}>
            <span>{open ? t.close : t.menu}</span>
            <span className={`nb-burger-ic ${open ? "x" : ""}`} aria-hidden>
              <i />
              <i />
            </span>
          </button>
        </div>
        <FestiveHeaderLights />
        <div className={`mm ${open ? "open" : ""}`} id={menuId} hidden={!open}>
          <nav className="wrap mm-in" aria-label={LM[lang].main}>
            <ul className="mm-list">
              {nav.map((n) => {
                const has = !!n.children?.length;
                const on = sub === n.to;
                return (
                  <li key={n.to + n.label} className="mm-item">
                    {has ? (
                      <button type="button" className="mm-top" aria-expanded={on} onClick={() => setSub(on ? null : n.to)}>
                        {n.label}
                        <span className="mm-sign" aria-hidden>
                          {on ? "−" : "+"}
                        </span>
                      </button>
                    ) : (
                      <Link to={n.to} className="mm-top">
                        {n.label}
                      </Link>
                    )}
                    {has && on && (
                      <div className="mm-sub">
                        {(n.children || []).map((c) => (
                          <DropLink key={c.to + c.label} c={c} onClick={() => setOpen(false)} />
                        ))}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
            {showCta && (
              <A to={ctaTo} className="bt bt-blue mm-cta">
                {ctaLabel}
              </A>
            )}
            <UtilLinks className="mm-util" />
            <div className="mm-tools">
              <LangLinks className="mm-lang" />
              <ThemeToggle className="mm-theme" />
            </div>
            <A11yButton className="mm-a11y" />
          </nav>
        </div>
      </div>
    </header>
  );
}

/** Ixcham obuna: email + tugma, tasdiqlash xati yuboriladi. Pastki qismda (to'q fon) va holat sahifalarida (light). */
function FooterSubscribe({ source = "footer", light = false }: { source?: string; light?: boolean }) {
  const { t } = useSite();
  const id = useId();
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
    } catch (x) {
      const d = x instanceof ApiError ? x.detail : "";
      setErr(d === "invalid_email" ? t.err_invalid_email : d === "too_many_attempts" ? t.err_too_many : t.err_generic);
      setState("error");
    }
  };
  return (
    <div className={`ft-sub ${light ? "light" : ""}`}>
      <label className="ey ft-h" htmlFor={id}>
        {t.subscribe_title}
      </label>
      {state === "pending" || state === "active" ? (
        <p className="ft-sub-done" role="status">
          {state === "pending" ? t.subscribe_pending : t.subscribe_active}
        </p>
      ) : (
        <form className="ft-sub-f" onSubmit={submit}>
          <input id={id} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t.subscribe_placeholder} autoComplete="email" />
          <input type="text" tabIndex={-1} autoComplete="off" value={hp} onChange={(e) => setHp(e.target.value)} className="hp" aria-hidden />
          <button type="submit" disabled={state === "busy"}>
            {t.subscribe_button}
          </button>
        </form>
      )}
      {state !== "pending" && state !== "active" && <Consent dark={!light} className="ft-sub-consent" />}
      {state === "error" && (
        <p className="ft-sub-err" role="alert">
          {err}
        </p>
      )}
    </div>
  );
}

const SOCIAL_LABEL: Record<string, string> = { instagram: "Instagram", youtube: "YouTube", telegram: "Telegram", facebook: "Facebook", linkedin: "LinkedIn", x: "X" };

function Footer() {
  const { t, data, lang } = useSite();
  const nav = useNav();
  if (!data) return null;
  const u = data.uni;
  const socials = ["instagram", "youtube", "telegram", "facebook", "linkedin", "x"].filter((k) => u.socials?.[k]);
  const year = new Date().getFullYear();
  return (
    <footer className="ft">
      <div className="wrap">
        <div className="ft-top">
          <div className="ft-brand">
            <span className="ft-abbr">{u.abbr}</span>
            <p className="ft-name">{u.name}</p>
            <FooterSubscribe />
          </div>
          <div className="ft-col">
            <p className="ey ft-h">{t.f_address}</p>
            <address className="ft-addr">{u.address}</address>
            {u.map_url && (
              <A to={u.map_url} className="ft-link">
                {t.f_map} <span aria-hidden>↗</span>
              </A>
            )}
          </div>
          <div className="ft-col">
            <p className="ey ft-h">{t.f_contacts}</p>
            {u.phones?.length ? (
              u.phones.map((p) => (
                <a key={p} href={`tel:${p.replace(/[^+\d]/g, "")}`} className="ft-link tnum">
                  {p}
                </a>
              ))
            ) : (
              <span className="ft-ph">{t.f_phone_ph}</span>
            )}
            {u.email && (
              <a href={`mailto:${u.email}`} className="ft-link">
                {u.email}
              </a>
            )}
            {u.hours && <span className="ft-muted">{u.hours}</span>}
          </div>
          <div className="ft-col">
            {socials.length > 0 && (
              <>
                <p className="ey ft-h">{t.f_follow}</p>
                {socials.map((k) => (
                  <a key={k} href={u.socials[k]} className="ft-link" target="_blank" rel="noopener noreferrer me">
                    {SOCIAL_LABEL[k]} <span aria-hidden>↗</span>
                  </a>
                ))}
              </>
            )}
          </div>
        </div>
        <nav className="ft-nav" aria-label={LM[lang].footer}>
          {nav.map((n) => (
            <Link key={n.to + n.label} to={n.to} className="ft-navlink">
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="ft-bottom">
          <span>
            © {year} {u.abbr}
          </span>
          <Link to="/about/foydalanish-shartlari" className="ft-link">
            {t.f_terms}
          </Link>
          <Link to="/about/maxfiylik-siyosati" className="ft-link">
            {({ uz: "Maxfiylik siyosati", ru: "Политика конфиденциальности", en: "Privacy policy" } as Record<string, string>)[lang] ?? "Maxfiylik siyosati"}
          </Link>
          <Link to="/accessibility" className="ft-link">
            {A11Y_DICTS[lang].statement}
          </Link>
          {u.anticorruption_url && (
            <A to={u.anticorruption_url} className="ft-link">
              {t.u_anticorr}
            </A>
          )}
          <a href="/rss.xml" className="ft-link">
            RSS
          </a>
          <span className="ft-made">
            Made with{" "}
            <a href="https://t.me/uktamovpro" target="_blank" rel="noopener noreferrer">
              Bayroqdor
            </a>
          </span>
        </div>
      </div>
    </footer>
  );
}

export { Header as SiteHeader, Footer as SiteFooter, FooterSubscribe as SiteSubscribe, LangLinks };
