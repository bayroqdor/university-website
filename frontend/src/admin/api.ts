// Admin API mijozi
import { req, type FormSettings, type Group, type Item, type OfficialForm, type Kind as ContentKind, type Lesson, type Role, type Room, type ScheduleChange, type Semester, type SiteSettings, type Subject, type TimeSlot, type Uni, type User, type WeekSchedule } from "../lib/api";
import type { TopResult } from "../lib/TopBar";

export type Kind = ContentKind;
export interface Admin extends User {
  role_id?: string;
  role_name?: string;
  perms?: string[];
}
export interface PermDef {
  key: string;
  group: string;
  label: string;
}
export interface AdminRole {
  id: string;
  name: string;
  description?: string;
  perms: string[];
  builtin?: boolean;
  users?: number;
}
export interface Section {
  id: string;
  name: string;
  users?: number;
}
export interface Profile {
  id?: string;
  slug?: string;
  position?: string;
  hours?: string;
  department_id?: string;
  faculty_id?: string;
  photo?: string;
  status?: string;
  featured?: boolean;
  category?: string;
  degree?: string;
  bio?: string;
  education?: string;
  experience?: string;
  interests?: string[];
  spoken?: string[];
  subjects?: string[];
  publications?: string;
  links?: { label: string; url: string }[];
  staff_id?: string;
}
export interface Person extends User {
  section_names?: string[];
  photo?: string;
  profile?: { id: string; status: string; category?: string; slug?: string; featured?: boolean } | null;
  profile_full?: Profile | null;
}
export interface Orphan {
  id: string;
  title: string;
  position?: string;
  photo?: string;
  status: string;
  category?: string;
}
export interface FacultyPerson {
  id: string;
  name: string;
  login: string;
  position: string;
  photo: string;
  member: boolean;
  editor: boolean;
  dean?: boolean;
  staff_id?: string;
  role?: string;
}

export interface Period {
  visitors: number;
  visits: number;
  pageviews: number;
  reads: number;
  new_subscribers: number;
  bounce_rate: number;
  avg_duration: number;
  pages_per_visit: number;
}

export interface Stats {
  days: number;
  current: Period;
  previous: Period;
  series: { days: string[]; visitors: number[]; visits: number[]; pageviews: number[]; reads: number[]; subscribers: number[] };
  top_pages: { path: string; views: number; visitors: number }[];
  top_items: { id: string; kind: string; title: string; slug: string; views: number; visitors: number; reads: number; avg_seconds: number; read_rate: number }[];
  devices: { name: string; value: number }[];
  browsers: { name: string; value: number }[];
  os: { name: string; value: number }[];
  langs: { name: string; value: number }[];
  referrers: { name: string; value: number }[];
  landing: { name: string; value: number }[];
  direct: number;
  heat: [number, number, number][];
  live: number;
  live_pages: { path: string; n: number }[];
  totals: Record<string, number>;
  items: Record<string, { published: number; total: number }>;
  today: string;
}

export interface Subscriber {
  id: string;
  email: string;
  name: string | null;
  status: "pending" | "active" | "unsubscribed";
  source: string | null;
  lang?: string | null;
  created: string;
  confirmed: string | null;
  unsubscribed: string | null;
}

export interface Message {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  subject: string | null;
  body: string;
  created: string;
  read: boolean;
}

export type LangMap = Partial<Record<"uz" | "ru" | "en", string>>;
export interface AdminPopup {
  id?: string;
  active: boolean;
  name: string;
  title: LangMap;
  body: LangMap;
  badge: LangMap;
  image: string;
  video: string;
  layout: "stack" | "split" | "cover";
  accent: string;
  buttons: { label: LangMap; url: string; style: "primary" | "ghost"; new_tab: boolean }[];
  start: string | null;
  end: string | null;
  frequency: "always" | "session" | "daily" | "once";
  delay: number;
  pages: "all" | "home" | "list";
  paths: string[];
  version?: number;
}
export interface FestiveHolidayCfg {
  enabled?: boolean;
  before?: number;
  after?: number;
  dates?: Record<string, string>;
  start?: string | null;
  end?: string | null;
  greeting?: LangMap;
  /** sahna uchun o'z surati (bo'sh — tayyor fotosurat) */
  image?: string | null;
}
export interface FestiveCustom {
  id?: string;
  enabled: boolean;
  style: string;
  start: string;
  end: string;
  name: LangMap;
  greeting: LangMap;
  image?: string | null;
}
export interface FestiveSettings {
  enabled: boolean;
  intensity: number;
  effects: Record<string, boolean>;
  holidays: Record<string, FestiveHolidayCfg>;
  custom: FestiveCustom[];
  force: string | null;
}
export interface FestiveHoliday {
  id: string;
  region: "uz";
  style: string;
  name: LangMap;
  greeting: LangMap;
  fixed: boolean;
  default_before: number;
  default_after: number;
  table: Record<string, string> | null;
  next: { start: string; end: string; day: string; now: boolean } | null;
}
export interface FestiveOverview {
  settings: FestiveSettings;
  holidays: FestiveHoliday[];
  styles: string[];
  effects: string[];
  today: string;
  active: { id: string; style: string; name: string; start: string; end: string; day: string } | null;
}
export interface Media {
  id: string;
  filename: string;
  original: string;
  mime: string;
  size: number;
  width: number | null;
  height: number | null;
  created: string;
  url: string;
}

export interface Smtp {
  host: string;
  port: number;
  security: "ssl" | "starttls" | "none";
  username: string;
  from_email: string;
  from_name: string;
  reply_to: string;
  enabled: boolean;
  has_password: boolean;
  configured: boolean;
  password?: string;
  clear_password?: boolean;
}

export interface Newsletter {
  id: string;
  item_id: string | null;
  subject: string;
  created: string;
  status: string;
  total: number;
  sent: number;
  failed: number;
  finished: string | null;
}

export interface EmailLog {
  id: number;
  ts: string;
  kind: string;
  recipient: string;
  subject: string;
  status: string;
  error: string;
}

export interface AcadOverview {
  counts: Record<string, number>;
  semester: Semester | null;
  semesters: Semester[];
  groups: Group[];
  subjects: Subject[];
  rooms: Room[];
  slots: TimeSlot[];
  teachers: User[];
  weekdays: string[];
}

export interface Availability {
  weekday: number;
  slot_id: string;
  conflicts: { kind: "group" | "teacher" | "room"; id: string; group_name: string; subject: string; teacher: string | null; room: string | null }[];
}
export interface ImportStatus {
  status: "idle" | "running" | "done" | "error";
  started: string | null;
  finished: string | null;
  error: string;
  stats: Record<string, number>;
  log: string[];
  base: string;
  done_once: boolean;
  running: boolean;
}
export interface ImportCreated {
  login: string;
  name: string;
  password: string;
  extra?: string;
  mail?: string;
}
export interface ImportResult {
  added: number;
  rows: number;
  skipped: { row: number; login: string; reason: string; warning?: boolean }[];
  created: ImportCreated[];
}
export interface Conflict {
  kind: "group" | "teacher" | "room";
  lesson: Partial<Lesson> & { id: string };
}

export interface AdminNotice {
  id: string;
  title: string;
  body: string;
  audience: string;
  group_id: string | null;
  group_name?: string | null;
  author?: string;
  pinned: number;
  created: string;
}

export type AcadTable = "semesters" | "time_slots" | "groups" | "subjects" | "rooms";

export interface FacultyOverview {
  id: string;
  title: string;
  slug: string | null;
  status: string;
  accent: string;
  members: number;
  dean: string;
  dean_photo: string;
}
export interface HemisConfig {
  enabled: boolean;
  api_url: string;
  portal_url: string;
  lang: string;
  sync_teachers: boolean;
  sync_students: boolean;
  sync_groups: boolean;
  sync_schedule: boolean;
  schedule_weeks: number;
  student_auth: boolean;
  auto_hours: number;
  cache_minutes: number;
  has_token: boolean;
}
export interface HemisStatus {
  last: { groups?: number[]; teachers?: number[]; students?: number[]; schedule?: number[]; errors?: string[]; started?: string; finished?: string } | null;
  state: { running?: boolean; step?: string };
  running: boolean;
  linked: { teacher: number; student: number };
  groups: number;
}
export interface S3Config {
  enabled: boolean;
  endpoint: string;
  region: string;
  bucket: string;
  access_key: string;
  prefix: string;
  public_url: string;
  path_style: boolean;
  keep_local: boolean;
  has_secret: boolean;
}
export interface StorageInfo {
  config: S3Config;
  media: { total: number; local: number };
  migration: { running?: boolean; total?: number; done?: number; failed?: number; error?: string; finished?: string };
}

export type TgKind = "news" | "announce" | "event" | "vacancy";
export interface TelegramGroup {
  chat_id: string;
  title: string;
  type: "group" | "supergroup" | "channel";
  username: string;
  status: string;
  can_post: boolean;
  added: string | null;
  confirmed: string | null;
  kinds: TgKind[];
  last_error: string;
  last_error_at: string | null;
  last_post: string | null;
}
export interface TelegramNetState {
  ipv4: boolean;
  ipv4_auto: boolean;
  ipv4_forced: boolean;
  ipv4_reason: string;
  ipv4_at: number | null;
  proxy: string;
  conflict_at: number | null;
  conflict_msg: string;
  conflict_recent: boolean;
}
export interface TelegramInfo {
  config: { enabled: boolean; username: string; mode: "polling" | "webhook"; welcome: string; has_token: boolean; ipv4?: boolean };
  running: boolean;
  error: string;
  chats: number;
  link: string;
  groups: TelegramGroup[];
  site_https: boolean;
  net: TelegramNetState;
  conflict: string;
}
export interface TgProbe {
  ip: string;
  ok: boolean;
  tcp_ms: number | null;
  tls_ms: number | null;
  err: string;
}
export interface TgTimed {
  ms: number;
  ok: boolean;
  err: string;
}
export interface TgHandlerRow {
  at: number;
  kind: string;
  ms: number;
  wait: number;
}
export interface TelegramSpeed {
  at: string;
  mode: "polling" | "webhook";
  enabled: boolean;
  running: boolean;
  polling: boolean;
  backlog: number;
  workers: number;
  net: {
    dns: { a: string[]; aaaa: string[]; a_ms: number; aaaa_ms: number; a_err: string; aaaa_err: string };
    ipv4: TgProbe | null;
    ipv6: TgProbe | null;
    getme: { cold: TgTimed; warm: TgTimed; pooled: TgTimed };
    proxy: string;
  };
  webhook: { url: string; pending_update_count: number; last_error_date: number | null; last_error_message: string | null; max_connections: number | null; ip_address: string | null } | null;
  webhook_error: string;
  our_webhook: string;
  state: TelegramNetState;
  stats: {
    since: number | null;
    handlers: { count: number; p50: number | null; p95: number | null; wait_p95: number | null; slowest: TgHandlerRow[] };
    calls: { count: number; p50: number | null; p95: number | null; errors: number; methods: { method: string; count: number; p50: number | null; p95: number | null; max: number; errors: number; last_error: string }[] };
  };
  verdicts: { level: "bad" | "warn" | "ok" | "info"; text: string }[];
}
export interface TelegramItemPost {
  chat_id: string;
  title: string;
  status: "sent" | "sending" | "error";
  error: string;
  at: string;
  edited?: string | null;
  edit_error?: string;
}

export interface TgMedia {
  url: string;
  type: "photo" | "video" | "document";
  name?: string;
  size?: number;
}
export interface TgButton {
  text: string;
  url: string;
}
export interface TgPostChat {
  chat_id: string;
  title: string;
  type: string;
  status: "pending" | "sent" | "error" | "deleted";
  message_ids: number[];
  error: string;
  sent_at: string | null;
  edited_at: string | null;
  link: string;
}
export type TgPostStatus = "draft" | "scheduled" | "sending" | "sent" | "partial" | "error";
export interface TgPost {
  id: string;
  html: string;
  doc: Record<string, unknown> | null;
  media: TgMedia[];
  buttons: TgButton[][];
  targets: string[];
  footer: boolean;
  silent: boolean;
  preview: boolean;
  status: TgPostStatus;
  scheduled_at: string | null;
  sent_at: string | null;
  created: string;
  updated: string;
  author: string;
  chats: TgPostChat[];
}
export interface TgFooter {
  html: string;
  default: string;
  custom: boolean;
}
export interface TgPostsInfo {
  posts: TgPost[];
  groups: TelegramGroup[];
  footer: TgFooter;
  enabled: boolean;
  limits: { text: number; caption: number; album: number; footer: number };
}
export type TgPostBody = Pick<TgPost, "html" | "doc" | "media" | "buttons" | "targets" | "footer" | "silent" | "preview" | "scheduled_at"> & {
  action?: "draft" | "send" | "schedule";
  delete_old?: boolean;
};
export interface TgPostResult {
  post: TgPost;
  send?: { sent: number; failed: number };
  edit?: { edited: number; failed: number };
  delete_failed?: { chat_id: string; title: string; error: string }[];
}

export const admin = {
  search: (q: string) => req<{ items: TopResult[] }>("GET", `/api/admin/search?${new URLSearchParams({ q })}`),
  login: (login: string, password: string) => req<{ admin: Admin; user: User; home: string }>("POST", "/api/admin/login", { login, password }),
  logout: () => req<{ ok: boolean }>("POST", "/api/admin/logout"),
  me: () => req<{ admin: Admin; version: string }>("GET", "/api/admin/me"),
  updateMe: (d: Partial<Admin>) => req<{ admin: Admin }>("PUT", "/api/admin/me", d),
  password: (current: string, next: string) => req<{ ok: boolean }>("POST", "/api/admin/password", { current, new: next }),
  admins: () => req<{ items: Admin[]; me: string; roles: AdminRole[] }>("GET", "/api/admin/admins"),
  addAdmin: (d: Record<string, unknown>) => req<Admin>("POST", "/api/admin/admins", d),
  updateAdmin: (id: string, d: Record<string, unknown>) => req<Admin>("PUT", `/api/admin/admins/${id}`, d),
  deleteAdmin: (id: string) => req<{ ok: boolean }>("DELETE", `/api/admin/admins/${id}`),
  roles: () => req<{ items: AdminRole[]; perms: PermDef[] }>("GET", "/api/admin/roles"),
  saveRoles: (items: AdminRole[]) => req<{ items: AdminRole[]; perms: PermDef[] }>("PUT", "/api/admin/roles", { items }),
  sections: () => req<{ items: Section[] }>("GET", "/api/admin/sections"),
  saveSections: (items: Section[]) => req<{ items: Section[] }>("PUT", "/api/admin/sections", { items }),
  photoCheck: (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return req<{ url: string }>("POST", "/api/admin/photo/check", fd);
  },
  myPhoto: (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return req<User>("POST", "/api/portal/photo", fd);
  },
  person: (id: string) => req<Person>("GET", `/api/admin/users/${id}`),
  people: (kind: "professors" | "staff", q = "") => req<{ items: Person[]; orphans: Orphan[]; sections: Section[] }>("GET", `/api/admin/people?kind=${kind}&q=${encodeURIComponent(q)}`),
  facultyPeople: (fid: string) => req<{ items: FacultyPerson[] }>("GET", `/api/admin/faculties/${fid}/people`),
  saveFacultyPeople: (fid: string, members: string[], editors: string[], dean?: string) =>
    req<{ items: FacultyPerson[] }>("PUT", `/api/admin/faculties/${fid}/people`, dean === undefined ? { members, editors } : { members, editors, dean }),
  facultyStaff: () => req<{ items: FacultyOverview[] }>("GET", "/api/admin/faculty-staff"),
  hemis: () => req<{ config: HemisConfig; status: HemisStatus }>("GET", "/api/admin/hemis"),
  saveHemis: (d: Partial<HemisConfig> & { token?: string }) => req<{ config: HemisConfig; status: HemisStatus }>("PUT", "/api/admin/hemis", d),
  testHemis: (d: Partial<HemisConfig> & { token?: string }) => req<{ ok: boolean; departments: number }>("POST", "/api/admin/hemis/test", d),
  syncHemis: () => req<{ started: boolean; status: HemisStatus }>("POST", "/api/admin/hemis/sync"),
  hemisStatus: () => req<HemisStatus>("GET", "/api/admin/hemis/status"),
  storage: () => req<StorageInfo>("GET", "/api/admin/storage"),
  saveStorage: (d: Partial<S3Config> & { secret_key?: string }) => req<StorageInfo>("PUT", "/api/admin/storage", d),
  testStorage: (d: Partial<S3Config> & { secret_key?: string }) => req<{ ok: boolean; bucket: string }>("POST", "/api/admin/storage/test", d),
  migrateStorage: () => req<{ started: boolean; total?: number }>("POST", "/api/admin/storage/migrate"),
  telegram: () => req<TelegramInfo>("GET", "/api/admin/telegram"),
  saveTelegram: (d: Record<string, unknown>) => req<TelegramInfo>("PUT", "/api/admin/telegram", d),
  tgGroupCheck: (chat: string) => req<TelegramInfo & { group: TelegramGroup }>("POST", "/api/admin/telegram/groups/check", { chat }),
  tgGroupConfirm: (id: string, confirmed: boolean) => req<TelegramInfo>("POST", `/api/admin/telegram/groups/${encodeURIComponent(id)}/confirm`, { confirmed }),
  tgGroupKinds: (id: string, kinds: TgKind[]) => req<TelegramInfo>("PUT", `/api/admin/telegram/groups/${encodeURIComponent(id)}`, { kinds }),
  tgGroupDelete: (id: string) => req<TelegramInfo>("DELETE", `/api/admin/telegram/groups/${encodeURIComponent(id)}`),
  tgGroupRetry: (id: string) => req<TelegramInfo>("POST", `/api/admin/telegram/groups/${encodeURIComponent(id)}/retry`),
  tgItem: (id: string) => req<{ posts: TelegramItemPost[]; groups: number }>("GET", `/api/admin/telegram/items/${encodeURIComponent(id)}`),
  tgItemSend: (id: string) => req<{ sent: number; failed: number; posts: TelegramItemPost[] }>("POST", `/api/admin/telegram/items/${encodeURIComponent(id)}/send`),
  tgPosts: () => req<TgPostsInfo>("GET", "/api/admin/telegram/posts"),
  tgPost: (id: string) => req<{ post: TgPost }>("GET", `/api/admin/telegram/posts/${encodeURIComponent(id)}`),
  tgPostCreate: (d: TgPostBody) => req<TgPostResult>("POST", "/api/admin/telegram/posts", d),
  tgPostUpdate: (id: string, d: TgPostBody) => req<TgPostResult>("PUT", `/api/admin/telegram/posts/${encodeURIComponent(id)}`, d),
  tgPostResend: (id: string, d: TgPostBody) => req<TgPostResult>("POST", `/api/admin/telegram/posts/${encodeURIComponent(id)}/resend`, d),
  tgPostDelete: (id: string, force = false) => req<{ ok: boolean }>("DELETE", `/api/admin/telegram/posts/${encodeURIComponent(id)}${force ? "?force=1" : ""}`),
  tgFooter: (d: { html?: string; reset?: boolean }) => req<{ footer: TgFooter }>("PUT", "/api/admin/telegram/footer", d),
  tgSpeed: () => req<TelegramSpeed>("POST", "/api/admin/telegram/speed"),
  testTelegram: (token: string) => req<{ ok: boolean; username: string; name: string }>("POST", "/api/admin/telegram/test", { token }),
  stats: (days: number) => req<Stats>("GET", `/api/admin/stats?days=${days}`),
  items: <T = Item>(kind: Kind) => req<{ items: T[] }>("GET", `/api/admin/items/${kind}`),
  item: <T = Item>(kind: Kind, id: string) => req<T>("GET", `/api/admin/items/${kind}/${id}`),
  create: <T = Item>(kind: Kind, d: Record<string, unknown>) => req<T>("POST", `/api/admin/items/${kind}`, d),
  update: <T = Item>(kind: Kind, id: string, d: Record<string, unknown>) => req<T>("PUT", `/api/admin/items/${kind}/${id}`, d),
  duplicate: <T = Item>(kind: Kind, id: string) => req<T>("POST", `/api/admin/items/${kind}/${id}/duplicate`),
  remove: (kind: Kind, id: string) => req<{ ok: boolean }>("DELETE", `/api/admin/items/${kind}/${id}`),
  reorder: (kind: Kind, ids: string[]) => req<{ ok: boolean }>("POST", `/api/admin/items/${kind}/reorder`, { ids }),
  sendPost: (id: string, test_email?: string) => req<{ ok: boolean; recipients?: number; test?: boolean }>("POST", `/api/admin/posts/${id}/send`, test_email ? { test_email } : {}),
  newsletters: () => req<{ items: Newsletter[] }>("GET", "/api/admin/newsletters"),
  uni: () => req<Uni>("GET", "/api/admin/uni"),
  saveUni: (d: Partial<Uni>) => req<Uni>("PUT", "/api/admin/uni", d),
  site: () => req<SiteSettings>("GET", "/api/admin/site"),
  saveSite: (d: Partial<SiteSettings>) => req<SiteSettings>("PUT", "/api/admin/site", d),
  smtp: () => req<Smtp>("GET", "/api/admin/smtp"),
  saveSmtp: (d: Partial<Smtp>) => req<Smtp>("PUT", "/api/admin/smtp", d),
  testSmtp: (to: string) => req<{ ok: boolean; error: string }>("POST", "/api/admin/smtp/test", { to }),
  emailLog: () => req<{ items: EmailLog[] }>("GET", "/api/admin/email-log"),
  subscribers: () => req<{ items: Subscriber[] }>("GET", "/api/admin/subscribers"),
  addSubscribers: (emails: string) => req<{ added: number; invalid: string[] }>("POST", "/api/admin/subscribers", { emails }),
  setSubscriber: (id: string, status: string) => req<{ ok: boolean }>("PUT", `/api/admin/subscribers/${id}`, { status }),
  resendConfirm: (id: string) => req<{ ok: boolean }>("POST", `/api/admin/subscribers/${id}/resend`),
  deleteSubscriber: (id: string) => req<{ ok: boolean }>("DELETE", `/api/admin/subscribers/${id}`),
  messages: () => req<{ items: Message[] }>("GET", "/api/admin/messages"),
  markMessage: (id: string, read: boolean) => req<{ ok: boolean }>("PUT", `/api/admin/messages/${id}`, { read }),
  deleteMessage: (id: string) => req<{ ok: boolean }>("DELETE", `/api/admin/messages/${id}`),
  media: () => req<{ items: Media[] }>("GET", "/api/admin/media"),
  popups: () => req<{ items: AdminPopup[] }>("GET", "/api/admin/popups"),
  savePopups: (items: AdminPopup[]) => req<{ items: AdminPopup[] }>("PUT", "/api/admin/popups", { items }),
  festive: () => req<FestiveOverview>("GET", "/api/admin/festive"),
  saveFestive: (s: FestiveSettings) => req<FestiveOverview>("PUT", "/api/admin/festive", s),
  upload: (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return req<Media>("POST", "/api/admin/media", fd);
  },
  uploadFromUrl: (url: string) => req<Media>("POST", "/api/admin/media/from-url", { url }),
  deleteMedia: (id: string) => req<{ ok: boolean }>("DELETE", `/api/admin/media/${id}`),
  // foydalanuvchilar
  users: (p: { role?: string; group?: string; q?: string; section?: string } = {}) => {
    const s = new URLSearchParams();
    for (const [k, v] of Object.entries(p)) if (v) s.set(k, v);
    return req<{ items: Person[]; me: string; sections: Section[] }>("GET", `/api/admin/users?${s}`);
  },
  addUser: (d: Record<string, unknown>) => req<Person>("POST", "/api/admin/users", d),
  suggestLogin: (name: string) => req<{ items: { login: string; email: string }[]; domain: string; mail_ready: boolean }>("GET", `/api/admin/users/suggest?${new URLSearchParams({ name })}`),
  loginFree: (login: string, exclude = "") => req<{ free: boolean }>("GET", `/api/admin/users/login-free?${new URLSearchParams({ login, exclude })}`),
  updateUser: (id: string, d: Record<string, unknown>) => req<Person>("PUT", `/api/admin/users/${id}`, d),
  deleteUser: (id: string) => req<{ ok: boolean }>("DELETE", `/api/admin/users/${id}`),
  importUsers: (role: Role, file: File) => {
    const fd = new FormData();
    fd.append("role", role);
    fd.append("file", file);
    return req<ImportResult>("POST", "/api/admin/users/import", fd);
  },
  /** Excel faylni yuklab olish (namuna yoki login/parollar ro'yxati) */
  downloadXlsx: async (url: string, name: string, body?: unknown) => {
    const r = await fetch(url, body ? { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : { credentials: "same-origin" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const blob = await r.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  },
  // o'quv jarayoni
  acadOverview: () => req<AcadOverview>("GET", "/api/admin/acad-overview"),
  acad: <T>(table: AcadTable) => req<{ items: T[] }>("GET", `/api/admin/acad/${table}`),
  acadSave: <T>(table: AcadTable, d: Record<string, unknown>, id?: string) => (id ? req<T>("PUT", `/api/admin/acad/${table}/${id}`, d) : req<T>("POST", `/api/admin/acad/${table}`, d)),
  acadDelete: (table: AcadTable, id: string) => req<{ ok: boolean }>("DELETE", `/api/admin/acad/${table}/${id}`),
  lessons: (p: { semester?: string; group?: string; teacher?: string; room?: string } = {}) => {
    const s = new URLSearchParams();
    for (const [k, v] of Object.entries(p)) if (v) s.set(k, v);
    return req<{ items: Lesson[]; semester: Semester }>("GET", `/api/admin/lessons?${s}`);
  },
  saveLesson: (d: Record<string, unknown>, id?: string) => (id ? req<Lesson>("PUT", `/api/admin/lessons/${id}`, d) : req<Lesson>("POST", "/api/admin/lessons", d)),
  moveLesson: (id: string, d: { weekday: number; slot_id: string }) => req<Lesson>("POST", `/api/admin/lessons/${id}/move`, d),
  availability: (d: Record<string, unknown>) => req<{ cells: Availability[] }>("POST", "/api/admin/lessons/availability", d),
  form: (p: { semester?: string; course?: number; faculty?: string; groups?: string }) => {
    const s = new URLSearchParams(Object.entries(p).filter(([, v]) => v).map(([k, v]) => [k, String(v)])).toString();
    return req<OfficialForm>("GET", `/api/admin/form?${s}`);
  },
  formSettings: () => req<FormSettings>("GET", "/api/admin/form-settings"),
  saveFormSettings: (d: FormSettings) => req<FormSettings>("PUT", "/api/admin/form-settings", d),
  importStatus: () => req<ImportStatus>("GET", "/api/admin/import"),
  importStart: (d: { base?: string; parts?: string[] }) => req<ImportStatus>("POST", "/api/admin/import", d),
  deleteLesson: (id: string) => req<{ ok: boolean }>("DELETE", `/api/admin/lessons/${id}`),
  checkLesson: (d: Record<string, unknown>) => req<{ conflicts: Conflict[] }>("POST", "/api/admin/lessons/check", d),
  copyLessons: (from: string, to: string) => req<{ copied: number }>("POST", "/api/admin/lessons/copy", { from, to }),
  week: (p: { semester?: string; group?: string; teacher?: string; room?: string; week?: string }) => {
    const s = new URLSearchParams();
    for (const [k, v] of Object.entries(p)) if (v) s.set(k, v);
    return req<WeekSchedule>("GET", `/api/admin/week?${s}`);
  },
  changes: (semester?: string) => req<{ items: (ScheduleChange & { subject?: string; group_name?: string })[] }>("GET", `/api/admin/changes${semester ? `?semester=${semester}` : ""}`),
  addChange: (d: Record<string, unknown>) => req<ScheduleChange>("POST", "/api/admin/changes", d),
  deleteChange: (id: string) => req<{ ok: boolean }>("DELETE", `/api/admin/changes/${id}`),
  notices: () => req<{ items: AdminNotice[] }>("GET", "/api/admin/notices"),
  saveNotice: (d: Record<string, unknown>) => req<AdminNotice>("POST", "/api/admin/notices", d),
  sendNotice: (d: Record<string, unknown>) => req<{ ok: boolean; recipients: number; mailed: number }>("POST", "/api/admin/notices/send", d),
  deleteNotice: (id: string) => req<{ ok: boolean }>("DELETE", `/api/admin/notices/${id}`),
};

const ERR: Record<string, string> = {
  dean_not_member: "Kafedra mudiri avval kafedra xodimlari ro‘yxatida bo‘lishi kerak",
  dean_no_profile: "Bu xodimning saytdagi professor profili yo‘q — Foydalanuvchilarda «Professor-o‘qituvchi» belgilang",
  hemis_no_url: "HEMIS API manzilini kiriting (masalan, https://student.example.edu)",
  "hemis:unauthorized": "HEMIS tokeni noto‘g‘ri yoki muddati o‘tgan (HEMIS admin → «API User» roli)",
  "hemis:forbidden": "HEMIS: tokenga bu ma’lumotga ruxsat berilmagan",
  "hemis:no_token": "HEMIS API tokenini kiriting",
  "hemis:disabled": "Avval HEMIS integratsiyasini yoqing va saqlang",
  "hemis:rate_limited": "HEMIS so‘rovlar chegarasi — birozdan keyin qayta urinib ko‘ring",
  telegram_bad_token: "Token noto‘g‘ri. @BotFather bergan tokenni to‘liq kiriting (123456:ABC…)",
  telegram_no_token: "Avval bot tokenini kiriting",
  telegram_webhook_https: "Webhook uchun sayt manzili https:// bilan bo‘lishi kerak — «Long polling» rejimini tanlang",
  telegram_disabled: "Telegram bot ulanmagan (Sozlamalar → Telegram bot)",
  telegram_bad_chat: "Kanal yoki guruhni @username yoki chat id ko‘rinishida kiriting",
  telegram_not_group: "Bu guruh yoki kanal emas",
  telegram_cannot_post: "Bot bu chatga yoza olmaydi: guruhga a’zo qiling yoki kanalda «Xabar joylash» huquqi bilan administrator qiling",
  telegram_text_too_long: "Matn juda uzun: Telegram xabari 4096 belgidan oshmasligi kerak",
  telegram_caption_too_long: "Matn juda uzun: rasm, video yoki fayl izohi 1024 belgidan oshmasligi kerak",
  telegram_empty: "Post bo‘sh: matn yozing yoki rasm, video, fayl biriktiring",
  telegram_no_targets: "Kamida bitta kanal yoki guruhni tanlang",
  telegram_bad_schedule: "Yuborish vaqti kelajakda bo‘lishi kerak",
  telegram_album_buttons: "Albomga (2–10 ta rasm/video) tugma qo‘shib bo‘lmaydi — Telegram buni qo‘llamaydi",
  telegram_album_max: "Albomda ko‘pi bilan 10 ta rasm yoki video bo‘ladi",
  telegram_album_types: "Hujjat faqat bitta bo‘lib yuboriladi: albomda faqat rasm va video bo‘ladi",
  telegram_bad_media: "Media faqat sayt media kutubxonasidan tanlanadi",
  telegram_bad_button: "Tugma uchun matn va https:// bilan boshlanadigan havola kerak",
  telegram_busy: "Post hozir yuborilmoqda — birozdan keyin qayta urinib ko‘ring",
  telegram_already_sent: "Post allaqachon yuborilgan",
  telegram_edit_incompatible: "Telegram bu xabarni bunday tahrirlay olmaydi",
  telegram_delete_failed: "Telegram xabarni o‘chirmadi",
  telegram_footer_too_long: "Post osti matni 512 belgidan oshmasin",
  telegram_footer_blocks: "Post osti matnida iqtibos yoki kod bloki bo‘lmaydi",
  telegram_nothing_to_send: "Yuboriladigan chat yo‘q: allaqachon yuborilgan yoki tasdiqlangan guruhda bu tur yoqilmagan",
  s3_incomplete: "S3: endpoint, bucket, access key va secret key to‘ldirilishi kerak",
  s3_not_ready: "Avval S3 ni yoqing va saqlang",
  invalid_credentials: "Login yoki parol noto‘g‘ri",
  wrong_role: "Bu hisob admin panelga kira olmaydi — saytdagi «Kirish» orqali kabinetga kiring",
  use_portal_login: "Talaba va o‘qituvchilar boshqaruv paneliga kira olmaydi — saytdagi «Shaxsiy kabinet» (/login) orqali kiring",
  xlsx_not_xlsx: "Fayl Excel (.xlsx) formatida emas. Namuna faylni yuklab olib, uni to‘ldiring",
  xlsx_no_header: "Faylda «Login» va «F.I.Sh.» ustunlari topilmadi. Namuna fayldagi sarlavhalarni o‘zgartirmang",
  xlsx_empty: "Fayl bo‘sh",
  too_many_attempts: "Juda ko‘p urinish. Birozdan keyin qayta urinib ko‘ring",
  unauthorized: "Sessiya tugagan, qayta kiring",
  forbidden: "Bu amal uchun huquq yo‘q",
  wrong_password: "Joriy parol noto‘g‘ri",
  weak_password: "Parol kamida 8 ta belgidan iborat bo‘lsin",
  invalid_login: "Login kamida 3 ta belgi (a-z, 0-9, . _ -)",
  login_taken: "Bu login band",
  invalid_email: "Email noto‘g‘ri",
  invalid_role: "Rol noto‘g‘ri",
  no_permission: "Rolingizda bu bo‘limga ruxsat yo‘q",
  role_in_use: "Bu rol administratorlarga biriktirilgan — avval ularning rolini o‘zgartiring",
  last_superadmin: "Kamida bitta faol bosh administrator qolishi kerak",
  use_admin_login: "Administrator hisobi — /admin orqali kiring",
  photo_no_face: "Suratda odam yuzi topilmadi — yuz aniq ko‘rinadigan portret yuklang (hayvon, manzara, buyum qabul qilinmaydi)",
  photo_face_small: "Yuz juda kichik — yaqinroqdan olingan portret yuklang",
  photo_many_faces: "Suratda bir nechta odam bor — faqat bitta kishi tushgan surat yuklang",
  photo_not_image: "Fayl rasm emas (JPG, PNG, WEBP)",
  photo_unavailable: "Yuzni aniqlash xizmati ishlamayapti (opencv o‘rnatilmagan)",
  not_assignee: "Bu murojaatga boshqa administrator mas’ul — javob faqat u yoki bosh administrator yoza oladi",
  already_assigned: "Murojaatni boshqa administrator boshlagan",
  reason_required: "Sababni yozing",
  mail_disabled: "Pochta serveri sozlanmagan (admin → Pochta serveri)",
  no_requester_email: "Murojaatchining emaili yo‘q — telefon orqali bog‘laning",
  invalid_mailbox: "Bu manzildan yozib bo‘lmaydi — bo‘limlarga biriktirilgan manzilni tanlang",
  empty_message: "Matn yozing",
  cannot_delete_self: "O‘zingizni o‘chira olmaysiz",
  cannot_change_own_role: "O‘z rolingizni o‘zgartira olmaysiz",
  cannot_deactivate_self: "O‘zingizni bloklay olmaysiz",
  empty_title: "Sarlavha kiriting",
  alumni_consent: "Nashr qilish uchun «Bitiruvchi nashrga yozma rozilik bergan» belgisini yoqing. Rozilik bo‘lmasa — holatni «Qoralama» qilib saqlang.",
  photo_alt_required: "Nashr qilish uchun har bir suratga alt matn (surat nimani ko‘rsatishini qisqa tavsif) yozing.",
  milestone_year_mismatch: "«Yil» va «Aniq sana» bir-biriga mos emas: sanadagi yil bilan bir xil yilni kiriting yoki sanani o‘chiring.",
  empty_name: "Nom kiriting",
  name_taken: "Bu nom band",
  too_large: "Hajm juda katta",
  unsupported_type: "Fayl turi qo‘llab-quvvatlanmaydi (PNG, JPG, WEBP, GIF, PDF, DOCX, XLSX, PPTX)",
  smtp_not_configured: "SMTP sozlanmagan yoki o‘chirilgan (Pochta bo‘limi)",
  not_published: "Avval yangilikni nashr qiling",
  not_found: "Topilmadi",
  no_semester: "Avval semestr yarating",
  conflict: "Jadvalda to‘qnashuv bor",
  missing_semester_id: "Semestr tanlanmagan",
  missing_group_id: "Guruh tanlanmagan",
  missing_subject_id: "Fan tanlanmagan",
  missing_slot_id: "Dars vaqti tanlanmagan",
  missing_fields: "Majburiy maydonlar to‘ldirilmagan",
  invalid_date: "Sana noto‘g‘ri",
  invalid_score: "Ball noto‘g‘ri",
  invalid_semesters: "Semestrlar noto‘g‘ri tanlangan",
  invalid_url: "Havola noto‘g‘ri (http/https)",
  fetch_failed: "Faylni yuklab bo‘lmadi",
};

export function errMsg(e: unknown): string {
  const d = (e as { detail?: string })?.detail || String(e);
  const [code, ...rest] = d.split(":");
  if (code === "smtp_error") return `SMTP xatosi: ${rest.join(":")}`;
  if (code === "fetch_failed") return `${ERR.fetch_failed}: ${rest.join(":")}`;
  if (code === "hemis") return ERR[`hemis:${rest[0]}`] || `HEMIS xatosi: ${rest.join(":")}`;
  if (code === "s3") return `S3 xatosi: ${rest.join(":")}`;
  if (code === "telegram_error") return `Telegram: ${rest.join(":")}`;
  return ERR[code] || ERR[d] || d;
}
