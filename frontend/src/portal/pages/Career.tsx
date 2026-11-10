// Talaba kabineti: «Karyera» — karyera markazi imkoniyatlari (o'z yo'nalishiga moslari birinchi) va xabarnoma sozlamasi
import { Briefcase, ExternalLink, MapPin, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { req, type Lang } from "../../lib/api";
import { fmtDate } from "../../lib/i18n";
import { Card, Empty, PageHead, Pill, Select, Spinner, Toggle, useRun } from "../../admin/ui";
import { usePortal } from "../PortalApp";
import "../../styles/career-admin.css";

type Opp = {
  id: string;
  slug: string;
  title: string;
  company: string;
  logo: string;
  type: string;
  city: string;
  remote: boolean;
  salary: string;
  summary: string;
  deadline: string | null;
  published_at: string | null;
  program_ids: string[];
  match: boolean;
};
type Data = { items: Opp[]; program: { id: string; title: string } | null; muted: boolean; notify: boolean };

const T: Record<Lang, Record<string, string>> = {
  uz: {
    title: "Karyera",
    sub: "Karyera markazidagi amaliyot, ish o‘rinlari va loyihalar. O‘z yo‘nalishingizga moslari birinchi.",
    program: "Yo‘nalishingiz",
    notify: "Mos yangi imkoniyatlar haqida xabar berish",
    notify_hint: "Faqat yo‘nalishingizga mos e’lonlar, kuniga ko‘pi bilan bitta jamlangan xabar (kabinet va Telegram)",
    notify_off: "Xabarnoma karyera markazi tomonidan vaqtincha o‘chirilgan",
    only_mine: "Faqat mening yo‘nalishim",
    all_types: "Barcha turlar",
    search: "Lavozim yoki kompaniya",
    match: "Yo‘nalishingizga mos",
    deadline: "Muddat",
    none: "Hozircha ochiq imkoniyat yo‘q",
    none_f: "Filtr bo‘yicha topilmadi",
    remote: "masofaviy",
    open: "Batafsil va ariza",
    saved: "Saqlandi",
    found: "ta imkoniyat",
    internship: "Amaliyot",
    full_time: "To‘liq stavka",
    part_time: "Yarim stavka",
    traineeship: "Stajirovka",
    project: "Loyiha",
  },
  ru: {
    title: "Карьера",
    sub: "Практика, вакансии и проекты центра карьеры. Подходящие вашему направлению — первыми.",
    program: "Ваше направление",
    notify: "Сообщать о новых подходящих предложениях",
    notify_hint: "Только по вашему направлению, не чаще одного сводного сообщения в день (кабинет и Telegram)",
    notify_off: "Уведомления временно отключены центром карьеры",
    only_mine: "Только моё направление",
    all_types: "Все типы",
    search: "Должность или компания",
    match: "Подходит вашему направлению",
    deadline: "Срок",
    none: "Сейчас открытых предложений нет",
    none_f: "По фильтру ничего не найдено",
    remote: "удалённо",
    open: "Подробнее и отклик",
    saved: "Сохранено",
    found: "предложений",
    internship: "Практика",
    full_time: "Полная ставка",
    part_time: "Неполная ставка",
    traineeship: "Стажировка",
    project: "Проект",
  },
  en: {
    title: "Career",
    sub: "Internships, jobs and projects from the Career Centre. Those matching your programme come first.",
    program: "Your programme",
    notify: "Notify me about new matching opportunities",
    notify_hint: "Only for your programme, at most one summary message per day (portal and Telegram)",
    notify_off: "Notifications are temporarily turned off by the Career Centre",
    only_mine: "Only my programme",
    all_types: "All types",
    search: "Role or company",
    match: "Matches your programme",
    deadline: "Deadline",
    none: "There are no open opportunities right now",
    none_f: "Nothing matches the filter",
    remote: "remote",
    open: "Details and apply",
    saved: "Saved",
    found: "opportunities",
    internship: "Internship",
    full_time: "Full-time",
    part_time: "Part-time",
    traineeship: "Traineeship",
    project: "Project",
  },
};

const fmtD = (iso: string | null, lang: Lang) => (iso ? fmtDate(iso, lang, true) : "—");

export function CareerPortalPage() {
  const { lang } = usePortal();
  const L = T[lang] || T.uz;
  const run = useRun();
  const [d, setD] = useState<Data | null>(null);
  const [type, setType] = useState("");
  const [mine, setMine] = useState(false);
  const [q, setQ] = useState("");
  useEffect(() => {
    req<Data>("GET", `/api/portal/career?lang=${lang}`)
      .then(setD)
      .catch(() => setD({ items: [], program: null, muted: false, notify: false }));
  }, [lang]);
  const types = useMemo(() => [...new Set((d?.items || []).map((x) => x.type))], [d]);
  if (!d) return <Spinner />;
  const shown = d.items.filter((x) => (!type || x.type === type) && (!mine || x.match) && (!q || `${x.title} ${x.company}`.toLowerCase().includes(q.toLowerCase())));
  return (
    <div className="a-page">
      <PageHead title={L.title} sub={L.sub} />
      <Card>
        <div className="pc-head">
          {d.program && (
            <p className="pc-prog">
              <span>{L.program}:</span> <b>{d.program.title}</b>
            </p>
          )}
          <Toggle
            checked={d.notify && !d.muted}
            onChange={async (on) => {
              if (!d.notify) return;
              const r = await run(() => req<{ muted: boolean }>("PUT", "/api/portal/career/notify", { on }), L.saved);
              if (r) setD({ ...d, muted: r.muted });
            }}
            label={L.notify}
            hint={d.notify ? L.notify_hint : L.notify_off}
          />
        </div>
      </Card>
      <div className="list-tools ca-tools">
        <div className="ca-tools-l">
          {types.length > 1 && (
            <div className="ca-sel">
              <Select value={type} onChange={setType} options={[{ value: "", label: L.all_types }, ...types.map((x) => ({ value: x, label: L[x] || x }))]} />
            </div>
          )}
          {d.program && d.items.some((x) => x.match) && <Toggle checked={mine} onChange={setMine} label={L.only_mine} />}
        </div>
        <label className="a-search">
          <Search size={15} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={L.search} aria-label={L.search} />
        </label>
      </div>
      {shown.length === 0 ? (
        <Card>
          <Empty icon={<Briefcase size={28} />} title={d.items.length ? L.none_f : L.none} />
        </Card>
      ) : (
        <>
          <p className="pc-count" role="status">
            {shown.length} {L.found}
          </p>
          <div className="doc-list">
            {shown.map((x) => (
              <a key={x.id} className="doc-row pc-row" href={`/career-center/${x.slug}`} target="_blank" rel="noreferrer">
                <div className="doc-thumb ca-thumb">{x.logo ? <img src={x.logo} alt="" /> : <span>{(x.company || x.title).slice(0, 2).toUpperCase()}</span>}</div>
                <div className="doc-main">
                  <b>{x.title}</b>
                  <small>
                    {x.match && <Pill tone="ok">{L.match}</Pill>}
                    <Pill tone="info">{L[x.type] || x.type}</Pill>
                    {x.company}
                    {(x.city || x.remote) && (
                      <>
                        <MapPin size={13} aria-hidden="true" />
                        {[x.city, x.remote ? L.remote : ""].filter(Boolean).join(", ")}
                      </>
                    )}
                    <span>
                      {L.deadline}: {fmtD(x.deadline, lang)}
                    </span>
                  </small>
                </div>
                <span className="pc-go">
                  <span className="sr-only">{L.open}</span>
                  <ExternalLink size={16} aria-hidden="true" />
                </span>
              </a>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
