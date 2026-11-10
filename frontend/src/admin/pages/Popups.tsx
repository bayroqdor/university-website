// E'lon oynasi: saytga kirganda chiqadigan modal. Matn, rasm, video, tugmalar (3 tilda), davr, qanchalik tez-tez va qaysi sahifalarda.
import { ArrowLeft, Copy, Eye, ImagePlus, LayoutTemplate, Megaphone, Palette, Pencil, Plus, Trash2, Video, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Lang, SitePopup } from "../../lib/api";
import { PopupCard, PopupModal } from "../../site/Popup";
import { admin, errMsg, type AdminPopup, type LangMap } from "../api";
import { Btn, Card, Empty, Field, ImageField, Input, LangTabs, MediaLibrary, PageHead, Pill, Select, Spinner, TagInput, Textarea, Toggle, fmtDateTime, useBaseLang, useConfirm, useToast } from "../ui";

const FREQ: { value: AdminPopup["frequency"]; label: string }[] = [
  { value: "session", label: "Har tashrifda bir marta (sessiya)" },
  { value: "daily", label: "Kuniga bir marta" },
  { value: "once", label: "Faqat bir marta (o‘zgartirilsa — yana)" },
  { value: "always", label: "Har safar sahifa ochilganda" },
];
const PAGES: { value: AdminPopup["pages"]; label: string }[] = [
  { value: "all", label: "Barcha sahifalarda" },
  { value: "home", label: "Faqat bosh sahifada" },
  { value: "list", label: "Tanlangan sahifalarda" },
];
const LAYOUTS: { value: AdminPopup["layout"]; label: string; hint: string }[] = [
  { value: "stack", label: "Ustma-ust", hint: "Rasm tepada, matn pastda" },
  { value: "split", label: "Yonma-yon", hint: "Rasm chapda, matn o‘ngda" },
  { value: "cover", label: "To‘liq fon", hint: "Rasm fon, matn ustida" },
];
// sayt ranglari: ko'k, yashil, oltin, to'q qizil, havorang, kulrang, qora
const ACCENTS = ["", "#0A2E73", "#1E4A38", "#B08D3C", "#8A2432", "#2B5A94", "#565C69", "#121418"];

const blank = (): AdminPopup => ({
  active: true,
  name: "",
  title: {},
  body: {},
  badge: {},
  image: "",
  video: "",
  layout: "stack",
  accent: "",
  buttons: [],
  start: null,
  end: null,
  frequency: "session",
  delay: 2,
  pages: "all",
  paths: [],
});

function loc(m: LangMap, l: Lang, base: Lang): string {
  return m[l] || m[base] || m.uz || Object.values(m).find(Boolean) || "";
}

export function toPublic(p: AdminPopup, l: Lang, base: Lang): SitePopup {
  return {
    id: p.id || "new",
    version: p.version || 1,
    title: loc(p.title, l, base),
    body: loc(p.body, l, base),
    badge: loc(p.badge, l, base),
    image: p.image,
    video: p.video,
    layout: p.layout,
    accent: p.accent,
    frequency: p.frequency,
    delay: p.delay,
    pages: p.pages,
    paths: p.paths,
    buttons: p.buttons.filter((b) => b.url).map((b) => ({ label: loc(b.label, l, base) || "…", url: b.url, style: b.style, new_tab: b.new_tab })),
  };
}

function status(p: AdminPopup): { tone: "ok" | "warn" | "bad" | "muted" | "info"; label: string } {
  const now = new Date();
  const iso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}T${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  if (!p.active) return { tone: "muted", label: "O‘chirilgan" };
  if (p.end && iso > p.end) return { tone: "bad", label: "Muddati tugagan" };
  if (p.start && iso < p.start) return { tone: "info", label: "Rejalashtirilgan" };
  return { tone: "ok", label: "Saytda ko‘rinmoqda" };
}

export function PopupsPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const base = useBaseLang() || "uz";
  const [items, setItems] = useState<AdminPopup[] | null>(null);
  const [edit, setEdit] = useState<{ i: number; p: AdminPopup } | null>(null);
  const [busy, setBusy] = useState(false);
  const [full, setFull] = useState<SitePopup | null>(null);

  useEffect(() => {
    admin
      .popups()
      .then((r) => setItems(r.items))
      .catch(() => setItems([]));
  }, []);

  const persist = useCallback(
    async (next: AdminPopup[], msg = "Saqlandi") => {
      setBusy(true);
      try {
        const r = await admin.savePopups(next);
        setItems(r.items);
        toast(msg);
        return r.items;
      } catch (e) {
        toast(errMsg(e), "error");
        return null;
      } finally {
        setBusy(false);
      }
    },
    [toast],
  );

  if (!items) return <Spinner />;

  if (edit)
    return (
      <PopupEditor
        value={edit.p}
        base={base}
        busy={busy}
        onCancel={() => setEdit(null)}
        onSave={async (p) => {
          const next = [...items];
          if (edit.i < 0) next.unshift(p);
          else next[edit.i] = p;
          if (await persist(next)) setEdit(null);
        }}
      />
    );

  return (
    <div className="a-page">
      <PageHead
        title="E’lon oynasi"
        sub="Saytga kirgan foydalanuvchiga chiroyli oynada e’lon ko‘rsatiladi: matn, rasm yoki video, tugmalar. Davrini, qanchalik tez-tez va qaysi sahifalarda chiqishini belgilang."
        actions={
          <Btn kind="primary" icon={<Plus size={15} />} onClick={() => setEdit({ i: -1, p: blank() })}>
            Yangi e’lon
          </Btn>
        }
      />
      {!items.length ? (
        <Empty icon={<Megaphone size={26} />} title="Hali e’lon yo‘q">
          «Yangi e’lon» tugmasini bosing — masalan, qabul boshlangani, ochiq eshiklar kuni yoki muhim yangilik haqida.
        </Empty>
      ) : (
        <div className="pop-adm-list">
          {items.map((p, i) => {
            const s = status(p);
            const pub = toPublic(p, base, base);
            return (
              <div key={p.id || i} className={`pop-adm-row ${p.active ? "" : "off"}`}>
                <button className="pop-adm-thumb" onClick={() => setFull(pub)} title="Ko‘rish" style={p.accent ? { background: p.accent } : undefined}>
                  {p.image ? <img src={p.image} alt="" /> : p.video ? <Video size={22} /> : <Megaphone size={22} />}
                  <span className="pop-adm-eye">
                    <Eye size={16} />
                  </span>
                </button>
                <div className="pop-adm-info">
                  <div className="pop-adm-title">
                    <b>{p.name || pub.title || "Nomsiz e’lon"}</b>
                    <Pill tone={s.tone}>{s.label}</Pill>
                  </div>
                  {p.name && pub.title && <span className="pop-adm-sub">{pub.title}</span>}
                  <span className="pop-adm-meta">
                    {FREQ.find((f) => f.value === p.frequency)?.label} · {PAGES.find((x) => x.value === p.pages)?.label}
                    {p.start || p.end ? ` · ${p.start ? fmtDateTime(p.start) : "…"} — ${p.end ? fmtDateTime(p.end) : "…"}` : ""}
                    {p.buttons.length ? ` · ${p.buttons.length} ta tugma` : ""}
                  </span>
                </div>
                <div className="pop-adm-tools">
                  <Toggle checked={p.active} onChange={(v) => persist(items.map((x, j) => (j === i ? { ...x, active: v } : x)), v ? "Yoqildi" : "O‘chirildi")} label="" />
                  <Btn size="sm" icon={<Pencil size={14} />} onClick={() => setEdit({ i, p: JSON.parse(JSON.stringify(p)) })}>
                    Tahrirlash
                  </Btn>
                  <Btn size="sm" kind="ghost" icon={<Copy size={14} />} title="Nusxa olish" onClick={() => persist([...items, { ...JSON.parse(JSON.stringify(p)), id: undefined, active: false, name: (p.name || pub.title) + " (nusxa)" }], "Nusxa olindi")} />
                  <Btn
                    size="sm"
                    kind="ghost"
                    icon={<Trash2 size={14} />}
                    title="O‘chirish"
                    onClick={async () => {
                      if (await confirm(`«${p.name || pub.title || "E’lon"}» o‘chirilsinmi?`)) persist(items.filter((_, j) => j !== i), "O‘chirildi");
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
      <PopupModal popup={full} onClose={() => setFull(null)} />
    </div>
  );
}

/* ------------------------------------------------------------------ tahrirlovchi */
function PopupEditor({ value, base, busy, onCancel, onSave }: { value: AdminPopup; base: Lang; busy: boolean; onCancel: () => void; onSave: (p: AdminPopup) => void }) {
  const [p, setP] = useState<AdminPopup>(value);
  const [lang, setLang] = useState<Lang>(base);
  const [media, setMedia] = useState<"image" | "video">(value.video ? "video" : "image");
  const [lib, setLib] = useState(false);
  const [full, setFull] = useState(false);
  const toast = useToast();
  const set = (patch: Partial<AdminPopup>) => setP((x) => ({ ...x, ...patch }));
  const setL = (k: "title" | "body" | "badge", v: string) => setP((x) => ({ ...x, [k]: { ...x[k], [lang]: v } }));
  const preview = useMemo(() => toPublic(p, lang, base), [p, lang, base]);
  const filled = (l: Lang) => !!(p.title[l] || p.body[l]);

  const save = () => {
    if (!p.title[base] && !p.body[base] && !p.image && !p.video) {
      toast("Sarlavha, matn, rasm yoki videodan kamida bittasini kiriting", "error");
      return;
    }
    if (p.start && p.end && p.end < p.start) {
      toast("Tugash vaqti boshlanishidan oldin bo‘lishi mumkin emas", "error");
      return;
    }
    onSave(p);
  };

  return (
    <div className="a-page">
      <PageHead
        title={value.id ? "E’lonni tahrirlash" : "Yangi e’lon"}
        sub="O‘ngda — saytda qanday ko‘rinishi. Matnda **qalin** yozish mumkin; havolalar va telefon raqamlari avtomatik bosiladigan bo‘ladi."
        actions={
          <>
            <Btn kind="ghost" icon={<ArrowLeft size={15} />} onClick={onCancel}>
              Orqaga
            </Btn>
            <Btn icon={<Eye size={15} />} onClick={() => setFull(true)}>
              To‘liq ko‘rish
            </Btn>
            <Btn kind="primary" busy={busy} onClick={save}>
              Saqlash
            </Btn>
          </>
        }
      />
      <div className="pop-ed">
        <div className="pop-ed-form">
          <Card title="Mazmuni">
            <Field label="Ichki nomi" hint="Faqat admin ro‘yxatida ko‘rinadi">
              <Input value={p.name} onChange={(e) => set({ name: e.target.value })} placeholder="Masalan: Qabul 2026" />
            </Field>
            <div style={{ margin: "14px 0 10px" }}>
              <LangTabs value={lang} onChange={setLang} base={base} filled={filled} />
            </div>
            <div className="a-form-grid">
              <Field label="Belgi (ixtiyoriy)" hint="Sarlavha ustidagi kichik yorliq, masalan «Yangi» yoki «Muhim»">
                <Input value={p.badge[lang] || ""} onChange={(e) => setL("badge", e.target.value)} maxLength={40} placeholder={lang === base ? "Muhim" : p.badge[base] || ""} />
              </Field>
              <Field label="Sarlavha">
                <Input value={p.title[lang] || ""} onChange={(e) => setL("title", e.target.value)} maxLength={160} placeholder={lang === base ? "" : p.title[base] || ""} />
              </Field>
            </div>
            <Field label="Matn" hint="Bo‘sh qator — yangi xatboshi. **so‘z** — qalin." wide>
              <Textarea rows={6} value={p.body[lang] || ""} onChange={(e) => setL("body", e.target.value)} maxLength={3000} placeholder={lang === base ? "" : p.body[base] || ""} />
            </Field>
            {lang !== base && <p className="a-hint">Bu tilda bo‘sh qoldirilgan maydonlar asosiy tildagi matn bilan ko‘rsatiladi.</p>}
          </Card>

          <Card title="Rasm yoki video">
            <div className="pop-seg">
              <button className={media === "image" ? "on" : ""} onClick={() => setMedia("image")}>
                <ImagePlus size={15} /> Rasm
              </button>
              <button className={media === "video" ? "on" : ""} onClick={() => setMedia("video")}>
                <Video size={15} /> Video
              </button>
            </div>
            {media === "image" ? (
              <ImageField value={p.image} onChange={(v) => set({ image: v })} />
            ) : (
              <>
                <Field label="Video havolasi" hint="YouTube yoki Vimeo havolasi, yoki yuklangan MP4/WEBM (80 MB gacha). Ovozsiz avtomatik boshlanadi.">
                  <div style={{ display: "flex", gap: 8 }}>
                    <Input value={p.video} onChange={(e) => set({ video: e.target.value.trim() })} placeholder="https://youtu.be/…" />
                    <Btn icon={<Video size={15} />} onClick={() => setLib(true)}>
                      Yuklash
                    </Btn>
                    {p.video && <Btn kind="ghost" icon={<X size={15} />} title="Olib tashlash" onClick={() => set({ video: "" })} />}
                  </div>
                </Field>
                <div style={{ marginTop: 12 }}>
                  <ImageField value={p.image} onChange={(v) => set({ image: v })} label="Muqova rasmi (video yuklanguncha)" />
                </div>
                <MediaLibrary open={lib} onClose={() => setLib(false)} onPick={(m) => set({ video: m.url })} accept="video" />
              </>
            )}
            {(p.image || p.video) && (
              <>
                <span className="a-label" style={{ display: "block", margin: "16px 0 8px" }}>
                  Joylashuv
                </span>
                <div className="pop-layouts">
                  {LAYOUTS.map((l) => (
                    <button key={l.value} className={`pop-layout ${p.layout === l.value ? "on" : ""}`} onClick={() => set({ layout: l.value })}>
                      <span className={`pop-layout-ic ${l.value}`}>
                        <i />
                        <b />
                      </span>
                      <strong>{l.label}</strong>
                      <small>{l.hint}</small>
                    </button>
                  ))}
                </div>
              </>
            )}
            <span className="a-label" style={{ display: "block", margin: "16px 0 8px" }}>
              Asosiy rang
            </span>
            <div className="pop-accents">
              {ACCENTS.map((c) => (
                <button key={c || "site"} className={`pop-accent ${p.accent === c ? "on" : ""}`} style={{ background: c || "var(--md-fill)" }} onClick={() => set({ accent: c })} title={c || "Sayt rangi"}>
                  {!c && <LayoutTemplate size={13} />}
                </button>
              ))}
              <label className="pop-accent custom" title="Boshqa rang">
                <Palette size={15} />
                <input type="color" value={p.accent || "#0a2e73"} onChange={(e) => set({ accent: e.target.value })} />
              </label>
            </div>
          </Card>

          <Card
            title="Tugmalar"
            sub="3 tagacha. Sayt ichidagi sahifa uchun «/admission» kabi yozing."
            actions={
              p.buttons.length < 3 ? (
                <Btn size="sm" icon={<Plus size={14} />} onClick={() => set({ buttons: [...p.buttons, { label: {}, url: "", style: p.buttons.length ? "ghost" : "primary", new_tab: false }] })}>
                  Tugma qo‘shish
                </Btn>
              ) : null
            }
          >
            {!p.buttons.length && <p className="a-hint">Tugmasiz e’lon ham bo‘ladi — faqat «×» bilan yopiladi.</p>}
            {p.buttons.map((b, i) => {
              const upd = (patch: Partial<typeof b>) => set({ buttons: p.buttons.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
              return (
                <div key={i} className="pop-btn-row">
                  <Input value={b.label[lang] || ""} onChange={(e) => upd({ label: { ...b.label, [lang]: e.target.value } })} placeholder={`Matn (${lang.toUpperCase()})${lang !== base && b.label[base] ? ": " + b.label[base] : ""}`} maxLength={60} />
                  <Input value={b.url} onChange={(e) => upd({ url: e.target.value.trim() })} placeholder="/admission yoki https://…" />
                  <div className="pop-btn-row-tools">
                    <Select value={b.style} onChange={(v) => upd({ style: v })} options={[{ value: "primary", label: "Asosiy (rangli)" }, { value: "ghost", label: "Oddiy (chegarali)" }]} />
                    <Toggle checked={b.new_tab} onChange={(v) => upd({ new_tab: v })} label="Yangi oynada ochilsin" />
                    <Btn size="sm" kind="ghost" icon={<Trash2 size={14} />} title="O‘chirish" onClick={() => set({ buttons: p.buttons.filter((_, j) => j !== i) })} />
                  </div>
                </div>
              );
            })}
          </Card>

          <Card title="Qachon va qayerda">
            <div className="a-form-grid">
              <Field label="Boshlanishi" hint="Bo‘sh — darhol">
                <Input type="datetime-local" value={p.start || ""} onChange={(e) => set({ start: e.target.value || null })} />
              </Field>
              <Field label="Tugashi" hint="Bo‘sh — muddatsiz">
                <Input type="datetime-local" value={p.end || ""} onChange={(e) => set({ end: e.target.value || null })} />
              </Field>
              <Field label="Qanchalik tez-tez">
                <Select value={p.frequency} onChange={(v) => set({ frequency: v })} options={FREQ} />
              </Field>
              <Field label="Kechikish (soniya)" hint="Sahifa ochilgandan keyin necha soniyada chiqadi">
                <Input type="number" min={0} max={60} value={p.delay} onChange={(e) => set({ delay: Math.max(0, Math.min(60, Number(e.target.value) || 0)) })} />
              </Field>
              <Field label="Sahifalar">
                <Select value={p.pages} onChange={(v) => set({ pages: v })} options={PAGES} />
              </Field>
              {p.pages === "list" && (
                <Field label="Sahifa manzillari" hint="Masalan /admission, /news/ (oxirida «/» — bo‘limdagi barcha sahifalar)">
                  <TagInput value={p.paths} onChange={(v) => set({ paths: v.map((x) => (x.startsWith("/") ? x : "/" + x)) })} placeholder="/admission va Enter" />
                </Field>
              )}
            </div>
            <div style={{ marginTop: 14 }}>
              <Toggle checked={p.active} onChange={(v) => set({ active: v })} label="Faol" hint="O‘chirilgan e’lon saytda ko‘rinmaydi, lekin saqlanib qoladi" />
            </div>
          </Card>
        </div>
        <div className="pop-ed-prev">
          <div className="pop-ed-stage" data-no-tr>
            <span className="pop-ed-label">
              <Eye size={13} /> Ko‘rinishi · {lang.toUpperCase()}
            </span>
            <PopupCard popup={preview} onClose={() => undefined} inline />
          </div>
        </div>
      </div>
      <PopupModal popup={full ? preview : null} onClose={() => setFull(false)} />
    </div>
  );
}
