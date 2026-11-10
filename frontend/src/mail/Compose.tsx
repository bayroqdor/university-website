// Xat yozish oynasi: qabul qiluvchilar (avtomatik to'ldirish, guruhlar), nusxa/yashirin nusxa, matn muharriri, ilovalar, qoralama
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  Bold,
  Italic,
  Link2,
  List,
  ListOrdered,
  Maximize2,
  Minimize2,
  Paperclip,
  Quote,
  Redo2,
  Save,
  Send,
  Strikethrough,
  Trash2,
  Underline,
  Undo2,
  Users,
  X,
} from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { useConfirm, useToast } from "../admin/ui";
import { ApiError } from "../lib/api";
import { mail, type Addr, type Contact, type Draft } from "./api";
import type { MailDict } from "./i18n";

const EMAIL = /^[^@\s<>"',;]{1,64}@[^@\s<>"',;]+\.[^@\s<>"',;]{2,}$/;

export function fmtSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function addrLabel(a: Addr): string {
  return a.name || a.email;
}

function parseAddr(raw: string): Addr | null {
  const s = raw.trim().replace(/[,;]$/, "");
  if (!s) return null;
  const m = s.match(/^(.*)<([^>]+)>$/);
  const email = (m ? m[2] : s).trim();
  if (!EMAIL.test(email) && !/^(group|section):/.test(email)) return null;
  return { name: m ? m[1].trim().replace(/^"|"$/g, "") : "", email };
}

function Recipients({
  label,
  value,
  onChange,
  t,
  autoFocus,
  extra,
}: {
  label: string;
  value: Addr[];
  onChange: (v: Addr[]) => void;
  t: MailDict;
  autoFocus?: boolean;
  extra?: ReactNode;
}) {
  const [text, setText] = useState("");
  const [sugg, setSugg] = useState<Contact[]>([]);
  const [active, setActive] = useState(0);
  const [bad, setBad] = useState(false);
  const timer = useRef<number>();
  useEffect(() => {
    window.clearTimeout(timer.current);
    const q = text.trim();
    if (q.length < 1) {
      setSugg([]);
      return;
    }
    timer.current = window.setTimeout(() => {
      mail
        .contacts(q)
        .then((r) => {
          setSugg(
            r.items.filter((c) => !value.some((v) => v.email === c.email)),
          );
          setActive(0);
        })
        .catch(() => setSugg([]));
    }, 180);
    return () => window.clearTimeout(timer.current);
  }, [text, value]);
  const add = (a: Addr) => {
    if (!value.some((v) => v.email.toLowerCase() === a.email.toLowerCase()))
      onChange([...value, a]);
    setText("");
    setSugg([]);
    setBad(false);
  };
  const commit = (): boolean => {
    if (!text.trim()) return true;
    const parts = text.split(/[,;\s]+(?=[^,;\s]*@|group:)/).map(parseAddr);
    if (parts.every(Boolean)) {
      const next = [...value];
      for (const p of parts as Addr[])
        if (!next.some((v) => v.email === p.email)) next.push(p);
      onChange(next);
      setText("");
      setSugg([]);
      setBad(false);
      return true;
    }
    setBad(true);
    return false;
  };
  const key = (e: KeyboardEvent<HTMLInputElement>) => {
    if (sugg.length && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      e.preventDefault();
      setActive(
        (i) =>
          (i + (e.key === "ArrowDown" ? 1 : sugg.length - 1)) % sugg.length,
      );
    } else if (
      e.key === "Enter" ||
      e.key === "," ||
      e.key === ";" ||
      e.key === "Tab"
    ) {
      if (sugg.length && e.key !== ",") {
        e.preventDefault();
        const c = sugg[active];
        add({ name: c.name, email: c.email });
      } else if (text.trim()) {
        e.preventDefault();
        commit();
      }
    } else if (e.key === "Backspace" && !text && value.length) {
      onChange(value.slice(0, -1));
    } else if (e.key === "Escape") setSugg([]);
  };
  return (
    <div className="mc-row mc-rcpt">
      <span className="mc-lbl">{label}</span>
      <div className={`mc-chips ${bad ? "bad" : ""}`}>
        {value.map((a) => (
          <span
            key={a.email}
            className={`mc-chip ${/^(group|section):/.test(a.email) ? "group" : ""}`}
            title={/^(group|section):/.test(a.email) ? t.group_hint : a.email}
          >
            {/^(group|section):/.test(a.email) && <Users size={12} />}
            {addrLabel(a)}
            <button
              type="button"
              onClick={() => onChange(value.filter((x) => x !== a))}
              aria-label={t.delete}
            >
              <X size={12} />
            </button>
          </span>
        ))}
        <input
          autoFocus={autoFocus}
          value={text}
          placeholder={value.length ? "" : t.recipient_hint}
          onChange={(e) => {
            setText(e.target.value);
            setBad(false);
          }}
          onKeyDown={key}
          onBlur={() =>
            window.setTimeout(() => {
              setSugg([]);
              commit();
            }, 150)
          }
          onPaste={(e) => {
            const v = e.clipboardData.getData("text");
            if (/[,;\n]/.test(v)) {
              e.preventDefault();
              const list = v
                .split(/[,;\n]+/)
                .map(parseAddr)
                .filter(Boolean) as Addr[];
              onChange([
                ...value,
                ...list.filter(
                  (x) => !value.some((v2) => v2.email === x.email),
                ),
              ]);
            }
          }}
        />
        {sugg.length > 0 && (
          <div className="mc-sugg">
            {sugg.map((c, i) => (
              <button
                type="button"
                key={c.email}
                className={i === active ? "on" : ""}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => add({ name: c.name, email: c.email })}
              >
                {c.photo ? (
                  <img className="mc-av" src={c.photo} alt="" />
                ) : (
                  <span className={`mc-av ${c.type}`}>{c.type === "group" ? <Users size={14} /> : c.name.slice(0, 1).toUpperCase()}</span>
                )}
                <span>
                  <b>{c.name}</b>
                  <small>
                    {c.type === "group"
                      ? `${c.hint} · ${t.group_hint}`
                      : `${c.email} · ${c.hint}`}
                  </small>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
      {extra}
    </div>
  );
}

function Toolbar({ editor }: { editor: Editor | null }) {
  if (!editor) return null;
  const B = ({
    on,
    run,
    title,
    children,
  }: {
    on?: boolean;
    run: () => void;
    title: string;
    children: ReactNode;
  }) => (
    <button
      type="button"
      className={on ? "on" : ""}
      title={title}
      aria-label={title}
      onMouseDown={(e) => e.preventDefault()}
      onClick={run}
    >
      {children}
    </button>
  );
  const c = () => editor.chain().focus();
  return (
    <div className="mc-tools">
      <B
        on={editor.isActive("bold")}
        run={() => c().toggleBold().run()}
        title="Bold"
      >
        <Bold size={15} />
      </B>
      <B
        on={editor.isActive("italic")}
        run={() => c().toggleItalic().run()}
        title="Italic"
      >
        <Italic size={15} />
      </B>
      <B
        on={editor.isActive("underline")}
        run={() => c().toggleUnderline().run()}
        title="Underline"
      >
        <Underline size={15} />
      </B>
      <B
        on={editor.isActive("strike")}
        run={() => c().toggleStrike().run()}
        title="Strike"
      >
        <Strikethrough size={15} />
      </B>
      <i />
      <B
        on={editor.isActive("bulletList")}
        run={() => c().toggleBulletList().run()}
        title="List"
      >
        <List size={15} />
      </B>
      <B
        on={editor.isActive("orderedList")}
        run={() => c().toggleOrderedList().run()}
        title="Numbered"
      >
        <ListOrdered size={15} />
      </B>
      <B
        on={editor.isActive("blockquote")}
        run={() => c().toggleBlockquote().run()}
        title="Quote"
      >
        <Quote size={15} />
      </B>
      <B
        on={editor.isActive("link")}
        run={() => {
          const prev = editor.getAttributes("link").href as string | undefined;
          const url = window.prompt("URL", prev || "https://");
          if (url === null) return;
          if (!url) c().unsetLink().run();
          else c().extendMarkRange("link").setLink({ href: url }).run();
        }}
        title="Link"
      >
        <Link2 size={15} />
      </B>
      <i />
      <B run={() => c().undo().run()} title="Undo">
        <Undo2 size={15} />
      </B>
      <B run={() => c().redo().run()} title="Redo">
        <Redo2 size={15} />
      </B>
    </div>
  );
}

export function Compose({
  initial,
  t,
  maxMb,
  draftsFolder,
  onClose,
  onSent,
}: {
  initial: Draft;
  t: MailDict;
  maxMb: number;
  draftsFolder: string;
  onClose: () => void;
  onSent: () => void;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const [d, setD] = useState<Draft>(initial);
  const [files, setFiles] = useState<File[]>([]);
  const [showCc, setShowCc] = useState(
    initial.cc.length > 0 || initial.bcc.length > 0,
  );
  const [mini, setMini] = useState(false);
  const [big, setBig] = useState(false);
  const [busy, setBusy] = useState<"" | "send" | "draft">("");
  const [saved, setSaved] = useState("");
  const [drag, setDrag] = useState(false);
  const dirty = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ link: { openOnClick: false, autolink: true } }),
    ],
    content: initial.html || "<p></p>",
    editorProps: { attributes: { class: "mc-prose", spellcheck: "true" } },
    onUpdate: () => {
      dirty.current = true;
    },
    autofocus:
      initial.mode === "reply" || initial.mode === "replyall" ? "start" : false,
  });
  const set = (p: Partial<Draft>) => {
    dirty.current = true;
    setD((x) => ({ ...x, ...p }));
  };
  const inherited = (d.inherited || []).filter((a) =>
    d.attach_from?.parts.includes(a.part),
  );
  const total =
    files.reduce((s, f) => s + f.size, 0) +
    inherited.reduce((s, a) => s + a.size, 0);
  const payload = (): Draft => ({ ...d, html: editor?.getHTML() || "" });
  const err = (e: unknown) => {
    const det = e instanceof ApiError ? e.detail : String(e);
    toast(
      det === "too_large"
        ? t.too_large
        : det === "mail_disabled"
          ? t.disabled_title
          : `${t.unavailable}: ${det}`,
      "error",
    );
  };
  const addFiles = (list: FileList | File[] | null) => {
    if (!list) return;
    const arr = Array.from(list);
    const sum = total + arr.reduce((s, f) => s + f.size, 0);
    if (sum > maxMb * 1024 * 1024) {
      toast(`${t.too_large} (≤ ${maxMb} MB)`, "error");
      return;
    }
    dirty.current = true;
    setFiles((f) => [...f, ...arr]);
  };
  const saveDraft = async (quiet = false) => {
    setBusy("draft");
    try {
      const r = await mail.saveDraft(payload(), files);
      setD((x) => ({ ...x, draft_uid: r.uid }));
      setSaved(r.saved);
      dirty.current = false;
      if (!quiet) toast(t.draft_saved);
      return true;
    } catch (e) {
      err(e);
      return false;
    } finally {
      setBusy("");
    }
  };
  const send = async () => {
    if (!d.to.length && !d.cc.length && !d.bcc.length) {
      toast(t.recipient_hint, "error");
      return;
    }
    setBusy("send");
    try {
      await mail.send(payload(), files);
      toast(t.sent_ok);
      dirty.current = false;
      onSent();
      onClose();
    } catch (e) {
      err(e);
    } finally {
      setBusy("");
    }
  };
  const close = async () => {
    const hasContent =
      d.to.length || d.subject || (editor && !editor.isEmpty) || files.length;
    if (dirty.current && hasContent) {
      if (await saveDraft(true)) toast(t.draft_saved);
    }
    onClose();
  };
  const discard = async () => {
    if (dirty.current || d.draft_uid) {
      if (!(await confirm(t.discard_q, true))) return;
    }
    if (d.draft_uid)
      mail
        .action("destroy", [{ folder: draftsFolder, uid: d.draft_uid }])
        .catch(() => null);
    onClose();
  };
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        send();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  const title =
    d.subject ||
    (d.mode === "reply" || d.mode === "replyall"
      ? t.reply
      : d.mode === "forward"
        ? t.forward
        : t.compose);
  return (
    <div
      className={`mc ${mini ? "mini" : ""} ${big ? "big" : ""}`}
      role="dialog"
      aria-label={t.compose}
    >
      <div className="mc-head" onClick={() => mini && setMini(false)}>
        <b>{title}</b>
        {saved && !mini && (
          <small>
            {t.draft_saved} · {saved}
          </small>
        )}
        <span className="mc-head-btns">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setMini(!mini);
            }}
            title={t.minimize}
          >
            <Minimize2 size={14} />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setBig(!big);
              setMini(false);
            }}
            title={t.maximize}
          >
            <Maximize2 size={14} />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              close();
            }}
            title={t.close}
          >
            <X size={15} />
          </button>
        </span>
      </div>
      {!mini && (
        <div
          className={`mc-body ${drag ? "drag" : ""}`}
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes("Files")) {
              e.preventDefault();
              setDrag(true);
            }
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            if (e.dataTransfer.files.length) {
              e.preventDefault();
              setDrag(false);
              addFiles(e.dataTransfer.files);
            }
          }}
        >
          <Recipients
            label={t.to}
            value={d.to}
            onChange={(v) => set({ to: v })}
            t={t}
            autoFocus={!d.to.length}
            extra={
              !showCc && (
                <button
                  type="button"
                  className="mc-ccbtn"
                  onClick={() => setShowCc(true)}
                >
                  {t.cc} / {t.bcc}
                </button>
              )
            }
          />
          {showCc && (
            <>
              <Recipients
                label={t.cc}
                value={d.cc}
                onChange={(v) => set({ cc: v })}
                t={t}
              />
              <Recipients
                label={t.bcc}
                value={d.bcc}
                onChange={(v) => set({ bcc: v })}
                t={t}
              />
            </>
          )}
          <div className="mc-row">
            <input
              className="mc-subject"
              placeholder={t.subject}
              value={d.subject}
              onChange={(e) => set({ subject: e.target.value })}
            />
          </div>
          <Toolbar editor={editor} />
          <div className="mc-editor" onClick={(e) => e.target === e.currentTarget && editor?.commands.focus("end")}>
            <EditorContent editor={editor} />
          </div>
          {(files.length > 0 || inherited.length > 0) && (
            <div className="mc-files">
              {inherited.map((a) => (
                <span
                  key={`i${a.part}`}
                  className="mc-file"
                  title={t.attachment_from}
                >
                  <Paperclip size={13} /> {a.name}{" "}
                  <small>{fmtSize(a.size)}</small>
                  <button
                    type="button"
                    onClick={() =>
                      set({
                        attach_from: d.attach_from && {
                          ...d.attach_from,
                          parts: d.attach_from.parts.filter(
                            (p) => p !== a.part,
                          ),
                        },
                      })
                    }
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
              {files.map((f, i) => (
                <span key={`${f.name}${i}`} className="mc-file">
                  <Paperclip size={13} /> {f.name}{" "}
                  <small>{fmtSize(f.size)}</small>
                  <button
                    type="button"
                    onClick={() => setFiles(files.filter((_, j) => j !== i))}
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          )}
          {drag && <div className="mc-drop">{t.drop_files}</div>}
          <div className="mc-foot">
            <button
              type="button"
              className="mc-send"
              onClick={send}
              disabled={!!busy}
            >
              <Send size={15} /> {busy === "send" ? t.sending : t.send}
            </button>
            <button
              type="button"
              className="mc-ic"
              onClick={() => fileRef.current?.click()}
              title={t.attach}
            >
              <Paperclip size={17} />
            </button>
            <input
              ref={fileRef}
              type="file"
              multiple
              hidden
              onChange={(e) => {
                addFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              className="mc-ic"
              onClick={() => saveDraft()}
              title={t.save_draft}
              disabled={!!busy}
            >
              <Save size={17} />
            </button>
            <span className="mc-size">
              {total > 0 && `${fmtSize(total)} / ${maxMb} MB`}
            </span>
            <button
              type="button"
              className="mc-ic danger"
              onClick={discard}
              title={t.discard}
            >
              <Trash2 size={17} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
