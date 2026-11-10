// Maxsus bloklar: grafik, izoh (callout), izohli rasm, tugma. HTML ko'rinishi o'quvchi sahifasida «jonlantiriladi».
import { mergeAttributes, Node } from "@tiptap/core";

function parseJson(v: string | null) {
  try {
    return v ? JSON.parse(v) : null;
  } catch {
    return null;
  }
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    chart: { insertChart: (config: unknown) => ReturnType };
    callout: { setCallout: (attrs?: { emoji?: string; tone?: string }) => ReturnType };
    figure: { setFigure: (attrs: { src: string; alt?: string; caption?: string; width?: string } & Partial<Record<"credit" | "creditUrl" | "source" | "sourceUrl" | "license" | "licenseUrl", string>>) => ReturnType };
    button: { insertButton: (attrs: { label: string; url: string; align?: string }) => ReturnType };
    gallery: { insertGallery: (attrs: { images: { src: string; alt?: string }[]; ratio?: string }) => ReturnType };
    docEmbed: { insertDoc: (attrs: { src: string; title?: string }) => ReturnType };
  }
}

export const ChartNode = Node.create({
  name: "chart",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,
  addAttributes() {
    return {
      config: {
        default: null,
        parseHTML: (el) => parseJson(el.getAttribute("data-config")),
        renderHTML: (a) => ({ "data-config": JSON.stringify(a.config) }),
      },
    };
  },
  parseHTML() {
    return [{ tag: 'figure[data-type="chart"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["figure", mergeAttributes(HTMLAttributes, { "data-type": "chart", class: "chart-embed" })];
  },
  addCommands() {
    return {
      insertChart:
        (config) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs: { config } }),
    };
  },
});

export const CalloutNode = Node.create({
  name: "callout",
  group: "block",
  content: "block+",
  defining: true,
  addAttributes() {
    return {
      emoji: { default: "💡", parseHTML: (el) => el.getAttribute("data-emoji") || "💡", renderHTML: (a) => ({ "data-emoji": a.emoji }) },
      tone: { default: "accent", parseHTML: (el) => el.getAttribute("data-tone") || "accent", renderHTML: (a) => ({ "data-tone": a.tone }) },
    };
  },
  parseHTML() {
    return [{ tag: 'aside[data-type="callout"]', contentElement: ".callout-body" }];
  },
  renderHTML({ HTMLAttributes, node }) {
    return ["aside", mergeAttributes(HTMLAttributes, { "data-type": "callout", class: "callout" }), ["span", { class: "callout-emoji", contenteditable: "false" }, node.attrs.emoji || "💡"], ["div", { class: "callout-body" }, 0]];
  },
  addCommands() {
    return {
      setCallout:
        (attrs) =>
        ({ commands }) =>
          commands.wrapIn(this.name, attrs),
    };
  },
});

const httpUrl = (u: unknown) => (typeof u === "string" && /^https?:\/\//i.test(u) ? u : "");
type DomSpec = string | [string, Record<string, string>, ...DomSpec[]];
/** Rasm muallifi qatori: «Foto: <muallif> / <manba>, <litsenziya>» (havolalar bilan); ma'lumot bo'lmasa — null */
export function creditSpec(a: Record<string, unknown>): DomSpec | null {
  const who = String(a.credit || "").trim();
  const src = String(a.source || "").trim();
  const lic = String(a.license || "").trim();
  if (!who && !src && !lic) return null;
  const link = (text: string, href: unknown): DomSpec => (httpUrl(href) ? ["a", { href: httpUrl(href), target: "_blank", rel: "noopener noreferrer nofollow" }, text] : text);
  const parts: DomSpec[] = ["Foto: "];
  if (who) parts.push(link(who, a.creditUrl));
  if (src) parts.push(who ? " / " : "", link(src, a.sourceUrl));
  if (lic) parts.push(who || src ? ", " : "", link(lic, a.licenseUrl));
  const data: Record<string, string> = { class: "fig-credit", "data-credit": who, "data-source": src, "data-license": lic };
  if (httpUrl(a.creditUrl)) data["data-credit-url"] = httpUrl(a.creditUrl);
  if (httpUrl(a.sourceUrl)) data["data-source-url"] = httpUrl(a.sourceUrl);
  if (httpUrl(a.licenseUrl)) data["data-license-url"] = httpUrl(a.licenseUrl);
  return ["span", data, ...parts.filter((x) => x !== "")];
}

export const FigureNode = Node.create({
  name: "figure",
  group: "block",
  atom: true,
  draggable: true,
  addAttributes() {
    return {
      src: { default: "" },
      alt: { default: "" },
      caption: { default: "" },
      width: { default: "normal" },
      // ochiq litsenziyali rasm (Openverse): «Foto: muallif / manba, litsenziya» — CC litsenziyasi talabi, izohdan alohida saqlanadi
      credit: { default: "" },
      creditUrl: { default: "" },
      source: { default: "" },
      sourceUrl: { default: "" },
      license: { default: "" },
      licenseUrl: { default: "" },
    };
  },
  parseHTML() {
    return [
      {
        tag: 'figure[data-type="figure"]',
        getAttrs: (el) => {
          const e = el as HTMLElement;
          const img = e.querySelector("img");
          const cap = e.querySelector("figcaption");
          const cr = cap?.querySelector<HTMLElement>(".fig-credit");
          const capText = cap ? (cr ? Array.from(cap.childNodes).filter((n) => n !== cr).map((n) => n.textContent || "").join("") : cap.textContent || "").trim() : "";
          const d = (k: string) => cr?.getAttribute(`data-${k}`) || "";
          return {
            src: img?.getAttribute("src") || "",
            alt: img?.getAttribute("alt") || "",
            caption: capText,
            width: e.getAttribute("data-width") || "normal",
            credit: d("credit"),
            creditUrl: d("credit-url"),
            source: d("source"),
            sourceUrl: d("source-url"),
            license: d("license"),
            licenseUrl: d("license-url"),
          };
        },
      },
      { tag: "img[src]", getAttrs: (el) => ({ src: (el as HTMLElement).getAttribute("src"), alt: (el as HTMLElement).getAttribute("alt") || "" }) },
    ];
  },
  renderHTML({ node }) {
    const { src, alt, caption, width } = node.attrs;
    const img = ["img", { src, alt, loading: "lazy", decoding: "async" }];
    const credit = creditSpec(node.attrs);
    const cap = caption && credit ? ["figcaption", {}, caption, " ", credit] : caption ? ["figcaption", {}, caption] : credit ? ["figcaption", {}, credit] : null;
    return cap
      ? ["figure", { "data-type": "figure", "data-width": width, class: `figure w-${width}` }, img, cap]
      : ["figure", { "data-type": "figure", "data-width": width, class: `figure w-${width}` }, img];
  },
  addCommands() {
    return {
      setFigure:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs }),
    };
  },
});

export const ButtonNode = Node.create({
  name: "button",
  group: "block",
  atom: true,
  draggable: true,
  addAttributes() {
    return { label: { default: "Batafsil" }, url: { default: "" }, align: { default: "left" } };
  },
  parseHTML() {
    return [
      {
        tag: 'div[data-type="button"]',
        getAttrs: (el) => {
          const a = (el as HTMLElement).querySelector("a");
          return { label: a?.textContent || "", url: a?.getAttribute("href") || "", align: (el as HTMLElement).getAttribute("data-align") || "left" };
        },
      },
    ];
  },
  renderHTML({ node }) {
    return ["div", { "data-type": "button", "data-align": node.attrs.align, class: `btn-card align-${node.attrs.align}` }, ["a", { href: node.attrs.url, class: "btn-cta" }, node.attrs.label]];
  },
  addCommands() {
    return {
      insertButton:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs }),
    };
  },
});

/** Rasmlar karuseli: bir nechta rasm — yon tugmalar va nuqtalar bilan (o'quvchi sahifasida «jonlantiriladi») */
export const GalleryNode = Node.create({
  name: "gallery",
  group: "block",
  atom: true,
  draggable: true,
  addAttributes() {
    return {
      images: {
        default: [],
        parseHTML: (el) => {
          const j = parseJson(el.getAttribute("data-images"));
          if (Array.isArray(j)) return j;
          return Array.from(el.querySelectorAll("img")).map((i) => ({ src: i.getAttribute("src") || "", alt: i.getAttribute("alt") || "" }));
        },
        renderHTML: (a) => ({ "data-images": JSON.stringify(a.images || []) }),
      },
      ratio: { default: "4 / 3", parseHTML: (el) => el.getAttribute("data-ratio") || "4 / 3", renderHTML: (a) => ({ "data-ratio": a.ratio }) },
    };
  },
  parseHTML() {
    return [{ tag: 'figure[data-type="gallery"]' }];
  },
  renderHTML({ HTMLAttributes, node }) {
    const imgs = ((node.attrs.images || []) as { src: string; alt?: string }[]).map((im) => ["img", { src: im.src, alt: im.alt || "", loading: "lazy", decoding: "async" }]);
    return ["figure", mergeAttributes(HTMLAttributes, { "data-type": "gallery", class: "gallery-embed" }), ["div", { class: "gallery-static" }, ...imgs]];
  },
  addCommands() {
    return {
      insertGallery:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs }),
    };
  },
});

/** Hujjat (PDF, skaner qilingan buyruq/nizom, Google Drive fayli): saytda sahifaning o'zida jonli ko'rinadi */
export const DocNode = Node.create({
  name: "docEmbed",
  group: "block",
  atom: true,
  draggable: true,
  addAttributes() {
    return {
      src: { default: "" },
      title: { default: "" },
    };
  },
  parseHTML() {
    return [
      {
        tag: 'figure[data-type="doc"]',
        getAttrs: (el) => ({ src: (el as HTMLElement).getAttribute("data-src") || "", title: (el as HTMLElement).getAttribute("data-title") || "" }),
      },
    ];
  },
  renderHTML({ node }) {
    const src = String(node.attrs.src || "");
    const title = String(node.attrs.title || "") || src.split("/").pop() || "";
    return ["figure", { "data-type": "doc", "data-src": src, "data-title": title, class: "doc-embed" }, ["a", { href: src, target: "_blank", rel: "noopener noreferrer" }, title]];
  },
  addCommands() {
    return {
      insertDoc:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs }),
    };
  },
});
