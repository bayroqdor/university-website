// Telegram HTML ↔ muharrir: muharrir hujjati (TipTap JSON) Telegram qo'llaydigan teglarga 1:1 aylantiriladi.
// Qator = paragraf (Enter) yoki qator tashlash (Shift+Enter) — ikkalasi ham Telegram'da "\n". Boshqa hech qanday teg chiqmaydi.
import type { JSONContent } from "@tiptap/core";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escAttr = (s: string) => esc(s).replace(/"/g, "&quot;");
export const SAFE_URL = /^(https?:\/\/|tg:\/\/|mailto:)\S+$/i;

type M = { type: string; attrs?: Record<string, unknown> };
// tashqidan ichkariga: havola → qalin → kursiv → tagiga chizilgan → o'chirilgan → yashirin → kod
const ORDER = ["link", "bold", "italic", "underline", "strike", "spoiler", "code"];
const OPEN: Record<string, (m: M) => string> = {
  link: (m) => `<a href="${escAttr(String(m.attrs?.href || ""))}">`,
  bold: () => "<b>",
  italic: () => "<i>",
  underline: () => "<u>",
  strike: () => "<s>",
  spoiler: () => "<tg-spoiler>",
  code: () => "<code>",
};
const CLOSE: Record<string, string> = { link: "</a>", bold: "</b>", italic: "</i>", underline: "</u>", strike: "</s>", spoiler: "</tg-spoiler>", code: "</code>" };
const same = (a: M, b: M) => a.type === b.type && (a.type !== "link" || a.attrs?.href === b.attrs?.href);

function inline(nodes: JSONContent[] | undefined): string {
  let out = "";
  let open: M[] = [];
  const close = (from: number) => {
    for (let i = open.length - 1; i >= from; i--) out += CLOSE[open[i].type];
    open = open.slice(0, from);
  };
  for (const n of nodes || []) {
    if (n.type === "hardBreak") {
      out += "\n";
      continue;
    }
    if (n.type !== "text" || !n.text) continue;
    const want = ((n.marks || []) as M[])
      .filter((m) => ORDER.includes(m.type) && (m.type !== "link" || SAFE_URL.test(String(m.attrs?.href || ""))))
      .sort((a, b) => ORDER.indexOf(a.type) - ORDER.indexOf(b.type));
    let k = 0;
    while (k < open.length && k < want.length && same(open[k], want[k])) k++;
    close(k);
    for (const m of want.slice(k)) {
      out += OPEN[m.type](m);
      open.push(m);
    }
    out += esc(n.text);
  }
  close(0);
  return out;
}

const textOf = (nodes: JSONContent[] | undefined): string => (nodes || []).map((n) => (n.type === "hardBreak" ? "\n" : n.text || "")).join("");

/** Muharrir hujjati → Telegram HTML (parse_mode=HTML). */
export function docToTg(doc: JSONContent | null | undefined): string {
  const lines: string[] = [];
  for (const b of doc?.content || []) {
    if (b.type === "paragraph") lines.push(inline(b.content));
    else if (b.type === "blockquote") {
      const inner = (b.content || []).map((p) => inline(p.content)).join("\n");
      lines.push(`<blockquote${b.attrs?.expandable ? " expandable" : ""}>${inner}</blockquote>`);
    } else if (b.type === "codeBlock") {
      const lang = String(b.attrs?.language || "").replace(/[^A-Za-z0-9_+#.-]/g, "").slice(0, 32);
      lines.push(lang ? `<pre><code class="language-${lang}">${esc(textOf(b.content))}</code></pre>` : `<pre>${esc(textOf(b.content))}</pre>`);
    }
  }
  return lines.join("\n").replace(/^\n+|\n+$/g, "");
}

/** Telegram HTML → muharrir uchun HTML (har qator — paragraf; formatlash ichidagi qator tashlash — <br>). */
export function tgToEditorHtml(html: string): string {
  const t = document.createElement("template");
  t.innerHTML = html || "";
  const out: string[] = [];
  let line = "";
  let afterBlock = false;
  const flush = () => {
    out.push(`<p>${line}</p>`);
    line = "";
  };
  const inlineHtml = (n: Node): string => {
    if (n.nodeType === Node.TEXT_NODE) return esc(n.textContent || "").replace(/\n/g, "<br>");
    if (!(n instanceof Element)) return "";
    const tag = n.tagName.toLowerCase();
    const kids = Array.from(n.childNodes).map(inlineHtml).join("");
    if (tag === "tg-spoiler" || (tag === "span" && n.classList.contains("tg-spoiler"))) return `<span class="tg-spoiler">${kids}</span>`;
    if (tag === "a") {
      const href = n.getAttribute("href") || "";
      return SAFE_URL.test(href) ? `<a href="${escAttr(href)}">${kids}</a>` : kids;
    }
    const map: Record<string, string> = { b: "strong", strong: "strong", i: "em", em: "em", u: "u", ins: "u", s: "s", strike: "s", del: "s", code: "code" };
    return map[tag] ? `<${map[tag]}>${kids}</${map[tag]}>` : kids;
  };
  const linesOf = (nodes: Node[]): string[] => {
    const res: string[] = [];
    let cur = "";
    for (const n of nodes) {
      if (n.nodeType === Node.TEXT_NODE) {
        const parts = (n.textContent || "").split("\n");
        parts.forEach((p, i) => {
          if (i) {
            res.push(cur);
            cur = "";
          }
          cur += esc(p);
        });
      } else cur += inlineHtml(n);
    }
    res.push(cur);
    return res;
  };
  for (const n of Array.from(t.content.childNodes)) {
    const tag = n instanceof Element ? n.tagName.toLowerCase() : "";
    if (tag === "blockquote" || tag === "pre") {
      if (line) flush();
      if (tag === "blockquote") {
        const exp = (n as Element).hasAttribute("expandable");
        out.push(`<blockquote${exp ? ' data-expandable="true"' : ""}>${linesOf(Array.from(n.childNodes)).map((l) => `<p>${l}</p>`).join("")}</blockquote>`);
      } else {
        const code = (n as Element).querySelector("code");
        const lang = (code?.className || "").match(/language-([\w+#.-]+)/)?.[1] || "";
        out.push(`<pre><code${lang ? ` class="language-${lang}"` : ""}>${esc(n.textContent || "")}</code></pre>`);
      }
      afterBlock = true;
      continue;
    }
    if (n.nodeType === Node.TEXT_NODE) {
      let s = n.textContent || "";
      if (afterBlock && s.startsWith("\n")) s = s.slice(1); // bloklar orasidagi ajratuvchi
      afterBlock = false;
      const parts = s.split("\n");
      parts.forEach((p, i) => {
        if (i) flush();
        line += esc(p);
      });
    } else {
      afterBlock = false;
      line += inlineHtml(n);
    }
  }
  if (line || !afterBlock) flush();
  return out.join("");
}

/** Telegram ko'rsatadigan matn (teglarsiz). */
export function tgPlain(html: string): string {
  const t = document.createElement("template");
  t.innerHTML = html || "";
  return t.content.textContent || "";
}

/** Telegram sanaydigan uzunlik: teglarsiz matn, UTF-16 birliklarida (emoji — 2). */
export function tgLength(html: string): number {
  return tgPlain(html).trim().length;
}

/** Post matni + post osti matni (serverdagi tg_channel.compose bilan bir xil). */
export function composeTg(body: string, footer: string, withFooter: boolean): string {
  const b = (body || "").trim();
  const f = withFooter ? (footer || "").trim() : "";
  return b && f ? `${b}\n\n${f}` : b || f;
}
