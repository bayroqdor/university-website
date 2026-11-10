// Admin → Talabalar hayoti: klublar, sport (yutuqlar, inshootlar), talabalar turar joyi, stipendiyalar, galereya.
import { Award, Building2, Dumbbell, GraduationCap, Images, Inbox, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { req } from "../../lib/api";
import { Btn, PageHead, Pill, useRun } from "../ui";
import { ItemsPanel, SettingsCard, Tabs, VIS, Visible, useVisible, type FieldDef, type Photo, type Rec } from "./kit";

const CATS = [
  { value: "science", label: "Ilmiy" },
  { value: "sport", label: "Sport" },
  { value: "creative", label: "Ijodiy" },
  { value: "volunteer", label: "Volontyorlik" },
  { value: "other", label: "Boshqa" },
];
const catL = (v: unknown) => CATS.find((c) => c.value === v)?.label || "";
const intro = (hint = "Sahifa sarlavhasi ostidagi qisqa matn (ixtiyoriy)") => [{ key: "intro", label: "Kirish matni", type: "ltext" as const, rows: 3, hint }];

/* ------------------------------------------------------------------ klublar */
const CLUB_FIELDS: FieldDef[] = [
  { key: "title", label: "Nomi", type: "text", wide: true, i18n: true },
  { key: "category", label: "Yo‘nalishi", type: "select", options: CATS },
  { key: "status", label: "Ko‘rinishi", type: "select", options: VIS },
  { key: "summary", label: "Qisqacha", type: "textarea", wide: true, i18n: true, hint: "Kartada va sahifa boshida ko‘rinadi" },
  { key: "content", label: "Batafsil tavsif", type: "rich", i18n: true },
  { key: "leader_staff_id", label: "Rahbar (xodimlar ro‘yxatidan)", type: "staff" },
  { key: "leader", label: "Yoki rahbar ismi (talaba, tashqi mutaxassis)", type: "text", i18n: true },
  { key: "schedule", label: "Mashg‘ulot vaqti", type: "text", placeholder: "Seshanba, 15:00", i18n: true },
  { key: "place", label: "Joyi", type: "text", placeholder: "204-xona", i18n: true },
  { key: "contact", label: "Aloqa (telefon yoki email)", type: "text" },
  { key: "telegram", label: "Telegram havola", type: "url", placeholder: "https://t.me/…" },
  { key: "join_url", label: "«Qo‘shilish» — tashqi havola", type: "url", hint: "Masalan, Google Forms yoki Telegram guruh. Kiritilsa, forma o‘rniga shu havola ochiladi", wide: true },
  { key: "join_form", label: "", type: "toggle", hint: "Saytda qo‘shilish formasi (arizalar «Murojaatlar» → «Klublar» bo‘limiga tushadi)", show: (x) => !x.join_url },
  { key: "news_tag", label: "Yangiliklar tegi", type: "text", hint: "Shu tegdagi yangiliklar klub sahifasida chiqadi" },
  { key: "photos", label: "Suratlar (muqovani ★ bilan belgilang)", type: "photos", cover: true },
];

export function ClubsAdmin() {
  const [tab, setTab] = useState<"list" | "page">("list");
  const [vis, reload] = useVisible();
  return (
    <div className="a-page">
      <PageHead
        title="To‘garaklar va klublar"
        sub="Ilmiy, sport, ijodiy va volontyorlik klublari. Sport seksiyalari ham shu yerda («Sport» yo‘nalishi) — ular «Sport» sahifasida ham chiqadi."
        actions={<Visible on={vis?.clubs} to="/clubs" />}
      />
      <Tabs value={tab} onChange={setTab} items={[["list", "Klublar"], ["page", "Sahifa matni"]]} />
      {tab === "list" ? (
        <ItemsPanel
          kind="club"
          title="klub"
          fields={CLUB_FIELDS}
          defaults={{ category: "science", status: "draft", photos: [] }}
          icon={<Users size={28} />}
          empty="Hali klub qo‘shilmagan"
          newLabel="Yangi klub"
          onSaved={reload}
          viewUrl={(x) => `/clubs/${x.slug}`}
          row={(x) => (
            <>
              <b>{String(x.title)}</b>
              <small>
                <Pill tone="info">{catL(x.category)}</Pill>
                {x.schedule ? ` ${x.schedule}` : ""}
                {x.join_url ? " · tashqi havola" : x.join_form ? " · qo‘shilish formasi" : ""}
              </small>
            </>
          )}
        />
      ) : (
        <SettingsCard group="life" section="clubs" title="«To‘garaklar va klublar» sahifasi" fields={intro()} />
      )}
      <p className="a-hint cxa-foot">
        <Inbox size={14} /> Qo‘shilish arizalari: <a href="/admin/desk">Murojaatlar</a> → «Klublar» bo‘limi.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ sport */
export function SportAdmin() {
  const [tab, setTab] = useState<"ach" | "fac" | "page">("ach");
  const [vis, reload] = useVisible();
  return (
    <div className="a-page">
      <PageHead
        title="Sport"
        sub="Yutuqlar va sport inshootlari. Sport seksiyalari — «To‘garaklar va klublar» bo‘limida «Sport» yo‘nalishi bilan."
        actions={<Visible on={vis?.sport} to="/sport" />}
      />
      <Tabs value={tab} onChange={setTab} items={[["ach", "Yutuqlar"], ["fac", "Inshootlar"], ["page", "Sahifa matni"]]} />
      {tab === "ach" && (
        <ItemsPanel
          kind="achievement"
          title="yutuq"
          defaults={{ category: "sport", status: "draft", year: new Date().getFullYear() }}
          icon={<Award size={28} />}
          empty="Hali yutuq qo‘shilmagan"
          onSaved={reload}
          sort={(a, b) => Number(b.year || 0) - Number(a.year || 0)}
          fields={[
            { key: "title", label: "Musobaqa", type: "text", wide: true, i18n: true },
            { key: "year", label: "Yil", type: "number" },
            { key: "status", label: "Ko‘rinishi", type: "select", options: VIS },
            { key: "result", label: "Natija", type: "text", placeholder: "1-o‘rin", i18n: true },
            { key: "athlete", label: "Sportchi yoki jamoa", type: "text", i18n: true },
            { key: "category", label: "Turi", type: "select", options: [{ value: "sport", label: "Sport" }, { value: "science", label: "Ilmiy" }, { value: "creative", label: "Ijodiy" }, { value: "other", label: "Boshqa" }] },
            { key: "url", label: "Havola (masalan, yangilik)", type: "url", placeholder: "/news/…" },
            { key: "photo", label: "Surat", type: "image", altKey: "photo_alt" },
          ]}
          row={(x) => (
            <>
              <b>
                {x.year ? `${x.year} · ` : ""}
                {String(x.title)}
              </b>
              <small>{[x.result, x.athlete].filter(Boolean).join(" · ")}</small>
            </>
          )}
        />
      )}
      {tab === "fac" && (
        <ItemsPanel
          kind="facility"
          title="inshoot"
          defaults={{ category: "sport", status: "draft" }}
          icon={<Dumbbell size={28} />}
          empty="Hali inshoot qo‘shilmagan"
          onSaved={reload}
          fields={[
            { key: "title", label: "Nomi", type: "text", wide: true, i18n: true },
            { key: "category", label: "Turi", type: "select", options: [{ value: "sport", label: "Sport" }, { value: "study", label: "O‘quv" }, { value: "living", label: "Turar joy" }, { value: "other", label: "Boshqa" }] },
            { key: "status", label: "Ko‘rinishi", type: "select", options: VIS },
            { key: "summary", label: "Tavsif", type: "textarea", wide: true, i18n: true },
            { key: "place", label: "Joyi", type: "text", i18n: true },
            { key: "hours", label: "Ish vaqti", type: "text", i18n: true },
            { key: "photo", label: "Surat", type: "image", altKey: "photo_alt" },
          ]}
          row={(x) => (
            <>
              <b>{String(x.title)}</b>
              <small>{[x.place, x.hours].filter(Boolean).join(" · ")}</small>
            </>
          )}
        />
      )}
      {tab === "page" && <SettingsCard group="life" section="sport" title="«Sport» sahifasi" fields={intro()} />}
    </div>
  );
}

/* ------------------------------------------------------------------ yotoqxona */
export function DormAdmin() {
  const [tab, setTab] = useState<"page" | "list">("page");
  const [vis, reload] = useVisible();
  return (
    <div className="a-page">
      <PageHead
        title="Talabalar turar joyi"
        sub="Yotoqxona sahifasi: kirish matni, binolar, yashash qoidalari, joylashish bosqichlari, ariza formasi va savol-javob."
        actions={<Visible on={vis?.dormitory} to="/dormitory" />}
      />
      <Tabs value={tab} onChange={setTab} items={[["page", "Sahifa va ariza"], ["list", "Binolar"]]} />
      {tab === "page" ? (
        <SettingsCard
          group="life"
          section="dormitory"
          title="«Talabalar turar joyi» sahifasi"
          onSaved={reload}
          fields={[
            { key: "apply_open", label: "«Ariza berish» formasi ochiq", type: "bool", hint: "Arizalar «Murojaatlar» → «Yotoqxona» bo‘limiga tushadi" },
            { key: "intro", label: "Kirish matni", type: "ltext", rows: 3 },
            { key: "photo", label: "Sarlavha surati", type: "image" },
            { key: "photo_alt", label: "Surat alt matni", type: "ltext" },
            { key: "rules", label: "Yashash qoidalari", type: "lhtml" },
            { key: "steps", label: "Qanday joylashish mumkin (bosqichlar)", type: "lpairs", pair: ["title", "text", "Bosqich nomi", "Izoh"] },
            { key: "faq", label: "Savol-javob", type: "lpairs", pair: ["q", "a", "Savol", "Javob"] },
            { key: "contact_ids", label: "Mas’ul xodimlar", type: "ids", max: 6 },
          ]}
        />
      ) : (
        <ItemsPanel
          kind="dorm"
          title="bino"
          defaults={{ status: "draft", price_period: "month", photos: [] }}
          icon={<Building2 size={28} />}
          empty="Hali bino qo‘shilmagan"
          onSaved={reload}
          fields={[
            { key: "title", label: "Nomi", type: "text", wide: true, i18n: true },
            { key: "status", label: "Ko‘rinishi", type: "select", options: VIS },
            { key: "capacity", label: "Sig‘imi (o‘rin)", type: "number" },
            { key: "summary", label: "Qisqacha", type: "textarea", wide: true, i18n: true },
            { key: "address", label: "Manzil", type: "text", wide: true, i18n: true },
            { key: "map_url", label: "Xarita havolasi", type: "url", placeholder: "https://yandex.uz/maps/…" },
            { key: "phone", label: "Telefon", type: "text" },
            { key: "rooms", label: "Xona turlari", type: "tags", i18n: true, placeholder: "2 kishilik — Enter" },
            { key: "amenities", label: "Qulayliklar", type: "tags", i18n: true, placeholder: "Oshxona — Enter" },
            { key: "price", label: "Narxi (aniq ma’lum bo‘lsa)", type: "text", i18n: true, placeholder: "300 000 so‘m" },
            { key: "price_period", label: "Narx davri", type: "select", options: [{ value: "month", label: "oyiga" }, { value: "semester", label: "semestriga" }, { value: "year", label: "yiliga" }] },
            { key: "photos", label: "Suratlar", type: "photos" },
          ]}
          row={(x) => (
            <>
              <b>{String(x.title)}</b>
              <small>
                {x.capacity ? `${x.capacity} o‘rin · ` : ""}
                {((x.photos as Photo[]) || []).length} ta surat
              </small>
            </>
          )}
        />
      )}
      <p className="a-hint cxa-foot">
        <Inbox size={14} /> Arizalar: <a href="/admin/desk">Murojaatlar</a> → «Yotoqxona» bo‘limi.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ stipendiyalar */
const TAGS: [string, string][] = [
  ["course1", "1-kurs"], ["course2", "2-kurs"], ["course3", "3-kurs"], ["course4", "4-kurs"], ["master", "Magistratura"], ["phd", "Doktorantura"],
  ["excellence", "A’lo o‘qish"], ["sport", "Sport yutuqlari"], ["creative", "Ijodiy yutuqlar"], ["research", "Ilmiy faoliyat"], ["social", "Ijtimoiy yordam"],
];

export function ScholarshipsAdmin() {
  const [tab, setTab] = useState<"list" | "page">("list");
  const [vis, reload] = useVisible();
  return (
    <div className="a-page">
      <PageHead
        title="Stipendiyalar va imtiyozlar"
        sub="Davlat va nomli stipendiyalar, imtiyozlar: miqdori, kimlar olishi mumkin, mezonlar, hujjatlar va muddat. Saytdagi tezkor filtr kamida 3 ta stipendiya va 2 xil «Kim uchun» belgisi bo‘lsa chiqadi."
        actions={<Visible on={vis?.scholarships} to="/scholarships" />}
      />
      <Tabs value={tab} onChange={setTab} items={[["list", "Stipendiyalar"], ["page", "Sahifa matni"]]} />
      {tab === "list" ? (
        <ItemsPanel
          kind="scholarship"
          title="stipendiya"
          defaults={{ status: "draft", tags: [] }}
          icon={<GraduationCap size={28} />}
          empty="Hali stipendiya qo‘shilmagan"
          onSaved={reload}
          fields={[
            { key: "title", label: "Nomi", type: "text", wide: true, i18n: true },
            { key: "amount", label: "Miqdori", type: "text", i18n: true, placeholder: "oyiga … so‘m / BHM" },
            { key: "status", label: "Ko‘rinishi", type: "select", options: VIS },
            { key: "summary", label: "Qisqacha", type: "textarea", wide: true, i18n: true },
            { key: "eligibility", label: "Kimlar olishi mumkin", type: "textarea", wide: true, i18n: true },
            { key: "criteria", label: "Mezonlar", type: "tags", i18n: true, wide: true },
            { key: "period", label: "Ariza muddati", type: "text", i18n: true },
            { key: "url", label: "Havola (nizom, yangilik)", type: "url" },
            { key: "documents", label: "Hujjatlar", type: "tags", i18n: true, wide: true },
            {
              key: "tags",
              label: "Kim uchun (saytdagi filtr)",
              type: "custom",
              render: ({ value, set }) => {
                const v = (value as string[]) || [];
                return (
                  <div className="cxa-checks">
                    {TAGS.map(([k, l]) => (
                      <label key={k}>
                        <input type="checkbox" checked={v.includes(k)} onChange={(e) => set(e.target.checked ? [...v, k] : v.filter((x) => x !== k))} /> {l}
                      </label>
                    ))}
                  </div>
                );
              },
            },
          ]}
          row={(x) => (
            <>
              <b>{String(x.title)}</b>
              <small>{String(x.amount || "miqdori kiritilmagan")}</small>
            </>
          )}
        />
      ) : (
        <SettingsCard group="life" section="scholarships" title="«Stipendiyalar» sahifasi" fields={intro()} />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ galereya */
async function newsPhotos(newsId: string): Promise<Photo[]> {
  const n = await req<Rec>("GET", `/api/admin/items/news/${newsId}`);
  const urls = [String(n.feature_image || ""), ...((n.gallery as string[]) || []), ...Array.from(String(n.html || "").matchAll(/<img[^>]+src="([^"]+)"/g), (m) => m[1])];
  return [...new Set(urls.filter((u) => /^(\/|https:)/.test(u)))].map((url) => ({ url, alt: "", caption: "" }));
}

function NewsPick({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [list, setList] = useState<Rec[] | null>(null);
  useEffect(() => {
    req<{ items: Rec[] }>("GET", "/api/admin/items/news").then((r) => setList(r.items)).catch(() => setList([]));
  }, []);
  return (
    <select className="a-input" value={value || ""} onChange={(e) => onChange(e.target.value)}>
      <option value="">— bog‘lanmagan —</option>
      {(list || []).map((n) => (
        <option key={n.id as string} value={n.id as string}>
          {String(n.title).slice(0, 90)}
        </option>
      ))}
    </select>
  );
}

export function GalleryAdmin() {
  const [tab, setTab] = useState<"list" | "page">("list");
  const [vis, reload] = useVisible();
  const run = useRun();
  return (
    <div className="a-page">
      <PageHead
        title="Galereya"
        sub="Albomlar: sana, tavsif, suratlar (har biriga alt matn — majburiy), YouTube videolar. Suratlarni sudrab tartiblang, ★ — muqova."
        actions={<Visible on={vis?.gallery} to="/gallery" />}
      />
      <Tabs value={tab} onChange={setTab} items={[["list", "Albomlar"], ["page", "Sahifa matni"]]} />
      {tab === "list" ? (
        <ItemsPanel
          kind="album"
          title="albom"
          defaults={{ status: "draft", photos: [], videos: [], date: new Date().toISOString() }}
          icon={<Images size={28} />}
          empty="Hali albom yo‘q"
          newLabel="Yangi albom"
          onSaved={reload}
          viewUrl={(x) => `/gallery/${x.slug}`}
          sort={(a, b) => String(b.date || "").localeCompare(String(a.date || ""))}
          fields={[
            { key: "title", label: "Nomi", type: "text", wide: true, i18n: true },
            { key: "date", label: "Sana", type: "date" },
            { key: "status", label: "Ko‘rinishi", type: "select", options: VIS },
            { key: "summary", label: "Tavsif", type: "textarea", wide: true, i18n: true },
            {
              key: "news_id",
              label: "Bog‘langan yangilik",
              type: "custom",
              render: ({ value, set, item, setItem }) => (
                <div className="cxa-row">
                  <NewsPick value={(value as string) || ""} onChange={set} />
                  <Btn
                    size="sm"
                    disabled={!value}
                    onClick={async () => {
                      const ph = await run(() => newsPhotos(String(value)));
                      if (!ph) return;
                      const have = new Set(((item.photos as Photo[]) || []).map((p) => p.url));
                      setItem((r) => ({ ...r, photos: [...((r.photos as Photo[]) || []), ...ph.filter((p) => !have.has(p.url))] }));
                    }}
                  >
                    Yangilikdagi suratlarni qo‘shish
                  </Btn>
                </div>
              ),
            },
            { key: "videos", label: "YouTube videolar", type: "tags", wide: true, placeholder: "https://www.youtube.com/watch?v=… — Enter", hint: "Faqat YouTube havolalari saqlanadi" },
            { key: "photos", label: "Suratlar", type: "photos", cover: true },
          ]}
          row={(x) => (
            <>
              <b>{String(x.title)}</b>
              <small>
                {x.date ? new Date(String(x.date)).toLocaleDateString("ru-RU") : ""} · {((x.photos as Photo[]) || []).length} ta surat
                {((x.photos as Photo[]) || []).some((p) => !p.alt) && <Pill tone="warn">alt matnsiz suratlar bor</Pill>}
              </small>
            </>
          )}
        />
      ) : (
        <SettingsCard group="gallery" section="gallery" title="«Galereya» sahifasi" fields={intro()} />
      )}
    </div>
  );
}
