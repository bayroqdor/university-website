// Matndan keyingi yolg'iz havolalar → tugma.
// Paragrafda faqat bitta qisqa havola bo'lsa (yoki ro'yxat faqat shunday havolalardan iborat bo'lsa), u oddiy tagi chizilgan so'z emas,
// ko'zga tashlanadigan tugma bo'lib chiqadi; ketma-ket kelganlari bitta qatorga yig'iladi. Matn ichidagi havolalarga tegilmaydi.
// <a> elementi o'z joyida qoladi (faqat klass va belgi qo'shiladi) — PDF/Drive «Ko'rish» tugmasi (a.nextElementSibling) shundayligicha ishlaydi.
import "../styles/linkbtn.css";

const MAX_LABEL = 80; // bundan uzun matn — tugma emas, oddiy havola

// lucide belgilari (lucide-react DOM uchun emas — yo'llar shu yerda)
const ICONS: Record<string, string> = {
  arrow: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
  external: '<path d="M7 7h10v10"/><path d="M7 17 17 7"/>',
  file: '<path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>',
  download: '<path d="M12 15V3"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/>',
  send: '<path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z"/><path d="m21.854 2.147-10.94 10.939"/>',
  mail: '<path d="m22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7"/><rect x="2" y="4" width="20" height="16" rx="2"/>',
  phone: '<path d="M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 6.392 6.384"/>',
};
const icon = (k: string) =>
  `<svg class="rl-ic" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICONS[k]}</svg>`;

// do'kon belgilari (rasmiy nishonlar uslubida, tashqi rasmsiz)
const PLAY =
  '<svg class="rl-store-ic" viewBox="0 0 24 24" width="26" height="26" aria-hidden="true" focusable="false">' +
  '<path fill="#4285F4" d="M1.337.924a1.486 1.486 0 0 0-.112.568v21.017c0 .217.045.419.124.6l11.155-11.087L1.337.924z"/>' +
  '<path fill="#34A853" d="M13.544 10.989l3.258-3.238L3.45.195a1.466 1.466 0 0 0-.946-.179l11.04 10.973z"/>' +
  '<path fill="#FBBC04" d="M22.018 13.298l-3.919 2.218-3.515-3.493 3.543-3.521 3.891 2.202a1.49 1.49 0 0 1 0 2.594z"/>' +
  '<path fill="#EA4335" d="M13.544 13.056l-11 10.933c.298.036.612-.016.906-.183l13.324-7.54-3.23-3.21z"/></svg>';
const APPLE =
  '<svg class="rl-store-ic" viewBox="0 0 24 24" width="26" height="26" aria-hidden="true" focusable="false"><path fill="currentColor" d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701"/></svg>';
type Kind = "play" | "apple" | "file" | "download" | "send" | "mail" | "phone" | "external" | "arrow";

function kindOf(a: HTMLAnchorElement): Kind {
  const href = a.getAttribute("href") || "";
  if (/^mailto:/i.test(href)) return "mail";
  if (/^tel:/i.test(href)) return "phone";
  let u: URL;
  try {
    u = new URL(href, window.location.href);
  } catch {
    return "arrow";
  }
  const host = u.hostname.replace(/^www\./, "");
  const path = u.pathname.toLowerCase();
  if (host === "play.google.com") return "play";
  if (host === "apps.apple.com" || host === "itunes.apple.com") return "apple";
  if (path.endsWith(".pdf") || host === "drive.google.com" || host === "docs.google.com") return "file";
  if (/\.(docx?|xlsx?|pptx?|odt|ods|zip|rar|7z)$/.test(path)) return "download";
  if (host === "t.me" || host === "telegram.me") return "send";
  return u.origin === window.location.origin ? "arrow" : "external";
}

/** Blok faqat bitta qisqa havoladan iboratmi? Bo'lsa — o'sha <a>. */
function soleLink(el: Element): HTMLAnchorElement | null {
  const links = el.querySelectorAll("a[href]");
  if (links.length !== 1) return null;
  const a = links[0] as HTMLAnchorElement;
  if (a.querySelector("img, svg, iframe, video") || el.querySelector("img, iframe, video, figure, table")) return null;
  const label = (a.textContent || "").replace(/\s+/g, " ").trim();
  if (!label || label.length > MAX_LABEL) return null;
  // havoladan tashqarida ma'noli matn bo'lmasligi kerak (bo'sh joy, <br>, qalin/kursiv o'rami — mumkin)
  const rest = (el.textContent || "").replace(a.textContent || "", "").replace(/[\s ]+/g, "");
  return rest ? null : a;
}

function decorate(a: HTMLAnchorElement) {
  if (a.classList.contains("rl-btn")) return;
  const k = kindOf(a);
  const label = (a.textContent || "").replace(/\s+/g, " ").trim();
  if (k === "play" || k === "apple") {
    // nishonda faqat belgi va do'kon nomi (havola matni) — ustida qo'shimcha yozuv yo'q
    a.className = `rl-btn rl-store rl-${k}`;
    a.innerHTML = `${k === "play" ? PLAY : APPLE}<b class="rl-store-t"></b>`;
    a.querySelector("b")!.textContent = label;
    return;
  }
  a.classList.add("rl-btn", `rl-${k}`);
  // matn o'z joyida qoladi, belgi oxiriga qo'shiladi (fayl/yuklab olish — oldiga)
  if (k === "file" || k === "download") a.insertAdjacentHTML("afterbegin", icon(k));
  else a.insertAdjacentHTML("beforeend", icon(k === "send" || k === "mail" || k === "phone" ? k : k === "external" ? "external" : "arrow"));
}

/** Tarkibning yuqori darajasidagi yolg'iz havolali paragraflar va havolalar ro'yxatini tugmalarga aylantiradi (takror chaqirilsa ham xavfsiz). */
export function linkButtons(root: HTMLElement) {
  let row: HTMLElement | null = null;
  let prev: Element | null = null;
  for (const el of Array.from(root.children)) {
    if (el.tagName === "P") {
      const a = soleLink(el);
      if (a) {
        decorate(a);
        el.classList.add("rl-item");
        // muharrirda tanlangan tekislash (markazda / o'ngda) tugmalar qatorida saqlanadi
        const align = (el as HTMLElement).style.textAlign;
        const justify = align === "center" ? "center" : align === "right" || align === "end" ? "flex-end" : "";
        // oldingi element ham shu tekislashdagi yolg'iz havola bo'lsa — bitta qatorga
        if (!row || prev !== row || row.style.justifyContent !== justify) {
          row = document.createElement("div");
          row.className = "rl-row";
          if (justify) row.style.justifyContent = justify;
          el.before(row);
        }
        row.appendChild(el);
        prev = row;
        continue;
      }
    } else if ((el.tagName === "UL" || el.tagName === "OL") && !el.classList.contains("rl-row")) {
      const items = Array.from(el.children);
      const links = items.map((li) => (li.tagName === "LI" ? soleLink(li) : null));
      if (items.length > 0 && links.every(Boolean)) {
        links.forEach((a) => decorate(a!));
        items.forEach((li) => li.classList.add("rl-item"));
        el.classList.add("rl-row", "rl-list");
      }
    }
    prev = el;
  }
}
