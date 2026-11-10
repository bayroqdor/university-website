// Xodim kabineti bosh sahifasi va o'qituvchi uchun «Kafedram» — admin ruxsat bergan kafedra sahifasini tahrirlash
import { Bell, ExternalLink, ImagePlus, Landmark, Mail, Save, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { JSONContent } from "@tiptap/core";
import { RichEditor } from "../../editor/RichEditor";
import type { Lang } from "../../lib/api";
import { Btn, Card, Empty, Field, Input, Pill, Spinner, Textarea, useToast } from "../../admin/ui";
import { portal, type FacultyDoc, type Today } from "../api";
import { usePortal } from "../PortalApp";

const L: Record<Lang, Record<string, string>> = {
  uz: {
    sections: "Bo‘limlarim", latest: "So‘nggi bildirishnomalar", none: "Bildirishnoma yo‘q", open_mail: "Pochtani ochish", faculty: "Kafedra sahifasi",
    summary: "Qisqacha tavsif", content: "Asosiy matn", cover: "Muqova rasmi", dean: "Kafedra mudiri", email: "Email", phone: "Telefon", save: "Saqlash", saved: "Saqlandi",
    teachers: "Kafedra o‘qituvchilari", view: "Saytda ko‘rish", upload: "Rasm yuklash", no_access: "Sizga kafedra sahifasini tahrirlash huquqi berilmagan",
  },
  ru: {
    sections: "Мои отделы", latest: "Последние уведомления", none: "Уведомлений нет", open_mail: "Открыть почту", faculty: "Страница кафедры",
    summary: "Краткое описание", content: "Основной текст", cover: "Обложка", dean: "Заведующий кафедрой", email: "Email", phone: "Телефон", save: "Сохранить", saved: "Сохранено",
    teachers: "Преподаватели кафедры", view: "Открыть на сайте", upload: "Загрузить изображение", no_access: "У вас нет права редактировать страницу кафедры",
  },
  en: {
    sections: "My units", latest: "Latest notices", none: "No notices", open_mail: "Open mail", faculty: "Department page",
    summary: "Short description", content: "Main text", cover: "Cover image", dean: "Head of department", email: "Email", phone: "Phone", save: "Save", saved: "Saved",
    teachers: "Department teachers", view: "View on website", upload: "Upload image", no_access: "You have no permission to edit a department page",
  },
};

export function StaffDashboard() {
  const { t, user, me, lang } = usePortal();
  const l = L[lang];
  const [d, setD] = useState<Today | null>(null);
  useEffect(() => {
    portal.today().then(setD).catch(() => null);
  }, []);
  if (!d) return <Spinner />;
  return (
    <div className="a-page">
      <div className="p-hero">
        <div>
          <h1>
            {t.hello}, {user.name}!
          </h1>
          <p>
            {t.today}: {d.date} · {t.weekdays[d.weekday]}
          </p>
        </div>
        <div className="p-hero-meta">
          {user.data?.position && <span>{user.data.position}</span>}
          {(me.sections || []).map((s) => (
            <span key={s}>{s}</span>
          ))}
        </div>
      </div>
      <div className="staff-grid">
        <Card
          title={
            <span className="with-ic">
              <Bell size={16} /> {l.latest}
            </span>
          }
        >
          {d.notices.length === 0 ? (
            <Empty title={l.none} />
          ) : (
            <div className="staff-notices">
              {d.notices.map((n) => (
                <div key={n.id} className="staff-notice">
                  <b>{n.title}</b>
                  <p>{n.body}</p>
                  <small className="muted">
                    {n.author} · {n.created.slice(0, 10)}
                  </small>
                </div>
              ))}
            </div>
          )}
        </Card>
        <Card
          title={
            <span className="with-ic">
              <Users size={16} /> {l.sections}
            </span>
          }
        >
          <div className="pp-tags">
            {(me.sections || []).length ? (me.sections || []).map((s) => <Pill key={s} tone="accent">{s}</Pill>) : <span className="muted">—</span>}
          </div>
          <Link to="/xodim/mail" className="a-btn md" style={{ marginTop: 16 }}>
            <Mail size={15} />
            <span>{l.open_mail}</span>
          </Link>
        </Card>
      </div>
    </div>
  );
}

export function TeacherFaculty() {
  const { me, lang } = usePortal();
  const l = L[lang];
  const toast = useToast();
  const list = me.editable_faculties || [];
  const [fid, setFid] = useState(list[0]?.id || "");
  const [doc, setDoc] = useState<FacultyDoc | null>(null);
  const [teachers, setTeachers] = useState<{ id: string; name: string; position: string; photo: string }[]>([]);
  const [content, setContent] = useState<{ json: JSONContent; html: string; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  useEffect(() => {
    if (!fid) return;
    setDoc(null);
    setContent(null);
    portal
      .faculty(fid)
      .then((r) => {
        setDoc(r.item);
        setTeachers(r.teachers);
      })
      .catch(() => setDoc(null));
  }, [fid]);
  if (!list.length)
    return (
      <div className="a-page narrow">
        <Empty icon={<Landmark size={30} />} title={l.no_access} />
      </div>
    );
  if (!doc) return <Spinner />;
  const set = (p: Partial<FacultyDoc>) => setDoc({ ...doc, ...p });
  const save = async () => {
    setBusy(true);
    try {
      const body: Record<string, unknown> = { summary: doc.summary, cover: doc.cover, dean: doc.dean, email: doc.email, phone: doc.phone };
      if (content) Object.assign(body, { content: content.json, html: content.html, text: content.text });
      const r = await portal.saveFaculty(doc.id, body);
      setDoc(r.item);
      toast(l.saved);
    } catch (e) {
      toast(String((e as { detail?: string }).detail || e), "error");
    }
    setBusy(false);
  };
  return (
    <div className="a-page">
      <div className="a-page-head">
        <div>
          <h1>{doc.title}</h1>
        </div>
        <div className="a-page-actions">
          {list.length > 1 && (
            <select className="a-input" value={fid} onChange={(e) => setFid(e.target.value)}>
              {list.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.title}
                </option>
              ))}
            </select>
          )}
          <a className="a-btn md" href={`/faculties/${doc.slug}`} target="_blank" rel="noreferrer">
            <ExternalLink size={15} />
            <span>{l.view}</span>
          </a>
          <Btn kind="primary" icon={<Save size={15} />} busy={busy} onClick={save}>
            {l.save}
          </Btn>
        </div>
      </div>
      <div className="fac-edit">
        <div className="fac-edit-main">
          <Card title={l.content} pad={false}>
            <div className="fac-editor">
              <RichEditor value={(doc.content as JSONContent) || doc.html || null} onChange={(o) => setContent(o)} minimal />
            </div>
          </Card>
        </div>
        <div className="fac-edit-side">
          <Card title={l.faculty}>
            <div className="a-form-grid one">
              <Field label={l.summary}>
                <Textarea rows={4} value={doc.summary || ""} onChange={(e) => set({ summary: e.target.value })} />
              </Field>
              <Field label={l.cover}>
                <div className="fac-cover">
                  {doc.cover && <img src={doc.cover} alt="" />}
                  <label className="a-btn sm">
                    <ImagePlus size={14} />
                    <span>{uploading ? "…" : l.upload}</span>
                    <input
                      type="file"
                      accept="image/*"
                      hidden
                      onChange={async (e) => {
                        const f = e.target.files?.[0];
                        if (!f) return;
                        setUploading(true);
                        try {
                          const m = await portal.upload(f);
                          set({ cover: m.url });
                        } catch {
                          toast("Upload error", "error");
                        }
                        setUploading(false);
                      }}
                    />
                  </label>
                </div>
              </Field>
              <Field label={l.dean}>
                <Input value={doc.dean || ""} onChange={(e) => set({ dean: e.target.value })} />
              </Field>
              <Field label={l.email}>
                <Input value={doc.email || ""} onChange={(e) => set({ email: e.target.value })} />
              </Field>
              <Field label={l.phone}>
                <Input value={doc.phone || ""} onChange={(e) => set({ phone: e.target.value })} />
              </Field>
            </div>
          </Card>
          <Card title={`${l.teachers} (${teachers.length})`}>
            <div className="fac-teachers">
              {teachers.map((x) => (
                <div key={x.id} className="fac-teacher">
                  {x.photo ? <img src={x.photo} alt="" /> : <span>{x.name.slice(0, 1)}</span>}
                  <div>
                    <b>{x.name}</b>
                    <small>{x.position}</small>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
