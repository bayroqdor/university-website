// Ko'p so'raladigan savollar (Aloqa sahifasi): kategoriyalar, ochiluvchi javoblar; matnlar admin → «Ko'p so'raladigan savollar»
import { useEffect, useState } from "react";
import { pub, type FaqItem } from "../../lib/api";
import { useSite } from "../../lib/site";
import { Reveal } from "../fx";
import "../../styles/careers.css";

/* ------------------------------------------------------------------ ko'p so'raladigan savollar (Aloqa sahifasi) */
export function FaqSection() {
  const { t, lang } = useSite();
  const [d, setD] = useState<{ items: FaqItem[] } | null>(null);
  useEffect(() => {
    pub.faq().then(setD).catch(() => setD({ items: [] }));
  }, [lang]);
  const [cat, setCat] = useState("all");
  const [open, setOpen] = useState<string | null>(null);
  const items: FaqItem[] = d ? d.items : [];
  if (!items.length) return null;
  const cats = [...new Set(items.map((x) => x.category))];
  const shown = items.filter((x) => cat === "all" || x.category === cat);
  return (
    <section className="section tight faq-sec" id="faq">
      <div className="container faq-wrap">
        <div className="faq-side">
          <Reveal className="page-eyebrow">FAQ</Reveal>
          <h2 className="careers-h2">{t.faq_title}</h2>
          <p className="faq-sub">{t.faq_sub}</p>
          {cats.length > 1 && (
            <div className="faq-cats">
              <button className={cat === "all" ? "on" : ""} onClick={() => setCat("all")}>
                {t.faq_all} <i>{items.length}</i>
              </button>
              {cats.map((c) => (
                <button key={c} className={cat === c ? "on" : ""} onClick={() => setCat(c)}>
                  {t.faq_cats[c] || c} <i>{items.filter((x) => x.category === c).length}</i>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="faq-list">
          {shown.map((x, i) => {
            const on = open === x.id;
            return (
              <Reveal key={x.id} delay={Math.min(i, 6) * 0.04} className={`faq-item ${on ? "on" : ""}`}>
                <button className="faq-q" aria-expanded={on} onClick={() => setOpen(on ? null : x.id)}>
                  <span>{x.q}</span>
                  <i aria-hidden />
                </button>
                <div className="faq-a" style={{ gridTemplateRows: on ? "1fr" : "0fr" }}>
                  <div>
                    <p>{x.a}</p>
                  </div>
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
