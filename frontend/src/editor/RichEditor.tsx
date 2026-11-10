// Ghost uslubidagi matn tahrirlagichi (Tiptap): «/» menyu, belgilash paneli, formula, grafik, rasm, jadval
import type { Editor, JSONContent } from "@tiptap/core";
import { CharacterCount, Placeholder } from "@tiptap/extensions";
import { EditorContent, useEditor } from "@tiptap/react";
import { BubbleMenu, FloatingMenu } from "@tiptap/react/menus";
import { NodeSelection } from "@tiptap/pm/state";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Code,
  Heading2,
  Heading3,
  Highlighter,
  Italic,
  Link2,
  Plus,
  Quote,
  RemoveFormatting,
  Sigma,
  Strikethrough,
  Subscript as SubIcon,
  Superscript as SupIcon,
  Trash2,
  Underline as UnderlineIcon,
  Unlink,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { admin } from "../admin/api";
import { MediaLibrary, useToast } from "../admin/ui";
import type { ChartConfig } from "../rich/chart";
import { buildExtensions } from "../rich/extensions";
import { ChartEditor } from "./ChartEditor";
import { ImageSearch, type ImportedImage } from "./ImageSearch";
import { EditorNodeViews, EditorUICtx, MathModal, UrlModal, type EditorUI } from "./nodeviews";
import { SlashCommand } from "./slash";
import { cleanPastedHtml, dataUrlToFile, htmlHasContent, tsvToTable } from "./paste";
import { docKind } from "../rich/DocViewer";

type Box = { x: number; y: number; width: number; height: number };

/** (x, y) nuqtani tahrirlagich ustidan yopib turgan fixed/sticky qatlam (yuqoridagi panel, yon menyu, sozlamalar ustuni) */
function overlayAt(x: number, y: number, dom: HTMLElement, layer: HTMLElement): DOMRect | null {
  for (const el of document.elementsFromPoint(x, y)) {
    if (layer.contains(el)) continue;
    for (let a: Element | null = el; a && a !== document.body; a = a.parentElement) {
      if (a.contains(dom)) return null;
      if (/^(fixed|sticky)$/.test(getComputedStyle(a).position)) return a.getBoundingClientRect();
    }
    return null;
  }
  return null;
}

/** Tahrirlagichning ekranda haqiqatan ko'rinib turgan qismi: oyna, aylantiriladigan ota bloklar (modal) va ustidagi yopishqoq panellarsiz */
function visibleArea(dom: HTMLElement, layer: HTMLElement): Box {
  let t = 0;
  let l = 0;
  let r = window.innerWidth;
  let b = window.innerHeight;
  for (let a = dom.parentElement; a && a !== document.body; a = a.parentElement) {
    const cs = getComputedStyle(a);
    if (cs.overflowX === "visible" && cs.overflowY === "visible") continue;
    const q = a.getBoundingClientRect();
    t = Math.max(t, q.top);
    l = Math.max(l, q.left);
    r = Math.min(r, q.right);
    b = Math.min(b, q.bottom);
  }
  const er = dom.getBoundingClientRect();
  const cx = Math.min(Math.max(er.left + er.width / 2, l + 1), r - 1);
  const top = overlayAt(cx, t + 1, dom, layer);
  if (top && top.top <= t + 1) t = Math.max(t, top.bottom);
  const bot = overlayAt(cx, b - 1, dom, layer);
  if (bot && bot.bottom >= b - 1) b = Math.min(b, bot.top);
  const cy = (t + b) / 2;
  const lft = overlayAt(l + 1, cy, dom, layer);
  if (lft && lft.left <= l + 1) l = Math.max(l, lft.right);
  const rgt = overlayAt(r - 1, cy, dom, layer);
  if (rgt && rgt.right >= r - 1) r = Math.min(r, rgt.left);
  return { x: l, y: t, width: Math.max(0, r - l), height: Math.max(0, b - t) };
}

const GAP = 10;
/** Belgilash paneli joylashuvi: sig'masa tanlov ostiga o'tadi, yopishqoq panel / yon menyu ostida qolmaydi, tanlov ko'rinmay qolsa yashirinadi */
function menuOptions(placement: "top" | "top-start", area: () => Box) {
  return {
    placement,
    strategy: "absolute" as const,
    offset: GAP,
    // floating-ui tartibi: flip → shift → offset, shuning uchun oraliq ham hisobga olinadi
    flip: () => ({ boundary: area(), padding: GAP + 8, crossAxis: false, fallbackPlacements: [placement === "top" ? ("bottom" as const) : ("bottom-start" as const)] }),
    shift: () => ({ boundary: area(), crossAxis: true, padding: { top: GAP + 8, bottom: GAP + 8, left: 8, right: 8 } }),
    hide: () => ({ boundary: area(), strategy: "referenceHidden" as const }),
  };
}

export interface EditorOutput {
  json: JSONContent;
  html: string;
  text: string;
}

function TB({ on, onClick, title, children }: { on?: boolean; onClick: () => void; title: string; children: ReactNode }) {
  return (
    <button type="button" className={on ? "on" : ""} onMouseDown={(e) => e.preventDefault()} onClick={onClick} title={title} aria-label={title}>
      {children}
    </button>
  );
}

export function RichEditor({
  value,
  onChange,
  placeholder = "Yozishni boshlang yoki «/» bosing…",
  onReady,
  minimal = false,
  uploader,
}: {
  value: JSONContent | string | null | undefined;
  onChange: (o: EditorOutput) => void;
  placeholder?: string;
  onReady?: (e: Editor) => void;
  minimal?: boolean;
  /** admin panelidan tashqarida (kabinet blogi): rasmlar shu funksiya bilan yuklanadi, media kutubxonasi o'rniga fayl tanlanadi */
  uploader?: (f: File) => Promise<{ url: string }>;
}) {
  const toast = useToast();
  const [chart, setChart] = useState<{ initial: ChartConfig | null; onSave: (c: ChartConfig) => void } | null>(null);
  const [math, setMath] = useState<{ initial: { latex: string; kind: "inline" | "block" }; onSave: (l: string, k: "inline" | "block") => void } | null>(null);
  const [media, setMedia] = useState<{ onPick: (u: string) => void } | null>(null);
  const [search, setSearch] = useState<{ onPick: (r: ImportedImage) => void } | null>(null);
  const [url, setUrl] = useState<{ title: string; placeholder: string; onOk: (u: string) => void } | null>(null);
  const [linkEdit, setLinkEdit] = useState<string | null>(null);
  const upload = uploader || admin.upload;
  const picker = useRef<HTMLInputElement>(null);
  const pickCb = useRef<((u: string) => void) | null>(null);
  const docPicker = useRef<HTMLInputElement>(null);
  const docCb = useRef<((u: string, n: string) => void) | null>(null);
  // tashqi manzildagi rasmni o'z serverimizga ko'chirish (faqat admin panelida; kabinetda tashqi rasm o'z joyida qoladi)
  const rehost = uploader ? null : (u: string) => admin.uploadFromUrl(u);
  const ui = useMemo<EditorUI>(
    () => ({
      openChart: (initial, onSave) => setChart({ initial, onSave }),
      openMath: (initial, onSave) => setMath({ initial, onSave }),
      pickImage: (onPick) => {
        if (!uploader) return setMedia({ onPick });
        pickCb.current = onPick;
        picker.current?.click();
      },
      searchImage: (onPick) => setSearch({ onPick }),
      promptUrl: (title, placeholder2, onOk) => setUrl({ title, placeholder: placeholder2, onOk }),
      pickDoc: (onPick) => {
        docCb.current = onPick;
        docPicker.current?.click();
      },
      upload,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [uploader],
  );
  const uiRef = useRef(ui);
  const editorRef = useRef<Editor | null>(null);
  // menyular body oxiridagi alohida qatlamda: ota blokning overflow:hidden'i, sticky panel yoki modal ularni kesmaydi
  const [layer] = useState(() => {
    const d = document.createElement("div");
    d.className = "bubble-layer";
    return d;
  });
  const options = useMemo(() => {
    // bitta joylashtirishda flip/shift/hide uchun bir marta o'lchanadi
    let last = { at: -1, box: { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight } };
    const area = () => {
      const dom = editorRef.current?.view.dom as HTMLElement | undefined;
      const now = performance.now();
      if (dom && now - last.at > 12) last = { at: now, box: visibleArea(dom, layer) };
      return last.box;
    };
    return { text: menuOptions("top", area), table: menuOptions("top-start", area) };
  }, [layer]);
  const change = useRef(onChange);
  change.current = onChange;

  const uploadFiles = async (files: File[], pos?: number) => {
    const imgs = files.filter((f) => f.type.startsWith("image/"));
    if (imgs.length > 1) {
      // bir nechta rasm birdan — karusel (yon tugmalar va nuqtalar bilan)
      const images: { src: string; alt: string }[] = [];
      for (const f of imgs) {
        try {
          images.push({ src: (await upload(f)).url, alt: "" });
        } catch {
          toast("Rasmni yuklab bo‘lmadi", "error");
        }
      }
      const e = editorRef.current;
      if (!e || !images.length) return;
      const node = { type: "gallery", attrs: { images, ratio: "4 / 3" } };
      if (pos !== undefined) e.chain().focus().insertContentAt(pos, node).run();
      else e.chain().focus().insertContent(node).run();
      return;
    }
    for (const f of files) {
      if (!f.type.startsWith("image/")) continue;
      try {
        const m = await upload(f);
        const e = editorRef.current;
        if (!e) return;
        const chain = e.chain().focus();
        if (pos !== undefined) chain.insertContentAt(pos, { type: "figure", attrs: { src: m.url, width: "normal" } }).run();
        else chain.setFigure({ src: m.url, width: "normal" }).run();
      } catch {
        toast("Rasmni yuklab bo‘lmadi", "error");
      }
    }
  };

  const docName = (f: File) => f.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();

  /** PDF (skaner qilingan hujjat) — yuklab, «Hujjat» bloki sifatida qo'shiladi: saytda sahifaning o'zida ochiladi */
  const uploadDocs = async (files: File[], pos?: number) => {
    for (const f of files) {
      try {
        const m = await upload(f);
        const e = editorRef.current;
        if (!e) return;
        const node = { type: "docEmbed", attrs: { src: m.url, title: docName(f) } };
        if (pos !== undefined) e.chain().focus().insertContentAt(pos, node).run();
        else e.chain().focus().insertContent(node).run();
      } catch {
        toast("Hujjatni yuklab bo‘lmadi (PDF, 15 MB gacha)", "error");
      }
    }
  };

  /** Nusxalangan rasmlar: data: (Word/Docs'dan ichki rasm) yuklanadi, tashqi URL o'z serverimizga ko'chiriladi — manba o'chsa ham buzilmaydi */
  const busySrc = useRef(new Set<string>());
  const rehostImages = async () => {
    const e = editorRef.current;
    if (!e) return;
    const todo = new Set<string>();
    e.state.doc.descendants((n) => {
      const srcs = n.type.name === "figure" ? [n.attrs.src as string] : n.type.name === "gallery" ? ((n.attrs.images || []) as { src: string }[]).map((x) => x.src) : [];
      for (const src of srcs) {
        if (!src || busySrc.current.has(src)) continue;
        if (src.startsWith("data:image/") || (rehost && /^https?:\/\//.test(src) && !src.startsWith(window.location.origin))) todo.add(src);
      }
    });
    let failed = 0;
    for (const src of todo) {
      busySrc.current.add(src);
      try {
        let url = "";
        if (src.startsWith("data:")) {
          const f = dataUrlToFile(src);
          if (f) url = (await upload(f)).url;
        } else if (rehost) url = (await rehost(src)).url;
        if (!url) continue;
        const ed = editorRef.current;
        if (!ed) return;
        const tr = ed.state.tr;
        ed.state.doc.descendants((n, pos) => {
          if (n.type.name === "figure" && n.attrs.src === src) tr.setNodeMarkup(pos, undefined, { ...n.attrs, src: url });
          if (n.type.name === "gallery") {
            const imgs = (n.attrs.images || []) as { src: string; alt?: string }[];
            if (imgs.some((x) => x.src === src)) tr.setNodeMarkup(pos, undefined, { ...n.attrs, images: imgs.map((x) => (x.src === src ? { ...x, src: url } : x)) });
          }
        });
        if (tr.docChanged) ed.view.dispatch(tr);
      } catch {
        failed += 1;
      }
    }
    if (failed) toast(`${failed} ta rasmni serverga ko‘chirib bo‘lmadi — manba havolasi qoldi`, "error");
  };

  const editor = useEditor({
    extensions: buildExtensions({
      editable: true,
      nodeViews: EditorNodeViews,
      onMathClick: (kind, latex, pos) =>
        uiRef.current.openMath({ latex, kind }, (l, k) => {
          const e = editorRef.current;
          if (!e) return;
          if (k === kind) {
            if (kind === "inline") e.chain().setNodeSelection(pos).updateInlineMath({ latex: l, pos }).focus().run();
            else e.chain().setNodeSelection(pos).updateBlockMath({ latex: l, pos }).focus().run();
          } else {
            e.chain().setNodeSelection(pos).deleteSelection().run();
            if (k === "block") e.chain().focus().insertBlockMath({ latex: l }).run();
            else e.chain().focus().insertInlineMath({ latex: l }).run();
          }
        }),
      extra: [
        Placeholder.configure({
          placeholder: ({ node }) => (node.type.name === "heading" ? "Sarlavha" : placeholder),
          includeChildren: false,
        }),
        CharacterCount,
        ...(minimal ? [] : [SlashCommand(uiRef)]),
      ],
    }),
    content: value || { type: "doc", content: [{ type: "paragraph" }] },
    editorProps: {
      attributes: { class: "prose editor-prose", spellcheck: "true" },
      // Word / Google Docs / Excel / veb-sahifadan nusxa: jadval, rasm va formatlash buzilmasin
      transformPastedHTML: (html) => cleanPastedHtml(html),
      handlePaste: (_view, event) => {
        const cd = event.clipboardData;
        const html = cd?.getData("text/html") || "";
        const text = cd?.getData("text/plain") || "";
        const all = Array.from(cd?.files || []);
        const pdfs = all.filter((f) => f.type === "application/pdf");
        if (pdfs.length) {
          uploadDocs(pdfs);
          return true;
        }
        const imgs = all.filter((f) => f.type.startsWith("image/"));
        // Word tanlovni rasm sifatida ham beradi — HTML'da matn/jadval bo'lsa, rasm emas, HTML qo'yiladi
        if (imgs.length && !htmlHasContent(html)) {
          uploadFiles(imgs);
          return true;
        }
        if (!html && text) {
          const table = tsvToTable(text);
          if (table) {
            editorRef.current?.chain().focus().insertContent(table).run();
            return true;
          }
          const one = text.trim();
          const kind = /^https?:\/\/\S+$/.test(one) ? docKind(one) : null;
          if (kind === "pdf" || kind === "drive") {
            editorRef.current?.chain().focus().insertDoc({ src: one, title: "" }).run();
            return true;
          }
        }
        if (/<img[^>]+src=["']?file:/i.test(html)) toast("Word’dagi rasmlar avtomatik ko‘chmaydi — ularni alohida qo‘shing (rasmning o‘zini nusxalab qo‘yish ham mumkin)", "error");
        if (html) window.setTimeout(rehostImages, 60);
        return false;
      },
      handleDrop: (view, event, _slice, moved) => {
        if (moved) return false;
        const all = Array.from((event as DragEvent).dataTransfer?.files || []);
        const files = all.filter((f) => f.type.startsWith("image/"));
        const pdfs = all.filter((f) => f.type === "application/pdf");
        if (!files.length && !pdfs.length) return false;
        const coords = view.posAtCoords({ left: (event as DragEvent).clientX, top: (event as DragEvent).clientY });
        if (pdfs.length) uploadDocs(pdfs, coords?.pos);
        if (files.length) uploadFiles(files, coords?.pos);
        return true;
      },
    },
    onCreate: ({ editor: e }) => {
      editorRef.current = e;
      onReady?.(e);
    },
    onUpdate: ({ editor: e }) => change.current({ json: e.getJSON(), html: e.getHTML(), text: e.getText({ blockSeparator: "\n" }) }),
  });

  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  useEffect(() => {
    document.body.appendChild(layer);
    return () => layer.remove();
  }, [layer]);

  // ichki aylantiriladigan blok (modal, panel) surilganda ham menyu tanlov ustida qoladi
  useEffect(() => {
    if (!editor) return;
    let raf = 0;
    const onScroll = () => {
      if (raf || !layer.childElementCount) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        if (editor.isDestroyed) return;
        editor.view.dispatch(editor.state.tr.setMeta("textMenu", "updatePosition").setMeta("tableMenu", "updatePosition"));
      });
    };
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      cancelAnimationFrame(raf);
    };
  }, [editor, layer]);

  if (!editor) return null;

  const setLink = (href: string) => {
    if (!href) editor.chain().focus().extendMarkRange("link").unsetLink().run();
    else editor.chain().focus().extendMarkRange("link").setLink({ href: /^(https?:|mailto:|\/|#)/.test(href) ? href : `https://${href}` }).run();
    setLinkEdit(null);
  };
  const words = editor.storage.characterCount?.words?.() ?? 0;

  return (
    <EditorUICtx.Provider value={ui}>
      <div className="rich-editor">
        <BubbleMenu
          editor={editor}
          pluginKey="textMenu"
          appendTo={layer}
          options={options.text}
          shouldShow={({ editor: e, view, element, from, to }) =>
            from !== to &&
            (view.hasFocus() || element.contains(document.activeElement)) &&
            !(e.state.selection instanceof NodeSelection) &&
            e.state.doc.textBetween(from, to, " ").length > 0 &&
            !e.isActive("figure") && !e.isActive("chart") && !e.isActive("codeBlock") && !e.isActive("inlineMath") && !e.isActive("blockMath") && !e.isActive("button")}
          className="bubble"
        >
          {linkEdit !== null ? (
            <form
              className="bubble-link"
              onSubmit={(e) => {
                e.preventDefault();
                // menyu React daraxtida sahifa formasi ichida (kabinet blogi) — Enter yozuvni yuborib yubormasin
                e.stopPropagation();
                setLink(linkEdit);
              }}
            >
              <input autoFocus value={linkEdit} onChange={(e) => setLinkEdit(e.target.value)} placeholder="https://… yoki /blog/…" onKeyDown={(e) => e.key === "Escape" && setLinkEdit(null)} />
              <button type="submit">OK</button>
            </form>
          ) : (
            <>
              <TB on={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()} title="Qalin (Ctrl+B)">
                <Bold size={16} />
              </TB>
              <TB on={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()} title="Kursiv (Ctrl+I)">
                <Italic size={16} />
              </TB>
              <TB on={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()} title="Tagiga chizish (Ctrl+U)">
                <UnderlineIcon size={16} />
              </TB>
              <TB on={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()} title="O‘chirilgan">
                <Strikethrough size={16} />
              </TB>
              <TB on={editor.isActive("highlight")} onClick={() => editor.chain().focus().toggleHighlight().run()} title="Ajratish">
                <Highlighter size={16} />
              </TB>
              <TB on={editor.isActive("code")} onClick={() => editor.chain().focus().toggleCode().run()} title="Kod">
                <Code size={16} />
              </TB>
              <span className="bubble-sep" />
              <TB on={editor.isActive("subscript")} onClick={() => editor.chain().focus().toggleSubscript().run()} title="Pastki indeks (H₂O)">
                <SubIcon size={16} />
              </TB>
              <TB on={editor.isActive("superscript")} onClick={() => editor.chain().focus().toggleSuperscript().run()} title="Yuqori indeks (m²)">
                <SupIcon size={16} />
              </TB>
              <TB
                onClick={() => {
                  const { from, to } = editor.state.selection;
                  const text = editor.state.doc.textBetween(from, to, " ");
                  editor.chain().focus().deleteSelection().insertInlineMath({ latex: text }).run();
                }}
                title="Formulaga aylantirish"
              >
                <Sigma size={16} />
              </TB>
              <span className="bubble-sep" />
              <TB on={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} title="Sarlavha 2">
                <Heading2 size={16} />
              </TB>
              <TB on={editor.isActive("heading", { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} title="Sarlavha 3">
                <Heading3 size={16} />
              </TB>
              <TB on={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()} title="Iqtibos">
                <Quote size={16} />
              </TB>
              <span className="bubble-sep" />
              <TB on={editor.isActive({ textAlign: "left" })} onClick={() => editor.chain().focus().setTextAlign("left").run()} title="Chapga">
                <AlignLeft size={16} />
              </TB>
              <TB on={editor.isActive({ textAlign: "center" })} onClick={() => editor.chain().focus().setTextAlign("center").run()} title="Markazga">
                <AlignCenter size={16} />
              </TB>
              <TB on={editor.isActive({ textAlign: "right" })} onClick={() => editor.chain().focus().setTextAlign("right").run()} title="O‘ngga">
                <AlignRight size={16} />
              </TB>
              <span className="bubble-sep" />
              <TB on={editor.isActive("link")} onClick={() => setLinkEdit(editor.getAttributes("link").href || "")} title="Havola (Ctrl+K)">
                <Link2 size={16} />
              </TB>
              {editor.isActive("link") && (
                <TB onClick={() => editor.chain().focus().extendMarkRange("link").unsetLink().run()} title="Havolani olib tashlash">
                  <Unlink size={16} />
                </TB>
              )}
              <TB onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()} title="Formatlashni tozalash">
                <RemoveFormatting size={16} />
              </TB>
            </>
          )}
        </BubbleMenu>

        <BubbleMenu editor={editor} pluginKey="tableMenu" appendTo={layer} options={options.table} shouldShow={({ editor: e }) => e.isActive("table") && e.state.selection.empty} className="bubble table-bubble">
          <TB onClick={() => editor.chain().focus().addRowAfter().run()} title="Qator qo‘shish">
            + qator
          </TB>
          <TB onClick={() => editor.chain().focus().addColumnAfter().run()} title="Ustun qo‘shish">
            + ustun
          </TB>
          <TB onClick={() => editor.chain().focus().deleteRow().run()} title="Qatorni o‘chirish">
            − qator
          </TB>
          <TB onClick={() => editor.chain().focus().deleteColumn().run()} title="Ustunni o‘chirish">
            − ustun
          </TB>
          <TB onClick={() => editor.chain().focus().toggleHeaderRow().run()} title="Sarlavha qatori">
            sarlavha
          </TB>
          <TB onClick={() => editor.chain().focus().mergeOrSplit().run()} title="Kataklarni birlashtirish / ajratish">
            birlashtirish
          </TB>
          <TB onClick={() => editor.chain().focus().deleteTable().run()} title="Jadvalni o‘chirish">
            <Trash2 size={15} />
          </TB>
        </BubbleMenu>

        {!minimal && (
          <FloatingMenu editor={editor} options={{ placement: "left", offset: 14 }} shouldShow={({ state }) => {
            const { $from, empty } = state.selection;
            return empty && $from.parent.type.name === "paragraph" && $from.parent.content.size === 0 && $from.depth === 1;
          }} className="plus-menu">
            <button type="button" onClick={() => editor.chain().focus().insertContent("/").run()} title="Blok qo‘shish" aria-label="Blok qo‘shish">
              <Plus size={18} />
            </button>
          </FloatingMenu>
        )}

        <EditorContent editor={editor} />
        <div className="editor-foot">
          {words} so‘z · ~{Math.max(1, Math.round(words / 200))} daq. o‘qish
        </div>
      </div>
      <ChartEditor
        open={!!chart}
        initial={chart?.initial || null}
        onClose={() => setChart(null)}
        onSave={(c) => {
          chart?.onSave(c);
          setChart(null);
        }}
      />
      <MathModal
        open={!!math}
        initial={math?.initial || { latex: "", kind: "block" }}
        onClose={() => setMath(null)}
        onSave={(l, k) => {
          math?.onSave(l, k);
          setMath(null);
        }}
      />
      <input
        ref={docPicker}
        type="file"
        accept="application/pdf,.pdf,image/*"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f || !docCb.current) return;
          try {
            docCb.current((await upload(f)).url, docName(f));
          } catch {
            toast("Hujjatni yuklab bo‘lmadi (PDF, 15 MB gacha)", "error");
          }
        }}
      />
      <ImageSearch open={!!search} onClose={() => setSearch(null)} onPick={(r) => search?.onPick(r)} />
      {!uploader && <MediaLibrary open={!!media} onClose={() => setMedia(null)} onPick={(m) => media?.onPick(m.url)} />}
      <input
        ref={picker}
        type="file"
        accept="image/*"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f || !pickCb.current) return;
          try {
            pickCb.current((await upload(f)).url);
          } catch {
            toast("Rasmni yuklab bo‘lmadi", "error");
          }
        }}
      />
      <UrlModal
        open={!!url}
        title={url?.title || ""}
        placeholder={url?.placeholder || ""}
        onClose={() => setUrl(null)}
        onOk={(u) => {
          url?.onOk(u);
          setUrl(null);
        }}
      />
    </EditorUICtx.Provider>
  );
}
