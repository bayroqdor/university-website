import { ArrowRight, ArrowUpRight, Calendar, Clock, Download, ExternalLink, FileText, Mail, MapPin, Phone } from "lucide-react";
import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { Announce, ContactPerson, Document, Event, Faculty, News, Partner, Program, Staff } from "../lib/api";
import { fmtDate } from "../lib/i18n";
import { useSite } from "../lib/site";
import { Reveal } from "./fx";
import { CardPrice } from "./tuition";
import { initials, PersonCard } from "./uni";

/* ------------------------------------------------------------------ yo'nalish kartasi */
export function ProgramCard({ p, index, large = false }: { p: Program; index: number; large?: boolean }) {
  const ref = useRef<HTMLAnchorElement>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const { motionOn, t } = useSite();
  const num = String(index + 1).padStart(2, "0");
  return (
    <Reveal delay={(index % 3) * 0.08} className={`project-card-wrap ${large ? "large" : ""}`}>
      <Link
        ref={ref}
        to={`/programs/${p.slug}`}
        className="project-card program-card"
        data-cursor={t.details}
        style={motionOn ? { transform: `perspective(1000px) rotateX(${tilt.y}deg) rotateY(${tilt.x}deg)` } : undefined}
        onPointerMove={(e) => {
          if (!motionOn || !ref.current) return;
          const r = ref.current.getBoundingClientRect();
          setTilt({ x: ((e.clientX - r.left) / r.width - 0.5) * 6, y: -((e.clientY - r.top) / r.height - 0.5) * 6 });
        }}
        onPointerLeave={() => setTilt({ x: 0, y: 0 })}
      >
        {/* muqova faqat haqiqiy rasm bo'lsa; rasmsiz karta — toza matnli karta (raqam meta qatorida) */}
        {p.cover && (
          <div className="project-media">
            <img src={p.cover} alt={p.title} loading="lazy" />
            <span className="project-num">{num}</span>
          </div>
        )}
        <div className="project-body">
          <div className="project-meta">
            {!p.cover && <span className="project-num">{num}</span>}
            <span className="tag">{t.degrees[p.degree] || p.degree}</span>
            {p.faculty && <span>{p.faculty}</span>}
            {p.duration && <span>· {p.duration}</span>}
          </div>
          <h3 className="project-title">
            {p.title}
            <ArrowUpRight className="arrow" size={22} />
          </h3>
          <p className="project-summary">{p.summary}</p>
          <CardPrice p={p} />
          {(p.languages?.length || p.code) && (
            <div className="project-metrics">
              {p.languages?.length > 0 && (
                <div>
                  <b>{p.languages.length}</b>
                  <span>{t.languages.toLowerCase()}</span>
                </div>
              )}
              {p.credits ? (
                <div>
                  <b>{p.credits}</b>
                  <span>{t.credits.toLowerCase()}</span>
                </div>
              ) : null}
              {p.degree === "joint" && (
                <div>
                  <b>1+1</b>
                  <span>{t.degrees.joint}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </Link>
    </Reveal>
  );
}

/* ------------------------------------------------------------------ fakultet */
export function FacultyCard({ f, index }: { f: Faculty; index: number }) {
  const { t } = useSite();
  return (
    <Reveal delay={index * 0.08} className="faculty-card-wrap">
      <Link to={`/faculties/${f.slug}`} className="faculty-card" data-cursor={t.details} style={f.accent ? { ["--pa" as string]: f.accent } : undefined}>
        <span className="faculty-idx">{String(index + 1).padStart(2, "0")}</span>
        <h3>{f.title}</h3>
        <p>{f.summary}</p>
        {f.programs?.length ? (
          <ul className="faculty-programs">
            {f.programs.slice(0, 6).map((p) => (
              <li key={p.slug}>{p.title}</li>
            ))}
          </ul>
        ) : null}
        {f.dean && (
          <small>
            {t.dean}: {f.dean}
          </small>
        )}
        <ArrowUpRight className="faculty-arrow" size={26} />
      </Link>
    </Reveal>
  );
}

/* ------------------------------------------------------------------ yangilik kartasi */
export function NewsCard({ p, index = 0, featured = false }: { p: News; index?: number; featured?: boolean }) {
  const { t, lang } = useSite();
  const other = p.lang && p.lang !== lang ? p.lang : null;
  return (
    <Reveal delay={(index % 3) * 0.08} className={`post-card-wrap ${featured ? "featured" : ""}`} as="article">
      <Link to={`/news/${p.slug}`} className="post-card" data-cursor={t.read_more}>
        {p.feature_image && (
          <div className="post-media">
            <img src={p.feature_image} alt={p.feature_alt || p.title} loading="lazy" />
          </div>
        )}
        <div className="post-body">
          <div className="post-meta">
            <time dateTime={p.published_at || ""}>{fmtDate(p.published_at, lang, true)}</time>
            {p.reading_time ? <span>· {p.reading_time} {t.min_read}</span> : null}
            {other && (
              <span className="lang-badge" title={t.lang_names[other]}>
                {other.toUpperCase()}
              </span>
            )}
          </div>
          <h3 className="post-title">{p.title}</h3>
          {p.excerpt && <p className="post-excerpt">{p.excerpt}</p>}
          {p.tags?.length > 0 && (
            <div className="post-tags">
              {p.tags.slice(0, 3).map((x) => (
                <span key={x} className="tag">
                  {x}
                </span>
              ))}
            </div>
          )}
        </div>
      </Link>
    </Reveal>
  );
}

/* ------------------------------------------------------------------ e'lon qatori */
export function AnnounceRow({ a, index }: { a: Announce; index: number }) {
  const { t, lang } = useSite();
  const soon = a.deadline && new Date(a.deadline).getTime() > Date.now();
  return (
    <Reveal as="li" delay={Math.min(index, 6) * 0.04} className="ann-row">
      <Link to={`/announcements/${a.slug}`} className="ann-link" data-cursor={t.read_more}>
        <div className="ann-date">
          <b>{a.published_at ? new Date(a.published_at).getDate() : ""}</b>
          <small>{fmtDate(a.published_at, lang, true).replace(/^\d+\s*/, "")}</small>
        </div>
        <div className="ann-main">
          <div className="pub-badges">
            <span className={`badge ${a.category === "admission" ? "" : "soft"}`}>{t.ann_cats[a.category] || a.category}</span>
            {soon && (
              <span className="badge outline">
                {t.deadline}: {fmtDate(a.deadline, lang, true)}
              </span>
            )}
          </div>
          <h3 className="ann-title">{a.title}</h3>
          {a.excerpt && <p className="ann-excerpt">{a.excerpt}</p>}
        </div>
        <ArrowUpRight className="ann-arrow" size={22} />
      </Link>
    </Reveal>
  );
}

/* ------------------------------------------------------------------ tadbir */
export function EventCard({ e, index }: { e: Event; index: number }) {
  const { t, lang } = useSite();
  const d = e.starts ? new Date(e.starts) : null;
  const past = !!e.starts && new Date(e.ends || e.starts).getTime() < Date.now();
  return (
    <Reveal delay={(index % 3) * 0.08} className={`event-card-wrap ${past ? "past" : ""}`}>
      <Link to={`/events/${e.slug}`} className="event-card" data-cursor={t.details}>
        <div className="event-date">
          <b>{d ? d.getDate() : "—"}</b>
          <span>{d ? fmtDate(e.starts, lang, true).replace(/^\d+\s*/, "") : ""}</span>
          {d && (
            <small>
              {String(d.getHours()).padStart(2, "0")}:{String(d.getMinutes()).padStart(2, "0")}
            </small>
          )}
        </div>
        <div className="event-body">
          <span className="tl-cat">{t.event_kinds[e.category] || e.category}</span>
          <h3>{e.title}</h3>
          {e.place && (
            <p className="event-place">
              <MapPin size={14} /> {e.place}
            </p>
          )}
          {e.summary && <p className="event-summary">{e.summary}</p>}
        </div>
      </Link>
    </Reveal>
  );
}

/* ------------------------------------------------------------------ xodim */
export function StaffCard({ s, index }: { s: Staff; index: number }) {
  return <PersonCard s={s} index={index} />;
}

/** Mas'ul xodim kartasi: portret, F.I.Sh., lavozim, qabul vaqti, xona, telefon, email.
 *  Sahifalarda (mas'ul xodim) va tuzilma bo'limlarida (rahbar, xodimlar) ishlatiladi; bo'sh maydonlar ko'rsatilmaydi.
 *  F.I.Sh. yoki surat bo'lmasa — rasm ustunisiz «solo» karta (harfli o'rinbosar yo'q). */
export function ContactCard({ c, label, room, level = "h2" }: { c: ContactPerson; label?: string; room?: string; level?: "h2" | "h3" }) {
  const { t } = useSite();
  const tel = c.phone ? `tel:${c.phone.replace(/[^+\d]/g, "")}` : "";
  const ey = label ?? t.contact_person;
  const Name = level;
  const facts = !!(c.hours || room || c.phone || c.email);
  return (
    <section className={`pc ${c.title ? "" : "solo"}`} aria-label={c.title || ey}>
      {c.title && (
        <div className="pc-photo">
          {c.photo ? <img src={c.photo} alt={c.title} loading="lazy" /> : <span className="person-initial" aria-hidden="true">{initials(c.title)}</span>}
        </div>
      )}
      <div className="pc-body">
        {ey && <p className="ey">{ey}</p>}
        {c.title && <Name className="pc-name">{c.title}</Name>}
        {c.position && <p className="pc-pos">{c.position}</p>}
        {facts && (
          <ul className="pc-facts">
            {c.hours && (
              <li>
                <Clock size={16} aria-hidden /> {c.hours}
              </li>
            )}
            {room && (
              <li>
                <MapPin size={16} aria-hidden /> {t.room}: {room}
              </li>
            )}
            {c.phone && (
              <li>
                <Phone size={16} aria-hidden /> <a href={tel}>{c.phone}</a>
              </li>
            )}
            {c.email && (
              <li>
                <Mail size={16} aria-hidden /> <a href={`mailto:${c.email}`}>{c.email}</a>
              </li>
            )}
          </ul>
        )}
        {(c.email || tel || c.slug) && (
          <div className="pc-acts">
            {(c.email || tel) && (
              <a className="pc-btn" href={c.email ? `mailto:${c.email}` : tel}>
                {t.contact_btn}
              </a>
            )}
            {c.slug && (
              <Link className="pc-btn ghost" to={`/staff/${c.slug}`}>
                {t.profile_btn} <ArrowRight size={15} aria-hidden />
              </Link>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ hamkor */
export function PartnerLogo({ p, index }: { p: Partner; index: number }) {
  const inner = (
    <>
      {p.logo ? <img src={p.logo} alt={p.title} loading="lazy" /> : <span className="partner-name">{p.title}</span>}
      <small>
        {p.country}
        {p.since ? ` · ${p.since}` : ""}
      </small>
    </>
  );
  return (
    <Reveal delay={(index % 6) * 0.05} className="partner-wrap">
      {p.url ? (
        <a href={p.url} target="_blank" rel="noopener noreferrer" className="partner" title={p.summary || p.title}>
          {inner}
          <ExternalLink size={13} className="partner-ext" />
        </a>
      ) : (
        <div className="partner">{inner}</div>
      )}
    </Reveal>
  );
}

/* ------------------------------------------------------------------ hujjat */
export function DocumentRow({ d, index }: { d: Document; index: number }) {
  const { t } = useSite();
  const href = d.file || d.url;
  return (
    <Reveal as="li" delay={Math.min(index, 6) * 0.04} className="pub-row doc-row-pub">
      <div className="pub-year">{d.year || "—"}</div>
      <div className="pub-main">
        <div className="pub-badges">
          <span className="badge soft">{t.doc_cats[d.category] || d.category}</span>
          {d.number && <span className="badge outline">№ {d.number}</span>}
        </div>
        <h3 className="pub-title">
          {href ? (
            <a href={href} target="_blank" rel="noopener noreferrer" data-cursor="">
              {d.title} <ExternalLink size={15} className="ext" />
            </a>
          ) : (
            d.title
          )}
        </h3>
        {d.summary && <p className="pub-venue">{d.summary}</p>}
        {href && (
          <div className="pub-actions">
            <a className="chip-btn" href={href} target="_blank" rel="noopener noreferrer">
              {d.file ? <Download size={13} /> : <FileText size={13} />} {d.file ? t.download : t.open_link}
            </a>
          </div>
        )}
      </div>
    </Reveal>
  );
}

/* ------------------------------------------------------------------ kontakt qatori */
export function ContactLines({ compact = false }: { compact?: boolean }) {
  const { data } = useSite();
  if (!data) return null;
  const u = data.uni;
  return (
    <div className={`contact-lines ${compact ? "compact" : ""}`}>
      {u.address && (
        <p className="contact-line">
          <MapPin size={15} /> {u.address}
        </p>
      )}
      {u.phones?.map((p) => (
        <a key={p} className="contact-line" href={`tel:${p.replace(/[^+\d]/g, "")}`}>
          <Phone size={15} /> {p}
        </a>
      ))}
      {u.email && (
        <a className="contact-line" href={`mailto:${u.email}`}>
          <Mail size={15} /> {u.email}
        </a>
      )}
      {u.hours && (
        <p className="contact-line">
          <Calendar size={15} /> {u.hours}
        </p>
      )}
    </div>
  );
}

export function SectionHead({ num, title, sub, link, linkLabel }: { num?: string; title: string; sub?: string; link?: string; linkLabel?: string }) {
  return (
    <div className="section-head">
      <Reveal className="section-head-l">
        {num && <span className="section-num">{num}</span>}
        <h2 className="section-title">{title}</h2>
        {sub && <p className="section-sub">{sub}</p>}
      </Reveal>
      {link && (
        <Reveal delay={0.1}>
          <Link to={link} className="link-arrow" data-cursor="">
            {linkLabel}
            <ArrowUpRight size={18} />
          </Link>
        </Reveal>
      )}
    </div>
  );
}
