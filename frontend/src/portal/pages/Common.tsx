// Kabinet: umumiy sahifalar — dars jadvali, bildirishnomalar, profil
import { Award, Briefcase, CalendarDays, Camera, ClipboardCheck, FileText, GraduationCap, KeyRound, Loader2, Mail, Pencil, Pin, Printer, Save, ShieldCheck, Trash2, UserRound } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Avatar } from "../../lib/Avatar";
import type { OfficialForm, WeekSchedule } from "../../lib/api";
import { FORM_LABELS, OfficialFormView, printForm } from "../../lib/officialForm";
import { mondayOf, WeekNav, WeekView } from "../../lib/schedule";
import { Btn, Card, Empty, Field, Input, Modal, PageHead, Select, Spinner, fmtDateTime, useConfirm, useRun, useToast } from "../../admin/ui";
import { portal, student, type Notice } from "../api";
import { usePortal } from "../PortalApp";
import { Link, useLocation } from "react-router-dom";
import { forumNotice } from "./Blog";
import { HemisPanel } from "./Hemis";
import { TelegramCard } from "./TelegramCard";

export function SchedulePage() {
  const { t, me, user, lang } = usePortal();
  const [week, setWeek] = useState(mondayOf());
  const [sem, setSem] = useState(me.semester?.id || "");
  const [view, setView] = useState<"week" | "official">("week");
  const [layout, setLayout] = useState<"groups" | "days">("groups");
  const [fac, setFac] = useState("");
  const [d, setD] = useState<WeekSchedule | null>(null);
  const [form, setForm] = useState<OfficialForm | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    setD(null);
    portal.schedule(week, sem || undefined).then((r) => { setD(r); setErr(false); }).catch(() => setErr(true));
  }, [week, sem]);
  useEffect(() => {
    if (view !== "official") return;
    setForm(null);
    portal.form(sem || undefined, fac || undefined).then(setForm).catch(() => setErr(true));
  }, [view, sem, fac]);
  return (
    <div className="a-page">
      <PageHead
        title={t.schedule}
        sub={me.semester?.name}
        actions={
          <>
            {me.semesters.length > 1 && <Select value={sem} onChange={setSem} options={me.semesters.map((s) => ({ value: s.id, label: s.name }))} />}
            {view === "official" && (
              <Btn icon={<Printer size={15} />} onClick={printForm}>
                {t.print}
              </Btn>
            )}
          </>
        }
      />
      {user.role !== "student" && (
      <div className="a-seg sched-tabs">
        <button className={view === "week" ? "on" : ""} onClick={() => setView("week")}>
          <CalendarDays size={15} /> {t.view_week}
        </button>
        <button className={view === "official" ? "on" : ""} onClick={() => setView("official")}>
          <FileText size={15} /> {t.view_official}
        </button>
      </div>
      )}
      {view === "week" && <WeekNav week={week} onChange={setWeek} data={d} t={t} />}
      {view === "official" && (
        <div className="form-tools sched-tabs-row">
          {user.role === "teacher" && (me.faculties || []).length > 0 && (
            <Select
              value={fac}
              onChange={setFac}
              options={[{ value: "", label: t.my_schedule }, ...(me.faculties || []).map((f) => ({ value: f.id, label: `${t.faculty_schedule}: ${f.title}` }))]}
            />
          )}
          <div className="a-seg">
            <button className={layout === "groups" ? "on" : ""} onClick={() => setLayout("groups")}>
              {t.layout_groups}
            </button>
            <button className={layout === "days" ? "on" : ""} onClick={() => setLayout("days")}>
              {t.layout_days}
            </button>
          </div>
        </div>
      )}
      {err ? (
        <Card>
          <Empty title={t.no_data} />
        </Card>
      ) : view === "official" ? (
        !form ? (
          <Spinner />
        ) : form.unpublished ? (
          <Card>
            <Empty title={t.unpublished} />
          </Card>
        ) : form.no_group ? (
          <Card>
            <Empty title={t.no_group} />
          </Card>
        ) : (
          <OfficialFormView form={form} L={FORM_LABELS[lang] || FORM_LABELS.uz} weekdays={t.weekdays} layout={layout} today />
        )
      ) : !d ? (
        <Spinner />
      ) : d.unpublished ? (
        <Card>
          <Empty title={t.unpublished} />
        </Card>
      ) : d.no_group ? (
        <Card>
          <Empty title={t.no_group} />
        </Card>
      ) : (
        <WeekView data={d} t={t} showGroup={user.role !== "student"} showTeacher={user.role === "student"} />
      )}
    </div>
  );
}

export function NoticeList({ items, onDelete }: { items: Notice[]; onDelete?: (n: Notice) => void }) {
  const { t, lang } = usePortal();
  const base = "/" + (useLocation().pathname.split("/")[1] || "student");
  if (!items.length) return <Empty title={t.no_data} />;
  return (
    <div>
      {items.map((n) => {
        // forum bildirishnomasi (yoqtirish / javob / iqtibos): matn joriy tilda, sarlavha — mavzuga havola
        const f = forumNotice(n, lang, base);
        return (
        <div key={n.id} className={`p-notice ${n.pinned ? "pinned" : ""}`}>
          <h3>
            {n.pinned ? <Pin size={14} /> : null}
            {f ? <Link to={f.to}>{f.text}: «{n.meta?.post}»</Link> : n.link?.startsWith(`${base}/`) ? <Link to={n.link}>{n.title}</Link> : n.title}
            {n.group_name && <span className="a-pill info">{n.group_name}</span>}
          </h3>
          {n.body && <p>{n.body}</p>}
          <small>
            {fmtDateTime(n.created)}
            {n.author ? ` · ${n.author}` : ""}
            {onDelete && (
              <>
                {" · "}
                <button className="a-btn ghost sm" onClick={() => onDelete(n)}>
                  {t.delete}
                </button>
              </>
            )}
          </small>
        </div>
        );
      })}
      <span hidden>{lang}</span>
    </div>
  );
}

export function NoticesPage() {
  const { t } = usePortal();
  const [items, setItems] = useState<Notice[] | null>(null);
  useEffect(() => {
    portal.notices().then((r) => setItems(r.items)).catch(() => setItems([]));
  }, []);
  return (
    <div className="a-page narrow">
      <PageHead title={t.notices} />
      <Card pad={false}>{!items ? <Spinner /> : <NoticeList items={items} />}</Card>
    </div>
  );
}

const PL: Record<string, Record<string, string>> = {
  uz: {
    edit: "Tahrirlash", change_pw: "Parolni almashtirish", photo: "Suratni yangilash", remove_photo: "Suratni olib tashlash", personal: "Shaxsiy ma’lumotlar",
    study: "O‘qish", work: "Ish joyi", account: "Hisob", mail: "Institut pochtasi", address: "Manzil", birth: "Tug‘ilgan sana", course_n: "kurs",
    sections: "Bo‘limlar", last_login: "Oxirgi kirish", fullname: "F.I.Sh.", lang: "O‘qish tili", photo_hint: "Yuzingiz aniq ko‘rinadigan surat yuklang (hayvon, manzara, guruh surati qabul qilinmaydi)",
    photo_no_face: "Suratda odam yuzi topilmadi. Yuzingiz aniq ko‘rinadigan portret surat yuklang.", photo_face_small: "Yuz juda kichik — yaqinroqdan olingan portret surat yuklang.",
    photo_many_faces: "Suratda bir nechta odam bor — faqat o‘zingiz tushgan surat yuklang.", photo_not_image: "Fayl rasm emas (JPG, PNG, WEBP).", photo_unavailable: "Yuzni aniqlash xizmati ishlamayapti.", photo_saved: "Surat yangilandi",
    student: "Talaba", teacher: "Professor-o‘qituvchi", staff: "Xodim", checking: "Tekshirilmoqda…",
  },
  ru: {
    edit: "Редактировать", change_pw: "Сменить пароль", photo: "Обновить фото", remove_photo: "Удалить фото", personal: "Личные данные",
    study: "Учёба", work: "Место работы", account: "Аккаунт", mail: "Почта института", address: "Адрес", birth: "Дата рождения", course_n: "курс",
    sections: "Отделы", last_login: "Последний вход", fullname: "Ф.И.О.", lang: "Язык обучения", photo_hint: "Загрузите фото, где хорошо видно лицо (животные, пейзажи, групповые фото не принимаются)",
    photo_no_face: "На фото не найдено лицо человека. Загрузите портретное фото.", photo_face_small: "Лицо слишком маленькое — загрузите фото крупнее.",
    photo_many_faces: "На фото несколько человек — загрузите фото только с вами.", photo_not_image: "Файл не является изображением (JPG, PNG, WEBP).", photo_unavailable: "Сервис распознавания лиц недоступен.", photo_saved: "Фото обновлено",
    student: "Студент", teacher: "Преподаватель", staff: "Сотрудник", checking: "Проверка…",
  },
  en: {
    edit: "Edit", change_pw: "Change password", photo: "Update photo", remove_photo: "Remove photo", personal: "Personal details",
    study: "Study", work: "Workplace", account: "Account", mail: "Institute mail", address: "Address", birth: "Date of birth", course_n: "year",
    sections: "Departments", last_login: "Last sign-in", fullname: "Full name", lang: "Language of study", photo_hint: "Upload a photo where your face is clearly visible (animals, landscapes, group photos are rejected)",
    photo_no_face: "No human face found. Please upload a portrait photo.", photo_face_small: "The face is too small — upload a closer portrait.",
    photo_many_faces: "Several people in the photo — upload a photo of only you.", photo_not_image: "The file is not an image (JPG, PNG, WEBP).", photo_unavailable: "Face detection is unavailable.", photo_saved: "Photo updated",
    student: "Student", teacher: "Professor", staff: "Staff", checking: "Checking…",
  },
};

function Row({ label, value }: { label: string; value?: ReactNode }) {
  return (
    <div className="pf-row">
      <span>{label}</span>
      <b>{value || "—"}</b>
    </div>
  );
}

export function ProfilePage() {
  const { t, me, user, reload, lang } = usePortal();
  const l = PL[lang] || PL.uz;
  const run = useRun();
  const toast = useToast();
  const confirm = useConfirm();
  const [edit, setEdit] = useState<{ email: string; phone: string; address: string; birth: string } | null>(null);
  const [pw, setPw] = useState<{ current: string; next: string; again: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [mailAddr, setMailAddr] = useState("");
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => {
    import("../../mail/api").then(({ mail }) => mail.status().then((s) => setMailAddr(s.enabled ? s.address || "" : "")).catch(() => null));
  }, []);
  const d = (user.data || {}) as Record<string, string>;
  const upload = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true);
    try {
      await portal.photo(f);
      toast(l.photo_saved);
      reload();
    } catch (e) {
      const code = (e as { detail?: string }).detail || "";
      toast(l[code] || code || "Error", "error");
    }
    setBusy(false);
  };
  const g = me.group as (typeof me.group & { course?: number; lang?: string }) | null | undefined;
  const [stats, setStats] = useState<{ gpa: number | null; att: number | null } | null>(null);
  useEffect(() => {
    if (user.role !== "student") return;
    Promise.all([student.grades().catch(() => null), student.attendance().catch(() => null)]).then(([gr, at]) =>
      setStats({ gpa: gr?.gpa ?? null, att: at?.pct != null ? Math.round(at.pct) : null }),
    );
  }, [user.role]);
  return (
    <div className="a-page pp">
      <section className="a-card mdp">
        <div className="mdp-bar">
          <div className="mdp-stats">
            {(user.role === "student"
              ? ([
                  [<GraduationCap key="c" size={20} />, g?.course ? `${g.course}` : "—", t.course],
                  [<ClipboardCheck key="at" size={20} />, stats?.att != null ? `${stats.att}%` : "—", t.attendance],
                  [<Award key="gpa" size={20} />, stats?.gpa != null ? String(stats.gpa) : "—", "GPA"],
                ] as [ReactNode, string, string][])
              : ([
                  [<UserRound key="l" size={20} />, "@" + user.login, t.login],
                  ...(mailAddr ? [[<Mail key="m" size={20} />, mailAddr.split("@")[0], l.mail] as [ReactNode, string, string]] : []),
                ] as [ReactNode, string, string][])
            ).map(([ic, v, k]) => (
              <div key={k} className="mdp-stat">
                {ic}
                <b>{v}</b>
                <small>{k}</small>
              </div>
            ))}
          </div>
          <div className="mdp-center">
            <div className="mdp-photo">
              <Avatar name={user.name} photo={d.photo} size={112} />
              <button className="pf-cam" onClick={() => file.current?.click()} title={l.photo} aria-label={l.photo} disabled={busy}>
                {busy ? <Loader2 size={16} className="spin" /> : <Camera size={16} />}
              </button>
              <input ref={file} type="file" accept="image/*" hidden onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ""; }} />
            </div>
            <h1>{user.name}</h1>
            <p>
              {user.role === "student"
                ? [l[user.role], g?.name, me.faculty?.title].filter(Boolean).join(" · ")
                : [d.position || l[user.role], d.department].filter(Boolean).join(" · ")}
            </p>
          </div>
          <div className="mdp-actions">
            {d.photo && (
              <button
                className="a-icon danger"
                onClick={async () => {
                  if (await confirm(l.remove_photo + "?")) {
                    await run(() => portal.removePhoto());
                    reload();
                  }
                }}
                title={l.remove_photo}
                aria-label={l.remove_photo}
              >
                <Trash2 size={17} />
              </button>
            )}
            <Btn icon={<KeyRound size={15} />} onClick={() => setPw({ current: "", next: "", again: "" })}>
              {l.change_pw}
            </Btn>
            <Btn kind="primary" icon={<Pencil size={15} />} onClick={() => setEdit({ email: user.email || "", phone: d.phone || "", address: d.address || "", birth: d.birth || "" })}>
              {l.edit}
            </Btn>
          </div>
        </div>
        <div className="mdp-foot">
          <div className="mdp-chips">
            <span>@{user.login}</span>
            {mailAddr && (
              <span>
                <Mail size={13} /> {mailAddr}
              </span>
            )}
            {user.role === "student" && d.student_no && <span>ID {d.student_no}</span>}
          </div>
          <small>{l.photo_hint}</small>
        </div>
      </section>
      <div className="pf-grid pp-grid">
        <Card title={<span className="pp-ct"><UserRound size={17} /> {l.personal}</span>}>
          <Row label={l.fullname} value={user.name} />
          <Row label={l.birth} value={d.birth} />
          <Row label={t.phone} value={d.phone} />
          <Row label={t.email} value={user.email} />
          <Row label={l.address} value={d.address} />
        </Card>
        {user.role === "student" ? (
          <Card title={<span className="pp-ct"><GraduationCap size={17} /> {l.study}</span>}>
            <Row label={t.faculty} value={me.faculty?.title} />
            <Row label={t.program} value={me.program?.title} />
            <Row label={t.group} value={g?.name} />
            <Row label={t.course} value={g?.course ? `${g.course}-${l.course_n}` : ""} />
            <Row label={l.lang} value={g?.lang} />
            <Row label={t.student_no} value={d.student_no} />
            <Row
              label={t.curator}
              value={
                me.curator ? (
                  <span className="u-cell">
                    <Avatar name={me.curator.name} photo={(me.curator.data || {}).photo} size={26} /> {me.curator.name}
                  </span>
                ) : undefined
              }
            />
          </Card>
        ) : (
          <Card title={<span className="pp-ct"><Briefcase size={17} /> {l.work}</span>}>
            <Row label={t.position} value={d.position} />
            <Row label={t.department} value={d.department} />
            <Row label={l.sections} value={(me.sections || []).join(", ")} />
            {user.role === "teacher" && <Row label={t.faculty} value={(me.faculties || []).map((f) => f.title).join(", ")} />}
          </Card>
        )}
        <Card title={<span className="pp-ct"><ShieldCheck size={17} /> {l.account}</span>}>
          <Row label={t.login} value={user.login} />
          <Row label={l.mail} value={mailAddr} />
          <Row label={l.last_login} value={fmtDateTime(user.last_login)} />
        </Card>
        {user.role === "student" && <TelegramCard />}
      </div>
      <HemisPanel />

      <Modal
        open={!!edit}
        onClose={() => setEdit(null)}
        title={l.edit}
        footer={
          <>
            <Btn onClick={() => setEdit(null)}>×</Btn>
            <Btn
              kind="primary"
              icon={<Save size={15} />}
              onClick={async () => {
                if (!edit) return;
                const r = await run(() => portal.profile({ email: edit.email, data: { phone: edit.phone, address: edit.address, birth: edit.birth } }), t.saved);
                if (r) {
                  setEdit(null);
                  reload();
                }
              }}
            >
              {t.save}
            </Btn>
          </>
        }
      >
        {edit && (
          <div className="a-form-grid">
            <Field label={t.email}>
              <Input value={edit.email} onChange={(e) => setEdit({ ...edit, email: e.target.value })} />
            </Field>
            <Field label={t.phone}>
              <Input value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} placeholder="+998" />
            </Field>
            <Field label={l.birth}>
              <Input type="date" value={edit.birth} onChange={(e) => setEdit({ ...edit, birth: e.target.value })} />
            </Field>
            <Field label={l.address} wide>
              <Input value={edit.address} onChange={(e) => setEdit({ ...edit, address: e.target.value })} />
            </Field>
          </div>
        )}
      </Modal>

      <Modal
        open={!!pw}
        onClose={() => setPw(null)}
        title={l.change_pw}
        width={440}
        footer={
          <>
            <Btn onClick={() => setPw(null)}>×</Btn>
            <Btn
              kind="primary"
              icon={<KeyRound size={15} />}
              disabled={!pw || !pw.current || pw.next.length < 8 || pw.next !== pw.again}
              onClick={async () => {
                if (!pw) return;
                const r = await run(() => portal.password(pw.current, pw.next), t.password_changed);
                if (r) setPw(null);
              }}
            >
              {t.save}
            </Btn>
          </>
        }
      >
        {pw && (
          <div className="a-form-grid one">
            <Field label={t.current_password}>
              <Input type="password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} autoComplete="current-password" />
            </Field>
            <Field label={t.new_password} hint={t.password_hint}>
              <Input type="password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} autoComplete="new-password" />
            </Field>
            <Field label={t.new_password + " ✓"} hint={pw.again && pw.again !== pw.next ? "≠" : undefined}>
              <Input type="password" value={pw.again} onChange={(e) => setPw({ ...pw, again: e.target.value })} autoComplete="new-password" />
            </Field>
          </div>
        )}
      </Modal>
    </div>
  );
}
