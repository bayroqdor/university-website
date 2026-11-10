// Tahrirlagichdagi maxsus bloklar ko'rinishi (React node view)
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer, type ReactNodeViewProps } from "@tiptap/react";
import katex from "katex";
import "katex/contrib/mhchem";
import { ArrowLeft, ArrowRight, FileText, ImagePlus, Pencil, Replace, Trash2, Upload } from "lucide-react";
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Btn, Field, Input, Modal } from "../admin/ui";
import type { ChartConfig } from "../rich/chart";
import { ChartView } from "../rich/ChartView";
import { ButtonNode, CalloutNode, ChartNode, DocNode, FigureNode, GalleryNode } from "../rich/nodes";
import { DocViewer } from "../rich/DocViewer";
import { Carousel, type Slide } from "../rich/Carousel";
import type { ImportedImage } from "./ImageSearch";

export interface EditorUI {
  openChart: (initial: ChartConfig | null, onSave: (c: ChartConfig) => void) => void;
  openMath: (initial: { latex: string; kind: "inline" | "block" }, onSave: (latex: string, kind: "inline" | "block") => void) => void;
  pickImage: (onPick: (url: string) => void) => void;
  /** ochiq rasm bazasidan (Openverse) qidirish — rasm serverga ko'chiriladi, muallif / litsenziya bilan qaytadi */
  searchImage: (onPick: (r: ImportedImage) => void) => void;
  promptUrl: (title: string, placeholder: string, onOk: (url: string) => void) => void;
  /** PDF / skaner hujjat faylini tanlab yuklash */
  pickDoc: (onPick: (url: string, name: string) => void) => void;
  /** rasm yuklash: admin panelda — media kutubxonasi, kabinetda — foydalanuvchi yuklamalari */
  upload: (f: File) => Promise<{ url: string }>;
}
export const EditorUICtx = createContext<EditorUI | null>(null);
const useUI = () => useContext(EditorUICtx)!;

/* ------------------------------------------------------------------ grafik */
function ChartView_({ node, updateAttributes, deleteNode, selected }: ReactNodeViewProps) {
  const ui = useUI();
  const config = node.attrs.config as ChartConfig | null;
  return (
    <NodeViewWrapper className={`nv nv-chart ${selected ? "selected" : ""}`} data-drag-handle="">
      <div className="nv-tools" contentEditable={false}>
        <Btn size="sm" icon={<Pencil size={14} />} onClick={() => ui.openChart(config, (c) => updateAttributes({ config: c }))}>
          Tahrirlash
        </Btn>
        <Btn size="sm" kind="ghost" icon={<Trash2 size={14} />} onClick={deleteNode} title="O‘chirish" />
      </div>
      <div contentEditable={false} onDoubleClick={() => ui.openChart(config, (c) => updateAttributes({ config: c }))}>
        {config ? <ChartView config={config} /> : <div className="nv-empty">Grafik sozlanmagan</div>}
      </div>
    </NodeViewWrapper>
  );
}

/* ------------------------------------------------------------------ izohli rasm */
const WIDTHS = [
  ["small", "Kichik"],
  ["normal", "Oddiy"],
  ["wide", "Keng"],
  ["full", "To‘liq"],
] as const;

export const NO_CREDIT = { credit: "", creditUrl: "", source: "", sourceUrl: "", license: "", licenseUrl: "" };
export const creditAttrs = (r: ImportedImage) => ({
  credit: r.credit.creator || "",
  creditUrl: r.credit.creator_url || "",
  source: r.credit.source || "",
  sourceUrl: r.credit.source_url || "",
  license: r.credit.license || "",
  licenseUrl: r.credit.license_url || "",
});

/** Ochiq litsenziyali rasm muallifi (o'zgartirilmaydi — litsenziya talabi): «Foto: muallif / manba, litsenziya» */
function CreditLine({ a }: { a: Record<string, unknown> }) {
  const s = (k: string) => String(a[k] || "").trim();
  const href = (k: string) => (/^https?:\/\//i.test(s(k)) ? s(k) : "");
  const link = (text: string, k: string) => (href(k) ? <a href={href(k)} target="_blank" rel="noopener noreferrer nofollow">{text}</a> : text);
  const who = s("credit");
  const src = s("source");
  const lic = s("license");
  if (!who && !src && !lic) return null;
  return (
    <span className="nv-credit">
      Foto: {who && link(who, "creditUrl")}
      {src && (who ? " / " : "")}
      {src && link(src, "sourceUrl")}
      {lic && (who || src ? ", " : "")}
      {lic && link(lic, "licenseUrl")}
    </span>
  );
}

function FigureView({ node, updateAttributes, deleteNode, selected }: ReactNodeViewProps) {
  const ui = useUI();
  const { src, alt, caption, width } = node.attrs as { src: string; alt: string; caption: string; width: string };
  return (
    <NodeViewWrapper className={`nv nv-figure figure w-${width} ${selected ? "selected" : ""}`}>
      <div className="nv-tools" contentEditable={false}>
        <div className="nv-seg">
          {WIDTHS.map(([k, l]) => (
            <button key={k} className={width === k ? "on" : ""} onClick={() => updateAttributes({ width: k })}>
              {l}
            </button>
          ))}
        </div>
        <Btn size="sm" icon={<Replace size={14} />} onClick={() => ui.pickImage((u) => updateAttributes({ src: u, ...NO_CREDIT }))} title="Almashtirish" />
        <Btn size="sm" kind="ghost" icon={<Trash2 size={14} />} onClick={deleteNode} title="O‘chirish" />
      </div>
      <img src={src} alt={alt} data-drag-handle="" draggable={false} contentEditable={false} />
      <div className="nv-caption" contentEditable={false}>
        <input value={caption} placeholder="Rasm izohi (ixtiyoriy)" onChange={(e) => updateAttributes({ caption: e.target.value })} />
        <input className="alt" value={alt} placeholder="Alt matn (ko‘rish imkoniyati cheklanganlar va SEO uchun)" onChange={(e) => updateAttributes({ alt: e.target.value })} />
        <CreditLine a={node.attrs} />
      </div>
    </NodeViewWrapper>
  );
}

/* ------------------------------------------------------------------ rasmlar karuseli */
const RATIOS = [
  ["1 / 1", "1:1"],
  ["4 / 3", "4:3"],
  ["16 / 9", "16:9"],
] as const;

function GalleryView({ node, updateAttributes, deleteNode, selected }: ReactNodeViewProps) {
  const ui = useUI();
  const images = (node.attrs.images || []) as Slide[];
  const ratio = (node.attrs.ratio as string) || "4 / 3";
  const [cur, setCur] = useState(0);
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const setImages = (list: Slide[]) => updateAttributes({ images: list });
  const i = Math.min(cur, Math.max(0, images.length - 1));
  const move = (d: number) => {
    const j = i + d;
    if (j < 0 || j >= images.length) return;
    const list = [...images];
    [list[i], list[j]] = [list[j], list[i]];
    setImages(list);
    setCur(j);
  };
  return (
    <NodeViewWrapper className={`nv nv-gallery ${selected ? "selected" : ""}`}>
      <div className="nv-tools" contentEditable={false}>
        <div className="nv-seg">
          {RATIOS.map(([k, l]) => (
            <button key={k} className={ratio === k ? "on" : ""} onClick={() => updateAttributes({ ratio: k })}>
              {l}
            </button>
          ))}
        </div>
        <Btn size="sm" icon={<ImagePlus size={14} />} onClick={() => ui.pickImage((u) => setImages([...images, { src: u, alt: "" }]))}>
          Rasm qo‘shish
        </Btn>
        <Btn size="sm" icon={<Upload size={14} />} busy={busy} onClick={() => file.current?.click()} title="Bir nechta rasmni birdan yuklash" />
        <input
          ref={file}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={async (e) => {
            const files = Array.from(e.target.files || []);
            e.target.value = "";
            if (!files.length) return;
            setBusy(true);
            const added: Slide[] = [];
            for (const f of files) {
              try {
                const m = await ui.upload(f);
                added.push({ src: m.url, alt: "" });
              } catch {
                /* o'tkazib yuboriladi */
              }
            }
            setImages([...images, ...added]);
            setBusy(false);
          }}
        />
        <Btn size="sm" kind="ghost" icon={<Trash2 size={14} />} onClick={deleteNode} title="Karuselni o‘chirish" />
      </div>
      <div contentEditable={false}>
        {images.length ? <Carousel images={images} ratio={ratio} onIndex={setCur} /> : <div className="nv-empty">Rasm qo‘shing — bir nechta rasm yon tugmalar va nuqtalar bilan ko‘rsatiladi</div>}
      </div>
      {images.length > 0 && (
        <div className="nv-caption nv-gal-tools" contentEditable={false}>
          <span className="nv-gal-n">
            {i + 1}/{images.length}
          </span>
          <button onClick={() => move(-1)} disabled={i === 0} title="Chapga">
            <ArrowLeft size={14} />
          </button>
          <button onClick={() => move(1)} disabled={i >= images.length - 1} title="O‘ngga">
            <ArrowRight size={14} />
          </button>
          <input value={images[i]?.alt || ""} placeholder="Shu rasm izohi (ixtiyoriy)" onChange={(e) => setImages(images.map((x, k) => (k === i ? { ...x, alt: e.target.value } : x)))} />
          <button
            className="danger"
            onClick={() => {
              setImages(images.filter((_, k) => k !== i));
              setCur(Math.max(0, i - 1));
            }}
            title="Shu rasmni olib tashlash"
          >
            <Trash2 size={14} />
          </button>
        </div>
      )}
    </NodeViewWrapper>
  );
}

/* ------------------------------------------------------------------ izoh bloki */
const EMOJIS = ["💡", "📌", "⚠️", "✅", "❗", "🔬", "📊", "🧪", "📝", "ℹ️", "🎯", "🔥"];
const TONES = [
  ["accent", "Urg‘u"],
  ["info", "Ma’lumot"],
  ["warn", "Ogohlantirish"],
  ["success", "Muvaffaqiyat"],
  ["plain", "Oddiy"],
] as const;

function CalloutView({ node, updateAttributes }: ReactNodeViewProps) {
  const [open, setOpen] = useState(false);
  return (
    <NodeViewWrapper as="aside" className="callout nv-callout" data-tone={node.attrs.tone}>
      <span className="callout-emoji" contentEditable={false}>
        <button onClick={() => setOpen(!open)} title="Belgini tanlash">
          {node.attrs.emoji}
        </button>
        {open && (
          <span className="nv-pop">
            {EMOJIS.map((e) => (
              <button
                key={e}
                onClick={() => {
                  updateAttributes({ emoji: e });
                  setOpen(false);
                }}
              >
                {e}
              </button>
            ))}
            <span className="nv-pop-tones">
              {TONES.map(([k, l]) => (
                <button key={k} className={node.attrs.tone === k ? "on" : ""} onClick={() => updateAttributes({ tone: k })}>
                  {l}
                </button>
              ))}
            </span>
          </span>
        )}
      </span>
      <NodeViewContent className="callout-body" />
    </NodeViewWrapper>
  );
}

/* ------------------------------------------------------------------ tugma */
function ButtonView({ node, updateAttributes, deleteNode, selected }: ReactNodeViewProps) {
  const { label, url, align } = node.attrs as { label: string; url: string; align: string };
  return (
    <NodeViewWrapper className={`nv nv-button btn-card align-${align} ${selected ? "selected" : ""}`}>
      <span className="btn-cta" data-drag-handle="">
        {label || "Tugma"}
      </span>
      <div className="nv-button-form" contentEditable={false}>
        <input value={label} onChange={(e) => updateAttributes({ label: e.target.value })} placeholder="Tugma matni" />
        <input value={url} onChange={(e) => updateAttributes({ url: e.target.value })} placeholder="https://…" />
        <select value={align} onChange={(e) => updateAttributes({ align: e.target.value })}>
          <option value="left">Chapda</option>
          <option value="center">Markazda</option>
          <option value="right">O‘ngda</option>
        </select>
        <button onClick={deleteNode} title="O‘chirish">
          <Trash2 size={14} />
        </button>
      </div>
    </NodeViewWrapper>
  );
}

/** Hujjat bloki: tahrirlagichda ham jonli ko'rinadi (sarlavhani shu yerda o'zgartirish mumkin) */
function DocView({ node, updateAttributes, deleteNode, selected }: ReactNodeViewProps) {
  const { src, title } = node.attrs as { src: string; title: string };
  const [show, setShow] = useState(false);
  return (
    <NodeViewWrapper className={`nv nv-doc ${selected ? "selected" : ""}`}>
      <div className="nv-doc-head" contentEditable={false} data-drag-handle="">
        <FileText size={18} />
        <input value={title} onChange={(e) => updateAttributes({ title: e.target.value })} placeholder="Hujjat nomi" />
        <button type="button" onClick={() => setShow(!show)}>
          {show ? "Yopish" : "Ko‘rish"}
        </button>
        <button type="button" onClick={deleteNode} title="O‘chirish">
          <Trash2 size={14} />
        </button>
      </div>
      <small className="nv-doc-src" contentEditable={false}>
        {src} — saytda sahifaning o‘zida ochiq ko‘rinadi
      </small>
      {show && (
        <div className="prose" contentEditable={false}>
          <DocViewer src={src} title={title} />
        </div>
      )}
    </NodeViewWrapper>
  );
}

/** Inputlarda yozishni ProseMirror ushlab olmasligi uchun */
const stopInputs = ({ event }: { event: Event }) => {
  const t = event.target as HTMLElement | null;
  return !!t && /^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(t.tagName);
};

export const EditorNodeViews = {
  chart: ChartNode.extend({ addNodeView: () => ReactNodeViewRenderer(ChartView_, { stopEvent: stopInputs }) }),
  figure: FigureNode.extend({ addNodeView: () => ReactNodeViewRenderer(FigureView, { stopEvent: stopInputs }) }),
  callout: CalloutNode.extend({ addNodeView: () => ReactNodeViewRenderer(CalloutView, { stopEvent: stopInputs }) }),
  button: ButtonNode.extend({ addNodeView: () => ReactNodeViewRenderer(ButtonView, { stopEvent: stopInputs }) }),
  gallery: GalleryNode.extend({ addNodeView: () => ReactNodeViewRenderer(GalleryView, { stopEvent: stopInputs }) }),
  doc: DocNode.extend({ addNodeView: () => ReactNodeViewRenderer(DocView, { stopEvent: stopInputs }) }),
};

/* ------------------------------------------------------------------ formula oynasi */
const SNIPPETS: [string, string][] = [
  ["\\frac{a}{b}", "a/b"],
  ["\\sqrt{x}", "√x"],
  ["x^{2}", "x²"],
  ["x_{i}", "xᵢ"],
  ["\\sum_{i=1}^{n}", "Σ"],
  ["\\int_{a}^{b} f(x)\\,dx", "∫"],
  ["\\lim_{x \\to 0}", "lim"],
  ["\\frac{d}{dx}", "d/dx"],
  ["\\partial", "∂"],
  ["\\Delta", "Δ"],
  ["\\alpha", "α"],
  ["\\beta", "β"],
  ["\\gamma", "γ"],
  ["\\lambda", "λ"],
  ["\\mu", "μ"],
  ["\\sigma", "σ"],
  ["\\pm", "±"],
  ["\\cdot", "·"],
  ["\\times", "×"],
  ["\\approx", "≈"],
  ["\\leq", "≤"],
  ["\\geq", "≥"],
  ["\\rightarrow", "→"],
  ["\\mathrm{mg/kg}", "mg/kg"],
  ["\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}", "matritsa"],
  ["\\ce{H2O}", "H₂O"],
];

export function MathModal({ open, initial, onClose, onSave }: { open: boolean; initial: { latex: string; kind: "inline" | "block" }; onClose: () => void; onSave: (latex: string, kind: "inline" | "block") => void }) {
  const [latex, setLatex] = useState(initial.latex);
  const [kind, setKind] = useState(initial.kind);
  const ta = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (open) {
      setLatex(initial.latex);
      setKind(initial.kind);
      setTimeout(() => ta.current?.focus(), 50);
    }
  }, [open, initial]);
  const html = useMemo(() => {
    try {
      return { ok: true, html: katex.renderToString(latex || "\\;", { displayMode: kind === "block", throwOnError: true }) };
    } catch (e) {
      return { ok: false, html: String((e as Error).message) };
    }
  }, [latex, kind]);
  const insert = (s: string) => {
    const el = ta.current;
    if (!el) return setLatex(latex + s);
    const a = el.selectionStart;
    const b = el.selectionEnd;
    const next = latex.slice(0, a) + s + latex.slice(b);
    setLatex(next);
    setTimeout(() => {
      el.focus();
      el.selectionStart = el.selectionEnd = a + s.length;
    }, 0);
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Formula (LaTeX)"
      width={760}
      footer={
        <>
          <Btn onClick={onClose}>Bekor qilish</Btn>
          <Btn kind="primary" disabled={!latex.trim()} onClick={() => onSave(latex.trim(), kind)}>
            Saqlash
          </Btn>
        </>
      }
    >
      <div className="a-seg" style={{ marginBottom: 12 }}>
        <button className={kind === "block" ? "on" : ""} onClick={() => setKind("block")}>
          Alohida qatorda
        </button>
        <button className={kind === "inline" ? "on" : ""} onClick={() => setKind("inline")}>
          Matn ichida
        </button>
      </div>
      <div className="math-snips">
        {SNIPPETS.map(([s, l]) => (
          <button key={s} onClick={() => insert(s)} title={s}>
            {l}
          </button>
        ))}
      </div>
      <Field label="LaTeX">
        <textarea
          ref={ta}
          className="a-input mono"
          rows={4}
          value={latex}
          onChange={(e) => setLatex(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) onSave(latex.trim(), kind);
          }}
          placeholder="E = mc^2"
          spellCheck={false}
        />
      </Field>
      <div className={`math-preview ${html.ok ? "" : "bad"}`} dangerouslySetInnerHTML={{ __html: html.ok ? html.html : html.html }} />
      <p className="a-hint">Ctrl+Enter — saqlash. Matn ichida tez yozish: $$E=mc^2$$ (ikki dollar belgisi orasida).</p>
    </Modal>
  );
}

export function UrlModal({ open, title, placeholder, onClose, onOk }: { open: boolean; title: string; placeholder: string; onClose: () => void; onOk: (u: string) => void }) {
  const [v, setV] = useState("");
  useEffect(() => {
    if (open) setV("");
  }, [open]);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      width={520}
      footer={
        <>
          <Btn onClick={onClose}>Bekor qilish</Btn>
          <Btn kind="primary" disabled={!v.trim()} onClick={() => onOk(v.trim())}>
            Qo‘shish
          </Btn>
        </>
      }
    >
      <Input autoFocus value={v} onChange={(e) => setV(e.target.value)} placeholder={placeholder} onKeyDown={(e) => e.key === "Enter" && v.trim() && onOk(v.trim())} />
    </Modal>
  );
}
