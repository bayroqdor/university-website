/* Sayt uchun maxsus komponentlar: yuqori panel, sahifa pardasi, 1+1 yo'li animatsiyasi,
   bosh sahifa slaydlari, tezkor havolalar, professorlar karuseli, foydali havolalar. */
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  CalendarDays,
  ClipboardCheck,
  Clock,
  ExternalLink,
  Globe2,
  GraduationCap,
  Landmark,
  Library,
  LogIn,
  Mail,
  Phone,
  ShieldCheck,
  Users,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import type { HomeData, Staff, UsefulLink } from "../lib/api";
import { fmtDate } from "../lib/i18n";
import { useSite } from "../lib/site";
import { EASE, Reveal } from "./fx";
import "../styles/person.css";

/* ------------------------------------------------------------------ yordamchi: bosh harflar va avatar (kichik yuz doirachalari uchun) */
export function initials(name: string): string {
  return (name || "")
    .split(/\s+/)
    .filter(Boolean)
    .map((x) => x.replace(/^[^\p{L}]+/u, ""))
    .filter(Boolean)
    .slice(0, 2)
    .map((x) => x[0])
    .join("")
    .toUpperCase();
}

export function Avatar({ name, photo, className = "" }: { name: string; photo?: string; className?: string }) {
  if (photo) return <img className={`avatar-img ${className}`} src={photo} alt={name} loading="lazy" />;
  return (
    <span className={`avatar-fallback ${className}`} aria-label={name}>
      {initials(name)}
    </span>
  );
}

/* ------------------------------------------------------------------ yuqori axborot paneli */
export function TopBar() {
  const { data, t } = useSite();
  if (!data) return null;
  const u = data.uni;
  return (
    <div className="topbar">
      <div className="container topbar-inner">
        <div className="topbar-l">
          {u.phones?.[0] && (
            <a href={`tel:${u.phones[0].replace(/[^+\d]/g, "")}`}>
              <Phone size={13} /> {u.phones[0]}
            </a>
          )}
          {u.email && (
            <a href={`mailto:${u.email}`}>
              <Mail size={13} /> {u.email}
            </a>
          )}
          {u.hours && (
            <span className="hide-sm">
              <Clock size={13} /> {u.hours}
            </span>
          )}
        </div>
        <div className="topbar-r">
          {u.admission_url && (
            <a href={u.admission_url} target="_blank" rel="noopener noreferrer" className="topbar-hl">
              <ClipboardCheck size={13} /> {t.nav_admission}
            </a>
          )}
          {u.hemis_url ? (
            <a href={u.hemis_url} target="_blank" rel="noopener noreferrer">
              <ShieldCheck size={13} /> HEMIS
            </a>
          ) : null}
          <Link to="/library" className="hide-sm">
            <Library size={13} /> {t.library}
          </Link>
          <Link to="/links" className="hide-sm">
            <Landmark size={13} /> {t.links_title}
          </Link>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ sahifa almashinuvi pardasi */
export function RouteCurtain() {
  const { motionOn, data } = useSite();
  const loc = useLocation();
  const first = useRef(true);
  const [key, setKey] = useState(0);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (motionOn) setKey((k) => k + 1);
  }, [loc.pathname, motionOn]);
  return (
    <AnimatePresence>
      {key > 0 && (
        <motion.div
          key={key}
          className="curtain"
          aria-hidden
          initial={{ clipPath: "inset(100% 0 0 0)" }}
          animate={{ clipPath: ["inset(100% 0 0 0)", "inset(0% 0 0 0)", "inset(0 0 100% 0)"] }}
          transition={{ duration: 0.95, times: [0, 0.45, 1], ease: [0.76, 0, 0.24, 1] }}
          onAnimationComplete={() => setKey(0)}
        >
          <motion.span className="curtain-mark" initial={{ opacity: 0, y: 14 }} animate={{ opacity: [0, 1, 0], y: [14, 0, -14] }} transition={{ duration: 0.95, times: [0, 0.45, 1] }}>
            {data?.uni.logo_light || data?.uni.logo ? <img src={data.uni.logo_light || data.uni.logo} alt="" /> : data?.site.logo_text || "UNI"}
          </motion.span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ------------------------------------------------------------------ bosh ekran: «Universitet hayoti» — so'nggi yangilik, e'lon va tadbirlar */
type Spot = { kind: "news" | "announce" | "event"; to: string; title: string; date: string | null; image?: string; text?: string };

export function HeroSpotlight({ home, glass = false }: { home: HomeData | null; glass?: boolean }) {
  const { t, lang, motionOn } = useSite();
  const items: Spot[] = [];
  if (home) {
    home.news.slice(0, 3).forEach((n) => items.push({ kind: "news", to: `/news/${n.slug}`, title: n.title, date: n.published_at, image: n.feature_image, text: n.excerpt }));
    home.announcements.slice(0, 2).forEach((a) => items.push({ kind: "announce", to: `/announcements/${a.slug}`, title: a.title, date: a.published_at, text: a.excerpt }));
    home.events.slice(0, 1).forEach((e) => items.push({ kind: "event", to: `/events/${e.slug}`, title: e.title, date: e.starts, image: e.cover, text: e.place }));
  }
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const DUR = 3000; // yangiliklar har 3 soniyada almashadi
  useEffect(() => {
    if (!motionOn || paused || items.length < 2) return;
    const id = window.setTimeout(() => setI((x) => (x + 1) % items.length), DUR);
    return () => window.clearTimeout(id);
  }, [i, paused, motionOn, items.length]);
  const kindLabel = { news: t.news_title, announce: t.nav_announcements, event: t.nav_events };
  const cur = items[i % Math.max(items.length, 1)];
  const nextEvent = home?.events[0];
  return (
    <div className={`spot ${glass ? "glass" : ""}`} onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <div className="spot-head">
        <span className="spot-kicker">
          <span className="pulse" /> {t.spotlight_title}
        </span>
        <div className="spot-tabs" role="tablist">
          {items.map((it, n) => (
            <button key={n} role="tab" aria-selected={n === i} className={n === i ? "on" : ""} onClick={() => setI(n)} aria-label={it.title}>
              <span style={n === i && motionOn && !paused ? { animationDuration: `${DUR}ms` } : undefined} />
            </button>
          ))}
        </div>
      </div>
      {cur ? (
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={i} className="spot-slide" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.55, ease: EASE }}>
            {cur.image && (
              <Link to={cur.to} className="spot-media">
                <img src={cur.image} alt="" className={motionOn ? "kb-img" : ""} />
                <span className={`spot-chip k-${cur.kind}`}>{kindLabel[cur.kind]}</span>
              </Link>
            )}
            <div className="spot-body">
              {cur.date && <time>{fmtDate(cur.date, lang)}</time>}
              <Link to={cur.to} className="spot-title">
                {cur.title}
              </Link>
              {cur.text && <p>{cur.text}</p>}
            </div>
          </motion.div>
        </AnimatePresence>
      ) : (
        <div className="spot-empty" />
      )}
      {nextEvent && (
        <Link to={`/events/${nextEvent.slug}`} className={`spot-next ${cur?.kind === "event" ? "is-hidden" : ""}`} aria-hidden={cur?.kind === "event" || undefined} tabIndex={cur?.kind === "event" ? -1 : undefined}>
          <CalendarDays size={16} />
          <span>
            <small>{t.next_event}</small>
            <b>{nextEvent.title}</b>
          </span>
          <ArrowRight size={15} />
        </Link>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ bosh sahifa slaydlari (Ken Burns) */
export function HeroSlides({ images }: { images: string[] }) {
  const { motionOn } = useSite();
  const [i, setI] = useState(0);
  useEffect(() => {
    if (images.length < 2) return;
    const id = window.setInterval(() => setI((x) => (x + 1) % images.length), 6500);
    return () => window.clearInterval(id);
  }, [images.length]);
  return (
    <div className="hero-slides" aria-hidden>
      <AnimatePresence initial={false}>
        <motion.div
          key={i}
          className="hero-slide"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1.4, ease: "easeInOut" }}
          style={{ backgroundImage: `url(${images[i]})` }}
        >
          {motionOn && <span className="kb" style={{ backgroundImage: `url(${images[i]})` }} />}
        </motion.div>
      </AnimatePresence>
      <div className="hero-shade" />
      {images.length > 1 && (
        <div className="hero-dots">
          {images.map((_, n) => (
            <button key={n} className={n === i ? "on" : ""} onClick={() => setI(n)} aria-label={`${n + 1}`}>
              <span />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const hostOf = (u: string) => {
  try {
    return new URL(u).host.replace(/^www\./, "");
  } catch {
    return "";
  }
};

/* ------------------------------------------------------------------ tezkor havolalar */
export function QuickLinks() {
  const { data, t } = useSite();
  if (!data) return null;
  const u = data.uni;
  const items: { to: string; label: string; icon: ReactNode; ext?: boolean; hint?: string }[] = [
    { to: u.admission_url || "/admission", label: t.nav_admission, icon: <ClipboardCheck />, ext: !!u.admission_url, hint: u.admission_url ? hostOf(u.admission_url) : "" },
    { to: "/programs", label: t.programs_title, icon: <BookOpen /> },
    { to: "/faculties", label: t.faculties_title, icon: <Users /> },
    { to: "/login", label: t.portal, icon: <LogIn />, hint: t.nav_schedule },
    { to: u.hemis_url || "/students", label: t.hemis, icon: <ShieldCheck />, ext: !!u.hemis_url, hint: u.hemis_url ? hostOf(u.hemis_url) : t.nav_students },
    { to: "/library", label: t.library, icon: <Library />, hint: t.library_hint },
  ];
  return (
    <div className="quick">
      {items.map((it, n) => {
        const body = (
          <>
            <span className="quick-ic">{it.icon}</span>
            <span className="quick-txt">
              <b>{it.label}</b>
              {it.hint && <small>{it.hint}</small>}
            </span>
            <ArrowUpRight className="quick-arrow" size={16} />
          </>
        );
        return (
          <motion.div key={it.to} initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-40px" }} transition={{ duration: 0.6, delay: n * 0.06, ease: EASE }}>
            {it.ext ? (
              <a href={it.to} target="_blank" rel="noopener noreferrer" className="quick-item">
                {body}
              </a>
            ) : (
              <Link to={it.to} className="quick-item">
                {body}
              </Link>
            )}
          </motion.div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ professorlar karuseli */
/** Xodim kartasi (fakultet, «Professor-o'qituvchilar», hamkasblar): chapda kichik portret, o'ngda turkum, F.I.Sh., lavozim, bo'lim.
 *  Barcha kartalar bir xil o'lchamda — surat bo'lmasa o'sha joyda bosh harf (oddiy fon, bezaksiz), to'r buzilmaydi. */
export function PersonCard({ s, index = 0 }: { s: Staff; index?: number }) {
  const { t } = useSite();
  return (
    <Reveal delay={(index % 3) * 0.05} className="person-wrap">
      <Link to={`/staff/${s.slug}`} className="person">
        <span className="person-photo">{s.photo ? <img src={s.photo} alt={s.title} loading="lazy" /> : <span className="person-initial" aria-hidden="true">{initials(s.title)}</span>}</span>
        <span className="person-body">
          <span className="person-cat">{t.staff_kinds[s.category] || s.category}</span>
          <b className="person-name">{s.title}</b>
          {s.position && <span className="person-pos">{s.position}</span>}
          {(s.department || s.faculty) && <small className="person-unit">{s.department || s.faculty}</small>}
        </span>
      </Link>
    </Reveal>
  );
}

export const ProfessorCard = PersonCard;

/** Professorlar lentasi: sekin, uzluksiz aylanadi; sichqoncha ustida to'xtaydi */
export function ProfessorMarquee({ items }: { items: Staff[] }) {
  const { motionOn } = useSite();
  if (!motionOn || items.length < 4) return <ProfessorCarousel items={items} />;
  const row = [...items, ...items];
  return (
    <div className="prof-marquee">
      <div className="prof-marquee-track" style={{ animationDuration: `${items.length * 7}s` }}>
        {row.map((s, i) => (
          <div key={`${s.id}-${i}`} className="prof-marquee-item" aria-hidden={i >= items.length}>
            <ProfessorCard s={s} index={0} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function ProfessorCarousel({ items }: { items: Staff[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState({ start: true, end: false });
  const update = () => {
    const el = ref.current;
    if (!el) return;
    setEdge({ start: el.scrollLeft < 8, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 8 });
  };
  useEffect(update, [items.length]);
  const go = (dir: number) => {
    const el = ref.current;
    if (el) el.scrollBy({ left: dir * Math.max(280, el.clientWidth * 0.8), behavior: "smooth" });
  };
  return (
    <div className="carousel">
      <div className="carousel-track" ref={ref} onScroll={update}>
        {items.map((s, i) => (
          <ProfessorCard key={s.id} s={s} index={i} />
        ))}
      </div>
      <div className="carousel-nav">
        <button onClick={() => go(-1)} disabled={edge.start} aria-label="←">
          <ArrowLeft size={18} />
        </button>
        <button onClick={() => go(1)} disabled={edge.end} aria-label="→">
          <ArrowRight size={18} />
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ foydali havolalar */
const LINK_ICON: Record<string, typeof Landmark> = { gov: Landmark, edu: GraduationCap, service: ShieldCheck, intl: Globe2, other: Globe2 };

export function LinkCard({ l, index = 0 }: { l: UsefulLink; index?: number }) {
  const Icon = LINK_ICON[l.category] || Globe2;
  return (
    <Reveal delay={(index % 4) * 0.06} className="ulink-wrap">
      <a href={l.url} target="_blank" rel="noopener noreferrer" className={`ulink c-${l.category}`} title={l.title}>
        <span className="ulink-logo">{l.logo ? <img src={l.logo} alt="" loading="lazy" /> : <Icon size={26} strokeWidth={1.5} />}</span>
        <span className="ulink-body">
          <b>
            {l.title} <ExternalLink size={12} />
          </b>
        </span>
        <span className="ulink-shine" aria-hidden />
      </a>
    </Reveal>
  );
}

export function LinksGrid({ items }: { items: UsefulLink[] }) {
  return (
    <div className="ulinks">
      {items.map((l, i) => (
        <LinkCard key={l.id} l={l} index={i} />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ rasm uchun "parda" ochilishi */
export function RevealImg({ src, alt, className = "" }: { src: string; alt: string; className?: string }) {
  const { motionOn } = useSite();
  if (!motionOn) return <img src={src} alt={alt} className={className} loading="lazy" />;
  return (
    <motion.div className={`reveal-img ${className}`} initial={{ clipPath: "inset(0 0 100% 0)" }} whileInView={{ clipPath: "inset(0 0 0% 0)" }} viewport={{ once: true, margin: "-60px" }} transition={{ duration: 1.1, ease: [0.76, 0, 0.24, 1] }}>
      <motion.img src={src} alt={alt} loading="lazy" initial={{ scale: 1.25 }} whileInView={{ scale: 1 }} viewport={{ once: true, margin: "-60px" }} transition={{ duration: 1.6, ease: EASE }} />
    </motion.div>
  );
}
