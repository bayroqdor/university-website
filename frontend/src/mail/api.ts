// Veb-pochta API mijozi (kabinetlar va admin panel uchun umumiy)
import { req } from "../lib/api";

export type FolderRole =
  | "inbox"
  | "drafts"
  | "sent"
  | "archive"
  | "junk"
  | "trash";
export interface Addr {
  name: string;
  email: string;
}
export interface Folder {
  path: string;
  name: string;
  role: FolderRole | null;
  delim: string;
  unread: number;
  total: number;
}
export interface MailStatus {
  enabled: boolean;
  address?: string;
  name?: string;
  domain?: string;
  max_attach_mb?: number;
  imap?: string;
  smtp?: string;
  groups?: boolean;
}
export interface Summary {
  uid: number;
  folder: string;
  from: Addr;
  to: Addr[];
  subject: string;
  date: string;
  seen: boolean;
  flagged: boolean;
  answered: boolean;
  forwarded: boolean;
  draft: boolean;
  size: number;
  attach: boolean;
  snippet: string;
}
export interface Attachment {
  part: number;
  name: string;
  type: string;
  size: number;
  cid: string;
  inline: boolean;
}
export interface FullMessage {
  uid: number;
  folder: string;
  role: FolderRole | null;
  subject: string;
  from: Addr;
  to: Addr[];
  cc: Addr[];
  bcc: Addr[];
  reply_to: Addr[];
  date: string;
  message_id: string;
  references: string;
  html: string;
  text: string;
  attachments: Attachment[];
  seen: boolean;
  flagged: boolean;
  answered: boolean;
  draft: boolean;
  size: number;
}
export interface Contact {
  type: "user" | "group";
  name: string;
  email: string;
  hint: string;
  photo?: string;
}
export interface Draft {
  to: Addr[];
  cc: Addr[];
  bcc: Addr[];
  subject: string;
  html: string;
  in_reply_to?: string;
  references?: string;
  reply_to_msg?: { folder: string; uid: number };
  mode?: "new" | "reply" | "replyall" | "forward" | "draft";
  draft_uid?: number | null;
  attach_from?: { folder: string; uid: number; parts: number[] };
  inherited?: Attachment[];
}
export type MailAction =
  | "read"
  | "unread"
  | "flag"
  | "unflag"
  | "delete"
  | "destroy"
  | "spam"
  | "notspam"
  | "archive"
  | "inbox"
  | "move";
export type Ref = { folder: string; uid: number };

export const STARRED = "@starred";

const enc = encodeURIComponent;

function form(d: Draft, files: File[]): FormData {
  const fd = new FormData();
  const { inherited: _i, ...payload } = d;
  void _i;
  fd.append("payload", JSON.stringify(payload));
  for (const f of files) fd.append("files", f, f.name);
  return fd;
}

export const mail = {
  status: () => req<MailStatus>("GET", "/api/mail/status"),
  folders: () => req<{ items: Folder[] }>("GET", "/api/mail/folders"),
  list: (folder: string, page = 1, q = "", unread = false) =>
    req<{ items: Summary[]; total: number; page: number; pages: number }>(
      "GET",
      `/api/mail/messages?folder=${enc(folder)}&page=${page}&q=${enc(q)}${unread ? "&unread=1" : ""}`,
    ),
  get: (folder: string, uid: number) =>
    req<FullMessage>(
      "GET",
      `/api/mail/message?folder=${enc(folder)}&uid=${uid}`,
    ),
  attUrl: (folder: string, uid: number, part: number, inline = false) =>
    `/api/mail/attachment?folder=${enc(folder)}&uid=${uid}&part=${part}${inline ? "&inline=1" : ""}`,
  rawUrl: (folder: string, uid: number) =>
    `/api/mail/raw?folder=${enc(folder)}&uid=${uid}`,
  send: (d: Draft, files: File[]) =>
    req<{ ok: boolean; recipients: number }>(
      "POST",
      "/api/mail/send",
      form(d, files),
    ),
  saveDraft: (d: Draft, files: File[]) =>
    req<{ uid: number | null; folder: string; saved: string }>(
      "POST",
      "/api/mail/draft",
      form(d, files),
    ),
  action: (action: MailAction, items: Ref[], dest?: string) =>
    req<{ ok: boolean; result: string }>("POST", "/api/mail/action", {
      action,
      items,
      dest,
    }),
  empty: (folder: string) =>
    req<{ removed: number }>("POST", "/api/mail/empty", { folder }),
  readAll: (folder: string) =>
    req<{ ok: boolean }>("POST", "/api/mail/read-all", { folder }),
  createFolder: (name: string) =>
    req<{ path: string }>("POST", "/api/mail/folders", { name }),
  renameFolder: (path: string, name: string) =>
    req<{ path: string }>("PUT", "/api/mail/folders", { path, name }),
  deleteFolder: (path: string) =>
    req<{ ok: boolean }>("DELETE", `/api/mail/folders?path=${enc(path)}`),
  contacts: (q: string) =>
    req<{ items: Contact[] }>("GET", `/api/mail/contacts?q=${enc(q)}`),
};

export interface MailAdmin {
  config: Record<string, string | number | boolean> & {
    enabled: boolean;
    domain: string;
    provision: string;
  };
  ready: boolean;
  state: {
    running: boolean;
    done: number;
    total: number;
    errors: number;
    finished: string | null;
  };
  log: { ok: boolean; what: string; detail: string; ts: string }[];
  users: number;
}
export interface DnsRecord {
  kind: string;
  type: string;
  host: string;
  fqdn: string;
  value: string;
  priority: number | null;
  ttl: number;
  why: string;
  required: boolean;
  placeholder?: boolean;
}
export interface DnsInfo {
  domain: string;
  mail_host: string;
  server_ip: string;
  source: "stalwart" | "generated";
  error: string;
  records: DnsRecord[];
  zone: string;
}
export const mailAdmin = {
  dns: (dmarc: string) => req<DnsInfo>("GET", `/api/admin/mail/dns?dmarc=${dmarc}`),
  get: () => req<MailAdmin>("GET", "/api/admin/mail"),
  save: (d: Record<string, unknown>) =>
    req<MailAdmin>("PUT", "/api/admin/mail", d),
  test: () =>
    req<{ checks: { name: string; ok: boolean; detail: string }[] }>(
      "POST",
      "/api/admin/mail/test",
    ),
  sync: () => req<MailAdmin>("POST", "/api/admin/mail/sync"),
};
