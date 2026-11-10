// Eslatmalar (MatDash app-notes): toifa tablari va «Eslatma qo'shish» tugmasi bitta kartada, pastda rangli chiziqli eslatma kartalari.
import { NotebookPen, Pin, PinOff, Plus, Search, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Btn, Empty, Field, Input, Modal, PageHead, Spinner, Textarea, useConfirm, useRun, useToast } from "../../admin/ui";
import type { AppsDict } from "../apps-i18n";
import { notes, type Note, type NoteCat } from "../api";
import { usePortal } from "../PortalApp";
import { fmtDay, useApps } from "./Blog";

const CATS: NoteCat[] = ["study", "personal", "important", "other"];
const catLabel = (c: NoteCat, t: AppsDict) => t[`c_${c}` as keyof AppsDict] as string;
type Draft = { id?: string; title: string; body: string; category: NoteCat; pinned: boolean };

export function NotesPage() {
  const t = useApps();
  const { t: pt, lang } = usePortal();
  const run = useRun();
  const toast = useToast();
  const confirm = useConfirm();
  const [items, setItems] = useState<Note[] | null>(null);
  const [tab, setTab] = useState<NoteCat | "all">("all");
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState<Draft | null>(null);
  const load = () => notes.list().then((r) => setItems(r.items)).catch(() => setItems([]));
  useEffect(() => {
    load();
  }, []);
  const shown = useMemo(() => {
    const s = q.trim().toLocaleLowerCase();
    return (items || []).filter((n) => (tab === "all" || n.category === tab) && (!s || `${n.title} ${n.body}`.toLocaleLowerCase().includes(s)));
  }, [items, tab, q]);
  if (!items) return <Spinner />;
  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!edit) return;
    if (!edit.title.trim() && !edit.body.trim()) return toast(t.empty_note, "error");
    const { id, ...body } = edit;
    const r = await run(() => (id ? notes.update(id, body) : notes.add(body)));
    if (r) {
      setEdit(null);
      load();
    }
  };
  const quick = async (n: Note, patch: Partial<Note>) => {
    await run(() => notes.update(n.id, { ...n, ...patch }));
    load();
  };
  return (
    <div className="a-page nt">
      <PageHead title={pt.notes_app} sub={t.notes_sub} />
      <div className="a-card nt-bar">
        <div className="a-seg">
          <button className={tab === "all" ? "on" : ""} onClick={() => setTab("all")}>
            {t.all_notes}
            <i>{items.length}</i>
          </button>
          {CATS.map((c) => (
            <button key={c} className={`${tab === c ? "on" : ""}`} onClick={() => setTab(c)}>
              <span className={`nt-dot ${c}`} />
              {catLabel(c, t)}
            </button>
          ))}
        </div>
        <label className="a-search nt-search">
          <Search size={16} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.search_notes} aria-label={t.search_notes} />
        </label>
        <Btn kind="primary" icon={<Plus size={16} />} onClick={() => setEdit({ title: "", body: "", category: tab === "all" ? "other" : tab, pinned: false })}>
          {t.add_note}
        </Btn>
      </div>
      {shown.length === 0 ? (
        <div className="a-card">
          <Empty icon={<NotebookPen size={30} />} title={t.no_notes}>
            <p className="a-hint">{t.no_notes_hint}</p>
          </Empty>
        </div>
      ) : (
        <div className="nt-grid">
          {shown.map((n) => (
            <article key={n.id} className={`a-card nt-card ${n.category}`}>
              <button className="nt-open" onClick={() => setEdit({ id: n.id, title: n.title, body: n.body, category: n.category, pinned: n.pinned })}>
                <h3>{n.title || n.body.split("\n")[0].slice(0, 60)}</h3>
                <small>{fmtDay(n.updated, lang)}</small>
                <p>{n.body}</p>
              </button>
              <footer>
                <span className={`nt-chip ${n.category}`}>{catLabel(n.category, t)}</span>
                <span className="nt-tools">
                  <button className={`a-icon ${n.pinned ? "on" : ""}`} onClick={() => quick(n, { pinned: !n.pinned })} title={n.pinned ? t.unpin : t.pin} aria-label={n.pinned ? t.unpin : t.pin}>
                    {n.pinned ? <PinOff size={15} /> : <Pin size={15} />}
                  </button>
                  <button
                    className="a-icon danger"
                    title={t.delete}
                    aria-label={t.delete}
                    onClick={async () => {
                      if (await confirm(t.delete_note_q)) {
                        await run(() => notes.remove(n.id));
                        load();
                      }
                    }}
                  >
                    <Trash2 size={15} />
                  </button>
                </span>
                <i className={`nt-sq ${n.category}`} aria-hidden />
              </footer>
            </article>
          ))}
        </div>
      )}
      <Modal
        open={!!edit}
        onClose={() => setEdit(null)}
        title={edit?.id ? t.edit_note : t.new_note}
        footer={
          <>
            <Btn onClick={() => setEdit(null)}>{t.cancel}</Btn>
            <button className="a-btn primary" type="submit" form="nt-form">
              <span>{t.save}</span>
            </button>
          </>
        }
      >
        {edit && (
          <form id="nt-form" className="nt-form" onSubmit={save}>
            <Field label={t.title}>
              <Input value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} placeholder={t.note_title_ph} maxLength={200} autoFocus />
            </Field>
            <Field label={t.note}>
              <Textarea value={edit.body} onChange={(e) => setEdit({ ...edit, body: e.target.value })} placeholder={t.note_body_ph} rows={9} maxLength={20000} />
            </Field>
            <div className="a-field">
              <span className="a-label">{t.category}</span>
              <div className="nt-cats">
                {CATS.map((c) => (
                  <button type="button" key={c} className={`${c} ${edit.category === c ? "on" : ""}`} onClick={() => setEdit({ ...edit, category: c })}>
                    <span className={`nt-dot ${c}`} /> {catLabel(c, t)}
                  </button>
                ))}
              </div>
            </div>
            <label className="nt-pin">
              <input type="checkbox" checked={edit.pinned} onChange={(e) => setEdit({ ...edit, pinned: e.target.checked })} /> {t.pin}
            </label>
          </form>
        )}
      </Modal>
    </div>
  );
}
