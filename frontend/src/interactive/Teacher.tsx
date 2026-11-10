// Professor kabineti → Interaktiv: testlar ro'yxati, muharrir (aralash savollar, rasm, formula, Excel), ulashish (qisqa havola, QR),
// natijalar (kim nechta, necha foiz, savollar kesimi), natijalarni yuborish, qog'oz variantlar va «Bilimdon» o'yinlari.
import { copyOrPrompt } from "../lib/clipboard";
import {
  ArrowDown, ArrowLeft, ArrowUp, BarChart3, Check, CheckCircle2, ChevronDown, ClipboardList, Copy, Download, ExternalLink, FileSpreadsheet, Gamepad2, ImagePlus, KeyRound, Lock, MonitorPlay,
  Pencil, Plus, Printer, QrCode, Send, Share2, Timer, Trash2, Trophy, Unlock, Upload, Users, X, Zap,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, Route, Routes, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Avatar } from "../lib/Avatar";
import { Btn, Card, Empty, Field, Input, Modal, PageHead, Pill, Select, Spinner, TagInput, Textarea, Toggle, fmtDateTime, useConfirm, useRun, useToast } from "../admin/ui";
import { portal } from "../portal/api";
import { usePortal } from "../portal/PortalApp";
import { iq, qrUrl, type AccessGroup, type QOption, type Question, type QType, type Sheet, type Test, type TestSettings } from "./api";
import { IQ, fmt, type IqDict } from "./i18n";
import { RichQ } from "./RichQ";
import "../styles/interactive.css";

const uid = () => Math.random().toString(36).slice(2, 10);
const LETTER = "ABCDEFGH";

function useIq(): IqDict {
  const { lang } = usePortal();
  return IQ[lang] || IQ.uz;
}

export function InteractiveRoutes() {
  return (
    <Routes>
      <Route index element={<TestsHome />} />
      <Route path=":id" element={<TestEditor />} />
      <Route path=":id/results" element={<ResultsPage />} />
    </Routes>
  );
}

/* ------------------------------------------------------------------ ro'yxat: Testlar | Bilimdon */
type Kind = "test" | "game";
const kindOf = (t: Test): Kind => (t.settings?.kind === "game" ? "game" : "test");

function TestsHome() {
  const L = useIq();
  const nav = useNavigate();
  const run = useRun();
  const confirm = useConfirm();
  const [sp, setSp] = useSearchParams();
  const tab: Kind = sp.get("tab") === "game" ? "game" : "test";
  const [items, setItems] = useState<Test[] | null>(null);
  const [games, setGames] = useState<Awaited<ReturnType<typeof iq.liveList>>["items"]>([]);
  const [share, setShare] = useState<Test | null>(null);
  const [paper, setPaper] = useState<Test | null>(null);
  const [choose, setChoose] = useState(false);
  const load = useCallback(() => {
    iq.tests().then((r) => setItems(r.items)).catch(() => setItems([]));
    iq.liveList().then((r) => setGames(r.items)).catch(() => null);
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  const live = async (t: Test) => {
    const g = await run(() => iq.liveCreate(t.id));
    if (g) window.open(`/live/${g.id}`, "_blank");
  };
  const list = (items || []).filter((t) => kindOf(t) === tab);
  const count = (k: Kind) => (items || []).filter((t) => kindOf(t) === k).length;
  const playedOf = (id: string) => games.filter((g) => g.test_id === id).length;
  const remove = async (t: Test) => {
    if (await confirm(L.confirm_delete)) {
      await run(() => iq.remove(t.id));
      load();
    }
  };
  return (
    <div className="a-page iq-page">
      <section className={`iq-hero ${tab === "game" ? "game" : ""}`}>
        <div>
          <span className="iq-hero-tag">
            <Zap size={14} /> {L.title}
          </span>
          <h1>{tab === "game" ? L.kind_game : L.tests}</h1>
          <p>{tab === "game" ? L.kind_game_desc : L.kind_test_desc}</p>
        </div>
        <div className="iq-hero-actions">
          <Btn kind="primary" icon={<Plus size={16} />} onClick={() => setChoose(true)}>
            {L.new_item}
          </Btn>
          <a className="a-btn" href="/api/iq/template.xlsx">
            <FileSpreadsheet size={16} /> {L.template}
          </a>
        </div>
      </section>
      <div className="iq-tabs" role="tablist">
        <button role="tab" aria-selected={tab === "test"} className={tab === "test" ? "on" : ""} onClick={() => setSp({}, { replace: true })}>
          <ClipboardList size={17} /> {L.tests} <i>{count("test")}</i>
        </button>
        <button role="tab" aria-selected={tab === "game"} className={tab === "game" ? "on" : ""} onClick={() => setSp({ tab: "game" }, { replace: true })}>
          <Gamepad2 size={17} /> {L.kind_game} <i>{count("game")}</i>
        </button>
      </div>
      {!items ? (
        <Spinner />
      ) : !list.length ? (
        <Empty icon={tab === "game" ? <Gamepad2 size={28} /> : <ClipboardList size={28} />} title={tab === "game" ? L.kind_game : L.tests}>
          <p>{tab === "game" ? L.no_games : L.no_tests}</p>
          <Btn kind="primary" icon={<Plus size={15} />} onClick={() => nav(`new?kind=${tab}`)}>
            {tab === "game" ? L.new_game : L.new_test}
          </Btn>
        </Empty>
      ) : (
        <div className="iq-grid">
          {list.map((t) =>
            tab === "game" ? (
              <div key={t.id} className="iq-card game">
                <div className="iq-card-top">
                  <Pill tone="info">
                    <Gamepad2 size={12} /> {L.kind_game}
                  </Pill>
                  {t.settings.subject && <span className="iq-subj">{t.settings.subject}</span>}
                </div>
                <Link to={t.id} className="iq-card-title">
                  {t.title}
                </Link>
                <div className="iq-card-stats">
                  <span>
                    <b>{t.count}</b> {L.questions_n}
                  </span>
                  <span>
                    <b>{playedOf(t.id)}</b> {L.games_played}
                  </span>
                </div>
                <div className="iq-card-actions">
                  <Btn size="sm" kind="accent" icon={<MonitorPlay size={14} />} disabled={!t.count} onClick={() => live(t)}>
                    {L.play_now}
                  </Btn>
                  <Btn size="sm" icon={<Pencil size={14} />} onClick={() => nav(t.id)}>
                    {L.edit}
                  </Btn>
                  <button className="a-icon danger" title={L.delete} onClick={() => remove(t)}>
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ) : (
              <div key={t.id} className={`iq-card st-${t.status}`}>
                <div className="iq-card-top">
                  <Pill tone={t.status === "open" ? "ok" : t.status === "closed" ? "muted" : "warn"}>{L[`status_${t.status}` as keyof IqDict] as string}</Pill>
                  {t.settings.subject && <span className="iq-subj">{t.settings.subject}</span>}
                </div>
                <Link to={t.id} className="iq-card-title">
                  {t.title}
                </Link>
                <div className="iq-card-stats">
                  <span>
                    <b>{t.count}</b> {L.questions_n}
                  </span>
                  <span>
                    <b>{t.finished}</b> {L.attempts_n}
                  </span>
                  <span>
                    <b>{t.avg != null ? `${t.avg}%` : "—"}</b> {L.avg}
                  </span>
                </div>
                <div className="iq-card-actions">
                  <Btn size="sm" icon={<Pencil size={14} />} onClick={() => nav(t.id)}>
                    {L.edit}
                  </Btn>
                  <Btn size="sm" icon={<BarChart3 size={14} />} onClick={() => nav(`${t.id}/results`)}>
                    {L.results}
                  </Btn>
                  <Btn size="sm" icon={<Share2 size={14} />} onClick={() => setShare(t)}>
                    {L.share}
                  </Btn>
                  <Btn size="sm" icon={<Printer size={14} />} disabled={!t.count} onClick={() => setPaper(t)}>
                    {L.paper}
                  </Btn>
                  <button className="a-icon danger" title={L.delete} onClick={() => remove(t)}>
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ),
          )}
        </div>
      )}
      {tab === "game" && games.length > 0 && (
        <Card title={L.past_games} className="iq-games">
          {games.slice(0, 10).map((g) => (
            <div key={g.id} className="iq-game-row">
              <span className="iq-pin">{g.pin}</span>
              <span className="iq-game-t">
                <b>{g.title}</b>
                <small>
                  {fmtDateTime(g.created)} · {g.players} {L.players}
                  {g.top.length ? ` · 🥇 ${g.top[0].name} (${g.top[0].score})` : ""}
                </small>
              </span>
              <Pill tone={g.finished ? "muted" : "ok"}>{g.finished ? L.game_over : g.phase}</Pill>
              <a className="a-btn sm" href={`/live/${g.id}`} target="_blank" rel="noreferrer">
                <ExternalLink size={13} /> {L.open_host}
              </a>
            </div>
          ))}
        </Card>
      )}
      {choose && (
        <Modal open onClose={() => setChoose(false)} title={L.choose_kind} width={720}>
          <div className="iq-kinds">
            <button className="iq-kind test" onClick={() => nav("new?kind=test")}>
              <span className="iq-kind-ic">
                <ClipboardList size={30} />
              </span>
              <b>{L.kind_test}</b>
              <p>{L.kind_test_desc}</p>
              <span className="iq-kind-tags">
                <i>
                  <QrCode size={12} /> QR
                </i>
                <i>
                  <Printer size={12} /> PDF
                </i>
                <i>
                  <BarChart3 size={12} /> %
                </i>
              </span>
            </button>
            <button className="iq-kind game" onClick={() => nav("new?kind=game")}>
              <span className="iq-kind-ic">
                <Gamepad2 size={30} />
              </span>
              <b>{L.kind_game}</b>
              <p>{L.kind_game_desc}</p>
              <span className="iq-kind-tags">
                <i>
                  <Timer size={12} /> {L.seconds}
                </i>
                <i>
                  <Trophy size={12} /> 1·2·3
                </i>
              </span>
            </button>
          </div>
        </Modal>
      )}
      {share && <ShareModal t={share} onClose={() => setShare(null)} onChanged={load} />}
      {paper && <PaperModal t={paper} onClose={() => setPaper(null)} />}
    </div>
  );
}

/* ------------------------------------------------------------------ ulashish */
function ShareModal({ t, onClose, onChanged }: { t: Test; onClose: () => void; onChanged: () => void }) {
  const L = useIq();
  const run = useRun();
  const toast = useToast();
  const [cur, setCur] = useState(t);
  const path = `/t/${cur.code}`;
  const url = `${window.location.origin}${path}`;
  const toggle = async () => {
    const r = await run(() => iq.status(cur.id, cur.status === "open" ? "closed" : "open"));
    if (r) {
      setCur({ ...cur, ...r });
      onChanged();
    }
  };
  return (
    <Modal open onClose={onClose} title={`${L.share}: ${cur.title}`} width={620}>
      <div className="iq-share">
        <img src={qrUrl(path)} alt="QR" className="iq-qr" />
        <div className="iq-share-r">
          <Field label={L.link}>
            <div className="iq-link">
              <input className="a-input" readOnly value={url} onFocus={(e) => e.target.select()} />
              <Btn
                icon={<Copy size={14} />}
                onClick={() => {
                  copyOrPrompt(url, L.copy).then((ok) => ok && toast(L.copied));
                }}
              >
                {L.copy}
              </Btn>
            </div>
          </Field>
          <div className="iq-code">{cur.code.toUpperCase()}</div>
          <p className="a-hint">{L.share_hint}</p>
          <Btn kind={cur.status === "open" ? "danger" : "primary"} icon={cur.status === "open" ? <Lock size={15} /> : <Unlock size={15} />} onClick={toggle}>
            {cur.status === "open" ? L.close_test : L.open_test}
          </Btn>
        </div>
      </div>
    </Modal>
  );
}

// Fayl nomi serverdan (Content-Disposition) olinadi: «Test_nomi_1guruh(variant).pdf»
async function savePdf(url: string): Promise<void> {
  const r = await fetch(url, { credentials: "same-origin" });
  if (!r.ok) throw new Error(String(r.status));
  const cd = r.headers.get("content-disposition") || "";
  const m = /filename\*=UTF-8''([^;]+)/i.exec(cd) || /filename="?([^";]+)"?/i.exec(cd);
  const name = m ? decodeURIComponent(m[1]) : "test.pdf";
  const blob = await r.blob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

function PaperModal({ t, onClose }: { t: Test; onClose: () => void }) {
  const L = useIq();
  const toast = useToast();
  const [n, setN] = useState(Math.max(1, Math.min(30, t.settings.variants || 2)));
  const [busy, setBusy] = useState<Record<number, boolean>>({});
  const [done, setDone] = useState<Record<number, boolean>>({});
  const one = async (g: number) => {
    setBusy((b) => ({ ...b, [g]: true }));
    try {
      await savePdf(iq.paperPdfUrl(t.id, n, g));
      setDone((d) => ({ ...d, [g]: true }));
      return true;
    } catch {
      toast(L.pdf_failed, "error");
      return false;
    } finally {
      setBusy((b) => ({ ...b, [g]: false }));
    }
  };
  const all = async () => {
    for (let g = 1; g <= n; g++) if (!(await one(g))) return;
    await one(0);
  };
  const anyBusy = Object.values(busy).some(Boolean);
  return (
    <Modal
      open
      onClose={onClose}
      title={`${L.paper}: ${t.title}`}
      width={560}
      footer={
        <>
          <a className="a-btn" href={`/print/iq/${t.id}?v=${n}`} target="_blank" rel="noreferrer">
            <Printer size={15} /> {L.print_browser}
          </a>
          <Btn kind="primary" icon={<Download size={15} />} busy={anyBusy} onClick={all}>
            {L.download_all}
          </Btn>
        </>
      }
    >
      <Field label={L.groups_n} hint={L.groups_n_hint}>
        <div className="iq-variants">
          {[1, 2, 3, 4, 5, 6, 8, 10].map((x) => (
            <button
              key={x}
              className={x === n ? "on" : ""}
              onClick={() => {
                setN(x);
                setDone({});
              }}
            >
              {x}
            </button>
          ))}
          <Input
            type="number"
            min={1}
            max={30}
            value={n}
            onChange={(e) => {
              setN(Math.max(1, Math.min(30, Number(e.target.value) || 1)));
              setDone({});
            }}
            style={{ width: 90 }}
          />
        </div>
      </Field>
      <div className="iq-pdfs">
        {Array.from({ length: n }, (_, k) => k + 1).map((g) => (
          <div key={g} className={`iq-pdf ${done[g] ? "done" : ""}`}>
            <span className="iq-pdf-n">{g}</span>
            <span className="iq-pdf-t">
              <b>{fmt(L.group_variant, { n: g })}</b>
              <small>
                {t.title.replace(/\s+/g, "_")}_{g}guruh(variant).pdf
              </small>
            </span>
            <Btn size="sm" icon={done[g] ? <Check size={14} /> : <Download size={14} />} busy={busy[g]} onClick={() => one(g)}>
              PDF
            </Btn>
          </div>
        ))}
        <div className={`iq-pdf key ${done[0] ? "done" : ""}`}>
          <span className="iq-pdf-n">
            <KeyRound size={15} />
          </span>
          <span className="iq-pdf-t">
            <b>{L.key}</b>
            <small>{t.title.replace(/\s+/g, "_")}_javoblar_kaliti.pdf</small>
          </span>
          <Btn size="sm" icon={done[0] ? <Check size={14} /> : <Download size={14} />} busy={busy[0]} onClick={() => one(0)}>
            PDF
          </Btn>
        </div>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ muharrir */
const blankQ = (type: QType = "single"): Question => ({
  id: uid(),
  type,
  text: "",
  image: "",
  points: 1,
  time: 20,
  options: type === "text" ? [] : [0, 1, 2, 3].map(() => ({ id: uid(), text: "", image: "" })),
  correct: [],
  answers: [],
});

function ImageBtn({ value, onChange, small }: { value?: string; onChange: (v: string) => void; small?: boolean }) {
  const L = useIq();
  const run = useRun();
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  return (
    <>
      {value ? (
        <span className={`iq-img ${small ? "sm" : ""}`}>
          <img src={value} alt="" />
          <button onClick={() => onChange("")} title={L.remove}>
            <X size={12} />
          </button>
        </span>
      ) : (
        <button className={`iq-addimg ${small ? "sm" : ""}`} onClick={() => ref.current?.click()} disabled={busy} title={L.add_image}>
          <ImagePlus size={small ? 14 : 16} /> {!small && L.image}
        </button>
      )}
      <input
        ref={ref}
        type="file"
        accept="image/*"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          setBusy(true);
          const r = await run(() => portal.upload(f));
          setBusy(false);
          if (r) onChange(r.url);
        }}
      />
    </>
  );
}

function QuestionEditor({ q, n, kind, onChange, onRemove, onMove }: { q: Question; n: number; kind: Kind; onChange: (q: Question) => void; onRemove: () => void; onMove: (d: number) => void }) {
  const L = useIq();
  const setOpt = (i: number, p: Partial<QOption>) => onChange({ ...q, options: q.options.map((o, j) => (j === i ? { ...o, ...p } : o)) });
  const toggleCorrect = (id: string) =>
    onChange({ ...q, correct: q.type === "single" ? [id] : q.correct.includes(id) ? q.correct.filter((x) => x !== id) : [...q.correct, id] });
  const invalid = q.type === "text" ? !(q.answers || []).length : !q.correct.length || q.options.filter((o) => o.text || o.image).length < 2;
  return (
    <div className={`iq-q ${invalid ? "invalid" : ""}`}>
      <div className="iq-q-head">
        <span className="iq-q-n">{n}</span>
        <Select
          value={q.type}
          onChange={(v) => onChange({ ...q, type: v as QType, correct: v === "single" ? q.correct.slice(0, 1) : q.correct, options: v === "text" ? [] : q.options.length ? q.options : blankQ().options })}
          options={[
            { value: "single", label: L.type_single },
            { value: "multi", label: L.type_multi },
            { value: "text", label: L.type_text },
          ]}
        />
        {kind === "test" ? (
          <label className="iq-mini">
            {L.points}
            <input className="a-input" type="number" min={0} step={0.5} value={q.points} onChange={(e) => onChange({ ...q, points: Number(e.target.value) || 0 })} />
          </label>
        ) : (
          <label className="iq-mini">
            <Timer size={13} /> {L.seconds}
            <input className="a-input" type="number" min={5} max={240} value={q.time} onChange={(e) => onChange({ ...q, time: Number(e.target.value) || 20 })} />
          </label>
        )}
        <span className="iq-q-tools">
          <button className="a-icon" onClick={() => onMove(-1)} title="↑">
            <ArrowUp size={14} />
          </button>
          <button className="a-icon" onClick={() => onMove(1)} title="↓">
            <ArrowDown size={14} />
          </button>
          <button className="a-icon danger" onClick={onRemove} title={L.remove}>
            <Trash2 size={14} />
          </button>
        </span>
      </div>
      <div className="iq-q-body">
        <Textarea rows={2} value={q.text} placeholder={L.q_text} onChange={(e) => onChange({ ...q, text: e.target.value })} />
        <ImageBtn value={q.image} onChange={(v) => onChange({ ...q, image: v })} />
      </div>
      {(q.text.includes("$") || (q.type !== "text" && q.options.some((o) => o.text.includes("$")))) && (
        <div className="iq-preview">
          <RichQ text={q.text} />
          {q.type !== "text" && q.options.some((o) => o.text.includes("$")) && (
            <div className="iq-preview-opts">
              {q.options.map((o, i) => (
                <span key={o.id} className={q.correct.includes(o.id) ? "ok" : ""}>
                  <b>{LETTER[i]}</b> <RichQ text={o.text} />
                </span>
              ))}
            </div>
          )}
        </div>
      )}
      {q.type === "text" ? (
        <Field label={L.answers}>
          <TagInput value={q.answers || []} onChange={(v) => onChange({ ...q, answers: v })} placeholder={L.answers_ph} />
        </Field>
      ) : (
        <div className="iq-opts">
          {q.options.map((o, i) => (
            <div key={o.id} className={`iq-opt ${q.correct.includes(o.id) ? "ok" : ""}`}>
              <button className="iq-opt-mark" onClick={() => toggleCorrect(o.id)} title={L.correct}>
                {q.correct.includes(o.id) ? <Check size={14} /> : LETTER[i]}
              </button>
              <input className="a-input" value={o.text} placeholder={`${L.option} ${LETTER[i]}`} onChange={(e) => setOpt(i, { text: e.target.value })} />
              <ImageBtn small value={o.image} onChange={(v) => setOpt(i, { image: v })} />
              {q.options.length > 2 && (
                <button className="a-icon" onClick={() => onChange({ ...q, options: q.options.filter((_, j) => j !== i), correct: q.correct.filter((c) => c !== o.id) })}>
                  <X size={14} />
                </button>
              )}
            </div>
          ))}
          {q.options.length < 8 && (
            <button className="iq-addopt" onClick={() => onChange({ ...q, options: [...q.options, { id: uid(), text: "", image: "" }] })}>
              <Plus size={14} /> {L.add_option}
            </button>
          )}
        </div>
      )}
      {invalid && <small className="iq-warn">{L.no_correct}</small>}
    </div>
  );
}

function TestEditor() {
  const L = useIq();
  const { id = "new" } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const run = useRun();
  const [t, setT] = useState<Partial<Test> | null>(null);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const [sp] = useSearchParams();
  const newKind: Kind = sp.get("kind") === "game" ? "game" : "test";
  useEffect(() => {
    if (id === "new")
      setT({
        title: "",
        description: "",
        questions: [blankQ()],
        settings: { time_limit: 30, shuffle_questions: true, shuffle_options: true, show_score: false, attempts: 1, group_ids: [], access: newKind === "game" ? "code" : "groups", blocked_student_ids: [], subject: "", pass_percent: 0, kind: newKind, variants: 2, secure: true, max_leaves: 3 },
        opens: null,
        closes: null,
      });
    else iq.test(id).then(setT).catch(() => nav("..", { relative: "path" }));
  }, [id, nav, newKind]);
  const set = (p: Partial<Test>) => {
    setT((x) => ({ ...(x || {}), ...p }));
    setDirty(true);
  };
  if (!t) return <Spinner />;
  const qs = t.questions || [];
  const st = t.settings!;
  const kind: Kind = st.kind === "game" ? "game" : "test";
  const back = kind === "game" ? "..?tab=game" : "..";
  const setQ = (i: number, q: Question) => set({ questions: qs.map((x, j) => (j === i ? q : x)) });
  const save = async () => {
    if (!t.title?.trim()) return toast(L.test_title, "error");
    setBusy(true);
    const body = { title: t.title, description: t.description, questions: qs, settings: st, opens: t.opens, closes: t.closes };
    const r = await run(() => (id === "new" ? iq.create(body) : iq.save(id, body)), L.saved);
    setBusy(false);
    if (r) {
      setDirty(false);
      if (id === "new") nav(`../${r.id}`, { relative: "path", replace: true });
      else setT(r);
    }
  };
  return (
    <div className="a-page iq-page">
      <PageHead
        title={id === "new" ? (kind === "game" ? L.new_game : L.new_test) : t.title || L.edit}
        sub={
          <span className={`iq-kind-badge ${kind}`}>
            {kind === "game" ? <Gamepad2 size={14} /> : <ClipboardList size={14} />} {kind === "game" ? L.kind_game : L.kind_test}
          </span>
        }
        actions={
          <>
            <Link to={back} relative="path" className="a-btn ghost">
              <ArrowLeft size={15} /> {L.back}
            </Link>
            {id !== "new" && kind === "test" && (
              <Link to="results" className="a-btn">
                <BarChart3 size={15} /> {L.results}
              </Link>
            )}
            {id !== "new" && kind === "game" && (
              <Btn
                kind="accent"
                icon={<MonitorPlay size={15} />}
                disabled={dirty || !qs.length}
                onClick={async () => {
                  const g = await run(() => iq.liveCreate(id));
                  if (g) window.open(`/live/${g.id}`, "_blank");
                }}
              >
                {L.play_now}
              </Btn>
            )}
            <Btn kind="primary" busy={busy} disabled={!dirty && id !== "new"} onClick={save}>
              {L.save}
            </Btn>
          </>
        }
      />
      <div className="iq-editor">
        <div className="iq-main">
          <Card>
            <Field label={L.test_title}>
              <Input value={t.title || ""} onChange={(e) => set({ title: e.target.value })} />
            </Field>
            <Field label={L.description}>
              <Textarea rows={2} value={t.description || ""} onChange={(e) => set({ description: e.target.value })} />
            </Field>
          </Card>
          <AccessCard testId={id} st={st} onChange={(settings) => set({ settings })} />
          <div className="iq-qhead">
            <h3>
              {L.questions} <i>{qs.length}</i>
            </h3>
            <div className="a-row">
              <Btn icon={<Upload size={15} />} onClick={() => file.current?.click()}>
                {L.import_xlsx}
              </Btn>
              <a className="a-btn" href="/api/iq/template.xlsx">
                <Download size={15} /> {L.template}
              </a>
              <input
                ref={file}
                type="file"
                accept=".xlsx"
                hidden
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (!f) return;
                  const r = await run(() => iq.importXlsx(f));
                  if (r) {
                    const keep = qs.filter((q) => q.text || q.image);
                    set({ questions: [...keep, ...r.questions] });
                    toast(fmt(L.imported, { n: r.questions.length }) + (r.errors.length ? ` · ${r.errors.join("; ")}` : ""), r.errors.length ? "error" : undefined);
                  }
                }}
              />
            </div>
          </div>
          {qs.map((q, i) => (
            <QuestionEditor
              key={q.id}
              q={q}
              n={i + 1}
              kind={kind}
              onChange={(nq) => setQ(i, nq)}
              onRemove={() => set({ questions: qs.filter((_, j) => j !== i) })}
              onMove={(d) => {
                const j = i + d;
                if (j < 0 || j >= qs.length) return;
                const arr = [...qs];
                [arr[i], arr[j]] = [arr[j], arr[i]];
                set({ questions: arr });
              }}
            />
          ))}
          <div className="iq-addq">
            {(["single", "multi", "text"] as QType[]).map((ty) => (
              <button key={ty} onClick={() => set({ questions: [...qs, blankQ(ty)] })}>
                <Plus size={15} /> {L[`type_${ty}` as keyof IqDict]}
              </button>
            ))}
          </div>
          <p className="a-hint">{L.q_text_hint}</p>
        </div>
        <aside className="iq-side">
          <Card title={L.settings}>
            <Field label={L.subject}>
              <Input value={st.subject} onChange={(e) => set({ settings: { ...st, subject: e.target.value } })} />
            </Field>
            {kind === "game" ? (
              <>
                <Toggle checked={st.shuffle_options} onChange={(v) => set({ settings: { ...st, shuffle_options: v } })} label={L.shuffle_o} />
                <div className="iq-game-hint">
                  <Timer size={15} />
                  <span>{L.game_hint}</span>
                </div>
              </>
            ) : (
              <>
                <div className="a-grid2">
                  <Field label={L.time_limit} hint={L.time_limit_hint}>
                    <Input type="number" min={0} max={600} value={st.time_limit} onChange={(e) => set({ settings: { ...st, time_limit: Number(e.target.value) || 0 } })} />
                  </Field>
                  <Field label={L.attempts}>
                    <Input type="number" min={1} max={10} value={st.attempts} onChange={(e) => set({ settings: { ...st, attempts: Number(e.target.value) || 1 } })} />
                  </Field>
                </div>
                <Field label={L.groups_n} hint={L.groups_n_hint}>
                  <Input type="number" min={1} max={30} value={st.variants || 2} onChange={(e) => set({ settings: { ...st, variants: Math.max(1, Math.min(30, Number(e.target.value) || 1)) } })} />
                </Field>
                <Field label={L.opens}>
                  <Input type="datetime-local" value={t.opens ? toLocal(t.opens) : ""} onChange={(e) => set({ opens: e.target.value ? new Date(e.target.value).toISOString() : null })} />
                </Field>
                <Field label={L.closes}>
                  <Input type="datetime-local" value={t.closes ? toLocal(t.closes) : ""} onChange={(e) => set({ closes: e.target.value ? new Date(e.target.value).toISOString() : null })} />
                </Field>
                <Toggle checked={st.shuffle_questions} onChange={(v) => set({ settings: { ...st, shuffle_questions: v } })} label={L.shuffle_q} />
                <Toggle checked={st.shuffle_options} onChange={(v) => set({ settings: { ...st, shuffle_options: v } })} label={L.shuffle_o} />
                <Toggle checked={st.show_score} onChange={(v) => set({ settings: { ...st, show_score: v } })} label={L.show_score} />
                <Toggle checked={st.secure !== false} onChange={(v) => set({ settings: { ...st, secure: v } })} label={L.secure_mode} />
                {st.secure !== false && (
                  <Field label={L.max_leaves} hint={L.secure_hint}>
                    <Input type="number" min={1} max={10} value={st.max_leaves || 3} onChange={(e) => set({ settings: { ...st, max_leaves: Math.max(1, Math.min(10, Number(e.target.value) || 3)) } })} />
                  </Field>
                )}
              </>
            )}
          </Card>
        </aside>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ kirish: guruhlar va alohida talabalar */
function AccessCard({ testId, st, onChange }: { testId: string; st: TestSettings; onChange: (s: TestSettings) => void }) {
  const L = useIq();
  const [groups, setGroups] = useState<AccessGroup[] | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  useEffect(() => {
    iq.accessGroups(testId === "new" ? undefined : testId)
      .then((r) => setGroups(r.items))
      .catch(() => setGroups([]));
  }, [testId]);
  const mode = st.access === "code" ? "code" : "groups";
  const gids = st.group_ids || [];
  const blocked = new Set(st.blocked_student_ids || []);
  const setBlocked = (ids: string[], block: boolean) => {
    const next = new Set(blocked);
    ids.forEach((x) => (block ? next.add(x) : next.delete(x)));
    onChange({ ...st, blocked_student_ids: [...next] });
  };
  const toggleGroup = (gid: string) => {
    const on = !gids.includes(gid);
    onChange({ ...st, group_ids: on ? [...gids, gid] : gids.filter((x) => x !== gid) });
    if (on) setOpen((o) => ({ ...o, [gid]: true }));
  };
  const shown = (groups || []).filter((g) => g.assigned || (mode === "groups" && gids.includes(g.id)));
  const mine = (groups || []).filter((g) => g.assigned);
  return (
    <Card title={L.access} className="iq-access">
      <div className="iq-access-mode" role="radiogroup" aria-label={L.access}>
        {(["groups", "code"] as const).map((m) => (
          <label key={m} className={mode === m ? "on" : ""}>
            <input type="radio" name="iq-access" checked={mode === m} onChange={() => onChange({ ...st, access: m })} />
            <span>{m === "groups" ? L.access_groups : L.access_code}</span>
          </label>
        ))}
      </div>
      {!groups ? (
        <Spinner />
      ) : !mine.length && !shown.length ? (
        <p className="iq-access-empty">
          <Users size={16} /> {L.no_my_groups}
        </p>
      ) : (
        <div className="iq-ag-list">
          {shown.map((g) => {
            const sel = gids.includes(g.id);
            const active = mode === "code" || sel;
            const allowed = g.students.filter((x) => !blocked.has(x.id)).length;
            const expanded = active && g.assigned && !!open[g.id];
            return (
              <div key={g.id} className={`iq-ag ${active ? "on" : ""}`}>
                <div className="iq-ag-head">
                  {mode === "groups" ? (
                    <label className="iq-ag-name">
                      <input type="checkbox" checked={sel} onChange={() => toggleGroup(g.id)} />
                      <b>{g.name}</b>
                    </label>
                  ) : (
                    <span className="iq-ag-name">
                      <b>{g.name}</b>
                    </span>
                  )}
                  {!g.assigned ? (
                    <small className="iq-ag-note">{L.not_assigned}</small>
                  ) : active ? (
                    <button type="button" className="iq-ag-more" aria-expanded={expanded} onClick={() => setOpen((o) => ({ ...o, [g.id]: !o[g.id] }))}>
                      {fmt(L.students_allowed, { n: allowed, m: g.students.length })}
                      <ChevronDown size={15} />
                    </button>
                  ) : (
                    <small className="iq-ag-note">{fmt(L.students_allowed, { n: 0, m: g.students.length })}</small>
                  )}
                </div>
                {expanded && g.students.length > 0 && (
                  <div className="iq-ag-body">
                    <div className="iq-ag-bulk">
                      <button type="button" onClick={() => setBlocked(g.students.map((x) => x.id), false)}>
                        {L.select_all}
                      </button>
                      <button type="button" onClick={() => setBlocked(g.students.map((x) => x.id), true)}>
                        {L.select_none}
                      </button>
                    </div>
                    <ul className="iq-ag-students">
                      {g.students.map((x) => (
                        <li key={x.id} className={blocked.has(x.id) ? "off" : ""}>
                          <label>
                            <input type="checkbox" checked={!blocked.has(x.id)} onChange={(e) => setBlocked([x.id], !e.target.checked)} />
                            <Avatar name={x.name} photo={x.photo} size={28} />
                            <span>{x.name}</span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {mode === "groups" && groups && !gids.length && mine.length > 0 && <small className="iq-warn">{L.no_group_selected}</small>}
    </Card>
  );
}

function toLocal(iso: string) {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/* ------------------------------------------------------------------ natijalar */
function ResultsPage() {
  const L = useIq();
  const { id = "" } = useParams();
  const run = useRun();
  const toast = useToast();
  const confirm = useConfirm();
  const [d, setD] = useState<Awaited<ReturnType<typeof iq.results>> | null>(null);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [share, setShare] = useState(false);
  const load = useCallback(() => iq.results(id).then(setD).catch(() => null), [id]);
  useEffect(() => {
    load();
    const h = window.setInterval(() => !document.hidden && load(), 8000);
    return () => window.clearInterval(h);
  }, [load]);
  const avg = useMemo(() => {
    const f = (d?.rows || []).filter((r) => r.finished);
    return f.length ? Math.round(f.reduce((a, r) => a + (r.percent || 0), 0) / f.length) : null;
  }, [d]);
  if (!d) return <Spinner />;
  const t = d.test;
  const fin = d.rows.filter((r) => r.finished);
  return (
    <div className="a-page iq-page">
      <PageHead
        title={`${L.results}: ${t.title}`}
        actions={
          <>
            <Link to=".." relative="path" className="a-btn ghost">
              <ArrowLeft size={15} /> {L.edit}
            </Link>
            <Btn icon={<Share2 size={15} />} onClick={() => setShare(true)}>
              {L.share}
            </Btn>
            <a className="a-btn" href={`/api/iq/tests/${id}/results.xlsx`}>
              <Download size={15} /> {L.export}
            </a>
            <Btn
              kind="accent"
              icon={<Send size={15} />}
              disabled={!d.rows.length}
              onClick={async () => {
                if (!(await confirm(L.send_confirm, false))) return;
                const r = await run(() => iq.release(id));
                if (r) {
                  toast(fmt(L.sent_ok, { n: r.sent }));
                  load();
                }
              }}
            >
              {L.send_results}
            </Btn>
          </>
        }
      />
      <div className="iq-kpis">
        <div>
          <Users size={18} />
          <b>{d.rows.length}</b>
          <small>{L.attempts_n}</small>
        </div>
        <div>
          <CheckCircle2 size={18} />
          <b>{fin.length}</b>
          <small>{L.finished_lbl}</small>
        </div>
        <div>
          <BarChart3 size={18} />
          <b>{avg != null ? `${avg}%` : "—"}</b>
          <small>{L.avg}</small>
        </div>
        <div>
          <QrCode size={18} />
          <b className="mono">{t.code.toUpperCase()}</b>
          <small>{L[`status_${t.status}` as keyof IqDict]}</small>
        </div>
      </div>
      <Card title={L.results} pad={false}>
        <div className="a-table-scroll">
          <table className="a-table iq-table">
            <thead>
              <tr>
                <th>#</th>
                <th>{L.student}</th>
                <th>{L.group}</th>
                <th>{L.correct_n}</th>
                <th>{L.score}</th>
                <th>{L.percent}</th>
                <th>{L.leaves_col}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {d.rows.map((r, i) => (
                <tr key={r.id}>
                  <td>{i + 1}</td>
                  <td>
                    <span className="u-cell">
                      <Avatar name={r.user.name} photo={r.user.photo} size={28} /> {r.user.name}
                    </span>
                  </td>
                  <td>{r.user.group || "—"}</td>
                  <td>
                    {r.finished ? (
                      <>
                        {r.correct} / {r.total}
                      </>
                    ) : (
                      <Pill tone="info">{L.in_progress}</Pill>
                    )}
                  </td>
                  <td>{r.score != null ? `${r.score} / ${r.max_score}` : "—"}</td>
                  <td>
                    {r.percent != null && (
                      <span className="iq-pct">
                        <i style={{ width: `${r.percent}%`, background: r.percent >= 80 ? "var(--md-green)" : r.percent >= 55 ? "var(--md-gold-c)" : "var(--md-red)" }} />
                        <b>{r.percent}%</b>
                      </span>
                    )}
                  </td>
                  <td>
                    {r.closed_reason === "violations" ? (
                      <Pill tone="bad">
                        {r.violations} · {L.closed_mark}
                      </Pill>
                    ) : r.violations ? (
                      <Pill tone="warn">{r.violations}</Pill>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="num">
                    {r.sent && <Pill tone="ok">{L.sent_mark}</Pill>}{" "}
                    {r.finished && (
                      <Btn size="sm" onClick={async () => setSheet(await iq.sheet(r.id))}>
                        {L.sheet}
                      </Btn>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      {d.pending.length > 0 && (
        <Card title={`${L.not_started} · ${d.pending.length}`}>
          <ul className="iq-notstarted">
            {d.pending.map((p) => (
              <li key={p.id}>
                <Avatar name={p.name} photo={p.photo} size={28} />
                <span>
                  {p.name}
                  <small>{p.group}</small>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <Card title={L.by_question}>
        <div className="iq-qstats">
          {d.questions.map((q, i) => (
            <div key={q.id} className="iq-qstat">
              <span className="iq-q-n">{i + 1}</span>
              <span className="iq-qstat-t">
                <RichQ text={q.text} />
              </span>
              <span className="iq-pct wide">
                <i style={{ width: `${q.percent}%`, background: q.percent >= 70 ? "var(--md-green)" : q.percent >= 40 ? "var(--md-gold-c)" : "var(--md-red)" }} />
                <b>
                  {q.percent}% · {q.correct}/{q.answered}
                </b>
              </span>
            </div>
          ))}
        </div>
      </Card>
      {sheet && <SheetModal sheet={sheet} onClose={() => setSheet(null)} />}
      {share && <ShareModal t={t} onClose={() => setShare(false)} onChanged={load} />}
    </div>
  );
}

export function SheetView({ sheet, L }: { sheet: Sheet; L: IqDict }) {
  return (
    <div className="iq-sheet">
      <div className="iq-sheet-score">
        <b>{sheet.percent}%</b>
        <span>
          {sheet.score} / {sheet.max_score} · {sheet.rows.filter((r) => r.ok).length}/{sheet.rows.length} {L.correct_n.toLowerCase()}
        </span>
      </div>
      {sheet.rows.map((r) => {
        const letter: Record<string, string> = Object.fromEntries(r.options.map((o, i) => [o.id, LETTER[i]]));
        const sel = Array.isArray(r.answer) ? r.answer : r.answer ? [r.answer] : [];
        return (
          <div key={r.id} className={`iq-sheet-row ${r.ok ? "ok" : "bad"}`}>
            <span className="iq-q-n">{r.n}</span>
            <div>
              <RichQ text={r.text} image={r.image} />
              {r.type === "text" ? (
                <div className="iq-sheet-a">
                  <span className={r.ok ? "ok" : "bad"}>
                    {L.your_answer}: <b>{String(r.answer || "") || L.no_answer}</b>
                  </span>
                  {!r.ok && (
                    <span className="ok">
                      {L.right_answer}: <b>{r.accepted.join(" / ")}</b>
                    </span>
                  )}
                </div>
              ) : (
                <ul className="iq-sheet-opts">
                  {r.options.map((o) => (
                    <li key={o.id} className={`${r.correct.includes(o.id) ? "right" : ""} ${sel.includes(o.id) ? "mine" : ""}`}>
                      <i>{letter[o.id]}</i> <RichQ text={o.text} image={o.image} />
                      {sel.includes(o.id) && <em>{r.correct.includes(o.id) ? "✓" : "✗"}</em>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <b className="iq-sheet-pts">{r.got}</b>
          </div>
        );
      })}
    </div>
  );
}

function SheetModal({ sheet, onClose }: { sheet: Sheet; onClose: () => void }) {
  const L = useIq();
  return (
    <Modal open onClose={onClose} title={`${L.sheet}: ${sheet.user?.name || ""}`} width={760}>
      <SheetView sheet={sheet} L={L} />
    </Modal>
  );
}
