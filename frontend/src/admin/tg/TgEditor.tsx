// Telegram post muharriri: faqat Telegram qo'llaydigan formatlash (qalin, kursiv, tagiga chizilgan, o'chirilgan, yashirin matn,
// kod, kod bloki, iqtibos [yig'iladigan], havola) va emoji. Umumiy RichEditor'ga tegmaydi — alohida, cheklangan sxema.
import { Mark, Node, mergeAttributes, type JSONContent } from "@tiptap/core";
import { Placeholder } from "@tiptap/extensions";
import { Fragment, Slice } from "@tiptap/pm/model";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Bold, ChevronsDownUp, Code, EyeOff, Italic, Link2, Link2Off, Quote, Redo2, RemoveFormatting, Smile, SquareCode, Strikethrough, Underline, Undo2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { EMOJI, pushRecentEmoji, recentEmoji } from "./emoji";
import { SAFE_URL, docToTg, tgToEditorHtml } from "./tghtml";

const Spoiler = Mark.create({
  name: "spoiler",
  parseHTML() {
    return [{ tag: "tg-spoiler" }, { tag: "span.tg-spoiler" }];
  },
  renderHTML() {
    return ["span", { class: "tg-spoiler" }, 0];
  },
  addKeyboardShortcuts() {
    return { "Mod-Shift-p": () => this.editor.commands.toggleMark(this.name) };
  },
});

// Telegram iqtiboslari ichida faqat matn qatorlari bo'ladi (kod bloki yoki ichma-ich iqtibos — yo'q)
const TgQuote = Node.create({
  name: "blockquote",
  group: "block",
  content: "paragraph+",
  defining: true,
  addAttributes() {
    return {
      expandable: {
        default: false,
        parseHTML: (el: HTMLElement) => el.hasAttribute("expandable") || el.getAttribute("data-expandable") === "true",
        renderHTML: (a: { expandable?: boolean }) => (a.expandable ? { "data-expandable": "true" } : {}),
      },
    };
  },
  parseHTML() {
    return [{ tag: "blockquote" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["blockquote", mergeAttributes(HTMLAttributes), 0];
  },
  addKeyboardShortcuts() {
    return { "Mod-Shift-b": () => this.editor.commands.toggleWrap(this.name) };
  },
});

export interface TgEditorProps {
  initialDoc?: JSONContent | null;
  initialHtml?: string;
  onChange: (html: string, doc: JSONContent) => void;
  placeholder?: string;
  blocks?: boolean; // iqtibos va kod bloki (post osti matnida — yo'q)
  label?: string;
  footer?: ReactNode;
  compact?: boolean;
}

export function TgEditor({ initialDoc, initialHtml, onChange, placeholder, blocks = true, label, footer, compact }: TgEditorProps) {
  const cb = useRef(onChange);
  cb.current = onChange;
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [href, setHref] = useState("");
  const extensions = useMemo(
    () => [
      StarterKit.configure({
        heading: false,
        bulletList: false,
        orderedList: false,
        listItem: false,
        listKeymap: false,
        horizontalRule: false,
        blockquote: false,
        codeBlock: blocks ? { HTMLAttributes: { spellcheck: "false" } } : false,
        trailingNode: false,
        link: { openOnClick: false, autolink: true, linkOnPaste: true, defaultProtocol: "https", HTMLAttributes: { rel: "noopener noreferrer nofollow", target: null } },
      }),
      Spoiler,
      ...(blocks ? [TgQuote] : []),
      Placeholder.configure({ placeholder: placeholder || "" }),
    ],
    [blocks, placeholder],
  );
  const editor = useEditor({
    extensions,
    content: initialDoc || tgToEditorHtml(initialHtml || ""),
    shouldRerenderOnTransaction: true,
    editorProps: {
      attributes: { class: "tge-area", "aria-label": label || "Matn", "data-no-tr": "" },
      // oddiy matn joylanganda har bir qator saqlanadi (bo'sh qatorlar ham) — Telegram'dagidek
      clipboardTextParser: (text, _ctx, _plain, view) => {
        const s = view.state.schema;
        const paras = text
          .replace(/\r\n?/g, "\n")
          .split("\n")
          .map((l) => s.nodes.paragraph.create(null, l ? s.text(l) : null));
        return Slice.maxOpen(Fragment.from(paras));
      },
    },
    onUpdate: ({ editor: e }) => {
      const doc = e.getJSON();
      cb.current(docToTg(doc), doc);
    },
  });
  useEffect(() => {
    if (!emojiOpen) return;
    const close = (ev: MouseEvent) => {
      if (!(ev.target as HTMLElement).closest?.(".tge-emoji, .tge-emoji-btn")) setEmojiOpen(false);
    };
    const esc = (ev: KeyboardEvent) => ev.key === "Escape" && setEmojiOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [emojiOpen]);
  if (!editor) return null;
  const inQuote = editor.isActive("blockquote");
  const B = ({ on, title, icon, run, disabled, className }: { on?: boolean; title: string; icon: ReactNode; run: () => void; disabled?: boolean; className?: string }) => (
    <button
      type="button"
      className={`tge-b ${on ? "on" : ""} ${className || ""}`}
      title={title}
      aria-label={title}
      aria-pressed={on}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={run}
    >
      {icon}
    </button>
  );
  const c = () => editor.chain().focus();
  const applyLink = () => {
    const v = href.trim();
    if (!v) c().extendMarkRange("link").unsetLink().run();
    else {
      const url = /^[a-z]+:\/\//i.test(v) || v.startsWith("mailto:") ? v : `https://${v}`;
      if (SAFE_URL.test(url)) c().extendMarkRange("link").setLink({ href: url }).run();
    }
    setLinkOpen(false);
  };
  return (
    <div className={`tge ${compact ? "compact" : ""}`}>
      <div className="tge-tb" role="toolbar" aria-label="Formatlash">
        <B on={editor.isActive("bold")} title="Qalin (Ctrl+B)" icon={<Bold size={16} />} run={() => c().toggleBold().run()} />
        <B on={editor.isActive("italic")} title="Kursiv (Ctrl+I)" icon={<Italic size={16} />} run={() => c().toggleItalic().run()} />
        <B on={editor.isActive("underline")} title="Tagiga chizilgan (Ctrl+U)" icon={<Underline size={16} />} run={() => c().toggleUnderline().run()} />
        <B on={editor.isActive("strike")} title="O‘chirilgan" icon={<Strikethrough size={16} />} run={() => c().toggleStrike().run()} />
        <B on={editor.isActive("spoiler")} title="Yashirin matn (spoiler)" icon={<EyeOff size={16} />} run={() => c().toggleMark("spoiler").run()} />
        <B on={editor.isActive("code")} title="Kod" icon={<Code size={16} />} run={() => c().toggleCode().run()} />
        <span className="tge-sep" />
        <B
          on={editor.isActive("link")}
          title={editor.isActive("link") ? "Havolani olib tashlash" : "Havola"}
          icon={editor.isActive("link") ? <Link2Off size={16} /> : <Link2 size={16} />}
          run={() => {
            if (editor.isActive("link")) c().extendMarkRange("link").unsetLink().run();
            else {
              setHref("");
              setLinkOpen((v) => !v);
            }
          }}
        />
        {blocks && (
          <>
            <B on={inQuote} title="Iqtibos" icon={<Quote size={16} />} run={() => c().toggleWrap("blockquote").run()} />
            <B
              on={inQuote && !!editor.getAttributes("blockquote").expandable}
              title="Yig‘iladigan iqtibos"
              icon={<ChevronsDownUp size={16} />}
              disabled={!inQuote}
              run={() => c().updateAttributes("blockquote", { expandable: !editor.getAttributes("blockquote").expandable }).run()}
            />
            <B on={editor.isActive("codeBlock")} title="Kod bloki" icon={<SquareCode size={16} />} run={() => c().toggleCodeBlock().run()} />
          </>
        )}
        <span className="tge-sep" />
        <B on={emojiOpen} title="Emoji" icon={<Smile size={16} />} className="tge-emoji-btn" run={() => setEmojiOpen((v) => !v)} />
        <B title="Formatlashni tozalash" icon={<RemoveFormatting size={16} />} run={() => c().unsetAllMarks().clearNodes().run()} />
        {!compact && (
          <>
            <span className="tge-grow" />
            <B title="Bekor qilish (Ctrl+Z)" icon={<Undo2 size={16} />} disabled={!editor.can().undo()} run={() => c().undo().run()} />
            <B title="Qaytarish (Ctrl+Shift+Z)" icon={<Redo2 size={16} />} disabled={!editor.can().redo()} run={() => c().redo().run()} />
          </>
        )}
      </div>
      {linkOpen && (
        <form
          className="tge-link"
          onSubmit={(e) => {
            e.preventDefault();
            applyLink();
          }}
        >
          <input className="a-input" autoFocus value={href} onChange={(e) => setHref(e.target.value)} placeholder="https://…" aria-label="Havola manzili" />
          <button type="submit" className="a-btn primary sm">
            <span>Qo‘yish</span>
          </button>
          <button type="button" className="a-btn ghost sm" onClick={() => setLinkOpen(false)}>
            <span>Bekor qilish</span>
          </button>
        </form>
      )}
      {emojiOpen && (
        <EmojiPicker
          onPick={(e) => {
            pushRecentEmoji(e);
            c().insertContent(e).run();
          }}
        />
      )}
      <EditorContent editor={editor} />
      {footer}
    </div>
  );
}

function EmojiPicker({ onPick }: { onPick: (e: string) => void }) {
  const recent = useMemo(recentEmoji, []);
  const groups = useMemo(() => (recent.length ? [{ id: "recent", label: "Oxirgilar", icon: "🕘", list: recent }, ...EMOJI] : EMOJI), [recent]);
  const [tab, setTab] = useState(groups[0].id);
  const g = groups.find((x) => x.id === tab) || groups[0];
  return (
    <div className="tge-emoji" role="dialog" aria-label="Emoji" data-no-tr="">
      <div className="tge-emoji-tabs" role="tablist">
        {groups.map((x) => (
          <button key={x.id} type="button" role="tab" aria-selected={x.id === tab} title={x.label} className={x.id === tab ? "on" : ""} onMouseDown={(e) => e.preventDefault()} onClick={() => setTab(x.id)}>
            {x.icon}
          </button>
        ))}
      </div>
      <div className="tge-emoji-cap">{g.label}</div>
      <div className="tge-emoji-grid">
        {g.list.map((e, i) => (
          <button key={e + i} type="button" onMouseDown={(ev) => ev.preventDefault()} onClick={() => onPick(e)} aria-label={e}>
            {e}
          </button>
        ))}
      </div>
    </div>
  );
}
