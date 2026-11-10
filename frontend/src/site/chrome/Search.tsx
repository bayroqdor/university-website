// Saytdan qidirish: yuqori menyudagi tugma → oyna (Ctrl+K yoki «/»), «/search?q=» sahifasi.
// Variantlar: bo'limlar va menyu bandlari (shu yerda, joriy tilda) + sahifalar va materiallar (API: yo'nalish, yangilik, e'lon, kafedra, xodim…).
import { useFocusTrap } from "../../a11y/focus";
import { ArrowUpRight, CornerDownLeft, Search, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { pub, type SiteHit } from "../../lib/api";
import { useSite } from "../../lib/site";
import { useNav } from "../Layout";

const norm = (s: string) =>
  s
    .replace(/[ʻʼ'`‘’]/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase();

type Hit = SiteHit & { group: "section" | "content"; external?: boolean };

/** Menyu va doimiy bo'limlar (davlat ramzlari, kutubxona, dars jadvali…) — joriy tilda */
function useSections(): { label: string; to: string; sub: string }[] {
  const nav = useNav();
  const { t } = useSite();
  return useMemo(() => {
    const out: { label: string; to: string; sub: string }[] = [];
    const seen = new Set<string>();
    const add = (label: string, to: string, sub: string) => {
      if (!label || !to || seen.has(to + label)) return;
      seen.add(to + label);
      out.push({ label, to, sub });
    };
    for (const n of nav) {
      add(n.label, n.to, "");
      for (const c of n.children || []) add(c.label, c.to, n.label);
    }
    for (const [label, to] of [
      [t.sym_title, "/symbols"],
      [t.sym_flag, "/symbols/flag"],
      [t.sym_emblem, "/symbols/emblem"],
      [t.sym_anthem, "/symbols/anthem"],
      [t.nav_programs, "/programs"],
      [t.nav_news, "/news"],
      [t.nav_announcements, "/announcements"],
      [t.nav_staff, "/staff"],
      [t.nav_faculties, "/faculties"],
      [t.nav_structure, "/structure"],
      [t.nav_schedule, "/schedule"],
      [t.nav_documents, "/documents"],
      [t.nav_partners, "/partners"],
      [t.nav_careers, "/careers"],
      [t.nav_contact, "/contact"],
      [t.nav_admission, "/admission"],
      [t.portal, "/login"],
    ] as [string, string][])
      add(label, to, "");
    return out;
  }, [nav, t]);
}

function matchSections(list: { label: string; to: string; sub: string }[], q: string): Hit[] {
  const words = norm(q).split(" ").filter(Boolean);
  if (!words.length) return [];
  return list
    .map((s) => {
      const l = norm(s.label);
      const all = norm(`${s.label} ${s.sub}`);
      const score = l.startsWith(words.join(" ")) ? 3 : words.every((w) => l.includes(w)) ? 2 : words.every((w) => all.includes(w)) ? 1 : 0;
      return { s, score };
    })
    .filter((x) => x.score)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .map(({ s }) => ({ type: "section", title: s.label, sub: s.sub, to: s.to, group: "section" as const, external: /^https?:/.test(s.to) }));
}

function Mark({ text, q }: { text: string; q: string }) {
  const w = norm(q).split(" ").filter((x) => x.length > 1)[0];
  if (!w) return <>{text}</>;
  const i = norm(text).indexOf(w);
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark>{text.slice(i, i + w.length)}</mark>
      {text.slice(i + w.length)}
    </>
  );
}

/** Natijalar: bo'limlar + materiallar (debounce bilan) */
function useSiteSearch(q: string, limit = 12) {
  const { lang } = useSite();
  const sections = useSections();
  const [res, setRes] = useState<SiteHit[] | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const s = q.trim();
    if (s.length < 2) {
      setRes(null);
      return;
    }
    setBusy(true);
    let alive = true;
    const h = window.setTimeout(() => {
      pub
        .search(s)
        .then((r) => alive && setRes(r.items))
        .catch(() => alive && setRes([]))
        .finally(() => alive && setBusy(false));
    }, 200);
    return () => {
      alive = false;
      window.clearTimeout(h);
    };
  }, [q, lang]);
  const secHits = useMemo(() => matchSections(sections, q), [sections, q]);
  const hits: Hit[] = [...secHits, ...(res || []).slice(0, limit).map((x) => ({ ...x, group: "content" as const }))];
  return { hits, secHits, res, busy };
}

function HitRow({ h, q, cur, onEnter, onPick }: { h: Hit; q: string; cur: boolean; onEnter: () => void; onPick: () => void }) {
  const { t } = useSite();
  const body = (
    <>
      <span className={`ss-type t-${h.type}`}>{t.sr_types[h.type] || h.type}</span>
      <span className="ss-txt">
        <b>
          <Mark text={h.title} q={q} />
        </b>
        {h.sub && <small>{h.sub}</small>}
      </span>
      {h.external ? <ArrowUpRight size={16} className="ss-go" /> : <CornerDownLeft size={16} className="ss-go" />}
    </>
  );
  const cls = `ss-row ${cur ? "cur" : ""}`;
  return h.external ? (
    <a className={cls} href={h.to} target="_blank" rel="noopener noreferrer" onMouseEnter={onEnter} onClick={onPick}>
      {body}
    </a>
  ) : (
    <Link className={cls} to={h.to} onMouseEnter={onEnter} onClick={onPick}>
      {body}
    </Link>
  );
}

function Groups({ hits, q, cur, setCur, onPick }: { hits: Hit[]; q: string; cur: number; setCur: (i: number) => void; onPick: () => void }) {
  const { t } = useSite();
  const out: ReactNode[] = [];
  let last = "";
  hits.forEach((h, i) => {
    if (h.group !== last) {
      out.push(
        <p key={"g" + h.group} className="ss-glabel">
          {h.group === "section" ? t.sr_sections : t.sr_content}
        </p>,
      );
      last = h.group;
    }
    out.push(<HitRow key={h.group + h.to + i} h={h} q={q} cur={i === cur} onEnter={() => setCur(i)} onPick={onPick} />);
  });
  return <>{out}</>;
}

/** Yuqori menyudagi qidiruv tugmasi va oynasi */
export function SearchButton() {
  const { t } = useSite();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = el?.tagName === "INPUT" || el?.tagName === "TEXTAREA" || el?.isContentEditable;
      if ((e.key === "k" && (e.ctrlKey || e.metaKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <>
      <button type="button" className="nb-search" onClick={() => setOpen(true)} aria-label={t.sr_title} title={`${t.sr_title} (Ctrl K)`}>
        <Search size={20} />
      </button>
      {open && <SearchDialog onClose={() => setOpen(false)} />}
    </>
  );
}

function SearchDialog({ onClose }: { onClose: () => void }) {
  const { t } = useSite();
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const [cur, setCur] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLDivElement>(null);
  useFocusTrap(box, true); // Tab oyna ichida, yopilganda fokus qidiruv tugmasiga qaytadi
  const { hits, res, busy } = useSiteSearch(q, 10);
  useEffect(() => {
    input.current?.focus();
    document.documentElement.classList.add("ss-lock");
    return () => document.documentElement.classList.remove("ss-lock");
  }, []);
  useEffect(() => setCur(0), [q]);
  const go = useCallback(
    (h: Hit) => {
      onClose();
      if (h.external) window.open(h.to, "_blank", "noopener");
      else nav(h.to);
    },
    [nav, onClose],
  );
  const site = document.querySelector(".site.uni") || document.body;
  return createPortal(
    <div className="ss-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="ss" role="dialog" aria-modal="true" aria-label={t.sr_title} ref={box} onKeyDown={(e) => e.key === "Escape" && e.target !== input.current && onClose()}>
        <div className="ss-field">
          <Search size={20} aria-hidden />
          <input
            ref={input}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t.sr_site_ph}
            aria-label={t.sr_site_ph}
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
              else if (e.key === "ArrowDown") {
                e.preventDefault();
                setCur((c) => Math.min(hits.length - 1, c + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setCur((c) => Math.max(0, c - 1));
              } else if (e.key === "Enter") {
                e.preventDefault();
                if (hits[cur]) go(hits[cur]);
                else if (q.trim().length >= 2) {
                  onClose();
                  nav(`/search?q=${encodeURIComponent(q.trim())}`);
                }
              }
            }}
          />
          {busy && <span className="ss-spin" aria-hidden />}
          <button type="button" className="ss-x" onClick={onClose} aria-label={t.close}>
            <X size={20} />
          </button>
        </div>
        <div className="ss-list">
          {q.trim().length < 2 ? (
            <p className="ss-none">{t.sr_hint}</p>
          ) : hits.length ? (
            <>
              <Groups hits={hits} q={q} cur={cur} setCur={setCur} onPick={onClose} />
              <Link className="ss-all" to={`/search?q=${encodeURIComponent(q.trim())}`} onClick={onClose}>
                {t.sr_all} <ArrowUpRight size={15} />
              </Link>
            </>
          ) : (
            res && !busy && <p className="ss-none">{t.no_results}</p>
          )}
        </div>
      </div>
    </div>,
    site,
  );
}

/** /search?q= — to'liq natijalar sahifasi */
export function SearchPage() {
  const { t } = useSite();
  const [params, setParams] = useSearchParams();
  const q = params.get("q") || "";
  const [text, setText] = useState(q);
  const { hits, res, busy } = useSiteSearch(q, 40);
  const [cur, setCur] = useState(-1);
  useEffect(() => setText(q), [q]);
  return (
    <section className="sec sr-page">
      <div className="wrap">
        <p className="ey">{t.sr_title}</p>
        <form
          className="sr-form"
          onSubmit={(e) => {
            e.preventDefault();
            setParams(text.trim() ? { q: text.trim() } : {});
          }}
        >
          <Search size={22} aria-hidden />
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder={t.sr_site_ph} aria-label={t.sr_site_ph} autoFocus />
          <button type="submit" className="bt bt-blue">
            {t.sr_title}
          </button>
        </form>
        {q.trim().length >= 2 && (
          <p className="sr-count">
            {busy && !res ? "…" : `${hits.length} ${t.sr_count}`}
          </p>
        )}
        <div className="ss-list sr-list">
          {q.trim().length >= 2 && hits.length > 0 && <Groups hits={hits} q={q} cur={cur} setCur={setCur} onPick={() => undefined} />}
          {q.trim().length >= 2 && res && !busy && !hits.length && <p className="ss-none">{t.no_results}</p>}
        </div>
      </div>
    </section>
  );
}
