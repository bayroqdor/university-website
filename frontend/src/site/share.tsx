// Ulashish tugmalari va PDF yuklab olish
import { copyOrPrompt } from "../lib/clipboard";
import { Check, FileDown, Languages, Link2, Loader2, Mail, MessageCircle, Send, Share2 } from "lucide-react";
import { useState } from "react";
import type { Lang } from "../lib/api";
import { useSite } from "../lib/site";

/** Ulashiladigan havola: asosiy tildan boshqa tilda o'qilayotgan bo'lsa ?lang= bilan (qabul qiluvchi ham shu tilda ochadi). */
function usePageUrl(): string {
  const { lang, defaultLang } = useSite();
  if (typeof window === "undefined") return "";
  const u = window.location.origin + window.location.pathname;
  return lang === defaultLang ? u : `${u}?lang=${lang}`;
}

/** Tarjima yo'qligi haqida ogohlantirish. Boshqa tillar ro'yxati ko'rsatilmaydi — til almashtirilganda sahifa o'zi shu tilda ochiladi. */
export function LangNotice({ served }: { served?: Lang; langs?: Lang[] }) {
  const { t, lang } = useSite();
  if (!served || served === lang) return null;
  return (
    <div className="lang-notice warn">
      <Languages size={16} />
      <span className="lang-notice-text">{t.not_translated.replace("{lang}", t.lang_names[lang])}</span>
    </div>
  );
}

export function Share({ title, text = "", full = false }: { title: string; text?: string; full?: boolean }) {
  const { t } = useSite();
  const [copied, setCopied] = useState(false);
  const url = usePageUrl();
  const u = encodeURIComponent(url);
  const tt = encodeURIComponent(title);
  const native = typeof navigator !== "undefined" && typeof navigator.share === "function";
  const links: { href: string; label: string; icon: React.ReactNode; mono?: boolean }[] = [
    { href: `https://t.me/share/url?url=${u}&text=${tt}`, label: "Telegram", icon: <Send size={15} /> },
    { href: `https://wa.me/?text=${encodeURIComponent(`${title} ${url}`)}`, label: "WhatsApp", icon: <MessageCircle size={15} /> },
    { href: `https://www.linkedin.com/sharing/share-offsite/?url=${u}`, label: "LinkedIn", icon: "in", mono: true },
    { href: `https://twitter.com/intent/tweet?url=${u}&text=${tt}`, label: "X", icon: "𝕏", mono: true },
    { href: `https://www.facebook.com/sharer/sharer.php?u=${u}`, label: "Facebook", icon: "f", mono: true },
  ];
  if (full) links.push({ href: `mailto:?subject=${tt}&body=${encodeURIComponent(`${text ? text + "\n\n" : ""}${url}`)}`, label: t.share_email, icon: <Mail size={15} /> });
  return (
    <div className={`share ${full ? "full" : ""}`}>
      <span>{t.share}</span>
      {native && (
        <button className="native" onClick={() => navigator.share({ title, text: text || title, url }).catch(() => null)} aria-label={t.share_native} title={t.share_native}>
          <Share2 size={15} />
        </button>
      )}
      {links.map((l) => (
        <a key={l.label} href={l.href} target="_blank" rel="noopener noreferrer" aria-label={l.label} title={l.label} className={l.mono ? "mono" : ""}>
          {l.icon}
        </a>
      ))}
      <button
        onClick={() => {
          copyOrPrompt(url, t.copy_link).then((ok) => {
            if (!ok) return;
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          });
        }}
        aria-label={t.copy_link}
        title={copied ? t.copied : t.copy_link}
      >
        {copied ? <Check size={15} /> : <Link2 size={15} />}
      </button>
    </div>
  );
}

/** PDF'ni server tayyorlaydi (birinchi marta bir necha soniya); tugma shu vaqtda holatni ko'rsatadi. */
export function PdfButton({ section, slug, className = "" }: { section: string; slug: string; className?: string }) {
  const { t, lang } = useSite();
  const [state, setState] = useState<"idle" | "busy" | "error">("idle");
  const download = async () => {
    if (state === "busy") return;
    setState("busy");
    try {
      const r = await fetch(`/api/pdf/${section}/${encodeURIComponent(slug)}?lang=${lang}`);
      if (!r.ok) throw new Error(String(r.status));
      const name = /filename="([^"]+)"/.exec(r.headers.get("content-disposition") || "")?.[1] || `${slug}.pdf`;
      const blob = await r.blob();
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(href), 30_000);
      setState("idle");
    } catch {
      setState("error");
      setTimeout(() => setState("idle"), 5000);
    }
  };
  return (
    <span className={`pdf-wrap ${className}`}>
      <button className={`pdf-btn ${state}`} onClick={download} disabled={state === "busy"} data-cursor="">
        {state === "busy" ? <Loader2 size={16} className="spin" /> : <FileDown size={16} />}
        <span>{state === "busy" ? t.pdf_preparing : t.pdf_download}</span>
      </button>
      {state === "error" && <small className="pdf-err">{t.pdf_error}</small>}
    </span>
  );
}
