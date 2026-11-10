// Nusxalangan kontentni buzmasdan qabul qilish: Word, Google Docs, Excel/Sheets va veb-sahifalardan kelgan HTML tozalanadi
// (jadvallar, birlashtirilgan kataklar, rasmlar, ro'yxatlar, qalin/kursiv saqlanadi; Office'ning xizmat teglari tashlanadi).

const ALIGN = /text-align\s*:\s*(left|center|right|justify)/i;

/** Word: «mso-list» xatboshilari → haqiqiy <ul>/<ol> ro'yxat */
function wordLists(doc: Document): void {
  const paras = Array.from(doc.body.querySelectorAll("p")).filter((p) => /mso-list\s*:/i.test(p.getAttribute("style") || "") || /MsoListParagraph/i.test(p.className));
  let list: HTMLElement | null = null;
  for (const p of paras) {
    const marker = p.querySelector('span[style*="mso-list:Ignore"], span[style*="mso-list: Ignore"]');
    const mtext = (marker?.textContent || "").trim();
    const ordered = /^[\da-zA-Zivx]+[.)]$/.test(mtext);
    marker?.remove();
    const li = doc.createElement("li");
    li.innerHTML = p.innerHTML;
    // ketma-ket kelgan bandlar bitta ro'yxatga
    if (!list || p.previousElementSibling !== list || (list.tagName === "OL") !== ordered) {
      list = doc.createElement(ordered ? "ol" : "ul");
      p.before(list);
    }
    list.appendChild(li);
    p.remove();
  }
}

export function cleanPastedHtml(html: string): string {
  if (!html) return html;
  // Office shartli izohlari va XML qismlari
  let src = html
    .replace(/<!--\[if[\s\S]*?<!\[endif\]-->/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<\/?(o|w|v|m|st1):[^>]*>/gi, "");
  const doc = new DOMParser().parseFromString(src, "text/html");
  doc.querySelectorAll("style, script, meta, link, xml, title, colgroup col[span='0']").forEach((n) => n.remove());
  // Google Docs: hammasi <b style="font-weight:normal" id="docs-internal-guid-…"> ichida keladi — qalin emas
  doc.querySelectorAll('b[id^="docs-internal-guid"]').forEach((b) => b.replaceWith(...Array.from(b.childNodes)));
  wordLists(doc);
  // uslub orqali berilgan qalin/kursiv/tagiga chizilgan → teglar (Google Docs, Sheets, Excel shunday beradi)
  // ichkaridagilar avval (teskari tartib) — tashqi element almashtirilganda ichki uslublar yo'qolmasin
  Array.from(doc.querySelectorAll<HTMLElement>("span[style], td[style], th[style], p[style], font")).reverse().forEach((el) => {
    const st = (el.getAttribute("style") || "").toLowerCase();
    if (el.tagName === "SPAN" || el.tagName === "FONT") {
      let inner = el.innerHTML;
      if (/font-weight\s*:\s*(bold|[6-9]00)/.test(st)) inner = `<strong>${inner}</strong>`;
      if (/font-style\s*:\s*italic/.test(st)) inner = `<em>${inner}</em>`;
      if (/text-decoration[^;]*underline/.test(st)) inner = `<u>${inner}</u>`;
      if (/text-decoration[^;]*line-through/.test(st)) inner = `<s>${inner}</s>`;
      if (/vertical-align\s*:\s*super/.test(st)) inner = `<sup>${inner}</sup>`;
      if (/vertical-align\s*:\s*sub/.test(st)) inner = `<sub>${inner}</sub>`;
      const tmp = doc.createElement("span");
      tmp.innerHTML = inner;
      el.replaceWith(...Array.from(tmp.childNodes));
      return;
    }
    // jadval kataklari va xatboshilarda faqat tekislash qoladi; katakdagi qalin/kursiv (Excel) — teg bilan
    if ((el.tagName === "TD" || el.tagName === "TH") && el.textContent?.trim()) {
      if (/font-weight\s*:\s*(bold|[6-9]00)/.test(st)) el.innerHTML = `<strong>${el.innerHTML}</strong>`;
      if (/font-style\s*:\s*italic/.test(st)) el.innerHTML = `<em>${el.innerHTML}</em>`;
    }
    const a = st.match(ALIGN);
    el.removeAttribute("style");
    if (a && el.tagName === "P") el.setAttribute("style", `text-align:${a[1]}`);
  });
  // jadval: Excel/Word katakchalaridagi bo'sh <p> va ortiqcha atributlar; sarlavha qatori saqlanadi
  doc.querySelectorAll("table").forEach((t) => {
    t.removeAttribute("style");
    t.removeAttribute("width");
    t.removeAttribute("border");
    t.querySelectorAll("td, th").forEach((c) => {
      ["width", "height", "nowrap", "valign", "class", "x:num", "x:str"].forEach((k) => c.removeAttribute(k));
      if (!c.textContent?.trim() && !c.querySelector("img")) c.innerHTML = "<p></p>";
    });
  });
  // Word'dagi lokal rasmlar (file:///…) — brauzer o'qiy olmaydi: tashlanadi (rasmni alohida qo'shish kerak)
  doc.querySelectorAll("img").forEach((img) => {
    const s = img.getAttribute("src") || "";
    if (!/^(https?:|data:image\/|\/)/i.test(s)) img.remove();
  });
  // bo'sh qolgan Word xatboshilari (&nbsp;)
  doc.querySelectorAll("p").forEach((p) => {
    if (!p.textContent?.replace(/ /g, "").trim() && !p.querySelector("img, br") && p.parentElement?.tagName !== "TD" && p.parentElement?.tagName !== "TH") p.remove();
  });
  doc.querySelectorAll("[class]").forEach((el) => el.removeAttribute("class"));
  return doc.body.innerHTML;
}

/** Tab bilan ajratilgan matn (Excel/Sheets'dan HTML'siz nusxa) → jadval HTML */
export function tsvToTable(text: string): string | null {
  const rows = text.replace(/\r/g, "").replace(/\n+$/, "").split("\n");
  if (rows.length < 2 || !rows.every((r) => r.includes("\t"))) return null;
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const cells = rows.map((r) => r.split("\t"));
  const w = Math.max(...cells.map((r) => r.length));
  const tr = (r: string[], tag: string) => `<tr>${Array.from({ length: w }, (_, i) => `<${tag}><p>${esc(r[i] || "")}</p></${tag}>`).join("")}</tr>`;
  return `<table><tbody>${tr(cells[0], "th")}${cells.slice(1).map((r) => tr(r, "td")).join("")}</tbody></table>`;
}

/** Clipboard'dagi HTML haqiqiy kontentmi (matn yoki jadval) — unda rasm-fayldan ustun turadi (Word tanlovni rasm sifatida ham beradi) */
export function htmlHasContent(html: string): boolean {
  if (!html) return false;
  const doc = new DOMParser().parseFromString(html, "text/html");
  return !!(doc.body.textContent || "").trim() || !!doc.querySelector("table");
}

export function dataUrlToFile(src: string, name = "paste"): File | null {
  const m = src.match(/^data:(image\/[\w.+-]+);base64,(.+)$/);
  if (!m) return null;
  try {
    const bin = atob(m[2]);
    const buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    return new File([buf], `${name}.${m[1].split("/")[1].replace("jpeg", "jpg")}`, { type: m[1] });
  } catch {
    return null;
  }
}
