// BRM sahifasi (/upgoals) boshqaruvi: ustuvor maqsadlar, kirish matni, har bir maqsad bo'yicha institut hissasi va faoliyat,
// hujjatlar (siyosat, hisobot — PDF yuklash yoki havola). Maqsadlarning o'zi (nomi, mohiyati, raqamlar) — site/upgoals/data.ts.
import { ArrowDown, ArrowUp, ExternalLink, Plus, Trash2 } from "lucide-react";
import { useEffect, useState, type CSSProperties } from "react";
import type { Lang } from "../../lib/api";
import { req } from "../../lib/api";
import { GOALS, PRIORITY_DEFAULT } from "../../site/upgoals/data";
import {
  Btn,
  Card,
  Field,
  ImageField,
  Input,
  LangTabs,
  PageHead,
  Spinner,
  Textarea,
  useBaseLang,
  useToast,
} from "../ui";

type L = Partial<Record<Lang, string>>;
type Item = {
  id: string;
  title: L;
  body: L;
  date: string;
  image: string;
  url: string;
};
type Doc = { id: string; title: L; url: string; goals: number[] };
type Data = {
  intro: L;
  priority?: number[];
  goals: Record<string, { text: L; items: Item[] }>;
  docs: Doc[];
};

const uid = () => Math.random().toString(36).slice(2, 10);

export function UpGoalsAdminPage() {
  const toast = useToast();
  const base = useBaseLang() || "uz";
  const [d, setD] = useState<Data | null>(null);
  const [lang, setLang] = useState<Lang>("uz");
  const [goal, setGoal] = useState(2);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    req<Data>("GET", "/api/admin/upgoals")
      .then((r) =>
        setD({
          intro: r.intro || {},
          priority: r.priority,
          goals: r.goals || {},
          docs: r.docs || [],
        }),
      )
      .catch(() => setD({ intro: {}, goals: {}, docs: [] }));
  }, []);
  if (!d) return <Spinner />;
  const prio = d.priority ?? PRIORITY_DEFAULT;
  const g = d.goals[String(goal)] || { text: {}, items: [] };
  const setGoalData = (patch: Partial<{ text: L; items: Item[] }>) =>
    setD({ ...d, goals: { ...d.goals, [String(goal)]: { ...g, ...patch } } });
  const setItem = (i: number, patch: Partial<Item>) =>
    setGoalData({
      items: g.items.map((x, k) => (k === i ? { ...x, ...patch } : x)),
    });
  const setDoc = (i: number, patch: Partial<Doc>) =>
    setD({
      ...d,
      docs: d.docs.map((x, k) => (k === i ? { ...x, ...patch } : x)),
    });
  const filled = (l: Lang) =>
    !!(d.intro[l] || Object.values(d.goals).some((x) => x.text?.[l]));
  const def = GOALS[goal - 1];
  const save = async () => {
    setBusy(true);
    try {
      const r = await req<Data>("PUT", "/api/admin/upgoals", d);
      setD({
        intro: r.intro || {},
        priority: r.priority,
        goals: r.goals || {},
        docs: r.docs || [],
      });
      toast("Saqlandi");
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setBusy(false);
    }
  };
  const chip = (n: number, on: boolean, onClick: () => void) => (
    <button
      key={n}
      type="button"
      className={`ugA-chip ${on ? "on" : ""}`}
      style={{ "--c": GOALS[n - 1].color } as CSSProperties}
      onClick={onClick}
      title={GOALS[n - 1].title.uz}
      aria-pressed={on}
    >
      {n}
    </button>
  );
  return (
    <div className="a-page">
      <PageHead
        title="Barqaror rivojlanish maqsadlari"
        sub={
          <>
            Saytdagi{" "}
            <a href="/upgoals" target="_blank" rel="noreferrer">
              /upgoals <ExternalLink size={12} />
            </a>{" "}
            sahifasi: institut hissasi, faoliyat va hujjatlar. Maqsadlarning
            nomi, mohiyati va raqamlari uch tilda tayyor.
          </>
        }
        actions={
          <Btn kind="primary" busy={busy} onClick={save}>
            Saqlash
          </Btn>
        }
      />
      <div style={{ margin: "0 0 16px" }}>
        <LangTabs value={lang} onChange={setLang} base={base} filled={filled} />
      </div>

      <Card
        title="Umumiy"
        sub="Kirish matni bo‘sh qolsa — standart matn ko‘rsatiladi"
      >
        <Field label="Kirish matni" wide>
          <Textarea
            rows={4}
            value={d.intro[lang] || ""}
            onChange={(e) =>
              setD({ ...d, intro: { ...d.intro, [lang]: e.target.value } })
            }
            maxLength={2000}
          />
        </Field>
        <Field
          label="Institut ustuvor maqsadlari"
          hint="Sahifada katta plitkalar bilan alohida ko‘rsatiladi"
          wide
        >
          <div className="ugA-chips">
            {GOALS.map((x) =>
              chip(x.n, prio.includes(x.n), () =>
                setD({
                  ...d,
                  priority: prio.includes(x.n)
                    ? prio.filter((y) => y !== x.n)
                    : [...prio, x.n].sort((a, b) => a - b),
                }),
              ),
            )}
          </div>
        </Field>
      </Card>

      <Card
        title="Maqsad bo‘yicha"
        sub="Maqsadni tanlang: institut hissasi matni va faoliyat (tadbir, loyiha, yangilik)"
      >
        <div className="ugA-chips big">
          {GOALS.map((x) => chip(x.n, goal === x.n, () => setGoal(x.n)))}
          <span className="ugA-cur">
            {goal}. {def.title.uz}
          </span>
        </div>
        <Field
          label="Universitet hissasi"
          hint={
            def.note ? "Bo‘sh qolsa — standart matn ko‘rsatiladi" : undefined
          }
          wide
        >
          <Textarea
            rows={4}
            value={g.text?.[lang] || ""}
            placeholder={def.note?.[lang] || ""}
            onChange={(e) =>
              setGoalData({ text: { ...g.text, [lang]: e.target.value } })
            }
            maxLength={3000}
          />
        </Field>
        <div className="ugA-items">
          {g.items.map((it, i) => (
            <div key={it.id} className="ugA-item">
              <div className="a-form-grid">
                <Field label="Sarlavha">
                  <Input
                    value={it.title[lang] || ""}
                    onChange={(e) =>
                      setItem(i, {
                        title: { ...it.title, [lang]: e.target.value },
                      })
                    }
                    maxLength={200}
                    placeholder={lang === base ? "" : it.title[base] || ""}
                  />
                </Field>
                <Field label="Sana">
                  <Input
                    type="date"
                    value={it.date}
                    onChange={(e) => setItem(i, { date: e.target.value })}
                  />
                </Field>
              </div>
              <Field label="Qisqa matn" wide>
                <Textarea
                  rows={3}
                  value={it.body[lang] || ""}
                  onChange={(e) =>
                    setItem(i, { body: { ...it.body, [lang]: e.target.value } })
                  }
                  maxLength={3000}
                />
              </Field>
              <div className="a-form-grid">
                <Field label="Havola (yangilik yoki tashqi sahifa)">
                  <Input
                    value={it.url}
                    onChange={(e) => setItem(i, { url: e.target.value })}
                    placeholder="/news/... yoki https://..."
                  />
                </Field>
                <ImageField
                  value={it.image}
                  onChange={(v) => setItem(i, { image: v })}
                  label="Rasm"
                />
              </div>
              <div className="ugA-row">
                <Btn
                  size="sm"
                  kind="ghost"
                  icon={<ArrowUp size={14} />}
                  disabled={!i}
                  onClick={() =>
                    setGoalData({ items: swap(g.items, i, i - 1) })
                  }
                  title="Yuqoriga"
                />
                <Btn
                  size="sm"
                  kind="ghost"
                  icon={<ArrowDown size={14} />}
                  disabled={i === g.items.length - 1}
                  onClick={() =>
                    setGoalData({ items: swap(g.items, i, i + 1) })
                  }
                  title="Pastga"
                />
                <Btn
                  size="sm"
                  kind="danger"
                  icon={<Trash2 size={14} />}
                  onClick={() =>
                    setGoalData({ items: g.items.filter((_, k) => k !== i) })
                  }
                >
                  O‘chirish
                </Btn>
              </div>
            </div>
          ))}
        </div>
        <div>
          <Btn
            icon={<Plus size={15} />}
            onClick={() =>
              setGoalData({
                items: [
                  ...g.items,
                  {
                    id: uid(),
                    title: {},
                    body: {},
                    date: new Date().toISOString().slice(0, 10),
                    image: "",
                    url: "",
                  },
                ],
              })
            }
          >
            Faoliyat qo‘shish
          </Btn>
        </div>
      </Card>

      <Card
        title="Hujjatlar va hisobotlar"
        sub="Siyosat, hisobot, reja — PDF yuklang yoki havola kiriting; tegishli maqsadlarni belgilang (belgilanmasa — faqat umumiy ro‘yxatda)"
      >
        <div className="ugA-items">
          {d.docs.map((doc, i) => (
            <div key={doc.id} className="ugA-item">
              <Field label="Nomi" wide>
                <Input
                  value={doc.title[lang] || ""}
                  onChange={(e) =>
                    setDoc(i, {
                      title: { ...doc.title, [lang]: e.target.value },
                    })
                  }
                  maxLength={200}
                  placeholder={lang === base ? "" : doc.title[base] || ""}
                />
              </Field>
              <div className="a-form-grid">
                <ImageField
                  value={doc.url}
                  onChange={(v) => setDoc(i, { url: v })}
                  label="PDF fayl"
                  accept="pdf"
                  aspect="4 / 1"
                />
                <Field label="yoki havola">
                  <Input
                    value={doc.url}
                    onChange={(e) => setDoc(i, { url: e.target.value })}
                    placeholder="https://..."
                  />
                </Field>
              </div>
              <Field label="Maqsadlar" wide>
                <div className="ugA-chips">
                  {GOALS.map((x) =>
                    chip(x.n, doc.goals.includes(x.n), () =>
                      setDoc(i, {
                        goals: doc.goals.includes(x.n)
                          ? doc.goals.filter((y) => y !== x.n)
                          : [...doc.goals, x.n].sort((a, b) => a - b),
                      }),
                    ),
                  )}
                </div>
              </Field>
              <div className="ugA-row">
                <Btn
                  size="sm"
                  kind="danger"
                  icon={<Trash2 size={14} />}
                  onClick={() =>
                    setD({ ...d, docs: d.docs.filter((_, k) => k !== i) })
                  }
                >
                  O‘chirish
                </Btn>
              </div>
            </div>
          ))}
        </div>
        <div>
          <Btn
            icon={<Plus size={15} />}
            onClick={() =>
              setD({
                ...d,
                docs: [...d.docs, { id: uid(), title: {}, url: "", goals: [] }],
              })
            }
          >
            Hujjat qo‘shish
          </Btn>
        </div>
        <p className="a-hint">
          BMTTD O‘zbekiston BRM risolasi (o‘zbek va rus tillarida) sahifada doim
          bor — uni qo‘shish shart emas.
        </p>
      </Card>
    </div>
  );
}

function swap<T>(a: T[], i: number, j: number): T[] {
  const b = [...a];
  [b[i], b[j]] = [b[j], b[i]];
  return b;
}
