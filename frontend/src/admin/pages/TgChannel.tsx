// Admin → Telegram kanal: postlar ro'yxati, post osti matni va Telegram ko'rinishidagi muharrir (yozish, rejalashtirish, yuborish,
// yuborilgan xabarni tahrirlash, o'chirish).
import type { JSONContent } from "@tiptap/core";
import { ArrowLeft, ExternalLink, FileText, Film, ImagePlus, Images, MessageSquareText, Plus, RotateCcw, Send, Trash2, Upload, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ApiError } from "../../lib/api";
import { admin, errMsg, type TgButton, type TgMedia, type TgPost, type TgPostBody, type TgPostsInfo } from "../api";
import { TgEditor } from "../tg/TgEditor";
import { TgPreview } from "../tg/TgPreview";
import { composeTg, tgLength, tgPlain } from "../tg/tghtml";
import { Btn, Card, Empty, Input, MediaLibrary, Modal, PageHead, Spinner, Toggle, fmtDateTime, useConfirm, useRun, useToast } from "../ui";
import "../../styles/tgchannel.css";

const STATUS: Record<string, string> = { draft: "Qoralama", scheduled: "Rejalashtirilgan", sending: "Yuborilmoqda", sent: "Yuborilgan", partial: "Qisman yuborilgan", error: "Xato" };
const CHAT_STATUS: Record<string, string> = { pending: "Yuborilmagan", sent: "Yuborilgan", error: "Xato", deleted: "O‘chirilgan" };
const KIND_LABEL: Record<string, string> = { text: "matnli xabar", photo: "rasm", video: "video", document: "fayl", album: "albom" };

const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
const toLocalInput = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

function mediaType(mime: string, url: string): TgMedia["type"] {
  if (mime.startsWith("image/") || /\.(png|jpe?g|webp|gif)$/i.test(url)) return "photo";
  if (mime === "video/mp4" || /\.mp4$/i.test(url)) return "video";
  return "document";
}

/* ================================================================== ro'yxat */
export function TgPostsPage() {
  const nav = useNavigate();
  const toast = useToast();
  const [info, setInfo] = useState<TgPostsInfo | null>(null);
  useEffect(() => {
    admin
      .tgPosts()
      .then(setInfo)
      .catch((e) => toast(errMsg(e), "error"));
  }, [toast]);
  if (!info) return <Spinner />;
  return (
    <div className="a-page">
      <PageHead
        title="Telegram kanal"
        actions={
          <Btn kind="primary" icon={<Plus size={15} />} onClick={() => nav("/admin/telegram/posts/new")} disabled={!info.enabled}>
            Yangi post
          </Btn>
        }
      />
      {!info.enabled && (
        <Card>
          <Empty title="Telegram bot ulanmagan">
            <Link className="a-btn sm" to="/admin/telegram">
              <Send size={14} /> <span>Telegram bot</span>
            </Link>
          </Empty>
        </Card>
      )}
      <div className="tgc-list-grid">
        <Card title="Postlar" pad={false}>
          {info.posts.length ? (
            <div className="tgc-posts">
              {info.posts.map((p) => (
                <PostRow key={p.id} p={p} onOpen={() => nav(`/admin/telegram/posts/${p.id}`)} />
              ))}
            </div>
          ) : (
            <div className="tgc-empty">
              <Empty title="Hali post yo‘q" />
            </div>
          )}
        </Card>
        <FooterCard info={info} onChange={(footer) => setInfo({ ...info, footer })} />
      </div>
    </div>
  );
}

function PostRow({ p, onOpen }: { p: TgPost; onOpen: () => void }) {
  const m = p.media[0];
  const text = tgPlain(p.html).replace(/\s+/g, " ").trim();
  const when = p.status === "scheduled" ? p.scheduled_at : p.sent_at || p.updated;
  const bad = p.status === "error" || p.status === "partial" || p.chats.some((c) => c.error);
  return (
    <button type="button" className="tgc-post" onClick={onOpen}>
      <span className="tgc-thumb">
        {m?.type === "photo" ? <img src={m.url} alt="" loading="lazy" /> : m?.type === "video" ? <Film size={20} /> : m ? <FileText size={20} /> : <MessageSquareText size={20} />}
        {p.media.length > 1 && <i>{p.media.length}</i>}
      </span>
      <span className="tgc-post-main">
        <b data-no-tr="">{text || (m ? m.name || m.url.split("/").pop() : "—")}</b>
        <span className="tgc-post-meta">
          <span className={bad ? "bad" : p.status === "sent" ? "ok" : ""}>{STATUS[p.status] || p.status}</span>
          <span>{fmtDateTime(when)}</span>
          {p.chats.length > 0 && <span data-no-tr="">{p.chats.map((c) => c.title).join(", ")}</span>}
        </span>
      </span>
    </button>
  );
}

function FooterCard({ info, onChange }: { info: TgPostsInfo; onChange: (f: TgPostsInfo["footer"]) => void }) {
  const run = useRun();
  const [html, setHtml] = useState(info.footer.html);
  const [ver, setVer] = useState(0);
  const [busy, setBusy] = useState("");
  const len = tgLength(html);
  const save = async (reset: boolean) => {
    setBusy(reset ? "reset" : "save");
    const r = await run(() => admin.tgFooter(reset ? { reset: true } : { html }), "Saqlandi");
    if (r) {
      onChange(r.footer);
      setHtml(r.footer.html);
      if (reset) setVer((v) => v + 1);
    }
    setBusy("");
  };
  return (
    <Card title="Post osti matni">
      <TgEditor
        key={ver}
        initialHtml={info.footer.html}
        blocks={false}
        compact
        label="Post osti matni"
        onChange={(h) => setHtml(h)}
        footer={<div className={`tgc-count ${len > info.limits.footer ? "over" : ""}`}>{len} / {info.limits.footer}</div>}
      />
      <div className="a-row">
        <Btn kind="primary" busy={busy === "save"} disabled={len > info.limits.footer || html === info.footer.html} onClick={() => save(false)}>
          Saqlash
        </Btn>
        {info.footer.custom && (
          <Btn kind="ghost" icon={<RotateCcw size={14} />} busy={busy === "reset"} onClick={() => save(true)}>
            Standart
          </Btn>
        )}
      </div>
    </Card>
  );
}

/* ================================================================== muharrir */
interface Form {
  html: string;
  doc: JSONContent | null;
  media: TgMedia[];
  buttons: TgButton[][];
  targets: string[];
  footer: boolean;
  silent: boolean;
  preview: boolean;
  schedOn: boolean;
  schedAt: string;
}

const formOf = (p: TgPost): Form => ({
  html: p.html,
  doc: (p.doc as JSONContent) || null,
  media: p.media,
  buttons: p.buttons,
  targets: p.targets,
  footer: p.footer,
  silent: p.silent,
  preview: p.preview,
  schedOn: p.status === "scheduled",
  schedAt: toLocalInput(p.scheduled_at),
});

const bodyOf = (f: Form, action: TgPostBody["action"]): TgPostBody => ({
  html: f.html,
  doc: f.doc as Record<string, unknown> | null,
  media: f.media,
  buttons: f.buttons.map((r) => r.filter((b) => b.text.trim() || b.url.trim())).filter((r) => r.length),
  targets: f.targets,
  footer: f.footer,
  silent: f.silent,
  preview: f.preview,
  scheduled_at: f.schedOn && f.schedAt ? new Date(f.schedAt).toISOString() : null,
  action,
});

const sig = (f: Form) => JSON.stringify(bodyOf(f, "draft"));

export function TgComposerPage() {
  const { id = "new" } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const [info, setInfo] = useState<TgPostsInfo | null>(null);
  const [post, setPost] = useState<TgPost | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [saved, setSaved] = useState("");
  const [busy, setBusy] = useState("");
  const [lib, setLib] = useState(false);
  const [incompat, setIncompat] = useState<{ chat_id: string; title: string; from: string; to: string }[] | null>(null);
  const [delOld, setDelOld] = useState(true);
  const [delFail, setDelFail] = useState<{ chat_id: string; title: string; error: string }[] | null>(null);
  const [now, setNow] = useState(() => new Date());
  const file = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 30000);
    return () => window.clearInterval(t);
  }, []);
  useEffect(() => {
    let off = false;
    (async () => {
      try {
        const i = await admin.tgPosts();
        if (off) return;
        setInfo(i);
        if (id === "new") {
          const f: Form = { html: "", doc: null, media: [], buttons: [], targets: i.groups.filter((g) => g.type === "channel").map((g) => g.chat_id), footer: true, silent: false, preview: false, schedOn: false, schedAt: "" };
          setPost(null);
          setForm(f);
          setSaved(sig(f));
        } else {
          const r = await admin.tgPost(id);
          if (off) return;
          setPost(r.post);
          setForm(formOf(r.post));
          setSaved(sig(formOf(r.post)));
        }
      } catch (e) {
        toast(errMsg(e), "error");
      }
    })();
    return () => {
      off = true;
    };
  }, [id, toast]);

  const set = useCallback((patch: Partial<Form>) => setForm((f) => (f ? { ...f, ...patch } : f)), []);
  const final = useMemo(() => (form && info ? composeTg(form.html, info.footer.html, form.footer) : ""), [form, info]);
  if (!info || !form) return <Spinner />;

  const sentChats = post?.chats.filter((c) => c.status === "sent") || [];
  const isSent = sentChats.length > 0;
  const limit = form.media.length ? info.limits.caption : info.limits.text;
  const len = tgLength(final);
  const over = len > limit;
  const empty = !len && !form.media.length;
  const album = form.media.length > 1;
  const dirty = sig(form) !== saved;
  const previewChat = info.groups.find((g) => form.targets.includes(g.chat_id)) || info.groups[0];
  const sendTime = form.schedOn && form.schedAt ? new Date(form.schedAt) : post?.sent_at ? new Date(post.sent_at) : now;

  const addMedia = (list: TgMedia[]) => {
    const all = [...form.media, ...list];
    if (all.length > info.limits.album) return toast(errMsg({ detail: "telegram_album_max" }), "error");
    if (all.length > 1 && all.some((m) => m.type === "document")) return toast(errMsg({ detail: "telegram_album_types" }), "error");
    set({ media: all, ...(all.length > 1 ? { buttons: [] } : {}) });
  };
  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy("upload");
    const out: TgMedia[] = [];
    for (const f of Array.from(files)) {
      try {
        const m = await admin.upload(f);
        out.push({ url: m.url, type: mediaType(m.mime, m.url), name: m.original, size: m.size });
      } catch (e) {
        toast(errMsg(e), "error");
      }
    }
    if (out.length) addMedia(out);
    setBusy("");
    if (file.current) file.current.value = "";
  };

  const afterSave = (p: TgPost, msg?: string) => {
    setPost(p);
    const f = formOf(p);
    setForm((cur) => (cur ? { ...f, doc: cur.doc, html: cur.html } : f));
    setSaved(sig({ ...f, doc: form.doc, html: form.html }));
    if (msg) toast(msg);
    if (id === "new") nav(`/admin/telegram/posts/${p.id}`, { replace: true });
  };
  const submit = async (action: "draft" | "send" | "schedule") => {
    setBusy(action);
    try {
      const body = bodyOf(form, action);
      const r = post ? await admin.tgPostUpdate(post.id, body) : await admin.tgPostCreate(body);
      const failed = (r.send?.failed || 0) + (r.edit?.failed || 0);
      const msg = r.edit
        ? failed
          ? `Tahrirlandi: ${r.edit.edited}, xato: ${failed}`
          : r.send?.sent
            ? `Telegram’da tahrirlandi, yangi chatlarga yuborildi: ${r.send.sent}`
            : "Telegram’da tahrirlandi"
        : r.send
          ? failed
            ? `Yuborildi: ${r.send.sent}, xato: ${failed}`
            : "Yuborildi"
          : action === "schedule"
            ? "Rejalashtirildi"
            : "Saqlandi";
      afterSave(r.post, failed ? undefined : msg);
      if (failed) toast(msg, "error");
    } catch (e) {
      const p = e instanceof ApiError ? (e.body as { code?: string; chats?: never[] } | undefined) : undefined;
      if (p?.code === "telegram_edit_incompatible") setIncompat(p.chats || []);
      else toast(errMsg(e), "error");
    }
    setBusy("");
  };
  const resend = async () => {
    if (!post) return;
    setBusy("resend");
    try {
      const r = await admin.tgPostResend(post.id, { ...bodyOf(form, "send"), delete_old: delOld });
      setIncompat(null);
      afterSave(r.post, r.send?.failed ? undefined : "Yangi xabar sifatida yuborildi");
      if (r.send?.failed) toast(`Yuborildi: ${r.send.sent}, xato: ${r.send.failed}`, "error");
      if (r.delete_failed?.length) toast(`Eski xabar o‘chirilmadi: ${r.delete_failed.map((x) => x.title).join(", ")}`, "error");
    } catch (e) {
      toast(errMsg(e), "error");
    }
    setBusy("");
  };
  const remove = async (force = false) => {
    if (!post) return nav("/admin/telegram/posts");
    if (!force && !(await confirm(isSent ? "Post Telegram’dan va ro‘yxatdan o‘chirilsinmi?" : "Post o‘chirilsinmi?"))) return;
    setBusy("delete");
    try {
      await admin.tgPostDelete(post.id, force);
      toast("O‘chirildi");
      nav("/admin/telegram/posts");
    } catch (e) {
      const p = e instanceof ApiError ? (e.body as { code?: string; chats?: never[] } | undefined) : undefined;
      if (p?.code === "telegram_delete_failed") setDelFail(p.chats || []);
      else toast(errMsg(e), "error");
    }
    setBusy("");
  };

  const blocked = over || empty || !form.targets.length || !info.enabled;
  const scheduled = post?.status === "scheduled";
  const actions = (
    <>
      <Btn kind="ghost" icon={<ArrowLeft size={15} />} onClick={() => nav("/admin/telegram/posts")}>
        Postlar
      </Btn>
      {post && (
        <Btn kind="ghost" icon={<Trash2 size={15} />} busy={busy === "delete"} onClick={() => remove()}>
          O‘chirish
        </Btn>
      )}
      {isSent ? (
        <Btn kind="primary" icon={<Send size={15} />} busy={busy === "send"} disabled={blocked || !dirty || post?.status === "sending"} onClick={() => submit("send")}>
          Saqlash
        </Btn>
      ) : (
        <>
          <Btn busy={busy === "draft"} disabled={!dirty && !!post && !scheduled} onClick={() => submit("draft")}>
            {scheduled ? "Rejani bekor qilish" : "Qoralama"}
          </Btn>
          {form.schedOn ? (
            <Btn kind="primary" icon={<Send size={15} />} busy={busy === "schedule"} disabled={blocked || !form.schedAt || (scheduled && !dirty)} onClick={() => submit("schedule")}>
              {scheduled ? "Saqlash" : "Rejalashtirish"}
            </Btn>
          ) : (
            <Btn kind="primary" icon={<Send size={15} />} busy={busy === "send"} disabled={blocked} onClick={() => submit("send")}>
              Yuborish
            </Btn>
          )}
        </>
      )}
    </>
  );

  return (
    <div className="a-page tgc">
      <PageHead title={post ? (isSent ? "Postni tahrirlash" : "Post") : "Yangi post"} actions={actions} />
      <div className="tgc-grid">
        <div className="tgc-col">
          <Card title="Matn">
            <TgEditor
              key={post?.id || "new"}
              initialDoc={form.doc}
              initialHtml={form.html}
              placeholder="Xabar matni…"
              onChange={(html, doc) => set({ html, doc })}
              footer={
                <div className={`tgc-count ${over ? "over" : ""}`} aria-live="polite">
                  {len} / {limit}
                </div>
              }
            />
          </Card>
          <Card title="Media" actions={<span className="tgc-n">{form.media.length} / {info.limits.album}</span>}>
            {form.media.length > 0 && (
              <div className="tgc-media">
                {form.media.map((m, i) => (
                  <div key={m.url + i} className="tgc-m">
                    {m.type === "photo" ? <img src={m.url} alt="" /> : m.type === "video" ? <video src={m.url} muted preload="metadata" /> : <span className="tgc-m-doc"><FileText size={20} /><small data-no-tr="">{m.name || m.url.split("/").pop()}</small></span>}
                    <span className="tgc-m-tools">
                      {i > 0 && (
                        <button type="button" title="Oldinga" aria-label="Oldinga" onClick={() => set({ media: [...form.media.slice(0, i - 1), m, form.media[i - 1], ...form.media.slice(i + 1)] })}>
                          <ArrowLeft size={14} />
                        </button>
                      )}
                      <button type="button" title="Olib tashlash" aria-label="Olib tashlash" onClick={() => set({ media: form.media.filter((_, k) => k !== i) })}>
                        <X size={14} />
                      </button>
                    </span>
                    {m.type === "video" && <Film size={14} className="tgc-m-kind" />}
                  </div>
                ))}
              </div>
            )}
            <div className="a-row">
              <Btn icon={<Upload size={15} />} busy={busy === "upload"} disabled={form.media.length >= info.limits.album || form.media[0]?.type === "document"} onClick={() => file.current?.click()}>
                Yuklash
              </Btn>
              <Btn icon={form.media.length ? <Images size={15} /> : <ImagePlus size={15} />} disabled={form.media.length >= info.limits.album || form.media[0]?.type === "document"} onClick={() => setLib(true)}>
                Media kutubxona
              </Btn>
              <input ref={file} type="file" hidden multiple accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,application/pdf,.docx,.xlsx,.pptx" onChange={(e) => upload(e.target.files)} />
            </div>
          </Card>
          <Card title="Tugmalar">
            <ButtonsEditor rows={form.buttons} disabled={album} onChange={(buttons) => set({ buttons })} />
          </Card>
          <Card title="Yuborish">
            <div className="a-label">Kanal va guruhlar</div>
            {info.groups.length ? (
              <div className="tgc-targets">
                {info.groups.map((g) => {
                  const locked = sentChats.some((c) => c.chat_id === g.chat_id);
                  return (
                    <label key={g.chat_id} className="chk">
                      <input
                        type="checkbox"
                        checked={form.targets.includes(g.chat_id)}
                        disabled={locked}
                        onChange={(e) => set({ targets: e.target.checked ? [...form.targets, g.chat_id] : form.targets.filter((x) => x !== g.chat_id) })}
                      />
                      <span data-no-tr="">{g.title || g.chat_id}</span>
                      <small>{g.type === "channel" ? "kanal" : "guruh"}</small>
                    </label>
                  );
                })}
              </div>
            ) : (
              <Empty title="Tasdiqlangan kanal yoki guruh yo‘q">
                <Link className="a-btn sm" to="/admin/telegram">
                  <Send size={14} /> <span>Guruh va kanallar</span>
                </Link>
              </Empty>
            )}
            <div className="tgc-toggles">
              <Toggle checked={form.footer} onChange={(v) => set({ footer: v })} label="Post osti matni" />
              <Toggle checked={form.silent} onChange={(v) => set({ silent: v })} label="Ovozsiz yuborish" />
              {!form.media.length && <Toggle checked={form.preview} onChange={(v) => set({ preview: v })} label="Havola ko‘rinishi" />}
              {!isSent && <Toggle checked={form.schedOn} onChange={(v) => set({ schedOn: v })} label="Keyinroq yuborish" />}
            </div>
            {form.schedOn && !isSent && (
              <div className="tgc-sched">
                <Input type="datetime-local" value={form.schedAt} min={toLocalInput(new Date().toISOString())} onChange={(e) => set({ schedAt: e.target.value })} required aria-label="Yuborish vaqti" />
              </div>
            )}
          </Card>
          {post && post.chats.length > 0 && (
            <Card title="Holat" pad={false}>
              <div className="tgc-chats">
                {post.chats.map((c) => (
                  <div key={c.chat_id} className="tgc-chat">
                    <div className="tgc-chat-main">
                      <b data-no-tr="">{c.title}</b>
                      <span className="tgc-chat-meta">
                        <span className={c.status === "error" ? "bad" : c.status === "sent" ? "ok" : ""}>{CHAT_STATUS[c.status] || c.status}</span>
                        {c.sent_at && <span>{fmtDateTime(c.sent_at)}</span>}
                        {c.edited_at && <span>tahrirlangan {fmtDateTime(c.edited_at)}</span>}
                        {c.message_ids.length > 0 && <span className="mono">#{c.message_ids.join(", #")}</span>}
                      </span>
                      {c.error && <span className="tgc-chat-err">{c.error}</span>}
                    </div>
                    {c.link && c.status === "sent" && (
                      <a className="a-btn sm ghost" href={c.link} target="_blank" rel="noreferrer" title="Telegram’da ochish" aria-label="Telegram’da ochish">
                        <ExternalLink size={14} />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
        <div className="tgc-side">
          <TgPreview
            html={final}
            media={form.media}
            buttons={album ? [] : form.buttons.map((r) => r.filter((b) => b.text.trim() || b.url.trim())).filter((r) => r.length)}
            chatTitle={previewChat?.title || "Kanal"}
            chatType={previewChat?.type || "channel"}
            linkPreview={form.preview}
            time={hhmm(sendTime)}
            edited={isSent && sentChats.some((c) => c.edited_at)}
          />
        </div>
      </div>
      <MediaLibrary
        open={lib}
        onClose={() => setLib(false)}
        accept="any"
        onPick={(m) => addMedia([{ url: m.url, type: mediaType(m.mime, m.url), name: m.original, size: m.size }])}
      />
      <Modal
        open={!!incompat}
        onClose={() => setIncompat(null)}
        title="Telegram bu xabarni bunday tahrirlay olmaydi"
        footer={
          <>
            <Btn onClick={() => setIncompat(null)}>Bekor qilish</Btn>
            <Btn kind="primary" icon={<Send size={15} />} busy={busy === "resend"} onClick={resend}>
              Yangi xabar sifatida yuborish
            </Btn>
          </>
        }
      >
        <div className="tgc-modal-list">
          {(incompat || []).map((c) => (
            <div key={c.chat_id}>
              <b data-no-tr="">{c.title}</b>
              <span>
                {KIND_LABEL[c.from] || c.from} → {KIND_LABEL[c.to] || c.to}
              </span>
            </div>
          ))}
        </div>
        <Toggle checked={delOld} onChange={setDelOld} label="Eski xabarni o‘chirish" />
      </Modal>
      <Modal
        open={!!delFail}
        onClose={() => setDelFail(null)}
        title="Telegram xabarni o‘chirmadi"
        footer={
          <>
            <Btn onClick={() => setDelFail(null)}>Yopish</Btn>
            <Btn
              kind="danger"
              busy={busy === "delete"}
              onClick={async () => {
                setDelFail(null);
                await remove(true);
              }}
            >
              Faqat ro‘yxatdan o‘chirish
            </Btn>
          </>
        }
      >
        <div className="tgc-modal-list">
          {(delFail || []).map((c) => (
            <div key={c.chat_id}>
              <b data-no-tr="">{c.title}</b>
              <span className="bad">{c.error}</span>
            </div>
          ))}
        </div>
      </Modal>
    </div>
  );
}

function ButtonsEditor({ rows, onChange, disabled }: { rows: TgButton[][]; onChange: (r: TgButton[][]) => void; disabled: boolean }) {
  const setBtn = (r: number, k: number, patch: Partial<TgButton>) => onChange(rows.map((row, i) => (i === r ? row.map((b, j) => (j === k ? { ...b, ...patch } : b)) : row)));
  const drop = (r: number, k: number) => onChange(rows.map((row, i) => (i === r ? row.filter((_, j) => j !== k) : row)).filter((row) => row.length));
  return (
    <div className="tgc-kb">
      {rows.map((row, r) => (
        <div key={r} className="tgc-kb-row">
          {row.map((b, k) => (
            <div key={k} className="tgc-kb-b">
              <input className="a-input" value={b.text} maxLength={64} placeholder="Tugma matni" aria-label="Tugma matni" onChange={(e) => setBtn(r, k, { text: e.target.value })} />
              <input className="a-input" value={b.url} placeholder="https://…" aria-label="Havola" onChange={(e) => setBtn(r, k, { url: e.target.value.trim() })} />
              <button type="button" className="tgc-x" title="Olib tashlash" aria-label="Olib tashlash" onClick={() => drop(r, k)}>
                <X size={14} />
              </button>
            </div>
          ))}
          {row.length < 4 && (
            <Btn size="sm" kind="ghost" icon={<Plus size={14} />} disabled={disabled} onClick={() => onChange(rows.map((x, i) => (i === r ? [...x, { text: "", url: "" }] : x)))}>
              Qatorga tugma
            </Btn>
          )}
        </div>
      ))}
      {rows.length < 8 && (
        <Btn size="sm" icon={<Plus size={14} />} disabled={disabled} onClick={() => onChange([...rows, [{ text: "", url: "" }]])}>
          Tugma qo‘shish
        </Btn>
      )}
    </div>
  );
}
