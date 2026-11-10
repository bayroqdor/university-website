// Maqola/loyiha matnini ko'rsatish: xavfsiz HTML + formulalar, interaktiv grafiklar, kod ranglari, sarlavha langarlari
import { copyOrPrompt } from "../lib/clipboard";
import type { JSONContent } from "@tiptap/core";
import DOMPurify from "dompurify";
import katex from "katex";
import "katex/contrib/mhchem";
import "katex/dist/katex.min.css";
import { common, createLowlight } from "lowlight";
import { useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ChartConfig } from "./chart";
import { ChartView } from "./ChartView";
import { Carousel, type Slide } from "./Carousel";
import { docKind, DocViewer } from "./DocViewer";
import { ChartLabels } from "./labels";
import { linkButtons } from "./linkButtons";
import { PrintMode } from "./print";

const lowlight = createLowlight(common);
const YT = /^https:\/\/(www\.)?(youtube-nocookie\.com|youtube\.com)\/embed\//;

DOMPurify.addHook("uponSanitizeElement", (node, data) => {
  if (data.tagName === "iframe") {
    const src = (node as Element).getAttribute?.("src") || "";
    if (!YT.test(src)) (node as Element).parentNode?.removeChild(node);
  }
});

function sanitize(html: string): string {
  return DOMPurify.sanitize(html, {
    ADD_TAGS: ["iframe"],
    ADD_ATTR: ["allowfullscreen", "frameborder", "allow", "target", "loading", "decoding"],
    FORBID_TAGS: ["style", "script", "form", "input", "textarea", "select", "button"],
  });
}

type Hast = { type: string; value?: string; tagName?: string; properties?: { className?: string[] }; children?: Hast[] };
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
function hastToHtml(n: Hast): string {
  if (n.type === "text") return esc(n.value || "");
  const inner = (n.children || []).map(hastToHtml).join("");
  if (n.type === "element") {
    const cls = n.properties?.className?.join(" ");
    return `<span${cls ? ` class="${esc(cls)}"` : ""}>${inner}</span>`;
  }
  return inner;
}

export function slugifyHeading(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[’‘ʻʼ'`]/g, "")
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "bolim"
  );
}

export interface Heading {
  id: string;
  text: string;
  level: number;
}

export function RichHtml({ html, doc, onHeadings, className = "prose" }: { html?: string; doc?: JSONContent | null; onHeadings?: (h: Heading[]) => void; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [fallback, setFallback] = useState<string>("");
  const [charts, setCharts] = useState<{ el: HTMLElement; config: ChartConfig }[]>([]);
  const [galleries, setGalleries] = useState<{ el: HTMLElement; images: Slide[]; ratio: string }[]>([]);
  const [zoom, setZoom] = useState<{ src: string; alt: string } | null>(null);
  // hujjatlar: «Hujjat» bloki doim ochiq; matndagi PDF/Drive havolalari yonida «Ko'rish» — bosilsa shu joyda ochiladi
  const [docs, setDocs] = useState<{ el: HTMLElement; src: string; title: string; open: boolean }[]>([]);
  const print = useContext(PrintMode);
  const t = useContext(ChartLabels);

  // saqlangan HTML bo'lmasa — JSON dan yaratish (tahrirlagich kengaytmalari kerak bo'lganda yuklanadi)
  useEffect(() => {
    if (html || !doc) return;
    let alive = true;
    import("./extensions").then(({ jsonToHtml }) => alive && setFallback(jsonToHtml(doc)));
    return () => {
      alive = false;
    };
  }, [html, doc]);

  const clean = useMemo(() => sanitize(html || fallback || ""), [html, fallback]);

  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    // formulalar
    root.querySelectorAll<HTMLElement>('[data-type="inline-math"], [data-type="block-math"]').forEach((el) => {
      const latex = el.getAttribute("data-latex") || "";
      try {
        katex.render(latex, el, { displayMode: el.getAttribute("data-type") === "block-math", throwOnError: false, strict: false });
      } catch {
        el.textContent = latex;
      }
    });
    // kod bloklari
    root.querySelectorAll<HTMLElement>("pre > code").forEach((el) => {
      const lang = (el.className.match(/language-([\w+#-]+)/) || [])[1];
      const code = el.textContent || "";
      try {
        const tree = lang && lowlight.registered(lang) ? lowlight.highlight(lang, code) : lowlight.highlightAuto(code);
        el.innerHTML = hastToHtml(tree as unknown as Hast);
        el.classList.add("hljs");
      } catch {
        /* rangsiz qoladi */
      }
      const pre = el.parentElement!;
      if (!print && !pre.querySelector(".copy-code")) {
        const b = document.createElement("button");
        b.className = "copy-code";
        b.type = "button";
        b.textContent = "Copy";
        b.onclick = () => {
          copyOrPrompt(code, "Copy").then((ok) => {
            if (!ok) return;
            b.textContent = "✓";
            setTimeout(() => (b.textContent = "Copy"), 1400);
          });
        };
        pre.appendChild(b);
      }
    });
    // sarlavhalar: id va langar
    const used = new Set<string>();
    const heads: Heading[] = [];
    root.querySelectorAll<HTMLElement>("h2, h3").forEach((h) => {
      let id = slugifyHeading(h.textContent || "");
      while (used.has(id)) id += "-";
      used.add(id);
      h.id = id;
      heads.push({ id, text: h.textContent || "", level: Number(h.tagName[1]) });
      if (!print && !h.querySelector(".anchor")) {
        const a = document.createElement("a");
        a.href = `#${id}`;
        a.className = "anchor";
        a.setAttribute("aria-hidden", "true");
        a.textContent = "#";
        h.appendChild(a);
      }
    });
    onHeadings?.(heads);
    // jadvallar gorizontal aylantiriladi
    root.querySelectorAll("table").forEach((t) => {
      if (!t.parentElement?.classList.contains("table-wrap")) {
        const w = document.createElement("div");
        w.className = "table-wrap";
        t.parentNode?.insertBefore(w, t);
        w.appendChild(t);
      }
    });
    // tashqi havolalar yangi oynada
    root.querySelectorAll<HTMLAnchorElement>("a[href^='http']").forEach((a) => {
      if (a.host !== window.location.host) {
        a.target = "_blank";
        a.rel = "noopener noreferrer";
      }
    });
    // matndan keyingi yolg'iz qisqa havolalar — tugma (hujjat «Ko'rish» tugmasidan oldin)
    if (!print) linkButtons(root);
    // bosmada video o'rniga havola
    if (print) {
      root.querySelectorAll<HTMLIFrameElement>("iframe").forEach((f) => {
        const src = f.getAttribute("src") || "";
        const id = (src.match(/embed\/([\w-]{6,})/) || [])[1];
        const url = id ? `https://youtu.be/${id}` : src;
        const box = document.createElement("a");
        box.className = "print-video";
        box.href = url;
        box.innerHTML = `<b>▶ ${t.p_video}</b><span></span>`;
        box.querySelector("span")!.textContent = url;
        const holder = f.closest("div[data-youtube-video]") || f;
        holder.replaceWith(box);
      });
    }
    // rasmlar karuseli (bosmada — oddiy rasmlar to'ri)
    const gals: { el: HTMLElement; images: Slide[]; ratio: string }[] = [];
    if (!print)
      root.querySelectorAll<HTMLElement>('figure[data-type="gallery"]').forEach((el) => {
        let images: Slide[] = [];
        try {
          images = JSON.parse(el.getAttribute("data-images") || "[]");
        } catch {
          images = Array.from(el.querySelectorAll("img")).map((i) => ({ src: i.src, alt: i.alt }));
        }
        images = images.filter((x) => x && typeof x.src === "string" && /^(https?:\/\/|\/)/.test(x.src));
        el.querySelector(".gallery-static")?.remove();
        gals.push({ el, images, ratio: el.getAttribute("data-ratio") || "4 / 3" });
      });
    setGalleries(gals);
    // rasmlarni kattalashtirish
    if (!print) root.querySelectorAll<HTMLImageElement>("figure:not([data-type='gallery']) img").forEach((img) => {
      img.classList.add("zoomable");
      img.onclick = () => setZoom({ src: img.src, alt: img.alt });
    });
    // grafiklar
    const list: { el: HTMLElement; config: ChartConfig }[] = [];
    root.querySelectorAll<HTMLElement>('figure[data-type="chart"]').forEach((el) => {
      try {
        const cfg = JSON.parse(el.getAttribute("data-config") || "null");
        if (cfg) list.push({ el, config: cfg });
      } catch {
        /* */
      }
    });
    setCharts(list);
    // hujjatlar
    const dl: { el: HTMLElement; src: string; title: string; open: boolean }[] = [];
    // effekt qayta ishlasa (StrictMode, qayta chizish) — avvalgi «Ko'rish» tugmalari va oynalari olib tashlanib, qaytadan yaratiladi;
    // aks holda tugmalar eski ro'yxat tartib raqamiga bog'liq qolib, bosilganda hech narsa ochilmasdi
    root.querySelectorAll(".dv-toggle, .dv-holder").forEach((x) => x.remove());
    if (!print) {
      root.querySelectorAll<HTMLElement>('figure[data-type="doc"]').forEach((el) => {
        const src = el.getAttribute("data-src") || "";
        if (!/^(https?:\/\/|\/)/.test(src)) return;
        el.innerHTML = "";
        dl.push({ el, src, title: el.getAttribute("data-title") || "", open: true });
      });
      const lg = document.documentElement.lang.slice(0, 2);
      const viewLabel = ({ ru: "Просмотр", en: "View" } as Record<string, string>)[lg] || "Ko‘rish";
      const hideLabel = ({ ru: "Скрыть", en: "Hide" } as Record<string, string>)[lg] || "Yopish";
      // lucide «eye» / «eye-off» belgilari (DOM tugmasi — React emas)
      const eye = (off: boolean) =>
        `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${
          off
            ? '<path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49"/><path d="M14.084 14.158a3 3 0 0 1-4.242-4.242"/><path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143"/><path d="m2 2 20 20"/>'
            : '<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/>'
        }</svg>`;
      const label = (b: HTMLButtonElement, open: boolean) => {
        b.innerHTML = eye(open);
        b.append(open ? hideLabel : viewLabel);
      };
      root.querySelectorAll<HTMLAnchorElement>("a[href]").forEach((a) => {
        const src = a.getAttribute("href") || "";
        const kind = docKind(src);
        if (a.closest('figure[data-type="doc"]') || !kind || kind === "image") return;
        const block = (a.closest("li, p, td, th, h2, h3, h4") as HTMLElement | null) || a;
        const holder = document.createElement("div");
        holder.className = "dv-holder";
        if (/^(LI|TD|TH)$/.test(block.tagName)) block.appendChild(holder);
        else block.after(holder);
        const idx = dl.length;
        dl.push({ el: holder, src, title: (a.textContent || "").trim(), open: false });
        const b = document.createElement("button");
        b.type = "button";
        b.className = "dv-toggle";
        label(b, false);
        b.setAttribute("aria-expanded", "false");
        b.onclick = () => {
          const open = b.getAttribute("aria-expanded") !== "true";
          b.setAttribute("aria-expanded", String(open));
          label(b, open);
          setDocs((cur) => cur.map((x, i) => (i === idx ? { ...x, open } : x)));
        };
        a.after(b);
      });
    }
    setDocs(dl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clean, print]);

  useEffect(() => {
    if (!zoom) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setZoom(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoom]);

  return (
    <>
      <div ref={ref} className={className} dangerouslySetInnerHTML={{ __html: clean }} />
      {charts.map((c, i) => createPortal(<ChartView config={c.config} />, c.el, `chart-${i}`))}
      {galleries.map((g, i) => createPortal(<Carousel images={g.images} ratio={g.ratio} />, g.el, `gal-${i}`))}
      {docs.map((d, i) => (d.open ? createPortal(<DocViewer src={d.src} title={d.title} lang={document.documentElement.lang} />, d.el, `doc-${i}`) : null))}
      {zoom && (
        <div className="lightbox" onClick={() => setZoom(null)} role="dialog" aria-modal="true">
          <img src={zoom.src} alt={zoom.alt} />
        </div>
      )}
    </>
  );
}

export default RichHtml;
