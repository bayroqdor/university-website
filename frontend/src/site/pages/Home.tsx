/* Bosh sahifa: hero, raqamlar, ta'lim, barqaror rivojlanish, yangiliklar, e'lonlar, kampus, o'qituvchilar, foydali havolalar. */
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { pub, type HomeData, type Program } from "../../lib/api";
import { fmtDate } from "../../lib/i18n";
import { useSite } from "../../lib/site";
import { A, Head, Photo, plain, Reveal, withAdmissionYear } from "../chrome/ui";
import { Pause, Play } from "lucide-react";
import { useA11yT } from "../../a11y/i18n";

const EMPTY: HomeData = {
  programs: [], faculties: [], news: [], announcements: [], events: [], partners: [], staff: [], professors: [], links: [],
  counts: { staff: 0, professors: 0, departments: 0 },
  rector: { rector_name: "", rector_title: "", rector_photo: "", rector_speech_html: "" },
};

/** «Iqtisodiyot (magistratura)» → «Iqtisodiyot»: ustun sarlavhasi darajani allaqachon aytadi */
const short = (title: string) => title.replace(/\s*\([^)]*\)\s*$/, "");

const img = (key: string, imgs?: Record<string, string | undefined>) => (imgs || {})[key] || "";

/* ------------------------------------------------------------------ 3. hero */
const SLIDE_MS = 3000; // surat turib turadigan vaqt
const SLIDE_ANIM_MS = 1400; // yonga surilish davomiyligi (theme.css dagi hx-slide-* bilan bir xil)

/** Bosh ekran suratlari almashinuvi: yangi surat yondan surilib kiradi, eskisi narigi tomonga chiqadi; birinchi surat darhol, keyingisi oldindan yuklanadi.
 *  Varaq yashirin, bo'lim ekrandan tashqarida yoki sichqoncha ustida bo'lsa — to'xtaydi. Harakat o'chiq bo'lsa — faqat birinchi surat. */
function HeroSlides({ srcs, alt }: { srcs: string[]; alt: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [cur, setCur] = useState(0);
  const [prev, setPrev] = useState(-1);
  const [back, setBack] = useState(false); // orqaga (chapdan) surilsinmi
  const movedAt = useRef(0); // surilish boshlangan vaqt: surilish tugamaguncha yangisi boshlanmaydi (surat sakrab ketmasin)
  const [armed, setArmed] = useState(1); // nechta suratga src berilgan (qolganlari hali yuklanmaydi)
  const [ok, setOk] = useState<boolean[]>([]);
  const [paused, setPaused] = useState(false);
  // foydalanuvchi to'xtatgan (WCAG 2.2.2): tugma bosilmaguncha qayta boshlanmaydi
  const [stopped, setStopped] = useState(false);
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(false);
  const at = useA11yT();
  const n = srcs.length;
  const next = (cur + 1) % n;

  // birinchi surat yuklangach — keyingisi (brauzer bo'sh paytida) yuklanadi
  useEffect(() => {
    if (!ok[0] || armed > 1) return;
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
    const go = () => setArmed((a) => Math.max(a, 2));
    if (w.requestIdleCallback) w.requestIdleCallback(go, { timeout: 2000 });
    else setTimeout(go, 800);
  }, [ok, armed]);

  useEffect(() => {
    const vis = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", vis);
    const el = ref.current;
    const io =
      el && typeof IntersectionObserver !== "undefined"
        ? new IntersectionObserver(([e]) => setHidden(document.hidden || !e.isIntersecting))
        : null;
    if (el) io?.observe(el);
    return () => {
      document.removeEventListener("visibilitychange", vis);
      io?.disconnect();
    };
  }, []);

  const show = (i: number) => {
    if (i === cur || Date.now() - movedAt.current < SLIDE_ANIM_MS) return;
    movedAt.current = Date.now();
    setBack(i < cur && !(cur === n - 1 && i === 0));
    setPrev(cur);
    setCur(i);
    setArmed((a) => Math.max(a, Math.min(n, i + 2)));
  };

  // keyingi surat tayyor bo'lsagina almashadi (yarim yuklangan surat chiqmasin)
  const nextReady = !!ok[next];
  useEffect(() => {
    if (paused || stopped || focused || hidden || !nextReady) return;
    const id = window.setTimeout(() => show(next), prev < 0 ? SLIDE_MS : SLIDE_MS + SLIDE_ANIM_MS);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cur, next, paused, stopped, focused, hidden, nextReady]);

  return (
    <div
      className="hx-media"
      ref={ref}
      onPointerEnter={(e) => e.pointerType === "mouse" && setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocus={() => setFocused(true)}
      onBlur={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setFocused(false)}
    >
      <span className={`ph hx-slides${prev < 0 ? "" : back ? " moving back" : " moving"}`}>
        {srcs.map((src, i) => (
          <img
            key={src + i}
            src={i < armed || i === cur ? src : undefined}
            alt={i === 0 ? alt : ""}
            aria-hidden={i === cur ? undefined : true}
            width={1400}
            height={1050}
            loading={i === 0 ? "eager" : "lazy"}
            decoding={i === 0 ? "auto" : "async"}
            className={i === cur ? "on" : i === prev ? "was" : undefined}
            onLoad={() => setOk((o) => (o[i] ? o : Object.assign([...o], { [i]: true })))}
          />
        ))}
      </span>
      <div className="hx-dots" role="group" aria-label={`${at.slide}: ${cur + 1} / ${n}`}>
        <button type="button" className="hx-pause" onClick={() => setStopped(!stopped)} aria-label={stopped ? at.play_slides : at.pause_slides} title={stopped ? at.play_slides : at.pause_slides}>
          {stopped ? <Play size={16} aria-hidden /> : <Pause size={16} aria-hidden />}
        </button>
        {srcs.map((_, i) => (
          <button
            key={i}
            type="button"
            aria-label={`${at.slide} ${i + 1} / ${n}`}
            aria-current={i === cur ? "true" : undefined}
            onClick={() => show(i)}
          />
        ))}
      </div>
    </div>
  );
}

function Hero() {
  const { data, t, motionOn } = useSite();
  if (!data) return null;
  const h = data.site.hero;
  const imgs = data.site.home_images;
  const slides = [img("hero", imgs), ...(data.site.hero_images || [])].filter((u, i, a) => u && a.indexOf(u) === i);
  const photo = slides[0] || "";
  const video = h.cta_secondary_url;
  return (
    <section className="hx" aria-labelledby="hero-title">
      <div className="wrap hx-grid">
        <Reveal className="hx-copy">
          <p className="ey">{h.eyebrow}</p>
          <h1 className="display" id="hero-title">
            {h.heading || t.hero_default_heading}
          </h1>
          {h.subheading && <p className="hx-lead">{h.subheading}</p>}
          <div className="hx-actions">
            <A to={h.cta_primary_url || "/admission"} className="bt bt-blue">
              {withAdmissionYear(h.cta_primary || t.h_admission_btn, data?.site.admission_year)}
            </A>
            {video && (
              <A to={video} className="tlink hx-video">
                {h.cta_secondary || t.h_video} <span aria-hidden>▸</span>
              </A>
            )}
          </div>
        </Reveal>
        {photo && motionOn && slides.length > 1 ? (
          <HeroSlides srcs={slides} alt={data.uni.name} />
        ) : (
          photo && (
            <div className="hx-media">
              <Photo src={photo} alt={data.uni.name} w={1400} h={1050} eager />
            </div>
          )
        )}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ 4. raqamlar */
/** Raqam ko'ringanda 0 dan qiymatgacha tez sanab chiqadi. Matn ko'rinishi (bo'shliq bilan ajratish) saqlanadi;
 *  raqam bo'lmagan qiymat (masalan «TOP-10») o'zgarishsiz chiqadi. Harakat o'chirilgan bo'lsa — darhol yakuniy qiymat. */
function CountNum({ value }: { value: string }) {
  const { motionOn } = useSite();
  const ref = useRef<HTMLSpanElement>(null);
  const m = /^(\D*)([\d\s\u00a0.,]*\d)(\D*)$/.exec(value.trim());
  const target = m ? Number(m[2].replace(/[^\d]/g, "")) : NaN;
  const sep = m && /\d[\s\u00a0]\d/.test(m[2]) ? "\u00a0" : m && /\d,\d{3}/.test(m[2]) ? "," : "";
  const fmt = (n: number) => (m ? m[1] + (sep ? String(n).replace(/\B(?=(\d{3})+(?!\d))/g, sep) : String(n)) + m[3] : value);
  const [shown, setShown] = useState(() => (motionOn && Number.isFinite(target) ? fmt(0) : value.replace(/ /g, "\u00a0")));
  useEffect(() => {
    const el = ref.current;
    if (!el || !motionOn || !Number.isFinite(target) || typeof IntersectionObserver === "undefined") {
      setShown(Number.isFinite(target) ? fmt(target) : value);
      return;
    }
    let raf = 0;
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        io.disconnect();
        const t0 = performance.now();
        const dur = 1600;
        const step = (now: number) => {
          const k = Math.min(1, (now - t0) / dur);
          const eased = 1 - Math.pow(1 - k, 4);
          setShown(fmt(Math.round(target * eased)));
          if (k < 1) raf = requestAnimationFrame(step);
        };
        raf = requestAnimationFrame(step);
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, motionOn]);
  return (
    <span ref={ref} aria-label={value}>
      {shown}
    </span>
  );
}

function Numbers() {
  const { data, t } = useSite();
  const stats = (data?.uni.stats || []).slice(0, 4);
  if (!stats.length) return null;
  return (
    <section className="nums" aria-label={t.h_numbers}>
      <div className="wrap">
        <Reveal as="dl" className="nums-row">
          {stats.map((s, i) => (
            <div key={i} className="num">
              <dt className="num-label">{s.label}</dt>
              <dd className={`num-val tnum ${s.value ? "" : "num-ph"}`}>
                {s.value ? (
                  <>
                    <CountNum value={s.value} />
                    {s.suffix && <span className="num-suf">{s.suffix}</span>}
                  </>
                ) : (
                  t.h_ph
                )}
              </dd>
            </div>
          ))}
        </Reveal>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ 5. ta'lim */
const DEGREES: { key: string; degrees: string[]; page: string }[] = [
  { key: "bachelor", degrees: ["bachelor"], page: "/programs" },
  { key: "master", degrees: ["master", "joint"], page: "/programs" },
  { key: "phd", degrees: ["phd"], page: "/programs" },
];

function Education({ home }: { home: HomeData }) {
  const { t } = useSite();
  const programs = home.programs as Program[];
  const desc: Record<string, string> = { bachelor: t.h_deg_bachelor, master: t.h_deg_master, phd: t.h_deg_phd };
  return (
    <section className="sec sec-b" aria-labelledby="edu-title">
      <div className="wrap">
        <Head id="edu-title" eyebrow={t.h_edu_eyebrow} title={t.h_edu_title} lead={t.h_edu_lead} more={{ to: "/programs", label: t.programs_all }} />
        <Reveal className="edu">
          {DEGREES.map((d) => {
            const list = programs.filter((p) => d.degrees.includes(p.degree));
            return (
              <article key={d.key} className="edu-col">
                <h3 className="h3">
                  <Link to={d.page} className="h3-link">
                    {t.degrees[d.key] || d.key}
                  </Link>
                </h3>
                <p className="edu-desc">{desc[d.key]}</p>
                {list.length > 0 && (
                  <ul className="edu-list">
                    {list.slice(0, 6).map((p) => (
                      <li key={p.id}>
                        <Link to={`/programs/${p.slug}`} className="edu-prog">
                          <span>{short(p.title)}</span>
                        </Link>
                      </li>
                    ))}
                    {list.length > 6 && (
                      <li>
                        <Link to="/programs" className="edu-prog edu-more">
                          <span>
                            {t.h_more_programs.replace("{n}", String(list.length - 6))} <span aria-hidden>→</span>
                          </span>
                        </Link>
                      </li>
                    )}
                  </ul>
                )}
              </article>
            );
          })}
        </Reveal>
        {home.faculties.length > 0 && (
          <Reveal className="kaf">
            <p className="ey kaf-h">{t.h_kafedras}</p>
            <ol className="kaf-list">
              {home.faculties.map((f) => (
                <li key={f.id}>
                  <Link to={`/faculties/${f.slug}`} className="kaf-link">
                    <span className="kaf-name">{f.title}</span>
                    {f.summary && <span className="kaf-sum">{plain(f.summary)}</span>}
                  </Link>
                </li>
              ))}
            </ol>
          </Reveal>
        )}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ 6. yashil universitet */
function Green() {
  const { data, t } = useSite();
  const sdg = t.h_sdg_list.split(";").map((x) => x.split("|") as [string, string]);
  const greenImg = img("green", data?.site.home_images);
  return (
    <section className="sec sec-a" aria-labelledby="green-title">
      <div className="wrap green">
        {greenImg && (
          <div className="green-media">
            <Photo src={greenImg} alt={t.h_green_eyebrow} w={1400} h={1000} />
          </div>
        )}
        <Reveal className="green-copy">
          <p className="ey">{t.h_green_eyebrow}</p>
          <h2 className="h2" id="green-title">
            {t.h_green_title}
          </h2>
          <p className="body">{t.h_green_text}</p>
          <div className="green-links">
            <Link to="/upgoals" className="tlink">
              {t.h_green_sdg} <span aria-hidden>→</span>
            </Link>
          </div>
          <ol className="sdg" aria-label={t.h_green_sdg}>
            {sdg.map(([n, name]) => (
              <li key={n}>
                <Link to={`/upgoals/${n}`}>
                  <span className="sdg-n tnum">{n}</span>
                  <span>{name}</span>
                </Link>
              </li>
            ))}
          </ol>
        </Reveal>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ 8. yangiliklar */
function NewsBlock({ home }: { home: HomeData }) {
  const { t, lang } = useSite();
  const [first, ...rest] = home.news;
  if (!first) return null;
  return (
    <section className="sec sec-b" aria-labelledby="news-title">
      <div className="wrap">
        <Head id="news-title" eyebrow={t.h_news_eyebrow} title={t.h_news} more={{ to: "/news", label: t.h_news_all }} />
        <Reveal className="news">
          <Link to={`/news/${first.slug}`} className="nw nw-lead">
            <Photo src={first.feature_image} alt={first.feature_alt || first.title} w={1200} h={750} className="zoom" />
            <time className="meta tnum" dateTime={first.published_at || undefined}>
              {fmtDate(first.published_at, lang)}
            </time>
            <h3 className="nw-title-lg">{first.title}</h3>
            {first.excerpt && <p className="nw-ex">{plain(first.excerpt)}</p>}
          </Link>
          <div className="news-side">
            {rest.slice(0, 3).map((n) => (
              <Link key={n.id} to={`/news/${n.slug}`} className="nw nw-sm">
                <Photo src={n.feature_image} alt={n.feature_alt || n.title} w={1200} h={750} className="zoom" />
                <span className="nw-sm-txt">
                  <time className="meta tnum" dateTime={n.published_at || undefined}>
                    {fmtDate(n.published_at, lang)}
                  </time>
                  <span className="nw-title">{n.title}</span>
                </span>
              </Link>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ 9. e'lonlar */
function Announcements({ home }: { home: HomeData }) {
  const { t, lang } = useSite();
  if (!home.announcements.length) return null;
  return (
    <section className="sec sec-a" aria-labelledby="ann-title">
      <div className="wrap">
        <Head id="ann-title" eyebrow={t.h_ann} title={t.h_ann_title} more={{ to: "/announcements", label: t.h_ann_all }} />
        <Reveal as="ul" className="an-list">
          {home.announcements.map((a) => (
            <li key={a.id}>
              <Link to={`/announcements/${a.slug}`} className="an-row">
                <time className="an-date tnum" dateTime={a.published_at || undefined}>
                  {fmtDate(a.published_at, lang)}
                </time>
                <span className="an-title">{plain(a.title)}</span>
                <span className="an-arrow" aria-hidden>
                  →
                </span>
              </Link>
            </li>
          ))}
        </Reveal>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ 10. kampus hayoti */
function Campus() {
  const { data, t } = useSite();
  const imgs = data?.site.home_images;
  const tiles = [
    { k: "auditorium", label: t.h_c_auditorium, to: "/about/institut-haqida", w: 1400, h: 1000 },
    { k: "library", label: t.h_c_library, to: "/about/kutubxona", w: 1000, h: 1250 },
    { k: "dormitory", label: t.h_c_dormitory, to: "/about/yotoqxona", w: 1000, h: 1250 },
    { k: "student_life", label: t.h_c_life, to: "/about/talabalar-hayoti", w: 1400, h: 1000 },
  ]
    .map((x) => ({ ...x, src: img(x.k, imgs) }))
    .filter((x) => x.src); // kampus — surat galereyasi: suratsiz plitka (yolg'iz yozuv) chiqmaydi
  if (!tiles.length) return null;
  return (
    <section className="sec sec-b" aria-labelledby="campus-title">
      <div className="wrap">
        <Head id="campus-title" eyebrow={t.h_campus_eyebrow} title={t.h_campus_title} />
        <Reveal className="campus">
          {tiles.map((x) => (
            <Link key={x.k} to={x.to} className={`cp cp-${x.k}`}>
              <Photo src={x.src} alt={x.label} w={x.w} h={x.h} className="zoom" />
              <span className="cp-cap">{x.label}</span>
            </Link>
          ))}
        </Reveal>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ 11. o'qituvchilar */
function Teachers({ home }: { home: HomeData }) {
  const { t } = useSite();
  const list = (home.professors.length ? home.professors : home.staff).slice(0, 4);
  if (!list.length) return null;
  return (
    <section className="sec sec-a" aria-labelledby="staff-title">
      <div className="wrap">
        <Head id="staff-title" eyebrow={t.h_staff_eyebrow} title={t.h_staff} more={{ to: "/staff", label: t.h_staff_all }} />
        <Reveal as="ul" className="people">
          {list.map((p) => (
            <li key={p.id}>
              <Link to={`/staff/${p.slug}`} className="pp">
                <Photo src={p.photo} alt={p.title} w={800} h={1000} className="zoom" />
                <span className="pp-name">{p.title}</span>
                {p.position && <span className="pp-pos">{p.position}</span>}
                {p.degree && <span className="pp-deg">{p.degree}</span>}
              </Link>
            </li>
          ))}
        </Reveal>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ 12. foydali havolalar */
function UsefulLinks({ home }: { home: HomeData }) {
  const { t } = useSite();
  if (!home.links.length) return null;
  return (
    <section className="sec sec-b sec-tight" aria-labelledby="links-title">
      <div className="wrap links">
        <Reveal className="links-head">
          <h2 className="h3" id="links-title">
            {t.h_links}
          </h2>
        </Reveal>
        <ul className="links-list">
          {home.links.slice(0, 8).map((l) => (
            <li key={l.id}>
              <a href={l.url} target="_blank" rel="noopener noreferrer" className="lk">
                <span className="lk-t">
                  {l.title} <span aria-hidden>↗</span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function HomePage() {
  const { lang, data } = useSite();
  // admin → «Bosh sahifa bloklari»da o'chirilgan bo'limlar ko'rsatilmaydi (tartib — tahririy, o'zgarmas)
  const off = new Set((data?.site.sections || []).filter((x) => !x.enabled).map((x) => x.id));
  const [home, setHome] = useState<HomeData | null>(null);
  useEffect(() => {
    let live = true;
    pub
      .home()
      .then((d) => live && setHome(d))
      .catch(() => live && setHome(EMPTY));
    return () => {
      live = false;
    };
  }, [lang]);
  const h = home || EMPTY;
  return (
    <div className="home">
      {!off.has("hero") && <Hero />}
      {!off.has("stats") && <Numbers />}
      {!off.has("programs") && <Education home={h} />}
      <Green />
      {!off.has("news") && <NewsBlock home={h} />}
      {!off.has("announcements") && <Announcements home={h} />}
      <Campus />
      {!off.has("staff") && <Teachers home={h} />}
      {!off.has("links") && <UsefulLinks home={h} />}
    </div>
  );
}

export default HomePage;
