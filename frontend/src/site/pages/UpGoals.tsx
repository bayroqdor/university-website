// BRM sahifasi: /upgoals — 17 maqsad, institut ustuvorliklari, hujjatlar; /upgoals/:n — maqsad sahifasi.
// Matnlar: ../upgoals/data.ts (3 tilda); institut hissasi, faoliyat va hujjatlar — admin → «BRM (UpGoals)», /api/upgoals.
// Animatsiyalar o'zimizniki: 17 yoyli «orbita» (chizilib chiqadi, sekin aylanadi, yoy ustiga kelinsa maqsad markazda),
// plitkalar rangi pastdan ko'tariladi, raqamlar sanab chiqadi. «Harakatni kamaytirish»da hammasi darhol yakuniy holatda.
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Download,
  FileText,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { req, type Lang } from "../../lib/api";
import { useSite } from "../../lib/site";
import "../../styles/upgoals.css";
import {
  GOALS,
  PRIORITY_DEFAULT,
  T,
  iconSrc,
  pictoSrc,
  unit,
  type Goal,
  type L3,
} from "../upgoals/data";
import { Reveal, useReveal } from "../chrome/ui";

type Item = {
  id: string;
  title: Partial<L3>;
  body: Partial<L3>;
  date: string;
  image: string;
  url: string;
};
type Doc = { id: string; title: Partial<L3>; url: string; goals: number[] };
type Data = {
  intro: Partial<L3>;
  priority?: number[];
  goals: Record<string, { text: Partial<L3>; items: Item[] }>;
  docs: Doc[];
};

const loc = (m: Partial<L3> | undefined, lang: Lang) =>
  (m && (m[lang] || m.uz || m.ru || m.en)) || "";
const END = new Date("2030-12-31T23:59:59");

function useData() {
  const [d, setD] = useState<Data | null>(null);
  useEffect(() => {
    req<Data>("GET", "/api/upgoals")
      .then(setD)
      .catch(() => setD({ intro: {}, goals: {}, docs: [] }));
  }, []);
  return d;
}

/** Raqamni 0 dan sanab chiqadi (matndagi birinchi son: «795 mln», «3,1 mln», «45%»). */
function CountUp({ value, ms = 1400 }: { value: string; ms?: number }) {
  const { motionOn } = useSite();
  const ref = useRef<HTMLSpanElement>(null);
  const m = value.match(/^([^\d]*)(\d[\d\s]*(?:[.,]\d+)?)(.*)$/);
  const [shown, setShown] = useState(motionOn && m ? m[1] + "0" + m[3] : value);
  useEffect(() => {
    const el = ref.current;
    if (!m || !motionOn || !el) {
      setShown(value);
      return;
    }
    const raw = m[2].replace(/\s/g, "");
    const dec = raw.includes(",") ? "," : raw.includes(".") ? "." : "";
    const target = parseFloat(raw.replace(",", "."));
    const digits = dec ? raw.split(dec)[1].length : 0;
    const big = /\s/.test(m[2]);
    let raf = 0;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      const t0 = performance.now();
      const step = (now: number) => {
        const p = Math.min(1, (now - t0) / ms);
        const v = target * (1 - Math.pow(1 - p, 3));
        let s = v.toFixed(digits);
        if (dec === ",") s = s.replace(".", ",");
        if (big) s = Math.round(v).toLocaleString("ru-RU").replace(/ /g, " ");
        setShown(m[1] + s + m[3]);
        if (p < 1) raf = requestAnimationFrame(step);
        else setShown(value);
      };
      raf = requestAnimationFrame(step);
    });
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [value, motionOn]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <span ref={ref} className="tnum">
      {shown}
    </span>
  );
}

/* ------------------------------------------------------------------ orbita: 17 yoy */
function Orbit({ lang, onPick }: { lang: Lang; onPick?: (n: number) => void }) {
  const [hot, setHot] = useState<number | null>(null);
  const R = 200,
    C = 260,
    gap = 2.2;
  const seg = 360 / 17;
  const arc = (i: number, r: number) => {
    const a0 = ((i * seg + gap / 2 - 90) * Math.PI) / 180,
      a1 = (((i + 1) * seg - gap / 2 - 90) * Math.PI) / 180;
    return `M ${C + r * Math.cos(a0)} ${C + r * Math.sin(a0)} A ${r} ${r} 0 0 1 ${C + r * Math.cos(a1)} ${C + r * Math.sin(a1)}`;
  };
  const g = hot ? GOALS[hot - 1] : null;
  const days = Math.max(0, Math.ceil((END.getTime() - Date.now()) / 864e5));
  return (
    <div className="ug-orbit" onMouseLeave={() => setHot(null)}>
      <svg viewBox="0 0 520 520" role="group" aria-label={T[lang].all}>
        <g className="ug-orbit-spin">
          <circle cx={C} cy={C} r={R + 34} className="ug-orbit-guide" />
          {GOALS.map((x, i) => {
            const mid = (((i + 0.5) * seg - 90) * Math.PI) / 180;
            return (
              <g
                key={x.n}
                className={`ug-arc ${hot === x.n ? "hot" : ""}`}
                style={{ "--c": x.color, "--i": i } as CSSProperties}
              >
                <path d={arc(i, R)} pathLength={100} className="ug-arc-p" />
                <path
                  d={arc(i, R)}
                  className="ug-arc-hit"
                  onMouseEnter={() => setHot(x.n)}
                  onFocus={() => setHot(x.n)}
                  onClick={() => onPick?.(x.n)}
                  tabIndex={0}
                  role="link"
                  aria-label={`${x.n}. ${x.title[lang]}`}
                  onKeyDown={(e) => e.key === "Enter" && onPick?.(x.n)}
                />
                <circle
                  cx={C + (R + 34) * Math.cos(mid)}
                  cy={C + (R + 34) * Math.sin(mid)}
                  r={hot === x.n ? 7 : 3.5}
                  className="ug-dot"
                />
              </g>
            );
          })}
        </g>
      </svg>
      <div className="ug-orbit-c" aria-live="polite">
        {g ? (
          <>
            <b className="tnum" style={{ color: g.color }}>
              {g.n}
            </b>
            <span>{g.title[lang]}</span>
          </>
        ) : (
          <>
            <b className="tnum">
              <CountUp
                value={days.toLocaleString("ru-RU").replace(/ /g, " ")}
                ms={1800}
              />
            </b>
            <span>{T[lang].countdown}</span>
          </>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ plitka */
function Tile({
  g,
  lang,
  big = false,
  text,
}: {
  g: Goal;
  lang: Lang;
  big?: boolean;
  text?: string;
}) {
  const ref = useReveal<HTMLAnchorElement>();
  return (
    <Link
      ref={ref}
      to={`/upgoals/${g.n}`}
      className={`ug-tile ${big ? "big" : ""}`}
      style={{ "--c": g.color, "--d": `${(g.n % 6) * 70}ms` } as CSSProperties}
    >
      <span className="ug-tile-fill" aria-hidden />
      <span className="ug-tile-n tnum">{String(g.n).padStart(2, "0")}</span>
      <span className="ug-tile-t">{g.title[lang]}</span>
      {big && text && <span className="ug-tile-x">{text}</span>}
      <span className="ug-picto" aria-hidden>
        <img
          src={pictoSrc(g.n)}
          alt=""
          loading="lazy"
          width={720}
          height={720}
        />
      </span>
      <ArrowUpRight className="ug-tile-go" size={22} aria-hidden />
    </Link>
  );
}

function Docs({
  docs,
  lang,
  goal,
}: {
  docs: Doc[];
  lang: Lang;
  goal?: number;
}) {
  const t = T[lang];
  const list = docs.filter((d) => !goal || d.goals.includes(goal));
  const booklet = [
    {
      title: `${t.booklet} — O‘zbekcha`,
      url: "/upgoals/docs/brm-risola-uz.pdf",
    },
    { title: `${t.booklet} — Русский`, url: "/upgoals/docs/brm-risola-ru.pdf" },
  ];
  const rows = [
    ...list.map((d) => ({ title: loc(d.title, lang), url: d.url })),
    ...(goal ? [] : booklet),
  ];
  if (!rows.length) return null;
  return (
    <ul className="ug-docs">
      {rows.map((r) => (
        <li key={r.url}>
          <a
            href={r.url}
            target={/^https?:/.test(r.url) ? "_blank" : undefined}
            rel="noopener noreferrer"
            download={
              r.url.endsWith(".pdf") && !/^https?:/.test(r.url) ? "" : undefined
            }
          >
            <FileText size={18} aria-hidden />
            <span>{r.title}</span>
            <Download size={16} aria-hidden />
          </a>
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------------ /upgoals */
function Landing() {
  const { lang, motionOn, data } = useSite();
  const brand = data?.uni.abbr || "UNI";
  const t = T[lang];
  const d = useData();
  const prio = (d?.priority?.length ? d.priority : PRIORITY_DEFAULT)
    .map((n) => GOALS[n - 1])
    .filter(Boolean);
  const nav = useNavigate();
  useEffect(() => {
    document.title = t.eyebrow;
  }, [t]);
  return (
    <div className={`ug ${motionOn ? "" : "still"}`}>
      <section className="ug-hero wrap">
        <Reveal className="ug-hero-txt">
          <p className="ey">{t.eyebrow}</p>
          <h1 className="display">{t.title}</h1>
          <p className="ug-lead">{loc(d?.intro, lang) || t.lead}</p>
          <div className="ug-hero-a">
            <a className="ug-btn" href="#all">
              {t.all} <ArrowRight size={18} aria-hidden />
            </a>
            <a
              className="ug-btn ghost"
              href={
                lang === "ru"
                  ? "/upgoals/docs/brm-risola-ru.pdf"
                  : "/upgoals/docs/brm-risola-uz.pdf"
              }
              download
            >
              <Download size={18} aria-hidden /> {t.booklet}
            </a>
          </div>
        </Reveal>
        <Orbit lang={lang} onPick={(n) => nav(`/upgoals/${n}`)} />
      </section>

      <section className="ug-sec ug-prio">
        <div className="wrap">
          <Reveal className="ug-head">
            <p className="ey">{brand}</p>
            <h2 className="h2">{t.priority}</h2>
            <p>{t.priority_lead}</p>
          </Reveal>
          <div className="ug-prio-grid">
            {prio.map((g) => (
              <Tile
                key={g.n}
                g={g}
                lang={lang}
                big
                text={
                  loc(d?.goals[String(g.n)]?.text, lang) ||
                  g.note?.[lang] ||
                  g.short[lang]
                }
              />
            ))}
          </div>
        </div>
      </section>

      <section className="ug-sec" id="all">
        <div className="wrap">
          <Reveal className="ug-head">
            <p className="ey">{t.eyebrow}</p>
            <h2 className="h2">{t.all}</h2>
          </Reveal>
          <div className="ug-grid">
            {GOALS.map((g) => (
              <Tile key={g.n} g={g} lang={lang} />
            ))}
          </div>
          <p className="ug-note">{t.icons_note}</p>
        </div>
      </section>

      <section className="ug-sec ug-band">
        <div className="wrap ug-band-in">
          <Reveal className="ug-head">
            <p className="ey">{t.take}</p>
            <h2 className="h2">{t.docs}</h2>
            <p>{t.take_lead}</p>
          </Reveal>
          <Docs docs={d?.docs || []} lang={lang} />
        </div>
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ /upgoals/:n */
function Detail({ n }: { n: number }) {
  const { lang, data } = useSite();
  const brand = data?.uni.abbr || "UNI";
  const t = T[lang];
  const d = useData();
  const g = GOALS[n - 1];
  const own = d?.goals[String(n)];
  const ours = loc(own?.text, lang) || g.note?.[lang] || "";
  const items = own?.items || [];
  const prev = GOALS[(n + 15) % 17],
    next = GOALS[n % 17];
  const head =
    lang === "uz" ? `${n}-${t.goal.toLowerCase()}` : `${t.goal} ${n}`;
  useEffect(() => {
    document.title = `${head}: ${g.title[lang]} — ${t.eyebrow}`;
    window.scrollTo(0, 0);
  }, [n, lang]); // eslint-disable-line react-hooks/exhaustive-deps
  const fmt = useMemo(
    () =>
      new Intl.DateTimeFormat(
        lang === "en" ? "en-GB" : lang === "ru" ? "ru-RU" : "uz-UZ",
        { day: "numeric", month: "long", year: "numeric" },
      ),
    [lang],
  );
  return (
    <div
      className="ug ug-d"
      style={{ "--c": g.color } as CSSProperties}
      key={n}
    >
      <section className="ug-d-hero">
        <div className="wrap ug-d-hero-in">
          <div className="ug-d-txt">
            <Link to="/upgoals" className="ug-crumb">
              <ArrowLeft size={16} aria-hidden /> {t.back}
            </Link>
            <p className="ey">{head}</p>
            <h1 className="display">{g.title[lang]}</h1>
            <p className="ug-d-short">{g.short[lang]}</p>
          </div>
          <div className="ug-d-icon">
            <span className="ug-d-n tnum" aria-hidden>
              {n}
            </span>
            <img
              src={iconSrc(n, lang)}
              alt={`${head}: ${g.title[lang]}`}
              width={360}
              height={360}
            />
          </div>
        </div>
        <nav className="ug-strip wrap" aria-label={t.all}>
          {GOALS.map((x) => (
            <Link
              key={x.n}
              to={`/upgoals/${x.n}`}
              className={x.n === n ? "on" : ""}
              style={{ "--c": x.color } as CSSProperties}
              aria-label={`${x.n}. ${x.title[lang]}`}
              title={`${x.n}. ${x.title[lang]}`}
            >
              <span className="tnum">{x.n}</span>
            </Link>
          ))}
        </nav>
      </section>

      <section className="ug-sec">
        <div className="wrap">
          <Reveal className="ug-head">
            <p className="ey">{t.why}</p>
            <h2 className="h2">{t.essence}</h2>
          </Reveal>
          <div className="ug-facts">
            {g.facts.map((f, i) => (
              <Reveal
                key={i}
                className="ug-fact"
                style={{ "--d": `${i * 120}ms` } as CSSProperties}
              >
                <b>
                  <CountUp value={unit(f.v, lang)} />
                </b>
                <span>{f.t[lang]}</span>
              </Reveal>
            ))}
          </div>
          <p className="ug-note">{t.why_src}</p>
        </div>
      </section>

      <section className="ug-sec ug-two">
        <div className="wrap ug-two-in">
          <Reveal className="ug-act">
            <p className="ey">{t.take}</p>
            <h2 className="h2">{t.what}</h2>
            <ol>
              {g.acts.map((a, i) => (
                <li key={i}>
                  <span className="tnum">{String(i + 1).padStart(2, "0")}</span>
                  <p>{a[lang]}</p>
                </li>
              ))}
            </ol>
          </Reveal>
          <Reveal className="ug-ours">
            <p className="ey">{brand}</p>
            <h2 className="h2">{t.ours}</h2>
            {ours ? (
              <p className="ug-ours-t">{ours}</p>
            ) : (
              <p className="ug-muted">{t.empty}</p>
            )}
            <Docs docs={d?.docs || []} lang={lang} goal={n} />
          </Reveal>
        </div>
      </section>

      {items.length > 0 && (
        <section className="ug-sec">
          <div className="wrap">
            <Reveal className="ug-head">
              <p className="ey">{brand}</p>
              <h2 className="h2">{t.activities}</h2>
            </Reveal>
            <div className="ug-items">
              {items.map((it) => (
                <Reveal as="article" key={it.id} className="ug-item">
                  {it.image && <img src={it.image} alt="" loading="lazy" />}
                  <div>
                    {it.date && (
                      <time dateTime={it.date}>
                        {fmt.format(new Date(it.date + "T12:00:00"))}
                      </time>
                    )}
                    <h3>{loc(it.title, lang)}</h3>
                    {loc(it.body, lang) && <p>{loc(it.body, lang)}</p>}
                    {it.url && (
                      <a
                        href={it.url}
                        target={/^https?:/.test(it.url) ? "_blank" : undefined}
                        rel="noopener noreferrer"
                      >
                        {t.more} <ArrowUpRight size={16} aria-hidden />
                      </a>
                    )}
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>
      )}

      <nav className="ug-pn wrap" aria-label={t.all}>
        <Link
          to={`/upgoals/${prev.n}`}
          style={{ "--c": prev.color } as CSSProperties}
        >
          <ArrowLeft size={20} aria-hidden />
          <span>
            <small>{t.prev}</small>
            {prev.n}. {prev.title[lang]}
          </span>
        </Link>
        <Link
          to={`/upgoals/${next.n}`}
          className="nx"
          style={{ "--c": next.color } as CSSProperties}
        >
          <span>
            <small>{t.next}</small>
            {next.n}. {next.title[lang]}
          </span>
          <ArrowRight size={20} aria-hidden />
        </Link>
      </nav>
    </div>
  );
}

export function UpGoalsPage() {
  const { n } = useParams();
  const num = Number(n);
  if (n && !(num >= 1 && num <= 17)) {
    return (
      <div className="ug wrap ug-sec">
        <h1 className="h2">404</h1>
        <Link to="/upgoals">{T.uz.back}</Link>
      </div>
    );
  }
  return n ? <Detail n={num} /> : <Landing />;
}
