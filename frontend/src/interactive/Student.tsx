// Talaba kabineti → Testlar: yechilgan testlar, professor yuborgan javob varaqlari, kod / PIN bilan kirish
import { ArrowRight, CheckCircle2, Clock, Hourglass, KeyRound, Play, Zap } from "lucide-react";
import { useEffect, useState } from "react";
import { Card, Empty, Modal, Pill, Spinner, fmtDateTime } from "../admin/ui";
import { usePortal } from "../portal/PortalApp";
import { iq, type AvailableTest, type Sheet } from "./api";
import { IQ, fmt } from "./i18n";
import { SheetView } from "./Teacher";
import "../styles/interactive.css";

export function MyTestsPage() {
  const { lang } = usePortal();
  const L = IQ[lang] || IQ.uz;
  const [items, setItems] = useState<Awaited<ReturnType<typeof iq.my>>["items"] | null>(null);
  const [code, setCode] = useState("");
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [avail, setAvail] = useState<AvailableTest[] | null>(null);
  useEffect(() => {
    iq.my().then((r) => setItems(r.items)).catch(() => setItems([]));
    // professor ochgan testlar darhol chiqishi uchun: sahifa ko'rinib turganda davriy yangilanadi
    const load = () => iq.available().then((r) => setAvail(r.items)).catch(() => setAvail((x) => x || []));
    load();
    const h = window.setInterval(() => !document.hidden && load(), 20000);
    const vis = () => !document.hidden && load();
    document.addEventListener("visibilitychange", vis);
    return () => {
      window.clearInterval(h);
      document.removeEventListener("visibilitychange", vis);
    };
  }, []);
  const go = () => {
    const c = code.trim();
    if (!c) return;
    window.location.href = /^\d{6}$/.test(c) ? `/b/${c}` : `/t/${c.toLowerCase()}`;
  };
  return (
    <div className="a-page iq-page">
      <section className="iq-hero student">
        <div>
          <span className="iq-hero-tag">
            <Zap size={14} /> {L.title}
          </span>
          <h1>{L.tests}</h1>
          <p>{L.live_hint}</p>
        </div>
        <form
          className="iq-codebox"
          onSubmit={(e) => {
            e.preventDefault();
            go();
          }}
        >
          <KeyRound size={18} />
          <input value={code} onChange={(e) => setCode(e.target.value)} placeholder={L.enter_code} maxLength={12} />
          <button type="submit">
            {L.go} <ArrowRight size={16} />
          </button>
        </form>
      </section>
      <h2 className="iq-sec-title">{L.open_for_you}</h2>
      {!avail ? (
        <Spinner />
      ) : !avail.length ? (
        <p className="iq-sec-empty">{L.no_open_for_you}</p>
      ) : (
        <div className="iq-grid">
          {avail.map((x) => (
            <div key={x.code} className="iq-card iq-avail">
              <div className="iq-card-top">
                {x.in_progress ? <Pill tone="info">{L.in_progress}</Pill> : <Pill tone="ok">{L.status_open}</Pill>}
                {x.subject && <span className="iq-subj">{x.subject}</span>}
              </div>
              <b className="iq-card-title">{x.title}</b>
              <div className="iq-card-stats">
                <span>
                  <b>{x.count}</b> {L.questions_n}
                </span>
                <span>
                  <Clock size={13} /> {x.time_limit ? `${x.time_limit} ${L.minutes}` : L.unlimited}
                </span>
              </div>
              {(x.teacher || x.closes) && (
                <small className="iq-avail-meta">
                  {x.teacher}
                  {x.teacher && x.closes ? " · " : ""}
                  {x.closes ? `${L.closes_at}: ${fmtDateTime(x.closes)}` : ""}
                </small>
              )}
              <div className="iq-card-actions">
                <a className="a-btn primary" href={`/t/${x.code}`}>
                  <Play size={15} /> {x.in_progress ? L.continue : L.start}
                </a>
                <span className="iq-subj">{fmt("{a}: {n}", { a: L.attempts_left, n: x.attempts_left })}</span>
              </div>
            </div>
          ))}
        </div>
      )}
      <h2 className="iq-sec-title">{L.my_tests}</h2>
      {!items ? (
        <Spinner />
      ) : !items.length ? (
        <Empty icon={<Zap size={26} />} title={L.my_tests}>
          {L.no_my_tests}
        </Empty>
      ) : (
        <div className="iq-grid">
          {items.map((x) => (
            <Card key={x.id} className="iq-my">
              <div className="iq-card-top">
                {x.finished ? <Pill tone="ok">{L.finished_lbl}</Pill> : <Pill tone="info">{L.in_progress}</Pill>}
                {x.subject && <span className="iq-subj">{x.subject}</span>}
              </div>
              <b className="iq-card-title">{x.title}</b>
              <small className="a-hint">
                <Clock size={12} /> {fmtDateTime(x.started)}
              </small>
              {x.percent != null ? (
                <div className="iq-my-score">
                  <span className="iq-ring" style={{ ["--p" as string]: x.percent }}>
                    <b>{Math.round(x.percent)}%</b>
                  </span>
                  <span>
                    {x.score} / {x.max_score}
                  </span>
                </div>
              ) : (
                <p className="iq-pending">
                  <Hourglass size={14} /> {L.pending_results}
                </p>
              )}
              <div className="iq-card-actions">
                {!x.finished && x.open && (
                  <a className="a-btn primary sm" href={`/t/${x.code}`}>
                    {L.continue}
                  </a>
                )}
                {x.released && (
                  <button className="a-btn sm" onClick={async () => setSheet(await iq.mySheet(x.id))}>
                    <CheckCircle2 size={14} /> {L.view_sheet}
                  </button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
      {sheet && (
        <Modal open onClose={() => setSheet(null)} title={`${L.sheet}: ${sheet.test.title}`} width={760}>
          <SheetView sheet={sheet} L={L} />
        </Modal>
      )}
    </div>
  );
}
