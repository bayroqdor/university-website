// Grant taqsimoti (/grant-redistribution): ariza formasi (admin ochganda) va e'lon qilingan natijalar jadvali.
// Natijalar e'lon qilingach forma, «Diqqat!» va «Eslatma» bloklari ko'rinmaydi — sahifa natijalar sahifasiga aylanadi.
// Admin: «Grant taqsimoti» bo'limi — arizalar jadvali, Excel, natijalarni yuklash va e'lon qilish.
import { AlertTriangle, ArrowDown, CheckCircle2, ChevronUp, Download, ExternalLink, Eye, FileText, Search, Send } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent, type MouseEvent } from "react";
import { Consent } from "../official/Consent";
import { ApiError, req, type Lang } from "../../lib/api";
import { useSite } from "../../lib/site";
import { docKind, DocViewer } from "../../rich/DocViewer";
import "../../styles/grants.css";
import { Reveal } from "../chrome/ui";

type L = Partial<Record<Lang, string>>;
type Group = { title: string; columns: string[]; rows: string[][] };
type Data = { open: boolean; published?: boolean; deadline: string; notice: L; intro: L; results: { title: L; intro: L; groups: Group[]; file: string; updated: string } | null };

const TX: Record<Lang, Record<string, string>> = {
  uz: {
    eyebrow: "Talabalar uchun",
    title: "Grant taqsimoti",
    lead: "Davlat grantlari o‘rnini qayta taqsimlash uchun ariza topshiring. Ma’lumotlaringizni to‘g‘ri to‘ldiring — arizangiz komissiya tomonidan ko‘rib chiqiladi.",
    open: "Arizalar qabul qilinmoqda",
    closed: "Arizalar qabuli yopiq",
    until: "Muddat",
    attention: "Diqqat!",
    notice: "Qabul jarayonida o‘z yo‘nalishida grant ajratilmagan guruh talabalarining arizalari qabul qilinmaydi.",
    reminder: "Eslatma",
    reminder_t: "Barcha maydonlarni to‘g‘ri to‘ldirganingizga ishonch hosil qiling. Arizangiz ko‘rib chiqilgandan so‘ng natijalar shu sahifada e’lon qilinadi.",
    form: "Ariza",
    full_name: "To‘liq ism (F.I.Sh.)",
    full_name_ph: "Familiya Ism Sharif",
    course: "Kurs",
    course_ph: "Kursni tanlang",
    master: "Magistratura",
    group: "Guruh",
    group_ph: "Masalan: 10-24",
    field: "Ta’lim yo‘nalishi",
    field_ph: "Masalan: Dasturiy injiniring",
    edu_lang: "Ta’lim tili",
    edu_lang_ph: "Tilni tanlang",
    l_uz: "O‘zbek tili",
    l_ru: "Rus tili",
    l_en: "Ingliz tili",
    phone: "Telefon raqam",
    email: "Email (ixtiyoriy)",
    reason: "Grant kerak bo‘lish sababi",
    reason_ph: "Qisqacha tushuntiring: o‘zlashtirish, ijtimoiy holat, faollik…",
    send: "Ariza yuborish",
    sending: "Yuborilmoqda…",
    req: "Majburiy maydon",
    bad_phone: "Raqamni +998 90 123 45 67 shaklida kiriting",
    bad_email: "Email noto‘g‘ri",
    fio: "Familiya, ism va sharifni to‘liq yozing",
    reason_short: "Sababni batafsilroq yozing",
    duplicate: "Bu raqamdan bugun ariza yuborilgan",
    closed_err: "Arizalar qabuli yopilgan",
    error: "Xatolik yuz berdi. Qaytadan urinib ko‘ring.",
    sent: "Arizangiz qabul qilindi",
    sent_t: "Ariza raqami: №{n}. Natijalar shu sahifada e’lon qilinadi.",
    again: "Yana ariza yuborish",
    closed_t: "Hozircha arizalar qabul qilinmayapti. Qabul boshlanganda shu sahifada forma ochiladi.",
    results: "Grant natijalari",
    lead_res: "Grant taqsimoti natijalari e’lon qilindi. Ro‘yxatdan o‘zingizni F.I.Sh. yoki guruh bo‘yicha toping.",
    search: "F.I.Sh. yoki guruh bo‘yicha qidirish",
    pdf: "Komissiya qarori",
    view: "Ko‘rish",
    hide: "Yopish",
    download: "Yuklab olish",
    open_tab: "Yangi oynada ochish",
    updated: "Yangilangan",
    none: "Hech narsa topilmadi",
    persons: "nafar",
  },
  ru: {
    eyebrow: "Студентам",
    title: "Перераспределение грантов",
    lead: "Подайте заявку на перераспределение мест государственных грантов. Заполните данные внимательно — заявку рассмотрит комиссия.",
    open: "Приём заявок открыт",
    closed: "Приём заявок закрыт",
    until: "Срок",
    attention: "Внимание!",
    notice: "Заявки студентов групп, по направлению которых гранты не выделялись, не принимаются.",
    reminder: "Примечание",
    reminder_t: "Проверьте правильность всех полей. После рассмотрения результаты будут опубликованы на этой странице.",
    form: "Заявка",
    full_name: "Полное имя (Ф.И.О.)",
    full_name_ph: "Фамилия Имя Отчество",
    course: "Курс",
    course_ph: "Выберите курс",
    master: "Магистратура",
    group: "Группа",
    group_ph: "Например: 10-24",
    field: "Направление обучения",
    field_ph: "Например: Пищевая технология",
    edu_lang: "Язык обучения",
    edu_lang_ph: "Выберите язык",
    l_uz: "Узбекский",
    l_ru: "Русский",
    l_en: "Английский",
    phone: "Номер телефона",
    email: "Email (необязательно)",
    reason: "Причина",
    reason_ph: "Кратко: успеваемость, социальное положение, активность…",
    send: "Отправить заявку",
    sending: "Отправка…",
    req: "Обязательное поле",
    bad_phone: "Введите номер в формате +998 90 123 45 67",
    bad_email: "Неверный email",
    fio: "Укажите фамилию, имя и отчество полностью",
    reason_short: "Опишите причину подробнее",
    duplicate: "С этого номера сегодня уже подана заявка",
    closed_err: "Приём заявок закрыт",
    error: "Ошибка. Попробуйте ещё раз.",
    sent: "Заявка принята",
    sent_t: "Номер заявки: №{n}. Результаты будут опубликованы на этой странице.",
    again: "Подать ещё одну",
    closed_t: "Сейчас заявки не принимаются. Когда приём начнётся, здесь откроется форма.",
    results: "Результаты распределения",
    lead_res: "Результаты перераспределения грантов опубликованы. Найдите себя в списке по Ф.И.О. или группе.",
    search: "Поиск по Ф.И.О. или группе",
    pdf: "Решение комиссии",
    view: "Просмотр",
    hide: "Скрыть",
    download: "Скачать",
    open_tab: "Открыть в новом окне",
    updated: "Обновлено",
    none: "Ничего не найдено",
    persons: "чел.",
  },
  en: {
    eyebrow: "For students",
    title: "Grant redistribution",
    lead: "Apply for redistribution of state grant places. Fill in your details carefully — the committee will review your application.",
    open: "Applications are open",
    closed: "Applications are closed",
    until: "Deadline",
    attention: "Please note",
    notice: "Applications from groups whose programme received no grant places are not accepted.",
    reminder: "Reminder",
    reminder_t: "Make sure every field is correct. Results will be published on this page after review.",
    form: "Application",
    full_name: "Full name",
    full_name_ph: "Surname Name Patronymic",
    course: "Year",
    course_ph: "Select year",
    master: "Master’s",
    group: "Group",
    group_ph: "e.g. 10-24",
    field: "Programme",
    field_ph: "e.g. Food Technology",
    edu_lang: "Language of study",
    edu_lang_ph: "Select language",
    l_uz: "Uzbek",
    l_ru: "Russian",
    l_en: "English",
    phone: "Phone number",
    email: "Email (optional)",
    reason: "Reason for the grant",
    reason_ph: "Briefly: academic results, social situation, activities…",
    send: "Submit application",
    sending: "Sending…",
    req: "Required",
    bad_phone: "Enter the number as +998 90 123 45 67",
    bad_email: "Invalid email",
    fio: "Enter your full name",
    reason_short: "Please describe the reason in more detail",
    duplicate: "An application from this number was already sent today",
    closed_err: "Applications are closed",
    error: "Something went wrong. Please try again.",
    sent: "Application received",
    sent_t: "Application No. {n}. Results will be published on this page.",
    again: "Submit another",
    closed_t: "Applications are not being accepted right now. The form will open here when they start.",
    results: "Grant results",
    lead_res: "The grant redistribution results have been published. Find yourself in the list by name or group.",
    search: "Search by name or group",
    pdf: "Committee decision",
    view: "View",
    hide: "Hide",
    download: "Download",
    open_tab: "Open in new tab",
    updated: "Updated",
    none: "Nothing found",
    persons: "people",
  },
};

const pick = (m: L | undefined, lang: Lang) => (m && (m[lang] || m.uz || m.ru || m.en)) || "";
const EMPTY = { full_name: "", course: "", group: "", field: "", edu_lang: "", phone: "+998 ", email: "", reason: "" };

/** Havolalar ONLYOFFICE ko'ruvchisiga (/docs/view) yo'naltirilmasin: Layout'dagi umumiy ushlagich `data-no-office`ni hurmat qiladi.
 * DocViewer ichidagi havolalarga ham bosilgan zahoti shu belgi qo'yiladi (capture bosqichi document'dagi ushlagichdan oldin ishlaydi). */
const noOffice = (e: MouseEvent) => {
  const a = (e.target as HTMLElement | null)?.closest?.("a[href]");
  if (a) a.setAttribute("data-no-office", "");
};

/** Komissiya qarori: aniq tugmalar — «Ko'rish» (sahifaning o'zida pdf.js) va «Yuklab olish». */
function Decision({ src, lang }: { src: string; lang: Lang }) {
  const t = TX[lang];
  const [show, setShow] = useState(false);
  const kind = docKind(src);
  const local = src.startsWith("/");
  return (
    <div className="gr-doc" onClickCapture={noOffice}>
      <div className="gr-doc-row">
        <span className="gr-doc-ic" aria-hidden>
          <FileText size={22} />
        </span>
        <b className="gr-doc-t">{t.pdf}</b>
        <span className="gr-doc-a">
          {kind ? (
            <button type="button" className="gr-btn ghost sm" aria-expanded={show} aria-controls="gr-doc-view" onClick={() => setShow((v) => !v)}>
              {show ? <ChevronUp size={17} aria-hidden /> : <Eye size={17} aria-hidden />} {show ? t.hide : t.view}
            </button>
          ) : (
            <a className="gr-btn ghost sm" href={src} target="_blank" rel="noopener noreferrer" data-no-office="">
              <ExternalLink size={17} aria-hidden /> {t.open_tab}
            </a>
          )}
          {local && (
            <a className="gr-btn sm" href={src} download data-no-office="">
              <Download size={17} aria-hidden /> {t.download}
            </a>
          )}
        </span>
      </div>
      {show && kind && (
        <div className="gr-doc-view" id="gr-doc-view">
          <DocViewer src={src} title={t.pdf} lang={lang} />
        </div>
      )}
    </div>
  );
}

function Results({ r, lang }: { r: NonNullable<Data["results"]>; lang: Lang }) {
  const t = TX[lang];
  const [q, setQ] = useState("");
  const n = q.trim().toLocaleLowerCase();
  const groups = useMemo(() => r.groups.map((g) => ({ ...g, rows: n ? g.rows.filter((row) => row.join(" ").toLocaleLowerCase().includes(n)) : g.rows })), [r.groups, n]);
  const total = r.groups.reduce((a, g) => a + g.rows.length, 0);
  const shown = groups.reduce((a, g) => a + g.rows.length, 0);
  return (
    <section className="gr-res" id="results" aria-labelledby="gr-res-t">
      <div className="wrap">
        <Reveal className="gr-res-head">
          <p className="ey">{t.results}</p>
          <h2 className="h2" id="gr-res-t">
            {pick(r.title, lang) || t.results}
          </h2>
          {pick(r.intro, lang) && <p className="gr-res-intro">{pick(r.intro, lang)}</p>}
          {r.file && <Decision src={r.file} lang={lang} />}
          <div className="gr-res-tools">
            <label className="gr-search">
              <Search size={17} aria-hidden />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.search} aria-label={t.search} />
            </label>
            <span className="gr-count tnum">
              {n ? `${shown} / ${total}` : total} {t.persons}
            </span>
          </div>
        </Reveal>
        {groups.map((g, i) =>
          g.rows.length ? (
            <div className="gr-group" key={i}>
              {g.title && (
                <h3>
                  {g.title} <small className="tnum">{g.rows.length}</small>
                </h3>
              )}
              <div className="gr-tablewrap">
                <table className="gr-table">
                  <thead>
                    <tr>
                      {g.columns.map((c, k) => (
                        <th key={k} className={k === 0 && /^(№|#|n)$/i.test(c.trim()) ? "gr-n" : ""}>
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {g.rows.map((row, k) => (
                      <tr key={k}>
                        {row.map((cell, j) => (
                          <td key={j} className={j === 0 && /^\d+$/.test(cell) ? "gr-n tnum" : ""}>
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null,
        )}
        {n && !shown && <p className="gr-none">{t.none}</p>}
        {r.updated && (
          <p className="gr-upd">
            {t.updated}: {new Date(r.updated).toLocaleDateString(lang === "en" ? "en-GB" : "ru-RU")}
          </p>
        )}
      </div>
    </section>
  );
}

export function GrantsPage() {
  const { lang } = useSite();
  const t = TX[lang] || TX.uz;
  const [d, setD] = useState<Data | null>(null);
  const [f, setF] = useState({ ...EMPTY });
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [state, setState] = useState<"" | "busy" | "sent" | "error">("");
  const [msg, setMsg] = useState("");
  const [num, setNum] = useState(0);
  useEffect(() => {
    req<Data>("GET", "/api/grants")
      .then(setD)
      .catch(() => setD({ open: false, deadline: "", notice: {}, intro: {}, results: null }));
  }, []);
  useEffect(() => {
    document.title = t.title;
  }, [t]);

  const set = (k: keyof typeof EMPTY, v: string) => {
    setF((p) => ({ ...p, [k]: v }));
    if (errs[k]) setErrs((e) => ({ ...e, [k]: "" }));
  };
  const validate = () => {
    const e: Record<string, string> = {};
    if (f.full_name.trim().split(/\s+/).length < 2) e.full_name = t.fio;
    if (!f.course) e.course = t.req;
    if (!f.group.trim()) e.group = t.req;
    if (f.field.trim().length < 3) e.field = t.req;
    if (!f.edu_lang) e.edu_lang = t.req;
    const dg = f.phone.replace(/\D/g, "");
    if (!/^(998)?\d{9}$/.test(dg)) e.phone = t.bad_phone;
    if (f.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email)) e.email = t.bad_email;
    if (f.reason.trim().length < 10) e.reason = t.reason_short;
    setErrs(e);
    return !Object.keys(e).length;
  };
  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    if (!validate()) return;
    setState("busy");
    try {
      const r = await req<{ number: number }>("POST", "/api/grants/apply", { ...f });
      setNum(r.number);
      setState("sent");
      setF({ ...EMPTY });
    } catch (x) {
      const p = x instanceof ApiError ? (x.body as { fields?: Record<string, string> } | string | undefined) : undefined;
      if (p && typeof p === "object" && p.fields) {
        const map: Record<string, string> = {};
        for (const [k, v] of Object.entries(p.fields)) map[k] = k === "phone" ? t.bad_phone : k === "email" ? t.bad_email : k === "full_name" ? t.fio : v === "required" ? t.req : t.req;
        setErrs(map);
        setState("");
        return;
      }
      const code = x instanceof ApiError ? x.detail : "";
      setMsg(code === "duplicate" ? t.duplicate : code === "closed" ? t.closed_err : t.error);
      setState("error");
    }
  };

  const field = (k: keyof typeof EMPTY, label: string, input: React.ReactNode, wide = false, required = true) => (
    <label className={`gr-f ${wide ? "wide" : ""} ${errs[k] ? "bad" : ""}`}>
      <span className="gr-l">
        {label}
        {required && <i aria-hidden> *</i>}
      </span>
      {input}
      {errs[k] && <span className="gr-err">{errs[k]}</span>}
    </label>
  );

  // natijalar e'lon qilingan bo'lsa — forma va eslatmalar o'rniga natijalar (server ham yangi arizani qabul qilmaydi)
  const res = d?.results || null;
  const date = (v: string) => new Date(v).toLocaleDateString(lang === "en" ? "en-GB" : "ru-RU");

  return (
    <div className="gr">
      <section className="gr-hero">
        <Reveal className="wrap">
          <p className="ey">{t.eyebrow}</p>
          <h1 className="display">{t.title}</h1>
          <p className="gr-lead">{res ? t.lead_res : pick(d?.intro, lang) || t.lead}</p>
          {d && (
            <div className="gr-hero-a">
              {res ? (
                <a className="gr-btn" href="#results" data-no-office="">
                  {t.results} <ArrowDown size={18} aria-hidden />
                </a>
              ) : (
                <p className={`gr-status ${d.open ? "on" : ""}`}>
                  <span className="gr-dot" aria-hidden />
                  <span>{d.open ? t.open : t.closed}</span>
                  {d.open && d.deadline && (
                    <b>
                      {t.until}: {date(d.deadline + "T12:00:00")}
                    </b>
                  )}
                </p>
              )}
            </div>
          )}
        </Reveal>
      </section>

      {d && !res && (
        <section className="gr-main">
          <div className="wrap">
            <aside className="gr-aside">
              <div className="gr-note warn">
                <AlertTriangle size={20} aria-hidden />
                <div>
                  <b>{t.attention}</b>
                  <p>{pick(d?.notice, lang) || t.notice}</p>
                </div>
              </div>
              <div className="gr-note">
                <CheckCircle2 size={20} aria-hidden />
                <div>
                  <b>{t.reminder}</b>
                  <p>{t.reminder_t}</p>
                </div>
              </div>
            </aside>

            <div className="gr-card">
              <h2 className="gr-card-t">{t.form}</h2>
              {state === "sent" ? (
                <div className="gr-sent" role="status">
                  <CheckCircle2 size={36} aria-hidden />
                  <h3>{t.sent}</h3>
                  <p>{t.sent_t.replace("{n}", String(num))}</p>
                  <button type="button" className="gr-btn ghost" onClick={() => setState("")}>
                    {t.again}
                  </button>
                </div>
              ) : !d.open ? (
                <p className="gr-closed">{t.closed_t}</p>
              ) : (
                <form className="gr-form" onSubmit={submit} noValidate>
                  {field(
                    "full_name",
                    t.full_name,
                    <input value={f.full_name} onChange={(e) => set("full_name", e.target.value)} placeholder={t.full_name_ph} autoComplete="name" maxLength={160} />,
                    true,
                  )}
                  {field(
                    "course",
                    t.course,
                    <select value={f.course} onChange={(e) => set("course", e.target.value)}>
                      <option value="">{t.course_ph}</option>
                      {["1", "2", "3", "4"].map((c) => (
                        <option key={c} value={c}>
                          {lang === "en" ? `Year ${c}` : lang === "ru" ? `${c} курс` : `${c}-kurs`}
                        </option>
                      ))}
                      <option value="master">{t.master}</option>
                    </select>,
                  )}
                  {field("group", t.group, <input value={f.group} onChange={(e) => set("group", e.target.value)} placeholder={t.group_ph} maxLength={40} />)}
                  {field("field", t.field, <input value={f.field} onChange={(e) => set("field", e.target.value)} placeholder={t.field_ph} maxLength={160} />)}
                  {field(
                    "edu_lang",
                    t.edu_lang,
                    <select value={f.edu_lang} onChange={(e) => set("edu_lang", e.target.value)}>
                      <option value="">{t.edu_lang_ph}</option>
                      <option value="uz">{t.l_uz}</option>
                      <option value="ru">{t.l_ru}</option>
                      <option value="en">{t.l_en}</option>
                    </select>,
                  )}
                  {field("phone", t.phone, <input value={f.phone} onChange={(e) => set("phone", e.target.value.replace(/[^\d+\s()-]/g, ""))} inputMode="tel" autoComplete="tel" maxLength={20} />)}
                  {field(
                    "email",
                    t.email,
                    <input type="email" value={f.email} onChange={(e) => set("email", e.target.value)} placeholder="example@mail.uz" autoComplete="email" maxLength={160} />,
                    false,
                    false,
                  )}
                  {field("reason", t.reason, <textarea rows={5} value={f.reason} onChange={(e) => set("reason", e.target.value)} placeholder={t.reason_ph} maxLength={3000} />, true)}
                  {state === "error" && (
                    <p className="gr-formerr" role="alert">
                      {msg}
                    </p>
                  )}
                  <Consent />
                  <button className="gr-btn" disabled={state === "busy"}>
                    {state === "busy" ? t.sending : t.send} <Send size={17} aria-hidden />
                  </button>
                </form>
              )}
            </div>
          </div>
        </section>
      )}

      {res && <Results r={res} lang={lang} />}
    </div>
  );
}
