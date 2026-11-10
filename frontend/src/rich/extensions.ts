// Tiptap kengaytmalari to'plami (tahrirlagich va HTML yaratish uchun umumiy)
import type { AnyExtension, JSONContent } from "@tiptap/core";
import { generateHTML } from "@tiptap/core";
import { CodeBlockLowlight } from "@tiptap/extension-code-block-lowlight";
import Highlight from "@tiptap/extension-highlight";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import Mathematics from "@tiptap/extension-mathematics";
import "katex/contrib/mhchem";
import Subscript from "@tiptap/extension-subscript";
import Superscript from "@tiptap/extension-superscript";
import { TableKit } from "@tiptap/extension-table";
import TextAlign from "@tiptap/extension-text-align";
import Typography from "@tiptap/extension-typography";
import Youtube from "@tiptap/extension-youtube";
import StarterKit from "@tiptap/starter-kit";
import { common, createLowlight } from "lowlight";
import { ButtonNode, CalloutNode, ChartNode, DocNode, FigureNode, GalleryNode } from "./nodes";

export const lowlight = createLowlight(common);

export interface ExtOptions {
  editable?: boolean;
  onMathClick?: (kind: "inline" | "block", latex: string, pos: number) => void;
  extra?: AnyExtension[];
  nodeViews?: Partial<Record<"chart" | "callout" | "figure" | "button" | "gallery" | "doc", AnyExtension>>;
}

export function buildExtensions(o: ExtOptions = {}): AnyExtension[] {
  const nv = o.nodeViews || {};
  return [
    StarterKit.configure({
      codeBlock: false,
      heading: { levels: [2, 3, 4] },
      // avtomatik havola faqat http(s):// yoki www. bilan — «F.I.Sh.», «t.me» kabi qisqartmalar havolaga aylanmasin
      link: {
        openOnClick: !o.editable,
        autolink: true,
        defaultProtocol: "https",
        shouldAutoLink: (url: string) => /^(https?:\/\/|www\.)/i.test(url),
        HTMLAttributes: { rel: "noopener noreferrer nofollow", target: null },
      },
      dropcursor: { color: "var(--accent)", width: 2 },
    }),
    CodeBlockLowlight.configure({ lowlight, defaultLanguage: "plaintext" }),
    Highlight.configure({ multicolor: false }),
    Subscript,
    Superscript,
    TextAlign.configure({ types: ["heading", "paragraph"] }),
    Typography,
    TaskList,
    TaskItem.configure({ nested: true }),
    TableKit.configure({ table: { resizable: !!o.editable } }),
    Youtube.configure({ nocookie: true, width: 720, height: 405, HTMLAttributes: { class: "embed-video" } }),
    Mathematics.configure({
      katexOptions: { throwOnError: false, strict: false },
      inlineOptions: { onClick: (node, pos) => o.onMathClick?.("inline", node.attrs.latex, pos) },
      blockOptions: { onClick: (node, pos) => o.onMathClick?.("block", node.attrs.latex, pos) },
    }),
    nv.chart || ChartNode,
    nv.callout || CalloutNode,
    nv.figure || FigureNode,
    nv.button || ButtonNode,
    nv.gallery || GalleryNode,
    nv.doc || DocNode,
    ...(o.extra || []),
  ];
}

/** Saqlangan HTML bo'lmasa (masalan, boshlang'ich kontent) — JSON dan HTML yaratish */
export function jsonToHtml(doc: JSONContent): string {
  try {
    return generateHTML(doc, buildExtensions());
  } catch {
    return "";
  }
}
