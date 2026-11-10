// Kutubxonachi paneli: statistika, fond (kitob kartochkasi, nusxalar, elektron fayllar), berish/qaytarish,
// navbat, qarzdorlar va jarimalar, izohlar moderatsiyasi, inventarizatsiya, hisobotlar va Excel import, sozlamalar, jurnal.
import {
  AlertTriangle, ArrowLeft, BarChart3, BookOpen, BookPlus, Check, ChevronLeft, ChevronRight, ClipboardList, Clock, Download, Eye, FileSpreadsheet, FileText, Globe2, Headphones, History, Library as LibIcon,
  ListChecks, Loader2, MessageSquare, Play, Plus, Receipt, RotateCcw, ScanBarcode, ScrollText, Search, Settings, Trash2, Upload, UserRound, Wand2, X,
} from "lucide-react";
import { Fragment, useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ApiError } from "../../lib/api";
import {
  fmtBytes, fmtDur, libAdmin, type AdminFile, type Book, type Copy, type Fine, type LibSettings, type LibStats, type OverdueItem, type QueueItem, type Reader, type SeedRow, type SeedStatus,
} from "../../library/api";
import { Cover } from "../../library/ui";
import { libCover, libDesk, libSeedAccess, normAccess, type AdminBook, type DeskOption, type DeskSuggestion, type FileAccess } from "../library-admin-api";
import "../../styles/library.css";
import { Btn, Card, Empty, Field, Input, Modal, PageHead, Pill, Select, Spinner, TagInput, Textarea, Toggle, fmtDateTime, fmtNum, useConfirm, useToast } from "../ui";

/* ------------------------------------------------------------------ umumiy */
const ERR: Record<string, string> = {
  copy_loaned: "Bu nusxa allaqachon berilgan",
  copy_not_found: "Nusxa topilmadi",
  copy_not_loaned: "Bu nusxa berilmagan",
  copy_reserved_other: "Nusxa boshqa o‘quvchi uchun ajratilgan",
  copy_repair: "Nusxa ta’mirda",
  copy_lost: "Nusxa yo‘qolgan deb belgilangan",
  copy_writtenoff: "Nusxa hisobdan chiqarilgan",
  has_fines: "O‘quvchida to‘lanmagan jarima bor",
  has_overdue: "O‘quvchida muddati o‘tgan kitob bor",
  limit_reached: "O‘quvchining kitoblar limiti to‘lgan",
  queue_first: "Bu kitobga navbat bor — avval navbatdagi o‘quvchiga beriladi",
  has_active_loans: "Kitobning berilgan nusxalari bor",
  inv_taken: "Bu inventar raqami band",
  reason_required: "Sababini yozing",
  title_required: "Kitob nomini kiriting",
  use_issue_return: "Bu holat berish/qaytarish orqali o‘zgaradi",
  isbn_not_found: "ISBN bo‘yicha ma’lumot topilmadi",
  isbn_lookup_failed: "ISBN xizmatiga ulanib bo‘lmadi",
  bad_isbn: "ISBN noto‘g‘ri",
  file_too_large: "Fayl hajmi juda katta",
  unsupported_type: "Faqat PDF, EPUB, MP3 yoki M4B fayl",
  pdf_encrypted: "PDF parol bilan himoyalangan",
  bad_epub: "EPUB fayl buzilgan",
  user_not_found: "O‘quvchi topilmadi",
  no_permission: "Bu amal uchun ruxsat yo‘q",
  not_found: "Topilmadi",
};
function errOf(e: unknown): string {
  const d = e instanceof ApiError ? e.detail : e instanceof Error ? e.message : String(e);
  const [code, arg] = d.split(":");
  return (ERR[code] || d) + (arg ? `: ${arg}` : "");
}
function useAct() {
  const toast = useToast();
  return useCallback(
    async <T,>(fn: () => Promise<T>, ok?: string): Promise<T | undefined> => {
      try {
        const r = await fn();
        if (ok) toast(ok);
        return r;
      } catch (e) {
        toast(errOf(e), "error");
        return undefined;
      }
    },
    [toast],
  );
}
const fmtD = (iso?: string | null) => (iso ? new Date(iso.length <= 10 ? iso + "T12:00:00" : iso).toLocaleDateString("ru-RU") : "—");
const STATUS: Record<Copy["status"], [string, "ok" | "warn" | "bad" | "muted" | "info" | "accent"]> = {
  available: ["Bo‘sh", "ok"],
  loaned: ["Berilgan", "info"],
  reserved: ["Bron", "accent"],
  repair: ["Ta’mirda", "warn"],
  lost: ["Yo‘qolgan", "bad"],
  writtenoff: ["Hisobdan chiqarilgan", "muted"],
};
const ROLE: Record<string, string> = { student: "Talaba", teacher: "O‘qituvchi", staff: "Xodim", admin: "Admin" };

type Tab = "" | "desk" | "books" | "open" | "queue" | "debtors" | "reviews" | "inventory" | "reports" | "settings" | "audit";
const TABS: [Tab, string, ReactNode][] = [
  ["", "Boshqaruv", <BarChart3 size={15} key="d" />],
  ["desk", "Berish / qaytarish", <ScanBarcode size={15} key="k" />],
  ["books", "Fond", <LibIcon size={15} key="b" />],
  ["open", "Ochiq fond", <Globe2 size={15} key="o" />],
  ["queue", "Navbat", <Clock size={15} key="q" />],
  ["debtors", "Qarzdorlar", <Receipt size={15} key="f" />],
  ["reviews", "Izohlar", <MessageSquare size={15} key="r" />],
  ["inventory", "Inventarizatsiya", <ListChecks size={15} key="i" />],
  ["reports", "Hisobotlar va import", <FileSpreadsheet size={15} key="x" />],
  ["settings", "Sozlamalar", <Settings size={15} key="s" />],
  ["audit", "Jurnal", <ScrollText size={15} key="a" />],
];

export default function LibraryAdmin() {
  const loc = useLocation();
  const parts = loc.pathname.replace(/^\/admin\/library\/?/, "").split("/").filter(Boolean);
  const tab = (parts[0] || "") as Tab;
  const [canEdit, setCanEdit] = useState(false);
  useEffect(() => {
    libAdmin
      .settings()
      .then((s) => setCanEdit(!!s.can_edit))
      .catch(() => null);
  }, []);
  if (tab === "books" && parts[1]) return <BookEditor id={parts[1] === "new" ? "" : parts[1]} />;
  return (
    <div className="a-page la">
      <PageHead title="Kutubxona" sub="Axborot-resurs markazi: fond, aylanma, elektron resurslar" actions={<a className="a-btn md" href="/library" target="_blank" rel="noreferrer"><Eye size={15} /><span>Katalogni ko‘rish</span></a>} />
      <nav className="la-tabs" aria-label="Kutubxona bo‘limlari">
        {TABS.filter(([k]) => canEdit || k !== "audit").map(([k, label, icon]) => (
          <Link key={k} to={`/admin/library${k ? `/${k}` : ""}`} className={tab === k ? "on" : ""}>
            {icon}
            <span>{label}</span>
          </Link>
        ))}
      </nav>
      {tab === "" && <Dashboard canEdit={canEdit} />}
      {tab === "desk" && <Desk />}
      {tab === "books" && <Books />}
      {tab === "open" && <OpenFund canEdit={canEdit} />}
      {tab === "queue" && <QueuePage />}
      {tab === "debtors" && <Debtors />}
      {tab === "reviews" && <Moderation />}
      {tab === "inventory" && <Inventory />}
      {tab === "reports" && <Reports />}
      {tab === "settings" && <SettingsPage />}
      {tab === "audit" && canEdit && <Audit />}
    </div>
  );
}

function Kpi({ icon, value, label, sub, tone }: { icon: ReactNode; value: ReactNode; label: string; sub?: string; tone?: "bad" | "warn" }) {
  return (
    <div className={`kpi ${tone ? `la-t-${tone}` : ""}`}>
      <div className="kpi-top">
        <span className="kpi-ic">{icon}</span>
      </div>
      <div className="kpi-v">{value}</div>
      <div className="kpi-l">{label}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  );
}

/* ================================================================== boshqaruv (statistika) */
function Dashboard({ canEdit }: { canEdit: boolean }) {
  const [days, setDays] = useState(30);
  const [s, setS] = useState<LibStats | null>(null);
  const act = useAct();
  useEffect(() => {
    libAdmin.stats(days).then(setS).catch(() => setS(null));
  }, [days]);
  if (!s) return <Spinner />;
  // bo'sh kunlar ham ko'rinsin (ko'pi bilan oxirgi 90 kun)
  const byDay = new Map(s.daily.map((d) => [d.day.slice(0, 10), d.issued]));
  const daily = Array.from({ length: Math.min(days, 90) }, (_, i) => {
    const day = new Date(Date.now() - (Math.min(days, 90) - 1 - i) * 86400000).toISOString().slice(0, 10);
    return { day, issued: byDay.get(day) || 0 };
  });
  const max = Math.max(1, ...daily.map((d) => d.issued));
  return (
    <>
      <div className="kpis la-kpis">
        <Kpi icon={<BookOpen size={17} />} value={s.today.issued} label="Bugun berildi" />
        <Kpi icon={<RotateCcw size={17} />} value={s.today.returned} label="Bugun qaytarildi" />
        <Kpi icon={<LibIcon size={17} />} value={s.today.on_loan} label="Hozir qo‘lda" />
        <Kpi icon={<AlertTriangle size={17} />} value={s.today.overdue} label="Muddati o‘tgan" tone={s.today.overdue ? "bad" : undefined} />
        <Kpi icon={<Clock size={17} />} value={s.today.queue} label="Navbat va bronlar" />
        <Kpi icon={<MessageSquare size={17} />} value={s.today.pending_reviews} label="Moderatsiyada" tone={s.today.pending_reviews ? "warn" : undefined} />
      </div>
      <div className="la-grid">
        <Card
          title="Kunlik berish"
          actions={
            <div className="a-seg">
              {[7, 30, 90, 365].map((d) => (
                <button key={d} className={days === d ? "on" : ""} onClick={() => setDays(d)}>
                  {d} kun
                </button>
              ))}
            </div>
          }
        >
          <div className="la-bars" role="img" aria-label="Kunlik berish">
            {daily.map((d) => (
              <span key={d.day} title={`${d.day}: ${d.issued}`}>
                <i style={{ height: `${(d.issued / max) * 100}%` }} />
              </span>
            ))}
          </div>
        </Card>
        <Card title="Fond">
          <div className="la-fund">
            <div>
              <b>{fmtNum(s.fund.books)}</b>
              <span>kitob nomi</span>
            </div>
            <div>
              <b>{fmtNum(s.fund.copies)}</b>
              <span>qog‘oz nusxa</span>
            </div>
            <div>
              <b>{fmtNum(s.fund.files)}</b>
              <span>elektron fayl</span>
            </div>
          </div>
          <div className="la-status">
            {Object.entries(s.fund.by_status).map(([k, n]) => (
              <Pill key={k} tone={STATUS[k as Copy["status"]]?.[1] || "muted"}>
                {STATUS[k as Copy["status"]]?.[0] || k}: {n}
              </Pill>
            ))}
          </div>
          {canEdit && (
            <div className="la-right">
              <Btn size="sm" kind="ghost" icon={<Play size={14} />} onClick={() => act(() => libAdmin.runJobs(), "Eslatmalar va navbat tekshirildi")}>
                Fon vazifalarini hozir ishga tushirish
              </Btn>
            </div>
          )}
        </Card>
      </div>
      <div className="la-grid3">
        <TopList title="Eng ko‘p olinganlar" items={s.top_borrowed} unit="marta" />
        <TopList title="Eng ko‘p o‘qilganlar (elektron)" items={s.top_read} unit="o‘quvchi" />
        <TopList title="Eng ko‘p tinglanganlar" items={s.top_listened} unit="tinglovchi" />
      </div>
      <div className="la-grid">
        <Card title="Kitob yetishmovchiligi" sub="Navbat nusxalardan ko‘p — qo‘shimcha xarid kerak">
          {s.shortage.length ? (
            <div className="a-table-scroll">
              <table className="a-table">
                <tbody>
                  {s.shortage.map((x) => (
                    <tr key={x.id}>
                      <td>
                        <Link to={`/admin/library/books/${x.id}`}>{x.title}</Link>
                      </td>
                      <td className="n">navbat {x.queue}</td>
                      <td className="n">nusxa {x.copies}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="a-hint">Yetishmovchilik yo‘q</p>
          )}
        </Card>
        <Card title="Bir yildan beri olinmagan" sub="Hisobdan chiqarish yoki boshqa joyga ko‘chirish uchun">
          {s.unused.length ? (
            <div className="a-table-scroll">
              <table className="a-table">
                <tbody>
                  {s.unused.slice(0, 12).map((x) => (
                    <tr key={x.id}>
                      <td>
                        <Link to={`/admin/library/books/${x.id}`}>{x.title}</Link>
                      </td>
                      <td className="n">{x.copies} nusxa</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="a-hint">Hammasi foydalanilmoqda</p>
          )}
        </Card>
      </div>
      <div className="la-grid">
        <Card title="Kafedra va kurslar bo‘yicha" sub={`Oxirgi ${days} kun`}>
          {s.by_faculty.length ? (
            <div className="a-table-scroll">
              <table className="a-table">
                <thead>
                  <tr>
                    <th>Kafedra</th>
                    <th className="n">Jami</th>
                    {[1, 2, 3, 4].map((c) => (
                      <th key={c} className="n">
                        {c}-kurs
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {s.by_faculty.map((x) => (
                    <tr key={x.faculty}>
                      <td>{x.faculty || "—"}</td>
                      <td className="n">{x.total}</td>
                      {[1, 2, 3, 4].map((c) => (
                        <td key={c} className="n">
                          {x.courses[String(c)] || 0}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="a-hint">Hali ma’lumot yo‘q</p>
          )}
        </Card>
        <Card title="Elektron fayllar" sub="Necha kishi ochdi va oxirigacha o‘qidi">
          {s.files.length ? (
            <div className="a-table-scroll">
              <table className="a-table">
                <tbody>
                  {s.files.slice(0, 12).map((x) => (
                    <tr key={x.id}>
                      <td>
                        {x.kind === "audio" ? <Headphones size={13} /> : <FileText size={13} />} {x.title}
                      </td>
                      <td className="n">{x.opened} ochdi</td>
                      <td className="n">{x.completed} tugatdi</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="a-hint">Hali ma’lumot yo‘q</p>
          )}
        </Card>
      </div>
    </>
  );
}

function TopList({ title, items, unit }: { title: string; items: { id: string; title: string; n: number }[]; unit: string }) {
  const max = Math.max(1, ...items.map((x) => x.n));
  return (
    <Card title={title}>
      {items.length ? (
        <ol className="la-top">
          {items.slice(0, 8).map((x) => (
            <li key={x.id}>
              <Link to={`/admin/library/books/${x.id}`}>{x.title}</Link>
              <span className="la-topbar">
                <i style={{ width: `${(x.n / max) * 100}%` }} />
              </span>
              <small>
                {x.n} {unit}
              </small>
            </li>
          ))}
        </ol>
      ) : (
        <p className="a-hint">Hali ma’lumot yo‘q</p>
      )}
    </Card>
  );
}

/* ================================================================== berish / qaytarish (skaner bilan) */
function Desk() {
  const act = useAct();
  const toast = useToast();
  const confirm = useConfirm();
  const [q, setQ] = useState("");
  const [found, setFound] = useState<Awaited<ReturnType<typeof libAdmin.readers>>["items"]>([]);
  const [reader, setReader] = useState<Reader | null>(null);
  const [code, setCode] = useState("");
  const [rcode, setRcode] = useState("");
  const [log, setLog] = useState<{ t: string; ok: boolean; at: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [lookup, setLookup] = useState<Awaited<ReturnType<typeof libAdmin.lookup>> | null>(null);
  const issueRef = useRef<HTMLInputElement>(null);
  const retRef = useRef<HTMLInputElement>(null);
  const push = (t: string, ok = true) => setLog((l) => [{ t, ok, at: new Date().toLocaleTimeString("ru-RU") }, ...l].slice(0, 30));
  useEffect(() => {
    const v = q.trim();
    if (v.length < 2) {
      setFound([]);
      return;
    }
    const t = window.setTimeout(() => libAdmin.readers(v).then((r) => setFound(r.items)).catch(() => setFound([])), 220);
    return () => window.clearTimeout(t);
  }, [q]);
  const pick = async (uid: string) => {
    const r = await act(() => libAdmin.reader(uid));
    if (r) {
      setReader(r);
      setFound([]);
      setQ("");
      window.setTimeout(() => issueRef.current?.focus(), 30);
    }
  };
  const issue = async (force = false) => {
    if (!reader || !code.trim()) return;
    setBusy(true);
    try {
      const r = await libAdmin.issue(reader.user.id, code.trim(), force);
      setReader(r.reader);
      push(`Berildi: «${r.loan.title}» (${r.loan.inv}) → ${reader.user.name}, ${fmtD(r.loan.due)} gacha`);
      toast("Kitob berildi");
      setCode("");
    } catch (e) {
      const d = e instanceof ApiError ? e.detail : "";
      if (["has_fines", "has_overdue", "limit_reached", "queue_first"].includes(d) && (await confirm(`${errOf(e)}. Baribir berilsinmi? (amal jurnalga yoziladi)`, false))) {
        setBusy(false);
        return issue(true);
      }
      push(errOf(e), false);
      toast(errOf(e), "error");
    } finally {
      setBusy(false);
      issueRef.current?.focus();
    }
  };
  const ret = async (lost = false, c = rcode) => {
    if (!c.trim()) return;
    if (lost && !(await confirm("Nusxa yo‘qolgan deb belgilansin va jarima hisoblansinmi?"))) return;
    setBusy(true);
    try {
      const r = await libAdmin.ret(c.trim(), lost);
      let t = `${lost ? "Yo‘qolgan deb belgilandi" : "Qaytarildi"}: «${r.loan.title}» (${r.loan.inv})${r.reader ? ` — ${r.reader.name}` : ""}`;
      if (r.late_days > 0) t += ` · ${r.late_days} kun kechikdi`;
      if (r.fine) t += ` · jarima ${fmtNum(r.fine.amount)}`;
      if (r.reserved_for_name) t += ` · ⚑ navbatdagi: ${r.reserved_for_name} uchun ajratildi`;
      push(t, !r.late_days && !lost);
      toast(r.reserved_for_name ? `Nusxani ${r.reserved_for_name} uchun alohida qo‘ying` : "Qabul qilindi");
      setRcode("");
      setLookup(null);
      if (reader && r.reader?.id === reader.user.id) setReader(await libAdmin.reader(reader.user.id));
    } catch (e) {
      push(errOf(e), false);
      toast(errOf(e), "error");
    } finally {
      setBusy(false);
      retRef.current?.focus();
    }
  };
  return (
    <div className="la-desk">
      <Card title="Kitob berish" sub="1) o‘quvchini toping  2) nusxa inventar raqami yoki shtrix-kodini skanerlang">
        {!reader ? (
          <div className="la-find">
            <label className="a-search">
              <Search size={16} />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ism, login, talaba ID yoki email…" autoFocus />
            </label>
            {found.length > 0 && (
              <div className="la-found">
                {found.map((u) => (
                  <button key={u.id} onClick={() => pick(u.id)}>
                    <span className="la-av">{u.photo ? <img src={u.photo} alt="" /> : u.name.slice(0, 1)}</span>
                    <span>
                      <b>{u.name}</b>
                      <small>
                        {ROLE[u.role] || u.role} · @{u.login}
                        {u.group ? ` · ${u.group}` : ""}
                        {u.student_no ? ` · ${u.student_no}` : ""}
                      </small>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <ReaderCard r={reader} onClose={() => setReader(null)} onReturn={(inv) => ret(false, inv)} />
        )}
        {reader && (
          <DeskCombo
            mode="issue"
            userId={reader.user.id}
            value={code}
            onValue={setCode}
            inputRef={issueRef}
            placeholder="Inventar raqami yoki kitob nomi"
            busy={busy}
            submitLabel="Berish"
            onSubmit={() => issue()}
          />
        )}
      </Card>
      <Card title="Qaytarib olish" sub="Nusxani skanerlang — kim olgani, kechikish va jarima avtomatik hisoblanadi">
        <DeskCombo
          mode="return"
          userId={reader?.user.id}
          value={rcode}
          onValue={(v) => {
            setRcode(v);
            setLookup(null);
          }}
          inputRef={retRef}
          placeholder="Inventar raqami yoki kitob nomi"
          busy={busy}
          submitLabel="Qabul qilish"
          onSubmit={() => ret()}
        />
        <div className="la-row">
          <Btn size="sm" kind="ghost" icon={<Search size={14} />} disabled={!rcode.trim()} onClick={async () => setLookup((await act(() => libAdmin.lookup(rcode.trim()))) || null)}>
            Nusxani tekshirish
          </Btn>
          <Btn size="sm" kind="danger" disabled={!rcode.trim()} onClick={() => ret(true)}>
            Yo‘qolgan deb belgilash
          </Btn>
        </div>
        {lookup && (
          <div className="la-lookup">
            <Cover title={lookup.book.title} src={lookup.book.cover} size="sm" />
            <div>
              <Link to={`/admin/library/books/${lookup.book.id}`}>
                <b>{lookup.book.title}</b>
              </Link>
              <small>
                {lookup.copy.inv} · {lookup.copy.location || "—"} · <Pill tone={STATUS[lookup.copy.status][1]}>{STATUS[lookup.copy.status][0]}</Pill>
              </small>
              {lookup.holder && (
                <small>
                  Kimda: <b>{lookup.holder.user.name}</b> · muddat {fmtD(lookup.holder.loan.due)}
                </small>
              )}
              {lookup.reserved_for && (
                <small>
                  Ajratilgan: <b>{lookup.reserved_for.name}</b> · {fmtD(lookup.reserved_for.expires)} gacha
                </small>
              )}
            </div>
          </div>
        )}
        <div className="la-log" aria-live="polite">
          {log.map((x, i) => (
            <div key={i} className={x.ok ? "" : "bad"}>
              <time>{x.at}</time> {x.t}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ berish / qaytarish: kitob nomi bo'yicha takliflar (3 belgidan) */
function DeskCombo({ mode, userId, value, onValue, inputRef, placeholder, busy, submitLabel, onSubmit }: {
  mode: "issue" | "return"; userId?: string; value: string; onValue: (v: string) => void; inputRef: RefObject<HTMLInputElement>;
  placeholder: string; busy: boolean; submitLabel: string; onSubmit: () => void;
}) {
  const [items, setItems] = useState<DeskSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [picked, setPicked] = useState<DeskSuggestion | null>(null);
  const seq = useRef(0);
  const typed = useRef(false); // faqat qo'lda yozilganda qidiriladi (tanlangan inventar raqami bo'yicha emas)
  const listId = useId();
  useEffect(() => {
    const v = value.trim();
    if (!v) setPicked(null);
    if (!typed.current || v.length < 3) {
      seq.current++;
      setItems([]);
      setOpen(false);
      setLoading(false);
      return;
    }
    const n = ++seq.current;
    setLoading(true);
    const t = window.setTimeout(() => {
      libDesk
        .suggest(v, mode, userId)
        .then((r) => {
          if (n !== seq.current) return;
          setItems(r.items);
          setActive(-1);
          setOpen(true);
        })
        .catch(() => n === seq.current && setItems([]))
        .finally(() => n === seq.current && setLoading(false));
    }, 250);
    return () => window.clearTimeout(t);
  }, [value, mode, userId]);
  useEffect(() => setPicked(null), [userId]);
  const choose = (b: DeskSuggestion) => {
    typed.current = false;
    setPicked(b);
    setOpen(false);
    setItems([]);
    onValue(b.options[0]?.inv || "");
    window.setTimeout(() => inputRef.current?.focus(), 0);
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" && items.length) {
      e.preventDefault();
      setOpen(true);
      setActive((a) => (a + 1) % items.length);
    } else if (e.key === "ArrowUp" && items.length) {
      e.preventDefault();
      setOpen(true);
      setActive((a) => (a <= 0 ? items.length - 1 : a - 1));
    } else if (e.key === "Enter" && open && active >= 0 && items[active]) {
      e.preventDefault();
      choose(items[active]);
    } else if (e.key === "Escape" && open) {
      e.preventDefault();
      setOpen(false);
    }
  };
  const optLabel = (o: DeskOption) =>
    mode === "issue"
      ? [o.location, o.status === "reserved" ? "shu o‘quvchiga ajratilgan" : ""].filter(Boolean).join(" · ")
      : `${o.loan?.user.name || "—"} · ${fmtD(o.loan?.due)}`;
  return (
    <div className="la-combo">
      <form
        className="la-scan"
        onSubmit={(e) => {
          e.preventDefault();
          setOpen(false);
          onSubmit();
        }}
      >
        <ScanBarcode size={20} />
        <div className="la-combo-in">
          <input
            ref={inputRef}
            value={value}
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
            onChange={(e) => {
              typed.current = true;
              setPicked(null);
              onValue(e.target.value);
            }}
            onKeyDown={onKey}
            onFocus={() => items.length > 0 && setOpen(true)}
            onBlur={() => window.setTimeout(() => setOpen(false), 120)}
            placeholder={placeholder}
            autoComplete="off"
          />
          {loading && <Loader2 className="spin la-combo-spin" size={15} />}
        </div>
        <Btn type="submit" kind="primary" busy={busy} disabled={!value.trim()}>
          {submitLabel}
        </Btn>
      </form>
      {open && (
        <div className="la-sugg" id={listId} role="listbox" aria-label="Kitoblar">
          {items.length === 0 ? (
            <div className="la-sugg-empty">{mode === "return" ? "Qo‘lda turgan bunday kitob yo‘q" : "Bunday kitob topilmadi"}</div>
          ) : (
            items.map((b, i) => (
              <div
                key={b.id}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                className={`la-sugg-it ${i === active ? "on" : ""}`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(b);
                }}
                onMouseEnter={() => setActive(i)}
              >
                <span className="la-sugg-cov">{b.cover ? <Cover title={b.title} src={b.cover} size="sm" /> : <BookOpen size={16} />}</span>
                <span className="la-sugg-main">
                  <b>{b.title}</b>
                  <small>{[b.authors.join(", "), b.year].filter(Boolean).join(" · ") || "—"}</small>
                </span>
                {mode === "issue" ? (
                  <span className={`la-sugg-n ${b.options.length ? "" : "none"}`}>{b.free} / {b.copies} bo‘sh</span>
                ) : (
                  <span className="la-sugg-n">{b.options.length} ta qo‘lda</span>
                )}
              </div>
            ))
          )}
        </div>
      )}
      {picked && (
        <div className="la-pick">
          <div className="la-pick-h">
            <span>
              <b>{picked.title}</b>
              <small>{mode === "issue" ? "Nusxani tanlang" : "Qaytarilayotgan nusxani tanlang"}</small>
            </span>
            <button type="button" className="a-icon" onClick={() => setPicked(null)} aria-label="Yopish" title="Yopish">
              <X size={14} />
            </button>
          </div>
          {picked.options.length === 0 ? (
            <p className="a-hint">{mode === "issue" ? "Bo‘sh nusxa yo‘q" : "Qo‘lda turgan nusxa yo‘q"}</p>
          ) : (
            <div className="la-pick-list" role="radiogroup" aria-label="Nusxa">
              {picked.options.map((o) => (
                <button
                  key={o.copy_id}
                  type="button"
                  role="radio"
                  aria-checked={value.trim() === o.inv}
                  className={`${value.trim() === o.inv ? "on" : ""} ${o.loan?.overdue ? "late" : ""}`}
                  onClick={() => {
                    onValue(o.inv);
                    inputRef.current?.focus();
                  }}
                >
                  <b className="la-mono">{o.inv}</b>
                  <small>{optLabel(o) || "—"}</small>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ReaderCard({ r, onClose, onReturn }: { r: Reader; onClose: () => void; onReturn: (inv: string) => void }) {
  const [hist, setHist] = useState<Awaited<ReturnType<typeof libAdmin.readerHistory>> | null>(null);
  return (
    <div className="la-reader">
      <div className="la-reader-h">
        <span className="la-av big">{r.user.photo ? <img src={r.user.photo} alt="" /> : r.user.name.slice(0, 1)}</span>
        <div>
          <b>{r.user.name}</b>
          <small>
            {ROLE[r.user.role] || r.user.role} · @{r.user.login}
            {r.user.group ? ` · ${r.user.group}` : ""}
            {r.user.course ? ` · ${r.user.course}-kurs` : ""}
            {r.user.student_no ? ` · ID ${r.user.student_no}` : ""}
          </small>
          <small>
            Limit: {r.loans.length}/{r.limit} · muddat {r.days} kun{r.unpaid > 0 ? ` · to‘lanmagan jarima: ${fmtNum(r.unpaid)}` : ""}
          </small>
        </div>
        <button className="a-icon" onClick={onClose} title="Boshqa o‘quvchi" aria-label="Boshqa o‘quvchi">
          <X size={16} />
        </button>
      </div>
      {r.problems.length > 0 && (
        <div className="la-warn">
          <AlertTriangle size={16} /> {r.problems.map((p) => ERR[p] || p).join(" · ")}
        </div>
      )}
      {r.loans.length > 0 && (
        <div className="a-table-scroll">
          <table className="a-table la-mini">
            <tbody>
              {r.loans.map((l) => (
                <tr key={l.id} className={l.overdue ? "la-late" : ""}>
                  <td>
                    <b>{l.title}</b>
                    <small>{l.inv}</small>
                  </td>
                  <td className="n">{fmtD(l.due)}</td>
                  <td className="n">
                    <Btn size="sm" onClick={() => onReturn(l.inv)}>
                      Qaytarish
                    </Btn>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {r.reservations.length > 0 && (
        <div className="la-resline">
          {r.reservations.map((x) => (
            <Pill key={x.id} tone={x.status === "ready" ? "ok" : "info"}>
              {x.status === "ready" ? "Ajratilgan" : `Navbat ${x.position}`}: {x.title}
            </Pill>
          ))}
        </div>
      )}
      <div className="la-row">
        <Btn size="sm" kind="ghost" icon={<History size={14} />} onClick={async () => setHist(await libAdmin.readerHistory(r.user.id))}>
          O‘quvchi tarixi
        </Btn>
        <a className="a-btn sm ghost" href={`/api/admin/library/reports/user.xlsx?uid=${r.user.id}`}>
          <Download size={14} />
          <span>Excel</span>
        </a>
      </div>
      <Modal open={!!hist} onClose={() => setHist(null)} title={`${r.user.name} — tarix`} width={720}>
        {hist && (
          <div className="a-table-scroll">
            <table className="a-table">
              <tbody>
                {hist.loans.map((l) => (
                  <tr key={l.id}>
                    <td>{l.title}</td>
                    <td>{l.inv}</td>
                    <td className="n">{fmtD(l.issued)}</td>
                    <td className="n">{l.returned ? fmtD(l.returned) : <Pill tone="info">qo‘lida</Pill>}</td>
                  </tr>
                ))}
                {hist.reading.map((p) => (
                  <tr key={p.file_id}>
                    <td>{p.title}</td>
                    <td>{(p.kind || "").toUpperCase()}</td>
                    <td className="n">{fmtD(p.updated)}</td>
                    <td className="n">{Math.round(p.percent)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Modal>
    </div>
  );
}

/* ================================================================== fond */
function Books() {
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const [fmt, setFmt] = useState("");
  const [page, setPage] = useState(1);
  const [d, setD] = useState<Awaited<ReturnType<typeof libAdmin.books>> | null>(null);
  const [imp, setImp] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => libAdmin.books({ q, format: fmt, page }).then(setD).catch(() => setD(null)), q ? 250 : 0);
    return () => window.clearTimeout(t);
  }, [q, fmt, page]);
  return (
    <>
      <div className="la-toolbar">
        <label className="a-search">
          <Search size={16} />
          <input value={q} onChange={(e) => (setQ(e.target.value), setPage(1))} placeholder="Nomi, muallif, ISBN, inventar…" />
        </label>
        <div className="a-seg">
          {[
            ["", "Hammasi"],
            ["paper", "Qog‘oz"],
            ["ebook", "Elektron"],
            ["audio", "Audio"],
          ].map(([v, l]) => (
            <button key={v} className={fmt === v ? "on" : ""} onClick={() => (setFmt(v), setPage(1))}>
              {l}
            </button>
          ))}
        </div>
        <span className="la-sp" />
        <Btn icon={<Upload size={15} />} onClick={() => setImp(true)}>
          Excel’dan import
        </Btn>
        <Btn kind="primary" icon={<BookPlus size={15} />} onClick={() => nav("/admin/library/books/new")}>
          Yangi kitob
        </Btn>
      </div>
      {!d ? (
        <Spinner />
      ) : !d.items.length ? (
        <Empty icon={<LibIcon size={28} />} title={q ? "Hech narsa topilmadi" : "Fond hali bo‘sh"}>
          {!q && "Kitoblarni birma-bir qo‘shing yoki Excel namunasini to‘ldirib import qiling."}
        </Empty>
      ) : (
        <Card pad={false}>
          <div className="a-table-scroll">
            <table className="a-table la-books">
              <thead>
                <tr>
                  <th />
                  <th>Kitob</th>
                  <th>Formatlar</th>
                  <th className="n">Nusxalar</th>
                  <th className="n">Baho</th>
                </tr>
              </thead>
              <tbody>
                {d.items.map((b) => (
                  <tr key={b.id} onClick={() => nav(`/admin/library/books/${b.id}`)} className="la-click">
                    <td className="la-cov">
                      <Cover title={b.title} src={b.cover} size="sm" />
                    </td>
                    <td>
                      <b>{b.title}</b>
                      <small>
                        {b.authors.join(", ")}
                        {b.year ? ` · ${b.year}` : ""}
                      </small>
                    </td>
                    <td>
                      <span className="la-fmts">
                        {b.formats.map((f) => (
                          <Pill key={f} tone={f === "paper" ? "muted" : "accent"}>
                            {f === "paper" ? "Qog‘oz" : f.toUpperCase()}
                          </Pill>
                        ))}
                      </span>
                    </td>
                    <td className="n">{b.copies ? `${b.free} / ${b.copies}` : "—"}</td>
                    <td className="n">{b.ratings ? `${b.rating.toFixed(1)} ★` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      {d && d.pages > 1 && (
        <div className="la-pager">
          <Btn size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            ‹
          </Btn>
          <span>
            {page} / {d.pages} · {fmtNum(d.total)} ta
          </span>
          <Btn size="sm" disabled={page >= d.pages} onClick={() => setPage(page + 1)}>
            ›
          </Btn>
        </div>
      )}
      <ImportModal open={imp} onClose={() => setImp(false)} onDone={() => libAdmin.books({ q, format: fmt, page }).then(setD)} />
    </>
  );
}

function ImportModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [res, setRes] = useState<Awaited<ReturnType<typeof libAdmin.importFile>> | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  return (
    <Modal open={open} onClose={() => (onClose(), setRes(null))} title="Qog‘oz fondni Excel orqali import qilish" width={640}>
      <ol className="la-steps">
        <li>
          <b>Namunani yuklab oling</b> — ustunlar: Nomi*, Muallif(lar), ISBN, Nashriyot, Yil, Til, Sahifalar, Fan/janr, Fakultet, Kalit so‘zlar, UDK, BBK, Annotatsiya, Narx, Nusxalar soni,
          Inventar raqamlari, Joylashuv, Muqova.
          <div>
            <a className="a-btn md" href="/api/admin/library/template.xlsx">
              <Download size={15} />
              <span>Namuna (.xlsx)</span>
            </a>
          </div>
        </li>
        <li>
          <b>To‘ldiring</b> — bir qator = bitta kitob. Inventar raqamlari bo‘lmasa, «Nusxalar soni» bo‘yicha avtomatik beriladi (UNI-000001…). Bir xil ISBN — mavjud kitobga nusxa qo‘shiladi.
        </li>
        <li>
          <b>Yuklang</b> (.xlsx yoki .csv)
          <label className="a-drop">
            {busy ? <Loader2 className="spin" size={22} /> : <Upload size={22} />}
            <b>Faylni tanlang</b>
            <span>30 MB gacha, 20 000 qatorgacha</span>
            <input
              type="file"
              accept=".xlsx,.csv"
              hidden
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f) return;
                setBusy(true);
                try {
                  const r = await libAdmin.importFile(f);
                  setRes(r);
                  onDone();
                } catch (er) {
                  toast(errOf(er), "error");
                } finally {
                  setBusy(false);
                }
              }}
            />
          </label>
        </li>
      </ol>
      {res && (
        <div className="la-impres">
          <div className="la-fund">
            <div>
              <b>{res.books}</b>
              <span>yangi kitob</span>
            </div>
            <div>
              <b>{res.copies}</b>
              <span>nusxa</span>
            </div>
            <div>
              <b>{res.merged}</b>
              <span>mavjudiga qo‘shildi</span>
            </div>
          </div>
          {res.skipped.length > 0 && (
            <details>
              <summary>O‘tkazib yuborilgan qatorlar: {res.skipped.length}</summary>
              <ul>
                {res.skipped.slice(0, 100).map((s) => (
                  <li key={s.row}>
                    {s.row}-qator: {ERR[s.reason] || s.reason}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </Modal>
  );
}

/* ------------------------------------------------------------------ kitob kartochkasi */
type BookForm = {
  title: string; subtitle: string; authors: string[]; isbn: string; publisher: string; year: string; lang: string; pages: string; cover: string; annotation: string;
  categories: string[]; faculties: string[]; keywords: string[]; udc: string; bbk: string; price: string; copies: string; location: string;
};
const emptyForm: BookForm = { title: "", subtitle: "", authors: [], isbn: "", publisher: "", year: "", lang: "uz", pages: "", cover: "", annotation: "", categories: [], faculties: [], keywords: [], udc: "", bbk: "", price: "", copies: "1", location: "" };
function toForm(b: Book): BookForm {
  // bazada bo'sh maydonlar null bo'lishi mumkin — forma uchun bo'sh satr
  const clean = Object.fromEntries(Object.entries(b).filter(([, v]) => v !== null && v !== undefined)) as Partial<Book>;
  return { ...emptyForm, ...clean, year: b.year ? String(b.year) : "", pages: b.pages ? String(b.pages) : "", price: b.price ? String(b.price) : "", copies: "0", location: "" };
}
function fromForm(f: BookForm) {
  return { ...f, year: f.year ? Number(f.year) : null, pages: f.pages ? Number(f.pages) : null, price: f.price ? Number(f.price) : null, copies: Number(f.copies || 0) };
}

type BookData = Awaited<ReturnType<typeof libAdmin.book>>;
function BookEditor({ id }: { id: string }) {
  const nav = useNavigate();
  const act = useAct();
  const toast = useToast();
  const confirm = useConfirm();
  const [d, setD] = useState<BookData | null>(null);
  const [f, setF] = useState<BookForm>(emptyForm);
  const [busy, setBusy] = useState(false);
  const [isbnBusy, setIsbnBusy] = useState(false);
  const [pendingCover, setPendingCover] = useState<File | null>(null);
  const [facets, setFacets] = useState<{ categories: string[]; faculties: string[] }>({ categories: [], faculties: [] });
  const load = useCallback(async () => {
    if (!id) return;
    const r = await libAdmin.book(id);
    setD(r);
    setF(toForm(r.book));
  }, [id]);
  useEffect(() => {
    setD(null);
    setF(emptyForm);
    load().catch(() => toast("Kitob topilmadi", "error"));
    libAdmin
      .books({ page: 1 })
      .then((r) => setFacets({ categories: r.facets.categories.map((c) => c.name), faculties: r.facets.faculties.map((c) => c.name) }))
      .catch(() => null);
  }, [id, load]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (p: Partial<BookForm>) => setF((x) => ({ ...x, ...p }));
  const save = async () => {
    if (!f.title.trim()) return toast("Kitob nomini kiriting", "error");
    setBusy(true);
    try {
      if (id) {
        await libAdmin.saveBook(id, fromForm(f));
        await load();
        toast("Saqlandi");
      } else {
        const b = await libAdmin.createBook(fromForm(f));
        if (pendingCover) await libCover.upload(b.id, pendingCover, pendingCover.name).catch((e) => toast(errOf(e), "error"));
        setPendingCover(null);
        toast("Kitob qo‘shildi");
        nav(`/admin/library/books/${b.id}`, { replace: true });
      }
    } catch (e) {
      toast(errOf(e), "error");
    } finally {
      setBusy(false);
    }
  };
  const fillIsbn = async () => {
    if (!f.isbn.trim()) return;
    setIsbnBusy(true);
    try {
      const r = await libAdmin.isbn(f.isbn.trim());
      setF((x) => ({
        ...x,
        isbn: r.isbn || x.isbn,
        title: x.title || r.title || "",
        subtitle: x.subtitle || r.subtitle || "",
        authors: x.authors.length ? x.authors : r.authors || [],
        publisher: x.publisher || r.publisher || "",
        year: x.year || (r.year ? String(r.year) : ""),
        pages: x.pages || (r.pages ? String(r.pages) : ""),
        lang: r.lang || x.lang,
        annotation: x.annotation || r.annotation || "",
        categories: x.categories.length ? x.categories : r.categories || [],
        cover: x.cover || r.cover || "",
      }));
      toast(`To‘ldirildi: ${r.source}`);
    } catch (e) {
      toast(errOf(e), "error");
    } finally {
      setIsbnBusy(false);
    }
  };
  if (id && !d) return <Spinner />;
  return (
    <div className="a-page la">
      <div className="la-back">
        <Link to="/admin/library/books">
          <ArrowLeft size={15} /> Fond
        </Link>
      </div>
      <PageHead
        title={id ? f.title || "Kitob" : "Yangi kitob"}
        sub={id && d ? `${d.availability.total} nusxa (${d.availability.free} bo‘sh) · ${d.files.length} elektron fayl${d.availability.queue ? ` · navbat ${d.availability.queue}` : ""}` : "Avval ISBN kiriting — ma’lumotlar avtomatik to‘ldiriladi"}
        actions={
          <>
            {id && (
              <a className="a-btn md" href={`/library/book/${id}`} target="_blank" rel="noreferrer">
                <Eye size={15} />
                <span>Saytda</span>
              </a>
            )}
            {id && (
              <Btn
                kind="danger"
                icon={<Trash2 size={15} />}
                title="Kitobni o‘chirish"
                onClick={async () => {
                  if (!(await confirm("Kitob, uning nusxalari, elektron fayllari va izohlari o‘chirilsinmi?"))) return;
                  if (await act(() => libAdmin.deleteBook(id), "O‘chirildi")) nav("/admin/library/books");
                }}
              />
            )}
            <Btn kind="primary" busy={busy} onClick={save}>
              Saqlash
            </Btn>
          </>
        }
      />
      <div className="la-edit">
        <div className="la-edit-main">
          <Card title="Bibliografik ma’lumot">
            <div className="a-form-grid">
              <Field label="ISBN" hint="Google Books / OpenLibrary’dan to‘ldiriladi">
                <div className="la-isbn">
                  <Input value={f.isbn} onChange={(e) => set({ isbn: e.target.value })} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), fillIsbn())} placeholder="978-9943-…" />
                  <Btn icon={<Wand2 size={15} />} busy={isbnBusy} onClick={fillIsbn} disabled={!f.isbn.trim()}>
                    To‘ldirish
                  </Btn>
                </div>
              </Field>
              <Field label="Til">
                <Select
                  value={f.lang}
                  onChange={(v) => set({ lang: v })}
                  options={[
                    { value: "uz", label: "O‘zbekcha" },
                    { value: "ru", label: "Ruscha" },
                    { value: "en", label: "Inglizcha" },
                    { value: "ko", label: "Koreyscha" },
                    { value: "other", label: "Boshqa" },
                  ]}
                />
              </Field>
              <Field label="Nomi *" wide>
                <Input value={f.title} onChange={(e) => set({ title: e.target.value })} />
              </Field>
              <Field label="Kichik sarlavha" wide>
                <Input value={f.subtitle} onChange={(e) => set({ subtitle: e.target.value })} />
              </Field>
              <Field label="Muallif(lar)" wide hint="Har birini yozib Enter bosing">
                <TagInput value={f.authors} onChange={(v) => set({ authors: v })} placeholder="Familiya Ism + Enter" />
              </Field>
              <Field label="Nashriyot">
                <Input value={f.publisher} onChange={(e) => set({ publisher: e.target.value })} />
              </Field>
              <div className="a-grid2">
                <Field label="Yil">
                  <Input type="number" value={f.year} onChange={(e) => set({ year: e.target.value })} />
                </Field>
                <Field label="Sahifalar">
                  <Input type="number" value={f.pages} onChange={(e) => set({ pages: e.target.value })} />
                </Field>
              </div>
              <Field label="Fan / janr" wide>
                <TagInput value={f.categories} onChange={(v) => set({ categories: v })} suggestions={facets.categories} placeholder="Masalan: Iqtisodiyot + Enter" />
              </Field>
              <Field label="Kafedra" wide>
                <TagInput value={f.faculties} onChange={(v) => set({ faculties: v })} suggestions={facets.faculties} />
              </Field>
              <Field label="Kalit so‘zlar" wide>
                <TagInput value={f.keywords} onChange={(v) => set({ keywords: v })} />
              </Field>
              <div className="a-grid3" style={{ gridColumn: "1 / -1" }}>
                <Field label="UDK">
                  <Input value={f.udc} onChange={(e) => set({ udc: e.target.value })} />
                </Field>
                <Field label="BBK">
                  <Input value={f.bbk} onChange={(e) => set({ bbk: e.target.value })} />
                </Field>
                <Field label="Narxi (yo‘qotilganda jarima uchun)">
                  <Input type="number" value={f.price} onChange={(e) => set({ price: e.target.value })} />
                </Field>
              </div>
              <Field label="Annotatsiya" wide>
                <Textarea rows={5} value={f.annotation} onChange={(e) => set({ annotation: e.target.value })} />
              </Field>
              {!id && (
                <div className="a-grid2" style={{ gridColumn: "1 / -1" }}>
                  <Field label="Qog‘oz nusxalar soni" hint="Inventar raqamlari avtomatik beriladi">
                    <Input type="number" min={0} value={f.copies} onChange={(e) => set({ copies: e.target.value })} />
                  </Field>
                  <Field label="Joylashuv (javon)">
                    <Input value={f.location} onChange={(e) => set({ location: e.target.value })} placeholder="Masalan: A-3 javon, 2-qavat" />
                  </Field>
                </div>
              )}
            </div>
          </Card>
          {id && d && <Copies bookId={id} d={d} reload={load} />}
          {id && d && <Files bookId={id} d={d} reload={load} />}
          {id && d && d.queue.length > 0 && (
            <Card title="Navbat">
              <QueueTable items={d.queue} reload={load} />
            </Card>
          )}
        </div>
        <aside className="la-edit-side">
          <CoverPanel
            id={id}
            d={d}
            cover={f.cover}
            title={f.title}
            pending={pendingCover}
            setPending={setPendingCover}
            onBook={(b) => {
              set({ cover: b.cover });
              setD((x) => (x ? { ...x, book: { ...x.book, cover: b.cover, cover_auto: b.cover_auto } as AdminBook } : x));
            }}
          />
          {id && d && d.rating.count > 0 && (
            <Card title="Baho">
              <p className="la-rate">
                <b>{d.rating.avg.toFixed(1)}</b> ★ · {d.rating.count} ta baho
              </p>
            </Card>
          )}
        </aside>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ muqova: rasm yuklash, elektron nashr sahifasi, avtomatik */
type CoverMode = "upload" | "page" | "auto";
const COVER_MODES: [CoverMode, string][] = [
  ["upload", "Rasm yuklash"],
  ["page", "Kitob sahifasi"],
  ["auto", "Avtomatik"],
];
function CoverPanel({ id, d, cover, title, pending, setPending, onBook }: {
  id: string; d: BookData | null; cover: string; title: string; pending: File | null; setPending: (f: File | null) => void; onBook: (b: AdminBook) => void;
}) {
  const act = useAct();
  const auto = !!(d?.book as AdminBook | undefined)?.cover_auto;
  const ebooks = (d?.files || []).filter((x) => x.kind === "pdf" || x.kind === "epub");
  const [mode, setMode] = useState<CoverMode>("upload");
  const [fid, setFid] = useState("");
  const file = ebooks.find((x) => x.id === fid) || ebooks[0];
  const max = file?.kind === "pdf" ? Math.max(1, file.pages || 1) : 1;
  const [page, setPage] = useState(1);
  const [shown, setShown] = useState(1);
  const [img, setImg] = useState<"load" | "ok" | "err">("load");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setShown(page), 300);
    return () => window.clearTimeout(t);
  }, [page]);
  const pg = file?.kind === "pdf" ? Math.min(shown, max) : 1;
  useEffect(() => setImg("load"), [file?.id, pg, mode]);
  const pendingUrl = useMemo(() => (pending ? URL.createObjectURL(pending) : ""), [pending]);
  useEffect(() => () => (pendingUrl ? URL.revokeObjectURL(pendingUrl) : undefined), [pendingUrl]);
  const run = async (fn: () => Promise<AdminBook>, ok: string) => {
    setBusy(true);
    const b = await act(fn, ok);
    setBusy(false);
    if (b) onBook(b);
  };
  const preview = pending ? pendingUrl : cover;
  return (
    <Card title="Muqova" className="la-coverpanel">
      <div className="la-cover">{preview ? <Cover title={title || "…"} src={preview} size="lg" /> : <span className="la-cover-none">Muqova yo‘q</span>}</div>
      {id && cover && <p className="la-cover-src">{auto ? "Avtomatik yaratilgan" : "Tanlangan rasm"}</p>}
      <div className="a-seg la-cover-seg" role="tablist" aria-label="Muqova manbasi">
        {COVER_MODES.map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={mode === k} className={mode === k ? "on" : ""} onClick={() => setMode(k)}>
            {l}
          </button>
        ))}
      </div>
      {mode === "upload" && (
        <>
          <label className={`a-drop ${busy ? "busy" : ""}`}>
            {busy ? <Loader2 className="spin" size={18} /> : <Upload size={18} />}
            <b>Rasm tanlash</b>
            <span>JPG, PNG, WEBP</span>
            <input
              type="file"
              accept="image/*"
              hidden
              disabled={busy}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                if (!id) return setPending(file);
                await run(() => libCover.upload(id, file, file.name), "Muqova yangilandi");
              }}
            />
          </label>
          {!id && pending && (
            <div className="la-right">
              <Btn size="sm" kind="ghost" icon={<X size={14} />} onClick={() => setPending(null)}>
                Rasmni olib tashlash
              </Btn>
            </div>
          )}
        </>
      )}
      {mode === "page" &&
        (!id ? (
          <p className="a-hint">Kitob saqlangandan keyin</p>
        ) : !file ? (
          <p className="a-hint">Kitobning PDF yoki EPUB versiyasi yo‘q</p>
        ) : (
          <div className="la-cpage">
            {ebooks.length > 1 && (
              <Select
                value={file.id}
                onChange={(v) => (setFid(v), setPage(1), setShown(1))}
                options={ebooks.map((x) => ({ value: x.id, label: `${x.kind.toUpperCase()} · ${x.title || x.orig}` }))}
              />
            )}
            {file.kind === "pdf" && (
              <div className="la-cpage-nav">
                <button type="button" className="a-icon" aria-label="Oldingi sahifa" title="Oldingi sahifa" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                  <ChevronLeft size={16} />
                </button>
                <label>
                  <span>Sahifa</span>
                  <input className="a-input" type="number" min={1} max={max} value={page} onChange={(e) => setPage(Math.min(max, Math.max(1, Number(e.target.value) || 1)))} />
                  <span>/ {max}</span>
                </label>
                <button type="button" className="a-icon" aria-label="Keyingi sahifa" title="Keyingi sahifa" disabled={page >= max} onClick={() => setPage((p) => Math.min(max, p + 1))}>
                  <ChevronRight size={16} />
                </button>
              </div>
            )}
            <div className={`la-cpage-img ${img}`}>
              <img key={`${file.id}-${pg}`} src={libCover.previewUrl(file.id, pg)} alt="" onLoad={() => setImg("ok")} onError={() => setImg("err")} />
              {img === "load" && <Loader2 className="spin" size={20} />}
              {img === "err" && <span>{file.kind === "epub" ? "EPUB ichida muqova rasmi yo‘q" : "Sahifani ochib bo‘lmadi"}</span>}
            </div>
            <Btn kind="primary" busy={busy} disabled={img !== "ok"} onClick={() => run(() => libCover.fromPage(id, file.id, pg), "Muqova yangilandi")}>
              Muqova qilish
            </Btn>
          </div>
        ))}
      {mode === "auto" &&
        (id ? (
          <div className="la-cauto">
            <Btn kind={auto ? "default" : "primary"} icon={<Wand2 size={15} />} busy={busy} onClick={() => run(() => libCover.auto(id), "Muqova yaratildi")}>
              {auto ? "Qayta yaratish" : "Avtomatik yaratish"}
            </Btn>
          </div>
        ) : (
          <p className="a-hint">Rasm tanlanmasa, muqova saqlashda avtomatik yaratiladi</p>
        ))}
    </Card>
  );
}

function Copies({ bookId, d, reload }: { bookId: string; d: BookData; reload: () => Promise<void> }) {
  const act = useAct();
  const confirm = useConfirm();
  const [add, setAdd] = useState({ count: "1", invs: "", location: "", price: "" });
  const [hist, setHist] = useState<{ copy: Copy; items: Awaited<ReturnType<typeof libAdmin.copyHistory>>["items"] } | null>(null);
  const [edit, setEdit] = useState<Copy | null>(null);
  return (
    <Card title={`Qog‘oz nusxalar (${d.copies.length})`} sub="Har bir nusxaning inventar raqami, shtrix-kodi, joyi va holati">
      {d.copies.length > 0 && (
        <div className="la-scroll">
          <div className="a-table-scroll">
            <table className="a-table la-copies">
              <thead>
                <tr>
                  <th>Inventar</th>
                  <th>Joylashuv</th>
                  <th>Holat</th>
                  <th>Kimda / izoh</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {d.copies.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <b className="la-mono">{c.inv}</b>
                      {c.barcode && c.barcode !== c.inv && <small className="la-mono">{c.barcode}</small>}
                    </td>
                    <td>{c.location || "—"}</td>
                    <td>
                      <Pill tone={STATUS[c.status][1]}>{STATUS[c.status][0]}</Pill>
                    </td>
                    <td>
                      {c.holder ? (
                        <>
                          <b>{c.holder.user.name}</b>
                          <small>muddat {fmtD(c.holder.due)}</small>
                        </>
                      ) : (
                        <small>{c.note || ""}</small>
                      )}
                    </td>
                    <td className="n la-acts">
                      <button className="a-icon" title="Tarix" aria-label="Tarix" onClick={async () => setHist({ copy: c, items: (await libAdmin.copyHistory(c.id)).items })}>
                        <History size={15} />
                      </button>
                      <button className="a-icon" title="Tahrirlash" aria-label="Tahrirlash" onClick={() => setEdit(c)}>
                        <Settings size={15} />
                      </button>
                      <button
                        className="a-icon"
                        title="O‘chirish"
                        aria-label="O‘chirish"
                        disabled={c.status === "loaned"}
                        onClick={async () => {
                          if (!(await confirm(`${c.inv} nusxa o‘chirilsinmi? (Odatda «Hisobdan chiqarilgan» holati afzal)`))) return;
                          if (await act(() => libAdmin.deleteCopy(c.id))) reload();
                        }}
                      >
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <div className="la-addcopies">
        <Field label="Soni">
          <Input type="number" min={0} value={add.count} onChange={(e) => setAdd({ ...add, count: e.target.value })} />
        </Field>
        <Field label="yoki inventar raqamlari" hint="vergul bilan">
          <Input value={add.invs} onChange={(e) => setAdd({ ...add, invs: e.target.value })} placeholder="UNI-000101, UNI-000102" />
        </Field>
        <Field label="Joylashuv">
          <Input value={add.location} onChange={(e) => setAdd({ ...add, location: e.target.value })} />
        </Field>
        <Btn
          icon={<Plus size={15} />}
          onClick={async () => {
            const r = await act(() => libAdmin.addCopies(bookId, { count: add.invs.trim() ? 0 : Number(add.count || 0), invs: add.invs, location: add.location, price: add.price ? Number(add.price) : null }), "Nusxalar qo‘shildi");
            if (r) {
              setAdd({ ...add, invs: "" });
              reload();
            }
          }}
        >
          Nusxa qo‘shish
        </Btn>
      </div>
      <Modal open={!!hist} onClose={() => setHist(null)} title={`${hist?.copy.inv} — kimlarda bo‘lgan`} width={620}>
        {hist && !hist.items.length && <p className="a-hint">Hali hech kimga berilmagan</p>}
        {hist && hist.items.length > 0 && (
          <div className="a-table-scroll">
            <table className="a-table">
              <tbody>
                {hist.items.map((l) => (
                  <tr key={l.id}>
                    <td>{l.user?.name || "(anonim)"}</td>
                    <td className="n">{fmtD(l.issued)}</td>
                    <td className="n">{l.returned ? fmtD(l.returned) : <Pill tone="info">qo‘lida</Pill>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Modal>
      {edit && <CopyEdit c={edit} onClose={() => setEdit(null)} onSaved={() => (setEdit(null), reload())} />}
    </Card>
  );
}

function CopyEdit({ c, onClose, onSaved }: { c: Copy; onClose: () => void; onSaved: () => void }) {
  const act = useAct();
  const [x, setX] = useState({ inv: c.inv, barcode: c.barcode || "", location: c.location || "", status: c.status, note: c.note || "", price: c.price ? String(c.price) : "" });
  return (
    <Modal
      open
      onClose={onClose}
      title={`Nusxa ${c.inv}`}
      width={520}
      footer={
        <>
          <Btn onClick={onClose}>Bekor qilish</Btn>
          <Btn kind="primary" onClick={async () => (await act(() => libAdmin.saveCopy(c.id, { ...x, price: x.price ? Number(x.price) : null }), "Saqlandi")) && onSaved()}>
            Saqlash
          </Btn>
        </>
      }
    >
      <div className="a-form-grid">
        <Field label="Inventar raqami">
          <Input value={x.inv} onChange={(e) => setX({ ...x, inv: e.target.value })} />
        </Field>
        <Field label="Shtrix-kod">
          <Input value={x.barcode} onChange={(e) => setX({ ...x, barcode: e.target.value })} />
        </Field>
        <Field label="Joylashuv">
          <Input value={x.location} onChange={(e) => setX({ ...x, location: e.target.value })} />
        </Field>
        <Field label="Holat">
          {c.status === "loaned" ? (
            <Pill tone="info">Berilgan — qaytarish orqali o‘zgaradi</Pill>
          ) : (
            <Select
              value={x.status}
              onChange={(v) => setX({ ...x, status: v })}
              options={(Object.keys(STATUS) as Copy["status"][]).filter((k) => k !== "loaned").map((k) => ({ value: k, label: STATUS[k][0] }))}
            />
          )}
        </Field>
        <Field label="Narxi">
          <Input type="number" value={x.price} onChange={(e) => setX({ ...x, price: e.target.value })} />
        </Field>
        <Field label="Izoh" wide>
          <Input value={x.note} onChange={(e) => setX({ ...x, note: e.target.value })} />
        </Field>
      </div>
    </Modal>
  );
}

// «Kimga ochiq»: hammaga — saytga kirmaganlar ham o'qiydi; ro'yxatdan o'tganlar — kitob sahifasini hamma ko'radi, o'qish uchun kirish kerak
const ACCESS: Record<FileAccess, string> = { registered: "Ro‘yxatdan o‘tganlar", public: "Hammaga", teachers: "Faqat o‘qituvchilar", faculty: "Faqat tanlangan kafedra(lar)" };
const ACCESS_OPTS = (Object.keys(ACCESS) as FileAccess[]).map((k) => ({ value: k, label: ACCESS[k] }));

function Files({ bookId, d, reload }: { bookId: string; d: BookData; reload: () => Promise<void> }) {
  const act = useAct();
  const toast = useToast();
  const confirm = useConfirm();
  const [up, setUp] = useState<{ name: string; p: number } | null>(null);
  const [meta, setMeta] = useState<{ title: string; access: FileAccess; faculty_ids: string[] }>({ title: "", access: "registered", faculty_ids: [] });
  const [faculties, setFaculties] = useState<{ id: string; title: string }[]>([]);
  useEffect(() => {
    fetch("/api/programs")
      .then((r) => r.json())
      .then((r) => setFaculties(r.faculties || []))
      .catch(() => null);
  }, []);
  const audioDuration = (file: File) =>
    new Promise<number>((res) => {
      const a = new Audio();
      a.preload = "metadata";
      a.onloadedmetadata = () => (res(isFinite(a.duration) ? Math.round(a.duration) : 0), URL.revokeObjectURL(a.src));
      a.onerror = () => res(0);
      a.src = URL.createObjectURL(file);
    });
  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    let n = d.files.filter((x) => x.kind === "audio").length;
    for (const file of Array.from(files)) {
      setUp({ name: file.name, p: 0 });
      try {
        const isAudio = /\.(mp3|m4a|m4b)$/i.test(file.name) || file.type.startsWith("audio/");
        const duration = isAudio ? await audioDuration(file) : undefined;
        await libAdmin.upload(bookId, file, { title: meta.title || (isAudio ? file.name.replace(/\.[^.]+$/, "") : ""), access: meta.access, faculty_ids: meta.faculty_ids.join(","), duration, sort: isAudio ? ++n : 0 }, (p) =>
          setUp({ name: file.name, p }),
        );
        toast(`Yuklandi: ${file.name}`);
      } catch (e) {
        toast(`${file.name}: ${errOf(e)}`, "error");
      }
    }
    setUp(null);
    setMeta({ ...meta, title: "" });
    reload();
  };
  return (
    <Card title={`Elektron versiyalar (${d.files.length})`} sub="PDF, EPUB va audiokitob (MP3/M4B, bob-bob). O‘quvchilar faylni yuklab olmasdan, saytda o‘qiydi/tinglaydi.">
      {d.files.length > 0 && (
        <div className="la-files">
          {d.files.map((x) => (
            <FileRow key={x.id} x={x} faculties={faculties} onSaved={reload} onDelete={async () => {
              if (!(await confirm(`«${x.title || x.orig}» o‘chirilsinmi? O‘quvchilarning o‘qish joyi va eslatmalari ham o‘chadi.`))) return;
              if (await act(() => libAdmin.deleteFile(x.id), "O‘chirildi")) reload();
            }} />
          ))}
        </div>
      )}
      <div className="la-upload">
        <div className="a-form-grid">
          <Field label="Sarlavha (ixtiyoriy)" hint="Masalan: «2-nashr» yoki «1-bob»">
            <Input value={meta.title} onChange={(e) => setMeta({ ...meta, title: e.target.value })} />
          </Field>
          <Field label="Kimga ochiq">
            <Select value={meta.access} onChange={(v) => setMeta({ ...meta, access: v })} options={ACCESS_OPTS} />
          </Field>
          {meta.access === "faculty" && (
            <Field label="Kafedralar" wide>
              <div className="a-checks">
                {faculties.map((fc) => (
                  <label key={fc.id}>
                    <input
                      type="checkbox"
                      checked={meta.faculty_ids.includes(fc.id)}
                      onChange={(e) => setMeta({ ...meta, faculty_ids: e.target.checked ? [...meta.faculty_ids, fc.id] : meta.faculty_ids.filter((y) => y !== fc.id) })}
                    />{" "}
                    {fc.title}
                  </label>
                ))}
              </div>
            </Field>
          )}
        </div>
        <label
          className={`a-drop big ${up ? "busy" : ""}`}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            if (!up) upload(e.dataTransfer.files);
          }}
        >
          {up ? (
            <>
              <Loader2 className="spin" size={22} />
              <b>{up.name}</b>
              <span className="la-upbar">
                <i style={{ width: `${Math.round(up.p * 100)}%` }} />
              </span>
              <span>{Math.round(up.p * 100)}%</span>
            </>
          ) : (
            <>
              <Upload size={22} />
              <b>Faylni shu yerga tashlang yoki tanlang</b>
              <span>PDF · EPUB · MP3 · M4B — bir nechtasini birdaniga (audio boblar tartib bilan)</span>
            </>
          )}
          <input type="file" accept=".pdf,.epub,.mp3,.m4a,.m4b,application/pdf,application/epub+zip,audio/*" multiple hidden disabled={!!up} onChange={(e) => (upload(e.target.files), (e.target.value = ""))} />
        </label>
      </div>
    </Card>
  );
}

function FileRow({ x, faculties, onSaved, onDelete }: { x: AdminFile; faculties: { id: string; title: string }[]; onSaved: () => void; onDelete: () => void }) {
  const act = useAct();
  const [title, setTitle] = useState(x.title);
  const icon = x.kind === "audio" ? <Headphones size={18} /> : x.kind === "epub" ? <BookOpen size={18} /> : <FileText size={18} />;
  const fnames = faculties.filter((f) => x.faculty_ids.includes(f.id)).map((f) => f.title);
  return (
    <div className={`la-file k-${x.kind}`}>
      <span className="la-file-ic">{icon}</span>
      <div className="la-file-main">
        <input
          className="la-file-t"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => title !== x.title && act(() => libAdmin.saveFile(x.id, { title }), "Saqlandi").then(onSaved)}
          aria-label="Sarlavha"
        />
        <small>
          {x.kind.toUpperCase()} · {fmtBytes(x.size)}
          {x.pages ? ` · ${x.pages} ${x.kind === "epub" ? "bob" : "sahifa"}` : ""}
          {x.duration ? ` · ${fmtDur(x.duration)}` : ""}
          {x.orig ? ` · ${x.orig}` : ""}
          {!x.indexed && x.kind !== "audio" ? " · matn indekslanmoqda…" : ""}
        </small>
      </div>
      <label className="la-access-f">
        <span>Kimga ochiq</span>
        <select
          className="a-input la-access"
          value={normAccess(x.access)}
          onChange={async (e) => (await act(() => libAdmin.saveFile(x.id, { access: e.target.value as FileAccess }), "Saqlandi")) && onSaved()}
          title={fnames.join(", ")}
        >
          {ACCESS_OPTS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <Link className="a-btn sm" to={`/admin/library/${x.kind === "audio" ? "listen" : "read"}/${x.id}`} target="_blank">
        <Eye size={14} />
        <span>Ko‘rish</span>
      </Link>
      <button className="a-icon" onClick={onDelete} title="O‘chirish" aria-label="O‘chirish">
        <Trash2 size={15} />
      </button>
    </div>
  );
}

/* ================================================================== navbat */
function QueueTable({ items, reload }: { items: QueueItem[]; reload: () => void }) {
  const act = useAct();
  const confirm = useConfirm();
  return (
    <div className="a-table-scroll">
      <table className="a-table">
        <thead>
          <tr>
            <th>Kitob</th>
            <th>O‘quvchi</th>
            <th>Holat</th>
            <th className="n">Yozilgan</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {items.map((x) => (
            <tr key={x.id}>
              <td>
                <Link to={`/admin/library/books/${x.book_id}`}>{x.title}</Link>
              </td>
              <td>
                {x.user.name}
                <small>@{x.user.login}</small>
              </td>
              <td>
                {x.status === "ready" ? (
                  <Pill tone="ok">
                    Ajratilgan {x.inv ? `(${x.inv})` : ""} · {fmtD(x.expires)} gacha
                  </Pill>
                ) : (
                  <Pill tone="info">{x.position}-o‘rin</Pill>
                )}
              </td>
              <td className="n">{fmtD(x.created)}</td>
              <td className="n">
                <Btn
                  size="sm"
                  kind="ghost"
                  onClick={async () => {
                    if (!(await confirm(`${x.user.name} bronini bekor qilasizmi?`))) return;
                    if (await act(() => libAdmin.cancelReservation(x.id), "Bekor qilindi")) reload();
                  }}
                >
                  Bekor qilish
                </Btn>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function QueuePage() {
  const [items, setItems] = useState<QueueItem[] | null>(null);
  const load = useCallback(() => libAdmin.queue().then((r) => setItems(r.items)).catch(() => setItems([])), []);
  useEffect(() => {
    load();
  }, [load]);
  if (!items) return <Spinner />;
  const ready = items.filter((x) => x.status === "ready");
  return (
    <>
      {ready.length > 0 && (
        <div className="la-note">
          <Check size={16} /> {ready.length} ta nusxa o‘quvchilar uchun ajratilgan — ularni alohida javonga qo‘ying. Muddati o‘tsa, navbat avtomatik keyingisiga o‘tadi.
        </div>
      )}
      {items.length ? (
        <Card pad={false}>
          <QueueTable items={items} reload={load} />
        </Card>
      ) : (
        <Empty icon={<Clock size={28} />} title="Navbat bo‘sh" />
      )}
    </>
  );
}

/* ================================================================== qarzdorlar va jarimalar */
function Debtors() {
  const [tab, setTab] = useState<"overdue" | "active" | "fines">("overdue");
  const [loans, setLoans] = useState<(OverdueItem & { overdue?: boolean })[] | null>(null);
  const [fines, setFines] = useState<{ items: Fine[]; currency: string } | null>(null);
  const [fst, setFst] = useState("unpaid");
  const [resolve, setResolve] = useState<{ f: Fine; status: "paid" | "waived" } | null>(null);
  const [note, setNote] = useState("");
  const act = useAct();
  const load = useCallback(() => {
    if (tab === "fines") libAdmin.fines(fst).then(setFines).catch(() => setFines({ items: [], currency: "" }));
    else libAdmin.loans(tab).then((r) => setLoans(r.items)).catch(() => setLoans([]));
  }, [tab, fst]);
  useEffect(() => {
    setLoans(null);
    load();
  }, [load]);
  return (
    <>
      <div className="la-toolbar">
        <div className="a-seg">
          <button className={tab === "overdue" ? "on" : ""} onClick={() => setTab("overdue")}>
            Muddati o‘tganlar
          </button>
          <button className={tab === "active" ? "on" : ""} onClick={() => setTab("active")}>
            Hamma berilganlar
          </button>
          <button className={tab === "fines" ? "on" : ""} onClick={() => setTab("fines")}>
            Jarimalar
          </button>
        </div>
        <span className="la-sp" />
        <a className="a-btn md" href={`/api/admin/library/reports/${tab === "fines" ? "fines" : "debtors"}.xlsx`}>
          <Download size={15} />
          <span>Excel</span>
        </a>
      </div>
      {tab !== "fines" &&
        (!loans ? (
          <Spinner />
        ) : !loans.length ? (
          <Empty icon={<Check size={28} />} title={tab === "overdue" ? "Qarzdorlar yo‘q" : "Hozir berilgan kitob yo‘q"} />
        ) : (
          <Card pad={false}>
            <div className="la-scroll">
              <div className="a-table-scroll">
                <table className="a-table">
                  <thead>
                    <tr>
                      <th>O‘quvchi</th>
                      <th>Kitob</th>
                      <th className="n">Berilgan</th>
                      <th className="n">Muddat</th>
                      {tab === "overdue" && <th className="n">Kechikish</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {loans.map((l) => (
                      <tr key={l.id} className={l.days > 0 || l.overdue ? "la-late" : ""}>
                        <td>
                          <b>{l.user?.name}</b>
                          <small>
                            @{l.user?.login}
                            {l.user?.phone ? ` · ${l.user.phone}` : ""}
                          </small>
                        </td>
                        <td>
                          <Link to={`/admin/library/books/${l.book_id}`}>{l.title}</Link>
                          <small className="la-mono">{l.inv}</small>
                        </td>
                        <td className="n">{fmtD(l.issued)}</td>
                        <td className="n">{fmtD(l.due)}</td>
                        {tab === "overdue" && (
                          <td className="n">
                            <Pill tone="bad">{l.days} kun</Pill>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </Card>
        ))}
      {tab === "fines" && (
        <>
          <div className="a-seg la-mb">
            {[
              ["unpaid", "To‘lanmagan"],
              ["paid", "To‘langan"],
              ["waived", "Kechirilgan"],
              ["", "Hammasi"],
            ].map(([v, l]) => (
              <button key={v} className={fst === v ? "on" : ""} onClick={() => setFst(v)}>
                {l}
              </button>
            ))}
          </div>
          {!fines ? (
            <Spinner />
          ) : !fines.items.length ? (
            <Empty icon={<Receipt size={28} />} title="Jarima yo‘q" />
          ) : (
            <Card pad={false}>
              <div className="a-table-scroll">
                <table className="a-table">
                  <thead>
                    <tr>
                      <th>Sana</th>
                      <th>O‘quvchi</th>
                      <th>Kitob</th>
                      <th className="n">Summa</th>
                      <th>Holat</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {fines.items.map((x) => (
                      <tr key={x.id}>
                        <td>{fmtD(x.created)}</td>
                        <td>{x.user?.name}</td>
                        <td>
                          {x.title}
                          <small>{x.kind === "lost" ? "Yo‘qolgan kitob" : "Kechikish"}</small>
                        </td>
                        <td className="n">
                          {fmtNum(x.amount)} {fines.currency}
                        </td>
                        <td>
                          <Pill tone={x.status === "unpaid" ? "bad" : x.status === "paid" ? "ok" : "muted"}>{x.status === "unpaid" ? "To‘lanmagan" : x.status === "paid" ? "To‘langan" : "Kechirilgan"}</Pill>
                          {x.note && <small>{x.note}</small>}
                        </td>
                        <td className="n la-acts">
                          {x.status === "unpaid" && (
                            <>
                              <Btn size="sm" onClick={() => (setResolve({ f: x, status: "paid" }), setNote(""))}>
                                To‘landi
                              </Btn>
                              <Btn size="sm" kind="ghost" onClick={() => (setResolve({ f: x, status: "waived" }), setNote(""))}>
                                Kechirish
                              </Btn>
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}
      <Modal
        open={!!resolve}
        onClose={() => setResolve(null)}
        title={resolve?.status === "paid" ? "To‘lov qabul qilindi" : "Jarimani kechirish"}
        width={460}
        footer={
          <>
            <Btn onClick={() => setResolve(null)}>Bekor qilish</Btn>
            <Btn
              kind="primary"
              disabled={!note.trim()}
              onClick={async () => {
                if (!resolve) return;
                if (await act(() => libAdmin.resolveFine(resolve.f.id, resolve.status, note.trim()), "Saqlandi")) {
                  setResolve(null);
                  load();
                }
              }}
            >
              Tasdiqlash
            </Btn>
          </>
        }
      >
        <p className="a-hint">
          {resolve?.f.user?.name} · {resolve?.f.title} · {fmtNum(resolve?.f.amount || 0)}
        </p>
        <Field label={resolve?.status === "paid" ? "Kvitansiya / izoh *" : "Kechirish sababi *"} hint="Sabab jurnalga yoziladi">
          <Input value={note} onChange={(e) => setNote(e.target.value)} autoFocus />
        </Field>
      </Modal>
    </>
  );
}

/* ================================================================== izohlar moderatsiyasi */
function Moderation() {
  const [items, setItems] = useState<Awaited<ReturnType<typeof libAdmin.reviews>>["items"] | null>(null);
  const act = useAct();
  const load = useCallback(() => libAdmin.reviews().then((r) => setItems(r.items)).catch(() => setItems([])), []);
  useEffect(() => {
    load();
  }, [load]);
  if (!items) return <Spinner />;
  if (!items.length) return <Empty icon={<MessageSquare size={28} />} title="Moderatsiya kutayotgan izoh yo‘q" />;
  const mod = async (id: string, status: "approved" | "hidden" | "rejected") => {
    let reason = "";
    if (status !== "approved") {
      reason = window.prompt(status === "hidden" ? "Yashirish sababi" : "Rad etish sababi") || "";
      if (!reason.trim()) return;
    }
    if (await act(() => libAdmin.moderate(id, status, reason), "Saqlandi")) load();
  };
  return (
    <div className="la-mod">
      {items.map((r) => (
        <Card key={r.id}>
          <div className="la-mod-h">
            <Link to={`/admin/library/books/${r.book_id}`}>
              <b>{r.book_title}</b>
            </Link>
            <Pill tone={r.status === "pending" ? "warn" : r.status === "approved" ? "ok" : "muted"}>{r.status === "pending" ? "Yangi" : r.status === "approved" ? "Chop etilgan" : r.status}</Pill>
            {r.reports > 0 && <Pill tone="bad">{r.reports} ta shikoyat</Pill>}
          </div>
          <p className="la-mod-t">{r.text}</p>
          <small className="a-hint">
            {r.author.name} (@{r.author.login}){r.anonymous ? " · anonim ko‘rinadi" : ""} · {fmtDateTime(r.created)}
          </small>
          <div className="la-row">
            {r.status !== "approved" && (
              <Btn size="sm" kind="primary" icon={<Check size={14} />} onClick={() => mod(r.id, "approved")}>
                Tasdiqlash
              </Btn>
            )}
            <Btn size="sm" onClick={() => mod(r.id, "hidden")}>
              Yashirish
            </Btn>
            <Btn size="sm" kind="danger" onClick={() => mod(r.id, "rejected")}>
              Rad etish
            </Btn>
          </div>
        </Card>
      ))}
    </div>
  );
}

/* ================================================================== inventarizatsiya */
function Inventory() {
  const [locs, setLocs] = useState<{ location: string; n: number }[]>([]);
  const [last, setLast] = useState<Record<string, unknown> | null>(null);
  const [loc, setLoc] = useState("");
  const [codes, setCodes] = useState<string[]>([]);
  const [cur, setCur] = useState("");
  const [res, setRes] = useState<Awaited<ReturnType<typeof libAdmin.inventory>> | null>(null);
  const [busy, setBusy] = useState(false);
  const act = useAct();
  const inp = useRef<HTMLInputElement>(null);
  useEffect(() => {
    libAdmin
      .locations()
      .then((r) => {
        setLocs(r.items);
        setLast(r.last);
        if (r.items[0]) setLoc(r.items[0].location);
      })
      .catch(() => null);
  }, []);
  const uniq = useMemo(() => [...new Set(codes)], [codes]);
  return (
    <div className="la-inv">
      <Card title="Javonni skanerlash" sub="Joylashuvni tanlang, javondagi har bir nusxani skanerlang (skaner Enter bosadi), so‘ng solishtiring">
        <div className="a-form-grid">
          <Field label="Joylashuv">
            <select className="a-input" value={loc} onChange={(e) => (setLoc(e.target.value), setRes(null))}>
              {locs.map((l) => (
                <option key={l.location} value={l.location}>
                  {l.location} ({l.n})
                </option>
              ))}
            </select>
          </Field>
          <Field label="Skaner">
            <form
              className="la-scan sm"
              onSubmit={(e) => {
                e.preventDefault();
                const v = cur.trim();
                if (v) setCodes((c) => [v, ...c]);
                setCur("");
              }}
            >
              <ScanBarcode size={18} />
              <input ref={inp} value={cur} onChange={(e) => setCur(e.target.value)} placeholder="Kod…" autoFocus autoComplete="off" />
            </form>
          </Field>
        </div>
        <Field label="yoki ro‘yxatni joylashtiring" hint="Har qatorda bitta kod (skaner faylidan nusxa)">
          <Textarea
            rows={3}
            onPaste={(e) => {
              const t = e.clipboardData.getData("text");
              const list = t.split(/[\s,;]+/).filter(Boolean);
              if (list.length > 1) {
                e.preventDefault();
                setCodes((c) => [...list, ...c]);
              }
            }}
            placeholder="UNI-000001&#10;UNI-000002"
          />
        </Field>
        <div className="la-row">
          <b>{uniq.length}</b> ta kod skanerlandi
          <span className="la-sp" />
          <Btn size="sm" kind="ghost" onClick={() => (setCodes([]), setRes(null), inp.current?.focus())}>
            Tozalash
          </Btn>
          <Btn
            kind="primary"
            busy={busy}
            disabled={!loc}
            onClick={async () => {
              setBusy(true);
              setRes((await act(() => libAdmin.inventory(loc, uniq))) || null);
              setBusy(false);
            }}
          >
            Solishtirish
          </Btn>
        </div>
        {uniq.length > 0 && (
          <div className="la-codes">
            {uniq.slice(0, 60).map((c) => (
              <span key={c}>{c}</span>
            ))}
            {uniq.length > 60 && <span>+{uniq.length - 60}</span>}
          </div>
        )}
      </Card>
      {res && (
        <Card
          title={`Natija: ${res.location}`}
          sub={`Kutilgan ${res.expected} · topildi ${res.found.length} · yo‘q ${res.missing.length} · boshqa joyniki ${res.foreign.length} · noma’lum ${res.unknown.length}`}
          actions={
            <a className="a-btn sm" href="/api/admin/library/reports/inventory.xlsx">
              <Download size={14} />
              <span>Excel</span>
            </a>
          }
        >
          <div className="la-invres">
            <InvList title="Ro‘yxatda bor, javonda yo‘q" tone="bad" items={res.missing.map((c) => `${c.inv} — ${c.title}`)} />
            <InvList title="Boshqa joyga tegishli" tone="warn" items={res.foreign.map((c) => `${c.inv} — ${c.title} (${c.location || "—"})`)} />
            <InvList title="Noma’lum kodlar" tone="muted" items={res.unknown} />
          </div>
        </Card>
      )}
      {!res && last && (
        <p className="a-hint">
          Oxirgi inventarizatsiya: {String(last.location || "—")} · {fmtDateTime(String(last.at || ""))}
        </p>
      )}
    </div>
  );
}
function InvList({ title, items, tone }: { title: string; items: string[]; tone: "bad" | "warn" | "muted" }) {
  return (
    <div className={`la-invlist t-${tone}`}>
      <b>
        {title} <i>{items.length}</i>
      </b>
      {items.length ? (
        <ul>
          {items.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      ) : (
        <p className="a-hint">—</p>
      )}
    </div>
  );
}

/* ================================================================== hisobotlar */
/* ------------------------------------------------------------------ ochiq fond (erkin litsenziyali kitoblar va audiokitoblar) */
const SEED_ST: Record<SeedRow["status"], [string, "ok" | "warn" | "bad" | "muted" | "info" | "accent"]> = {
  done: ["Fondda", "ok"],
  partial: ["Qisman", "warn"],
  pending: ["Kutilmoqda", "muted"],
  deleted: ["O‘chirilgan", "muted"],
  error: ["Xato", "bad"],
};
const LANG_SHORT: Record<string, string> = { uz: "O‘zbek", ru: "Rus", en: "Ingliz" };
const KIND_ICON: Record<string, ReactNode> = { pdf: <FileText size={14} />, epub: <BookOpen size={14} />, audio: <Headphones size={14} /> };

function OpenFund({ canEdit }: { canEdit: boolean }) {
  const nav = useNavigate();
  const act = useAct();
  const [d, setD] = useState<SeedStatus | null>(null);
  const [lang, setLang] = useState("");
  const load = useCallback(() => libAdmin.seed().then(setD).catch(() => setD(null)), []);
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    if (!d?.running) return;
    const t = window.setInterval(load, 2000);
    return () => window.clearInterval(t);
  }, [d?.running, load]);
  if (!d) return <Spinner />;
  const rows = d.items.filter((r) => !lang || r.lang === lang);
  const count = (s: SeedRow["status"]) => d.items.filter((r) => r.status === s).length;
  const left = d.items.filter((r) => r.status === "pending" || r.status === "partial" || r.status === "error").length;
  const total = d.items.reduce((a, r) => a + r.size, 0);
  const by = (k: string) => d.items.filter((r) => r.kinds.includes(k)).length;
  const start = (body: { keys?: string[]; restore?: boolean } = {}) => act(() => libAdmin.seedStart(body)).then((r) => r && setD(r));
  return (
    <>
      <Card
        title="Ochiq fond"
        sub="Erkin litsenziyali va jamoat mulki bo‘lgan kitoblar, darsliklar va audiokitoblar: manbadan yuklab olinadi va oddiy elektron resurs sifatida fondga qo‘shiladi. Har bir kitob kartochkasida manba va litsenziya ko‘rsatiladi."
        actions={
          canEdit &&
          (d.running ? (
            <Btn icon={<X size={15} />} onClick={() => act(() => libAdmin.seedStop()).then(() => window.setTimeout(load, 800))}>
              To‘xtatish
            </Btn>
          ) : (
            <Btn kind="primary" icon={<Download size={15} />} disabled={!left} onClick={() => start()}>
              {left ? `Yuklash (${left})` : "Hammasi yuklangan"}
            </Btn>
          ))
        }
      >
        <div className="la-seed-kpi">
          <span><b>{fmtNum(d.items.length)}</b> nom</span>
          <span><b>{fmtNum(count("done"))}</b> fondda</span>
          <span><b>{fmtNum(by("pdf"))}</b> PDF</span>
          <span><b>{fmtNum(by("epub"))}</b> EPUB</span>
          <span><b>{fmtNum(by("audio"))}</b> audiokitob</span>
          <span><b>{fmtBytes(total)}</b> jami</span>
        </div>
        <label className="la-seed-access">
          <span>Kimga ochiq</span>
          <select
            className="a-input"
            value={(d as SeedStatus & { access?: string }).access === "public" ? "public" : "registered"}
            disabled={!canEdit}
            onChange={async (e) => {
              const v = e.target.value as "public" | "registered";
              const r = await act(() => libSeedAccess.save(v), "Saqlandi");
              if (r) load();
            }}
          >
            <option value="registered">Ro‘yxatdan o‘tganlar</option>
            <option value="public">Hammaga</option>
          </select>
        </label>
        {d.running && (
          <div className="la-seed-run" role="status">
            <div className="la-seed-bar"><i style={{ width: `${d.total ? Math.round((d.done / d.total) * 100) : 0}%` }} /></div>
            <small>
              <Loader2 size={13} className="spin" /> {d.done} / {d.total} · {fmtBytes(d.bytes)} yuklandi{d.current ? ` · ${d.current}` : ""}
            </small>
          </div>
        )}
      </Card>
      <div className="la-toolbar">
        <div className="a-seg">
          {[["", "Hammasi"], ["uz", "O‘zbek"], ["ru", "Rus"], ["en", "Ingliz"]].map(([v, l]) => (
            <button key={v} className={lang === v ? "on" : ""} onClick={() => setLang(v)}>
              {l} <small>{v ? d.items.filter((r) => r.lang === v).length : d.items.length}</small>
            </button>
          ))}
        </div>
      </div>
      {!rows.length ? (
        <Empty icon={<Globe2 size={28} />} title="Ro‘yxat bo‘sh" />
      ) : (
        <Card pad={false}>
          <div className="a-table-scroll">
            <table className="a-table la-seed">
              <thead>
                <tr>
                  <th>Kitob</th>
                  <th>Til</th>
                  <th>Formatlar</th>
                  <th>Manba va litsenziya</th>
                  <th className="n">Hajmi</th>
                  <th>Holati</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key}>
                    <td>
                      <b>{r.title}</b>
                      <small>{r.authors.join(", ")}</small>
                    </td>
                    <td>{LANG_SHORT[r.lang] || r.lang}</td>
                    <td className="la-seed-kinds">
                      {r.kinds.map((k) => (
                        <span key={k} title={k}>
                          {KIND_ICON[k]}
                          {k === "audio" ? `${r.files} bob` : k.toUpperCase()}
                        </span>
                      ))}
                    </td>
                    <td>
                      {r.source}
                      <small>{r.license}</small>
                    </td>
                    <td className="n">{r.size ? fmtBytes(r.size) : "—"}</td>
                    <td>
                      <Pill tone={SEED_ST[r.status][1]}>{SEED_ST[r.status][0]}</Pill>
                      {r.error && <small className="la-seed-err" title={r.error}>{r.error}</small>}
                    </td>
                    <td className="la-seed-act">
                      {r.book_id ? (
                        <Btn size="sm" kind="ghost" icon={<Eye size={14} />} onClick={() => nav(`/admin/library/books/${r.book_id}`)}>
                          Ochish
                        </Btn>
                      ) : null}
                      {canEdit && !d.running && r.status !== "done" && (
                        <Btn size="sm" icon={<RotateCcw size={14} />} onClick={() => start({ keys: [r.key], restore: true })}>
                          {r.status === "deleted" ? "Tiklash" : "Yuklash"}
                        </Btn>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}

function Reports() {
  const [days, setDays] = useState("30");
  const [imp, setImp] = useState(false);
  const R = ({ icon, title, sub, href }: { icon: ReactNode; title: string; sub: string; href: string }) => (
    <a className="la-report" href={href}>
      <span className="la-report-ic">{icon}</span>
      <span>
        <b>{title}</b>
        <small>{sub}</small>
      </span>
      <Download size={16} />
    </a>
  );
  return (
    <>
      <div className="la-reports">
        <R icon={<AlertTriangle size={18} />} title="Qarzdorlar ro‘yxati" sub="Muddati o‘tgan kitoblar, telefon raqami bilan" href="/api/admin/library/reports/debtors.xlsx" />
        <R icon={<Receipt size={18} />} title="Jarimalar jurnali" sub="Hamma jarimalar va holati" href="/api/admin/library/reports/fines.xlsx" />
        <R icon={<LibIcon size={18} />} title="Fond ro‘yxati" sub="Barcha kitoblar, nusxalar va formatlar" href="/api/admin/library/reports/fund.xlsx" />
        <R icon={<ListChecks size={18} />} title="Oxirgi inventarizatsiya" sub="Topilmagan va boshqa joydagi nusxalar" href="/api/admin/library/reports/inventory.xlsx" />
      </div>
      <Card title="Kitob aylanmasi" sub="Tanlangan davrda berilgan va qaytarilgan kitoblar">
        <div className="la-row">
          <div className="a-seg">
            {["7", "30", "90", "365"].map((d) => (
              <button key={d} className={days === d ? "on" : ""} onClick={() => setDays(d)}>
                {d} kun
              </button>
            ))}
          </div>
          <a className="a-btn md primary" href={`/api/admin/library/reports/circulation.xlsx?days=${days}`}>
            <Download size={15} />
            <span>Excel</span>
          </a>
        </div>
      </Card>
      <Card title="Qog‘oz fondni Excel orqali import" sub="Namunani yuklab oling, to‘ldiring va yuklang — kitoblar va nusxalar avtomatik yaratiladi">
        <div className="la-row">
          <a className="a-btn md" href="/api/admin/library/template.xlsx">
            <Download size={15} />
            <span>Namuna (.xlsx)</span>
          </a>
          <Btn kind="primary" icon={<Upload size={15} />} onClick={() => setImp(true)}>
            Import
          </Btn>
        </div>
      </Card>
      <ImportModal open={imp} onClose={() => setImp(false)} onDone={() => null} />
    </>
  );
}

/* ================================================================== sozlamalar */
function SettingsPage() {
  const [s, setS] = useState<LibSettings | null>(null);
  const act = useAct();
  useEffect(() => {
    libAdmin.settings().then(setS).catch(() => null);
  }, []);
  if (!s) return <Spinner />;
  const ro = !s.can_edit;
  const num = (k: keyof LibSettings, label: string, hint?: string, step = 1) => (
    <Field label={label} hint={hint}>
      <Input type="number" step={step} value={String(s[k] ?? "")} disabled={ro} onChange={(e) => setS({ ...s, [k]: Number(e.target.value) })} />
    </Field>
  );
  return (
    <>
      {ro && (
        <div className="la-note">
          <Settings size={16} /> Sozlamalarni faqat «Kutubxona sozlamalari» huquqi bor xodim o‘zgartira oladi.
        </div>
      )}
      <div className="la-grid">
        <Card title="Berish qoidalari">
          <div className="a-form-grid">
            {num("loan_days_student", "Talabaga muddat (kun)")}
            {num("loan_days_teacher", "O‘qituvchiga muddat (kun)")}
            {num("limit_student", "Talaba limiti (kitob)")}
            {num("limit_teacher", "O‘qituvchi limiti (kitob)")}
            {num("renew_days", "Uzaytirish (kun)")}
            {num("max_renewals", "Necha marta uzaytirish mumkin")}
            {num("hold_days", "Bron qilingan nusxani kutish (kun)")}
          </div>
        </Card>
        <Card title="Jarimalar">
          <div className="a-form-grid">
            {num("fine_per_day", "Kechikkan har kun uchun")}
            <Field label="Valyuta">
              <Input value={s.currency} disabled={ro} onChange={(e) => setS({ ...s, currency: e.target.value })} />
            </Field>
            {num("lost_coef", "Yo‘qolgan kitob: narx × koeffitsient", "Narx bo‘lmasa — 30 kunlik kechikish", 0.1)}
          </div>
        </Card>
        <Card title="Elektron resurslar">
          <div className="a-form-grid">
            {num("max_file_mb", "Fayl hajmi chegarasi (MB)")}
            {num("rate_min_percent", "Baho uchun kamida o‘qilgan (%)")}
          </div>
          <Toggle checked={s.allow_download} onChange={(v) => !ro && setS({ ...s, allow_download: v })} label="PDF’ni yuklab olishga ruxsat" hint="Faylga o‘quvchining ismi va sana bilan suv belgisi qo‘yiladi" />
        </Card>
        <Card title="Izohlar">
          <div className="a-form-grid">{num("review_edit_hours", "Tahrirlash muddati (soat)")}</div>
          <Toggle checked={s.auto_approve} onChange={(v) => !ro && setS({ ...s, auto_approve: v })} label="Izohlarni avtomatik chop etish" hint="O‘chiq bo‘lsa — kutubxonachi tasdiqlagandan keyin ko‘rinadi" />
        </Card>
      </div>
      {!ro && (
        <div className="la-right">
          <Btn kind="primary" onClick={() => act(() => libAdmin.saveSettings(s), "Saqlandi").then((r) => r && setS({ ...r, can_edit: true }))}>
            Saqlash
          </Btn>
        </div>
      )}
    </>
  );
}

/* ================================================================== jurnal */
const ACTIONS: Record<string, string> = {
  "book.create": "Kitob qo‘shildi",
  "book.update": "Kitob tahrirlandi",
  "book.delete": "Kitob o‘chirildi",
  "copy.create": "Nusxa qo‘shildi",
  "copy.update": "Nusxa o‘zgartirildi",
  "copy.delete": "Nusxa o‘chirildi",
  "loan.issue": "Kitob berildi",
  "loan.return": "Kitob qaytarildi",
  "loan.lost": "Yo‘qolgan deb belgilandi",
  "loan.renew": "Muddat uzaytirildi",
  "fine.paid": "Jarima to‘landi",
  "fine.waived": "Jarima kechirildi",
  "review.approved": "Izoh tasdiqlandi",
  "review.hidden": "Izoh yashirildi",
  "review.rejected": "Izoh rad etildi",
  "reservation.cancel": "Bron bekor qilindi",
  settings: "Sozlamalar o‘zgartirildi",
  "file.upload": "Fayl yuklandi",
  "file.update": "Fayl sozlandi",
  "file.delete": "Fayl o‘chirildi",
  "file.download": "Fayl yuklab olindi",
  "view.holders": "Kimda ekanini ko‘rdi",
  "view.reader": "O‘quvchi kartochkasini ko‘rdi",
  "view.history": "O‘quvchi tarixini ko‘rdi",
  "view.copy_history": "Nusxa tarixini ko‘rdi",
  inventory: "Inventarizatsiya",
  import: "Excel import",
};
function Audit() {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Awaited<ReturnType<typeof libAdmin.audit>>["items"] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    const t = window.setTimeout(() => libAdmin.audit(q).then((r) => setItems(r.items)).catch(() => setItems([])), 250);
    return () => window.clearTimeout(t);
  }, [q]);
  return (
    <>
      <div className="la-toolbar">
        <label className="a-search">
          <Search size={16} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Amal, xodim yoki ID…" />
        </label>
        <span className="a-hint">Kutubxonachining kimda qaysi kitob borligini ko‘rishi ham shu yerga yoziladi.</span>
      </div>
      {!items ? (
        <Spinner />
      ) : !items.length ? (
        <Empty icon={<ClipboardList size={28} />} title="Yozuv yo‘q" />
      ) : (
        <Card pad={false}>
          <div className="a-table-scroll">
            <table className="a-table la-audit">
              <tbody>
                {items.map((x) => (
                  <Fragment key={x.id}>
                    <tr className="la-click" onClick={() => setOpen(open === x.id ? null : x.id)}>
                      <td className="la-mono">{fmtDateTime(x.at)}</td>
                      <td>
                        <UserRound size={13} /> {x.actor || "tizim"}
                      </td>
                      <td>{ACTIONS[x.action] || x.action}</td>
                      <td className="la-mono">
                        {x.entity} {x.entity_id ? `· ${x.entity_id}` : ""}
                      </td>
                    </tr>
                    {open === x.id && (
                      <tr>
                        <td colSpan={4}>
                          <pre className="la-json">{JSON.stringify({ old: x.old, new: x.new }, null, 2)}</pre>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}

