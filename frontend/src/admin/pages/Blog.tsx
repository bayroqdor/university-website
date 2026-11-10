// Admin: ichki blog moderatsiyasi — blogni / izohlarni umuman yoqish-o'chirish, yozuvni yashirish, mahkamlash,
// bitta yozuvda izohlarni yopish, izohlarni yashirish va o'chirish.
import { Eye, EyeOff, Lock, LockOpen, MessageCircle, MessagesSquare, Newspaper, Pin, PinOff, Trash2, Users } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Avatar } from "../../lib/Avatar";
import { RichHtml } from "../../rich/RichHtml";
import { req } from "../../lib/api";
import type { BlogAuthor, BlogComment, BlogPost, BlogPostFull, BlogSettings } from "../../portal/api";
import { Btn, Card, Empty, Modal, PageHead, Pill, Spinner, Toggle, fmtDateTime, useConfirm, useRun } from "../ui";

type Stats = { posts: number; hidden: number; comments: number; authors: number };
type AdminComment = BlogComment & { post_title?: string };

const api = {
  list: (q = "") => req<{ items: BlogPost[]; settings: BlogSettings; stats: Stats }>("GET", `/api/admin/blog${q ? `?q=${encodeURIComponent(q)}` : ""}`),
  get: (id: string) => req<BlogPostFull>("GET", `/api/admin/blog/${id}`),
  settings: (d: Partial<BlogSettings>) => req<BlogSettings>("PUT", "/api/admin/blog/settings", d),
  moderate: (id: string, d: { status?: string; pinned?: boolean; comments_locked?: boolean }) => req<BlogPost>("PUT", `/api/admin/blog/${id}`, d),
  remove: (id: string) => req<{ ok: boolean }>("DELETE", `/api/admin/blog/${id}`),
  comments: () => req<{ items: AdminComment[] }>("GET", "/api/admin/blog/comments"),
  hideComment: (id: string, hidden: boolean) => req<{ ok: boolean }>("PUT", `/api/admin/blog/comments/${id}`, { hidden }),
  removeComment: (id: string) => req<{ ok: boolean }>("DELETE", `/api/admin/blog/comments/${id}`),
};

function who(a: BlogAuthor): [string, string] {
  const role = a.role === "student" ? "Talaba" : a.role === "teacher" ? "Professor-o‘qituvchi" : "Xodim";
  const rest = a.role === "student" ? [a.group, a.course ? `${a.course}` : "", a.faculty] : [a.position, a.faculty];
  return [role, rest.filter(Boolean).join(" · ")];
}

function Author({ a }: { a: BlogAuthor }) {
  return (
    <span className="ab-author">
      <Avatar name={a.name} photo={a.photo} size={36} />
      <span>
        <b>{a.name}</b>
        <small>
          {who(a)[0]}
          {who(a)[1] && ` · ${who(a)[1]}`}
        </small>
      </span>
    </span>
  );
}

export function BlogAdminPage() {
  const run = useRun();
  const confirm = useConfirm();
  const [tab, setTab] = useState<"posts" | "comments">("posts");
  const [data, setData] = useState<Awaited<ReturnType<typeof api.list>> | null>(null);
  const [comments, setComments] = useState<AdminComment[] | null>(null);
  const [view, setView] = useState<BlogPostFull | null>(null);
  const load = useCallback(() => {
    api.list().then(setData).catch(() => null);
    api.comments().then((r) => setComments(r.items)).catch(() => null);
  }, []);
  useEffect(load, [load]);
  if (!data) return <Spinner />;
  const s = data.settings;
  const mod = async (p: BlogPost, d: Parameters<typeof api.moderate>[1]) => {
    await run(() => api.moderate(p.id, d), "Saqlandi");
    load();
    if (view?.id === p.id) api.get(p.id).then(setView);
  };
  const delPost = async (p: BlogPost) => {
    if (await confirm(`«${p.title}» yozuvi va uning izohlari o‘chirilsinmi?`)) {
      await run(() => api.remove(p.id), "O‘chirildi");
      setView(null);
      load();
    }
  };
  const hideC = async (c: AdminComment) => {
    await run(() => api.hideComment(c.id, !c.hidden));
    load();
    if (view) api.get(view.id).then(setView);
  };
  const delC = async (c: AdminComment) => {
    if (await confirm("Izoh o‘chirilsinmi?")) {
      await run(() => api.removeComment(c.id), "O‘chirildi");
      load();
      if (view) api.get(view.id).then(setView);
    }
  };
  return (
    <div className="a-page ab">
      <PageHead title="Blog" sub="Talaba va professor-o‘qituvchilarning ichki blogi: faqat kabinetga kirganlar ko‘radi. Bu yerda yozuv va izohlar nazorat qilinadi." />
      <div className="kpis ab-kpis">
        {(
          [
            [<Newspaper key="p" size={20} />, data.stats.posts, "Yozuvlar"],
            [<EyeOff key="h" size={20} />, data.stats.hidden, "Yashirilgan"],
            [<MessagesSquare key="c" size={20} />, data.stats.comments, "Izohlar"],
            [<Users key="a" size={20} />, data.stats.authors, "Mualliflar"],
          ] as const
        ).map(([ic, v, l]) => (
          <div key={l} className="kpi">
            <div className="kpi-top">
              <span className="kpi-ic">{ic}</span>
            </div>
            <div className="kpi-v">{v}</div>
            <div className="kpi-l">{l}</div>
          </div>
        ))}
      </div>
      <Card title="Sozlamalar" sub="Umumiy qoidalar — barcha yozuvlarga birdaniga ta’sir qiladi">
        <div className="a-grid2">
          <Toggle
            checked={s.enabled}
            onChange={async (v) => {
              await run(() => api.settings({ enabled: v }), "Saqlandi");
              load();
            }}
            label="Blog yoqilgan"
            hint="O‘chirilsa, kabinetlarda blog bo‘limi «vaqtincha o‘chirilgan» deb ko‘rinadi"
          />
          <Toggle
            checked={s.comments}
            onChange={async (v) => {
              await run(() => api.settings({ comments: v }), "Saqlandi");
              load();
            }}
            label="Izoh yozishga ruxsat"
            hint="O‘chirilsa, hech bir yozuvga izoh yozib bo‘lmaydi (eski izohlar ko‘rinib turadi)"
          />
        </div>
      </Card>
      <div className="a-tabs">
        <button className={tab === "posts" ? "on" : ""} onClick={() => setTab("posts")}>
          Yozuvlar ({data.items.length})
        </button>
        <button className={tab === "comments" ? "on" : ""} onClick={() => setTab("comments")}>
          So‘nggi izohlar ({comments?.length ?? 0})
        </button>
      </div>
      {tab === "posts" ? (
        <Card pad={false}>
          {data.items.length === 0 ? (
            <Empty icon={<Newspaper size={28} />} title="Hali yozuvlar yo‘q" />
          ) : (
            <div className="a-table-scroll">
              <table className="a-table">
                <thead>
                  <tr>
                    <th>Yozuv</th>
                    <th>Muallif</th>
                    <th className="n">Ko‘rish</th>
                    <th className="n">Izoh</th>
                    <th>Holat</th>
                    <th className="actions" />
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <button className="ab-title" onClick={() => api.get(p.id).then(setView)}>
                          <b>{p.title}</b>
                          <small>{fmtDateTime(p.created)}</small>
                        </button>
                      </td>
                      <td>
                        <Author a={p.author} />
                      </td>
                      <td className="n">{p.views}</td>
                      <td className="n">{p.comments}</td>
                      <td>
                        <span className="ab-pills">
                          {p.status === "hidden" ? <Pill tone="bad">Yashirilgan</Pill> : <Pill tone="ok">Nashrda</Pill>}
                          {p.pinned && <Pill tone="accent">Mahkamlangan</Pill>}
                          {p.comments_locked ? <Pill tone="warn">Izoh yopilgan</Pill> : !p.comments_enabled && <Pill>Muallif izohni o‘chirgan</Pill>}
                        </span>
                      </td>
                      <td className="actions">
                        <button className="a-icon" title={p.pinned ? "Mahkamlashni olib tashlash" : "Yuqoriga mahkamlash"} onClick={() => mod(p, { pinned: !p.pinned })}>
                          {p.pinned ? <PinOff size={16} /> : <Pin size={16} />}
                        </button>
                        <button className="a-icon" title={p.comments_locked ? "Izohlarni ochish" : "Bu yozuvda izohlarni yopish"} onClick={() => mod(p, { comments_locked: !p.comments_locked })}>
                          {p.comments_locked ? <LockOpen size={16} /> : <Lock size={16} />}
                        </button>
                        <button className="a-icon" title={p.status === "hidden" ? "Ko‘rsatish" : "Yashirish"} onClick={() => mod(p, { status: p.status === "hidden" ? "published" : "hidden" })}>
                          {p.status === "hidden" ? <Eye size={16} /> : <EyeOff size={16} />}
                        </button>
                        <button className="a-icon danger" title="O‘chirish" onClick={() => delPost(p)}>
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ) : (
        <Card pad={false}>
          {!comments?.length ? (
            <Empty icon={<MessageCircle size={28} />} title="Izohlar yo‘q" />
          ) : (
            <ul className="ab-comments">
              {comments.map((c) => (
                <li key={c.id} className={c.hidden ? "off" : ""}>
                  <Author a={c.author} />
                  <div className="ab-c-body">
                    <small>
                      «{c.post_title || "—"}» · {fmtDateTime(c.created)} {c.hidden && <Pill tone="bad">Yashirilgan</Pill>}
                    </small>
                    <p>{c.body}</p>
                  </div>
                  <span className="ab-c-act">
                    <button className="a-icon" title={c.hidden ? "Ko‘rsatish" : "Yashirish"} onClick={() => hideC(c)}>
                      {c.hidden ? <Eye size={16} /> : <EyeOff size={16} />}
                    </button>
                    <button className="a-icon danger" title="O‘chirish" onClick={() => delC(c)}>
                      <Trash2 size={16} />
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
      <Modal
        open={!!view}
        onClose={() => setView(null)}
        title={view?.title || ""}
        width={820}
        footer={
          view && (
            <>
              <Btn kind="danger" icon={<Trash2 size={15} />} onClick={() => delPost(view)}>
                O‘chirish
              </Btn>
              <Btn icon={view.comments_locked ? <LockOpen size={15} /> : <Lock size={15} />} onClick={() => mod(view, { comments_locked: !view.comments_locked })}>
                {view.comments_locked ? "Izohlarni ochish" : "Izohlarni yopish"}
              </Btn>
              <Btn kind="primary" icon={view.status === "hidden" ? <Eye size={15} /> : <EyeOff size={15} />} onClick={() => mod(view, { status: view.status === "hidden" ? "published" : "hidden" })}>
                {view.status === "hidden" ? "Ko‘rsatish" : "Yashirish"}
              </Btn>
            </>
          )
        }
      >
        {view && (
          <div className="ab-view">
            <Author a={view.author} />
            {view.cover && <img className="ab-cover" src={view.cover} alt="" />}
            {view.doc ? <RichHtml doc={view.doc as never} /> : <div className="prose" dangerouslySetInnerHTML={{ __html: view.body }} />}
            <h4>Izohlar ({view.comment_list.length})</h4>
            {view.comment_list.length === 0 && <p className="a-hint">Izoh yo‘q</p>}
            <ul className="ab-comments">
              {view.comment_list.map((c) => (
                <li key={c.id} className={c.hidden ? "off" : ""}>
                  <Author a={c.author} />
                  <div className="ab-c-body">
                    <small>
                      {fmtDateTime(c.created)} {c.hidden && <Pill tone="bad">Yashirilgan</Pill>}
                    </small>
                    <p>{c.body}</p>
                  </div>
                  <span className="ab-c-act">
                    <button className="a-icon" title={c.hidden ? "Ko‘rsatish" : "Yashirish"} onClick={() => hideC(c)}>
                      {c.hidden ? <Eye size={16} /> : <EyeOff size={16} />}
                    </button>
                    <button className="a-icon danger" title="O‘chirish" onClick={() => delC(c)}>
                      <Trash2 size={16} />
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Modal>
    </div>
  );
}
