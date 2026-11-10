// SPA ichida sahifa almashganda brauzer sarlavhasi, tavsif, canonical va og teglari yangilanadi
// (birinchi yuklashda ularni server qo'yadi — /api/meta xuddi o'sha qiymatlarni qaytaradi).
import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

interface Meta {
  title: string;
  description: string;
  url: string;
  noindex: boolean;
  image: string;
  alternates: [string, string][];
}

function setTag(sel: string, attr: string, value: string, create?: () => HTMLElement) {
  let el = document.head.querySelector<HTMLElement>(sel);
  if (!el && create) {
    el = create();
    document.head.appendChild(el);
  }
  el?.setAttribute(attr, value);
}

export function useDocMeta(lang: string) {
  const loc = useLocation();
  const first = useRef(true);
  const seq = useRef(0);
  useEffect(() => {
    if (first.current) {
      first.current = false; // server allaqachon to'g'ri meta bergan
      return;
    }
    const n = ++seq.current;
    const path = loc.pathname;
    fetch(`/api/meta?path=${encodeURIComponent(path)}&lang=${encodeURIComponent(lang)}`)
      .then((r) => (r.ok ? (r.json() as Promise<Meta>) : null))
      .then((m) => {
        if (!m || n !== seq.current) return;
        document.title = m.title;
        setTag('meta[name="description"]', "content", m.description, () => Object.assign(document.createElement("meta"), { name: "description" }));
        setTag('link[rel="canonical"]', "href", m.url, () => Object.assign(document.createElement("link"), { rel: "canonical" }));
        setTag('meta[property="og:title"]', "content", m.title);
        setTag('meta[property="og:description"]', "content", m.description);
        setTag('meta[property="og:url"]', "content", m.url);
        if (m.image) setTag('meta[property="og:image"]', "content", m.image);
        document.head.querySelectorAll('link[rel="alternate"][hreflang]').forEach((el) => el.remove());
        for (const [l, u] of m.alternates) {
          const a = Object.assign(document.createElement("link"), { rel: "alternate", href: u });
          a.setAttribute("hreflang", l);
          document.head.appendChild(a);
        }
        const robots = document.head.querySelector('meta[name="robots"][content^="noindex"]');
        if (m.noindex && !robots) document.head.appendChild(Object.assign(document.createElement("meta"), { name: "robots", content: "noindex, nofollow" }));
        if (!m.noindex) robots?.remove();
      })
      .catch(() => undefined);
  }, [loc.pathname, lang]);
}
