// Admin → Tadbirga ro'yxat: tadbir tanlanadi — ro'yxat sozlamalari (sig'im, muddat, kutish ro'yxati, maydonlar, qo'shimcha savollar)
// va ro'yxatdan o'tganlar jadvali (qidiruv, holat, kelganini belgilash, Excel, eslatma xati).
import { Bell, CalendarDays, Download, ExternalLink, Plus, Search, Trash2, UserCheck } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { req, type Lang } from "../../lib/api";
import { Btn, Card, Empty, Field, Input, PageHead, Pill, Spinner, Toggle, useConfirm, useToast } from "../ui";
import { em } from "./kit";

type Mode = "off" | "optional" | "required";
interface Q {
  id?: string;
  label: Partial<Record<Lang, string>>;
  required: boolean;
}
interface Cfg {
  enabled: boolean;
  capacity: number | null;
  deadline: string | null;
  waitlist: boolean;
  guests_max: number;
  fields: Record<"email" | "school" | "grade", Mode>;
  questions: Q[];
}
interface Counts {
  registered: number;
  waitlist: number;
  cancelled: number;
  seats: number;
  checked_in: number;
}
interface Ev {
  id: string;
  title: string;
  slug: string;
  starts: string | null;
  status: string;
  registration: Cfg;
  counts: Counts;
  state: string;
}
interface Reg {
  id: string;
  name: string;
  phone: string;
  email: string;
  school: string;
  grade: string;
  guests: number;
  answers: Record<string, string>;
  status: "registered" | "waitlist" | "cancelled";
  checked_in: boolean;
  created: string;
}
const STATE: Record<string, [string, "ok" | "warn" | "muted" | "info" | "bad"]> = {
  open: ["Ochiq", "ok"],
  waitlist: ["Joy tugagan — kutish ro‘yxati", "warn"],
  full: ["Joy tugagan", "bad"],
  closed: ["Yopilgan", "muted"],
  off: ["O‘chirilgan", "muted"],
};
const ST_L = { registered: "Ro‘yxatda", waitlist: "Kutish ro‘yxati", cancelled: "Bekor qilingan" };
const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" }) : "—");
const local = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

export function EventRegAdmin() {
  const toast = useToast();
  const confirm = useConfirm();
  const [events, setEvents] = useState<Ev[] | null>(null);
  const [sel, setSel] = useState("");
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [regs, setRegs] = useState<Reg[] | null>(null);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [q, setQ] = useState("");
  const [st, setSt] = useState("");
  const loadEvents = useCallback(
    () =>
      req<{ items: Ev[] }>("GET", "/api/admin/eventreg")
        .then((r) => {
          setEvents(r.items);
          setSel((s) => s || r.items.find((e) => e.registration.enabled)?.id || r.items[0]?.id || "");
        })
        .catch((e) => toast(em(e), "error")),
    [toast],
  );
  useEffect(() => {
    loadEvents();
  }, [loadEvents]);
  const ev = events?.find((e) => e.id === sel) || null;
  useEffect(() => {
    if (ev) {
      setCfg(JSON.parse(JSON.stringify(ev.registration)));
      setDirty(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel, events === null]);
  const loadRegs = useCallback(() => {
    if (!sel) return;
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (st) p.set("status", st);
    req<{ items: Reg[]; counts: Counts }>("GET", `/api/admin/eventreg/${sel}/regs?${p}`)
      .then((r) => {
        setRegs(r.items);
        setCounts(r.counts);
      })
      .catch(() => setRegs([]));
  }, [sel, q, st]);
  useEffect(() => {
    const t = window.setTimeout(loadRegs, 200);
    return () => window.clearTimeout(t);
  }, [loadRegs]);

  if (!events) return <Spinner />;
  const up = (p: Partial<Cfg>) => {
    setCfg((c) => (c ? { ...c, ...p } : c));
    setDirty(true);
  };
  const save = async () => {
    if (!cfg) return;
    setBusy(true);
    try {
      const r = await req<{ registration: Cfg; promoted: number }>("PUT", `/api/admin/eventreg/${sel}`, cfg);
      setCfg(r.registration);
      setDirty(false);
      toast(r.promoted ? `Saqlandi · kutish ro‘yxatidan o‘tkazildi: ${r.promoted}` : "Saqlandi");
      loadEvents();
      loadRegs();
    } catch (e) {
      toast(em(e), "error");
    }
    setBusy(false);
  };
  const patch = async (r: Reg, d: Partial<Reg>) => {
    try {
      const x = await req<{ promoted: number; counts: Counts }>("PATCH", `/api/admin/eventreg/regs/${r.id}`, d);
      if (x.promoted) toast(`Kutish ro‘yxatidan o‘tkazildi: ${x.promoted}`);
      setCounts(x.counts);
      loadRegs();
    } catch (e) {
      toast(em(e), "error");
    }
  };
  const remind = async () => {
    if (!(await confirm("Ro‘yxatdagi (kutish ro‘yxatisiz) email kiritgan barcha ishtirokchilarga eslatma xati yuborilsinmi?"))) return;
    try {
      const r = await req<{ queued: number }>("POST", `/api/admin/eventreg/${sel}/remind`);
      toast(`Eslatma yuborilmoqda: ${r.queued} ta email`);
    } catch (e) {
      toast(em(e), "error");
    }
  };
  const qs = cfg?.questions || [];
  return (
    <div className="a-page">
      <PageHead
        title="Tadbirga ro‘yxatdan o‘tish"
        sub="Har qanday tadbir (masalan, ochiq eshiklar kuni) uchun saytda ro‘yxatdan o‘tish formasi: sig‘im, kutish ro‘yxati, muddat, qo‘shimcha savollar. Tasdiqlash xatida taqvim (.ics) havolasi bo‘ladi."
      />
      {events.length === 0 ? (
        <Card>
          <Empty icon={<CalendarDays size={28} />} title="Hali tadbir yo‘q">
            <a className="a-btn accent md" href="/admin/events/new">
              <Plus size={15} />
              <span>Tadbir yaratish</span>
            </a>
          </Empty>
        </Card>
      ) : (
        <>
          <div className="list-tools">
            <label className="cxa-row">
              <span className="a-label">Tadbir</span>
              <select className="a-input cxa-ev" value={sel} onChange={(e) => setSel(e.target.value)}>
                {events.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.registration.enabled ? "● " : ""}
                    {e.title.slice(0, 80)} — {fmt(e.starts)}
                  </option>
                ))}
              </select>
            </label>
            {ev && (
              <span className="cxa-row">
                <Pill tone={STATE[ev.state]?.[1] || "muted"}>{STATE[ev.state]?.[0] || ev.state}</Pill>
                {ev.status === "published" && (
                  <a className="a-btn ghost sm" href={`/events/${ev.slug}`} target="_blank" rel="noreferrer">
                    <ExternalLink size={14} />
                    <span>Saytda</span>
                  </a>
                )}
              </span>
            )}
          </div>
          {cfg && (
            <Card
              title="Ro‘yxat sozlamalari"
              actions={
                <Btn kind="primary" busy={busy} disabled={!dirty} onClick={save}>
                  Saqlash
                </Btn>
              }
            >
              <Toggle checked={cfg.enabled} onChange={(v) => up({ enabled: v })} label="Saytda ro‘yxatdan o‘tish formasi" hint="Tadbir sahifasida chiqadi" />
              <div className="a-form-grid" style={{ marginTop: 14 }}>
                <Field label="Sig‘im (o‘rinlar soni)" hint="Bo‘sh — cheklanmagan. Mehmonlar ham o‘rin egallaydi">
                  <Input type="number" min={1} value={cfg.capacity ?? ""} onChange={(e) => up({ capacity: e.target.value ? Number(e.target.value) : null })} />
                </Field>
                <Field label="Ro‘yxat muddati" hint="Bo‘sh — tadbir boshlanguncha">
                  <Input type="datetime-local" value={local(cfg.deadline)} onChange={(e) => up({ deadline: e.target.value ? new Date(e.target.value).toISOString() : null })} />
                </Field>
                <Field label="Mehmonlar (eng ko‘pi)" hint="0 — maydon ko‘rsatilmaydi">
                  <Input type="number" min={0} max={10} value={cfg.guests_max} onChange={(e) => up({ guests_max: Number(e.target.value) || 0 })} />
                </Field>
                <Field label="Joy tugaganda">
                  <Toggle checked={cfg.waitlist} onChange={(v) => up({ waitlist: v })} label="Kutish ro‘yxatiga yozish" />
                </Field>
                {(["email", "school", "grade"] as const).map((k) => (
                  <Field key={k} label={{ email: "Email", school: "Maktab / muassasa", grade: "Sinf / kurs" }[k]}>
                    <select className="a-input" value={cfg.fields[k]} onChange={(e) => up({ fields: { ...cfg.fields, [k]: e.target.value as Mode } })}>
                      <option value="off">Ko‘rsatilmaydi</option>
                      <option value="optional">Ixtiyoriy</option>
                      <option value="required">Majburiy</option>
                    </select>
                  </Field>
                ))}
              </div>
              <h4 className="cxa-h">Qo‘shimcha savollar (5 tagacha)</h4>
              {qs.map((x, i) => (
                <div key={x.id || i} className="cxa-q">
                  {(["uz", "ru", "en"] as Lang[]).map((l) => (
                    <Input
                      key={l}
                      value={x.label[l] || ""}
                      placeholder={`Savol (${l.toUpperCase()})`}
                      aria-label={`Savol ${i + 1} (${l.toUpperCase()})`}
                      onChange={(e) => up({ questions: qs.map((y, j) => (j === i ? { ...y, label: { ...y.label, [l]: e.target.value } } : y)) })}
                    />
                  ))}
                  <Toggle checked={x.required} onChange={(v) => up({ questions: qs.map((y, j) => (j === i ? { ...y, required: v } : y)) })} label="Majburiy" />
                  <button className="a-icon danger" aria-label="Savolni o‘chirish" onClick={() => up({ questions: qs.filter((_, j) => j !== i) })}>
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              {qs.length < 5 && (
                <Btn size="sm" icon={<Plus size={14} />} onClick={() => up({ questions: [...qs, { label: {}, required: false }] })}>
                  Savol qo‘shish
                </Btn>
              )}
            </Card>
          )}
          <Card
            title="Ro‘yxatdan o‘tganlar"
            sub={
              counts
                ? `Ro‘yxatda: ${counts.registered} (o‘rin: ${counts.seats}${cfg?.capacity ? ` / ${cfg.capacity}` : ""}) · kutish ro‘yxati: ${counts.waitlist} · bekor: ${counts.cancelled} · keldi: ${counts.checked_in}`
                : undefined
            }
            actions={
              <div className="cxa-tools">
                <a className="a-btn ghost sm" href={`/api/admin/eventreg/${sel}/regs.xlsx`}>
                  <Download size={14} />
                  <span>Excel</span>
                </a>
                <Btn size="sm" icon={<Bell size={14} />} onClick={remind} disabled={!counts?.registered}>
                  Eslatma yuborish
                </Btn>
              </div>
            }
          >
            <div className="list-tools">
              <div className="a-seg">
                {[
                  ["", "Barchasi"],
                  ["registered", "Ro‘yxatda"],
                  ["waitlist", "Kutish"],
                  ["cancelled", "Bekor"],
                ].map(([k, l]) => (
                  <button key={k} className={st === k ? "on" : ""} onClick={() => setSt(k)}>
                    {l}
                  </button>
                ))}
              </div>
              <label className="a-search">
                <Search size={15} />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ism, telefon, maktab…" aria-label="Qidirish" />
              </label>
            </div>
            {!regs ? (
              <Spinner />
            ) : regs.length === 0 ? (
              <Empty icon={<UserCheck size={26} />} title={q || st ? "Hech narsa topilmadi" : "Hali hech kim ro‘yxatdan o‘tmagan"} />
            ) : (
              <div className="cxa-tablewrap">
                <table className="a-table cxa-table">
                  <thead>
                    <tr>
                      <th>№</th>
                      <th>F.I.Sh.</th>
                      <th>Telefon / email</th>
                      <th>Maktab, sinf</th>
                      <th>Mehmon</th>
                      {qs.map((x, i) => (
                        <th key={x.id || i}>{x.label.uz || x.label.ru || x.label.en}</th>
                      ))}
                      <th>Holat</th>
                      <th>Keldi</th>
                      <th aria-label="Amallar" />
                    </tr>
                  </thead>
                  <tbody>
                    {regs.map((r, i) => (
                      <tr key={r.id} className={r.status === "cancelled" ? "dim" : ""}>
                        <td className="n">{i + 1}</td>
                        <td>
                          <b>{r.name}</b>
                          <small className="cxa-sub">{fmt(r.created)}</small>
                        </td>
                        <td>
                          <a href={`tel:${r.phone}`}>{r.phone}</a>
                          {r.email && <small className="cxa-sub">{r.email}</small>}
                        </td>
                        <td>{[r.school, r.grade].filter(Boolean).join(", ") || "—"}</td>
                        <td className="n">{r.guests || ""}</td>
                        {qs.map((x, j) => (
                          <td key={x.id || j}>{x.id ? r.answers[x.id] || "" : ""}</td>
                        ))}
                        <td>
                          <select className="a-input" value={r.status} aria-label="Holat" onChange={(e) => patch(r, { status: e.target.value as Reg["status"] })}>
                            {Object.entries(ST_L).map(([k, l]) => (
                              <option key={k} value={k}>
                                {l}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <input type="checkbox" className="cxa-check" checked={r.checked_in} aria-label={`${r.name} keldi`} onChange={(e) => patch(r, { checked_in: e.target.checked })} />
                        </td>
                        <td>
                          <button
                            className="a-icon danger"
                            aria-label="O‘chirish"
                            onClick={async () => {
                              if (!(await confirm(`«${r.name}» ro‘yxatdan o‘chirilsinmi?`))) return;
                              await req("DELETE", `/api/admin/eventreg/regs/${r.id}`).catch((e) => toast(em(e), "error"));
                              loadRegs();
                            }}
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
