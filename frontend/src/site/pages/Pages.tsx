import {
  ArrowLeft,
  ArrowUpRight,
  Building2,
  Clock,
  ExternalLink,
  Mail,
  MapPin,
  Phone,
  Search,
  Send,
  Star,
  Wallet,
} from "lucide-react";
import {
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { Link, Navigate, useParams, useSearchParams } from "react-router-dom";
import {
  ApiError,
  pub,
  type Announce,
  type ContactPerson,
  type Department,
  type Document,
  type Event,
  type News,
  type Page,
  type Partner,
  type PublicRequest,
  type Staff,
} from "../../lib/api";
import { useSite } from "../../lib/site";
import { fmtDateTime } from "../../lib/i18n";
import {
  AnnounceRow,
  ContactCard,
  ContactLines,
  DocumentRow,
  EventCard,
  FacultyCard,
  NewsCard,
  PartnerLogo,
  ProgramCard,
  SectionHead,
  StaffCard,
} from "../cards";
import { Magnetic, Reveal, SplitText } from "../fx";
import { Socials } from "../Layout";
import { SiteSubscribe } from "../chrome/Chrome";
import { LangNotice, Share } from "../share";
import { fmtCompact, minFee, TuitionBlock, TuitionTable } from "../tuition";
import {
  Avatar,
  initials,
  LinksGrid,
  ProfessorCard,
  ProfessorCarousel,
  RevealImg,
} from "../uni";

import { FaqSection } from "./Faq";
import { Consent } from "../official/Consent";
import "../../styles/careers.css";
import "../../styles/structure.css";

const RichHtml = lazy(() => import("../../rich/RichHtml"));
// /admission: qabul bosqichlari va abituriyent bo'limlariga havolalar (site/campus) — mazmuni bo'lmasa ko'rinmaydi
const AdmissionBlock = lazy(() => import("../campus/AdmissionBlock"));
const PracticeBases = lazy(() => import("../career/Partners").then((m) => ({ default: m.PracticeBases })));

export function PageHero({
  eyebrow,
  title,
  sub,
  children,
  notice,
  accent,
}: {
  eyebrow?: string;
  title: string;
  sub?: string;
  children?: ReactNode;
  notice?: ReactNode;
  accent?: string;
}) {
  return (
    <section className={`page-hero ${accent ? "tinted" : ""}`} style={accent ? ({ ["--accent" as string]: accent, ["--accent2" as string]: accent } as React.CSSProperties) : undefined}>
      <div className="container">
        {notice}
        {eyebrow && <Reveal className="page-eyebrow">{eyebrow}</Reveal>}
        <h1 className="page-title">
          <SplitText text={title} />
        </h1>
        {sub && (
          <Reveal delay={0.3}>
            <p className="page-sub">{sub}</p>
          </Reveal>
        )}
        {children}
      </div>
    </section>
  );
}

export function Loading() {
  return (
    <div className="container section">
      <div className="skeleton" />
      <div className="skeleton short" />
    </div>
  );
}

export function useFetch<T>(
  fn: () => Promise<T>,
  deps: unknown[] = [],
): T | null | "404" {
  const [d, setD] = useState<T | null | "404">(null);
  useEffect(() => {
    setD(null);
    fn()
      .then(setD)
      .catch(() => setD("404"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return d;
}

/* ------------------------------------------------------------------ universitet haqida (bo'lim indeksi) */
export function AboutIndex() {
  const { data, t } = useSite();
  const d = useFetch(() => pub.pages("about"));
  if (!data) return null;
  const u = data.uni;
  const pages = d && d !== "404" ? d.items : [];
  return (
    <>
      <PageHero eyebrow={u.abbr} title={u.name} sub={u.tagline} />
      <section className="section tight">
        <div className="container about-grid">
          <Reveal className="about-side">
            {u.logo && (
              <div className="about-photo logo">
                <img src={u.logo} alt={u.abbr} />
              </div>
            )}
            <dl className="about-dl">
              {u.founded && (
                <>
                  <dt>{t.founded}</dt>
                  <dd>{u.founded}</dd>
                </>
              )}
              {u.founder && (
                <>
                  <dt>{t.founder}</dt>
                  <dd>{u.founder}</dd>
                </>
              )}
              {u.license && (
                <>
                  <dt>{t.license}</dt>
                  <dd>{u.license}</dd>
                </>
              )}
              {u.address && (
                <>
                  <dt>{t.address}</dt>
                  <dd>
                    <MapPin size={14} /> {u.address}
                  </dd>
                </>
              )}
            </dl>
            <Socials />
          </Reveal>
          <div className="about-main">
            <Reveal>
              <p className="lead-xl">{u.short_about}</p>
            </Reveal>
            {u.mission && (
              <Reveal className="mission">
                <span className="tl-cat">{t.mission}</span>
                <p className="lead">{u.mission}</p>
              </Reveal>
            )}
            {u.values?.length > 0 && (
              <div className="skills">
                <Reveal>
                  <h2 className="h-sm">{t.values_title}</h2>
                </Reveal>
                <Reveal className="chips">
                  {u.values.map((x) => (
                    <span key={x} className="chip">
                      {x}
                    </span>
                  ))}
                </Reveal>
              </div>
            )}
            {pages.length > 0 && (
              <div className="skills">
                <Reveal>
                  <h2 className="h-sm">{t.nav_about}</h2>
                </Reveal>
                <ul className="interest-list pages-list">
                  {pages.map((p, i) => (
                    <Reveal
                      as="li"
                      key={p.id}
                      delay={i * 0.04}
                      className="interest"
                    >
                      <span className="interest-idx">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <Link
                        to={`/about/${p.slug}`}
                        className="interest-text sm"
                      >
                        {p.title}
                      </Link>
                      <ArrowUpRight className="interest-arrow" size={28} />
                    </Reveal>
                  ))}
                </ul>
              </div>
            )}
            <Reveal className="about-links">
              <Link to="/faculties" className="chip-btn">
                {t.nav_faculties}
              </Link>
              <Link to="/structure" className="chip-btn">
                {t.nav_structure}
              </Link>
              <Link to="/documents" className="chip-btn">
                {t.nav_documents}
              </Link>
              <Link to="/partners" className="chip-btn">
                {t.nav_partners}
              </Link>
            </Reveal>
          </div>
        </div>
      </section>
    </>
  );
}

/* ------------------------------------------------------------------ yo'nalishlar */
export function ProgramsPage() {
  const { t } = useSite();
  const d = useFetch(() => pub.programs());
  const [fac, setFac] = useState("");
  const [deg, setDeg] = useState("");
  const [byPrice, setByPrice] = useState(false);
  const { data: site } = useSite();
  const items = d && d !== "404" ? d.items : [];
  const faculties = d && d !== "404" ? d.faculties : [];
  const degrees = useMemo(
    () => [...new Set(items.map((p) => p.degree))],
    [items],
  );
  const filtered = items.filter(
    (p) => (!fac || p.faculty_id === fac) && (!deg || p.degree === deg),
  );
  const shown = byPrice ? [...filtered].sort((a, b) => (minFee(a)?.amount ?? Infinity) - (minFee(b)?.amount ?? Infinity)) : filtered;
  const priced = !!site?.tuition && items.some((p) => p.fees?.length);
  return (
    <>
      <PageHero
        eyebrow={`${items.length} · ${t.nav_programs.toLowerCase()}`}
        title={t.programs_title}
        sub={t.programs_sub}
      >
        <Reveal delay={0.4} className="filter-row">
          <button
            className={`filter ${!fac ? "on" : ""}`}
            onClick={() => setFac("")}
          >
            {t.all}
          </button>
          {faculties.map((f) => (
            <button
              key={f.id}
              className={`filter ${fac === f.id ? "on" : ""}`}
              onClick={() => setFac(fac === f.id ? "" : f.id)}
            >
              {f.title}
            </button>
          ))}
          {degrees.length > 1 &&
            degrees.map((x) => (
              <button
                key={x}
                className={`filter ${deg === x ? "on" : ""}`}
                onClick={() => setDeg(deg === x ? "" : x)}
              >
                {t.degrees[x] || x}
              </button>
            ))}
          {priced && (
            <button className={`filter filter-price ${byPrice ? "on" : ""}`} onClick={() => setByPrice(!byPrice)}>
              <Wallet size={14} /> {t.sort_price}
            </button>
          )}
        </Reveal>
      </PageHero>
      <section className="section tight">
        <div className="container">
          {/* sarlavhalar tartibi: h1 → h2 (ko'rinmas) → kartalardagi h3 */}
          <h2 className="a11y-sr">{t.programs_all}</h2>
          {!d ? (
            <Loading />
          ) : (
            <div className="project-grid">
              {shown.map((p, i) => (
                <ProgramCard key={p.id} p={p} index={i} />
              ))}
            </div>
          )}
          {priced && <TuitionTable items={items} faculties={faculties} />}
        </div>
      </section>
    </>
  );
}

function Fact({ label, value }: { label: string; value?: ReactNode }) {
  if (!value) return null;
  return (
    <div className="stat">
      <div className="stat-value sm">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

export function ProgramPage() {
  const { slug } = useParams();
  const { t, data, lang } = useSite();
  const d = useFetch(() => pub.program(slug || ""), [slug]);
  if (d === "404") return <NotFound />;
  if (!d || !data) return <Loading />;
  const p = d.item;
  return (
    <>
      <PageHero
        eyebrow={[t.degrees[p.degree] || p.degree, d.faculty?.title, p.code]
          .filter(Boolean)
          .join(" · ")}
        title={p.title}
        sub={p.summary}
        notice={<LangNotice served={p.lang} langs={p.langs} />}
      >
        <Reveal delay={0.4} className="project-links">
          {data.uni.admission_url && (
            <Magnetic>
              <a
                className="btn btn-primary"
                href={data.uni.admission_url}
                target="_blank"
                rel="noopener noreferrer"
                data-cursor=""
              >
                {t.admission_cta} <ArrowUpRight size={16} />
              </a>
            </Magnetic>
          )}
          <Magnetic>
            <Link className="btn btn-ghost" to="/admission" data-cursor="">
              {t.admission_more}
            </Link>
          </Magnetic>
        </Reveal>
      </PageHero>
      <section className="section tight">
        <div className="container">
          {/* muqova faqat haqiqiy rasm bo'lsa; rasmsiz — blok umuman chiqmaydi */}
          {p.cover && (
            <Reveal className="project-cover">
              <img src={p.cover} alt={p.title} />
            </Reveal>
          )}
          <div className="stats project-stats">
            <Fact label={t.degree} value={t.degrees[p.degree]} />
            <Fact label={t.duration} value={p.duration} />
            <Fact label={t.languages} value={p.languages?.join(", ")} />
            <Fact label={t.credits} value={p.credits} />
            <Fact label={t.form} value={p.form?.join(", ")} />
            <Fact label={t.tuition} value={minFee(p) && data.tuition ? fmtCompact(minFee(p)!.amount, lang) : p.tuition} />
            <Fact label={t.quota} value={p.quota} />
          </div>
          <TuitionBlock p={p} />
          <div className="article-wrap">
            <Suspense fallback={<Loading />}>
              <RichHtml html={p.html} doc={p.content} />
            </Suspense>
            {p.subjects?.length > 0 && (
              <div className="skills">
                <h2 className="h-sm">{t.subjects}</h2>
                <div className="chips">
                  {p.subjects.map((x) => (
                    <span key={x} className="chip">
                      {x}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {p.careers?.length > 0 && (
              <div className="skills">
                <h2 className="h-sm">{t.careers}</h2>
                <ul className="check-list">
                  {p.careers.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
              </div>
            )}
            {p.partner && (
              <div className="skills">
                <h2 className="h-sm">{t.partner_univ}</h2>
                <p className="lead">{p.partner}</p>
              </div>
            )}
            {/* amaliyot bazalari (hamkorlar bo'limidan) — bo'lmasa blok chiqmaydi */}
            <Suspense fallback={null}>
              <PracticeBases program={p.id} />
            </Suspense>
            <div className="post-foot-actions project-share">
              <Share title={p.title} text={p.summary} full />
            </div>
          </div>
        </div>
      </section>
      {d.others.length > 0 && (
        <section className="section">
          <div className="container">
            <SectionHead
              title={t.other_programs}
              link="/programs"
              linkLabel={t.programs_all}
            />
            <div className="project-grid three">
              {d.others.slice(0, 3).map((x, i) => (
                <ProgramCard key={x.id} p={x} index={i} />
              ))}
            </div>
          </div>
        </section>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ fakultetlar */
export function FacultiesPage() {
  const { t } = useSite();
  const d = useFetch(() => pub.faculties());
  const items = d && d !== "404" ? d.items : [];
  return (
    <>
      <PageHero eyebrow={t.nav_about} title={t.faculties_title} />
      <section className="section tight">
        <div className="container">
          {/* sarlavhalar tartibi: h1 → h2 (ko'rinmas) → kartalardagi h3 */}
          <h2 className="a11y-sr">{t.faculties_all}</h2>
          {!d ? (
            <Loading />
          ) : (
            <div className="faculty-grid">
              {items.map((f, i) => (
                <FacultyCard key={f.id} f={f} index={i} />
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  );
}

// har bir fakultetning o'z rangi (admin «Urg‘u rangi» bermagan bo'lsa)
const FAC_COLORS = ["#1E4FA3", "#B8352F", "#0F766E", "#7C3AED", "#B45309", "#0E7490"];

export function FacultyPage() {
  const { slug } = useParams();
  const { t } = useSite();
  const d = useFetch(() => pub.faculty(slug || ""), [slug]);
  if (d === "404") return <NotFound />;
  if (!d) return <Loading />;
  const f = d.item;
  return (
    <>
      <PageHero
        eyebrow={t.faculty}
        title={f.title}
        sub={f.summary}
        notice={<LangNotice served={f.lang} langs={f.langs} />}
        accent={f.accent || FAC_COLORS[(f.sort || 0) % FAC_COLORS.length]}
      >
        {(f.dean || f.email || f.phone) && (
          <Reveal delay={0.4} className="about-facts">
            {f.dean && !d.dean && (
              <span className="fact">
                <b>{t.dean}</b> {f.dean}
              </span>
            )}
            {f.email && (
              <a className="fact" href={`mailto:${f.email}`}>
                <b>{t.email}</b> {f.email}
              </a>
            )}
            {f.phone && (
              <span className="fact">
                <b>{t.phone}</b> {f.phone}
              </span>
            )}
          </Reveal>
        )}
      </PageHero>
      <section className="section tight">
        <div className="container">
          {(f.html || f.content) && (
            <div className="article-wrap top">
              <Suspense fallback={<Loading />}>
                <RichHtml html={f.html} doc={f.content} />
              </Suspense>
            </div>
          )}
          {d.programs.length > 0 && (
            <>
              <SectionHead title={t.programs_title} />
              <div className="project-grid">
                {d.programs.map((p, i) => (
                  <ProgramCard key={p.id} p={p} index={i} />
                ))}
              </div>
            </>
          )}
        </div>
      </section>
      {(d.dean || d.staff.length > 0) && (
        <section className="section tight" id="professors">
          <div className="container">
            <SectionHead title={t.faculty_staff} />
            {d.dean && (
              <Reveal>
                <Link to={`/staff/${d.dean.slug}`} className="dean-card" data-cursor={t.profile_open}>
                  <div className="dean-photo">
                    {d.dean.photo ? <img src={d.dean.photo} alt={d.dean.title} loading="lazy" /> : <span className="person-initial" aria-hidden="true">{initials(d.dean.title)}</span>}
                  </div>
                  <div>
                    <span className="dean-badge">{t.faculty_dean}</span>
                    <h3>{d.dean.title}</h3>
                    {(d.dean.position || d.dean.degree) && <div className="dean-pos">{[d.dean.position, d.dean.degree].filter(Boolean).join(" · ")}</div>}
                    {d.dean.bio && <p>{d.dean.bio}</p>}
                    <div className="dean-contacts">
                      {d.dean.email && (
                        <span>
                          <Mail size={14} /> {d.dean.email}
                        </span>
                      )}
                      {d.dean.phone && (
                        <span>
                          <Phone size={14} /> {d.dean.phone}
                        </span>
                      )}
                      <span className="link-arrow">
                        {t.profile_open} <ArrowUpRight size={15} />
                      </span>
                    </div>
                  </div>
                </Link>
              </Reveal>
            )}
            {d.staff.length > 0 && (
              <div className="person-grid">
                {d.staff.map((s, i) => (
                  <StaffCard key={s.id} s={s} index={i} />
                ))}
              </div>
            )}
          </div>
        </section>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ tuzilma */
export function StructurePage() {
  const { t } = useSite();
  const d = useFetch(() => pub.structure());
  const items = d && d !== "404" ? d.items : [];
  const order = ["department", "center", "office", "council"];
  const groups = useMemo(() => {
    const m = new Map<string, Department[]>();
    items.forEach((x) => m.set(x.category, [...(m.get(x.category) || []), x]));
    return [...m.entries()].sort(
      (a, b) => order.indexOf(a[0]) - order.indexOf(b[0]),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);
  return (
    <>
      <PageHero eyebrow={t.nav_about} title={t.nav_structure} />
      <section className="section tight">
        <div className="container">
          {!d ? (
            <Loading />
          ) : (
            groups.map(([cat, list]) => (
              <div key={cat} className="dep-group">
                <Reveal className="dep-group-head">
                  <h2>{t.dep_kinds[cat] || cat}</h2>
                  <i>{list.length}</i>
                </Reveal>
                <div className="dep-grid">
                  {list.map((x, i) => (
                    <Reveal key={x.id} delay={(i % 3) * 0.06}>
                      <Link
                        to={`/structure/${x.slug}`}
                        className={`dep-card ${x.cover ? "has-cover" : ""}`}
                      >
                        {x.cover && (
                          <span
                            className="dep-cover"
                            style={{ backgroundImage: `url(${x.cover})` }}
                          />
                        )}
                        <span className="dep-ic">
                          <Building2 size={20} />
                        </span>
                        <h3>{x.title}</h3>
                        {x.faculty && (
                          <small className="dep-fac">{x.faculty.title}</small>
                        )}
                        {x.summary && <p>{x.summary}</p>}
                        {x.head ? (
                          <span className="dep-head">
                            <Avatar
                              name={x.head}
                              photo={x.head_photo}
                              className="face"
                            />
                            <span>
                              <b>{x.head}</b>
                              <em>
                                {t.head}
                                {(x.staff_count ?? 0) > 1 &&
                                  ` · ${x.staff_count} ${t.members}`}
                              </em>
                            </span>
                          </span>
                        ) : (
                          (x.staff_count ?? 0) > 0 && (
                            <span className="dep-faces">
                              {(x.faces || []).map((f) => (
                                <Avatar
                                  key={f.title}
                                  name={f.title}
                                  photo={f.photo}
                                  className="face"
                                />
                              ))}
                              <em>
                                {x.staff_count} {t.members}
                              </em>
                            </span>
                          )
                        )}
                        <ArrowUpRight className="dep-arrow" size={20} />
                      </Link>
                    </Reveal>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </>
  );
}

const asContact = (s: Staff): ContactPerson => ({
  id: s.id,
  title: s.title,
  slug: s.slug || "",
  position: s.position,
  degree: s.degree,
  photo: s.photo,
  email: s.email,
  phone: s.phone,
  hours: s.hours || "",
});

export function DepartmentPage() {
  const { slug } = useParams();
  const { t } = useSite();
  const d = useFetch(() => pub.department(slug || ""), [slug]);
  if (d === "404") return <NotFound />;
  if (!d) return <Loading />;
  const x = d.item;
  // rahbar kartasi: bo'lim telefoni/emaili ustun (rasmiy aloqa), bo'lmasa — rahbarning o'zi
  const h = d.head;
  const contact: ContactPerson | null = h
    ? {
        ...asContact(h),
        email: x.email || h.email,
        phone: x.phone || h.phone,
      }
    : x.head || x.email || x.phone || x.room
      ? {
          id: x.id,
          title: x.head || "",
          slug: "",
          position: "",
          degree: "",
          photo: "",
          hours: "",
          email: x.email,
          phone: x.phone,
        }
      : null;
  return (
    <>
      <PageHero
        eyebrow={t.dep_kinds[x.category] || x.category}
        title={x.title}
        sub={x.summary}
        notice={<LangNotice served={x.lang} langs={x.langs} />}
      >
        {d.faculty && (
          <Reveal delay={0.4} className="about-facts">
            <Link className="fact" to={`/faculties/${d.faculty.slug}`}>
              <b>{t.faculty}</b> {d.faculty.title}
            </Link>
          </Reveal>
        )}
      </PageHero>
      {x.cover && (
        <div className="container">
          <RevealImg src={x.cover} alt={x.title} className="dep-hero-img" />
        </div>
      )}
      {(x.html || x.content) && (
        <section className="section tight">
          <div className="container">
            <div className="article-wrap top">
              <Suspense fallback={<Loading />}>
                <RichHtml html={x.html} doc={x.content} />
              </Suspense>
            </div>
          </div>
        </section>
      )}
      {(contact || d.staff.length > 0) && (
        <section className="section tight">
          <div className="container">
            <div className="dep-people">
              {contact && (
                <Reveal>
                  <ContactCard
                    c={contact}
                    label={contact.title ? t.head : t.f_contacts}
                    room={x.room}
                  />
                </Reveal>
              )}
              {d.staff.length > 0 && (
                <>
                  <h2 className="ey dep-people-h">
                    {t.staff_kinds.staff} <span>{d.staff.length}</span>
                  </h2>
                  <div className="pc-list many">
                    {d.staff.map((s, i) => (
                      <Reveal key={s.id} delay={(i % 2) * 0.06}>
                        <ContactCard
                          c={asContact(s)}
                          label=""
                          level="h3"
                        />
                      </Reveal>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </section>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ xodimlar */
export function StaffPage() {
  const { t } = useSite();
  const [params, setParams] = useSearchParams();
  const d = useFetch(() => pub.staff());
  const kind = params.get("kind") || "";
  const [q, setQ] = useState("");
  const dep = params.get("department") || "";
  const setKind = (v: string) => {
    const n = new URLSearchParams(params);
    if (v) n.set("kind", v);
    else n.delete("kind");
    setParams(n, { replace: true });
  };
  const items = d && d !== "404" ? d.items : [];
  const deps =
    d && d !== "404"
      ? d.departments.filter((x) => items.some((s) => s.department_id === x.id))
      : [];
  const kinds = useMemo(
    () =>
      ["leadership", "visiting", "professor", "teacher", "staff"].filter((k) =>
        items.some((s) => s.category === k),
      ),
    [items],
  );
  const shown = items.filter(
    (s) =>
      (!kind || s.category === kind) &&
      (!dep || s.department_id === dep) &&
      (!q ||
        `${s.title} ${s.position} ${s.department || ""}`
          .toLowerCase()
          .includes(q.toLowerCase())),
  );
  const setDep = (v: string) => {
    const n = new URLSearchParams(params);
    if (v) n.set("department", v);
    else n.delete("department");
    setParams(n, { replace: true });
  };
  return (
    <>
      <PageHero
        eyebrow={`${items.length} ${t.members}`}
        title={t.professors_title}
        sub={t.professors_sub}
      >
        <Reveal delay={0.4} className="blog-tools">
          <label className="search">
            <Search size={17} />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t.search}
              aria-label={t.search}
            />
          </label>
          <div className="filter-row">
            <button
              className={`filter ${!kind ? "on" : ""}`}
              onClick={() => setKind("")}
            >
              {t.all}
            </button>
            {kinds.map((k) => (
              <button
                key={k}
                className={`filter ${kind === k ? "on" : ""}`}
                onClick={() => setKind(kind === k ? "" : k)}
              >
                {t.staff_kinds[k] || k}
              </button>
            ))}
          </div>
          {deps.length > 0 && (
            <div className="filter-row deps">
              {deps.map((x) => (
                <button
                  key={x.id}
                  className={`filter soft ${dep === x.id ? "on" : ""}`}
                  onClick={() => setDep(dep === x.id ? "" : x.id)}
                >
                  {x.title}
                </button>
              ))}
            </div>
          )}
        </Reveal>
      </PageHero>
      <section className="section tight">
        <div className="container">
          {!d ? (
            <Loading />
          ) : shown.length === 0 ? (
            <p className="empty">{t.no_results}</p>
          ) : (
            <div className="person-grid">
              {shown.map((s, i) => (
                <ProfessorCard key={s.id} s={s} index={i} />
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  );
}

export function StaffDetailPage() {
  const { slug } = useParams();
  const { t } = useSite();
  const d = useFetch(() => pub.staffItem(slug || ""), [slug]);
  if (d === "404") return <NotFound />;
  if (!d) return <Loading />;
  const s = d.item;
  const block = (title: string, body?: string) =>
    body ? (
      <Reveal className="profile-block">
        <h2 className="h-sm">{title}</h2>
        <p className="pre">{body}</p>
      </Reveal>
    ) : null;
  return (
    <>
      <section className="profile-hero">
        <div className="container profile-grid">
          <Reveal className="profile-photo">
            {s.photo ? <Avatar name={s.title} photo={s.photo} /> : <span className="person-initial" aria-hidden="true">{initials(s.title)}</span>}
          </Reveal>
          <div className="profile-head">
            <LangNotice served={s.lang} langs={s.langs} />
            <Reveal>
              <Link
                to={d.faculty ? `/faculties/${d.faculty.slug}` : d.department ? `/structure/${d.department.slug}` : "/faculties"}
                className="back-link"
              >
                <ArrowLeft size={15} />{" "}
                {d.faculty ? d.faculty.title : d.department ? d.department.title : t.faculties_title}
              </Link>
              {d.is_dean && <span className="dean-badge" style={{ marginLeft: 10 }}>{t.dean_badge}</span>}
            </Reveal>
            <span className="eyebrow">
              {t.staff_kinds[s.category] || s.category}
            </span>
            <h1 className="page-title">
              <SplitText text={s.title} />
            </h1>
            {s.position && (
              <Reveal delay={0.25}>
                <p className="page-sub">{s.position}</p>
              </Reveal>
            )}
            <Reveal delay={0.35} className="profile-facts">
              {s.degree && (
                <span>
                  <b>{t.degree}</b> {s.degree}
                </span>
              )}
              {d.faculty && (
                <Link to={`/faculties/${d.faculty.slug}`}>
                  <b>{t.faculty}</b> {d.faculty.title}
                </Link>
              )}
              {s.email && (
                <a href={`mailto:${s.email}`}>
                  <Mail size={14} /> {s.email}
                </a>
              )}
              {s.phone && (
                <a href={`tel:${s.phone.replace(/[^+\d]/g, "")}`}>
                  <Phone size={14} /> {s.phone}
                </a>
              )}
              {s.hours && (
                <span>
                  <Clock size={14} /> {s.hours}
                </span>
              )}
              {s.spoken?.length > 0 && (
                <span>
                  <b>{t.langs}</b> {s.spoken.join(", ")}
                </span>
              )}
            </Reveal>
            {s.links?.length > 0 && (
              <div className="chips">
                {s.links.map((l) => (
                  <a
                    key={l.url}
                    href={l.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="chip-btn"
                  >
                    {l.label} <ExternalLink size={13} />
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
      {s.bio ||
      s.education ||
      s.experience ||
      s.publications ||
      s.subjects?.length ||
      s.interests?.length ? (
        <section className="section tight">
          <div className="container profile-body">
            {s.bio && (
              <Reveal className="profile-bio">
                {s.bio.split(/\n+/).map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
              </Reveal>
            )}
            {block(t.education, s.education)}
            {block(t.experience, s.experience)}
            {s.subjects && s.subjects.length > 0 && (
              <Reveal className="profile-block">
                <h2 className="h-sm">{t.subjects_taught}</h2>
                <div className="chips">
                  {s.subjects.map((x) => (
                    <span key={x} className="chip">
                      {x}
                    </span>
                  ))}
                </div>
              </Reveal>
            )}
            {block(t.publications, s.publications)}
            {s.interests?.length > 0 && (
              <Reveal className="profile-block">
                <h2 className="h-sm">{t.interests}</h2>
                <div className="chips">
                  {s.interests.map((x) => (
                    <span key={x} className="chip">
                      {x}
                    </span>
                  ))}
                </div>
              </Reveal>
            )}
          </div>
        </section>
      ) : null}
      {d.colleagues.length > 0 && (
        <section className="section tight u-soft">
          <div className="container">
            <SectionHead
              title={t.colleagues}
              link={d.department ? `/structure/${d.department.slug}` : d.faculty ? `/faculties/${d.faculty.slug}` : "/faculties"}
              linkLabel={d.department?.title || d.faculty?.title || t.all}
            />
            <ProfessorCarousel items={d.colleagues} />
          </div>
        </section>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ yangiliklar ro'yxati */
export function NewsListPage() {
  const { t, data } = useSite();
  const [sp, setSp] = useSearchParams();
  const tag = sp.get("tag") || "";
  const page = Number(sp.get("page") || 1);
  const [q, setQ] = useState(sp.get("q") || "");
  const [res, setRes] = useState<{
    items: News[];
    total: number;
    pages: number;
  } | null>(null);
  const query = sp.get("q") || "";
  useEffect(() => {
    let alive = true;
    pub
      .news({ tag, q: query, page })
      .then((r) => alive && setRes(r))
      .catch(() => alive && setRes({ items: [], total: 0, pages: 1 }));
    return () => {
      alive = false;
    };
  }, [tag, page, query]);
  useEffect(() => {
    const h = setTimeout(() => {
      const n = new URLSearchParams(sp);
      if (q) n.set("q", q);
      else n.delete("q");
      n.delete("page");
      if (n.toString() !== sp.toString()) setSp(n, { replace: true });
    }, 350);
    return () => clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);
  const setTag = (x: string) => {
    const n = new URLSearchParams(sp);
    if (x) n.set("tag", x);
    else n.delete("tag");
    n.delete("page");
    setSp(n);
  };
  const tags = data?.tags || [];
  return (
    <>
      <PageHero
        eyebrow={res ? `${res.total} · RSS` : t.nav_news}
        title={t.news_title}
        sub={t.news_sub}
      >
        <Reveal delay={0.4} className="blog-tools">
          <label className="search">
            <Search size={17} />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t.search}
              aria-label={t.search}
            />
          </label>
          {tags.length > 0 && (
            <div className="filter-row">
              <button
                className={`filter ${!tag ? "on" : ""}`}
                onClick={() => setTag("")}
              >
                {t.all}
              </button>
              {tags.map(([x, n]) => (
                <button
                  key={x}
                  className={`filter ${tag === x ? "on" : ""}`}
                  onClick={() => setTag(x)}
                >
                  {x} <sup>{n}</sup>
                </button>
              ))}
            </div>
          )}
        </Reveal>
      </PageHero>
      <section className="section tight">
        <div className="container">
          {/* sarlavhalar tartibi: h1 → h2 (ko'rinmas) → kartalardagi h3 */}
          <h2 className="a11y-sr">{t.news_all}</h2>
          {!res ? (
            <Loading />
          ) : res.items.length === 0 ? (
            <p className="empty">{q || tag ? t.no_results : t.no_items}</p>
          ) : (
            <div className="post-grid">
              {res.items.map((p, i) => (
                <NewsCard
                  key={p.id}
                  p={p}
                  index={i}
                  featured={i === 0 && page === 1 && !q && !tag}
                />
              ))}
            </div>
          )}
          {res && res.pages > 1 && (
            <nav className="pager">
              {Array.from({ length: res.pages }).map((_, i) => (
                <button
                  key={i}
                  className={page === i + 1 ? "on" : ""}
                  onClick={() =>
                    setSp((prev) => {
                      const n = new URLSearchParams(prev);
                      n.set("page", String(i + 1));
                      return n;
                    })
                  }
                >
                  {i + 1}
                </button>
              ))}
            </nav>
          )}
        </div>
      </section>
    </>
  );
}

/* ------------------------------------------------------------------ e'lonlar */
export function AnnouncementsPage() {
  const { t } = useSite();
  const [cat, setCat] = useState("");
  const [page, setPage] = useState(1);
  const [res, setRes] = useState<{
    items: Announce[];
    total: number;
    pages: number;
  } | null>(null);
  useEffect(() => {
    pub
      .announcements({ category: cat, page })
      .then(setRes)
      .catch(() => setRes({ items: [], total: 0, pages: 1 }));
  }, [cat, page]);
  const cats = Object.keys(t.ann_cats);
  return (
    <>
      <PageHero
        eyebrow={res ? String(res.total) : ""}
        title={t.announcements_title}
      >
        <Reveal delay={0.4} className="filter-row">
          <button
            className={`filter ${!cat ? "on" : ""}`}
            onClick={() => {
              setCat("");
              setPage(1);
            }}
          >
            {t.all}
          </button>
          {cats.map((c) => (
            <button
              key={c}
              className={`filter ${cat === c ? "on" : ""}`}
              onClick={() => {
                setCat(cat === c ? "" : c);
                setPage(1);
              }}
            >
              {t.ann_cats[c]}
            </button>
          ))}
        </Reveal>
      </PageHero>
      <section className="section tight">
        <div className="container">
          {/* sarlavhalar tartibi: h1 → h2 (ko'rinmas) → kartalardagi h3 */}
          <h2 className="a11y-sr">{t.announcements_all}</h2>
          {!res ? (
            <Loading />
          ) : res.items.length === 0 ? (
            <p className="empty">{t.no_items}</p>
          ) : (
            <ul className="ann-list">
              {res.items.map((a, i) => (
                <AnnounceRow key={a.id} a={a} index={i} />
              ))}
            </ul>
          )}
          {res && res.pages > 1 && (
            <nav className="pager">
              {Array.from({ length: res.pages }).map((_, i) => (
                <button
                  key={i}
                  className={page === i + 1 ? "on" : ""}
                  onClick={() => setPage(i + 1)}
                >
                  {i + 1}
                </button>
              ))}
            </nav>
          )}
        </div>
      </section>
    </>
  );
}

/* ------------------------------------------------------------------ tadbirlar */
export function EventsPage() {
  const { t } = useSite();
  const d = useFetch(() => pub.events());
  const items: Event[] = d && d !== "404" ? d.items : [];
  const now = d && d !== "404" ? d.now : "";
  const upcoming = items.filter((e) => (e.ends || e.starts || "") >= now);
  const past = items.filter((e) => (e.ends || e.starts || "") < now).reverse();
  return (
    <>
      <PageHero
        eyebrow={t.nav_news}
        title={t.events_title}
        sub={t.events_sub}
      />
      <section className="section tight">
        <div className="container">
          {!d ? (
            <Loading />
          ) : (
            <>
              <Reveal className="pub-year-head">
                <span className="sm">{t.upcoming}</span>
                <i>{upcoming.length}</i>
              </Reveal>
              {upcoming.length === 0 ? (
                <p className="empty">{t.no_items}</p>
              ) : (
                <div className="event-grid">
                  {upcoming.map((e, i) => (
                    <EventCard key={e.id} e={e} index={i} />
                  ))}
                </div>
              )}
              {past.length > 0 && (
                <>
                  <Reveal className="pub-year-head" style={{ marginTop: 60 }}>
                    <span className="sm">{t.past}</span>
                    <i>{past.length}</i>
                  </Reveal>
                  <div className="event-grid">
                    {past.map((e, i) => (
                      <EventCard key={e.id} e={e} index={i} />
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </section>
    </>
  );
}

/* ------------------------------------------------------------------ qabul */
export function AdmissionPage() {
  const { t, data } = useSite();
  const d = useFetch(() => pub.pages("admission"));
  const a = useFetch(() => pub.announcements({ category: "admission" }));
  const pr = useFetch(() => pub.programs());
  if (!data) return null;
  const pages: Page[] = d && d !== "404" ? d.items : [];
  const anns = a && a !== "404" ? a.items : [];
  const u = data.uni;
  return (
    <>
      <PageHero
        eyebrow={t.nav_admission}
        title={t.admission_title}
        sub={data.site.admission_text}
      >
        <Reveal delay={0.4} className="project-links">
          {u.admission_url && (
            <Magnetic>
              <a
                className="btn btn-primary"
                href={u.admission_url}
                target="_blank"
                rel="noopener noreferrer"
                data-cursor=""
              >
                {t.admission_cta} <ArrowUpRight size={16} />
              </a>
            </Magnetic>
          )}
          <Magnetic>
            <Link className="btn btn-ghost" to="/programs" data-cursor="">
              {t.programs_all}
            </Link>
          </Magnetic>
        </Reveal>
      </PageHero>
      <section className="section tight">
        <div className="container">
          {pages.length > 0 && (
            <ul className="interest-list pages-list">
              {pages.map((p, i) => (
                <Reveal
                  as="li"
                  key={p.id}
                  delay={i * 0.04}
                  className="interest"
                >
                  <span className="interest-idx">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <Link to={`/pages/${p.slug}`} className="interest-text sm">
                    {p.title}
                    {p.excerpt && (
                      <small className="interest-sub">{p.excerpt}</small>
                    )}
                  </Link>
                  <ArrowUpRight className="interest-arrow" size={28} />
                </Reveal>
              ))}
            </ul>
          )}
          <Suspense fallback={null}>
            <AdmissionBlock />
          </Suspense>
          {pr && pr !== "404" && <TuitionTable items={pr.items} faculties={pr.faculties} />}
          {anns.length > 0 && (
            <div style={{ marginTop: 60 }}>
              <SectionHead
                title={t.announcements_title}
                link="/announcements"
                linkLabel={t.announcements_all}
              />
              <ul className="ann-list">
                {anns.slice(0, 5).map((x, i) => (
                  <AnnounceRow key={x.id} a={x} index={i} />
                ))}
              </ul>
            </div>
          )}
          <Reveal className="contact-side" style={{ marginTop: 60 }}>
            <h2 className="h-sm">{t.nav_contact}</h2>
            <ContactLines />
          </Reveal>
        </div>
      </section>
    </>
  );
}

/* ------------------------------------------------------------------ talabalar uchun */
export function StudentsPage() {
  const { t, data } = useSite();
  const d = useFetch(() => pub.pages("students"));
  if (!data) return null;
  const pages: Page[] = d && d !== "404" ? d.items : [];
  return (
    <>
      <PageHero
        eyebrow={t.nav_programs}
        title={t.nav_students}
        sub={data.site.portal_text}
      >
        <Reveal delay={0.4} className="project-links">
          {data.site.portal_enabled && (
            <Magnetic>
              <Link className="btn btn-primary" to="/login" data-cursor="">
                {t.portal_cta} <ArrowUpRight size={16} />
              </Link>
            </Magnetic>
          )}
          <Magnetic>
            <Link className="btn btn-ghost" to="/login" data-cursor="">
              {t.nav_schedule}
            </Link>
          </Magnetic>
          {data.uni.hemis_url && (
            <Magnetic>
              <a
                className="btn btn-ghost"
                href={data.uni.hemis_url}
                target="_blank"
                rel="noopener noreferrer"
                data-cursor=""
              >
                HEMIS <ExternalLink size={14} />
              </a>
            </Magnetic>
          )}
        </Reveal>
      </PageHero>
      <section className="section tight">
        <div className="container">
          {pages.length === 0 ? (
            <p className="empty">{t.no_items}</p>
          ) : (
            <ul className="interest-list pages-list">
              {pages.map((p, i) => (
                <Reveal
                  as="li"
                  key={p.id}
                  delay={i * 0.04}
                  className="interest"
                >
                  <span className="interest-idx">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <Link to={`/pages/${p.slug}`} className="interest-text sm">
                    {p.title}
                    {p.excerpt && (
                      <small className="interest-sub">{p.excerpt}</small>
                    )}
                  </Link>
                  <ArrowUpRight className="interest-arrow" size={28} />
                </Reveal>
              ))}
            </ul>
          )}
        </div>
      </section>
    </>
  );
}

/* ------------------------------------------------------------------ hujjatlar, hamkorlar */
export function DocumentsPage() {
  const { t } = useSite();
  const d = useFetch(() => pub.documents());
  const items: Document[] = d && d !== "404" ? d.items : [];
  const groups = useMemo(() => {
    const m = new Map<string, Document[]>();
    items.forEach((x) => m.set(x.category, [...(m.get(x.category) || []), x]));
    return [...m.entries()];
  }, [items]);
  return (
    <>
      <PageHero eyebrow={t.nav_about} title={t.nav_documents} />
      <section className="section tight">
        <div className="container">
          {!d ? (
            <Loading />
          ) : (
            groups.map(([cat, list]) => (
              <div key={cat} className="pub-year-group">
                <Reveal className="pub-year-head">
                  <span className="sm">{t.doc_cats[cat] || cat}</span>
                  <i>{list.length}</i>
                </Reveal>
                <ol className="pub-list">
                  {list.map((x, i) => (
                    <DocumentRow key={x.id} d={x} index={i} />
                  ))}
                </ol>
              </div>
            ))
          )}
        </div>
      </section>
    </>
  );
}

export function PartnersPage() {
  const { t } = useSite();
  const d = useFetch(() => pub.partners());
  const items: Partner[] = d && d !== "404" ? d.items : [];
  return (
    <>
      <PageHero
        eyebrow={t.nav_about}
        title={t.partners_title}
        sub={t.partners_sub}
      />
      <section className="section tight">
        <div className="container">
          {!d ? (
            <Loading />
          ) : (
            <div className="partner-grid large">
              {items.map((p, i) => (
                <PartnerLogo key={p.id} p={p} index={i} />
              ))}
            </div>
          )}
          <div className="partner-notes">
            {items
              .filter((p) => p.summary)
              .map((p, i) => (
                <Reveal key={p.id} delay={i * 0.04} className="partner-note">
                  <b>{p.title}</b>
                  <span>{p.summary}</span>
                </Reveal>
              ))}
          </div>
        </div>
      </section>
    </>
  );
}

/* ------------------------------------------------------------------ ochiq dars jadvali */
export function SchedulePage() {
  // dars jadvali faqat tizimga kirganlarga: kabinetga yo'naltiriladi
  return <Navigate to="/login?next=schedule" replace />;
}

/* ------------------------------------------------------------------ foydali havolalar */
export function LinksPage() {
  const { t } = useSite();
  const d = useFetch(() => pub.links());
  const items = d && d !== "404" ? d.items : [];
  return (
    <>
      <PageHero eyebrow={t.nav_about} title={t.links_title} sub={t.links_sub} />
      <section className="section tight">
        <div className="container">
          {!d ? (
            <Loading />
          ) : items.length ? (
            <LinksGrid items={items} />
          ) : (
            <p className="empty">{t.no_items}</p>
          )}
        </div>
      </section>
    </>
  );
}

export function ContactPage() {
  const { t, data } = useSite();
  const [f, setF] = useState({
    name: "",
    email: "",
    phone: "",
    subject: "",
    message: "",
    hp: "",
  });
  const [state, setState] = useState<"idle" | "busy" | "sent" | "error">(
    "idle",
  );
  const [err, setErr] = useState("");
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setState("busy");
    try {
      await pub.contact(f);
      setState("sent");
    } catch (e2) {
      const d = e2 instanceof ApiError ? e2.detail : "";
      setErr(
        d === "invalid_email"
          ? t.err_invalid_email
          : d === "too_many_attempts"
            ? t.err_too_many
            : t.err_generic,
      );
      setState("error");
    }
  };
  if (!data) return null;
  const u = data.uni;
  return (
    <>
      <PageHero
        eyebrow={t.nav_contact}
        title={t.contact_title}
        sub={t.contact_sub}
      />
      <section className="section tight">
        <div className="container contact-grid">
          <Reveal className="contact-side">
            {u.email && (
              <a
                className="email-link"
                href={`mailto:${u.email}`}
                data-cursor=""
              >
                {u.email}
              </a>
            )}
            <ContactLines />
            <Socials email={false} />
            {u.map_url && (
              <a
                className="chip-btn"
                href={u.map_url}
                target="_blank"
                rel="noopener noreferrer"
              >
                <MapPin size={13} /> {t.address} <ExternalLink size={12} />
              </a>
            )}
          </Reveal>
          <Reveal delay={0.1}>
            {state === "sent" ? (
              <div className="sent-box" role="status">
                <span aria-hidden>✦</span>
                <p>{t.sent}</p>
              </div>
            ) : (
              <form className="contact-form" id="contact-form" onSubmit={submit} aria-describedby={state === "error" ? "contact-err" : undefined}>
                <div className="field-row">
                  <label className="field">
                    <input
                      required
                      value={f.name}
                      onChange={(e) => setF({ ...f, name: e.target.value })}
                      placeholder=" "
                      autoComplete="name"
                      maxLength={120}
                    />
                    <span>{t.f_name}
                      <i className="req" aria-hidden> *</i>
                    </span>
                  </label>
                  <label className="field">
                    <input
                      required
                      type="email"
                      value={f.email}
                      onChange={(e) => setF({ ...f, email: e.target.value })}
                      placeholder=" "
                      autoComplete="email"
                      maxLength={160}
                    />
                    <span>{t.f_email}
                      <i className="req" aria-hidden> *</i>
                    </span>
                  </label>
                </div>
                <div className="field-row">
                  <label className="field">
                    <input
                      value={f.phone}
                      onChange={(e) => setF({ ...f, phone: e.target.value })}
                      placeholder=" "
                      type="tel"
                      autoComplete="tel"
                      maxLength={40}
                    />
                    <span>{t.f_phone}</span>
                  </label>
                  <label className="field">
                    <input
                      value={f.subject}
                      onChange={(e) => setF({ ...f, subject: e.target.value })}
                      placeholder=" "
                      maxLength={200}
                    />
                    <span>{t.f_subject}</span>
                  </label>
                </div>
                <label className="field">
                  <textarea
                    required
                    rows={6}
                    value={f.message}
                    onChange={(e) => setF({ ...f, message: e.target.value })}
                    placeholder=" "
                    maxLength={5000}
                  />
                  <span>{t.f_message}
                    <i className="req" aria-hidden> *</i>
                  </span>
                </label>
                <input
                  className="hp"
                  tabIndex={-1}
                  autoComplete="off"
                  value={f.hp}
                  onChange={(e) => setF({ ...f, hp: e.target.value })}
                  aria-hidden
                />
                {state === "error" && (
                  <p className="form-error" id="contact-err" role="alert">
                    {err}
                  </p>
                )}
                <Consent />
                <Magnetic>
                  <button
                    className="btn btn-primary"
                    disabled={state === "busy"}
                    data-cursor=""
                  >
                    {state === "busy" ? t.sending : t.send} <Send size={16} />
                  </button>
                </Magnetic>
              </form>
            )}
          </Reveal>
        </div>
      </section>
      <FaqSection />
    </>
  );
}

/* ------------------------------------------------------------------ obuna holatlari (sayt dizayni: oq fon, chiziqlar, 2px) */
export function SubscribeStatePage({ ok }: { ok: boolean }) {
  const { t } = useSite();
  return (
    <section className="stp wrap">
      <Reveal className="stp-t">
        <p className="ey">{t.newsletter_label}</p>
        <h1 className="stp-h">{ok ? t.subscribe_confirmed_title : t.subscribe_invalid_title}</h1>
        <p className="stp-lead">{ok ? t.subscribe_confirmed_text : t.subscribe_invalid_text}</p>
        <div className="stp-acts">
          <Link to="/news" className="stp-btn">
            {t.news_all} <ArrowUpRight size={18} aria-hidden />
          </Link>
          <Link to="/" className="stp-btn ghost">
            <ArrowLeft size={18} aria-hidden /> {t.back_home}
          </Link>
        </div>
      </Reveal>
      {!ok && (
        <Reveal className="stp-box" delay={0.1}>
          <SiteSubscribe source="retry" light />
        </Reveal>
      )}
    </section>
  );
}

export function UnsubscribePage() {
  const { t } = useSite();
  const [sp] = useSearchParams();
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [email, setEmail] = useState("");
  const token = sp.get("token") || "";
  const bad = !token || state === "error";
  return (
    <section className="stp wrap">
      <Reveal className="stp-t">
        <p className="ey">{t.newsletter_label}</p>
        <h1 className="stp-h">{state === "done" ? t.unsub_done : t.unsub_title}</h1>
        {state === "done" ? (
          email && (
            <p className="stp-lead">
              <b>{email}</b>
            </p>
          )
        ) : bad ? (
          <p className="stp-lead">{t.unsub_bad}</p>
        ) : (
          <p className="stp-lead">{t.unsub_text}</p>
        )}
        <div className="stp-acts">
          {state !== "done" && !bad && (
            <button
              type="button"
              className="stp-btn"
              disabled={state === "busy"}
              onClick={async () => {
                setState("busy");
                try {
                  const r = await pub.unsubscribe(token);
                  setEmail(r.email);
                  setState("done");
                } catch {
                  setState("error");
                }
              }}
            >
              {t.unsub_confirm}
            </button>
          )}
          <Link to="/" className="stp-btn ghost">
            <ArrowLeft size={18} aria-hidden /> {t.back_home}
          </Link>
        </div>
      </Reveal>
      {(state === "done" || bad) && (
        <Reveal className="stp-box" delay={0.1}>
          <SiteSubscribe source="resubscribe" light />
        </Reveal>
      )}
    </section>
  );
}

/* murojaatchi sahifasi (havola — xat yoki chatda): holat, holat tarixi (izoh bilan), hal qilingan murojaatni 1–5 baholash */
export function RequestPage() {
  const { t, lang } = useSite();
  const { token = "" } = useParams();
  const [sp] = useSearchParams();
  const [r, setR] = useState<PublicRequest | null | "404">(null);
  const [stars, setStars] = useState(() => Math.min(5, Math.max(0, Number(sp.get("rate")) || 0)));
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  useEffect(() => {
    pub
      .request(token)
      .then(setR)
      .catch(() => setR("404"));
  }, [token, lang]);
  if (r === null) return <Loading />;
  if (r === "404")
    return (
      <section className="state-page">
        <div className="container narrow">
          <h1 className="page-title sm">{t.rq_not_found}</h1>
          <p className="page-sub">{t.rq_not_found_text}</p>
          <Link to="/" className="link-arrow">
            <ArrowLeft size={18} /> {t.back_home}
          </Link>
        </div>
      </section>
    );
  const shown = hover || stars;
  return (
    <section className="stp wrap rq">
      <div className="stp-t">
        <p className="ey">
          {t.rq_label} {r.label}
        </p>
        <h1 className="stp-h rq-h">{r.title}</h1>
        <p className="rq-now">
          <span className={`rq-dot st-${r.stage}`} /> {r.stages[r.stage] || r.stage}
        </p>
        <h2 className="rq-sub">{t.rq_history}</h2>
        <ol className="rq-hist">
          {[...r.history].reverse().map((h, i) => (
            <li key={i}>
              <time>{fmtDateTime(h.at, lang)}</time>
              <b>{r.stages[h.stage] || h.stage}</b>
              {h.comment && <p>{h.comment}</p>}
            </li>
          ))}
        </ol>
      </div>
      {(r.can_rate || r.rating) && (
        <div className="stp-box rq-rate">
          {r.rating ? (
            <>
              <h2 className="rq-sub">{done ? t.rq_thanks : t.rq_your_rating}</h2>
              <div className="rq-stars" aria-label={`${r.rating}/5`}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <Star key={n} size={28} className={n <= (r.rating || 0) ? "on" : ""} />
                ))}
              </div>
              {r.rating_comment && <p className="rq-q">{r.rating_comment}</p>}
            </>
          ) : (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!stars) return;
                setBusy(true);
                try {
                  setR(await pub.rateRequest(token, stars, comment));
                  setDone(true);
                } catch {
                  setR(await pub.request(token).catch(() => "404" as const));
                }
                setBusy(false);
              }}
            >
              <h2 className="rq-sub">{t.rq_rate_title}</h2>
              <div className="rq-stars pick" role="radiogroup" onMouseLeave={() => setHover(0)}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    role="radio"
                    aria-checked={stars === n}
                    aria-label={`${n}/5`}
                    onMouseEnter={() => setHover(n)}
                    onClick={() => setStars(n)}
                  >
                    <Star size={30} className={n <= shown ? "on" : ""} />
                  </button>
                ))}
              </div>
              <label className="field">
                <textarea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} placeholder=" " maxLength={2000} />
                <span>{t.rq_comment}</span>
              </label>
              <button className="stp-btn" disabled={!stars || busy}>
                {t.rq_rate_send}
              </button>
            </form>
          )}
        </div>
      )}
    </section>
  );
}

export function NotFound() {
  const { t } = useSite();
  return (
    <section className="state-page">
      <div className="container narrow">
        <div className="big-404" aria-hidden>
          404
        </div>
        <h1 className="page-title sm">{t.not_found}</h1>
        <p className="page-sub">{t.not_found_text}</p>
        <Link to="/" className="link-arrow">
          <ArrowLeft size={18} /> {t.back_home}
        </Link>
      </div>
    </section>
  );
}
