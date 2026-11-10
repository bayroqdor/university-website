// Kabinetdagi kutubxona: «Mening kutubxonam» (talaba va o'qituvchi) hamda o'qituvchining fan bo'yicha tavsiya ro'yxatlari
import {
  AlertTriangle, BookMarked, BookOpen, Bookmark, Clock, Copy, FileText, GraduationCap, Headphones, Highlighter, History, Library, Plus, Receipt, RotateCw, Search, Send, Settings2, StickyNote, Trash2, X,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { Btn, Card, Empty, Field, Input, Modal, PageHead, Pill, Spinner, useConfirm, useRun, useToast } from "../admin/ui";
import { usePortal } from "../portal/PortalApp";
import { lib, type BookCard, type CourseList, type Loan, type Mark, type MyLibrary, type Progress } from "./api";
import { BookBody } from "./BookPage";
import { CatalogBody, FontSwitch, useFontLevel } from "./Catalog";
import { BookRow, cabinetBase, Cover, errText, f, fmtDate, LibLang, LibNav, money, Shelfbar, useLang, useLibNav, useLT, useReaderLink } from "./ui";

/** Kabinet ichidagi kutubxona sahifalari: til va havolalar (kitob → /<kabinet>/library/book/:id, katalog → …/library/catalog) */
function CabLib({ children }: { children: React.ReactNode }) {
  const { lang } = usePortal();
  const base = `${cabinetBase(useLocation().pathname)}/library`;
  return (
    <LibLang lang={lang}>
      <LibNav base={base} catalog={`${base}/catalog`} cabinet>
        {children}
      </LibNav>
    </LibLang>
  );
}

export function MyLibraryPage() {
  return (
    <CabLib>
      <MyLibrary />
    </CabLib>
  );
}

export function TeacherListsPage() {
  return (
    <CabLib>
      <TeacherLists />
    </CabLib>
  );
}

/** Kabinet ichidagi kitob sahifasi — ochiq saytdagi bilan bir xil imkoniyatlar, kabinet qobig'i ichida */
export function CabinetBookPage() {
  const { id = "" } = useParams();
  return (
    <CabLib>
      <div className="a-page lb-cab">
        <BookBody id={id} />
      </div>
    </CabLib>
  );
}

/** Kabinet ichidagi katalog: qidiruv natijalari va tavsiyalar kabinetdagi kitob sahifasiga olib boradi */
export function CabinetCatalogPage() {
  return (
    <CabLib>
      <div className="a-page lb-cab">
        <CatalogBody />
      </div>
    </CabLib>
  );
}

type Tab = "overview" | "shelves" | "history" | "marks" | "settings";

function daysTo(iso: string): number {
  const d = new Date(iso.length <= 10 ? iso + "T23:59:59" : iso).getTime();
  return Math.ceil((d - Date.now()) / 86400000);
}


function MyLibrary() {
  const T = useLT();
  const lang = useLang();
  const run = useRun();
  const [d, setD] = useState<MyLibrary | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [font, setFont] = useFontLevel();
  const ln = useLibNav();
  const load = useCallback(() => lib.me().then(setD).catch(() => setD(null)), []);
  useEffect(() => {
    load();
  }, [load]);
  if (!d) return <Spinner />;
  const tabs: [Tab, string, React.ReactNode][] = [
    ["overview", T.overview, <BookOpen size={15} key="o" />],
    ["shelves", T.shelves, <BookMarked size={15} key="s" />],
    ["history", T.history, <History size={15} key="h" />],
    ["marks", T.marks, <Bookmark size={15} key="m" />],
    ["settings", T.notifications, <Settings2 size={15} key="n" />],
  ];
  const hours = d.stats.seconds / 3600;
  return (
    <div className={`a-page lb-root lb-portal fs-${font}`}>
      <PageHead
        title={T.my_library}
        sub={f(T.rules_text, { limit: d.rules.limit, days: d.rules.days, renew: d.rules.renew_days, max: d.rules.max_renewals, fine: money(d.rules.fine_per_day, d.rules.currency) })}
        actions={
          <>
            <FontSwitch value={font} onChange={setFont} />
            <Link to={ln.catalog} className="a-btn primary md">
              <Search size={15} />
              <span>{T.open_catalog}</span>
            </Link>
          </>
        }
      />
      {d.problems.length > 0 && (
        <div className="lb-alert" role="alert">
          <AlertTriangle size={18} />
          <span>{d.problems.map((p) => (T as Record<string, string>)[`problem_${p}`] || p).join(" · ")}</span>
        </div>
      )}
      <div className="lb-kpis">
        <div className="lb-kpi">
          <BookOpen size={18} />
          <b>
            {d.loans.length}
            <small>/{d.rules.limit}</small>
          </b>
          <span>{T.on_hand}</span>
        </div>
        <div className="lb-kpi">
          <Clock size={18} />
          <b>{d.reservations.length}</b>
          <span>{T.reservations}</span>
        </div>
        <div className={`lb-kpi ${d.unpaid > 0 ? "bad" : ""}`}>
          <Receipt size={18} />
          <b>{money(d.unpaid, d.rules.currency)}</b>
          <span>{T.fines}</span>
        </div>
        <div className="lb-kpi">
          <GraduationCap size={18} />
          <b>{hours >= 10 ? Math.round(hours) : hours.toFixed(1)}</b>
          <span>
            {T.hours_read} · {d.stats.pages} {T.pages_read}
          </span>
        </div>
      </div>
      <div className="lb-tabs" role="tablist">
        {tabs.map(([k, label, icon]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>
            {icon} {label}
          </button>
        ))}
      </div>
      {tab === "overview" && <Overview d={d} reload={load} />}
      {tab === "shelves" && <Shelves d={d} reload={load} />}
      {tab === "history" && <HistoryTab />}
      {tab === "marks" && <MarksTab />}
      {tab === "settings" && (
        <Card title={T.notifications} sub={T.notif_hint}>
          <div className="lb-prefs">
            {(["inapp", "email", "telegram"] as const).map((ch) => {
              const on = d.prefs.channels.includes(ch);
              const tgOff = ch === "telegram" && !d.prefs.tg_chat;
              return (
                <label key={ch} className={`lb-pref ${on ? "on" : ""}`}>
                  <input
                    type="checkbox"
                    checked={on && !tgOff}
                    disabled={tgOff}
                    onChange={async (e) => {
                      const ch2 = e.target.checked ? [...d.prefs.channels, ch] : d.prefs.channels.filter((x) => x !== ch);
                      const p = await run(() => lib.prefs({ channels: ch2 }), T.saved);
                      if (p) setD({ ...d, prefs: p });
                    }}
                  />
                  <span>{ch === "inapp" ? T.ch_inapp : ch === "email" ? T.ch_email : T.ch_telegram}</span>
                  {ch === "telegram" &&
                    (d.prefs.tg_chat ? (
                      <Pill tone="ok">{T.tg_connected}</Pill>
                    ) : d.telegram_bot ? (
                      <Btn
                        size="sm"
                        icon={<Send size={14} />}
                        onClick={async () => {
                          const r = await run(() => lib.telegram());
                          if (r) window.open(r.url, "_blank", "noopener");
                        }}
                        title={T.tg_open}
                      >
                        {T.connect_tg}
                      </Btn>
                    ) : (
                      <small className="muted">{T.err_telegram_not_configured}</small>
                    ))}
                </label>
              );
            })}
          </div>
          {!d.prefs.tg_chat && d.telegram_bot && (
            <p className="a-hint">
              {T.tg_open}. <button className="lb-link" onClick={load}>↻</button>
            </p>
          )}
        </Card>
      )}
      <p className="lb-foot muted">{fmtDate(new Date().toISOString(), lang)}</p>
    </div>
  );
}

function LoanCard({ l, max, onRenew }: { l: Loan; max: number; onRenew: () => void }) {
  const T = useLT();
  const lang = useLang();
  const left = daysTo(l.due);
  const ln = useLibNav();
  return (
    <div className={`lb-loan ${l.overdue || left < 0 ? "late" : left <= 3 ? "soon" : ""}`}>
      {l.cover && (
        <Link to={ln.book(l.book_id)} tabIndex={-1}>
          <Cover title={l.title} src={l.cover} size="sm" />
        </Link>
      )}
      <div className="lb-loan-body">
        <Link to={ln.book(l.book_id)} className="lb-row-t">
          {l.title}
        </Link>
        <small>{(l.authors || []).join(", ")}</small>
        <span className="lb-loan-meta">
          <span>
            {T.due}: <b>{fmtDate(l.due, lang)}</b>
          </span>
          <span className="lb-due">{left < 0 ? f(T.days_late, { n: -left }) : f(T.days_left, { n: left })}</span>
          <span className="muted">
            {f(T.issued_on, { date: fmtDate(l.issued, lang) })} · {l.inv}
          </span>
          {l.renewals > 0 && <span className="muted">{f(T.renewals_n, { n: l.renewals, max })}</span>}
        </span>
      </div>
      <Btn size="sm" icon={<RotateCw size={14} />} onClick={onRenew} disabled={left < 0}>
        {T.renew}
      </Btn>
    </div>
  );
}

function Overview({ d, reload }: { d: MyLibrary; reload: () => void }) {
  const T = useLT();
  const lang = useLang();
  const toast = useToast();
  const confirm = useConfirm();
  const ln = useLibNav();
  const renew = async (l: Loan) => {
    try {
      const r = await lib.renew(l.id);
      toast(`${T.renewed}: ${fmtDate(r.due, lang)}`);
      reload();
    } catch (e) {
      toast(errText(e, T), "error");
    }
  };
  return (
    <div className="lb-ov">
      <Card title={T.on_hand}>
        {d.loans.length ? (
          <div className="lb-loans">
            {d.loans.map((l) => (
              <LoanCard key={l.id} l={l} max={d.rules.max_renewals} onRenew={() => renew(l)} />
            ))}
          </div>
        ) : (
          <Empty icon={<Library size={26} />} title={T.empty_loans}>
            <Link to={ln.catalog} className="lb-link">
              {T.go_catalog} →
            </Link>
          </Empty>
        )}
      </Card>
      <div className="lb-ov-2">
        <Card title={T.reservations}>
          {d.reservations.length ? (
            <div className="lb-resv">
              {d.reservations.map((r) => (
                <div key={r.id} className={`lb-res ${r.status}`}>
                  <Cover title={r.title} src={r.cover} size="sm" />
                  <div>
                    <Link to={ln.book(r.book_id)} className="lb-row-t">
                      {r.title}
                    </Link>
                    {r.status === "ready" ? (
                      <Pill tone="ok">{f(T.ready_pickup, { date: fmtDate(r.expires, lang) })}</Pill>
                    ) : (
                      <Pill tone="info">{f(T.in_queue, { n: r.position })}</Pill>
                    )}
                  </div>
                  <button
                    className="a-icon"
                    title={T.cancel_reservation}
                    aria-label={T.cancel_reservation}
                    onClick={async () => {
                      if (!(await confirm(`${T.cancel_reservation}?`))) return;
                      await lib.cancelReservation(r.id).catch(() => null);
                      reload();
                    }}
                  >
                    <X size={16} />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">{T.no_reservations}</p>
          )}
        </Card>
        <Card title={T.fines} sub={d.unpaid > 0 ? T.pay_hint : undefined}>
          {d.fines.length ? (
            <div className="a-table-scroll">
              <table className="a-table lb-fines">
                <tbody>
                  {d.fines.slice(0, 8).map((x) => (
                    <tr key={x.id}>
                      <td>
                        <b>{x.title || "—"}</b>
                        <small className="muted">
                          {x.kind === "lost" ? T.fine_lost : T.fine_late} · {fmtDate(x.created, lang)}
                        </small>
                      </td>
                      <td className="n">{money(x.amount, d.rules.currency)}</td>
                      <td>
                        <Pill tone={x.status === "unpaid" ? "bad" : x.status === "paid" ? "ok" : "muted"}>
                          {x.status === "unpaid" ? T.fine_unpaid : x.status === "paid" ? T.fine_paid : T.fine_waived}
                        </Pill>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="muted">{T.no_fines}</p>
          )}
        </Card>
      </div>
      {d.continue.length > 0 && (
        <Card title={T.sec_continue}>
          <div className="lb-cont-grid">
            {d.continue.map((p) => (
              <ContinueItem key={p.file_id} p={p} />
            ))}
          </div>
        </Card>
      )}
      {d.course_lists.length > 0 && (
        <Card title={T.course_lists}>
          <CourseListsView lists={d.course_lists} />
        </Card>
      )}
      <ActivityChart days={d.stats.days} />
      <Shelfbar title={T.sec_for_you} items={d.for_you} />
    </div>
  );
}

function ContinueItem({ p }: { p: Progress }) {
  const T = useLT();
  const readerLink = useReaderLink();
  return (
    <Link {...readerLink(p)} className="lb-cont-it">
      <Cover title={p.title || ""} src={p.cover} size="sm" />
      <span>
        <b>{p.title}</b>
        <small>
          {p.kind === "audio" ? <Headphones size={12} /> : <FileText size={12} />} {p.file_title || (p.kind || "").toUpperCase()}
        </small>
        <span className="lb-prog" aria-label={`${Math.round(p.percent)}%`}>
          <i style={{ width: `${Math.min(100, p.percent)}%` }} />
        </span>
        <em>{f(T.read_continue, { p: Math.round(p.percent) })}</em>
      </span>
    </Link>
  );
}

function CourseListsView({ lists }: { lists: CourseList[] }) {
  const T = useLT();
  return (
    <div className="lb-clists">
      {lists.map((l) => (
        <section key={l.id} className="lb-clist">
          <header>
            <b>{l.subject_name}</b>
            <small>
              {l.title ? `${l.title} · ` : ""}
              {T.teacher_label}: {l.teacher}
            </small>
          </header>
          {(["main", "extra"] as const).map((k) => {
            const items = l.items.filter((i) => i.kind === k);
            if (!items.length) return null;
            return (
              <div key={k}>
                <h4>{k === "main" ? T.main_lit : T.extra_lit}</h4>
                {items.map((i) => (
                  <BookRow key={i.book.id} b={i.book} right={i.note ? <small className="lb-inote">{i.note}</small> : undefined} />
                ))}
              </div>
            );
          })}
        </section>
      ))}
    </div>
  );
}

function ActivityChart({ days }: { days: MyLibrary["stats"]["days"] }) {
  const T = useLT();
  if (!days.length) return null;
  // oxirgi 30 kun — bo'sh kunlar ham ko'rinsin
  const map = new Map(days.map((x) => [x.day, x]));
  const out: { day: string; seconds: number; pages: number }[] = [];
  for (let i = 29; i >= 0; i--) {
    const dt = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    out.push(map.get(dt) || { day: dt, seconds: 0, pages: 0 });
  }
  const max = Math.max(60, ...out.map((x) => x.seconds));
  return (
    <Card title={T.my_stats} sub={T.last_30}>
      <div className="lb-chart" role="img" aria-label={T.my_stats}>
        {out.map((x) => (
          <span key={x.day} title={`${x.day}: ${Math.round(x.seconds / 60)} min · ${x.pages} ${T.pages_read}`}>
            <i style={{ height: `${(x.seconds / max) * 100}%` }} />
          </span>
        ))}
      </div>
    </Card>
  );
}

function Shelves({ d, reload }: { d: MyLibrary; reload: () => void }) {
  const T = useLT();
  const confirm = useConfirm();
  const [active, setActive] = useState(d.shelves[0]?.id || "");
  const sh = d.shelves.find((s) => s.id === active) || d.shelves[0];
  const name = (s: { name: string; kind: string }) => (s.kind === "reading" ? T.shelf_reading : s.kind === "want" ? T.shelf_want : s.kind === "done" ? T.shelf_done : s.name);
  return (
    <Card>
      <div className="lb-shelftabs">
        {d.shelves.map((s) => (
          <button key={s.id} className={sh?.id === s.id ? "on" : ""} onClick={() => setActive(s.id)}>
            {name(s)} <i>{s.items.length}</i>
          </button>
        ))}
        <button
          className="new"
          onClick={async () => {
            const n = window.prompt(T.shelf_name);
            if (!n) return;
            const s = await lib.shelfCreate(n).catch(() => null);
            if (s) {
              setActive(s.id);
              reload();
            }
          }}
        >
          <Plus size={14} /> {T.new_shelf}
        </button>
      </div>
      {sh && (
        <>
          {sh.items.length ? (
            <div className="lb-list">
              {sh.items.map((b: BookCard) => (
                <BookRow
                  key={b.id}
                  b={b}
                  right={
                    <button
                      className="a-icon"
                      title={T.remove}
                      aria-label={T.remove}
                      onClick={async () => {
                        await lib.shelfRemove(sh.id, b.id).catch(() => null);
                        reload();
                      }}
                    >
                      <X size={16} />
                    </button>
                  }
                />
              ))}
            </div>
          ) : (
            <p className="muted">{T.empty_shelf}</p>
          )}
          {sh.kind === "custom" && (
            <div className="lb-right">
              <Btn
                size="sm"
                kind="ghost"
                icon={<Trash2 size={14} />}
                onClick={async () => {
                  if (!(await confirm(`${T.delete_shelf}?`))) return;
                  await lib.shelfDelete(sh.id).catch(() => null);
                  setActive("");
                  reload();
                }}
              >
                {T.delete_shelf}
              </Btn>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

type Hist = Awaited<ReturnType<typeof lib.history>>;
function useHistory() {
  const [h, setH] = useState<Hist | null>(null);
  useEffect(() => {
    lib.history().then(setH).catch(() => setH({ loans: [], reading: [], fines: [], reservations: [], marks: [] }));
  }, []);
  return [h, setH] as const;
}

function HistoryTab() {
  const T = useLT();
  const lang = useLang();
  const [h] = useHistory();
  const ln = useLibNav();
  const readerLink = useReaderLink();
  if (!h) return <Spinner />;
  if (!h.loans.length && !h.reading.length) return <Empty icon={<History size={26} />} title={T.no_history} />;
  return (
    <div className="lb-ov-2">
      <Card title={T.paper_copies}>
        <div className="a-table-scroll">
          <table className="a-table">
            <tbody>
              {h.loans.map((l) => (
                <tr key={l.id}>
                  <td>
                    <Link to={ln.book(l.book_id)}>{l.title}</Link>
                    <small className="muted">{l.inv}</small>
                  </td>
                  <td className="muted">{fmtDate(l.issued, lang)}</td>
                  <td>{l.returned ? <Pill tone="muted">{f(T.returned_on, { date: fmtDate(l.returned, lang) })}</Pill> : <Pill tone="info">{T.on_hand}</Pill>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!h.loans.length && <p className="muted">—</p>}
      </Card>
      <Card title={T.e_versions}>
        <div className="a-table-scroll">
          <table className="a-table">
            <tbody>
              {h.reading.map((p) => (
                <tr key={p.file_id}>
                  <td>
                    <Link {...readerLink(p)}>{p.title}</Link>
                    <small className="muted">
                      {(p.kind || "").toUpperCase()} · {Math.round((p.seconds || 0) / 60)} min
                    </small>
                  </td>
                  <td className="n">{Math.round(p.percent)}%</td>
                  <td className="muted">{fmtDate(p.updated, lang)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!h.reading.length && <p className="muted">—</p>}
      </Card>
    </div>
  );
}

function MarksTab() {
  const T = useLT();
  const lang = useLang();
  const [h, setH] = useHistory();
  const readerLink = useReaderLink();
  if (!h) return <Spinner />;
  if (!h.marks.length) return <Empty icon={<StickyNote size={26} />} title={T.no_marks} />;
  const byBook = new Map<string, Mark[]>();
  h.marks.forEach((m) => byBook.set(m.book_id || "", [...(byBook.get(m.book_id || "") || []), m]));
  return (
    <div className="lb-marksall">
      {[...byBook.entries()].map(([bid, ms]) => (
        <Card key={bid} title={ms[0].title}>
          {ms.map((m) => (
            <div key={m.id} className={`lb-markrow c-${m.color}`}>
              {m.kind === "bookmark" ? <Bookmark size={15} /> : m.kind === "note" ? <StickyNote size={15} /> : <Highlighter size={15} />}
              <Link {...readerLink({ file_id: m.file_id, kind: m.file_kind })}>
                {m.text ? <q>{m.text.slice(0, 220)}</q> : <b>{T.add_bookmark}</b>}
                {m.note && <small>{m.note}</small>}
              </Link>
              <span className="muted">{fmtDate(m.created, lang)}</span>
              <button
                className="a-icon"
                aria-label={T.delete}
                onClick={async () => {
                  await lib.deleteMark(m.id).catch(() => null);
                  setH({ ...h, marks: h.marks.filter((x) => x.id !== m.id) });
                }}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </Card>
      ))}
    </div>
  );
}

/* ================================================================== o'qituvchi: tavsiya ro'yxatlari */
type ListsData = Awaited<ReturnType<typeof lib.lists>>;
type Draft = { id?: string; subject_id: string; subject_name: string; semester_id: string; title: string; items: { book: BookCard; kind: "main" | "extra"; note: string }[] };

function TeacherLists() {
  const T = useLT();
  const ln = useLibNav();
  const run = useRun();
  const confirm = useConfirm();
  const [d, setD] = useState<ListsData | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [copyOf, setCopyOf] = useState<CourseList | null>(null);
  const load = useCallback(() => lib.lists().then(setD).catch(() => setD({ items: [], subjects: [], semester: null, semesters: [] })), []);
  useEffect(() => {
    load();
  }, [load]);
  if (!d) return <Spinner />;
  const semName = (id: string | null) => d.semesters.find((s) => s.id === id)?.name || "";
  return (
    <div className="a-page lb-root lb-portal">
      <PageHead
        title={T.my_lists}
        sub={T.list_hint}
        actions={
          <Btn
            kind="primary"
            icon={<Plus size={15} />}
            onClick={() => setDraft({ subject_id: d.subjects[0]?.id || "", subject_name: d.subjects[0]?.name || "", semester_id: d.semester?.id || "", title: "", items: [] })}
          >
            {T.new_list}
          </Btn>
        }
      />
      {!d.items.length && <Empty icon={<BookMarked size={26} />} title={T.list_empty} />}
      <div className="lb-tlists">
        {d.items.map((l) => (
          <Card
            key={l.id}
            title={l.subject_name}
            sub={[l.title, semName(l.semester_id), f(T.books_n, { n: l.items.length })].filter(Boolean).join(" · ")}
            actions={
              <>
                <Btn size="sm" kind="ghost" onClick={() => setDraft({ id: l.id, subject_id: l.subject_id || "", subject_name: l.subject_name, semester_id: l.semester_id || "", title: l.title, items: l.items.map((i) => ({ ...i })) })}>
                  {T.edit}
                </Btn>
                {d.semesters.length > 1 && (
                  <Btn size="sm" kind="ghost" icon={<Copy size={14} />} title={T.copy_semester} onClick={() => setCopyOf(l)} />
                )}
                <Btn
                  size="sm"
                  kind="ghost"
                  icon={<Trash2 size={14} />}
                  title={T.delete}
                  onClick={async () => {
                    if (!(await confirm(T.confirm_delete))) return;
                    await run(() => lib.deleteList(l.id));
                    load();
                  }}
                />
              </>
            }
          >
            {(["main", "extra"] as const).map((k) => {
              const items = l.items.filter((i) => i.kind === k);
              if (!items.length) return null;
              return (
                <div key={k} className="lb-tl-group">
                  <h4>{k === "main" ? T.main_lit : T.extra_lit}</h4>
                  <ul>
                    {items.map((i) => (
                      <li key={i.book.id}>
                        <Link to={ln.book(i.book.id)}>{i.book.title}</Link>
                        <small className="muted">{i.book.authors.join(", ")}</small>
                        {i.note && <em>{i.note}</em>}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </Card>
        ))}
      </div>
      {draft && <ListEditor d={d} draft={draft} onClose={() => setDraft(null)} onSaved={() => (setDraft(null), load())} />}
      <Modal open={!!copyOf} onClose={() => setCopyOf(null)} title={T.copy_semester} width={420}>
        <div className="lb-semlist">
          {d.semesters
            .filter((s) => s.id !== copyOf?.semester_id)
            .map((s) => (
              <button
                key={s.id}
                className="a-btn md"
                onClick={async () => {
                  if (!copyOf) return;
                  const r = await run(() => lib.copyList(copyOf.id, s.id), T.copied);
                  if (r) {
                    setCopyOf(null);
                    load();
                  }
                }}
              >
                {s.name}
              </button>
            ))}
        </div>
      </Modal>
    </div>
  );
}

function ListEditor({ d, draft, onClose, onSaved }: { d: ListsData; draft: Draft; onClose: () => void; onSaved: () => void }) {
  const T = useLT();
  const toast = useToast();
  const [x, setX] = useState<Draft>(draft);
  const [manual, setManual] = useState(!!draft.subject_name && !d.subjects.some((s) => s.id === draft.subject_id));
  const [q, setQ] = useState("");
  const [found, setFound] = useState<BookCard[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (q.trim().length < 2) {
      setFound([]);
      return;
    }
    const t = window.setTimeout(() => {
      lib
        .search({ q: q.trim(), size: 8 })
        .then((r) => setFound(r.items))
        .catch(() => setFound([]));
    }, 250);
    return () => window.clearTimeout(t);
  }, [q]);
  const add = (b: BookCard, kind: "main" | "extra") => {
    if (x.items.some((i) => i.book.id === b.id)) return;
    setX({ ...x, items: [...x.items, { book: b, kind, note: "" }] });
  };
  const save = async () => {
    setBusy(true);
    try {
      await lib.saveList(
        { subject_id: manual ? undefined : x.subject_id, subject_name: x.subject_name, semester_id: x.semester_id || undefined, title: x.title, items: x.items.map((i) => ({ book_id: i.book.id, kind: i.kind, note: i.note })) },
        x.id,
      );
      toast(T.saved);
      onSaved();
    } catch (e) {
      toast(errText(e, T), "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={x.id ? x.subject_name : T.new_list}
      width={760}
      footer={
        <>
          <Btn onClick={onClose}>{T.cancel}</Btn>
          <Btn kind="primary" onClick={save} busy={busy} disabled={!x.subject_name.trim()}>
            {T.save}
          </Btn>
        </>
      }
    >
      <div className="lb-form2">
        <Field label={T.list_subject}>
          {!manual && d.subjects.length ? (
            <select
              className="a-input"
              value={x.subject_id}
              onChange={(e) => {
                if (e.target.value === "__other") {
                  setManual(true);
                  setX({ ...x, subject_id: "", subject_name: "" });
                  return;
                }
                setX({ ...x, subject_id: e.target.value, subject_name: d.subjects.find((s) => s.id === e.target.value)?.name || "" });
              }}
            >
              {d.subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
              <option value="__other">{T.other_subject}</option>
            </select>
          ) : (
            <Input value={x.subject_name} onChange={(e) => setX({ ...x, subject_name: e.target.value })} placeholder={T.pick_subject} autoFocus />
          )}
        </Field>
        <Field label={T.list_semester}>
          <select className="a-input" value={x.semester_id} onChange={(e) => setX({ ...x, semester_id: e.target.value })}>
            <option value="">{T.all_semesters}</option>
            {d.semesters.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label={T.list_title} wide>
          <Input value={x.title} onChange={(e) => setX({ ...x, title: e.target.value })} />
        </Field>
      </div>
      <div className="lb-picker">
        <label className="lb-picker-q">
          <Search size={16} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={T.find_book} />
        </label>
        {found.length > 0 && (
          <div className="lb-picker-res">
            {found.map((b) => (
              <div key={b.id} className="lb-picker-it">
                <Cover title={b.title} src={b.cover} size="sm" />
                <span>
                  <b>{b.title}</b>
                  <small>{b.authors.join(", ")}</small>
                </span>
                <Btn size="sm" onClick={() => add(b, "main")} disabled={x.items.some((i) => i.book.id === b.id)}>
                  + {T.main_lit}
                </Btn>
                <Btn size="sm" kind="ghost" onClick={() => add(b, "extra")} disabled={x.items.some((i) => i.book.id === b.id)}>
                  + {T.extra_lit}
                </Btn>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="lb-picked">
        {x.items.map((i, k) => (
          <div key={i.book.id} className="lb-picked-it">
            <span className="lb-picked-t">
              <b>{i.book.title}</b>
              <small>{i.book.authors.join(", ")}</small>
            </span>
            <span className="rd-seg">
              {(["main", "extra"] as const).map((kk) => (
                <button key={kk} className={i.kind === kk ? "on" : ""} onClick={() => setX({ ...x, items: x.items.map((y, j) => (j === k ? { ...y, kind: kk } : y)) })}>
                  {kk === "main" ? T.main_lit : T.extra_lit}
                </button>
              ))}
            </span>
            <input className="a-input" value={i.note} placeholder={T.note} onChange={(e) => setX({ ...x, items: x.items.map((y, j) => (j === k ? { ...y, note: e.target.value } : y)) })} />
            <button className="a-icon" aria-label={T.remove} onClick={() => setX({ ...x, items: x.items.filter((_, j) => j !== k) })}>
              <X size={15} />
            </button>
          </div>
        ))}
      </div>
    </Modal>
  );
}
