// Telegram'dagi ko'rinish: chat sarlavhasi, pufakcha (dumi bilan), albom/rasm/video/hujjat, matn (spoiler, iqtibos, kod), vaqt va
// ko'rishlar, inline tugmalar. Bu — admin panelda Telegram'ga o'xshashi shart bo'lgan yagona joy (ranglar Telegram'niki).
import DOMPurify from "dompurify";
import { ArrowUpRight, CheckCheck, Eye, FileText, Play } from "lucide-react";
import { useMemo, useState, type MouseEvent } from "react";
import type { TgButton, TgMedia } from "../api";

const ROWS: Record<number, number[]> = { 1: [1], 2: [2], 3: [1, 2], 4: [2, 2], 5: [2, 3], 6: [3, 3], 7: [2, 2, 3], 8: [2, 3, 3], 9: [3, 3, 3], 10: [2, 2, 3, 3] };

function clean(html: string): string {
  // blok (iqtibos, kod) dan keyingi bitta "\n" Telegram'da alohida bo'sh qator bermaydi — blok o'zi yangi qatordan boshlanadi/tugaydi
  html = html.replace(/(<\/blockquote>|<\/pre>)\n/g, "$1");
  return DOMPurify.sanitize(html, { ALLOWED_TAGS: ["b", "i", "u", "s", "a", "code", "pre", "blockquote", "tg-spoiler"], ALLOWED_ATTR: ["href", "class", "expandable"], CUSTOM_ELEMENT_HANDLING: { tagNameCheck: /^tg-spoiler$/, attributeNameCheck: /^$/, allowCustomizedBuiltInElements: false } });
}

const initials = (s: string) =>
  s
    .split(/\s+/)
    .filter((w) => /\p{L}|\p{N}/u.test(w))
    .slice(0, 2)
    .map((w) => Array.from(w)[0])
    .join("")
    .toUpperCase() || "T";

function fmtSize(n?: number): string {
  if (!n) return "";
  return n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
}

function Video({ src, className }: { src: string; className?: string }) {
  const [dur, setDur] = useState("");
  return (
    <div className={`tgp-vid ${className || ""}`}>
      <video
        src={src}
        muted
        preload="metadata"
        onLoadedMetadata={(e) => {
          const d = Math.round(e.currentTarget.duration || 0);
          setDur(d ? `${Math.floor(d / 60)}:${String(d % 60).padStart(2, "0")}` : "");
        }}
      />
      <span className="tgp-play">
        <Play size={22} fill="currentColor" />
      </span>
      {dur && <span className="tgp-dur">{dur}</span>}
    </div>
  );
}

function MediaBlock({ media }: { media: TgMedia[] }) {
  if (!media.length) return null;
  if (media.length === 1 && media[0].type === "document") {
    const m = media[0];
    const name = m.name || m.url.split("/").pop() || "fayl";
    return (
      <div className="tgp-doc">
        <span className="tgp-doc-ic">
          <FileText size={22} />
        </span>
        <span className="tgp-doc-t">
          <b>{name}</b>
          <small>{[fmtSize(m.size), (m.url.split(".").pop() || "").toUpperCase()].filter(Boolean).join(" · ")}</small>
        </span>
      </div>
    );
  }
  if (media.length === 1) {
    const m = media[0];
    return <div className="tgp-media one">{m.type === "video" ? <Video src={m.url} /> : <img src={m.url} alt="" />}</div>;
  }
  const rows = ROWS[Math.min(media.length, 10)] || [media.length];
  let i = 0;
  return (
    <div className="tgp-media album">
      {rows.map((n, r) => {
        const slice = media.slice(i, i + n);
        i += n;
        return (
          <div key={r} className={`tgp-row n${n} ${r === 0 && n === 1 ? "lead" : ""}`}>
            {slice.map((m, k) => (m.type === "video" ? <Video key={k} src={m.url} /> : <img key={k} src={m.url} alt="" />))}
          </div>
        );
      })}
    </div>
  );
}

export interface TgPreviewProps {
  html: string; // yakuniy matn (post osti matni bilan)
  media: TgMedia[];
  buttons: TgButton[][];
  chatTitle: string;
  chatType: "channel" | "group" | "supergroup" | string;
  linkPreview: boolean;
  time: string; // «14:32»
  edited?: boolean;
  members?: string;
}

export function TgPreview({ html, media, buttons, chatTitle, chatType, linkPreview, time, edited, members }: TgPreviewProps) {
  const safe = useMemo(() => clean(html), [html]);
  const channel = chatType === "channel";
  const firstLink = useMemo(() => {
    if (!linkPreview || media.length) return "";
    const m = /<a href="(https?:\/\/[^"]+)"/.exec(safe) || /(https?:\/\/[^\s<]+)/.exec(safe);
    try {
      return m ? new URL(m[1].replace(/&amp;/g, "&")).host.replace(/^www\./, "") : "";
    } catch {
      return "";
    }
  }, [safe, linkPreview, media.length]);
  const onClick = (e: MouseEvent<HTMLDivElement>) => {
    const t = e.target as HTMLElement;
    const sp = t.closest("tg-spoiler");
    if (sp) {
      sp.classList.toggle("open");
      return;
    }
    const q = t.closest("blockquote[expandable]");
    if (q) q.classList.toggle("open");
    const a = t.closest("a");
    if (a) {
      e.preventDefault();
      window.open(a.getAttribute("href") || "", "_blank", "noopener,noreferrer");
    }
  };
  const doc = media.length === 1 && media[0].type === "document";
  const hasMedia = media.length > 0 && !doc;
  const textEmpty = !safe.replace(/<[^>]+>/g, "").trim();
  return (
    <div className="tgp" data-no-tr="">
      <div className="tgp-head">
        <span className="tgp-ava">{initials(chatTitle)}</span>
        <span className="tgp-head-t">
          <b>{chatTitle}</b>
          <small>{members || (channel ? "kanal" : "guruh")}</small>
        </span>
      </div>
      <div className="tgp-chat">
        <div className={`tgp-msg ${hasMedia ? "has-media" : ""}`}>
          <div className={`tgp-bubble ${edited ? "edited" : ""} ${buttons.length ? "has-kb" : ""} ${hasMedia && textEmpty ? "media-only" : ""}`}>
            {channel && !hasMedia && <div className="tgp-from">{chatTitle}</div>}
            <MediaBlock media={media} />
            {!textEmpty && (
              <div className="tgp-text" onClick={onClick}>
                <span dangerouslySetInnerHTML={{ __html: safe }} />
                <span className="tgp-spacer" />
              </div>
            )}
            {firstLink && (
              <div className="tgp-wp">
                <b>{firstLink}</b>
              </div>
            )}
            <span className={`tgp-meta ${hasMedia && textEmpty ? "over" : ""}`}>
              {edited && <span>tahrirlangan</span>}
              {channel && (
                <>
                  <Eye size={13} />
                  <span>1</span>
                </>
              )}
              <span>{time}</span>
              {!channel && <CheckCheck size={14} />}
            </span>
            {!buttons.length && (
              <svg className="tgp-tail" width="11" height="20" viewBox="0 0 11 20" aria-hidden="true">
                <path d="M11 0v20H0c4.4-1.6 8.1-5.2 9.6-10.3C10.5 6.6 11 3.3 11 0Z" />
              </svg>
            )}
          </div>
          {buttons.length > 0 && (
            <div className="tgp-kb">
              {buttons.map((row, r) => (
                <div key={r} className="tgp-kb-row">
                  {row.map((b, k) => (
                    <a key={k} href={b.url} target="_blank" rel="noreferrer" className="tgp-kb-b" title={b.url}>
                      <span>{b.text || "…"}</span>
                      <ArrowUpRight size={11} />
                    </a>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
