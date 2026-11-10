// Murojaatlar statistikasi — G-Guard service desk statistikasi asosida: hajmlar, birinchi javob (MTTA) va hal qilish (MTTR) vaqti,
// murojaatchilar bahosi (1–5), operatorlar reytingi, kunlik dinamika, bo'limlar va manbalar kesimi.
import { Star } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Avatar } from "../../lib/Avatar";
import { errMsg } from "../api";
import { desk, type Board, type DeskStats } from "../desk-api";
import { Input, Spinner, useToast } from "../ui";

export function Stars({ n, size = 13 }: { n: number; size?: number }) {
  return (
    <span className="sd-stars" aria-label={`${n}/5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} size={size} className={i <= Math.round(n) ? "on" : ""} />
      ))}
    </span>
  );
}

const SOURCES: Record<string, string> = { web: "Sayt formasi", email: "Pochta", telegram: "Telegram bot", careers: "Vakansiya", chat: "Sayt chati", manual: "Qo‘lda" };
const PERIODS = [
  { days: 7, label: "7 kun" },
  { days: 30, label: "30 kun" },
  { days: 90, label: "90 kun" },
  { days: 365, label: "1 yil" },
];

function mins(m: number | null | undefined): string {
  if (m === null || m === undefined) return "—";
  if (m < 60) return `${m} daq.`;
  const h = Math.floor(m / 60);
  if (h < 24) return m % 60 ? `${h} soat ${m % 60} daq.` : `${h} soat`;
  const d = Math.floor(h / 24);
  return h % 24 ? `${d} kun ${h % 24} soat` : `${d} kun`;
}

function dmy(iso: string): string {
  const [y, m, d] = iso.split("-");
  return y ? `${d}.${m}` : iso;
}

export function DeskStatsView({ board }: { board: Board }) {
  const toast = useToast();
  const [days, setDays] = useState(30);
  const [range, setRange] = useState({ start: "", end: "" });
  const [s, setS] = useState<DeskStats | null>(null);
  const custom = !!(range.start && range.end);
  useEffect(() => {
    setS(null);
    desk
      .stats(custom ? range : { days })
      .then(setS)
      .catch((e) => toast(errMsg(e), "error"));
  }, [days, range, custom, toast]);
  // uzun davr — haftalik ustunlar
  const series = useMemo(() => {
    if (!s) return [];
    const tl = s.timeline;
    if (tl.length <= 62) return tl.map((x) => ({ ...x, label: dmy(x.date) }));
    const out: { date: string; label: string; created: number; resolved: number }[] = [];
    tl.forEach((x, i) => {
      if (i % 7 === 0) out.push({ date: x.date, label: dmy(x.date), created: 0, resolved: 0 });
      out[out.length - 1].created += x.created;
      out[out.length - 1].resolved += x.resolved;
    });
    return out;
  }, [s]);
  const max = Math.max(1, ...series.map((x) => Math.max(x.created, x.resolved)));
  const o = s?.overview;
  const ratingMax = o ? Math.max(1, ...Object.values(o.rating_dist)) : 1;
  const catMax = s ? Math.max(1, ...s.categories.map((c) => c.count)) : 1;
  const srcList = o ? Object.entries(o.by_source).sort((a, b) => b[1] - a[1]) : [];
  const srcMax = Math.max(1, ...srcList.map(([, n]) => n));
  return (
    <div className="sd-st">
      <div className="sd-st-bar">
        <div className="a-seg">
          {PERIODS.map((p) => (
            <button
              key={p.days}
              className={!custom && days === p.days ? "on" : ""}
              onClick={() => {
                setRange({ start: "", end: "" });
                setDays(p.days);
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="sd-st-range">
          <Input type="date" value={range.start} onChange={(e) => setRange({ ...range, start: e.target.value })} aria-label="Boshlanish sanasi" />
          <span>—</span>
          <Input type="date" value={range.end} onChange={(e) => setRange({ ...range, end: e.target.value })} aria-label="Tugash sanasi" />
        </div>
      </div>

      {!s || !o ? (
        <Spinner />
      ) : (
        <>
          <div className="sd-kpis">
            <div className="sd-kpi">
              <span>Murojaatlar</span>
              <b>{o.total}</b>
              <small>
                ochiq: {o.open} · mas’ulsiz: {o.unassigned}
              </small>
            </div>
            <div className="sd-kpi">
              <span>Birinchi javob (o‘rtacha)</span>
              <b>{mins(o.avg_first_response_min)}</b>
            </div>
            <div className="sd-kpi">
              <span>Hal qilish (o‘rtacha)</span>
              <b>{mins(o.avg_resolve_min)}</b>
              <small>hal qilingan: {o.by_stage.resolved} · rad etilgan: {o.by_stage.failed}</small>
            </div>
            <div className="sd-kpi">
              <span>O‘rtacha baho</span>
              <b>
                {o.csat !== null ? o.csat.toFixed(2) : "—"}
                <em> / 5</em>
              </b>
              <small>
                {o.ratings} ta baho{o.positive_pct !== null ? ` · ijobiy (4–5): ${o.positive_pct}%` : ""}
              </small>
            </div>
          </div>

          <div className="sd-st-stages">
            {board.stages.map((st) => (
              <div key={st.id} className="sd-stat" style={{ ["--c" as string]: st.color }}>
                <b>{o.by_stage[st.id] || 0}</b>
                <span>{st.title}</span>
              </div>
            ))}
          </div>

          <div className="sd-st-grid">
            <section className="sd-box">
              <h4>Baholar taqsimoti</h4>
              <div className="sd-bars">
                {(["5", "4", "3", "2", "1"] as const).map((k) => {
                  const n = o.rating_dist[k];
                  return (
                    <div key={k} className="sd-bar-row" title={`${k} yulduz: ${n}`}>
                      <span className="sd-bar-k">
                        {k} <Star size={12} />
                      </span>
                      <span className="sd-bar">
                        <i className="gold" style={{ width: `${(n / ratingMax) * 100}%` }} />
                      </span>
                      <span className="sd-bar-n">{n}</span>
                    </div>
                  );
                })}
              </div>
            </section>
            <section className="sd-box sd-st-wide">
              <div className="sd-st-h">
                <h4>{series.length < s.timeline.length ? "Haftalik dinamika" : "Kunlik dinamika"}</h4>
                <div className="sd-legend">
                  <span>
                    <i className="c1" /> Kelib tushgan
                  </span>
                  <span>
                    <i className="c2" /> Hal qilingan
                  </span>
                </div>
              </div>
              <div className="sd-chart" role="img" aria-label="Kelib tushgan va hal qilingan murojaatlar">
                {series.map((x) => (
                  <div key={x.date} className="sd-chart-col" title={`${x.label}: kelib tushgan ${x.created}, hal qilingan ${x.resolved}`}>
                    <div className="sd-chart-bars">
                      <i className="c1" style={{ height: `${(x.created / max) * 100}%` }} />
                      <i className="c2" style={{ height: `${(x.resolved / max) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
              <div className="sd-chart-x">
                <span>{series[0]?.label}</span>
                <span>{series[series.length - 1]?.label}</span>
              </div>
            </section>
          </div>

          <section className="a-card">
            <div className="sd-st-th">
              <h4>Operatorlar reytingi</h4>
            </div>
            <div className="a-table-scroll">
              <table className="a-table sd-ops">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Operator</th>
                    <th>O‘rtacha baho</th>
                    <th>Baholar</th>
                    <th>Biriktirilgan</th>
                    <th>Hal qilingan</th>
                    <th>Rad etilgan</th>
                    <th>Ochiq</th>
                    <th>Birinchi javob</th>
                    <th>Hal qilish</th>
                  </tr>
                </thead>
                <tbody>
                  {s.operators.map((op, i) => (
                    <tr key={op.user_id}>
                      <td className="muted">{i + 1}</td>
                      <td>
                        <span className="u-cell">
                          <Avatar name={op.user.name} photo={op.user.photo} size={26} /> {op.user.name}
                        </span>
                      </td>
                      <td>
                        {op.csat !== null ? (
                          <span className="sd-csat">
                            <b>{op.csat.toFixed(2)}</b> <Stars n={op.csat} size={12} />
                          </span>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                      <td title={(["5", "4", "3", "2", "1"] as const).map((k) => `${k}★: ${op.stars[k]}`).join(" · ")}>{op.rated}</td>
                      <td>{op.assigned}</td>
                      <td>{op.resolved}</td>
                      <td>{op.failed}</td>
                      <td>{op.open}</td>
                      <td>{mins(op.avg_first_response_min)}</td>
                      <td>{mins(op.avg_resolve_min)}</td>
                    </tr>
                  ))}
                  {!s.operators.length && (
                    <tr>
                      <td colSpan={10} className="muted" style={{ textAlign: "center", padding: 24 }}>
                        Bu davrda operatorga biriktirilgan murojaat yo‘q
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <div className="sd-st-grid two">
            <section className="sd-box">
              <h4>Bo‘limlar</h4>
              <div className="sd-bars">
                {s.categories.map((c) => (
                  <div key={c.id || "none"} className="sd-bar-row wide" title={`${c.title || "Bo‘limsiz"}: ${c.count}`}>
                    <span className="sd-bar-k">{c.title || "Bo‘limsiz"}</span>
                    <span className="sd-bar">
                      <i style={{ width: `${(c.count / catMax) * 100}%` }} />
                    </span>
                    <span className="sd-bar-n">{c.count}</span>
                  </div>
                ))}
                {!s.categories.length && <span className="muted">—</span>}
              </div>
            </section>
            <section className="sd-box">
              <h4>Manbalar</h4>
              <div className="sd-bars">
                {srcList.map(([k, n]) => (
                  <div key={k} className="sd-bar-row wide" title={`${SOURCES[k] || k}: ${n}`}>
                    <span className="sd-bar-k">{SOURCES[k] || k}</span>
                    <span className="sd-bar">
                      <i style={{ width: `${(n / srcMax) * 100}%` }} />
                    </span>
                    <span className="sd-bar-n">{n}</span>
                  </div>
                ))}
                {!srcList.length && <span className="muted">—</span>}
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
