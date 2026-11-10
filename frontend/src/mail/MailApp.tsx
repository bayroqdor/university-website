// Veb-pochta: papkalar (kiruvchi, yulduzchali, qoralamalar, yuborilgan, arxiv, spam, savat, o'z papkalari), xatlar ro'yxati, o'qish oynasi, xat yozish
import {
  AlertOctagon,
  Archive,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Download,
  File as FileIcon,
  FilePen,
  Folder as FolderIcon,
  FolderPlus,
  Forward,
  Inbox,
  Mail,
  MailOpen,
  MoreHorizontal,
  Paperclip,
  Pencil,
  Printer,
  RefreshCw,
  Reply,
  ReplyAll,
  Search,
  Send,
  ShieldCheck,
  Star,
  Trash2,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useSearchParams } from "react-router-dom";
import "../styles/mail.css";
import { Modal, Btn, Input, useConfirm, useToast } from "../admin/ui";
import { ApiError, type Lang } from "../lib/api";
import {
  mail,
  STARRED,
  type Addr,
  type Draft,
  type Folder,
  type FolderRole,
  type FullMessage,
  type MailAction,
  type MailStatus,
  type Ref,
  type Summary,
} from "./api";
import { Compose, addrLabel, fmtSize } from "./Compose";
import { MAIL_DICTS, type MailDict } from "./i18n";

const LOCALE: Record<Lang, string> = {
  uz: "uz-UZ",
  ru: "ru-RU",
  en: "en-GB",
};
const ROLE_ICON: Record<FolderRole | "starred", ReactNode> = {
  inbox: <Inbox size={17} />,
  starred: <Star size={17} />,
  drafts: <FilePen size={17} />,
  sent: <Send size={17} />,
  archive: <Archive size={17} />,
  junk: <AlertOctagon size={17} />,
  trash: <Trash2 size={17} />,
};
const key = (r: Ref) => `${r.folder}\u0000${r.uid}`;
const esc = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const UZ_MONTHS = [
  "yanvar",
  "fevral",
  "mart",
  "aprel",
  "may",
  "iyun",
  "iyul",
  "avgust",
  "sentabr",
  "oktabr",
  "noyabr",
  "dekabr",
];
const pad = (n: number) => String(n).padStart(2, "0");

function fmtDate(iso: string, lang: Lang, t: MailDict, full = false): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const loc = LOCALE[lang];
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const dayMonth = (long: boolean) =>
    lang === "uz"
      ? `${d.getDate()}-${long ? UZ_MONTHS[d.getMonth()] : UZ_MONTHS[d.getMonth()].slice(0, 3)}`
      : d.toLocaleDateString(loc, {
          day: "numeric",
          month: long ? "long" : "short",
        });
  if (full) return `${dayMonth(true)} ${d.getFullYear()}, ${time}`;
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return time;
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return `${t.yesterday}, ${time}`;
  if (d.getFullYear() === now.getFullYear()) return dayMonth(false);
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
}

function folderLabel(f: Folder | undefined, t: MailDict): string {
  if (!f) return "";
  return f.role ? t[f.role] : f.name;
}

function avatarColor(s: string): string {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return `hsl(${h} 32% 40%)`;
}

function Avatar({ a, size = 36 }: { a: Addr; size?: number }) {
  const label = (a.name || a.email || "?").trim();
  return (
    <span
      className="ml-av"
      style={{
        width: size,
        height: size,
        background: avatarColor(a.email || label),
        fontSize: size * 0.42,
      }}
    >
      {label.slice(0, 1).toUpperCase()}
    </span>
  );
}

/** Xat matni: alohida (sandbox) iframe ichida — skriptlar ishlamaydi, havolalar yangi oynada */
function MessageBody({ html }: { html: string }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [h, setH] = useState(160);
  const doc = useMemo(
    () =>
      `<!doctype html><html><head><meta charset="utf-8"><base target="_blank"><meta name="referrer" content="no-referrer"><style>
html,body{margin:0;padding:0;background:#fff;color:#121418;font:14px/1.6 -apple-system,Segoe UI,Roboto,Arial,sans-serif;overflow-wrap:anywhere}
body{padding:2px 2px 12px}img{max-width:100%;height:auto}table{max-width:100%}blockquote{margin:8px 0;padding-left:12px;border-left:2px solid #e1e4ea;color:#565c69}
a{color:#0a2e73}pre{white-space:pre-wrap}</style></head><body>${html}</body></html>`,
    [html],
  );
  const fit = useCallback(() => {
    const d = ref.current?.contentDocument;
    if (d?.body)
      setH(Math.max(120, Math.min(d.documentElement.scrollHeight, 40000)));
  }, []);
  useEffect(() => {
    const id = window.setInterval(fit, 600);
    const stop = window.setTimeout(() => window.clearInterval(id), 6000);
    return () => {
      window.clearInterval(id);
      window.clearTimeout(stop);
    };
  }, [doc, fit]);
  return (
    <iframe
      ref={ref}
      className="ml-frame"
      title="mail"
      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      srcDoc={doc}
      style={{ height: h }}
      onLoad={fit}
    />
  );
}

function quoteHeader(m: FullMessage, lang: Lang, t: MailDict): string {
  return `${esc(fmtDate(m.date, lang, t, true))}, ${esc(m.from.name ? `${m.from.name} <${m.from.email}>` : m.from.email)} ${t.wrote}:`;
}

function addrList(list: Addr[]): string {
  return list
    .map((a) => esc(a.name ? `${a.name} <${a.email}>` : a.email))
    .join(", ");
}

export default function MailApp({ lang = "uz" }: { lang?: Lang }) {
  const t = MAIL_DICTS[lang] || MAIL_DICTS.uz;
  const toast = useToast();
  const confirm = useConfirm();
  const [sp, setSp] = useSearchParams();
  const folder = sp.get("f") || "INBOX";
  const openUid = Number(sp.get("m") || 0);
  const openFolder = sp.get("mf") || folder;
  const page = Number(sp.get("p") || 1);
  const [status, setStatus] = useState<MailStatus | null>(null);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [list, setList] = useState<{
    items: Summary[];
    total: number;
    pages: number;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState<FullMessage | null>(null);
  const [msgLoading, setMsgLoading] = useState(false);
  const [compose, setCompose] = useState<Draft | null>(null);
  const [composeKey, setComposeKey] = useState(0);
  const [folderModal, setFolderModal] = useState<{
    path?: string;
    name: string;
  } | null>(null);
  const [menu, setMenu] = useState(false);

  const nav = (p: Record<string, string | number | null>) => {
    const n = new URLSearchParams(sp);
    for (const [k, v] of Object.entries(p)) {
      if (v === null || v === "" || v === 0) n.delete(k);
      else n.set(k, String(v));
    }
    setSp(n);
  };
  const byRole = useMemo(
    () =>
      Object.fromEntries(
        folders.filter((f) => f.role).map((f) => [f.role, f]),
      ) as Partial<Record<FolderRole, Folder>>,
    [folders],
  );
  const cur =
    folder === STARRED ? undefined : folders.find((f) => f.path === folder);
  const curRole: FolderRole | "starred" | null =
    folder === STARRED ? "starred" : cur?.role || null;

  const fail = (e: unknown) => {
    const d = e instanceof ApiError ? e.detail : String(e);
    if (d === "mail_disabled") setStatus({ enabled: false });
    toast(
      `${t.unavailable}${d && d !== "mail_disabled" ? `: ${d}` : ""}`,
      "error",
    );
  };

  const loadFolders = useCallback(async () => {
    try {
      const r = await mail.folders();
      setFolders(r.items);
      setError("");
      window.dispatchEvent(
        new CustomEvent("uni-mail-unread", {
          detail: r.items.find((f) => f.role === "inbox")?.unread || 0,
        }),
      );
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : String(e));
    }
  }, []);
  const loadList = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const r = await mail.list(folder, page, query, unreadOnly);
        setList(r);
        setError("");
      } catch (e) {
        setError(e instanceof ApiError ? e.detail : String(e));
      } finally {
        setLoading(false);
      }
    },
    [folder, page, query, unreadOnly],
  );
  const reload = useCallback(() => {
    loadFolders();
    loadList(true);
  }, [loadFolders, loadList]);

  useEffect(() => {
    mail
      .status()
      .then(setStatus)
      .catch(() => setStatus({ enabled: false }));
  }, []);
  useEffect(() => {
    if (status?.enabled) loadFolders();
  }, [status, loadFolders]);
  useEffect(() => {
    if (!status?.enabled) return;
    setSel(new Set());
    loadList();
  }, [status, loadList]);
  useEffect(() => {
    if (!status?.enabled) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") reload();
    }, 60000);
    return () => window.clearInterval(id);
  }, [status, reload]);

  // xatni ochish
  useEffect(() => {
    if (!openUid || !status?.enabled) {
      setMsg(null);
      return;
    }
    let alive = true;
    setMsgLoading(true);
    mail
      .get(openFolder, openUid)
      .then((m) => {
        if (!alive) return;
        if (m.draft && m.role === "drafts") {
          openDraft(m);
          nav({ m: null, mf: null });
          return;
        }
        setMsg(m);
        setList(
          (l) =>
            l && {
              ...l,
              items: l.items.map((x) =>
                x.uid === m.uid && x.folder === m.folder
                  ? { ...x, seen: true }
                  : x,
              ),
            },
        );
        loadFolders();
      })
      .catch((e) => {
        if (alive) {
          setMsg(null);
          fail(e);
        }
      })
      .finally(() => alive && setMsgLoading(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openUid, openFolder, status]);

  const me = status?.address || "";
  const newDraft = (p: Partial<Draft> = {}): Draft => ({
    to: [],
    cc: [],
    bcc: [],
    subject: "",
    html: "",
    mode: "new",
    ...p,
  });
  const startCompose = (d: Draft) => {
    setCompose(d);
    setComposeKey((k) => k + 1);
  };
  const openDraft = (m: FullMessage) =>
    startCompose(
      newDraft({
        to: m.to,
        cc: m.cc,
        bcc: m.bcc,
        subject: m.subject,
        html: m.html,
        mode: "draft",
        draft_uid: m.uid,
        attach_from: {
          folder: m.folder,
          uid: m.uid,
          parts: m.attachments.map((a) => a.part),
        },
        inherited: m.attachments,
      }),
    );
  const reply = (m: FullMessage, all: boolean) => {
    const target = m.reply_to.length ? m.reply_to : [m.from];
    const sentByMe = m.from.email.toLowerCase() === me.toLowerCase();
    let to = sentByMe ? m.to : target;
    let cc: Addr[] = [];
    if (all) {
      const seen = new Set([
        me.toLowerCase(),
        ...to.map((a) => a.email.toLowerCase()),
      ]);
      cc = [...m.to, ...m.cc].filter(
        (a) =>
          !seen.has(a.email.toLowerCase()) && seen.add(a.email.toLowerCase()),
      );
    }
    to = to.filter(
      (a) => a.email.toLowerCase() !== me.toLowerCase() || sentByMe,
    );
    startCompose(
      newDraft({
        to,
        cc,
        subject: /^re:/i.test(m.subject) ? m.subject : `Re: ${m.subject}`,
        html: `<p></p><p>${quoteHeader(m, lang, t)}</p><blockquote>${m.html}</blockquote>`,
        in_reply_to: m.message_id,
        references: m.references,
        reply_to_msg: { folder: m.folder, uid: m.uid },
        mode: all ? "replyall" : "reply",
      }),
    );
  };
  const forward = (m: FullMessage) => {
    const parts = m.attachments.filter((a) => !a.inline).map((a) => a.part);
    startCompose(
      newDraft({
        subject: /^(fwd?|fw):/i.test(m.subject)
          ? m.subject
          : `Fwd: ${m.subject}`,
        html: `<p></p><p>---------- ${t.forwarded_msg} ----------<br>${t.from}: ${addrList([m.from])}<br>${esc(fmtDate(m.date, lang, t, true))}<br>${t.subject}: ${esc(m.subject)}<br>${t.to}: ${addrList(m.to)}</p><blockquote>${m.html}</blockquote>`,
        reply_to_msg: { folder: m.folder, uid: m.uid },
        mode: "forward",
        attach_from: { folder: m.folder, uid: m.uid, parts },
        inherited: m.attachments.filter((a) => !a.inline),
      }),
    );
  };

  const act = async (action: MailAction, refs: Ref[], dest?: string) => {
    if (!refs.length) return;
    if (action === "destroy" && !(await confirm(t.delete_forever + "?", true)))
      return;
    try {
      const r = await mail.action(action, refs, dest);
      const closing = [
        "delete",
        "destroy",
        "spam",
        "notspam",
        "archive",
        "inbox",
        "move",
      ].includes(action);
      if (closing) {
        toast(
          action === "delete"
            ? r.result === "trashed"
              ? t.trashed
              : t.deleted
            : action === "destroy"
              ? t.deleted
              : t.moved,
        );
        if (
          msg &&
          refs.some((x) => x.uid === msg.uid && x.folder === msg.folder)
        )
          nav({ m: null, mf: null });
      } else if (
        msg &&
        refs.some((x) => x.uid === msg.uid && x.folder === msg.folder)
      ) {
        setMsg({
          ...msg,
          seen:
            action === "read" ? true : action === "unread" ? false : msg.seen,
          flagged:
            action === "flag"
              ? true
              : action === "unflag"
                ? false
                : msg.flagged,
        });
        if (action === "unread") nav({ m: null, mf: null });
      }
      setSel(new Set());
      reload();
    } catch (e) {
      fail(e);
    }
  };
  const selRefs = (): Ref[] =>
    (list?.items || []).filter((x) => sel.has(key(x)));

  // ---------------------------------------------------------- holatlar
  if (!status)
    return (
      <div className="ml-shell ml-center">
        <RefreshCw className="spin" size={22} />
      </div>
    );
  if (!status.enabled)
    return (
      <div className="ml-shell ml-center">
        <div className="ml-off">
          <Mail size={40} />
          <b>{t.disabled_title}</b>
          <p>{t.disabled_hint}</p>
        </div>
      </div>
    );

  const items = list?.items || [];
  const allSel = items.length > 0 && items.every((x) => sel.has(key(x)));
  const custom = folders.filter((f) => !f.role);
  const moveTargets = folders.filter(
    (f) => f.path !== folder && f.role !== "drafts",
  );
  const bulk = selRefs();
  const isTrashLike = curRole === "trash" || curRole === "junk";

  const FolderBtn = ({
    path,
    role,
    label,
    count,
    total,
  }: {
    path: string;
    role: FolderRole | "starred" | null;
    label: string;
    count: number;
    total?: number;
  }) => (
    <button
      className={`ml-folder ${folder === path ? "on" : ""} ${count ? "has" : ""}`}
      onClick={() => {
        setQ("");
        setQuery("");
        nav({ f: path === "INBOX" ? null : path, m: null, mf: null, p: null });
      }}
      title={total !== undefined ? `${label}: ${total}` : label}
    >
      {role ? ROLE_ICON[role] : <FolderIcon size={17} />}
      <span>{label}</span>
      {count > 0 && <i>{count > 999 ? "999+" : count}</i>}
    </button>
  );

  return (
    <div className={`ml-shell ${msg || msgLoading ? "reading" : ""}`}>
      {/* ---------------- papkalar */}
      <aside className="ml-side">
        <button className="ml-compose" onClick={() => startCompose(newDraft())}>
          <Pencil size={17} /> {t.compose}
        </button>
        <div className="ml-folders">
          {(["inbox"] as FolderRole[]).map(
            (r) =>
              byRole[r] && (
                <FolderBtn
                  key={r}
                  path={byRole[r]!.path}
                  role={r}
                  label={t[r]}
                  count={byRole[r]!.unread}
                  total={byRole[r]!.total}
                />
              ),
          )}
          <FolderBtn
            path={STARRED}
            role="starred"
            label={t.starred}
            count={0}
          />
          {(["drafts", "sent", "archive", "junk", "trash"] as FolderRole[]).map(
            (r) =>
              byRole[r] && (
                <FolderBtn
                  key={r}
                  path={byRole[r]!.path}
                  role={r}
                  label={t[r]}
                  count={
                    r === "drafts"
                      ? byRole[r]!.total
                      : r === "sent" || r === "trash"
                        ? 0
                        : byRole[r]!.unread
                  }
                  total={byRole[r]!.total}
                />
              ),
          )}
          <div className="ml-folders-h">
            <span>{t.folders}</span>
            <button
              onClick={() => setFolderModal({ name: "" })}
              title={t.new_folder}
            >
              <FolderPlus size={15} />
            </button>
          </div>
          {custom.map((f) => (
            <FolderBtn
              key={f.path}
              path={f.path}
              role={null}
              label={f.path.replace(
                new RegExp(`\\${f.delim || "/"}`, "g"),
                " / ",
              )}
              count={f.unread}
              total={f.total}
            />
          ))}
        </div>
        <div className="ml-me" title={t.your_address}>
          <Mail size={14} />
          <span>{status.address}</span>
        </div>
        {(status.imap || status.smtp) && (
          <details className="ml-setup">
            <summary>{t.client_setup}</summary>
            {status.imap && (
              <div>
                IMAP: <code>{status.imap}</code>
              </div>
            )}
            {status.smtp && (
              <div>
                SMTP: <code>{status.smtp}</code>
              </div>
            )}
            <p>{t.password_same}</p>
          </details>
        )}
      </aside>

      {/* ---------------- ro'yxat */}
      <section className="ml-list">
        <div className="ml-bar">
          <form
            className="ml-search"
            onSubmit={(e) => {
              e.preventDefault();
              setQuery(q.trim());
              nav({ p: null, m: null, mf: null });
            }}
          >
            <Search size={16} />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t.search}
            />
            {query && (
              <button
                type="button"
                onClick={() => {
                  setQ("");
                  setQuery("");
                }}
                aria-label={t.close}
              >
                <X size={14} />
              </button>
            )}
          </form>
        </div>
        <div className="ml-bar ml-tools">
          <label className="ml-chk" title={t.select_all}>
            <input
              type="checkbox"
              checked={allSel}
              onChange={() =>
                setSel(allSel ? new Set() : new Set(items.map(key)))
              }
            />
          </label>
          {bulk.length > 0 ? (
            <>
              <span className="ml-count">
                {bulk.length} {t.selected}
              </span>
              <button onClick={() => act("read", bulk)} title={t.mark_read}>
                <MailOpen size={16} />
              </button>
              <button onClick={() => act("unread", bulk)} title={t.mark_unread}>
                <Mail size={16} />
              </button>
              <button onClick={() => act("flag", bulk)} title={t.star}>
                <Star size={16} />
              </button>
              {curRole !== "archive" && (
                <button
                  onClick={() => act("archive", bulk)}
                  title={t.to_archive}
                >
                  <Archive size={16} />
                </button>
              )}
              {curRole === "junk" ? (
                <button onClick={() => act("notspam", bulk)} title={t.not_spam}>
                  <ShieldCheck size={16} />
                </button>
              ) : (
                <button onClick={() => act("spam", bulk)} title={t.to_spam}>
                  <AlertOctagon size={16} />
                </button>
              )}
              <button
                className="danger"
                onClick={() => act(isTrashLike ? "destroy" : "delete", bulk)}
                title={isTrashLike ? t.delete_forever : t.delete}
              >
                <Trash2 size={16} />
              </button>
              <select
                className="ml-move"
                value=""
                onChange={(e) =>
                  e.target.value && act("move", bulk, e.target.value)
                }
                title={t.move_to}
              >
                <option value="">{t.move_to}</option>
                {moveTargets.map((f) => (
                  <option key={f.path} value={f.path}>
                    {folderLabel(f, t)}
                  </option>
                ))}
              </select>
            </>
          ) : (
            <>
              <button
                onClick={reload}
                title={t.refresh}
                className={loading ? "spinning" : ""}
              >
                <RefreshCw size={16} />
              </button>
              <button
                className={unreadOnly ? "on" : ""}
                onClick={() => {
                  setUnreadOnly(!unreadOnly);
                  nav({ p: null });
                }}
                title={t.only_unread}
              >
                <Mail size={16} />
              </button>
              <div className="ml-more">
                <button onClick={() => setMenu(!menu)} title="…">
                  <MoreHorizontal size={16} />
                </button>
                {menu && (
                  <div className="ml-menu" onMouseLeave={() => setMenu(false)}>
                    {folder !== STARRED && (
                      <button
                        onClick={() => {
                          setMenu(false);
                          mail.readAll(folder).then(reload).catch(fail);
                        }}
                      >
                        {t.mark_all_read}
                      </button>
                    )}
                    {isTrashLike && (
                      <button
                        className="danger"
                        onClick={async () => {
                          setMenu(false);
                          if (await confirm(t.empty_q, true))
                            mail
                              .empty(folder)
                              .then(() => {
                                toast(t.deleted);
                                reload();
                              })
                              .catch(fail);
                        }}
                      >
                        {t.empty_folder}
                      </button>
                    )}
                    {cur && !cur.role && (
                      <>
                        <button
                          onClick={() => {
                            setMenu(false);
                            setFolderModal({ path: cur.path, name: cur.name });
                          }}
                        >
                          {t.rename}
                        </button>
                        <button
                          className="danger"
                          onClick={async () => {
                            setMenu(false);
                            if (await confirm(t.delete_folder_q, true))
                              mail
                                .deleteFolder(cur.path)
                                .then(() => {
                                  nav({ f: null, m: null, mf: null });
                                  loadFolders();
                                })
                                .catch(fail);
                          }}
                        >
                          {t.delete_folder}
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
          <span className="ml-pager">
            {list && list.total > 0 && (
              <>
                <small>{list.total}</small>
                <button
                  disabled={page <= 1}
                  onClick={() => nav({ p: page - 1 })}
                  aria-label="prev"
                >
                  <ChevronLeft size={16} />
                </button>
                <small>
                  {page}
                  {t.of === "/" ? "/" : ` ${t.of} `}
                  {list.pages}
                </small>
                <button
                  disabled={page >= list.pages}
                  onClick={() => nav({ p: page + 1 })}
                  aria-label="next"
                >
                  <ChevronRight size={16} />
                </button>
              </>
            )}
          </span>
        </div>
        <div className="ml-title">
          {curRole ? ROLE_ICON[curRole] : <FolderIcon size={17} />}
          <b>
            {folder === STARRED ? t.starred : folderLabel(cur, t) || folder}
          </b>
          {query && <small>«{query}»</small>}
        </div>
        <div className="ml-rows">
          {error && !items.length ? (
            <div className="ml-empty">
              <AlertOctagon size={30} />
              <b>{t.unavailable}</b>
              <small>{error}</small>
              <Btn onClick={reload}>{t.retry}</Btn>
            </div>
          ) : loading && !list ? (
            Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="ml-row ghost" />
            ))
          ) : !items.length ? (
            <div className="ml-empty">
              {curRole ? ROLE_ICON[curRole] : <FolderIcon size={30} />}
              <b>{query ? t.no_results : t.no_messages}</b>
              {!query && <small>{t.no_messages_hint}</small>}
            </div>
          ) : (
            items.map((x) => {
              const k = key(x);
              const other =
                curRole === "sent" || curRole === "drafts"
                  ? x.to[0] || { name: "", email: "" }
                  : x.from;
              const on = msg && msg.uid === x.uid && msg.folder === x.folder;
              return (
                <div
                  key={k}
                  className={`ml-row ${x.seen ? "" : "unread"} ${on ? "on" : ""} ${sel.has(k) ? "sel" : ""}`}
                  onClick={() =>
                    nav({ m: x.uid, mf: x.folder !== folder ? x.folder : null })
                  }
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) =>
                    e.key === "Enter" &&
                    nav({ m: x.uid, mf: x.folder !== folder ? x.folder : null })
                  }
                >
                  <label
                    className="ml-chk"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      checked={sel.has(k)}
                      onChange={() => {
                        const n = new Set(sel);
                        if (n.has(k)) n.delete(k);
                        else n.add(k);
                        setSel(n);
                      }}
                    />
                  </label>
                  <button
                    className={`ml-star ${x.flagged ? "on" : ""}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      act(x.flagged ? "unflag" : "flag", [x]);
                    }}
                    aria-label={t.star}
                  >
                    <Star size={16} />
                  </button>
                  <Avatar a={other} size={34} />
                  <div className="ml-row-main">
                    <div className="ml-row-top">
                      <b className="ml-from">
                        {curRole === "sent" || curRole === "drafts"
                          ? `${t.to}: `
                          : ""}
                        {addrLabel(other) || "—"}
                        {x.draft && curRole !== "drafts" && (
                          <em> · {t.drafts}</em>
                        )}
                      </b>
                      <span className="ml-date">
                        {fmtDate(x.date, lang, t)}
                      </span>
                    </div>
                    <div className="ml-subj">
                      {x.answered && <Reply size={12} />}
                      {x.forwarded && <Forward size={12} />}
                      <span>{x.subject || t.no_subject}</span>
                      {x.attach && <Paperclip size={13} />}
                    </div>
                    <div className="ml-snip">{x.snippet}</div>
                    {folder === STARRED && (
                      <span className="ml-tag">
                        {folderLabel(
                          folders.find((f) => f.path === x.folder),
                          t,
                        )}
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>

      {/* ---------------- o'qish */}
      <section className="ml-read">
        {msgLoading && !msg ? (
          <div className="ml-center">
            <RefreshCw className="spin" size={22} />
          </div>
        ) : !msg ? (
          <div className="ml-empty big">
            <MailOpen size={44} />
            <b>{t.pick_message}</b>
            <small>{t.pick_hint}</small>
          </div>
        ) : (
          <article className="ml-msg">
            <div className="ml-msg-bar">
              <button
                className="ml-back"
                onClick={() => nav({ m: null, mf: null })}
                title={t.back}
              >
                <ArrowLeft size={17} />
              </button>
              <button onClick={() => reply(msg, false)} title={t.reply}>
                <Reply size={17} />
              </button>
              <button onClick={() => reply(msg, true)} title={t.reply_all}>
                <ReplyAll size={17} />
              </button>
              <button onClick={() => forward(msg)} title={t.forward}>
                <Forward size={17} />
              </button>
              <i />
              <button
                className={msg.flagged ? "on star" : ""}
                onClick={() => act(msg.flagged ? "unflag" : "flag", [msg])}
                title={msg.flagged ? t.unstar : t.star}
              >
                <Star size={17} />
              </button>
              <button
                onClick={() => act("unread", [msg])}
                title={t.mark_unread}
              >
                <Mail size={17} />
              </button>
              {msg.role !== "archive" && (
                <button
                  onClick={() => act("archive", [msg])}
                  title={t.to_archive}
                >
                  <Archive size={17} />
                </button>
              )}
              {msg.role === "junk" ? (
                <button
                  onClick={() => act("notspam", [msg])}
                  title={t.not_spam}
                >
                  <ShieldCheck size={17} />
                </button>
              ) : (
                <button onClick={() => act("spam", [msg])} title={t.to_spam}>
                  <AlertOctagon size={17} />
                </button>
              )}
              <button
                className="danger"
                onClick={() =>
                  act(
                    msg.role === "trash" || msg.role === "junk"
                      ? "destroy"
                      : "delete",
                    [msg],
                  )
                }
                title={t.delete}
              >
                <Trash2 size={17} />
              </button>
              <select
                className="ml-move"
                value=""
                onChange={(e) =>
                  e.target.value && act("move", [msg], e.target.value)
                }
                title={t.move_to}
              >
                <option value="">{t.move_to}</option>
                {folders
                  .filter((f) => f.path !== msg.folder && f.role !== "drafts")
                  .map((f) => (
                    <option key={f.path} value={f.path}>
                      {folderLabel(f, t)}
                    </option>
                  ))}
              </select>
              <span className="grow" />
              <button
                onClick={() => printMessage(msg, lang, t)}
                title={t.print}
              >
                <Printer size={17} />
              </button>
              <a href={mail.rawUrl(msg.folder, msg.uid)} title={t.download_eml}>
                <Download size={17} />
              </a>
            </div>
            <h2 className="ml-msg-subj">{msg.subject || t.no_subject}</h2>
            <div className="ml-msg-head">
              <Avatar a={msg.from} size={42} />
              <div className="ml-msg-who">
                <div>
                  <b>{msg.from.name || msg.from.email}</b>{" "}
                  {msg.from.name && (
                    <span className="ml-mail">&lt;{msg.from.email}&gt;</span>
                  )}
                </div>
                <div className="ml-msg-to">
                  {t.to}:{" "}
                  {msg.to
                    .map((a) =>
                      a.email.toLowerCase() === me.toLowerCase()
                        ? t.me
                        : addrLabel(a),
                    )
                    .join(", ") || "—"}
                  {msg.cc.length > 0 && (
                    <>
                      {" "}
                      · {t.cc}: {msg.cc.map(addrLabel).join(", ")}
                    </>
                  )}
                  {msg.bcc.length > 0 && (
                    <>
                      {" "}
                      · {t.bcc}: {msg.bcc.map(addrLabel).join(", ")}
                    </>
                  )}
                </div>
              </div>
              <time className="ml-msg-date">
                {fmtDate(msg.date, lang, t, true)}
              </time>
            </div>
            <MessageBody html={msg.html} />
            {msg.attachments.filter((a) => !a.inline).length > 0 && (
              <div className="ml-atts">
                <div className="ml-atts-h">
                  <Paperclip size={14} /> {t.attachments} (
                  {msg.attachments.filter((a) => !a.inline).length})
                </div>
                <div className="ml-atts-list">
                  {msg.attachments
                    .filter((a) => !a.inline)
                    .map((a) => (
                      <a
                        key={a.part}
                        className="ml-att"
                        href={mail.attUrl(msg.folder, msg.uid, a.part)}
                        title={a.name}
                      >
                        {a.type.startsWith("image/") ? (
                          <img
                            src={mail.attUrl(msg.folder, msg.uid, a.part, true)}
                            alt=""
                            loading="lazy"
                          />
                        ) : (
                          <span className="ml-att-ic">
                            {a.type === "application/pdf" ? (
                              "PDF"
                            ) : (
                              <FileIcon size={22} />
                            )}
                          </span>
                        )}
                        <span className="ml-att-name">
                          <b>{a.name}</b>
                          <small>{fmtSize(a.size)}</small>
                        </span>
                        <Download size={15} />
                      </a>
                    ))}
                </div>
              </div>
            )}
            <div className="ml-quick">
              <button onClick={() => reply(msg, false)}>
                <Reply size={15} /> {t.reply}
              </button>
              {msg.to.length + msg.cc.length > 1 && (
                <button onClick={() => reply(msg, true)}>
                  <ReplyAll size={15} /> {t.reply_all}
                </button>
              )}
              <button onClick={() => forward(msg)}>
                <Forward size={15} /> {t.forward}
              </button>
            </div>
          </article>
        )}
      </section>

      {compose && (
        <Compose
          key={composeKey}
          initial={compose}
          t={t}
          maxMb={status.max_attach_mb || 20}
          draftsFolder={byRole.drafts?.path || "Drafts"}
          onClose={() => {
            setCompose(null);
            reload();
          }}
          onSent={reload}
        />
      )}

      <Modal
        open={!!folderModal}
        onClose={() => setFolderModal(null)}
        title={folderModal?.path ? t.rename : t.new_folder}
        width={420}
        footer={
          <>
            <Btn onClick={() => setFolderModal(null)}>{t.close}</Btn>
            <Btn
              kind="primary"
              icon={<FolderPlus size={15} />}
              disabled={!folderModal?.name.trim()}
              onClick={async () => {
                if (!folderModal) return;
                try {
                  const r = folderModal.path
                    ? await mail.renameFolder(
                        folderModal.path,
                        folderModal.name,
                      )
                    : await mail.createFolder(folderModal.name);
                  setFolderModal(null);
                  await loadFolders();
                  nav({ f: r.path, m: null, mf: null, p: null });
                } catch (e) {
                  fail(e);
                }
              }}
            >
              OK
            </Btn>
          </>
        }
      >
        <label className="a-field">
          <span className="a-label">{t.folder_name}</span>
          <Input
            autoFocus
            value={folderModal?.name || ""}
            onChange={(e) =>
              folderModal &&
              setFolderModal({ ...folderModal, name: e.target.value })
            }
            maxLength={80}
          />
        </label>
      </Modal>
    </div>
  );
}

function printMessage(m: FullMessage, lang: Lang, t: MailDict) {
  const w = window.open("", "_blank", "noopener=no,width=900,height=700");
  if (!w) return;
  w.document
    .write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(m.subject)}</title><style>body{font:14px/1.6 Arial,sans-serif;color:#111;margin:32px}h1{font-size:20px;margin:0 0 12px}.h{border-bottom:1px solid #ccc;padding-bottom:10px;margin-bottom:16px;color:#333}img{max-width:100%}blockquote{border-left:3px solid #ccc;margin:8px 0;padding-left:12px;color:#555}</style></head><body>
<h1>${esc(m.subject || t.no_subject)}</h1><div class="h"><div><b>${t.from}:</b> ${addrList([m.from])}</div><div><b>${t.to}:</b> ${addrList(m.to)}</div>${m.cc.length ? `<div><b>${t.cc}:</b> ${addrList(m.cc)}</div>` : ""}<div>${esc(fmtDate(m.date, lang, t, true))}</div>${
    m.attachments.filter((a) => !a.inline).length
      ? `<div><b>${t.attachments}:</b> ${m.attachments
          .filter((a) => !a.inline)
          .map((a) => esc(a.name))
          .join(", ")}</div>`
      : ""
  }</div>${m.html}</body></html>`);
  w.document.close();
  w.focus();
  window.setTimeout(() => w.print(), 400);
}

/** Kabinet menyusidagi «Pochta» yonidagi o'qilmagan xatlar soni (har daqiqada yangilanadi) */
export function useMailUnread(enabledHint = true): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!enabledHint) return;
    let alive = true;
    let timer = 0;
    const tick = async () => {
      try {
        const r = await mail.folders();
        if (alive) setN(r.items.find((f) => f.role === "inbox")?.unread || 0);
      } catch {
        /* pochta o'chirilgan yoki server javob bermadi */
        return;
      }
      if (alive) timer = window.setTimeout(tick, 90000);
    };
    mail
      .status()
      .then((s) => {
        if (s.enabled) tick();
      })
      .catch(() => null);
    const onEv = (e: Event) => setN(Number((e as CustomEvent).detail) || 0);
    window.addEventListener("uni-mail-unread", onEv);
    return () => {
      alive = false;
      window.clearTimeout(timer);
      window.removeEventListener("uni-mail-unread", onEv);
    };
  }, [enabledHint]);
  return n;
}
