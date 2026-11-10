// Murojaatlar (service desk) — G-Guard service desk asosida: Kanban doska, ro'yxat, chipta tafsiloti,
// «Boshlash» (mas'ul bo'lish), pochta orqali javob (bo'lim manzilidan), ichki izohlar, bosqichlar va tarix.
import {
  AlertTriangle, ArrowRightLeft, BarChart3, Briefcase, CheckCircle2, Clock, Download, FileText, Globe, Inbox, KanbanSquare, List, Lock, Mail, MailCheck, MessageSquare,
  Paperclip, Pencil, Phone, Play, Plus, RefreshCw, Search, Send, Settings2, Star, Trash2, UserRound, X, XCircle, MessagesSquare } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from "react";
import "../../styles/desk.css";
import "../../styles/official-admin.css";
import { Avatar } from "../../lib/Avatar";
import { errMsg } from "../api";
import { desk, type Board, type Channel, type DeskCategory, type DeskEvent, type DeskFile, type Person, type Priority, type Stage, type StageId, type Ticket, type TicketFull } from "../desk-api";
import { DeskStatsView, Stars } from "./DeskStats";
import { Btn, Field, Input, Modal, PageHead, Select, Spinner, Textarea, useConfirm, useToast } from "../ui";
import { useSearchParams } from "react-router-dom";
import { CalendarClock } from "lucide-react";

const PRIO: Record<Priority, { label: string; color: string }> = {
  critical: { label: "Juda muhim", color: "#b42318" },
  high: { label: "Yuqori", color: "#b08d3c" },
  medium: { label: "O‘rta", color: "#2b5a94" },
  low: { label: "Past", color: "#9aa1ad" },
};
const SOURCE: Record<Ticket["source"], { label: string; icon: ReactNode; cls: string }> = {
  web: { label: "Sayt (virtual qabulxona)", icon: <Globe size={12} />, cls: "web" },
  email: { label: "Pochta", icon: <Mail size={12} />, cls: "email" },
  telegram: { label: "Telegram bot", icon: <Send size={12} />, cls: "telegram" },
  careers: { label: "Vakansiyaga ariza", icon: <Briefcase size={12} />, cls: "careers" },
  chat: { label: "Sayt chati", icon: <MessagesSquare size={12} />, cls: "chat" },
  manual: { label: "Qo‘lda", icon: <Pencil size={12} />, cls: "manual" },
  reception: { label: "Rahbariyat qabuli", icon: <CalendarClock size={12} />, cls: "web" },
};
const src = (s: string) => SOURCE[s as Ticket["source"]] || SOURCE.web;

function ago(iso: string | null): string {
  if (!iso) return "";
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "hozir";
  if (s < 3600) return `${Math.floor(s / 60)} daq.`;
  if (s < 86400) return `${Math.floor(s / 3600)} soat`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)} kun`;
  return new Date(iso).toLocaleDateString("uz-UZ");
}
function dt(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}, ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function fmtSize(n?: number): string {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

const CHANNEL: Record<Channel, { label: string; icon: ReactNode }> = {
  telegram: { label: "Telegram bot", icon: <Send size={13} /> },
  email: { label: "Pochta", icon: <Mail size={13} /> },
  chat: { label: "Sayt chati", icon: <MessagesSquare size={13} /> },
};

/* ilovalar: rasmlar — eskiz (bosilsa ochiladi), video/audio — pleyer, qolganlari — nom va hajm */
function Attachments({ files }: { files: (string | DeskFile)[] }) {
  const list: DeskFile[] = files.map((f) => (typeof f === "string" ? { name: f } : f));
  if (!list.length) return null;
  const imgs = list.filter((f) => f.url && f.kind === "image");
  const media = list.filter((f) => f.url && (f.kind === "video" || f.kind === "audio"));
  const other = list.filter((f) => !imgs.includes(f) && !media.includes(f));
  const dl = (f: DeskFile) => (f.url && f.url.includes("/desk/att/") ? `${f.url}?dl=1&n=${encodeURIComponent(f.name)}` : f.url || "");
  return (
    <div className="sd-atts">
      {imgs.length > 0 && (
        <div className="sd-imgs">
          {imgs.map((f) => (
            <a key={f.url} href={f.url} target="_blank" rel="noreferrer" title={f.name}>
              <img src={f.url} alt={f.name} loading="lazy" />
            </a>
          ))}
        </div>
      )}
      {media.map((f) => (
        <figure key={f.url} className={`sd-media ${f.kind}`}>
          {f.kind === "video" ? <video src={f.url} controls preload="metadata" /> : <audio src={f.url} controls preload="metadata" />}
          <figcaption>
            <span>{f.name}</span>
            <small>{fmtSize(f.size)}</small>
            <a href={dl(f)} aria-label="Yuklab olish" title="Yuklab olish">
              <Download size={13} />
            </a>
          </figcaption>
        </figure>
      ))}
      {other.length > 0 && (
        <div className="sd-chips">
          {other.map((f, i) =>
            f.url ? (
              <a key={f.url} className="sd-chip" href={dl(f)} target={f.url.includes("/desk/att/") ? undefined : "_blank"} rel="noreferrer">
                <FileText size={15} />
                <span>{f.name}</span>
                <small>{fmtSize(f.size)}</small>
              </a>
            ) : (
              <span key={`${f.name}${i}`} className="sd-chip off" title={f.error === "too_large" ? "Fayl juda katta — qabul qilinmagan" : undefined}>
                <Paperclip size={14} />
                <span>{f.name}</span>
                <small>{f.error === "too_large" ? `${fmtSize(f.size)} · olinmadi` : f.error ? "olinmadi" : ""}</small>
              </span>
            ),
          )}
        </div>
      )}
    </div>
  );
}

function StagePill({ stage }: { stage?: Stage }) {
  if (!stage) return null;
  return (
    <span className="sd-stage">
      <i style={{ background: stage.color }} />
      {stage.title}
    </span>
  );
}

/* ------------------------------------------------------------------ karta */
function TicketCard({ t, onOpen, onDragStart }: { t: Ticket; onOpen: () => void; onDragStart: (e: DragEvent) => void }) {
  return (
    <button className={`sd-card ${t.unread ? "unread" : ""}`} draggable onDragStart={onDragStart} onClick={onOpen}>
      <div className="sd-card-top">
        <span className="sd-no">#{t.number_label}</span>
        <span className="sd-prio" style={{ background: PRIO[t.priority].color }} title={PRIO[t.priority].label} />
        {t.unread && <span className="sd-dot" title="Yangi xat" />}
        <span className="sd-ago">{ago(t.last_in_at || t.created)}</span>
      </div>
      <b className="sd-title">{t.title}</b>
      <span className="sd-req">
        {src(t.source).icon} {t.requester_name || t.requester_email || "—"}
      </span>
      <div className="sd-card-foot">
        {t.category ? (
          <span className="sd-cat" style={{ ["--c" as string]: t.category.color }}>
            {t.category.title}
          </span>
        ) : (
          <span />
        )}
        <span className="sd-card-r">
          {t.rating ? (
            <span className="sd-card-rate" title={`Baho: ${t.rating}/5`}>
              <Star size={12} /> {t.rating}
            </span>
          ) : null}
          {t.assignee ? <Avatar name={t.assignee.name} photo={t.assignee.photo} size={24} /> : <span className="sd-unassigned" title="Mas’ul yo‘q">?</span>}
        </span>
      </div>
    </button>
  );
}

/* ------------------------------------------------------------------ sabab oynasi */
function ReasonModal({ title, required, label, onClose, onOk, children }: { title: string; required?: boolean; label: string; onClose: () => void; onOk: (reason: string) => Promise<void>; children?: ReactNode }) {
  const [v, setV] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      width={480}
      footer={
        <>
          <Btn onClick={onClose}>Bekor qilish</Btn>
          <Btn
            kind="primary"
            busy={busy}
            disabled={required && !v.trim()}
            onClick={async () => {
              setBusy(true);
              await onOk(v.trim());
              setBusy(false);
            }}
          >
            Tasdiqlash
          </Btn>
        </>
      }
    >
      {children}
      <Field label={label + (required ? " *" : " (ixtiyoriy)")}>
        <Textarea rows={3} value={v} onChange={(e) => setV(e.target.value)} autoFocus />
      </Field>
    </Modal>
  );
}

/* ------------------------------------------------------------------ chipta tafsiloti */
function TicketDrawer({ id, board, onClose, onChanged }: { id: string; board: Board; onClose: () => void; onChanged: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [d, setD] = useState<TicketFull | null>(null);
  const [tab, setTab] = useState<"reply" | "note">("reply");
  const [text, setText] = useState("");
  const [from, setFrom] = useState("");
  const [channel, setChannel] = useState<Channel | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState<null | "resolve" | "fail" | "reassign">(null);
  const [to, setTo] = useState("");
  const [nextStage, setNextStage] = useState<StageId | "">("");
  const [stageNote, setStageNote] = useState("");
  const [moving, setMoving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const load = useCallback(
    (silent = false) =>
      desk
        .ticket(id)
        .then((r) => {
          setD(r);
          if (!silent) setFrom((f) => f || r.ticket.category?.mailbox || board.categories.find((c) => c.mailbox)?.mailbox || "");
        })
        .catch((e) => toast(errMsg(e), "error")),
    [id, board.categories, toast],
  );
  useEffect(() => {
    load();
    const h = window.setInterval(() => !document.hidden && load(true), 10000);
    return () => window.clearInterval(h);
  }, [load]);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [d?.events.length]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && !modal && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose, modal]);
  const act = async (fn: () => Promise<TicketFull>, ok?: string) => {
    try {
      setD(await fn());
      if (ok) toast(ok);
      onChanged();
      return true;
    } catch (e) {
      toast(errMsg(e), "error");
      return false;
    }
  };
  if (!d)
    return (
      <div className="sd-drawer-bg" onMouseDown={onClose}>
        <aside className="sd-drawer" onMouseDown={(e) => e.stopPropagation()}>
          <Spinner />
        </aside>
      </div>
    );
  const t = d.ticket;
  const stage = board.stages.find((s) => s.id === t.stage);
  const mine = t.assignee_id === board.me;
  const terminal = t.stage === "resolved" || t.stage === "failed";
  const canWrite = !t.assignee_id || mine;
  const mailboxes = Array.from(new Set(board.categories.filter((c) => c.mailbox && c.active).map((c) => c.mailbox)));
  // javob kanali: murojaat kelgan kanal (Telegram / sayt chati / pochta); bir nechta bo'lsa — tanlanadi
  const channels = t.channels || [];
  const chInfo = channels.find((c) => c.id === channel) || channels.find((c) => c.ready) || channels[0];
  const ch: Channel | null = chInfo?.id || null;
  const chReady = !!chInfo?.ready;
  // «Yuborish» tugmasi va Ctrl+Enter — bitta shart: tanlangan kanal tayyor, matn yoki fayl bor
  const canSend =
    tab === "note"
      ? !!text.trim()
      : canWrite && !!ch && chReady && (!!text.trim() || (files.length > 0 && ch !== "chat")) && !(ch === "chat" && files.length > 0);
  const send = async () => {
    if (!canSend || busy) return;
    setBusy(true);
    const okMsg = tab === "note" ? "Izoh qo‘shildi" : `Javob yuborildi: ${CHANNEL[ch as Channel].label}`;
    const ok = await act(() => (tab === "reply" ? desk.reply(t.id, text, from, files, ch as Channel) : desk.note(t.id, text)), okMsg);
    if (ok) {
      setText("");
      setFiles([]);
    }
    setBusy(false);
  };
  const moveTo = async (s: StageId, comment: string) => {
    const ok = await act(() => desk.move(t.id, s, comment), `Holat: ${board.stages.find((x) => x.id === s)?.title || s}`);
    return ok;
  };
  const chBlock =
    tab === "reply" && canWrite && (!ch ? "Murojaatchiga javob yuborish uchun kanal yo‘q (email yoki Telegram ko‘rsatilmagan)" : !chReady ? (ch === "telegram" ? "Telegram bot o‘chirilgan" : "Pochta serveri sozlanmagan") : "");
  return (
    <div className="sd-drawer-bg" onMouseDown={onClose}>
      <aside className="sd-drawer" onMouseDown={(e) => e.stopPropagation()}>
        <header className="sd-dh">
          <div className="sd-dh-l">
            <span className="sd-no big">#{t.number_label}</span>
            <StagePill stage={stage} />
            <span className={`sd-src src-${src(t.source).cls}`}>
              {src(t.source).icon} {src(t.source).label}
            </span>
          </div>
          <div className="sd-dh-r">
            {!terminal && (!t.assignee_id || t.stage === "new" || (mine && t.stage === "waiting")) && (
              <Btn kind="primary" size="sm" icon={<Play size={13} />} onClick={() => act(() => desk.start(t.id), "Siz mas’ulsiz")} disabled={!!t.assignee_id && !mine}>
                Boshlash
              </Btn>
            )}
            {!terminal && canWrite && (
              <>
                <Btn size="sm" className="ok" icon={<CheckCircle2 size={13} />} onClick={() => setModal("resolve")}>
                  Hal qilindi
                </Btn>
                <Btn size="sm" kind="danger" icon={<XCircle size={13} />} onClick={() => setModal("fail")}>
                  Rad etish
                </Btn>
              </>
            )}
            {canWrite && (
              <Btn size="sm" icon={<ArrowRightLeft size={13} />} onClick={() => setModal("reassign")}>
                O‘tkazish
              </Btn>
            )}
            <button className="a-icon" onClick={onClose} aria-label="Yopish">
              <X size={19} />
            </button>
          </div>
        </header>

        <div className="sd-dbody">
          <div className="sd-main">
            <section className="sd-box">
              <h2 className="sd-dtitle">{t.title}</h2>
              <div className="sd-reqbox">
                <Avatar name={t.requester_name || t.requester_email} size={44} />
                <div>
                  <b>{t.requester_name || "—"}</b>
                  <div className="sd-contacts">
                    {t.requester_phone ? (
                      <a href={`tel:${t.requester_phone.replace(/[^+\d]/g, "")}`}>
                        <Phone size={13} /> {t.requester_phone}
                      </a>
                    ) : (
                      <span className="muted">
                        <Phone size={13} /> raqam yo‘q
                      </span>
                    )}
                    {t.requester_email ? (
                      <a href={`mailto:${t.requester_email}`}>
                        <Mail size={13} /> {t.requester_email}
                      </a>
                    ) : (
                      <span className="muted">
                        <Mail size={13} /> email yo‘q
                      </span>
                    )}
                    <span className="muted">
                      <Clock size={13} /> {dt(t.created)}
                    </span>
                  </div>
                </div>
              </div>
            </section>

            <section className="sd-thread">
              {d.events.map((e) => (
                <EventView key={e.id} e={e} t={t} stages={board.stages} agents={board.agents} />
              ))}
            </section>

            <section className={`sd-composer ${tab}`}>
              <div className="sd-tabs">
                <button className={tab === "reply" ? "on" : ""} onClick={() => setTab("reply")}>
                  {ch ? CHANNEL[ch].icon : <Mail size={14} />} Javob
                </button>
                <button className={tab === "note" ? "on" : ""} onClick={() => setTab("note")}>
                  <Lock size={14} /> Ichki izoh
                </button>
              </div>
              {!canWrite ? (
                <div className="sd-lock">
                  <Lock size={15} /> Bu murojaatga {t.assignee?.name} mas’ul — javobni faqat u yozadi. {tab === "note" && "Ichki izoh qoldirishingiz mumkin."}
                </div>
              ) : null}
              {chBlock ? (
                <div className="sd-lock">
                  <AlertTriangle size={15} /> {chBlock}
                </div>
              ) : null}
              {tab === "reply" && channels.length > 1 && (
                <div className="sd-channel">
                  <span>Kanal:</span>
                  {channels.map((c) => (
                    <button key={c.id} className={ch === c.id ? "on" : ""} onClick={() => setChannel(c.id)}>
                      {CHANNEL[c.id].icon} {CHANNEL[c.id].label}
                    </button>
                  ))}
                </div>
              )}
              {tab === "reply" && ch && ch !== "email" && (
                <div className="sd-mailhead">
                  <label>
                    <span>Kimga</span>
                    <input className="a-input" value={`${CHANNEL[ch].label}: ${t.requester_name || t.tg_chat || ""}`} readOnly />
                  </label>
                </div>
              )}
              {tab === "reply" && ch === "email" && (
                <div className="sd-mailhead">
                  <label>
                    <span>Kimdan</span>
                    <select className="a-input" value={from} onChange={(e) => setFrom(e.target.value)}>
                      {mailboxes.map((m) => (
                        <option key={m} value={m}>
                          {m}
                          {t.category?.mailbox === m ? " — shu bo‘lim" : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Kimga</span>
                    <input className="a-input" value={t.requester_email || "— email yo‘q —"} readOnly />
                  </label>
                </div>
              )}
              <Textarea
                rows={4}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={tab === "reply" ? "Murojaatchiga javob…" : "Faqat administratorlar ko‘radigan izoh…"}
                disabled={tab === "reply" && !canWrite}
                onKeyDown={(e) => {
                  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                    e.preventDefault();
                    send();
                  }
                }}
              />
              {tab === "reply" && files.length > 0 && (
                <div className="sd-files">
                  {files.map((f, i) => (
                    <span key={i}>
                      <Paperclip size={12} /> {f.name} <small className="muted">{fmtSize(f.size)}</small>
                      <button onClick={() => setFiles(files.filter((_, j) => j !== i))} aria-label="Olib tashlash">
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div className="sd-cfoot">
                {tab === "reply" && ch !== "chat" && (
                  <>
                    <button className="a-icon" onClick={() => fileRef.current?.click()} title="Fayl biriktirish" aria-label="Fayl biriktirish" disabled={!canWrite}>
                      <Paperclip size={16} />
                    </button>
                    <input
                      ref={fileRef}
                      type="file"
                      multiple
                      hidden
                      onChange={(e) => {
                        setFiles([...files, ...Array.from(e.target.files || [])]);
                        e.target.value = "";
                      }}
                    />
                  </>
                )}
                <span className="sd-cfoot-sp" />
                <Btn kind="primary" icon={tab === "reply" ? <Send size={14} /> : <MessageSquare size={14} />} busy={busy} disabled={!canSend} onClick={send}>
                  {tab === "reply" ? "Yuborish" : "Izoh qo‘shish"}
                </Btn>
              </div>
            </section>
            <div ref={endRef} />
          </div>

          <div className="sd-side">
            <section className="sd-box">
              <h4>Holat</h4>
              <div className="sd-param">
                <span>Joriy bosqich</span>
                <b>
                  <StagePill stage={stage} />
                </b>
              </div>
              {canWrite && (
                <div className="sd-move">
                  <select className="a-input" value={nextStage} onChange={(e) => setNextStage(e.target.value as StageId)} aria-label="Yangi bosqich">
                    <option value="">Yangi bosqich…</option>
                    {board.stages.map((s) => (
                      <option key={s.id} value={s.id} disabled={s.id === t.stage}>
                        {s.title}
                      </option>
                    ))}
                  </select>
                  <Textarea
                    rows={2}
                    value={stageNote}
                    onChange={(e) => setStageNote(e.target.value)}
                    placeholder={nextStage === "failed" ? "Murojaatchiga izoh (majburiy)" : "Murojaatchiga izoh"}
                    aria-label="Murojaatchiga izoh"
                  />
                  <Btn
                    size="sm"
                    kind="primary"
                    busy={moving}
                    disabled={!nextStage || (nextStage === "failed" && !stageNote.trim())}
                    onClick={async () => {
                      if (!nextStage) return;
                      setMoving(true);
                      if (await moveTo(nextStage, stageNote.trim())) {
                        setNextStage("");
                        setStageNote("");
                      }
                      setMoving(false);
                    }}
                  >
                    Holatni o‘zgartirish
                  </Btn>
                </div>
              )}
            </section>
            {t.rating ? (
              <section className="sd-box sd-rating">
                <h4>Murojaatchi bahosi</h4>
                <div className="sd-rating-v">
                  <b>{t.rating}</b>
                  <span>/ 5</span>
                  <Stars n={t.rating} size={16} />
                </div>
                {t.rating_comment && <q>{t.rating_comment}</q>}
                <small className="muted">
                  {dt(t.rated_at || null)}
                  {t.rating_agent_id ? ` · ${board.agents.find((a) => a.id === t.rating_agent_id)?.name || ""}` : ""}
                </small>
              </section>
            ) : null}
            <section className="sd-box">
              <h4>Parametrlar</h4>
              <div className="sd-param">
                <span>Mas’ul</span>
                {t.assignee ? (
                  <b className="u-cell">
                    <Avatar name={t.assignee.name} photo={t.assignee.photo} size={26} /> {t.assignee.name}
                  </b>
                ) : (
                  <b className="muted">— hali hech kim boshlamagan —</b>
                )}
              </div>
              <div className="sd-param">
                <span>Prioritet</span>
                <Select value={t.priority} onChange={(v) => act(() => desk.update(t.id, { priority: v }))} options={(Object.keys(PRIO) as Priority[]).map((p) => ({ value: p, label: PRIO[p].label }))} />
              </div>
              <div className="sd-param">
                <span>Bo‘lim</span>
                <Select value={t.category_id || ""} onChange={(v) => act(() => desk.update(t.id, { category_id: v }))} options={[{ value: "", label: "—" }, ...board.categories.map((c) => ({ value: c.id, label: c.title }))]} />
              </div>
              {t.category?.mailbox && (
                <div className="sd-param">
                  <span>Bo‘lim pochtasi</span>
                  <b>{t.category.mailbox}</b>
                </div>
              )}
            </section>
            <section className="sd-box">
              <h4>Vaqtlar</h4>
              <div className="sd-param">
                <span>Kelib tushgan</span>
                <b>{dt(t.created)}</b>
              </div>
              <div className="sd-param">
                <span>Birinchi javob</span>
                <b>{dt(t.first_response_at)}</b>
              </div>
              <div className="sd-param">
                <span>Oxirgi xat</span>
                <b>{dt(t.last_in_at)}</b>
              </div>
              <div className="sd-param">
                <span>Yopilgan</span>
                <b>{dt(t.resolved_at)}</b>
              </div>
              {t.ip && (
                <div className="sd-param">
                  <span>IP</span>
                  <b>{t.ip}</b>
                </div>
              )}
            </section>
            {d.history.length > 0 && (
              <section className="sd-box">
                <h4>Shu murojaatchining boshqa murojaatlari</h4>
                {d.history.map((h) => (
                  <div key={h.id} className="sd-hist">
                    <span className="sd-no">#UNI-{h.number}</span>
                    <span>{h.title}</span>
                    <StagePill stage={board.stages.find((s) => s.id === h.stage)} />
                  </div>
                ))}
              </section>
            )}
            <Btn
              kind="ghost"
              size="sm"
              icon={<Trash2 size={14} />}
              onClick={async () => {
                if (await confirm(`#${t.number_label} butunlay o‘chirilsinmi?`)) {
                  try {
                    await desk.remove(t.id);
                    onChanged();
                    onClose();
                  } catch (e) {
                    toast(errMsg(e), "error");
                  }
                }
              }}
            >
              O‘chirish
            </Btn>
          </div>
        </div>

        {modal === "resolve" && (
          <ReasonModal title="Hal qilindi" label="Murojaatchiga izoh" onClose={() => setModal(null)} onOk={async (r) => { if (await moveTo("resolved", r)) setModal(null); }} />
        )}
        {modal === "fail" && (
          <ReasonModal title="Rad etish" required label="Murojaatchiga rad etish sababi" onClose={() => setModal(null)} onOk={async (r) => { if (await moveTo("failed", r)) setModal(null); }} />
        )}
        {modal === "reassign" && (
          <ReasonModal title="Boshqa administratorga o‘tkazish" required label="Sabab" onClose={() => setModal(null)} onOk={async (r) => { if (await act(() => desk.reassign(t.id, to, r), "O‘tkazildi")) setModal(null); }}>
            <Field label="Kimga">
              <Select value={to} onChange={setTo} options={[{ value: "", label: "— mas’ulsiz (navbatga qaytarish) —" }, ...board.agents.filter((a) => a.id !== t.assignee_id).map((a) => ({ value: a.id, label: a.name }))]} />
            </Field>
          </ReasonModal>
        )}
      </aside>
    </div>
  );
}

function EventView({ e, t, stages, agents }: { e: DeskEvent; t: Ticket; stages: Stage[]; agents: Person[] }) {
  const meta = e.meta as Record<string, string | string[] | boolean>;
  // fayllar: nomlar (eski yozuvlar) yoki {name, url, size, kind} (saqlangan ilovalar, vakansiya rezyumesi)
  const files = (meta.files as unknown as (string | DeskFile)[]) || [];
  const vac = meta.vacancy as unknown as { title: string; slug?: string } | undefined;
  // rahbariyat qabuliga yozilish (official.py): rahbar, sana/vaqt, joy
  const rec = meta.reception as unknown as { official: string; position?: string; date: string; time: string; place?: string } | undefined;
  if (e.kind === "created" || e.kind === "message_in")
    return (
      <div className="sd-msg in">
        <Avatar name={e.author_name || t.requester_name} size={34} />
        <div className="sd-bubble">
          <div className="sd-bh">
            <b>{e.author_name || t.requester_name}</b>
            <span>
              {e.kind === "created"
                ? meta.source === "email"
                  ? "pochta orqali yozdi"
                  : meta.source === "manual"
                    ? `qo‘lda kiritildi${meta.by ? ` (${meta.by})` : ""}`
                    : meta.source === "careers"
                      ? `vakansiyaga ariza: ${vac?.title || ""}`
                      : meta.source === "reception"
                        ? "rahbariyat qabuliga yozildi (sayt)"
                      : meta.source === "telegram"
                        ? "Telegram bot orqali yozdi"
                        : meta.source === "chat"
                          ? "sayt chati orqali (chat-bot javob topa olmadi)"
                          : "saytdagi virtual qabulxona orqali yozdi"
                : meta.channel === "telegram"
                  ? "Telegram bot orqali yozdi"
                  : meta.channel === "chat"
                    ? "sayt chatida yana yozdi"
                  : "javob yozdi (pochta)"}
            </span>
            <time>{dt(e.created)}</time>
          </div>
          {rec && e.kind === "created" && (
            <dl className="sd-rec">
              <dt>Rahbar</dt>
              <dd>
                {rec.official}
                {rec.position ? ` — ${rec.position}` : ""}
              </dd>
              <dt>Sana va vaqt</dt>
              <dd>
                {rec.date.split("-").reverse().join(".")} {rec.time}
              </dd>
              {rec.place && (
                <>
                  <dt>Joy</dt>
                  <dd>{rec.place}</dd>
                </>
              )}
            </dl>
          )}
          {e.content ? <div className="sd-text">{e.content}</div> : !files.length && <div className="sd-text"><i className="muted">matn yo‘q</i></div>}
          <Attachments files={files} />
        </div>
      </div>
    );
  if (e.kind === "message_out")
    return (
      <div className="sd-msg out">
        <div className="sd-bubble">
          <div className="sd-bh">
            <b>{e.author_name}</b>
            <span>
              {meta.channel === "telegram" ? (
                <>
                  <Send size={12} /> Telegram bot
                </>
              ) : meta.channel === "chat" ? (
                <>
                  <MessagesSquare size={12} /> Sayt chati
                </>
              ) : (
                <>
                  <MailCheck size={12} /> {String(meta.from)} → {String(meta.to)}
                </>
              )}
            </span>
            <time>{dt(e.created)}</time>
          </div>
          {e.content && <div className="sd-text">{e.content}</div>}
          <Attachments files={files} />
        </div>
        <Avatar name={e.author_name} photo={e.author?.photo} size={34} />
      </div>
    );
  if (e.kind === "note")
    return (
      <div className="sd-note">
        <Lock size={13} />
        <div>
          <div className="sd-bh">
            <b>{e.author_name}</b> <span>ichki izoh</span> <time>{dt(e.created)}</time>
          </div>
          <div className="sd-text">{e.content}</div>
        </div>
      </div>
    );
  const st = (id: unknown) => stages.find((s) => s.id === id);
  let line: ReactNode = null;
  if (e.kind === "assign") line = meta.self ? <>murojaatni boshladi — mas’ul</> : <>mas’ulni o‘zgartirdi → <b>{String(meta.to_name || "mas’ulsiz") || agents.find((a) => a.id === meta.to)?.name}</b></>;
  else if (e.kind === "rating")
    line = meta.comment_only ? (
      <>baho izohini yozdi</>
    ) : (
      <>
        baho qo‘ydi: <Stars n={Number(meta.rating)} /> <b>{String(meta.rating)}/5</b>
      </>
    );
  else if (e.kind === "update") line = <>parametrlarni o‘zgartirdi {meta.priority ? `· prioritet: ${PRIO[meta.priority as Priority]?.label}` : ""} {"category_id" in meta ? "· bo‘lim" : ""}</>;
  else line = (
    <>
      bosqich: <StagePill stage={st(meta.from)} /> → <StagePill stage={st(meta.to)} />
    </>
  );
  const notified = (meta.notified as unknown as Channel[] | undefined) || [];
  const failed = !notified.length && ((meta.notify_errors as unknown as string[] | undefined) || []).length > 0;
  return (
    <div className="sd-sys">
      <span className="sd-sys-dot" />
      <b>{e.author_name}</b> {line}
      {e.content && <q>{e.content}</q>}
      {notified.length > 0 && (
        <span className="sd-sent" title="Murojaatchiga yuborildi">
          {notified.map((c) => (
            <span key={c}>
              {CHANNEL[c]?.icon} {CHANNEL[c]?.label}
            </span>
          ))}
        </span>
      )}
      {failed && (
        <span className="sd-sent bad" title={((meta.notify_errors as unknown as string[]) || []).join("; ")}>
          <AlertTriangle size={12} /> yuborilmadi
        </span>
      )}
      <time>{dt(e.created)}</time>
    </div>
  );
}

/* ------------------------------------------------------------------ bo'limlar sozlamasi */
function CategoriesModal({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const [items, setItems] = useState<Partial<DeskCategory>[] | null>(null);
  const [agents, setAgents] = useState<Person[]>([]);
  const [domain, setDomain] = useState("");
  useEffect(() => {
    desk.categories().then((r) => {
      setItems(r.items);
      setAgents(r.agents);
      setDomain(r.domain);
    });
  }, []);
  const set = (i: number, p: Partial<DeskCategory>) => items && setItems(items.map((x, j) => (j === i ? { ...x, ...p } : x)));
  return (
    <Modal
      open
      onClose={onClose}
      title="Murojaat bo‘limlari va pochta manzillari"
      width={860}
      footer={
        <>
          <Btn onClick={onClose}>Bekor qilish</Btn>
          <Btn
            kind="primary"
            onClick={async () => {
              try {
                await desk.saveCategories(items || []);
                toast("Saqlandi");
                onClose();
              } catch (e) {
                toast(errMsg(e), "error");
              }
            }}
          >
            Saqlash
          </Btn>
        </>
      }
    >
      {!items ? (
        <Spinner />
      ) : (
        <div className="sd-cats">
          <p className="a-hint" style={{ marginTop: 0 }}>
            Har bir bo‘lim o‘z pochta manziliga ega (masalan, qabul@{domain}). Javoblar shu manzildan yuboriladi, murojaatchi javob qaytarsa — xat shu chiptaga tushadi. Shu manzilga kelgan yangi xatlar ham avtomatik murojaatga aylanadi (har daqiqada tekshiriladi).
          </p>
          {items.map((c, i) => (
            <div key={c.id || i} className="sd-cat-row">
              <input type="color" value={c.color || "#2b5a94"} onChange={(e) => set(i, { color: e.target.value })} />
              <Input value={c.title || ""} onChange={(e) => set(i, { title: e.target.value })} placeholder="Bo‘lim nomi" />
              <Input value={c.mailbox || ""} onChange={(e) => set(i, { mailbox: e.target.value.toLowerCase() })} placeholder={`qabul@${domain}`} />
              <select
                className="a-input"
                value=""
                onChange={(e) => e.target.value && set(i, { member_ids: Array.from(new Set([...(c.member_ids || []), e.target.value])) })}
                title="Shu bo‘lim murojaatlarini ko‘radigan administratorlar"
              >
                <option value="">+ administrator</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
              <button className="a-icon danger" onClick={() => setItems(items.filter((_, j) => j !== i))} aria-label="O‘chirish">
                <Trash2 size={15} />
              </button>
              {(c.member_ids || []).length > 0 && (
                <div className="sd-members">
                  {(c.member_ids || []).map((m) => {
                    const a = agents.find((x) => x.id === m);
                    return a ? (
                      <span key={m}>
                        <Avatar name={a.name} photo={a.photo} size={20} /> {a.name}
                        <button onClick={() => set(i, { member_ids: (c.member_ids || []).filter((x) => x !== m) })}>
                          <X size={11} />
                        </button>
                      </span>
                    ) : null;
                  })}
                </div>
              )}
            </div>
          ))}
          <Btn size="sm" icon={<Plus size={14} />} onClick={() => setItems([...items, { title: "", color: "#2b5a94", mailbox: "", member_ids: [], active: true }])}>
            Bo‘lim qo‘shish
          </Btn>
        </div>
      )}
    </Modal>
  );
}

/* ------------------------------------------------------------------ yangi murojaat (qo'lda) */
function NewTicketModal({ board, onClose, onCreated }: { board: Board; onClose: () => void; onCreated: (id: string) => void }) {
  const toast = useToast();
  const [f, setF] = useState({ title: "", body: "", name: "", email: "", phone: "", category_id: board.categories[0]?.id || "", priority: "medium" });
  return (
    <Modal
      open
      onClose={onClose}
      title="Yangi murojaat (telefon, qabul va h.k.)"
      width={620}
      footer={
        <>
          <Btn onClick={onClose}>Bekor qilish</Btn>
          <Btn
            kind="primary"
            onClick={async () => {
              try {
                const r = await desk.create(f);
                onCreated(r.ticket.id);
              } catch (e) {
                toast(errMsg(e), "error");
              }
            }}
          >
            Yaratish
          </Btn>
        </>
      }
    >
      <div className="a-form-grid">
        <Field label="Mavzu" wide>
          <Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} autoFocus />
        </Field>
        <Field label="Murojaatchi">
          <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </Field>
        <Field label="Telefon">
          <Input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="+998" />
        </Field>
        <Field label="Email" hint="javob shu manzilga yuboriladi">
          <Input value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        </Field>
        <Field label="Bo‘lim">
          <Select value={f.category_id} onChange={(v) => setF({ ...f, category_id: v })} options={board.categories.map((c) => ({ value: c.id, label: c.title }))} />
        </Field>
        <Field label="Matn" wide>
          <Textarea rows={5} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} />
        </Field>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ sahifa */
export function DeskPage() {
  const toast = useToast();
  const [board, setBoard] = useState<Board | null>(null);
  const [view, setView] = useState<"kanban" | "list">(() => {
    try {
      return (localStorage.getItem("desk_view") as "kanban" | "list") || "kanban";
    } catch {
      return "kanban";
    }
  });
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [who, setWho] = useState("");
  // ko'rinish URL'da (?view=stats): «Statistika» tugmasi — almashtirgich; orqaga/oldinga, sahifani yangilash va
  // menyudagi «Murojaatlar» (/admin/desk) doskaga qaytaradi
  const [sp, setSp] = useSearchParams();
  const stats = sp.get("view") === "stats";
  const toggleStats = () =>
    setSp((prev) => {
      const n = new URLSearchParams(prev);
      if (n.get("view") === "stats") n.delete("view");
      else n.set("view", "stats");
      n.delete("t");
      return n;
    });
  const [open, setOpen] = useState<string | null>(sp.get("t"));
  useEffect(() => {
    const v = sp.get("t");
    if (v) setOpen(v);
  }, [sp]);
  const closeTicket = () => {
    setOpen(null);
    if (sp.has("t"))
      setSp(
        (prev) => {
          const n = new URLSearchParams(prev);
          n.delete("t");
          return n;
        },
        { replace: true },
      );
  };
  const [settings, setSettings] = useState(false);
  const [creating, setCreating] = useState(false);
  const [dragOver, setDragOver] = useState<StageId | null>(null);
  const [pendingMove, setPendingMove] = useState<{ t: Ticket; stage: Stage } | null>(null);
  const [polling, setPolling] = useState(false);
  const load = useCallback(() => desk.board({ q, category: cat, assignee: who }).then(setBoard).catch((e) => toast(errMsg(e), "error")), [q, cat, who, toast]);
  useEffect(() => {
    const h = window.setTimeout(load, 200);
    return () => window.clearTimeout(h);
  }, [load]);
  useEffect(() => {
    const h = window.setInterval(() => !document.hidden && load(), 20000);
    return () => window.clearInterval(h);
  }, [load]);
  useEffect(() => {
    try {
      localStorage.setItem("desk_view", view);
    } catch {
      /* */
    }
  }, [view]);
  const byStage = useMemo(() => {
    const m: Record<string, Ticket[]> = {};
    (board?.tickets || []).forEach((t) => (m[t.stage] = [...(m[t.stage] || []), t]));
    return m;
  }, [board]);
  if (!board) return <Spinner />;
  const drop = (stage: Stage, e: DragEvent) => {
    e.preventDefault();
    setDragOver(null);
    const id = e.dataTransfer.getData("text/ticket");
    const t = board.tickets.find((x) => x.id === id);
    if (t && t.stage !== stage.id) setPendingMove({ t, stage });
  };
  return (
    <div className="a-page sd-page">
      <PageHead
        title="Murojaatlar"
        sub="Saytdagi aloqa formasi va bo‘lim pochtalariga kelgan xatlar. «Boshlash» bosgan administrator javobgar; javob bo‘lim manzilidan pochta orqali ketadi va murojaatchining javobi shu chiptaga qaytadi."
        actions={
          <>
            <Btn kind={stats ? "primary" : "default"} pressed={stats} icon={<BarChart3 size={15} />} onClick={toggleStats}>
              Statistika
            </Btn>
            <Btn
              icon={<RefreshCw size={15} className={polling ? "spin" : ""} />}
              disabled={!board.mail_ready}
              title={board.mail_ready ? "Bo‘lim pochtalarini hozir tekshirish (avtomatik — har daqiqada)" : "Pochta serveri sozlanmagan"}
              onClick={async () => {
                setPolling(true);
                try {
                  const r = await desk.poll();
                  toast(`Yangi: ${r.new}, javoblar: ${r.reply}${r.errors.length ? ` · xato: ${r.errors.join(", ")}` : ""}`, r.errors.length ? "error" : "ok");
                  load();
                } catch (e) {
                  toast(errMsg(e), "error");
                }
                setPolling(false);
              }}
            >
              Pochtani tekshirish
            </Btn>
            <Btn icon={<Settings2 size={15} />} onClick={() => setSettings(true)}>
              Bo‘limlar
            </Btn>
            <Btn kind="accent" icon={<Plus size={15} />} onClick={() => setCreating(true)}>
              Yangi murojaat
            </Btn>
          </>
        }
      />
      {stats ? (
        <DeskStatsView board={board} />
      ) : (
      <>
      <div className="sd-stats">
        {board.stages.map((s) => (
          <div key={s.id} className="sd-stat" style={{ ["--c" as string]: s.color }}>
            <b>{board.counts[s.id] || 0}</b>
            <span>{s.title}</span>
          </div>
        ))}
        <div className="sd-stat" style={{ ["--c" as string]: "var(--md-red)" }}>
          <b>{board.counts.unread || 0}</b>
          <span>O‘qilmagan</span>
        </div>
      </div>
      {!board.mail_ready && (
        <div className="sd-warn">
          <AlertTriangle size={15} /> Pochta serveri sozlanmagan: murojaatlar saytdagi formadan tushadi, lekin pochta orqali javob yozish va bo‘lim pochtalaridan xat olish uchun admin → «Pochta serveri»ni sozlang.
        </div>
      )}
      <div className="list-tools">
        <div className="a-seg">
          <button className={view === "kanban" ? "on" : ""} onClick={() => setView("kanban")}>
            <KanbanSquare size={14} /> Doska
          </button>
          <button className={view === "list" ? "on" : ""} onClick={() => setView("list")}>
            <List size={14} /> Ro‘yxat
          </button>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Select value={who} onChange={setWho} options={[{ value: "", label: "Barcha mas’ullar" }, { value: "me", label: "Mening murojaatlarim" }, { value: "none", label: "Mas’ulsiz (navbatda)" }, ...board.agents.map((a) => ({ value: a.id, label: a.name }))]} />
          <Select value={cat} onChange={setCat} options={[{ value: "", label: "Barcha bo‘limlar" }, ...board.categories.map((c) => ({ value: c.id, label: c.title }))]} />
          <label className="a-search">
            <Search size={15} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="#raqam, ism, email, telefon…" />
          </label>
        </div>
      </div>

      {view === "kanban" ? (
        <div className="sd-board">
          {board.stages.map((s) => (
            <div
              key={s.id}
              className={`sd-col ${dragOver === s.id ? "over" : ""}`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(s.id);
              }}
              onDragLeave={() => setDragOver(null)}
              onDrop={(e) => drop(s, e)}
            >
              <div className="sd-col-h" style={{ ["--c" as string]: s.color }}>
                <i />
                <b>{s.title}</b>
                <span>{(byStage[s.id] || []).length}</span>
              </div>
              <div className="sd-col-body">
                {(byStage[s.id] || []).map((t) => (
                  <TicketCard key={t.id} t={t} onOpen={() => setOpen(t.id)} onDragStart={(e) => e.dataTransfer.setData("text/ticket", t.id)} />
                ))}
                {!(byStage[s.id] || []).length && (
                  <div className="sd-empty">
                    <Inbox size={20} />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="a-card">
          <div className="a-table-scroll">
            <table className="a-table sd-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Mavzu</th>
                  <th>Murojaatchi</th>
                  <th>Bo‘lim</th>
                  <th>Bosqich</th>
                  <th>Mas’ul</th>
                  <th>Yangilangan</th>
                </tr>
              </thead>
              <tbody>
                {board.tickets.map((t) => (
                  <tr key={t.id} className={t.unread ? "unread" : ""} onClick={() => setOpen(t.id)}>
                    <td>{t.number_label}</td>
                    <td>
                      <span className="sd-prio" style={{ background: PRIO[t.priority].color }} /> <b>{t.title}</b>
                    </td>
                    <td>
                      {t.requester_name}
                      <small className="muted"> {t.requester_email || t.requester_phone}</small>
                    </td>
                    <td>{t.category && <span className="sd-cat" style={{ ["--c" as string]: t.category.color }}>{t.category.title}</span>}</td>
                    <td>
                      <StagePill stage={board.stages.find((x) => x.id === t.stage)} />
                    </td>
                    <td>{t.assignee ? <span className="u-cell"><Avatar name={t.assignee.name} photo={t.assignee.photo} size={22} /> {t.assignee.name}</span> : <span className="muted"><UserRound size={13} /> —</span>}</td>
                    <td className="muted">{ago(t.updated)}</td>
                  </tr>
                ))}
                {!board.tickets.length && (
                  <tr>
                    <td colSpan={7} className="muted" style={{ textAlign: "center", padding: 30 }}>
                      Murojaat yo‘q
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
      </>
      )}

      {open && <TicketDrawer id={open} board={board} onClose={closeTicket} onChanged={load} />}
      {settings && (
        <CategoriesModal
          onClose={() => {
            setSettings(false);
            load();
          }}
        />
      )}
      {creating && (
        <NewTicketModal
          board={board}
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            setCreating(false);
            load();
            setOpen(id);
          }}
        />
      )}
      {pendingMove && (
        <ReasonModal
          title={`#${pendingMove.t.number_label} → «${pendingMove.stage.title}»`}
          required={pendingMove.stage.id === "failed"}
          label="Murojaatchiga izoh"
          onClose={() => setPendingMove(null)}
          onOk={async (r) => {
            try {
              await desk.move(pendingMove.t.id, pendingMove.stage.id, r);
              toast(`#${pendingMove.t.number_label} → ${pendingMove.stage.title}`);
              setPendingMove(null);
              load();
            } catch (e) {
              toast(errMsg(e), "error");
            }
          }}
        />
      )}
    </div>
  );
}
