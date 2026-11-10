import type { JSONContent } from "@tiptap/core";
import {
  ArrowDown,
  ArrowUp,
  Copy,
  Eye,
  EyeOff,
  Languages,
  Plus,
  Save,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { RichEditor } from "../../editor/RichEditor";
import type { Lang, Section, SiteSettings, Uni } from "../../lib/api";
import { admin } from "../api";
import {
  Btn,
  Card,
  Field,
  ImageField,
  Input,
  LANG_LABEL,
  LangTabs,
  PageHead,
  Select,
  Spinner,
  TagInput,
  Textarea,
  Toggle,
  resetBaseLang,
  useBaseLang,
  useRun,
} from "../ui";

// tarjima qilinadigan maydonlar (qolganlari — logotip, email, telefon, havolalar — barcha tillar uchun umumiy)
const UNI_TR: Partial<Uni> = {
  name: "",
  short_name: "",
  tagline: "",
  short_about: "",
  mission: "",
  values: [],
  address: "",
  hours: "",
  rector_name: "",
  rector_title: "",
  rector_speech: null,
  rector_speech_html: "",
  stats: [],
  keywords: [],
  license: "",
  founder: "",
};
const SITE_TR = {
  title: "",
  description: "",
  footer_text: "",
  newsletter_footer: "",
  admission_text: "",
  portal_text: "",
};
const HERO_EMPTY = {
  eyebrow: "",
  heading: "",
  subheading: "",
  cta_primary: "",
  cta_primary_url: "",
  cta_secondary: "",
  cta_secondary_url: "",
};

function TrBar({
  base,
  value,
  onChange,
  filled,
  onCopy,
}: {
  base: Lang;
  value: Lang;
  onChange: (l: Lang) => void;
  filled: (l: Lang) => boolean;
  onCopy: () => void;
}) {
  const tr = value !== base;
  return (
    <div className="tr-bar">
      <LangTabs value={value} base={base} onChange={onChange} filled={filled} />
      {tr && (
        <div className="tr-hint">
          <Languages size={16} />
          <span>
            <b>{LANG_LABEL[value]}</b> tarjimasi. Bo‘sh maydonlar saytda asosiy
            tilda ({LANG_LABEL[base]}) ko‘rsatiladi; logotip, email, telefon va
            havolalar umumiy.
          </span>
          <Btn size="sm" icon={<Copy size={14} />} onClick={onCopy}>
            Asl matndan nusxa olish
          </Btn>
        </div>
      )}
    </div>
  );
}

const SOCIAL_LABELS: Record<string, string> = {
  telegram: "Telegram",
  facebook: "Facebook",
  instagram: "Instagram",
  youtube: "YouTube",
  linkedin: "LinkedIn",
  x: "X (Twitter)",
  website: "Boshqa veb-sayt",
};

/* ------------------------------------------------------------------ institut */
export function UniPage() {
  const run = useRun();
  const [p, setP] = useState<Uni | null>(null);
  const [busy, setBusy] = useState(false);
  const baseLang = useBaseLang();
  const [editLang, setEditLang] = useState<Lang | null>(null);
  const [edKey, setEdKey] = useState(0);
  useEffect(() => {
    admin.uni().then(setP);
  }, []);
  const tr: Lang | null =
    baseLang && editLang && editLang !== baseLang ? editLang : null;
  if (!p || !baseLang) return <Spinner />;
  const trd = ((tr && p.i18n?.[tr]) || {}) as Partial<Uni>;
  const v: Uni = tr ? ({ ...p, ...UNI_TR, ...trd } as Uni) : p;
  const set = (patch: Partial<Uni>) =>
    setP((cur) => {
      if (!cur) return cur;
      if (!tr) return { ...cur, ...patch };
      const i18n = { ...(cur.i18n || {}) };
      i18n[tr] = { ...(i18n[tr] || {}), ...patch };
      return { ...cur, i18n };
    });
  const ph = (k: keyof Uni) => (tr ? String(p[k] ?? "") : undefined);
  const switchLang = (l: Lang) => {
    setEditLang(l);
    setEdKey((k) => k + 1);
  };
  const copyFromBase = () => {
    set(
      Object.fromEntries(
        Object.keys(UNI_TR).map((k) => [k, p[k as keyof Uni]]),
      ) as Partial<Uni>,
    );
    setEdKey((k) => k + 1);
  };
  const save = async () => {
    setBusy(true);
    const r = await run(() => admin.saveUni(p), "Saqlandi");
    if (r) setP(r);
    setBusy(false);
  };
  return (
    <div className="a-page narrow">
      <PageHead
        title="Institut"
        sub="Nomi, rekvizitlar, rektor murojaati, raqamlar va ijtimoiy tarmoqlar — bosh sahifa, pastki qism va SEO uchun"
        actions={
          <Btn
            kind="primary"
            icon={<Save size={16} />}
            busy={busy}
            onClick={save}
          >
            Saqlash
          </Btn>
        }
      />
      <TrBar
        base={baseLang}
        value={editLang || baseLang}
        onChange={switchLang}
        onCopy={copyFromBase}
        filled={(l) =>
          l === baseLang
            ? true
            : !!p.i18n?.[l] && Object.keys(p.i18n[l]!).length > 0
        }
      />
      <Card title="Asosiy ma’lumotlar">
        <div className={`profile-top ${tr ? "no-photo" : ""}`}>
          {!tr && (
            <ImageField
              label="Logotip (PNG, shaffof fon)"
              value={v.logo}
              onChange={(x) => set({ logo: x })}
              aspect="1 / 1"
            />
          )}
          <div className="a-form-grid">
            <Field label="To‘liq nomi" wide>
              <Input
                value={v.name}
                placeholder={ph("name")}
                onChange={(e) => set({ name: e.target.value })}
              />
            </Field>
            <Field label="Qisqa nomi">
              <Input
                value={v.short_name}
                placeholder={ph("short_name")}
                onChange={(e) => set({ short_name: e.target.value })}
              />
            </Field>
            {!tr && (
              <Field label="Qisqartma" hint="logotip harflari, masalan UNI">
                <Input
                  value={v.abbr}
                  maxLength={12}
                  onChange={(e) => set({ abbr: e.target.value })}
                />
              </Field>
            )}
            <Field label="Shior (bosh ekranda)" wide>
              <Textarea
                rows={2}
                value={v.tagline}
                placeholder={ph("tagline")}
                onChange={(e) => set({ tagline: e.target.value })}
              />
            </Field>
            {!tr && (
              <>
                <Field label="Tashkil etilgan yil">
                  <Input
                    value={v.founded}
                    onChange={(e) => set({ founded: e.target.value })}
                  />
                </Field>
                <Field
                  label="Qabul portali (havola)"
                  hint="«Hujjat topshirish» tugmasi"
                >
                  <Input
                    value={v.admission_url}
                    placeholder="https://qabul…"
                    onChange={(e) => set({ admission_url: e.target.value })}
                  />
                </Field>
                <Field label="HEMIS havolasi" hint="ixtiyoriy">
                  <Input
                    value={v.hemis_url}
                    placeholder="https://"
                    onChange={(e) => set({ hemis_url: e.target.value })}
                  />
                </Field>
                <Field label="Masofaviy ta’lim (Moodle) havolasi" hint="ixtiyoriy">
                  <Input
                    value={v.moodle_url || ""}
                    placeholder="https://"
                    onChange={(e) => set({ moodle_url: e.target.value })}
                  />
                </Field>
                <Field label="Korporativ pochta havolasi" hint="ixtiyoriy">
                  <Input
                    value={v.mail_url || ""}
                    placeholder="https://"
                    onChange={(e) => set({ mail_url: e.target.value })}
                  />
                </Field>
                <Field label="Korrupsiyaga qarshi kurashish sahifasi" hint="ixtiyoriy">
                  <Input
                    value={v.anticorruption_url || ""}
                    placeholder="https://"
                    onChange={(e) => set({ anticorruption_url: e.target.value })}
                  />
                </Field>
                <Field label="Elektron kutubxona havolasi" hint="ixtiyoriy">
                  <Input
                    value={v.library_url || ""}
                    placeholder="https://"
                    onChange={(e) => set({ library_url: e.target.value })}
                  />
                </Field>
                <Field label="Xarita havolasi" hint="Google/Yandex Maps">
                  <Input
                    value={v.map_url}
                    placeholder="https://"
                    onChange={(e) => set({ map_url: e.target.value })}
                  />
                </Field>
              </>
            )}
            <Field label="Asoschi">
              <Input
                value={v.founder}
                placeholder={ph("founder")}
                onChange={(e) => set({ founder: e.target.value })}
              />
            </Field>
            <Field label="Tashkil etish asosi (qaror, litsenziya)" wide>
              <Input
                value={v.license}
                placeholder={ph("license")}
                onChange={(e) => set({ license: e.target.value })}
              />
            </Field>
          </div>
        </div>
      </Card>
      <Card
        title="Institut haqida (qisqa)"
        sub="Bosh sahifada aylantirish bilan so‘zma-so‘z paydo bo‘ladi; «Institut haqida» sahifasida ham"
      >
        <Textarea
          rows={5}
          value={v.short_about}
          placeholder={ph("short_about")}
          onChange={(e) => set({ short_about: e.target.value })}
        />
        <Field label="Missiya">
          <Textarea
            rows={3}
            value={v.mission}
            placeholder={ph("mission")}
            onChange={(e) => set({ mission: e.target.value })}
          />
        </Field>
        <Field label="Afzalliklar (bosh sahifadagi belgilar)">
          <TagInput
            value={v.values || []}
            onChange={(x) => set({ values: x })}
          />
        </Field>
        <Field label="Kalit so‘zlar (yuguruvchi qator)">
          <TagInput
            value={v.keywords || []}
            onChange={(x) => set({ keywords: x })}
          />
        </Field>
      </Card>
      <Card
        title="Rektor murojaati"
        sub="Bosh sahifadagi «Rektor murojaati» bo‘limi (bo‘sh qolsa — bo‘lim chiqmaydi)"
      >
        <div className={`profile-top ${tr ? "no-photo" : ""}`}>
          {!tr && (
            <ImageField
              label="Rektor surati"
              value={v.rector_photo}
              onChange={(x) => set({ rector_photo: x })}
              aspect="4 / 5"
            />
          )}
          <div className="a-form-grid">
            <Field label="Ism familiya" wide>
              <Input
                value={v.rector_name}
                placeholder={ph("rector_name")}
                onChange={(e) => set({ rector_name: e.target.value })}
              />
            </Field>
            <Field label="Lavozim" wide>
              <Input
                value={v.rector_title}
                placeholder={ph("rector_title")}
                onChange={(e) => set({ rector_title: e.target.value })}
              />
            </Field>
          </div>
        </div>
        <div className="mini-editor">
          <RichEditor
            key={`${tr || "base"}-${edKey}`}
            value={(v.rector_speech as JSONContent) || null}
            onChange={(o) =>
              set({ rector_speech: o.json, rector_speech_html: o.html })
            }
            placeholder={
              tr
                ? `${LANG_LABEL[tr]} tilidagi murojaat…`
                : "Hurmatli talabalar, ota-onalar va hamkorlar…"
            }
          />
        </div>
      </Card>
      <Card
        title="Raqamlar"
        sub="Bosh sahifadagi hisoblagichlar (talabalar, professorlar, yo‘nalishlar…)"
      >
        <p className="a-hint">
          Faqat tasdiqlangan rasmiy raqamlarni yozing. Qiymat bo‘sh qolsa, saytda «[RAQAM]» ko‘rinadi — taxminiy yoki o‘ylab topilgan raqam yozmang.
        </p>
        {(v.stats || []).map((s, i) => (
          <div key={i} className="pair-row three">
            <Input
              value={s.value}
              placeholder="raqam"
              onChange={(e) =>
                set({
                  stats: v.stats.map((x, j) =>
                    j === i ? { ...x, value: e.target.value } : x,
                  ),
                })
              }
            />
            <Input
              value={s.suffix}
              placeholder="+"
              onChange={(e) =>
                set({
                  stats: v.stats.map((x, j) =>
                    j === i ? { ...x, suffix: e.target.value } : x,
                  ),
                })
              }
              style={{ maxWidth: 70 }}
            />
            <Input
              value={s.label}
              placeholder="talaba"
              onChange={(e) =>
                set({
                  stats: v.stats.map((x, j) =>
                    j === i ? { ...x, label: e.target.value } : x,
                  ),
                })
              }
            />
            <button
              className="a-icon"
              onClick={() => set({ stats: v.stats.filter((_, j) => j !== i) })}
              aria-label="O‘chirish"
            >
              <X size={14} />
            </button>
          </div>
        ))}
        <Btn
          size="sm"
          icon={<Plus size={14} />}
          onClick={() =>
            set({
              stats: [...(v.stats || []), { value: "", suffix: "", label: "" }],
            })
          }
        >
          Qo‘shish
        </Btn>
      </Card>
      <Card title="Aloqa">
        <div className="a-form-grid">
          <Field label="Manzil" wide>
            <Input
              value={v.address}
              placeholder={ph("address")}
              onChange={(e) => set({ address: e.target.value })}
            />
          </Field>
          <Field label="Ish vaqti" wide>
            <Input
              value={v.hours}
              placeholder={ph("hours")}
              onChange={(e) => set({ hours: e.target.value })}
            />
          </Field>
          {!tr && (
            <>
              <Field label="Telefonlar" wide>
                <TagInput
                  value={v.phones || []}
                  onChange={(x) => set({ phones: x })}
                  placeholder="+998 … va Enter"
                />
              </Field>
              <Field label="Email" wide>
                <Input
                  value={v.email}
                  onChange={(e) => set({ email: e.target.value })}
                />
              </Field>
            </>
          )}
        </div>
      </Card>
      {!tr && (
        <Card
          title="Ijtimoiy tarmoqlar"
          sub="To‘liq havolani kiriting (https://…)"
        >
          <div className="a-form-grid">
            {Object.keys(SOCIAL_LABELS).map((k) => (
              <Field key={k} label={SOCIAL_LABELS[k]}>
                <Input
                  value={v.socials[k] || ""}
                  placeholder="https://"
                  onChange={(e) =>
                    set({ socials: { ...p.socials, [k]: e.target.value } })
                  }
                />
              </Field>
            ))}
          </div>
        </Card>
      )}
      <div className="sticky-save">
        <Btn
          kind="primary"
          icon={<Save size={16} />}
          busy={busy}
          onClick={save}
        >
          Saqlash
        </Btn>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ sayt sozlamalari */
type HomeImageKey = keyof NonNullable<SiteSettings["home_images"]>;
const HOME_IMAGES: [HomeImageKey, string][] = [
  ["green", "Yashil institut"],
  ["auditorium", "Auditoriyalar"],
  ["library", "Kutubxona"],
  ["dormitory", "Yotoqxona"],
  ["student_life", "Talabalar hayoti"],
];
const SECTION_NAMES: Record<Section["id"], string> = {
  hero: "Bosh ekran (sarlavha, video havolasi, tezkor havolalar)",
  stats: "Raqamlar",
  programs: "Ta’lim yo‘nalishlari",
  about: "Institut haqida (qisqa) + missiya",
  news: "So‘nggi yangiliklar",
  announcements: "E’lonlar",
  faculties: "Kafedralar",
  rector: "Rektor murojaati",
  staff: "Professor-o‘qituvchilar (fotosuratlar bilan)",
  events: "Yaqin tadbirlar",
  partners: "Hamkor tashkilotlar + yuguruvchi qator",
  links: "Foydali havolalar",
  admission: "Qabul va kabinet bandi",
  contact: "«Biz bilan bog‘laning» chaqiruvi",
};

export function SitePage({ mode = "general" }: { mode?: "general" | "home" }) {
  const H = mode === "home";
  const run = useRun();
  const [s, setS] = useState<SiteSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [editLang, setEditLang] = useState<Lang | null>(null);
  useEffect(() => {
    admin.site().then(setS);
  }, []);
  if (!s) return <Spinner />;
  const baseLang = s.lang || "uz";
  const tr: Lang | null = editLang && editLang !== baseLang ? editLang : null;
  const trd = ((tr && s.i18n?.[tr]) || {}) as Partial<SiteSettings>;
  const v: SiteSettings = tr
    ? { ...s, ...SITE_TR, ...trd, hero: { ...HERO_EMPTY, ...(trd.hero || {}) } }
    : s;
  const set = (patch: Partial<SiteSettings>) =>
    setS((cur) => {
      if (!cur) return cur;
      if (!tr) return { ...cur, ...patch };
      const i18n = { ...(cur.i18n || {}) };
      i18n[tr] = { ...(i18n[tr] || {}), ...patch };
      return { ...cur, i18n };
    });
  // bosh ekran suratlari — barcha tillar uchun umumiy; birinchisi «Bosh rasm» (home_images.hero) bilan bir xil saqlanadi
  const heroList = [s.home_images?.hero || "", ...(s.hero_images || [])].filter(
    (u, i, a) => u && a.indexOf(u) === i,
  );
  const setHero = (list: string[]) =>
    setS(
      (cur) =>
        cur && {
          ...cur,
          hero_images: list,
          home_images: { ...(cur.home_images || {}), hero: list[0] || "" },
        },
    );
  const heroMove = (list: string[], i: number, j: number) => {
    const a = [...list];
    [a[i], a[j]] = [a[j], a[i]];
    return a;
  };
  const ph = (
    k:
      | "title"
      | "description"
      | "footer_text"
      | "newsletter_footer"
      | "admission_text"
      | "portal_text",
  ) => (tr ? s[k] || undefined : undefined);
  const hph = (k: keyof SiteSettings["hero"]) =>
    tr ? s.hero[k] || undefined : undefined;
  const copyFromBase = () =>
    set({
      title: s.title,
      description: s.description,
      footer_text: s.footer_text,
      newsletter_footer: s.newsletter_footer,
      admission_text: s.admission_text,
      portal_text: s.portal_text,
      hero: { ...s.hero },
    });
  const save = async () => {
    setBusy(true);
    const r = await run(() => admin.saveSite(s), "Sozlamalar saqlandi");
    if (r) {
      setS(r);
      resetBaseLang();
    }
    setBusy(false);
  };
  const move = (i: number, d: -1 | 1) => {
    const a = [...s.sections];
    const j = i + d;
    if (j < 0 || j >= a.length) return;
    [a[i], a[j]] = [a[j], a[i]];
    set({ sections: a });
  };
  const heroFields: [keyof SiteSettings["hero"], string, boolean][] = [
    ["eyebrow", "Yuqori yozuv (yashil nuqtali)", false],
    ["heading", "Katta sarlavha", false],
    ["subheading", "Sarlavha ostidagi matn", true],
    ["cta_primary", "Asosiy tugma matni", false],
    ["cta_secondary", "Video tugmasi matni", false],
  ];
  return (
    <div className="a-page narrow">
      <PageHead
        title={H ? "Bosh sahifa" : "Sayt sozlamalari"}
        sub={
          H
            ? "Bosh sahifadagi bloklar tartibi va ko‘rinishi, bosh ekran matnlari va fon rasmlari"
            : "Nomi, ranglar, til, kabinet, effektlar va bildirishnomalar"
        }
        actions={
          <Btn
            kind="primary"
            icon={<Save size={16} />}
            busy={busy}
            onClick={save}
          >
            Saqlash
          </Btn>
        }
      />
      <TrBar
        base={baseLang}
        value={editLang || baseLang}
        onChange={setEditLang}
        onCopy={copyFromBase}
        filled={(l) =>
          l === baseLang
            ? true
            : !!s.i18n?.[l] && Object.keys(s.i18n[l]!).length > 0
        }
      />
      {tr ? (
        <>
          {!H && (
            <>
              <Card title="Umumiy">
                <div className="a-form-grid">
                  <Field label="Sayt nomi">
                    <Input
                      value={v.title}
                      placeholder={ph("title")}
                      onChange={(e) => set({ title: e.target.value })}
                    />
                  </Field>
                  <Field label="Pastki qism matni">
                    <Input
                      value={v.footer_text}
                      placeholder={ph("footer_text")}
                      onChange={(e) => set({ footer_text: e.target.value })}
                    />
                  </Field>
                  <Field label="Tavsif (SEO)" wide>
                    <Textarea
                      rows={2}
                      value={v.description}
                      placeholder={ph("description")}
                      onChange={(e) => set({ description: e.target.value })}
                    />
                  </Field>
                  <Field label="Qabul bandi matni" wide>
                    <Textarea
                      rows={3}
                      value={v.admission_text}
                      placeholder={ph("admission_text")}
                      onChange={(e) => set({ admission_text: e.target.value })}
                    />
                  </Field>
                  <Field label="Kabinet bandi matni" wide>
                    <Textarea
                      rows={2}
                      value={v.portal_text}
                      placeholder={ph("portal_text")}
                      onChange={(e) => set({ portal_text: e.target.value })}
                    />
                  </Field>
                </div>
              </Card>
            </>
          )}
          {H && (
            <>
              <Card title="Bosh ekran matnlari">
                <div className="a-form-grid">
                  {heroFields.map(([k, label, wide]) => (
                    <Field key={k} label={label} wide={wide}>
                      <Input
                        value={v.hero[k]}
                        placeholder={hph(k)}
                        onChange={(e) =>
                          set({ hero: { ...v.hero, [k]: e.target.value } })
                        }
                      />
                    </Field>
                  ))}
                </div>
              </Card>
            </>
          )}
          {!H && (
            <>
              {!H && (
                <>
                  <Card title="Tarqatma xatlari">
                    <Field label="Xat pastidagi matn">
                      <Input
                        value={v.newsletter_footer || ""}
                        placeholder={ph("newsletter_footer")}
                        onChange={(e) =>
                          set({ newsletter_footer: e.target.value })
                        }
                      />
                    </Field>
                  </Card>
                </>
              )}
            </>
          )}
        </>
      ) : (
        <>
          <Card title="Umumiy">
            <div className="a-form-grid">
              <Field
                label="Sayt nomi"
                hint="brauzer sarlavhasi va logotip yonida"
              >
                <Input
                  value={v.title}
                  onChange={(e) => set({ title: e.target.value })}
                />
              </Field>
              <Field
                label="Logotip harflari"
                hint="logotip rasmi bo‘lmasa doira ichida"
              >
                <Input
                  value={v.logo_text}
                  maxLength={6}
                  onChange={(e) => set({ logo_text: e.target.value })}
                />
              </Field>
              <Field label="Tavsif (SEO)" wide>
                <Textarea
                  rows={2}
                  value={v.description}
                  onChange={(e) => set({ description: e.target.value })}
                />
              </Field>
              <Field
                label="Asosiy til"
                hint="saytga birinchi kirganda shu til; kontentning asl matni shu tilda yoziladi"
              >
                <Select
                  value={v.lang}
                  onChange={(x) => set({ lang: x })}
                  options={[
                    { value: "uz", label: "O‘zbekcha" },
                    { value: "ru", label: "Русский" },
                    { value: "en", label: "English" },
                  ]}
                />
              </Field>
              <Field label="Standart mavzu">
                <Select
                  value={v.theme}
                  onChange={(x) => set({ theme: x })}
                  options={[
                    { value: "system", label: "Tizim bo‘yicha" },
                    { value: "light", label: "Yorug‘" },
                    { value: "dark", label: "Qorong‘i" },
                  ]}
                />
              </Field>
              <Field
                label="Asosiy rang"
                hint="logotipning asosiy rangi: tugmalar, sarlavha chiziqlari, yuqori panel"
              >
                <div className="a-color">
                  <input
                    type="color"
                    value={v.accent}
                    onChange={(e) =>
                      set({ accent: e.target.value, palette_auto: false })
                    }
                  />
                  <Input
                    value={v.accent}
                    onChange={(e) =>
                      set({ accent: e.target.value, palette_auto: false })
                    }
                  />
                  <div className="swatches">
                    {[
                      "#0F3D8C",
                      "#1E4FA3",
                      "#003478",
                      "#0B5394",
                      "#2F6F73",
                      "#161512",
                    ].map((c) => (
                      <button
                        key={c}
                        style={{ background: c }}
                        onClick={() => set({ accent: c, palette_auto: false })}
                        aria-label={c}
                      />
                    ))}
                  </div>
                </div>
              </Field>
              <Field
                label="Ikkinchi rang"
                hint="urg‘u: belgilar, «Qabul» tugmasi"
              >
                <div className="a-color">
                  <input
                    type="color"
                    value={v.accent2}
                    onChange={(e) =>
                      set({ accent2: e.target.value, palette_auto: false })
                    }
                  />
                  <Input
                    value={v.accent2}
                    onChange={(e) =>
                      set({ accent2: e.target.value, palette_auto: false })
                    }
                  />
                  <div className="swatches">
                    {[
                      "#C8102E",
                      "#CD2E3A",
                      "#E0A800",
                      "#0EA5E9",
                      "#16A34A",
                      "#7A5CC0",
                    ].map((c) => (
                      <button
                        key={c}
                        style={{ background: c }}
                        onClick={() => set({ accent2: c, palette_auto: false })}
                        aria-label={c}
                      />
                    ))}
                  </div>
                </div>
              </Field>
              <Field label="Palitra" wide>
                <Toggle
                  checked={v.palette_auto !== false}
                  onChange={(x) => set({ palette_auto: x })}
                  label="Ranglarni logotipdan avtomatik olish"
                  hint="Institut ma’lumotlarida logotip yuklanganda uning asosiy ranglari sayt ranglariga aylanadi; qo‘lda rang tanlansa o‘chadi"
                />
              </Field>
              <Field
                label="Saytning ochiq manzili"
                hint="email havolalari, sitemap uchun: https://example.edu"
              >
                <Input
                  value={v.url || ""}
                  placeholder="https://"
                  onChange={(e) => set({ url: e.target.value })}
                />
              </Field>
              <Field label="Pastki qism matni" wide>
                <Input
                  value={v.footer_text}
                  onChange={(e) => set({ footer_text: e.target.value })}
                  placeholder="Barcha huquqlar himoyalangan"
                />
              </Field>
              <ImageField
                label="Ijtimoiy tarmoq rasmi (OG, 1200×630)"
                value={v.og_image}
                onChange={(x) => set({ og_image: x })}
                aspect="1.91 / 1"
              />
              <div className="fav-field">
                <ImageField
                  label="Favicon (kvadrat PNG)"
                  value={v.favicon}
                  onChange={(x) => set({ favicon: x })}
                  aspect="1 / 1"
                />
              </div>
            </div>
          </Card>
          {H && (
            <>
              <Card
                title="Bosh ekran suratlari"
                sub="Saytda shu tartibda almashib turadi; birinchisi sahifa ochilganda ko‘rinadi. Tavsiya: 1600 px dan keng, gorizontal suratlar."
              >
                <div className="hero-imgs">
                  {heroList.map((src, i) => (
                    <div key={src + i} className="hero-img">
                      <img src={src} alt="" />
                      <div className="hero-img-bar">
                        <span className="hero-img-n">{i + 1}</span>
                        <button
                          type="button"
                          className="a-icon"
                          disabled={i === 0}
                          onClick={() => setHero(heroMove(heroList, i, i - 1))}
                          title="Oldinga"
                          aria-label="Oldinga"
                        >
                          <ArrowUp size={15} />
                        </button>
                        <button
                          type="button"
                          className="a-icon"
                          disabled={i === heroList.length - 1}
                          onClick={() => setHero(heroMove(heroList, i, i + 1))}
                          title="Orqaga"
                          aria-label="Orqaga"
                        >
                          <ArrowDown size={15} />
                        </button>
                        <button
                          type="button"
                          className="a-icon danger"
                          onClick={() => setHero(heroList.filter((_, j) => j !== i))}
                          title="Olib tashlash"
                          aria-label="Olib tashlash"
                        >
                          <X size={15} />
                        </button>
                      </div>
                    </div>
                  ))}
                  {heroList.length < 8 && (
                    <div className="hero-img add">
                      <ImageField
                        key={heroList.length}
                        label="Surat qo‘shish"
                        value=""
                        onChange={(x) => x && !heroList.includes(x) && setHero([...heroList, x])}
                        aspect="16 / 9"
                      />
                    </div>
                  )}
                </div>
              </Card>
              <Card
                title="Bosh sahifa suratlari"
                sub="Bo‘sh qolsa saytda neytral joy egallovchi ko‘rinadi. Tavsiya: 1600×1000 dan katta, bir xil uslubdagi suratlar."
              >
                <div className="home-imgs">
                  {HOME_IMAGES.map(([k, label]) => (
                    <ImageField
                      key={k}
                      label={label}
                      value={v.home_images?.[k] || ""}
                      onChange={(x) =>
                        set({ home_images: { ...(v.home_images || {}), [k]: x } })
                      }
                      aspect="16 / 10"
                    />
                  ))}
                </div>
              </Card>
            </>
          )}
          {H && (
            <>
              <Card
                title="«Qabul» tugmasi"
                sub="Sayt sarlavhasidagi (va telefon menyusidagi) «Qabul 2026» tugmasi. Yil tugma matnida va SEO sarlavhalarida (Qabul 2026 → Qabul 2027) almashadi."
              >
                <Toggle
                  checked={v.admission_cta !== false}
                  onChange={(x) => set({ admission_cta: x })}
                  label="Sarlavhada «Qabul» tugmasini ko‘rsatish"
                  hint="o‘chirilsa — tugma saytdan butunlay yo‘qoladi (qabul mavsumi tugaganda)"
                />
                <div className="a-form-grid" style={{ marginTop: 14 }}>
                  <Field label="Qabul yili" hint="masalan, 2027 — tugmada «Qabul 2027», ruscha «Приём 2027»">
                    <Input
                      type="number"
                      min={2000}
                      max={2100}
                      value={String(v.admission_year || 2026)}
                      onChange={(e) => set({ admission_year: Number(e.target.value) || undefined })}
                    />
                  </Field>
                </div>
              </Card>
              <Card
                title="Bosh sahifa bloklari"
                sub="Tartibni o‘qlar bilan o‘zgartiring; ko‘z belgisi — ko‘rsatish/yashirish"
              >
                <ul className="sections">
                  {v.sections.map((sec, i) => (
                    <li key={sec.id} className={sec.enabled ? "" : "off"}>
                      <span className="sec-idx">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span className="sec-name">{SECTION_NAMES[sec.id]}</span>
                      <button
                        className="a-icon"
                        onClick={() =>
                          set({
                            sections: v.sections.map((x, j) =>
                              j === i ? { ...x, enabled: !x.enabled } : x,
                            ),
                          })
                        }
                        title={sec.enabled ? "Yashirish" : "Ko‘rsatish"}
                      >
                        {sec.enabled ? <Eye size={16} /> : <EyeOff size={16} />}
                      </button>
                      <button
                        className="a-icon"
                        onClick={() => move(i, -1)}
                        disabled={i === 0}
                        title="Yuqoriga"
                      >
                        <ArrowUp size={16} />
                      </button>
                      <button
                        className="a-icon"
                        onClick={() => move(i, 1)}
                        disabled={i === v.sections.length - 1}
                        title="Pastga"
                      >
                        <ArrowDown size={16} />
                      </button>
                    </li>
                  ))}
                </ul>
                <div className="a-label" style={{ marginTop: 18 }}>
                  Bosh ekran matnlari (bo‘sh bo‘lsa — institut shiori va
                  standart tugmalar)
                </div>
                <div className="a-form-grid">
                  {heroFields.map(([k, label, wide]) => (
                    <Field key={k} label={label} wide={wide}>
                      <Input
                        value={v.hero[k]}
                        onChange={(e) =>
                          set({ hero: { ...v.hero, [k]: e.target.value } })
                        }
                      />
                    </Field>
                  ))}
                  <Field
                    label="Asosiy tugma havolasi"
                    hint="/admission yoki https://qabul…"
                  >
                    <Input
                      value={v.hero.cta_primary_url}
                      onChange={(e) =>
                        set({
                          hero: { ...v.hero, cta_primary_url: e.target.value },
                        })
                      }
                    />
                  </Field>
                  <Field
                    label="Video havolasi (YouTube yoki mp4)"
                    hint="bosh ekrandagi «video» tugmasi shu havolani ochadi"
                  >
                    <Input
                      value={v.hero.cta_secondary_url}
                      onChange={(e) =>
                        set({
                          hero: {
                            ...v.hero,
                            cta_secondary_url: e.target.value,
                          },
                        })
                      }
                    />
                  </Field>
                </div>
              </Card>
            </>
          )}
          {!H && (
            <>
              <Card title="Qabul va kabinet">
                <Field label="Qabul bandi matni (bosh sahifa va «Qabul» sahifasi)">
                  <Textarea
                    rows={3}
                    value={v.admission_text}
                    onChange={(e) => set({ admission_text: e.target.value })}
                  />
                </Field>
                <Field label="Kabinet bandi matni">
                  <Textarea
                    rows={2}
                    value={v.portal_text}
                    onChange={(e) => set({ portal_text: e.target.value })}
                  />
                </Field>
                <Toggle
                  checked={v.portal_enabled}
                  onChange={(x) => set({ portal_enabled: x })}
                  label="Talaba va o‘qituvchi kabineti yoqilgan"
                  hint="sarlavhadagi «Kirish» tugmasi va /login sahifasi"
                />
              </Card>
            </>
          )}
          {!H && (
            <>
              <Card title="Effektlar">
                <Toggle
                  checked={v.cursor}
                  onChange={(x) => set({ cursor: x })}
                  label="Maxsus kursor"
                  hint="sichqonchaga kechikish bilan ergashuvchi halqa (sensorli ekranlarda o‘chadi)"
                />
                <Toggle
                  checked={v.animations}
                  onChange={(x) => set({ animations: x })}
                  label="Aylantirishdagi animatsiyalar"
                  hint="foydalanuvchi tizimda «harakatni kamaytirish»ni yoqqan bo‘lsa avtomatik o‘chadi"
                />
                <Toggle
                  checked={v.smooth_scroll}
                  onChange={(x) => set({ smooth_scroll: x })}
                  label="Silliq aylantirish"
                />
                <Field label="Yangiliklar sahifasida bir sahifadagi yozuvlar">
                  <Input
                    type="number"
                    min={3}
                    max={30}
                    value={v.posts_per_page}
                    onChange={(e) =>
                      set({ posts_per_page: Number(e.target.value) })
                    }
                  />
                </Field>
              </Card>
            </>
          )}
          {!H && (
            <>
              <Card title="Obuna va bildirishnomalar">
                <Field
                  label="Bildirishnomalar uchun email"
                  hint="aloqa formasidan kelgan xabarlar shu manzilga yuboriladi"
                >
                  <Input
                    value={v.contact_email || ""}
                    onChange={(e) => set({ contact_email: e.target.value })}
                  />
                </Field>
                <Toggle
                  checked={!!v.notify_contact}
                  onChange={(x) => set({ notify_contact: x })}
                  label="Aloqa formasidan xabar kelganda emailga yuborish"
                />
                <Toggle
                  checked={!!v.notify_subscribe}
                  onChange={(x) => set({ notify_subscribe: x })}
                  label="Yangi obunachi haqida xabar berish"
                />
                <Toggle
                  checked={!!v.double_opt_in}
                  onChange={(x) => set({ double_opt_in: x })}
                  label="Obunani email orqali tasdiqlash (double opt-in)"
                  hint="tavsiya etiladi: soxta manzillar va spamdan himoya"
                />
                <Field label="Tarqatma xatlari pastidagi matn">
                  <Input
                    value={v.newsletter_footer || ""}
                    onChange={(e) => set({ newsletter_footer: e.target.value })}
                  />
                </Field>
              </Card>
            </>
          )}
        </>
      )}
    </div>
  );
}
