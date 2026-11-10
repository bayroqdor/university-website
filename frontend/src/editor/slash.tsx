// «/» buyruqlar menyusi: blok qo'shish (Ghost uslubida)
import { computePosition, flip, offset, shift } from "@floating-ui/dom";
import { Extension, type Editor, type Range } from "@tiptap/core";
import { ReactRenderer } from "@tiptap/react";
import Suggestion, { type SuggestionProps } from "@tiptap/suggestion";
import {
  AreaChart,
  BarChart3,
  CheckSquare,
  Code2,
  Gauge,
  Heading2,
  Heading3,
  Heading4,
  Image,
  ImageDown,
  LineChart,
  List,
  ListOrdered,
  Megaphone,
  Minus,
  MousePointerClick,
  PieChart,
  Quote,
  ScatterChart,
  Sigma,
  SquareFunction,
  Table,
  Text,
  Clapperboard,
  GalleryHorizontal,
  FileText,
  Link2,
} from "lucide-react";
import { forwardRef, useEffect, useImperativeHandle, useState, type ReactNode } from "react";
import { defaultConfig, type ChartType } from "../rich/chart";
import { creditAttrs, type EditorUI } from "./nodeviews";

export interface SlashItem {
  title: string;
  hint: string;
  group: string;
  keys: string;
  icon: ReactNode;
  run: (editor: Editor, range: Range, ui: EditorUI) => void;
}

const chart = (type: ChartType) => (e: Editor, r: Range, ui: EditorUI) => {
  e.chain().focus().deleteRange(r).run();
  ui.openChart(defaultConfig(type), (c) => e.chain().focus().insertChart(c).run());
};

export const SLASH_ITEMS: SlashItem[] = [
  { group: "Matn", title: "Matn", hint: "oddiy xatboshi", keys: "text paragraph matn", icon: <Text size={18} />, run: (e, r) => e.chain().focus().deleteRange(r).setParagraph().run() },
  { group: "Matn", title: "Sarlavha 2", hint: "katta bo‘lim", keys: "h2 heading sarlavha", icon: <Heading2 size={18} />, run: (e, r) => e.chain().focus().deleteRange(r).setHeading({ level: 2 }).run() },
  { group: "Matn", title: "Sarlavha 3", hint: "kichik bo‘lim", keys: "h3 heading sarlavha", icon: <Heading3 size={18} />, run: (e, r) => e.chain().focus().deleteRange(r).setHeading({ level: 3 }).run() },
  { group: "Matn", title: "Sarlavha 4", hint: "qism sarlavha", keys: "h4 heading", icon: <Heading4 size={18} />, run: (e, r) => e.chain().focus().deleteRange(r).setHeading({ level: 4 }).run() },
  { group: "Matn", title: "Belgili ro‘yxat", hint: "• elementlar", keys: "bullet list royxat", icon: <List size={18} />, run: (e, r) => e.chain().focus().deleteRange(r).toggleBulletList().run() },
  { group: "Matn", title: "Raqamli ro‘yxat", hint: "1. 2. 3.", keys: "ordered number list", icon: <ListOrdered size={18} />, run: (e, r) => e.chain().focus().deleteRange(r).toggleOrderedList().run() },
  { group: "Matn", title: "Vazifalar", hint: "☐ belgilanadigan ro‘yxat", keys: "todo task checklist vazifa", icon: <CheckSquare size={18} />, run: (e, r) => e.chain().focus().deleteRange(r).toggleTaskList().run() },
  { group: "Matn", title: "Iqtibos", hint: "ajratilgan fikr", keys: "quote blockquote iqtibos", icon: <Quote size={18} />, run: (e, r) => e.chain().focus().deleteRange(r).toggleBlockquote().run() },
  { group: "Matn", title: "Izoh bloki", hint: "💡 muhim ma’lumot", keys: "callout note izoh", icon: <Megaphone size={18} />, run: (e, r) => e.chain().focus().deleteRange(r).setCallout({ emoji: "💡", tone: "accent" }).run() },
  { group: "Ilmiy", title: "Formula", hint: "LaTeX, alohida qatorda", keys: "math formula latex tenglama equation", icon: <Sigma size={18} />, run: (e, r, ui) => { e.chain().focus().deleteRange(r).run(); ui.openMath({ latex: "", kind: "block" }, (l, k) => (k === "block" ? e.chain().focus().insertBlockMath({ latex: l }).run() : e.chain().focus().insertInlineMath({ latex: l }).run())); } },
  { group: "Ilmiy", title: "Formula (matn ichida)", hint: "qator ichidagi LaTeX", keys: "inline math formula", icon: <Sigma size={18} />, run: (e, r, ui) => { e.chain().focus().deleteRange(r).run(); ui.openMath({ latex: "", kind: "inline" }, (l, k) => (k === "block" ? e.chain().focus().insertBlockMath({ latex: l }).run() : e.chain().focus().insertInlineMath({ latex: l }).run())); } },
  { group: "Ilmiy", title: "Jadval", hint: "3 × 3", keys: "table jadval", icon: <Table size={18} />, run: (e, r) => e.chain().focus().deleteRange(r).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
  { group: "Ilmiy", title: "Kod", hint: "sintaksis ranglari bilan", keys: "code kod python", icon: <Code2 size={18} />, run: (e, r) => e.chain().focus().deleteRange(r).toggleCodeBlock().run() },
  { group: "Grafik", title: "Chiziqli grafik", hint: "o‘lchov natijalari", keys: "chart line grafik chiziq", icon: <LineChart size={18} />, run: chart("line") },
  { group: "Grafik", title: "Funksiya grafigi", hint: "y = f(x), slayderli parametrlar", keys: "function funksiya plot formula grafik", icon: <SquareFunction size={18} />, run: chart("function") },
  { group: "Grafik", title: "Ustunli grafik", hint: "toifalar bo‘yicha", keys: "bar ustun chart", icon: <BarChart3 size={18} />, run: chart("bar") },
  { group: "Grafik", title: "Nuqtali grafik", hint: "tarqoqlik diagrammasi", keys: "scatter nuqta", icon: <ScatterChart size={18} />, run: chart("scatter") },
  { group: "Grafik", title: "Maydonli grafik", hint: "to‘ldirilgan", keys: "area maydon", icon: <AreaChart size={18} />, run: chart("area") },
  { group: "Grafik", title: "Shkala", hint: "strelkali ko‘rsatkich", keys: "gauge shkala scale", icon: <Gauge size={18} />, run: chart("gauge") },
  { group: "Grafik", title: "Doiraviy", hint: "ulushlar", keys: "pie doira", icon: <PieChart size={18} />, run: chart("pie") },
  { group: "Media", title: "Rasm", hint: "yuklash yoki kutubxonadan", keys: "image rasm photo", icon: <Image size={18} />, run: (e, r, ui) => { e.chain().focus().deleteRange(r).run(); ui.pickImage((u) => e.chain().focus().setFigure({ src: u, width: "normal" }).run()); } },
  { group: "Media", title: "Ochiq rasm bazasi", hint: "Openverse, muallif va litsenziya bilan", keys: "openverse rasm qidirish image search photo foto stock cc", icon: <ImageDown size={18} />, run: (e, r, ui) => { e.chain().focus().deleteRange(r).run(); ui.searchImage((x) => e.chain().focus().setFigure({ src: x.url, alt: x.alt, width: "normal", ...creditAttrs(x) }).run()); } },
  { group: "Media", title: "Rasmlar karuseli", hint: "bir nechta rasm, yon tugmalar va nuqtalar", keys: "gallery carousel karusel kollaj slider rasmlar", icon: <GalleryHorizontal size={18} />, run: (e, r, ui) => { e.chain().focus().deleteRange(r).run(); ui.pickImage((u) => e.chain().focus().insertGallery({ images: [{ src: u, alt: "" }], ratio: "4 / 3" }).run()); } },
  { group: "Media", title: "YouTube video", hint: "havola orqali", keys: "video youtube", icon: <Clapperboard size={18} />, run: (e, r, ui) => { e.chain().focus().deleteRange(r).run(); ui.promptUrl("YouTube video havolasi", "https://www.youtube.com/watch?v=…", (u) => e.chain().focus().setYoutubeVideo({ src: u }).run()); } },
  { group: "Media", title: "Hujjat (PDF, skaner)", hint: "sahifada jonli ko‘rinadi", keys: "pdf hujjat document skaner scan buyruq nizom fayl", icon: <FileText size={18} />, run: (e, r, ui) => { e.chain().focus().deleteRange(r).run(); ui.pickDoc((u, n) => e.chain().focus().insertDoc({ src: u, title: n }).run()); } },
  { group: "Media", title: "Hujjat havolasi", hint: "Google Drive yoki PDF manzili", keys: "drive google pdf havola hujjat link document", icon: <Link2 size={18} />, run: (e, r, ui) => { e.chain().focus().deleteRange(r).run(); ui.promptUrl("Hujjat havolasi (Google Drive yoki .pdf)", "https://drive.google.com/file/d/…/view", (u) => e.chain().focus().insertDoc({ src: u, title: "" }).run()); } },
  { group: "Media", title: "Tugma", hint: "havolali tugma", keys: "button tugma cta", icon: <MousePointerClick size={18} />, run: (e, r) => e.chain().focus().deleteRange(r).insertButton({ label: "Batafsil", url: "", align: "left" }).run() },
  { group: "Media", title: "Ajratgich", hint: "✦ ✦ ✦", keys: "divider hr ajratgich", icon: <Minus size={18} />, run: (e, r) => e.chain().focus().deleteRange(r).setHorizontalRule().run() },
];

interface ListRef {
  onKeyDown: (e: KeyboardEvent) => boolean;
}

const SlashList = forwardRef<ListRef, SuggestionProps<SlashItem> & { ui: EditorUI }>(function SlashList(props, ref) {
  const [sel, setSel] = useState(0);
  useEffect(() => setSel(0), [props.items]);
  const pick = (i: number) => {
    const it = props.items[i];
    if (it) it.run(props.editor, props.range, props.ui);
  };
  useImperativeHandle(ref, () => ({
    onKeyDown: (e) => {
      if (e.key === "ArrowDown") {
        setSel((s) => (s + 1) % Math.max(props.items.length, 1));
        return true;
      }
      if (e.key === "ArrowUp") {
        setSel((s) => (s - 1 + props.items.length) % Math.max(props.items.length, 1));
        return true;
      }
      if (e.key === "Enter") {
        pick(sel);
        return true;
      }
      return false;
    },
  }));
  useEffect(() => {
    document.querySelector(".slash-item.on")?.scrollIntoView({ block: "nearest" });
  }, [sel]);
  if (!props.items.length) return <div className="slash-menu empty">Hech narsa topilmadi</div>;
  let lastGroup = "";
  return (
    <div className="slash-menu">
      {props.items.map((it, i) => {
        const head = it.group !== lastGroup ? it.group : null;
        lastGroup = it.group;
        return (
          <div key={it.title}>
            {head && <div className="slash-group">{head}</div>}
            <button className={`slash-item ${i === sel ? "on" : ""}`} onMouseEnter={() => setSel(i)} onMouseDown={(e) => { e.preventDefault(); pick(i); }}>
              <span className="slash-ic">{it.icon}</span>
              <span>
                <b>{it.title}</b>
                <small>{it.hint}</small>
              </span>
            </button>
          </div>
        );
      })}
    </div>
  );
});

export function SlashCommand(uiRef: { current: EditorUI }) {
  return Extension.create({
    name: "slashCommand",
    addProseMirrorPlugins() {
      return [
        Suggestion<SlashItem>({
          editor: this.editor,
          char: "/",
          allowSpaces: false,
          startOfLine: false,
          items: ({ query }) => {
            const q = query.toLowerCase();
            return SLASH_ITEMS.filter((i) => !q || i.title.toLowerCase().includes(q) || i.keys.includes(q)).slice(0, 30);
          },
          command: ({ editor, range, props }) => props.run(editor, range, uiRef.current),
          render: () => {
            let comp: ReactRenderer<ListRef> | null = null;
            let el: HTMLElement | null = null;
            const place = (props: SuggestionProps<SlashItem>) => {
              const rect = props.clientRect?.();
              if (!rect || !el) return;
              const virtual = { getBoundingClientRect: () => rect };
              computePosition(virtual, el, { placement: "bottom-start", middleware: [offset(8), flip(), shift({ padding: 8 })] }).then(({ x, y }) => {
                if (el) Object.assign(el.style, { left: `${x}px`, top: `${y}px` });
              });
            };
            return {
              onStart: (props) => {
                comp = new ReactRenderer(SlashList, { props: { ...props, ui: uiRef.current }, editor: props.editor });
                el = document.createElement("div");
                el.className = "slash-pop";
                el.appendChild(comp.element);
                document.body.appendChild(el);
                place(props);
              },
              onUpdate: (props) => {
                comp?.updateProps({ ...props, ui: uiRef.current });
                place(props);
              },
              onKeyDown: ({ event }) => {
                if (event.key === "Escape") {
                  el?.remove();
                  return true;
                }
                return comp?.ref?.onKeyDown(event) ?? false;
              },
              onExit: () => {
                comp?.destroy();
                el?.remove();
                comp = null;
                el = null;
              },
            };
          },
        }),
      ];
    },
  });
}
