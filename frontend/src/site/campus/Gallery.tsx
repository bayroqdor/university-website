// Galereya: albomlar (/gallery, yil bo'yicha filtr) va albom sahifasi (/gallery/:slug) — suratlar to'ri, kirish mumkin bo'lgan ko'ruvchi, YouTube videolar.
import { ArrowRight } from "lucide-react";
import { useMemo } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { NotFound } from "../pages/Pages";
import { cx } from "./api";
import { fill } from "./i18n";
import { AlbumGrid } from "./Life";
import { dateL, Hero, Loading, PhotoGrid, Section, Seg, useCx, useData } from "./ui";

export function GalleryPage() {
  const { t, lang } = useCx();
  const d = useData(() => cx.gallery(lang), [lang]);
  const [sp, setSp] = useSearchParams();
  const year = Number(sp.get("year")) || 0;
  const items = useMemo(() => (d && d !== "404" ? d.items.filter((a) => !year || (a.date || "").slice(0, 4) === String(year)) : []), [d, year]);
  if (d === "404") return <NotFound />;
  if (!d) return <Loading />;
  return (
    <>
      <Hero crumbs={[{ to: "/student-life", label: t.life }, { label: t.gallery }]} eyebrow={t.life} title={t.gallery} lead={d.intro} />
      <Section className="tight-top">
        {d.years.length > 1 && (
          <div className="cx-tools">
            <Seg
              label={t.filter_year}
              value={year}
              onChange={(v) => setSp(v ? { year: String(v) } : {}, { replace: true })}
              options={[{ value: 0, label: t.all_years }, ...d.years.map((y) => ({ value: y, label: String(y) }))]}
            />
            <p className="cx-count tnum" aria-live="polite">
              {fill(t.shown, { n: items.length })}
            </p>
          </div>
        )}
        {items.length ? <AlbumGrid items={items} /> : <p className="cx-empty">{t.albums_none}</p>}
      </Section>
    </>
  );
}

export function AlbumPage() {
  const { slug = "" } = useParams();
  const { t, lang } = useCx();
  const d = useData(() => cx.album(slug, lang), [slug, lang]);
  if (d === "404") return <NotFound />;
  if (!d) return <Loading />;
  const a = d.item;
  return (
    <>
      <Hero crumbs={[{ to: "/student-life", label: t.life }, { to: "/gallery", label: t.gallery }, { label: a.title }]} eyebrow={a.date ? dateL(a.date, lang) : t.gallery} title={a.title} lead={a.summary}>
        {d.news && (
          <div className="cx-actions">
            <Link className="tlink" to={`/news/${d.news.slug}`}>
              {t.album_news} <span aria-hidden>→</span>
            </Link>
          </div>
        )}
      </Hero>
      {a.photos.length > 0 && (
        <Section className="tight-top">
          <p className="cx-count tnum">{fill(t.n_photos, { n: a.photos.length })}</p>
          <PhotoGrid photos={a.photos} ratio="4 / 3" title={a.title} />
        </Section>
      )}
      {a.videos.length > 0 && (
        <Section title={t.videos} alt>
          <ul className="cx-videos">
            {a.videos.map((v, i) => (
              <li key={v}>
                <div className="cx-video">
                  <iframe
                    src={`https://www.youtube-nocookie.com/embed/${v}`}
                    title={`${a.title} — ${fill(t.video_t, { n: i + 1 })}`}
                    loading="lazy"
                    allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                    referrerPolicy="strict-origin-when-cross-origin"
                  />
                </div>
              </li>
            ))}
          </ul>
        </Section>
      )}
      {d.others.length > 0 && (
        <Section title={t.other_albums}>
          <AlbumGrid items={d.others} />
          <p className="cx-more">
            <Link className="tlink" to="/gallery">
              {t.gallery} <ArrowRight size={16} aria-hidden />
            </Link>
          </p>
        </Section>
      )}
    </>
  );
}
