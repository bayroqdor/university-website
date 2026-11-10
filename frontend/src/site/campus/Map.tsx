// Kampus xaritasi (/campus-map): bosh reja surati ustida raqamlangan nuqtalar (klaviatura bilan tanlanadi), kattalashtirish va surish;
// har bir nuqta ro'yxatda ham bor (muqobil ko'rinish). Surat yuklanmagan bo'lsa — OpenStreetMap xaritasi va ro'yxat.
import { ExternalLink, Minus, Plus, Rotate3d } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { NotFound } from "../pages/Pages";
import { cx, type Spot } from "./api";
import { fill } from "./i18n";
import { Hero, Loading, Pic, Section, useCx, useData } from "./ui";

const ZOOMS = [1, 1.5, 2, 3];

function SpotBody({ s, tour }: { s: Spot; tour: boolean }) {
  const { t } = useCx();
  return (
    <div className="cx-spot-b">
      {s.photo && <Pic src={s.photo} alt={s.photo_alt || ""} ratio="16 / 10" w={640} sizes="(max-width: 760px) 100vw, 360px" />}
      {s.summary && <p className="cx-p">{s.summary}</p>}
      {s.inside?.length ? (
        <>
          <h4 className="cx-h4">{t.inside}</h4>
          <ul className="cx-list">
            {s.inside.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </>
      ) : null}
      <p className="cx-spot-links">
        {tour && s.scene_id && (
          <Link className="tlink" to={`/virtual-tour?scene=${s.scene_id}`}>
            <Rotate3d size={16} aria-hidden /> {t.tour_link}
          </Link>
        )}
        {s.url &&
          (/^https?:/.test(s.url) ? (
            <a className="tlink" href={s.url} target="_blank" rel="noopener noreferrer">
              {s.title} <ExternalLink size={14} aria-hidden />
            </a>
          ) : (
            <Link className="tlink" to={s.url}>
              {s.title} <span aria-hidden>→</span>
            </Link>
          ))}
      </p>
    </div>
  );
}

export function CampusMapPage() {
  const { t, lang } = useCx();
  const d = useData(() => cx.map(lang), [lang]);
  const [sel, setSel] = useState<string>("");
  const [z, setZ] = useState(0);
  const scroller = useRef<HTMLDivElement>(null);
  const spots = d && d !== "404" ? d.spots : [];
  const placed = spots.filter((s) => s.x !== null && s.x !== undefined && s.y !== null && s.y !== undefined);
  // tanlangan nuqta kattalashtirilgan xaritada ko'rinadigan joyga suriladi
  useEffect(() => {
    const s = placed.find((x) => x.id === sel);
    const el = scroller.current;
    if (!s || !el) return;
    const inner = el.firstElementChild as HTMLElement | null;
    if (!inner) return;
    el.scrollTo({ left: (inner.clientWidth * (s.x || 0)) / 100 - el.clientWidth / 2, top: (inner.clientHeight * (s.y || 0)) / 100 - el.clientHeight / 2, behavior: "smooth" });
  }, [sel, z]); // eslint-disable-line react-hooks/exhaustive-deps
  if (d === "404") return <NotFound />;
  if (!d) return <Loading />;
  const cur = spots.find((s) => s.id === sel);
  const label = (s: Spot, i: number) => fill(t.spot_n, { n: s.number ?? i + 1, t: s.title });
  const dd = (0.6 * 360) / 2 ** (d.zoom || 17);
  const osm = `https://www.openstreetmap.org/export/embed.html?bbox=${d.lon - dd},${d.lat - dd / 2},${d.lon + dd},${d.lat + dd / 2}&layer=mapnik&marker=${d.lat},${d.lon}`;
  return (
    <>
      <Hero crumbs={[{ to: "/admission", label: t.admission }, { label: t.map }]} eyebrow={t.applicants} title={t.map}>
        {d.tour && (
          <div className="cx-actions">
            <Link className="cx-btn ghost" to="/virtual-tour">
              <Rotate3d size={18} aria-hidden /> {t.tour}
            </Link>
          </div>
        )}
      </Hero>
      <Section className="tight-top">
        <div className="cx-map-wrap">
          {d.image ? (
            <div className="cx-map">
              <div className="cx-map-tools" role="group" aria-label={t.map}>
                <button type="button" className="cx-ibtn" onClick={() => setZ((v) => Math.max(0, v - 1))} disabled={z === 0} aria-label={t.zoom_out}>
                  <Minus size={18} aria-hidden />
                </button>
                <span className="tnum" aria-live="polite">
                  {Math.round(ZOOMS[z] * 100)}%
                </span>
                <button type="button" className="cx-ibtn" onClick={() => setZ((v) => Math.min(ZOOMS.length - 1, v + 1))} disabled={z === ZOOMS.length - 1} aria-label={t.zoom_in}>
                  <Plus size={18} aria-hidden />
                </button>
              </div>
              <div className="cx-map-scroll" ref={scroller} tabIndex={z > 0 ? 0 : -1} aria-label={d.image_alt || t.map}>
                <div className="cx-map-in" style={{ width: `${ZOOMS[z] * 100}%` }}>
                  <img src={d.image} alt={d.image_alt} />
                  {placed.map((s) => {
                    const i = spots.indexOf(s);
                    return (
                      <button
                        key={s.id}
                        type="button"
                        className={`cx-hot ${sel === s.id ? "on" : ""}`}
                        style={{ left: `${s.x}%`, top: `${s.y}%` }}
                        aria-label={label(s, i)}
                        aria-pressed={sel === s.id}
                        aria-controls={`spot-${s.id}`}
                        onClick={() => setSel(sel === s.id ? "" : s.id)}
                      >
                        {s.number ?? i + 1}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            <div className="cx-osm">
              <iframe title={t.osm} src={osm} loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
            </div>
          )}
          <div className="cx-map-side">
            <h2 className="cx-h3">{t.places_list}</h2>
            <ol className="cx-spots">
              {spots.map((s, i) => (
                <li key={s.id} id={`spot-${s.id}`} className={sel === s.id ? "on" : ""}>
                  <button type="button" className="cx-spot-h" aria-expanded={sel === s.id} onClick={() => setSel(sel === s.id ? "" : s.id)}>
                    <span className="cx-spot-n tnum" aria-hidden>
                      {s.number ?? i + 1}
                    </span>
                    <span>{s.title}</span>
                  </button>
                  {sel === s.id && cur && <SpotBody s={cur} tour={d.tour} />}
                </li>
              ))}
            </ol>
          </div>
        </div>
      </Section>
    </>
  );
}
