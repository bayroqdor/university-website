import { ArrowDownRight, ArrowUpRight, BookOpen, CalendarRange, FileText, LayoutDashboard, Mail, Menu, MousePointerClick, Newspaper, Radio, TrendingUp, UsersRound } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import type { EOption } from "../../lib/echarts";
import { cssVar, useEChart } from "../../lib/useEChart";
import { admin, type Admin, type Stats } from "../api";
import { Card, Spinner, fmtNum } from "../ui";

/** Tezkor yo'riqnoma: saytning qaysi qismi qayerda boshqariladi */
const GUIDE: { to: string; title: string; text: string; icon: ReactNode }[] = [
  { to: "/admin/menu", title: "Menyu", text: "Yuqori menyu va futer: bo‘limlar, ichki havolalar, tartib", icon: <Menu size={20} /> },
  { to: "/admin/home", title: "Bosh sahifa", text: "Bloklar tartibi va ko‘rinishi, bosh ekran matni va rasmlari", icon: <LayoutDashboard size={20} /> },
  { to: "/admin/pages", title: "Sahifalar", text: "Institut haqida, qabul, talabalarga va boshqa sahifalar", icon: <FileText size={20} /> },
  { to: "/admin/news", title: "Yangiliklar va e’lonlar", text: "Yangilik yozish, e’lon va tadbirlar", icon: <Newspaper size={20} /> },
  { to: "/admin/staff", title: "Professorlar", text: "Fotosurat, lavozim, kafedra, biografiya", icon: <UsersRound size={20} /> },
  { to: "/admin/schedule", title: "Dars jadvali", text: "Davlat shaklidagi jadval, sudrab ko‘chirish", icon: <CalendarRange size={20} /> },
];

function Delta({ cur, prev, invert = false }: { cur: number; prev: number; invert?: boolean }) {
  if (!prev && !cur) return <span className="delta muted">—</span>;
  if (!prev) return <span className="delta up">yangi</span>;
  const d = (cur - prev) / prev;
  const good = invert ? d < 0 : d > 0;
  return (
    <span className={`delta ${Math.abs(d) < 0.005 ? "muted" : good ? "up" : "down"}`}>
      {d >= 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
      {fmtNum(Math.abs(d) * 100, 0)}%
    </span>
  );
}

/** MatDash'dagi och rangli kichik statistik karta: nom, katta raqam, o'zgarish va mini grafik */
function Mini({ tone, label, value, cur, prev, data, kind }: { tone: "sky" | "gold"; label: string; value: string; cur: number; prev: number; data: number[]; kind: "line" | "bar" }) {
  const color = cssVar(tone === "sky" ? "--md-sky" : "--md-gold-c", tone === "sky" ? "#2a64a8" : "#b08d3c");
  const opt = useMemo<EOption>(
    () => ({
      grid: { left: 0, right: 0, top: 4, bottom: 0 },
      xAxis: { type: "category", show: false, data: data.map((_, i) => i), boundaryGap: kind === "bar" },
      yAxis: { type: "value", show: false, min: 0 },
      tooltip: { show: false },
      series: [
        kind === "line"
          ? { type: "line", data, smooth: true, symbol: "none", lineStyle: { width: 2.4, color }, areaStyle: { color, opacity: 0.18 } }
          : { type: "bar", data: data.slice(-14), barWidth: "45%", itemStyle: { color, borderRadius: 2 } },
      ],
    }),
    [data, kind, color],
  );
  return (
    <div className={`dsh-mini ${tone}`}>
      <small>{label}</small>
      <div className="dsh-mini-v">
        <b>{value}</b>
        <Delta cur={cur} prev={prev} />
      </div>
      <div className="dsh-mini-chart">
        <Chart option={opt} height={70} />
      </div>
    </div>
  );
}

function Chart({ option, height = 280 }: { option: EOption | null; height?: number }) {
  const { ref } = useEChart(option);
  return <div ref={ref} style={{ height, width: "100%" }} />;
}

/** Ma'lumot yo'q bo'lsa bo'sh doira o'rniga yozuv */
function Donut({ data, names, option }: { data: { value: number }[]; names?: Record<string, string>; option: EOption }) {
  if (!data.some((d) => d.value > 0)) return <div className="chart-empty">Hali ma’lumot yo‘q</div>;
  void names;
  return <Chart option={option} height={200} />;
}

const dur = (s: number) => (s < 60 ? `${Math.round(s)} s` : `${Math.floor(s / 60)} daq ${Math.round(s % 60)} s`);
const WD = ["Du", "Se", "Ch", "Pa", "Ju", "Sh", "Ya"];
const PAGE_NAMES: Record<string, string> = { "/": "Bosh sahifa", "/about": "Institut haqida", "/programs": "Yo‘nalishlar", "/faculties": "Kafedralar", "/structure": "Tuzilma", "/staff": "Xodimlar", "/news": "Yangiliklar", "/announcements": "E’lonlar", "/events": "Tadbirlar", "/admission": "Qabul", "/documents": "Hujjatlar", "/partners": "Hamkorlar", "/contact": "Aloqa", "/schedule": "Dars jadvali", "/login": "Kirish", "/students": "Talabalar uchun", "/library": "Elektron kutubxona", "/careers": "Vakansiyalar", "/faq": "Savol-javob" };
const SECTION_OF: Record<string, string> = { news: "news", announce: "announcements", page: "pages", program: "programs", faculty: "faculties", department: "structure", staff: "staff", event: "events" };

function theme() {
  return { ink: cssVar("--md-heading", "#121418"), muted: cssVar("--md-muted", "#8a8e98"), line: cssVar("--md-border", "#e6e2d9"), accent: cssVar("--md-primary", "#0a2e73"), surface: cssVar("--md-card", "#fff") };
}

export function Dashboard() {
  const [days, setDays] = useState(30);
  const [me, setMe] = useState<Admin | null>(null);
  useEffect(() => {
    admin.me().then((r) => setMe(r.admin)).catch(() => null);
  }, []);
  const [st, setSt] = useState<Stats | null>(null);
  useEffect(() => {
    setSt(null);
    admin.stats(days).then(setSt).catch(() => null);
    const h = setInterval(() => admin.stats(days).then(setSt).catch(() => null), 60000);
    return () => clearInterval(h);
  }, [days]);

  const th = theme();
  const traffic = useMemo<EOption | null>(() => {
    if (!st) return null;
    const lab = st.series.days.map((d) => d.slice(8, 10) + "." + d.slice(5, 7));
    return {
      color: [th.accent, th.ink, "#2f6f73"],
      tooltip: { trigger: "axis", backgroundColor: th.surface, borderColor: th.line, textStyle: { color: th.ink } },
      legend: { top: 0, left: 0, textStyle: { color: th.muted }, itemWidth: 12, itemHeight: 8 },
      grid: { left: 8, right: 12, top: 36, bottom: 8, containLabel: true },
      xAxis: { type: "category", data: lab, axisLine: { lineStyle: { color: th.line } }, axisLabel: { color: th.muted, fontSize: 11 }, axisTick: { show: false } },
      yAxis: { type: "value", minInterval: 1, splitLine: { lineStyle: { color: th.line, type: "dashed" } }, axisLabel: { color: th.muted, fontSize: 11 } },
      series: [
        { name: "Ko‘rishlar", type: "bar", data: st.series.pageviews, barMaxWidth: 14, itemStyle: { borderRadius: [2, 2, 0, 0], opacity: 0.85 } },
        { name: "Tashrif buyuruvchilar", type: "line", data: st.series.visitors, smooth: true, symbol: "circle", symbolSize: 5, lineStyle: { width: 2.4 } },
        { name: "O‘qishlar", type: "line", data: st.series.reads, smooth: true, symbol: "none", lineStyle: { width: 2, type: "dashed" } },
      ],
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st]);
  const donut = (data: { name: string; value: number }[], names: Record<string, string> = {}): EOption => ({
    color: [th.accent, th.ink, "#2f6f73", "#7a5cc0", "#c2463d", "#4e8f3a", "#d4a017", "#3d6fb6"],
    tooltip: { trigger: "item", backgroundColor: th.surface, borderColor: th.line, textStyle: { color: th.ink } },
    legend: { orient: "vertical", right: 0, top: "middle", textStyle: { color: th.muted, fontSize: 12 }, itemWidth: 10, itemHeight: 10 },
    series: [{ type: "pie", radius: ["52%", "78%"], center: ["32%", "50%"], label: { show: false }, itemStyle: { borderColor: th.surface, borderWidth: 2, borderRadius: 2 }, data: data.map((d) => ({ ...d, name: names[d.name] || d.name })) }],
  });
  const gauge = (v: number): EOption => ({
    series: [
      {
        type: "gauge",
        startAngle: 200,
        endAngle: -20,
        radius: "100%",
        center: ["50%", "62%"],
        min: 0,
        max: 100,
        progress: { show: true, width: 10, roundCap: false, itemStyle: { color: th.accent } },
        axisLine: { roundCap: false, lineStyle: { width: 10, color: [[1, th.line]] } },
        axisTick: { show: false },
        splitLine: { show: false },
        axisLabel: { show: false },
        pointer: { show: false },
        anchor: { show: false },
        title: { show: false },
        detail: { show: false },
        data: [{ value: v }],
      },
    ],
  });
  const heat = useMemo<EOption | null>(() => {
    if (!st) return null;
    const max = Math.max(1, ...st.heat.map((h) => h[2]));
    return {
      tooltip: { formatter: (p: unknown) => { const v = (p as { value: number[] }).value; return `${WD[v[1]]}, ${v[0]}:00 — <b>${v[2]}</b> ko‘rish`; }, backgroundColor: th.surface, borderColor: th.line, textStyle: { color: th.ink } },
      grid: { left: 8, right: 8, top: 6, bottom: 22, containLabel: true },
      xAxis: { type: "category", data: Array.from({ length: 24 }, (_, i) => String(i)), splitArea: { show: false }, axisLabel: { color: th.muted, fontSize: 10, interval: 2 }, axisLine: { show: false }, axisTick: { show: false } },
      yAxis: { type: "category", data: WD, axisLabel: { color: th.muted, fontSize: 11 }, axisLine: { show: false }, axisTick: { show: false } },
      visualMap: { min: 0, max, show: false, inRange: { color: [th.line, th.accent] } },
      series: [{ type: "heatmap", data: st.heat.map(([w, h, n]) => [h, w, n]), itemStyle: { borderColor: th.surface, borderWidth: 2, borderRadius: 2 } }],
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st]);

  if (!st) return <Spinner />;
  const c = st.current;
  const p = st.previous;
  const topPost = st.top_items.find((x) => x.kind === "news");
  const topPage = st.top_pages[0];
  const active = Math.round((1 - (c.bounce_rate || 0)) * 100);
  return (
    <div className="a-page dsh">
      <div className="dsh-row1">
        <div className="dsh-left">
          <section className="dsh-welcome">
            <div className="dsh-welcome-txt">
              <div className="dsh-hello">
                <span className="dsh-hello-ic">
                  <TrendingUp size={22} />
                </span>
                <h1>
                  Xush kelibsiz,
                  <br />
                  {me?.name || me?.login || "Administrator"}
                </h1>
              </div>
              <div className="dsh-welcome-nums">
                <div>
                  <small>
                    <Radio size={13} /> Hozir saytda
                  </small>
                  <b>{fmtNum(st.live)}</b>
                </div>
                <div>
                  <small>Bugun ko‘rishlar</small>
                  <b>{fmtNum(st.totals.today_pageviews)}</b>
                </div>
              </div>
            </div>
          </section>
          <div className="dsh-minis">
            <Mini tone="sky" label="Tashrif buyuruvchilar" value={fmtNum(c.visitors)} cur={c.visitors} prev={p.visitors} data={st.series.visitors} kind="line" />
            <Mini tone="gold" label="Sahifa ko‘rishlar" value={fmtNum(c.pageviews)} cur={c.pageviews} prev={p.pageviews} data={st.series.pageviews} kind="bar" />
          </div>
        </div>
        <Card
          title="Trafik"
          sub="Ko‘rishlar, tashrif buyuruvchilar va o‘qishlar"
          className="dsh-traffic"
          actions={
            <div className="a-seg">
              {[7, 30, 90, 365].map((d) => (
                <button key={d} className={days === d ? "on" : ""} onClick={() => setDays(d)}>
                  {d === 365 ? "1 yil" : `${d} kun`}
                </button>
              ))}
            </div>
          }
        >
          <Chart option={traffic} height={300} />
        </Card>
      </div>

      <div className="dsh-row2">
        <Card title="Faollik" sub={`So‘nggi ${days === 365 ? "1 yil" : `${days} kun`}`} className="dsh-perf">
          <div className="dsh-perf-in">
            <ul className="dsh-perf-list">
              <li>
                <span className="md-tile primary">
                  <BookOpen size={20} />
                </span>
                <span>
                  <b>{`${fmtNum(c.reads)} ta o‘qish`}</b>
                  <small>yangilik va e’lonlar</small>
                </span>
              </li>
              <li>
                <span className="md-tile red">
                  <MousePointerClick size={20} />
                </span>
                <span>
                  <b>{`${fmtNum(c.visits)} ta tashrif`}</b>
                  <small>{`${fmtNum(c.pages_per_visit, 1)} sahifa / tashrif`}</small>
                </span>
              </li>
              <li>
                <span className="md-tile green">
                  <Mail size={20} />
                </span>
                <span>
                  <b>{`${fmtNum(st.totals.subscribers)} ta obunachi`}</b>
                  <small>{`+${c.new_subscribers} davrda · ${st.totals.pending_subscribers} kutilmoqda`}</small>
                </span>
              </li>
            </ul>
            <div className="dsh-gauge">
              <Chart option={gauge(active)} height={150} />
              <b>{dur(c.avg_duration)}</b>
              <small>{`o‘rtacha tashrif vaqti · faol tashriflar ${active}%`}</small>
            </div>
          </div>
        </Card>
        <Card title="Qurilmalar" sub="Qaysi qurilmadan kirishdi">
          <Donut data={st.devices} option={donut(st.devices, { desktop: "Kompyuter", mobile: "Telefon", tablet: "Planshet" })} />
        </Card>
        <Card title="Tillar" sub="Sayt qaysi tilda o‘qilmoqda">
          <Donut data={st.langs} option={donut(st.langs, { uz: "O‘zbek", ru: "Rus", en: "Ingliz" })} />
        </Card>
      </div>

      <div className="dash-grid">
        <Card title="Sahifalar bo‘yicha" sub="Yangiliklar, yo‘nalishlar va boshqa sahifalar: ko‘rish va o‘qish" className="span2" pad={false}>
          <div className="a-table-scroll">
            <table className="a-table">
              <thead>
                <tr>
                  <th>Sarlavha</th>
                  <th className="n">Ko‘rish</th>
                  <th className="n">Kishi</th>
                  <th className="n">O‘qish</th>
                  <th className="n">O‘qib chiqish</th>
                  <th className="n">O‘rt. vaqt</th>
                </tr>
              </thead>
              <tbody>
                {st.top_items.length === 0 && (
                  <tr>
                    <td colSpan={6} className="muted">
                      Hali ma’lumot yo‘q
                    </td>
                  </tr>
                )}
                {st.top_items.map((x) => (
                  <tr key={x.id}>
                    <td>
                      <span className={`kind-dot ${x.kind}`} />
                      <a href={`/${SECTION_OF[x.kind] || x.kind}/${x.slug}`} target="_blank" rel="noreferrer">
                        {x.title}
                      </a>
                    </td>
                    <td className="n">{fmtNum(x.views)}</td>
                    <td className="n">{fmtNum(x.visitors)}</td>
                    <td className="n">{["news", "announce", "page"].includes(x.kind) ? fmtNum(x.reads) : "—"}</td>
                    <td className="n">
                      {["news", "announce", "page"].includes(x.kind) ? (
                        <span className="bar-cell">
                          <i style={{ width: `${Math.min(100, x.read_rate * 100)}%` }} />
                          {fmtNum(x.read_rate * 100)}%
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="n">{x.avg_seconds ? dur(x.avg_seconds) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <Card title="Eng yaxshilari" className="dsh-best">
          <div className="best">
            <div>
              <small>Eng ko‘p o‘qilgan yangilik</small>
              {topPost ? (
                <>
                  <b>{topPost.title}</b>
                  <span>
                    {fmtNum(topPost.views)} ko‘rish · {fmtNum(topPost.reads)} o‘qish · {dur(topPost.avg_seconds)}
                  </span>
                </>
              ) : (
                <span className="muted">hali ma’lumot yo‘q</span>
              )}
            </div>
            <div>
              <small>Eng ko‘p ochilgan sahifa</small>
              {topPage ? (
                <>
                  <b>{PAGE_NAMES[topPage.path] || topPage.path}</b>
                  <span>
                    {fmtNum(topPage.views)} ko‘rish · {fmtNum(topPage.visitors)} kishi
                  </span>
                </>
              ) : (
                <span className="muted">hali ma’lumot yo‘q</span>
              )}
            </div>
            <div>
              <small>Kontent</small>
              <span>
                {st.items.news?.published || 0} yangilik · {st.items.announce?.published || 0} e’lon · {st.items.program?.published || 0} yo‘nalish · {st.items.staff?.published || 0} xodim
              </span>
            </div>
            {st.totals.messages_unread > 0 && (
              <Link to="/admin/desk" className="best-msg">
                <Mail size={14} /> {st.totals.messages_unread} ta o‘qilmagan xabar →
              </Link>
            )}
          </div>
        </Card>
        <Card title="Sahifalar" pad={false}>
          <ul className="rank">
            {st.top_pages.map((x) => (
              <li key={x.path}>
                <i style={{ width: `${(x.views / Math.max(1, st.top_pages[0]?.views || 1)) * 100}%` }} />
                <span title={x.path}>{PAGE_NAMES[x.path] || x.path}</span>
                <b>{fmtNum(x.views)}</b>
              </li>
            ))}
            {!st.top_pages.length && <li className="muted">—</li>}
          </ul>
        </Card>
        <Card title="Qayerdan kelishdi" pad={false}>
          <ul className="rank">
            <li>
              <i style={{ width: `${(st.direct / Math.max(1, st.direct, ...st.referrers.map((r) => r.value))) * 100}%` }} />
              <span>To‘g‘ridan-to‘g‘ri</span>
              <b>{fmtNum(st.direct)}</b>
            </li>
            {st.referrers.map((r) => (
              <li key={r.name}>
                <i style={{ width: `${(r.value / Math.max(1, st.direct, ...st.referrers.map((x) => x.value))) * 100}%` }} />
                <span>{r.name}</span>
                <b>{fmtNum(r.value)}</b>
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Brauzerlar" sub="Saytni qaysi brauzerda ochishdi">
          <Donut data={st.browsers} option={donut(st.browsers)} />
        </Card>
        <Card title="Faollik: hafta kuni × soat" className="span2">
          <Chart option={heat} height={220} />
        </Card>
      </div>
      <div className="guide">
        {GUIDE.map((g) => (
          <Link key={g.to} to={g.to} className="guide-card">
            <span className="guide-ic">{g.icon}</span>
            <b>{g.title}</b>
            <small>{g.text}</small>
          </Link>
        ))}
      </div>
      <p className="a-hint center">
        Hisoblash qoidasi: tashrif buyuruvchi — brauzerdagi anonim identifikator; tashrif — 30 daqiqa faolsizlikkacha bo‘lgan sessiya; sahifani 30 daqiqa ichida qayta ochish (yangilash) yangi ko‘rish hisoblanmaydi; botlar va admin tashriflari hisobga olinmaydi.
      </p>
    </div>
  );
}
