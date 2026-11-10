// Alohida ekranlar (kabinet menyusisiz): /t/:code — test yechish, /b/:pin — «Bilimdon» o'yinchisi,
// /live/:id — «Bilimdon» boshlovchi ekrani (projektor), /print/iq/:id — qog'oz variantlar va javoblar kaliti.
import { AlertTriangle, ArrowLeft, ArrowRight, Check, CheckCircle2, Clock, Crown, EyeOff, Flag, Maximize2, Play, Printer, ShieldCheck, SkipForward, Trophy, Users, X, Zap } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ApiError, auth, type User } from "../lib/api";
import { iq, type PaperData, qrUrl, type Attempt, type LiveView, type PaperVariant, type PublicQuestion, type ViolationKind } from "./api";
import { IQ, fmt, pageLang, type IqDict } from "./i18n";
import { RichQ } from "./RichQ";
import "../styles/interactive.css";
import { BrandMark, useBrand } from "../lib/brand";

const LETTER = "ABCDEFGH";
const SHAPES = ["▲", "◆", "●", "■", "★", "⬢", "✚", "⬟"];
// javob ranglari — o'yinchi rang + shakl bo'yicha tanlaydi; tekis, sokin, bir-biridan aniq farqlanadigan tuslar
const COLORS = ["#b42318", "#2b5a94", "#a07a1f", "#1e6b4a", "#5d4a8c", "#1f6f73", "#8e2f5a", "#565c69"];

function useL(): IqDict {
  return IQ[pageLang()] || IQ.uz;
}

/** Tizimga kirganini tekshiradi (foydalanuvchini qaytaradi); kirmagan bo'lsa — /login?next=… */
function useAuthed(enabled = true): User | null {
  const [ok, setOk] = useState<User | null>(null);
  useEffect(() => {
    if (!enabled) return;
    auth
      .me()
      .then((r) => setOk(r.user))
      .catch(() => window.location.replace(`/login?next=${encodeURIComponent(window.location.pathname)}`));
  }, [enabled]);
  return ok;
}

function BrandName() {
  const b = useBrand();
  return <>{b?.name || "UNI"}</>;
}

function Brand({ right }: { right?: ReactNode }) {
  return (
    <header className="iqx-top">
      <a href="/" className="iqx-brand">
        <BrandMark size={36} /> <BrandName />
      </a>
      <div className="iqx-top-r">{right}</div>
    </header>
  );
}

function errText(e: unknown, L: IqDict): string {
  const d = e instanceof ApiError ? e.detail : "";
  return ({ not_found: L.not_found, not_in_group: L.not_in_group, not_allowed: L.not_allowed, no_attempts_left: L.no_attempts_left, test_closed: L.closed_msg, game_not_found: L.game_not_found } as Record<string, string>)[d] || d || "Error";
}

/* ================================================================== himoyalangan rejim */
type Warn = { kind: "leave" | "screenshot"; n: number };

/** Test yechilayotganda: boshqa oyna/ilovaga o'tish, sahifani yopish, skrinshot tugmalari, nusxalash.
 * Hisob serverda yuritiladi (`violations`), chegaraga yetsa server testni o'zi yopadi — brauzer faqat xabar beradi.
 * Veb-sahifa skrinshotni to'liq taqiqlay olmaydi: tugmalar ushlanadi, oyna fokusdan chiqsa savollar yashiriladi,
 * suv belgisi esa olingan rasmni egasiga bog'laydi. */
function useProctor(a: Attempt | null, answers: () => Record<string, string | string[]>, onClosed: (a: Attempt) => void) {
  const active = !!a && !a.finished && a.secure;
  const aid = a?.id;
  const [away, setAway] = useState(false); // oyna fokusda emas — savollar yashiriladi
  const [shield, setShield] = useState(false); // skrinshot tugmalari bosilgan payt
  const [warn, setWarn] = useState<Warn | null>(null);
  const [flash, setFlash] = useState(0); // «Nusxalash taqiqlangan» qisqa xabari
  const awayRef = useRef(false);
  const seen = useRef(a?.violations || 0);
  const lastLog = useRef<Record<string, number>>({});
  const cb = useRef({ answers, onClosed });
  cb.current = { answers, onClosed };

  const report = useCallback(
    async (kind: ViolationKind) => {
      if (!aid) return;
      if (kind !== "leave" && kind !== "screenshot") {
        const t = Date.now(); // jurnal uchun: bir xil hodisani tez-tez yubormaslik
        if (t - (lastLog.current[kind] || 0) < 3000) return;
        lastLog.current[kind] = t;
      }
      const r = await iq.violation(aid, kind, kind === "leave" || kind === "screenshot" ? cb.current.answers() : undefined);
      if (!r) return;
      if (r.finished) return cb.current.onClosed(r);
      if (r.violations > seen.current) {
        seen.current = r.violations;
        setWarn({ kind: kind === "screenshot" ? "screenshot" : "leave", n: r.violations });
      }
    },
    [aid],
  );

  useEffect(() => {
    if (!active) return;
    const leave = () => {
      if (awayRef.current) return;
      awayRef.current = true;
      setAway(true);
      void report("leave");
    };
    const back = () => {
      if (document.visibilityState !== "visible" || !document.hasFocus()) return;
      awayRef.current = false;
      setAway(false);
    };
    const onVis = () => (document.visibilityState === "hidden" ? leave() : back());
    const shot = () => {
      setShield(true);
      window.setTimeout(() => setShield(false), 1500);
      void navigator.clipboard?.writeText(" ").catch(() => undefined); // Print Screen buferga olgan rasmni o'chirish
      void report("screenshot");
    };
    const inField = (e: Event) => e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
    const deny = (kind: ViolationKind) => (e: Event) => {
      e.preventDefault();
      setFlash(Date.now());
      void report(kind);
    };
    const onCopy = deny("copy");
    const onPaste = deny("paste");
    const onMenu = deny("contextmenu");
    const onDrag = (e: Event) => e.preventDefault();
    const onKeyDown = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (e.key === "PrintScreen") return shot();
      if (e.metaKey && e.shiftKey) {
        setShield(true); // macOS Cmd+Shift+3/4/5, Windows Win+Shift+S — oldindan yashirish
        window.setTimeout(() => setShield(false), 3000); // tizim keyup'ni yutib yuborsa ham qotib qolmasin
        if (["3", "4", "5", "s"].includes(k)) {
          e.preventDefault();
          shot();
        }
        return;
      }
      if (e.key === "F12" || ((e.ctrlKey || e.metaKey) && e.shiftKey && ["i", "j", "c"].includes(k))) {
        e.preventDefault();
        return void report("devtools");
      }
      if (e.ctrlKey || e.metaKey) {
        if (k === "a" && inField(e)) return;
        if (["c", "x", "insert"].includes(k)) return onCopy(e);
        if (k === "v") return onPaste(e);
        if (k === "p") {
          e.preventDefault();
          return void report("print");
        }
        if (["a", "s", "u"].includes(k)) e.preventDefault();
      }
      if (e.shiftKey && k === "insert") onPaste(e);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === "PrintScreen") shot(); // Windows ko'pincha faqat keyup yuboradi
      else if (e.key === "Meta" || e.key === "Shift") setShield(false);
    };
    const onPrint = () => void report("print");
    const onUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("blur", leave);
    window.addEventListener("focus", back);
    document.addEventListener("copy", onCopy);
    document.addEventListener("cut", onCopy);
    document.addEventListener("paste", onPaste);
    document.addEventListener("contextmenu", onMenu);
    document.addEventListener("dragstart", onDrag);
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp, true);
    window.addEventListener("beforeprint", onPrint);
    window.addEventListener("beforeunload", onUnload);
    if (document.visibilityState === "hidden" || !document.hasFocus()) leave();
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("blur", leave);
      window.removeEventListener("focus", back);
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("cut", onCopy);
      document.removeEventListener("paste", onPaste);
      document.removeEventListener("contextmenu", onMenu);
      document.removeEventListener("dragstart", onDrag);
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp, true);
      window.removeEventListener("beforeprint", onPrint);
      window.removeEventListener("beforeunload", onUnload);
    };
  }, [active, report]);

  useEffect(() => {
    if (!flash) return;
    const h = window.setTimeout(() => setFlash(0), 1600);
    return () => window.clearTimeout(h);
  }, [flash]);

  return { active, hidden: active && (away || shield), warn, closeWarn: () => setWarn(null), flash: !!flash };
}

/** Suv belgisi: talabaning ismi, logini va vaqt — olingan rasm yoki surat egasini ko'rsatadi. */
function watermark(text: string): string {
  const esc = text.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c] || c);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="220"><text x="20" y="130" transform="rotate(-24 210 110)" font-family="sans-serif" font-size="17" fill="rgba(120,130,150,0.16)">${esc}</text></svg>`;
  return `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}")`;
}

/* ================================================================== test yechish */
export function TakeTestPage() {
  const { code = "" } = useParams();
  const L = useL();
  const ok = useAuthed();
  const [info, setInfo] = useState<Awaited<ReturnType<typeof iq.info>> | null>(null);
  const [err, setErr] = useState("");
  const [a, setA] = useState<Attempt | null>(null);
  const [ans, setAns] = useState<Record<string, string | string[]>>({});
  const [i, setI] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const saveT = useRef<number | undefined>(undefined);
  const pending = useRef<Record<string, string | string[]>>({});
  const ansRef = useRef(ans);
  ansRef.current = ans;
  const nav = useNavigate();
  const pr = useProctor(
    a,
    () => {
      pending.current = {}; // javoblar qoidabuzarlik xabari bilan birga saqlanadi
      window.clearTimeout(saveT.current);
      return ansRef.current;
    },
    (r) => {
      setConfirm(false);
      setA(r);
    },
  );
  const mark = useMemo(() => (ok ? watermark(`${ok.name} · ${ok.login} · ${new Date().toLocaleString()}`) : "none"), [ok]);
  useEffect(() => {
    if (!ok) return;
    iq.info(code)
      .then(setInfo)
      .catch((e) => setErr(errText(e, L)));
  }, [ok, code, L]);
  useEffect(() => {
    const h = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(h);
  }, []);
  const submit = useCallback(
    async (force = false) => {
      if (!a || a.finished) return;
      if (!force) return setConfirm(true); // brauzerning confirm oynasi o'rniga — u fokusni olib, «chiqish» deb sanalishi mumkin
      setConfirm(false);
      setBusy(true);
      try {
        setA(await iq.submit(a.id, ans));
      } catch (e) {
        setErr(errText(e, L));
      }
      setBusy(false);
    },
    [a, ans, L],
  );
  const unanswered = a ? a.questions.filter((q) => !hasAns(ans[q.id])).length : 0;
  const left = a?.deadline && !a.finished ? Math.max(0, new Date(a.deadline).getTime() - now) : null;
  useEffect(() => {
    if (left === 0) submit(true);
  }, [left, submit]);
  const setAnswer = (qid: string, v: string | string[]) => {
    const next = { ...ans, [qid]: v };
    setAns(next);
    pending.current[qid] = v;
    window.clearTimeout(saveT.current);
    saveT.current = window.setTimeout(() => {
      const batch = pending.current;
      pending.current = {};
      if (a && Object.keys(batch).length)
        iq.answers(a.id, batch).catch((e) => {
          if (e instanceof ApiError && e.detail === "not_allowed") return setErr(errText(e, L)); // professor test davomida yopdi
          Object.assign(pending.current, { ...batch, ...pending.current });
        });
    }, 600);
  };
  if (err)
    return (
      <div className="iqx">
        <Brand />
        <div className="iqx-center">
          <div className="iqx-card msg">
            <X size={36} />
            <h2>{err}</h2>
            {ok?.role === "student" ? (
              <a className="iqx-btn" href="/student/tests">
                <ArrowLeft size={16} /> {L.to_tests}
              </a>
            ) : (
              <a className="iqx-btn" href="/">
                <ArrowLeft size={16} /> <BrandName />
              </a>
            )}
          </div>
        </div>
      </div>
    );
  if (!info) return <div className="iqx loading" />;
  if (!a) {
    const done = info.mine.find((m) => m.finished);
    const live = info.mine.find((m) => !m.finished);
    const canStart = info.open && (live || info.mine.length < info.attempts_allowed);
    return (
      <div className="iqx">
        <Brand />
        <div className="iqx-center">
          <div className="iqx-card intro">
            <span className="iqx-tag">
              <Zap size={14} /> {info.subject || L.tests}
            </span>
            <h1>{info.title}</h1>
            {info.description && <p className="iqx-desc">{info.description}</p>}
            <div className="iqx-facts">
              <span>
                <b>{info.count}</b> {L.questions_n}
              </span>
              <span>
                <Clock size={15} /> {info.time_limit ? `${info.time_limit} ${L.minutes}` : L.unlimited}
              </span>
              <span>
                {L.attempts_left}: <b>{Math.max(0, info.attempts_allowed - info.mine.length) + (live ? 1 : 0)}</b>
              </span>
              {info.teacher && (
                <span>
                  {L.teacher}: <b>{info.teacher}</b>
                </span>
              )}
            </div>
            {info.secure && (
              <div className="iqx-rules">
                <b>
                  <ShieldCheck size={16} /> {L.rules_title}
                </b>
                <ul>
                  <li>{fmt(L.rule_leave, { n: info.max_leaves })}</li>
                  <li>{L.rule_copy}</li>
                  <li>{L.rule_shot}</li>
                </ul>
              </div>
            )}
            {done && done.percent != null && (
              <div className="iqx-result small">
                {L.your_score}: <b>{done.percent}%</b>
              </div>
            )}
            {canStart ? (
              <button
                className="iqx-btn big"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    const r = await iq.start(code);
                    setA(r);
                    setAns(r.answers || {});
                  } catch (e) {
                    setErr(errText(e, L));
                  }
                  setBusy(false);
                }}
              >
                {live ? L.continue : L.start} <ArrowRight size={18} />
              </button>
            ) : (
              <p className="iqx-note">{!info.open ? L.closed_msg : done ? L.pending_results : L.no_attempts_left}</p>
            )}
          </div>
        </div>
      </div>
    );
  }
  if (a.finished)
    return (
      <div className="iqx">
        <Brand />
        <div className="iqx-center">
          <div className={`iqx-card msg ${a.closed_reason === "violations" ? "closed" : "done"}`}>
            {a.closed_reason === "violations" ? <AlertTriangle size={48} /> : <CheckCircle2 size={48} />}
            <h2>{L.done_title}</h2>
            {a.closed_reason === "violations" && <p className="iqx-violation">{fmt(L.closed_violation, { n: a.violations })}</p>}
            {a.percent != null ? (
              <div className="iqx-result">
                <span className="iq-ring big" style={{ ["--p" as string]: a.percent }}>
                  <b>{Math.round(a.percent)}%</b>
                </span>
                <span>
                  {a.score} / {a.max_score}
                </span>
              </div>
            ) : (
              <p>{L.done_text}</p>
            )}
            <button className="iqx-btn" onClick={() => nav("/student/tests")}>
              {L.to_portal} <ArrowRight size={16} />
            </button>
          </div>
        </div>
      </div>
    );
  const q = a.questions[i];
  const answered = a.questions.filter((x) => hasAns(ans[x.id])).length;
  return (
    <div className={`iqx taking ${pr.active ? "secure" : ""}`}>
      <Brand
        right={
          <>
            <span className="iqx-prog">
              {answered}/{a.questions.length}
            </span>
            {left != null && (
              <span className={`iqx-timer ${left < 60000 ? "warn" : ""}`}>
                <Clock size={15} /> {clock(left)}
              </span>
            )}
            {pr.active && (
              <span className={`iqx-leaves ${a.violations ? "warn" : ""}`} title={L.secure_mode}>
                <ShieldCheck size={15} /> {Math.max(a.violations, pr.warn?.n || 0)}/{a.max_leaves}
              </span>
            )}
          </>
        }
      />
      <div className="iqx-bar">
        <i style={{ width: `${(100 * answered) / a.questions.length}%` }} />
      </div>
      <div className={`iqx-take ${pr.hidden ? "shielded" : ""}`} style={pr.active ? { backgroundImage: mark } : undefined}>
        <div className="iqx-qcard" key={q.id}>
          <span className="iqx-qn">
            {L.question} {i + 1} {L.of} {a.questions.length}
            {q.multi && <em>{L.choose_many}</em>}
          </span>
          <h2>
            <RichQ text={q.text} image={q.image} imgClass="iqx-qimg" />
          </h2>
          <Answer q={q} value={ans[q.id]} onChange={(v) => setAnswer(q.id, v)} L={L} />
          <div className="iqx-nav">
            <button className="iqx-btn ghost" disabled={i === 0} onClick={() => setI(i - 1)}>
              <ArrowLeft size={16} /> {L.prev}
            </button>
            {i < a.questions.length - 1 ? (
              <button className="iqx-btn" onClick={() => setI(i + 1)}>
                {L.next} <ArrowRight size={16} />
              </button>
            ) : (
              <button className="iqx-btn finish" disabled={busy} onClick={() => submit()}>
                <Flag size={16} /> {L.finish}
              </button>
            )}
          </div>
        </div>
        <aside className="iqx-map">
          <div className="iqx-dots">
            {a.questions.map((x, j) => (
              <button key={x.id} className={`${j === i ? "cur" : ""} ${hasAns(ans[x.id]) ? "done" : ""}`} onClick={() => setI(j)}>
                {j + 1}
              </button>
            ))}
          </div>
          <button className="iqx-btn finish wide" disabled={busy} onClick={() => submit()}>
            <Flag size={16} /> {L.finish}
          </button>
          <small>{L.autosaved}</small>
        </aside>
      </div>
      {pr.hidden && (
        <div className="iqx-shield">
          <EyeOff size={36} />
          <b>{L.hidden_msg}</b>
        </div>
      )}
      {pr.flash && <div className="iqx-flash">{L.no_copy}</div>}
      {pr.warn && (
        <div className="iqx-modal" role="alertdialog" aria-modal="true">
          <div className="iqx-card warn">
            <AlertTriangle size={44} />
            <h2>{L.warn_title}</h2>
            <p>
              {pr.warn.kind === "screenshot"
                ? fmt(L.warn_shot, { n: pr.warn.n, max: a.max_leaves })
                : fmt(a.max_leaves - pr.warn.n <= 1 ? L.warn_last : L.warn_text, { n: pr.warn.n, max: a.max_leaves, left: a.max_leaves - pr.warn.n })}
            </p>
            <button className="iqx-btn" onClick={pr.closeWarn} autoFocus>
              {L.warn_ok}
            </button>
          </div>
        </div>
      )}
      {confirm && (
        <div className="iqx-modal" role="dialog" aria-modal="true">
          <div className="iqx-card confirm">
            <Flag size={40} />
            <h2>{L.finish_confirm}</h2>
            {unanswered > 0 && <p>{fmt(L.unanswered, { n: unanswered })}</p>}
            <div className="iqx-nav">
              <button className="iqx-btn ghost" onClick={() => setConfirm(false)}>
                {L.cancel}
              </button>
              <button className="iqx-btn finish" disabled={busy} onClick={() => submit(true)} autoFocus>
                <Flag size={16} /> {L.finish}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function hasAns(v: unknown): boolean {
  return Array.isArray(v) ? v.length > 0 : !!(v && String(v).trim());
}

function clock(ms: number): string {
  const s = Math.ceil(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const p = (n: number) => String(n).padStart(2, "0");
  return h ? `${h}:${p(m)}:${p(s % 60)}` : `${p(m)}:${p(s % 60)}`;
}

function Answer({ q, value, onChange, L }: { q: PublicQuestion; value: unknown; onChange: (v: string | string[]) => void; L: IqDict }) {
  if (q.type === "text")
    return <input className="iqx-text" value={String(value || "")} onChange={(e) => onChange(e.target.value)} placeholder={L.type_answer} autoFocus maxLength={300} />;
  const sel = Array.isArray(value) ? (value as string[]) : value ? [String(value)] : [];
  return (
    <div className="iqx-opts">
      {q.options.map((o, k) => {
        const on = sel.includes(o.id);
        return (
          <button
            key={o.id}
            className={`iqx-opt ${on ? "on" : ""}`}
            onClick={() => (q.multi ? onChange(on ? sel.filter((x) => x !== o.id) : [...sel, o.id]) : onChange(o.id))}
          >
            <i>{on ? <Check size={16} /> : LETTER[k]}</i>
            <RichQ text={o.text} image={o.image} imgClass="iqx-oimg" />
          </button>
        );
      })}
    </div>
  );
}

/* ================================================================== Bilimdon: o'yinchi */
export function PlayerPage() {
  const { pin = "" } = useParams();
  const L = useL();
  const ok = useAuthed();
  const [v, setV] = useState<LiveView | null>(null);
  const [err, setErr] = useState("");
  const [offset, setOffset] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [pick, setPick] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [sent, setSent] = useState<string | null>(null);
  const load = useCallback(
    () =>
      iq
        .play(pin)
        .then((r) => {
          setOffset(r.now * 1000 - Date.now());
          setV(r);
        })
        .catch((e) => setErr(errText(e, L))),
    [pin, L],
  );
  useEffect(() => {
    if (!ok) return;
    load();
    const h = window.setInterval(load, 1000);
    const c = window.setInterval(() => setNow(Date.now()), 200);
    return () => {
      window.clearInterval(h);
      window.clearInterval(c);
    };
  }, [ok, load]);
  const qid = v?.question?.id;
  useEffect(() => {
    setPick([]);
    setText("");
  }, [qid]);
  if (err)
    return (
      <div className="bd">
        <div className="bd-center">
          <div className="bd-card">
            <X size={40} />
            <h2>{err}</h2>
          </div>
        </div>
      </div>
    );
  if (!v) return <div className="bd loading" />;
  const snow = now + offset;
  const send = async (value: unknown) => {
    try {
      await iq.answer(pin, value);
      setSent(qid || "");
      load();
    } catch {
      load();
    }
  };
  if (!v.joined)
    return (
      <div className="bd">
        <div className="bd-center">
          <div className="bd-card join">
            <div className="bd-logo">
              <Zap size={30} /> {L.bilimdon}
            </div>
            <h2>{v.title}</h2>
            <div className="bd-pin">{v.pin}</div>
            <button
              className="bd-btn"
              onClick={async () => {
                try {
                  setV(await iq.join(pin));
                } catch (e) {
                  setErr(errText(e, L));
                }
              }}
            >
              {L.join_game} <ArrowRight size={18} />
            </button>
          </div>
        </div>
      </div>
    );
  const me = v.me;
  const head = (
    <div className="bd-head">
      <span>
        <Zap size={15} /> {v.title}
      </span>
      <b>
        {me?.name} · {me?.score ?? 0}
      </b>
    </div>
  );
  if (v.phase === "lobby")
    return (
      <div className="bd">
        {head}
        <div className="bd-center">
          <div className="bd-card">
            <CheckCircle2 size={54} className="bd-ok" />
            <h2>{L.you_in}</h2>
            <p>{L.see_screen}</p>
            <div className="bd-dots">
              <i />
              <i />
              <i />
            </div>
          </div>
        </div>
      </div>
    );
  if (v.phase === "question" && v.question) {
    const q = v.question;
    const start = (v.started_at || 0) * 1000;
    if (snow < start)
      return (
        <div className="bd">
          {head}
          <div className="bd-center">
            <div className="bd-countdown">{Math.ceil((start - snow) / 1000)}</div>
            <h2 className="bd-ready">{L.get_ready}</h2>
          </div>
        </div>
      );
    const remain = Math.max(0, (v.deadline || 0) * 1000 - snow);
    if (me?.answer || sent === q.id)
      return (
        <div className="bd">
          {head}
          <div className="bd-center">
            <div className="bd-card">
              <Clock size={44} />
              <h2>{L.answer_sent}</h2>
              <p>{L.wait_others}</p>
            </div>
          </div>
        </div>
      );
    return (
      <div className="bd playing">
        {head}
        <div className="bd-q">
          <span className="bd-timer">{Math.ceil(remain / 1000)}</span>
          <h3>
            <RichQ text={q.text} image={q.image} imgClass="bd-qimg" />
          </h3>
        </div>
        {q.type === "text" ? (
          <form
            className="bd-textans"
            onSubmit={(e) => {
              e.preventDefault();
              if (text.trim()) send(text.trim());
            }}
          >
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder={L.type_answer} autoFocus maxLength={200} />
            <button className="bd-btn">{L.send}</button>
          </form>
        ) : (
          <>
            <div className={`bd-tiles n${Math.min(q.options.length, 6)}`}>
              {q.options.map((o, k) => (
                <button
                  key={o.id}
                  className={`bd-tile ${pick.includes(o.id) ? "on" : ""}`}
                  style={{ background: COLORS[k % 8] }}
                  onClick={() => (q.multi ? setPick(pick.includes(o.id) ? pick.filter((x) => x !== o.id) : [...pick, o.id]) : send(o.id))}
                >
                  <span className="bd-shape">{SHAPES[k % 8]}</span>
                  <RichQ text={o.text} image={o.image} imgClass="bd-oimg" />
                </button>
              ))}
            </div>
            {q.multi && (
              <button className="bd-btn submit" disabled={!pick.length} onClick={() => send(pick)}>
                {L.send}
              </button>
            )}
          </>
        )}
      </div>
    );
  }
  if (v.phase === "reveal" || v.phase === "leaderboard") {
    const res = me?.answer;
    const good = !!res?.ok;
    return (
      <div className={`bd result ${res ? (good ? "good" : "bad") : "none"}`}>
        {head}
        <div className="bd-center">
          <div className="bd-big">{res ? (good ? <Check size={64} /> : <X size={64} />) : <Clock size={56} />}</div>
          <h2>{res ? (good ? L.correct_title : L.wrong_title) : L.time_up}</h2>
          {res && good && <div className="bd-plus">+{res.pts}</div>}
          {me?.streak && me.streak > 1 ? (
            <div className="bd-streak">
              🔥 {me.streak} {L.streak}
            </div>
          ) : null}
          <p className="bd-rank">
            {L.your_rank}: <b>{me?.rank ?? "—"}</b> · {me?.score ?? 0} {L.points_n}
          </p>
        </div>
      </div>
    );
  }
  // tugadi
  const place = me?.rank || 0;
  return (
    <div className="bd final">
      {head}
      {place > 0 && place <= 3 && <Confetti />}
      <div className="bd-center">
        <div className="bd-medal">{place === 1 ? "🥇" : place === 2 ? "🥈" : place === 3 ? "🥉" : <Trophy size={60} />}</div>
        <h2>
          {place || "—"} {L.place}
        </h2>
        <p className="bd-rank">
          {me?.score ?? 0} {L.points_n}
        </p>
        <a className="bd-btn ghost" href="/student/tests">
          {L.to_portal}
        </a>
      </div>
    </div>
  );
}

/* ================================================================== Bilimdon: boshlovchi ekrani */
export function HostPage() {
  const { id = "" } = useParams();
  const L = useL();
  const ok = useAuthed();
  const [v, setV] = useState<LiveView | null>(null);
  const [err, setErr] = useState("");
  const [offset, setOffset] = useState(0);
  const [now, setNow] = useState(Date.now());
  const load = useCallback(
    () =>
      iq
        .host(id)
        .then((r) => {
          setOffset(r.now * 1000 - Date.now());
          setV(r);
        })
        .catch((e) => setErr(errText(e, L))),
    [id, L],
  );
  useEffect(() => {
    if (!ok) return;
    load();
    const h = window.setInterval(load, 900);
    const c = window.setInterval(() => setNow(Date.now()), 150);
    return () => {
      window.clearInterval(h);
      window.clearInterval(c);
    };
  }, [ok, load]);
  const act = async (a: "start" | "next" | "end") => {
    try {
      setV(await iq.hostAction(id, a));
    } catch (e) {
      setErr(errText(e, L));
    }
  };
  if (err)
    return (
      <div className="bd host">
        <div className="bd-center">
          <h2>{err}</h2>
        </div>
      </div>
    );
  if (!v) return <div className="bd host loading" />;
  const snow = now + offset;
  const joinPath = `/b/${v.pin}`;
  const fs = (
    <button className="bd-ic" onClick={() => document.documentElement.requestFullscreen?.()} title={L.full_screen}>
      <Maximize2 size={18} />
    </button>
  );
  if (v.phase === "lobby")
    return (
      <div className="bd host lobby">
        <div className="bd-hbar">
          <span className="bd-logo">
            <Zap size={22} /> {L.bilimdon}
          </span>
          <b>{v.title}</b>
          {fs}
        </div>
        <div className="bd-lobby">
          <div className="bd-join">
            <small>{L.join_at}</small>
            <b className="bd-url">
              {window.location.host}
              {joinPath}
            </b>
            <small>{L.pin}</small>
            <div className="bd-pin xl">{v.pin}</div>
          </div>
          <img className="bd-qr" src={qrUrl(joinPath)} alt="QR" />
        </div>
        <div className="bd-players">
          <div className="bd-count">
            <Users size={20} /> {v.players_count} {L.players}
          </div>
          <div className="bd-chips">
            {(v.players || []).map((p) => (
              <span key={p.id} className="bd-chip">
                {p.name}
              </span>
            ))}
            {!v.players_count && <span className="bd-wait">{L.waiting_players}</span>}
          </div>
          <button className="bd-btn big" disabled={!v.players_count} onClick={() => act("start")}>
            <Play size={20} /> {L.start_game}
          </button>
        </div>
      </div>
    );
  if (v.phase === "finished") {
    const r = v.ranking || [];
    const [g1, g2, g3] = [r[0], r[1], r[2]];
    return (
      <div className="bd host final">
        <Confetti />
        <div className="bd-hbar">
          <span className="bd-logo">
            <Trophy size={22} /> {L.podium}
          </span>
          <b>{v.title}</b>
          {fs}
        </div>
        <div className="bd-podium">
          {[g2, g1, g3].map((p, k) =>
            p ? (
              <div key={p.id} className={`bd-step s${[2, 1, 3][k]}`} style={{ animationDelay: `${[0.6, 1.2, 0.2][k]}s` }}>
                <div className="bd-step-who">
                  {[2, 1, 3][k] === 1 && <Crown size={34} className="bd-crown" />}
                  <span className="bd-step-av">{p.photo ? <img src={p.photo} alt="" /> : p.name.slice(0, 1)}</span>
                  <b>{p.name}</b>
                  <small>
                    {p.score} {L.points_n}
                  </small>
                </div>
                <div className="bd-step-box">{[2, 1, 3][k]}</div>
              </div>
            ) : (
              <div key={k} className="bd-step empty" />
            ),
          )}
        </div>
        {r.length > 3 && (
          <div className="bd-rest">
            {r.slice(3, 15).map((p) => (
              <span key={p.id}>
                <i>{p.rank}</i> {p.name} <b>{p.score}</b>
              </span>
            ))}
          </div>
        )}
      </div>
    );
  }
  const q = v.question;
  const start = (v.started_at || 0) * 1000;
  const remain = Math.max(0, (v.deadline || 0) * 1000 - snow);
  const limit = (v.limit || 20) * 1000;
  const total = Object.values(v.dist || {}).reduce((s, x) => s + x, 0) || 1;
  const bar = (
    <div className="bd-hbar">
      <span className="bd-logo">
        <Zap size={22} /> {v.index + 1} / {v.total}
      </span>
      <b>{v.title}</b>
      <span className="bd-hbtns">
        {v.phase === "question" && (
          <button className="bd-btn sm" onClick={() => act("next")}>
            <SkipForward size={16} /> {L.show_results}
          </button>
        )}
        {v.phase === "reveal" && (
          <button className="bd-btn sm" onClick={() => act("next")}>
            {L.leaderboard} <ArrowRight size={16} />
          </button>
        )}
        {v.phase === "leaderboard" && (
          <button className="bd-btn sm" onClick={() => act("next")}>
            {v.index + 1 >= v.total ? L.podium : L.next_q} <ArrowRight size={16} />
          </button>
        )}
        <button className="bd-btn sm ghost" onClick={() => act("end")}>
          {L.end_game}
        </button>
        {fs}
      </span>
    </div>
  );
  if (v.phase === "question" && q && snow < start)
    return (
      <div className="bd host">
        {bar}
        <div className="bd-center">
          <h1 className="bd-hq">
            <RichQ text={q.text} />
          </h1>
          <div className="bd-countdown">{Math.ceil((start - snow) / 1000)}</div>
          <h2 className="bd-ready">{L.get_ready}</h2>
        </div>
      </div>
    );
  if (v.phase === "leaderboard") {
    const r = (v.ranking || []).slice(0, 5);
    const max = Math.max(1, ...r.map((x) => x.score));
    return (
      <div className="bd host">
        {bar}
        <div className="bd-board">
          <h2>
            <Trophy size={28} /> {L.leaderboard}
          </h2>
          {r.map((p, k) => (
            <div key={p.id} className="bd-row" style={{ animationDelay: `${k * 0.08}s` }}>
              <i>{p.rank}</i>
              <span className="bd-row-name">{p.name}</span>
              <span className="bd-row-bar">
                <em style={{ width: `${(100 * p.score) / max}%` }} />
              </span>
              <b>{p.score}</b>
              {p.streak > 1 && <small>🔥{p.streak}</small>}
            </div>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div className="bd host">
      {bar}
      {q && (
        <div className="bd-stage">
          <div className="bd-hq-wrap">
            <h1 className="bd-hq">
              <RichQ text={q.text} image={q.image} imgClass="bd-hq-img" />
            </h1>
          </div>
          <div className="bd-mid">
            {v.phase === "question" ? (
              <>
                <div className="bd-ring" style={{ ["--p" as string]: (100 * remain) / limit }}>
                  <b>{Math.ceil(remain / 1000)}</b>
                </div>
                <div className="bd-answers">
                  <b>{v.answered ?? 0}</b>
                  <small>{L.answers_n}</small>
                </div>
              </>
            ) : (
              <div className="bd-dist">
                {q.type === "text" ? (
                  <div className="bd-accepted">{(v.accepted || []).join(" / ")}</div>
                ) : (
                  q.options.map((o, k) => {
                    const n = (v.dist || {})[o.id] || 0;
                    const right = (v.correct || []).includes(o.id);
                    return (
                      <div key={o.id} className={`bd-dcol ${right ? "right" : ""}`}>
                        <span className="bd-dn">
                          {right && <Check size={18} />} {n}
                        </span>
                        <span className="bd-dbar" style={{ height: `${12 + (140 * n) / total}px`, background: COLORS[k % 8] }} />
                        <span className="bd-shape">{SHAPES[k % 8]}</span>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
          {q.type !== "text" && (
            <div className={`bd-tiles host n${Math.min(q.options.length, 6)}`}>
              {q.options.map((o, k) => {
                const right = (v.correct || []).includes(o.id);
                return (
                  <div key={o.id} className={`bd-tile ${v.phase === "reveal" ? (right ? "right" : "dim") : ""}`} style={{ background: COLORS[k % 8] }}>
                    <span className="bd-shape">{SHAPES[k % 8]}</span>
                    <RichQ text={o.text} image={o.image} imgClass="bd-oimg" />
                    {v.phase === "reveal" && right && <Check size={26} className="bd-tick" />}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Confetti() {
  const pieces = useMemo(
    () =>
      Array.from({ length: 90 }, (_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * 2.5,
        dur: 3 + Math.random() * 3,
        color: COLORS[i % 6],
        rot: Math.random() * 360,
        size: 6 + Math.random() * 8,
      })),
    [],
  );
  return (
    <div className="bd-confetti" aria-hidden>
      {pieces.map((p, i) => (
        <i
          key={i}
          style={{ left: `${p.left}%`, animationDelay: `${p.delay}s`, animationDuration: `${p.dur}s`, background: p.color, transform: `rotate(${p.rot}deg)`, width: p.size, height: p.size * 0.5 }}
        />
      ))}
    </div>
  );
}

/* ================================================================== qog'oz variantlar */
export function PaperPrintPage() {
  const { id = "" } = useParams();
  const [sp] = useSearchParams();
  const L = useL();
  const ok = useAuthed(!sp.get("tk"));
  const n = Math.max(1, Math.min(30, Number(sp.get("v")) || 2));
  // only=K — faqat K-guruh (variant); only=0 — faqat javoblar kaliti; bo'lmasa — hammasi
  const onlyRaw = sp.get("only");
  const only = onlyRaw === null ? null : Math.max(0, Math.min(n, Number(onlyRaw) || 0));
  const tk = sp.get("tk") || "";
  const exp = sp.get("exp") || "";
  const [d, setD] = useState<PaperData | null>(null);
  useEffect(() => {
    if (tk) iq.paperSigned(id, n, exp, tk).then(setD).catch((e) => ((window as unknown as { __PRINT_ERROR?: string }).__PRINT_ERROR = String(e)));
    else if (ok) iq.paper(id, n).then(setD).catch(() => null);
  }, [ok, id, n, tk, exp]);
  useEffect(() => {
    document.documentElement.classList.add("iq-print-root");
    return () => document.documentElement.classList.remove("iq-print-root");
  }, []);
  // server PDF chizishi uchun: shriftlar va rasmlar yuklangach tayyor
  useEffect(() => {
    if (!d) return;
    let alive = true;
    const imgs = Array.from(document.images).map((im) => (im.complete ? Promise.resolve() : new Promise((r) => ((im.onload = r), (im.onerror = r)))));
    Promise.all([document.fonts?.ready, ...imgs]).then(() => {
      if (alive) window.setTimeout(() => ((window as unknown as { __PRINT_READY?: boolean }).__PRINT_READY = true), 150);
    });
    return () => {
      alive = false;
    };
  }, [d]);
  if (!d) return <div className="iqx loading" />;
  const shown = only === null ? d.variants : d.variants.filter((v) => v.variant === only);
  const showKey = only === null || only === 0;
  return (
    <div className="iqp">
      {!tk && <div className="iqp-bar no-print">
        <b>
          {d.test.title} · {n} {L.variant.toLowerCase()}
        </b>
        <button className="iqx-btn" onClick={() => window.print()}>
          <Printer size={16} /> {L.print}
        </button>
      </div>}
      {shown.map((v: PaperVariant) => (
        <section key={v.variant} className="iqp-page">
          <header className="iqp-head">
            {d.logo && <img src={d.logo} alt="" />}
            <div>
              <small>{d.university}</small>
              <h1>{d.test.title}</h1>
              <span>
                {d.test.subject && `${d.test.subject} · `}
                {d.teacher}
              </span>
            </div>
            <div className="iqp-var">
              {L.variant}
              <b>{v.variant}</b>
            </div>
          </header>
          <div className="iqp-fields">
            <span>
              {L.name_line}: <i />
            </span>
            <span>
              {L.group_line}: <i />
            </span>
            <span>
              {L.date_line}: <i />
            </span>
          </div>
          <ol className="iqp-qs">
            {v.questions.map((q) => (
              <li key={q.id}>
                <div className="iqp-q">
                  <RichQ text={q.text} image={q.image} imgClass="iqp-img" />
                  <small>({q.points})</small>
                </div>
                {q.type === "text" ? (
                  <div className="iqp-lines">
                    <i />
                  </div>
                ) : (
                  <div className="iqp-opts">
                    {q.options.map((o, k) => (
                      <span key={o.id}>
                        <b>{LETTER[k]})</b> <RichQ text={o.text} image={o.image} imgClass="iqp-oimg" />
                      </span>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ol>
          <div className="iqp-grid">
            {v.questions.map((q) => (
              <span key={q.id}>
                <b>{q.n}</b>
                {q.type === "text" ? <i className="wide" /> : q.options.map((_, k) => <em key={k}>{LETTER[k]}</em>)}
              </span>
            ))}
          </div>
        </section>
      ))}
      {showKey && (
      <section className="iqp-page keys">
        <h2>
          {L.key} — {d.test.title}
        </h2>
        <div className="iqp-keys">
          {d.variants.map((v) => (
            <table key={v.variant}>
              <thead>
                <tr>
                  <th colSpan={2}>
                    {L.variant} {v.variant}
                  </th>
                </tr>
              </thead>
              <tbody>
                {v.key.map((k) => (
                  <tr key={k.n}>
                    <td>{k.n}</td>
                    <td>{k.answer}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ))}
        </div>
      </section>
      )}
    </div>
  );
}
