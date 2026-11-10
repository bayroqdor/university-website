// Ochiq rasm bazasidan (Openverse) rasm qidirish: natijalar va kichik rasmlar sayt serveri orqali keladi,
// tanlangan rasm serverga ko'chiriladi va muallif / manba / litsenziya bilan qaytariladi.
import { Loader2, Search } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Btn, Modal } from "../admin/ui";
import { ApiError, req } from "../lib/api";

export interface OpenImage {
  id: string;
  title: string;
  width: number | null;
  height: number | null;
  creator: string;
  creator_url: string | null;
  source: string;
  source_url: string | null;
  license: string;
  license_url: string | null;
}
export interface ImportedImage {
  url: string;
  alt: string;
  credit: { creator: string; creator_url: string | null; source: string; source_url: string | null; license: string; license_url: string | null };
}
interface Page {
  items: OpenImage[];
  page: number;
  pages: number;
  total: number;
}

/** Admin panelida — admin sessiyasi, kabinetda (forum, blog) — kabinet sessiyasi */
export const openImgBase = () => (/^\/admin(\/|$)/.test(window.location.pathname) ? "/api/admin/media/openimg" : "/api/portal/openimg");

const ERR: Record<string, string> = {
  bad_query: "Kamida 2 ta belgi yozing",
  too_many_attempts: "So‘rovlar ko‘p, birozdan keyin urinib ko‘ring",
  provider_busy: "Rasm bazasi band, birozdan keyin urinib ko‘ring",
  provider_unavailable: "Rasm bazasiga ulanib bo‘lmadi",
  not_image: "Fayl rasm emas",
  too_large: "Rasm juda katta (15 MB dan ortiq)",
  fetch_failed: "Rasmni manbadan yuklab bo‘lmadi",
  not_found: "Rasm topilmadi",
};
const errText = (e: unknown) => (e instanceof ApiError ? ERR[e.detail] || e.detail : "Xatolik");

export function ImageSearch({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (r: ImportedImage) => void }) {
  const base = openImgBase();
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<OpenImage[]>([]);
  const [page, setPage] = useState(0);
  const [pages, setPages] = useState(0);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [busyId, setBusyId] = useState("");
  // manbasi javob bermagan rasmlar (kichik rasmi yuklanmadi) ro'yxatdan olib tashlanadi — ularni import ham qilib bo'lmaydi
  const [broken, setBroken] = useState<Set<string>>(() => new Set());
  const more = useRef<HTMLDivElement>(null);
  const seq = useRef(0);

  useEffect(() => {
    if (!open) {
      setBusyId("");
      setErr("");
    }
  }, [open]);

  const load = useCallback(
    async (text: string, p: number) => {
      const my = ++seq.current;
      setLoading(true);
      setErr("");
      try {
        const r = await req<Page>("GET", `${base}/search?q=${encodeURIComponent(text)}&page=${p}`);
        if (my !== seq.current) return;
        setItems((l) => (p === 1 ? r.items : [...l, ...r.items.filter((x) => !l.some((y) => y.id === x.id))]));
        setPage(r.page);
        setPages(r.pages);
      } catch (e) {
        if (my === seq.current) setErr(errText(e));
      } finally {
        if (my === seq.current) setLoading(false);
      }
    },
    [base],
  );

  const submit = () => {
    const t = q.trim();
    if (t.length < 2) return setErr(ERR.bad_query);
    setQuery(t);
    setItems([]);
    setPage(0);
    setPages(0);
    load(t, 1);
  };

  // pastga yetganda keyingi sahifa
  useEffect(() => {
    const el = more.current;
    if (!el || !query || loading || err || page >= pages) return;
    const io = new IntersectionObserver((es) => es.some((x) => x.isIntersecting) && load(query, page + 1), { rootMargin: "200px" });
    io.observe(el);
    return () => io.disconnect();
  }, [query, page, pages, loading, err, load]);

  const pick = async (it: OpenImage) => {
    if (busyId) return;
    setBusyId(it.id);
    setErr("");
    try {
      const r = await req<ImportedImage>("POST", `${base}/import`, { id: it.id });
      onPick(r);
      onClose();
    } catch (e) {
      setErr(errText(e));
    } finally {
      setBusyId("");
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Ochiq rasmlar (Openverse)" width={920}>
      <form
        className="oi-bar"
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          submit();
        }}
      >
        <input className="a-input" type="search" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Masalan: university, laboratory, Samarkand" maxLength={100} aria-label="Qidiruv" />
        <Btn type="submit" kind="primary" icon={<Search size={15} />} busy={loading && page === 0}>
          Qidirish
        </Btn>
      </form>
      {err && <div className="oi-err">{err}</div>}
      {query && (
        <div className="oi-grid" aria-busy={loading}>
          {items.filter((it) => !broken.has(it.id)).map((it) => (
            <button type="button" key={it.id} className={`oi-item ${busyId === it.id ? "busy" : ""}`} onClick={() => pick(it)} disabled={!!busyId} title={it.title}>
              <img src={`${base}/thumb/${encodeURIComponent(it.id)}`} alt={it.title} loading="lazy" onError={() => setBroken((b) => new Set(b).add(it.id))} />
              <small>
                {it.license} · {it.source}
              </small>
              {busyId === it.id && (
                <span className="oi-busy">
                  <Loader2 size={22} className="spin" />
                </span>
              )}
            </button>
          ))}
          {!loading && !err && !items.length && <p className="oi-empty">Hech narsa topilmadi</p>}
          <div ref={more} className="oi-more">
            {loading && page > 0 && <Loader2 size={20} className="spin" />}
          </div>
        </div>
      )}
    </Modal>
  );
}
