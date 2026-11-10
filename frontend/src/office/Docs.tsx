// ONLYOFFICE: kabinet / admin panelidagi «Hujjatlar» ilovasi, tahrirlagich sahifasi va saytdagi hujjatni ko'rish sahifasi
import { ArrowLeft, Download, FileSpreadsheet, FileText, FileType2, MoreHorizontal, Pencil, Plus, Presentation, Star, Trash2, Upload } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Btn, Empty, Field, Input, Modal, PageHead, Spinner, useConfirm, useRun, useToast } from "../admin/ui";
import { BrandMark } from "../lib/brand";
import { req } from "../lib/api";
import { PdfView } from "../rich/DocViewer";
import { createEditor, fmtSize, loadDocsApi, otOf, preloadDocsApi, uiType, type DocKind, type OfficeDict } from "./office";

export interface OfficeDoc {
  id: string;
  title: string;
  ext: string;
  kind: DocKind;
  size: number;
  version: number;
  editable: boolean;
  starred: boolean;
  created: string;
  updated: string;
  edited_by?: string | null;
}

const KIND_ICON: Record<string, typeof FileText> = { word: FileText, cell: FileSpreadsheet, slide: Presentation, pdf: FileType2 };

export function DocIcon({ kind, size = 22 }: { kind: string; size?: number }) {
  const I = KIND_ICON[kind] || FileText;
  return (
    <span className={`oo-ic k-${kind}`} aria-hidden>
      <I size={size} />
    </span>
  );
}

// ------------------------------------------------------------------ tahrirlagich (DocsAPI.DocEditor)
export function OfficeFrame({ server, config, t, onFail }: { server: string; config: unknown; t: OfficeDict; onFail?: () => void }) {
  const id = useMemo(() => `oo-${Math.random().toString(36).slice(2, 10)}`, []);
  const [err, setErr] = useState("");
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let ed: { destroyEditor: () => void } | null = null;
    let alive = true;
    loadDocsApi(server)
      .then(() => {
        if (!alive) return;
        const cfg = config as Record<string, unknown>;
        ed = createEditor(id, { ...cfg, events: { onAppReady: () => setReady(true), onError: () => setReady(true) } });
      })
      .catch(() => {
        if (!alive) return;
        setErr(t.unreachable);
        onFail?.();
      });
    return () => {
      alive = false;
      try {
        ed?.destroyEditor();
      } catch {
        /* */
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [server, config, id]);
  return (
    <div className="oo-frame">
      {!ready && !err && (
        <div className="oo-loading">
          <Spinner />
          <span>{t.loading}</span>
        </div>
      )}
      {err ? <div className="oo-err">{err}</div> : <div id={id} />}
    </div>
  );
}

// ------------------------------------------------------------------ «Yaratish» oynasi
const TYPES = [
  { ext: "docx", kind: "word" },
  { ext: "xlsx", kind: "cell" },
  { ext: "pptx", kind: "slide" },
] as const;

function CreateModal({ open, onClose, t, onCreate }: { open: boolean; onClose: () => void; t: OfficeDict; onCreate: (ext: string, title: string) => Promise<void> }) {
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState("");
  useEffect(() => {
    if (open) setTitle("");
  }, [open]);
  return (
    <Modal open={open} onClose={onClose} title={t.choose_type} width={720}>
      <div className="oo-types">
        {TYPES.map((x) => (
          <button
            key={x.ext}
            type="button"
            className={`oo-type k-${x.kind}`}
            disabled={!!busy}
            onClick={async () => {
              setBusy(x.ext);
              try {
                await onCreate(x.ext, title);
              } finally {
                setBusy("");
              }
            }}
          >
            <DocIcon kind={x.kind} size={30} />
            <b>{t[`t_${x.ext}` as keyof OfficeDict]}</b>
            {busy === x.ext && <Spinner />}
          </button>
        ))}
      </div>
      <Field label={t.name}>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t.name_ph} maxLength={200} />
      </Field>
    </Modal>
  );
}

// ------------------------------------------------------------------ ro'yxat
export function DocsPage({ lang }: { lang: string }) {
  const t = otOf(lang);
  const nav = useNavigate();
  const run = useRun();
  const toast = useToast();
  const confirm = useConfirm();
  const file = useRef<HTMLInputElement>(null);
  const [data, setData] = useState<{ items: OfficeDoc[]; enabled: boolean } | null>(null);
  const [create, setCreate] = useState(false);
  const [filter, setFilter] = useState<string>("");
  const [menu, setMenu] = useState("");
  const [ren, setRen] = useState<OfficeDoc | null>(null);
  const [up, setUp] = useState(false);
  const load = () => req<{ items: OfficeDoc[]; enabled: boolean }>("GET", "/api/docs").then(setData).catch(() => setData({ items: [], enabled: false }));
  useEffect(() => {
    load();
  }, []);
  // hujjat bosilguncha api.js tayyor bo'lsin (keyin faqat konfiguratsiya so'raladi)
  const enabled = !!data?.enabled;
  useEffect(() => {
    if (enabled) preloadDocsApi();
  }, [enabled]);
  useEffect(() => {
    const close = () => setMenu("");
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, []);
  if (!data) return <Spinner />;
  const items = data.items.filter((d) => !filter || (filter === "star" ? d.starred : d.kind === filter));
  // PDF — sahifa rasmlari bilan ko'riladi (ONLYOFFICE kerak emas); Word/Excel/PowerPoint — tahrirlagichda
  const open = (d: OfficeDoc) => (data.enabled || d.ext === "pdf" ? nav(d.id, { state: { doc: d } }) : (window.location.href = `/api/docs/${d.id}/download`));
  return (
    <div className="a-page oo">
      <PageHead
        title={t.docs}
        sub={t.docs_sub}
        actions={
          <>
            <Btn icon={<Upload size={15} />} busy={up} onClick={() => file.current?.click()}>
              {t.upload}
            </Btn>
            <Btn kind="primary" icon={<Plus size={16} />} onClick={() => setCreate(true)} disabled={!data.enabled}>
              {t.create}
            </Btn>
          </>
        }
      />
      <input
        ref={file}
        type="file"
        hidden
        accept=".docx,.doc,.odt,.rtf,.txt,.xlsx,.xls,.ods,.csv,.pptx,.ppt,.odp,.pdf"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          setUp(true);
          const fd = new FormData();
          fd.append("file", f);
          const d = await run(() => req<OfficeDoc>("POST", "/api/docs/upload", fd));
          setUp(false);
          if (d) {
            toast(d.title);
            load();
          }
        }}
      />
      {!data.enabled && <div className="a-card oo-off">{t.off}</div>}
      <div className="oo-quick">
        {TYPES.map((x) => (
          <button
            key={x.ext}
            type="button"
            className={`oo-quick-i k-${x.kind}`}
            disabled={!data.enabled}
            onClick={async () => {
              const d = await run(() => req<OfficeDoc>("POST", "/api/docs", { ext: x.ext }));
              if (d) nav(d.id);
            }}
          >
            <DocIcon kind={x.kind} size={26} />
            <span>
              <b>
                <Plus size={13} /> {t[`t_${x.ext}` as keyof OfficeDict]}
              </b>
            </span>
          </button>
        ))}
      </div>
      <div className="a-card oo-list">
        <div className="oo-filters a-seg">
          {[
            ["", t.all],
            ["word", t.t_docx],
            ["cell", t.t_xlsx],
            ["slide", t.t_pptx],
            ["star", t.starred],
          ].map(([k, label]) => (
            <button key={k} className={filter === k ? "on" : ""} onClick={() => setFilter(k)}>
              {label}
            </button>
          ))}
        </div>
        {items.length === 0 ? (
          <Empty icon={<FileText size={30} />} title={t.empty} />
        ) : (
          <ul className="oo-rows">
            {items.map((d) => (
              <li key={d.id} className="oo-row">
                <button type="button" className="oo-row-main" onClick={() => open(d)}>
                  <DocIcon kind={d.kind} />
                  <span className="oo-row-t">
                    <b>
                      {d.title}
                      <em>.{d.ext}</em>
                    </b>
                    <small>
                      {t.updated}: {new Date(d.updated).toLocaleString(lang === "en" ? "en-GB" : lang === "ru" ? "ru-RU" : "uz-UZ", { dateStyle: "medium", timeStyle: "short" })}
                      {d.edited_by ? ` · ${t.edited_by}: ${d.edited_by}` : ""} · {fmtSize(d.size)}
                      {!d.editable ? ` · ${t.view_only}` : ""}
                    </small>
                  </span>
                </button>
                <button
                  type="button"
                  className={`a-icon oo-star ${d.starred ? "on" : ""}`}
                  title={t.starred}
                  aria-pressed={d.starred}
                  onClick={async () => {
                    await run(() => req("PUT", `/api/docs/${d.id}`, { starred: !d.starred }));
                    load();
                  }}
                >
                  <Star size={17} />
                </button>
                <div className="oo-menu-w" onClick={(e) => e.stopPropagation()}>
                  <button type="button" className="a-icon" aria-label="…" onClick={() => setMenu(menu === d.id ? "" : d.id)}>
                    <MoreHorizontal size={18} />
                  </button>
                  {menu === d.id && (
                    <div className="oo-menu">
                      <button onClick={() => open(d)}>
                        <FileText size={15} /> {t.open}
                      </button>
                      <button
                        onClick={() => {
                          setMenu("");
                          setRen(d);
                        }}
                      >
                        <Pencil size={15} /> {t.rename}
                      </button>
                      <a href={`/api/docs/${d.id}/download`}>
                        <Download size={15} /> {t.download}
                      </a>
                      <button
                        className="danger"
                        onClick={async () => {
                          setMenu("");
                          if (await confirm(t.delete_q)) {
                            await run(() => req("DELETE", `/api/docs/${d.id}`));
                            load();
                          }
                        }}
                      >
                        <Trash2 size={15} /> {t.delete}
                      </button>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      <CreateModal
        open={create}
        onClose={() => setCreate(false)}
        t={t}
        onCreate={async (ext, title) => {
          const d = await run(() => req<OfficeDoc>("POST", "/api/docs", { ext, title }));
          if (d) {
            setCreate(false);
            nav(d.id);
          }
        }}
      />
      <Modal
        open={!!ren}
        onClose={() => setRen(null)}
        title={t.rename}
        width={460}
        footer={
          <Btn
            kind="primary"
            onClick={async () => {
              if (!ren) return;
              await run(() => req("PUT", `/api/docs/${ren.id}`, { title: ren.title }));
              setRen(null);
              load();
            }}
          >
            OK
          </Btn>
        }
      >
        {ren && (
          <Field label={t.name}>
            <Input value={ren.title} onChange={(e) => setRen({ ...ren, title: e.target.value })} maxLength={200} autoFocus />
          </Field>
        )}
      </Modal>
    </div>
  );
}

// ------------------------------------------------------------------ tahrirlagich sahifasi (kabinet / admin ichida)
export function DocEditorPage({ lang }: { lang: string }) {
  const t = otOf(lang);
  const { id = "" } = useParams();
  const known = (useLocation().state as { doc?: OfficeDoc } | null)?.doc;
  const [d, setD] = useState<{ config: unknown; server: string; doc: OfficeDoc } | null>(null);
  const [pdf, setPdf] = useState<OfficeDoc | null>(known?.id === id && known.ext === "pdf" ? known : null);
  const [err, setErr] = useState("");
  useEffect(() => {
    if (pdf?.id === id) return;
    preloadDocsApi(); // api.js konfiguratsiya bilan parallel yuklanadi
    const back = window.location.pathname.replace(/\/[^/]+$/, "");
    req<{ config: unknown; server: string; doc: OfficeDoc }>("GET", `/api/docs/${id}/editor?${new URLSearchParams({ lang, back, ui: uiType() })}`)
      .then((r) => (r.doc.ext === "pdf" ? setPdf(r.doc) : setD(r)))
      .catch((e) => {
        // ONLYOFFICE o'chiq bo'lsa ham PDF ko'rinadi (to'g'ridan-to'g'ri havola bilan ochilganda)
        const msg = String((e as { detail?: string }).detail || e);
        req<{ items: OfficeDoc[] }>("GET", "/api/docs")
          .then((l) => {
            const x = l.items.find((i) => i.id === id);
            if (x?.ext === "pdf") setPdf(x);
            else setErr(msg);
          })
          .catch(() => setErr(msg));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, lang]);
  const doc = pdf || d?.doc;
  return (
    <div className="a-page oo-edit">
      <div className="oo-edit-bar">
        <Link to=".." relative="path" className="a-btn ghost sm">
          <ArrowLeft size={15} />
          <span>{t.back}</span>
        </Link>
        {doc && (
          <>
            <DocIcon kind={doc.kind} size={18} />
            <b className="oo-edit-t">
              {doc.title}.{doc.ext}
            </b>
            <a className="a-btn sm" href={`/api/docs/${doc.id}/download`}>
              <Download size={14} />
              <span>{t.download}</span>
            </a>
          </>
        )}
      </div>
      {pdf ? (
        <div className="dv">
          <PdfView src={`/api/docs/${pdf.id}/download`} lang={lang} />
        </div>
      ) : err ? (
        <div className="a-card oo-off">{err === "office_disabled" ? t.off : err}</div>
      ) : d ? (
        <OfficeFrame server={d.server} config={d.config} t={t} />
      ) : (
        <Spinner />
      )}
    </div>
  );
}

// ------------------------------------------------------------------ hujjatni ONLYOFFICE'da ko'rish: /docs/view?src=/media/…&title=…
// Ochiq sayt bu sahifani endi ishlatmaydi (PDF — /document sahifasidagi pdf.js, Word/Excel — yuklab olish); to'g'ridan-to'g'ri havolalar uchun qoldirilgan.
export function DocViewPage() {
  const [sp] = useSearchParams();
  const src = sp.get("src") || "";
  const title = sp.get("title") || "";
  const lang = (() => {
    try {
      return localStorage.getItem("lang") || "uz";
    } catch {
      return "uz";
    }
  })();
  const t = otOf(lang);
  const [d, setD] = useState<{ config: unknown; server: string } | null>(null);
  useEffect(() => {
    if (!/^\/media\//.test(src)) {
      window.location.replace("/");
      return;
    }
    preloadDocsApi();
    req<{ config: unknown; server: string }>("GET", `/api/office/view?${new URLSearchParams({ src, title, lang, ui: uiType() })}`)
      .then(setD)
      .catch(() => window.location.replace(src)); // ONLYOFFICE o'chiq — fayl odatdagidek ochiladi
  }, [src, title, lang]);
  const name = title || decodeURIComponent(src.split("/").pop() || "");
  return (
    <div className="oo-view">
      <header className="oo-view-bar">
        <button type="button" className="oo-view-back" onClick={() => (window.history.length > 1 ? window.history.back() : (window.location.href = "/"))}>
          <ArrowLeft size={18} />
          <span>{t.back}</span>
        </button>
        <a href="/" className="oo-view-brand" aria-label="Home">
          <BrandMark size={30} />
        </a>
        <b className="oo-view-t">{name}</b>
        <a className="oo-view-dl" href={src} download>
          <Download size={16} />
          <span>{t.download}</span>
        </a>
      </header>
      <main className="oo-view-main">{d ? <OfficeFrame server={d.server} config={d.config} t={t} onFail={() => window.location.replace(src)} /> : <Spinner />}</main>
    </div>
  );
}
