// Sayt API mijozi va ma'lumot turlari
import type { JSONContent } from "@tiptap/core";

export type Lang = "uz" | "ru" | "en";
export const LANGS: Lang[] = ["uz", "ru", "en"];
/** Tarjimalar: til → maydonlar (asosiy tildagi matn oddiy maydonlarda). */
export type I18n = Partial<Record<Lang, Record<string, unknown>>>;

export const isLang = (v: unknown): v is Lang => typeof v === "string" && (LANGS as string[]).includes(v);

// ochiq API so'rovlari tanlangan tilda (kontent tarjimasi serverda qo'yiladi)
let apiLang: Lang | "" = "";
export function setApiLang(l: Lang | "") {
  apiLang = l;
}
function L(url: string): string {
  return apiLang ? `${url}${url.includes("?") ? "&" : "?"}lang=${apiLang}` : url;
}

export type Role = "admin" | "teacher" | "staff" | "student";

export interface Uni {
  name: string;
  short_name: string;
  abbr: string;
  tagline: string;
  short_about: string;
  mission: string;
  values: string[];
  founded: string;
  founder: string;
  license: string;
  rector_name: string;
  rector_title: string;
  rector_photo: string;
  rector_speech?: JSONContent | null;
  rector_speech_html: string;
  address: string;
  phones: string[];
  email: string;
  hours: string;
  map_url: string;
  logo: string;
  logo_light?: string;
  hemis_url: string;
  moodle_url?: string;
  mail_url?: string;
  anticorruption_url?: string;
  library_url?: string;
  admission_url: string;
  socials: Record<string, string>;
  stats: { value: string; suffix: string; label: string }[];
  keywords: string[];
  i18n?: I18n;
}

export type SectionId = "hero" | "stats" | "programs" | "about" | "news" | "announcements" | "faculties" | "rector" | "staff" | "events" | "partners" | "links" | "admission" | "contact";
export interface Section {
  id: SectionId;
  enabled: boolean;
}

export interface Hero {
  eyebrow: string;
  heading: string;
  subheading: string;
  cta_primary: string;
  cta_primary_url: string;
  cta_secondary: string;
  cta_secondary_url: string;
}

export interface MenuLink {
  label: string;
  url: string;
  group?: string;
  labels?: Partial<Record<Lang, string>>;
}
export interface MenuItem extends MenuLink {
  children: MenuLink[];
}

export interface SiteSettings {
  title: string;
  description: string;
  lang: Lang;
  seo?: { title?: Partial<Record<Lang, string>>; keywords?: Partial<Record<Lang, string[]>>; verify?: Record<string, string>; indexnow?: boolean };
  accent: string;
  accent2: string;
  palette_auto?: boolean;
  hero_images: string[];
  home_images?: Partial<Record<"hero" | "green" | "auditorium" | "library" | "dormitory" | "student_life", string>>;
  menu: MenuItem[];
  theme: "system" | "light" | "dark";
  logo_text: string;
  favicon: string;
  og_image: string;
  footer_text: string;
  url?: string;
  sections: Section[];
  hero: Hero;
  cursor: boolean;
  animations: boolean;
  smooth_scroll: boolean;
  posts_per_page: number;
  admission_text: string;
  portal_text: string;
  portal_enabled: boolean;
  /** sarlavhadagi «Qabul» tugmasi ko‘rinadimi va qaysi yil */
  admission_cta?: boolean;
  admission_year?: number;
  i18n?: I18n;
  contact_email?: string;
  double_opt_in?: boolean;
  notify_contact?: boolean;
  notify_subscribe?: boolean;
  newsletter_footer?: string;
}

export interface SiteData {
  uni: Uni;
  site: SiteSettings;
  counts: Record<string, number>;
  tags: [string, number][];
  menu_pages: { title: string; slug: string; section: string }[];
  faculties: { id: string; title: string; slug: string }[];
  semester: { name: string } | null;
  version: string;
  telegram_bot?: string;
  lang: Lang;
  default_lang: Lang;
  langs: Lang[];
  popups?: SitePopup[];
  festive?: Festive | null;
  tuition?: TuitionInfo | null;
  former_domains?: string[];
}

export type FeeForm = "day" | "extramural" | "evening" | "distance" | "second";
export interface Fee {
  form: FeeForm;
  amount: number;
  old?: number;
}
export interface TuitionInfo {
  year: string;
  currency: string;
  usd_rate: number | null;
  note: string;
  highlights: string[];
}

export interface PopupButton {
  label: string;
  url: string;
  style: "primary" | "ghost";
  new_tab?: boolean;
}

export interface SitePopup {
  id: string;
  version: number;
  title: string;
  body: string;
  badge: string;
  image: string;
  video: string;
  layout: "stack" | "split" | "cover";
  accent: string;
  frequency: "always" | "session" | "daily" | "once";
  delay: number;
  pages: "all" | "home" | "list";
  paths: string[];
  end?: string | null;
  buttons: PopupButton[];
}

export interface Festive {
  id: string;
  style: string;
  name: string;
  greeting: string;
  start: string;
  end: string;
  day: string;
  countdown: boolean;
  intensity: number;
  effects: Record<string, boolean>;
  preview?: boolean;
  /** admin yuklagan sahna surati (bo'lmasa — standart fotosurat) */
  image?: string;
}

export type Kind = "news" | "announce" | "page" | "program" | "faculty" | "department" | "staff" | "partner" | "event" | "document" | "link" | "vacancy" | "faq";

export interface Item {
  id: string;
  kind: Kind;
  slug: string | null;
  status: string;
  title: string;
  sort: number;
  featured: boolean;
  published_at: string | null;
  created: string;
  updated: string;
  views?: number;
  reads?: number;
  lang?: Lang;
  langs?: Lang[];
  i18n?: I18n;
  [k: string]: unknown;
}

export interface Rich extends Item {
  excerpt?: string;
  summary?: string;
  content?: JSONContent | null;
  html?: string;
  text?: string;
  reading_time?: number;
  show_toc?: boolean;
  meta_title?: string;
  meta_description?: string;
  og_image?: string;
}

export interface News extends Rich {
  excerpt: string;
  feature_image: string;
  feature_alt: string;
  feature_caption: string;
  tags: string[];
  reading_time: number;
  send_newsletter?: boolean;
  newsletter_sent?: string | null;
}

export interface Announce extends Rich {
  excerpt: string;
  feature_image: string;
  category: string;
  deadline: string | null;
  tags: string[];
}

export interface Page extends Rich {
  excerpt: string;
  cover: string;
  section: string;
  news_tag?: string;
  contact_ids?: string[];
}

export interface Program extends Rich {
  code: string;
  degree: string;
  faculty_id: string;
  faculty?: string;
  duration: string;
  languages: string[];
  credits: number | null;
  tuition: string;
  fees?: Fee[];
  fee_note?: string;
  quota: number | null;
  form: string[];
  summary: string;
  cover: string;
  careers: string[];
  partner: string;
  subjects: string[];
  accent: string;
}

export interface Faculty extends Rich {
  summary: string;
  dean: string;
  cover: string;
  email: string;
  phone: string;
  accent: string;
  programs?: { title: string; slug: string }[];
}

export interface Vacancy extends Rich {
  summary: string;
  department: string;
  employment: "full_time" | "part_time" | "contract" | "internship" | "remote";
  category: string;
  location: string;
  salary: string;
  deadline: string | null;
  requirements: string[];
  duties: string[];
  benefits: string[];
  contact_email: string;
  cover: string;
  faculty?: { title: string; slug: string } | null;
  open?: boolean;
}

export interface FaqItem {
  id: string;
  q: string;
  a: string;
  category: string;
}

export type DeanCard = Staff & { bio?: string };

export interface Department extends Rich {
  summary: string;
  head: string;
  category: string;
  email: string;
  phone: string;
  room: string;
  cover?: string;
  faculty_id?: string;
  staff_count?: number;
  faculty?: { title: string; slug: string } | null;
  faces?: { title: string; photo: string }[];
  head_staff_id?: string;
  head_photo?: string;
}

export interface Staff extends Item {
  position: string;
  category: string;
  department_id: string;
  faculty_id: string;
  faculty?: string;
  department?: string;
  department_slug?: string | null;
  photo: string;
  email: string;
  phone: string;
  degree: string;
  bio?: string;
  education?: string;
  experience?: string;
  spoken: string[];
  interests: string[];
  links: { label: string; url: string }[];
  subjects?: string[];
  publications?: string;
  hours?: string;
}
/** Sahifaga biriktirilgan mas'ul xodim kartasi */
export type ContactPerson = { id: string; title: string; slug: string; position: string; degree: string; photo: string; email: string; phone: string; hours: string };

export interface UsefulLink extends Item {
  url: string;
  logo: string;
  category: string;
  summary: string;
}

export interface Partner extends Item {
  category: string;
  logo: string;
  url: string;
  country: string;
  summary: string;
  since: string;
}

export interface Event extends Rich {
  category: string;
  summary: string;
  starts: string | null;
  ends: string | null;
  place: string;
  cover: string;
  url: string;
}

export interface Document extends Item {
  file: string;
  url: string;
  category: string;
  year: number | null;
  number: string;
  summary: string;
}

export interface User {
  id: string;
  login: string;
  name: string;
  email: string;
  role: Role;
  group_id: string | null;
  group_name?: string | null;
  active: boolean;
  created: string;
  last_login: string | null;
  data: Record<string, string>;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public detail: string,
    public body?: unknown,
  ) {
    super(detail);
  }
}

let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: (() => void) | null) {
  onUnauthorized = fn;
}

export async function req<T>(method: string, url: string, body?: unknown): Promise<T> {
  const init: RequestInit = { method, headers: {}, credentials: "same-origin" };
  // admin panel va kabinet sessiyalari alohida: admin sahifalaridagi so'rovlar admin sessiyasi bilan ketadi
  if (typeof window !== "undefined" && /^\/admin(\/|$)/.test(window.location.pathname)) (init.headers as Record<string, string>)["X-Admin-Realm"] = "admin";
  if (body instanceof FormData) init.body = body;
  else if (body !== undefined) {
    init.body = JSON.stringify(body);
    (init.headers as Record<string, string>)["Content-Type"] = "application/json";
  }
  const r = await fetch(url, init);
  if (r.status === 401 && /^\/api\/(admin|portal|student|teacher|auth\/me)/.test(url) && !url.endsWith("/login")) onUnauthorized?.();
  if (!r.ok) {
    let detail = r.statusText;
    let payload: unknown;
    try {
      const j = await r.json();
      payload = j.detail;
      detail = typeof j.detail === "string" ? j.detail : typeof j.detail?.code === "string" ? j.detail.code : JSON.stringify(j.detail);
    } catch {
      /* */
    }
    throw new ApiError(r.status, detail, payload);
  }
  return r.json() as Promise<T>;
}

function qs(p: Record<string, string | number | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(p)) if (v !== undefined && v !== "" && v !== 0) q.set(k, String(v));
  const s = q.toString();
  return s ? `?${s}` : "";
}

export interface HomeData {
  programs: Program[];
  faculties: Faculty[];
  news: News[];
  announcements: Announce[];
  events: Event[];
  partners: Partner[];
  staff: Staff[];
  professors: Staff[];
  links: UsefulLink[];
  counts: { staff: number; professors: number; departments: number };
  rector: { rector_name: string; rector_title: string; rector_photo: string; rector_speech_html: string };
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pages: number;
}

export type SiteHit = { type: string; title: string; sub: string; to: string };

export const pub = {
  site: () => req<SiteData>("GET", L("/api/site")),
  search: (q: string) => req<{ items: SiteHit[] }>("GET", L(`/api/search?q=${encodeURIComponent(q)}`)),
  home: () => req<HomeData>("GET", L("/api/home")),
  news: (p: { tag?: string; q?: string; page?: number }) => req<Paged<News>>("GET", L(`/api/news${qs(p)}`)),
  newsItem: (slug: string) => req<{ item: News; newer: News | null; older: News | null; related: News[] }>("GET", L(`/api/news/${encodeURIComponent(slug)}`)),
  announcements: (p: { category?: string; q?: string; page?: number }) => req<Paged<Announce>>("GET", L(`/api/announcements${qs(p)}`)),
  announcement: (slug: string) => req<{ item: Announce; others: Announce[] }>("GET", L(`/api/announcements/${encodeURIComponent(slug)}`)),
  pages: (section?: string) => req<{ items: Page[] }>("GET", L(`/api/pages${qs({ section })}`)),
  page: (slug: string) => req<{ item: Page; siblings: Page[]; contacts?: ContactPerson[] }>("GET", L(`/api/pages/${encodeURIComponent(slug)}`)),
  programs: (p: { faculty?: string; degree?: string } = {}) => req<{ items: Program[]; faculties: Faculty[] }>("GET", L(`/api/programs${qs(p)}`)),
  program: (slug: string) => req<{ item: Program; faculty: Faculty | null; others: Program[] }>("GET", L(`/api/programs/${encodeURIComponent(slug)}`)),
  faculties: () => req<{ items: Faculty[] }>("GET", L("/api/faculties")),
  faculty: (slug: string) => req<{ item: Faculty; programs: Program[]; staff: Staff[]; dean: DeanCard | null }>("GET", L(`/api/faculties/${encodeURIComponent(slug)}`)),
  structure: () => req<{ items: Department[] }>("GET", L("/api/structure")),
  department: (slug: string) => req<{ item: Department; head?: Staff | null; staff: Staff[]; others: Department[]; faculty: Faculty | null }>("GET", L(`/api/structure/${encodeURIComponent(slug)}`)),
  staff: (p: { kind?: string; faculty?: string; department?: string; q?: string } = {}) => req<{ items: Staff[]; departments: { id: string; title: string; slug: string; category: string }[] }>("GET", L(`/api/staff${qs(p)}`)),
  staffItem: (slug: string) => req<{ item: Staff; faculty: Faculty | null; department: Department | null; colleagues: Staff[]; is_dean?: boolean }>("GET", L(`/api/staff/${encodeURIComponent(slug)}`)),
  careers: () => req<{ items: Vacancy[] }>("GET", L("/api/careers")),
  career: (slug: string) => req<{ item: Vacancy; others: Vacancy[] }>("GET", L(`/api/careers/${encodeURIComponent(slug)}`)),
  apply: (slug: string, fd: FormData) => req<{ ok: boolean; ticket: number }>("POST", `/api/careers/${encodeURIComponent(slug)}/apply`, fd),
  faq: () => req<{ items: FaqItem[] }>("GET", L("/api/faq")),
  events: (upcoming = false) => req<{ items: Event[]; now: string }>("GET", L(`/api/events${qs({ upcoming: upcoming ? 1 : 0 })}`)),
  event: (slug: string) => req<{ item: Event }>("GET", L(`/api/events/${encodeURIComponent(slug)}`)),
  documents: () => req<{ items: Document[] }>("GET", L("/api/documents")),
  partners: () => req<{ items: Partner[] }>("GET", L("/api/partners")),
  links: () => req<{ items: UsefulLink[] }>("GET", L("/api/links")),
  subscribe: (email: string, source = "site", hp = "") => req<{ status: "pending" | "active" }>("POST", "/api/subscribe", { email, source, hp, lang: apiLang }),
  unsubscribe: (token: string) => req<{ ok: boolean; email: string }>("POST", "/api/unsubscribe", { token }),
  contact: (d: { name: string; email: string; phone?: string; subject: string; message: string; hp?: string }) =>
    req<{ ok: boolean; ticket?: number }>("POST", "/api/contact", { ...d, lang: apiLang }),
  request: (token: string) => req<PublicRequest>("GET", L(`/api/desk/public/${encodeURIComponent(token)}`)),
  rateRequest: (token: string, rating: number, comment: string) =>
    req<PublicRequest>("POST", `/api/desk/public/${encodeURIComponent(token)}/rate`, { rating, comment, lang: apiLang }),
};

export interface PublicRequest {
  number: number;
  label: string;
  title: string;
  stage: string;
  stages: Record<string, string>;
  created: string;
  updated: string;
  history: { stage: string; comment: string; at: string }[];
  rating: number | null;
  rating_comment: string;
  can_rate: boolean;
}

export const auth = {
  login: (login: string, password: string) => req<{ user: User; home: string }>("POST", "/api/auth/login", { login, password }),
  logout: () => req<{ ok: boolean }>("POST", "/api/auth/logout"),
  me: () => req<{ user: User; home: string; version: string }>("GET", "/api/auth/me"),
};

/* ------------------------------------------------------------------ o'quv jarayoni turlari */
export interface Semester {
  id: string;
  name: string;
  start: string | null;
  end: string | null;
  current: boolean;
  published: boolean;
}
export interface TimeSlot {
  id: string;
  idx: number;
  start: string;
  end: string;
}
export interface Group {
  id: string;
  name: string;
  program_id: string | null;
  faculty_id: string | null;
  course: number;
  lang: string;
  curator_id: string | null;
  year_start: number | null;
  note: string;
  students?: number;
}
export interface Subject {
  id: string;
  name: string;
  code: string;
  credits: number | null;
  department: string;
  note: string;
}
export interface Room {
  id: string;
  name: string;
  building: string;
  capacity: number | null;
  type: string;
}
export interface Lesson {
  id: string;
  semester_id: string;
  group_id: string;
  subject_id: string;
  teacher_id: string | null;
  room_id: string | null;
  weekday: number;
  slot_id: string;
  type: string;
  parity: "all" | "odd" | "even";
  date_from: string | null;
  date_to: string | null;
  note: string;
  subject: string;
  subject_code: string;
  group_name: string;
  teacher: string | null;
  room: string | null;
  building: string | null;
  slot_idx: number;
  slot_start: string;
  slot_end: string;
  date?: string;
  change?: ScheduleChange | null;
}
export interface FormSettings {
  approver_title: string;
  approver_name: string;
  head_title: string;
  head_name: string;
  dean_title: string;
  dean_name: string;
  note: string;
}
/** Davlat shaklidagi dars jadvali: ustunlar — guruhlar, qatorlar — kunlar × juftliklar */
export interface OfficialForm {
  semester: Semester;
  slots: TimeSlot[];
  groups: { id: string; name: string; course: number; faculty_id: string | null; program_id: string | null; lang: string | null }[];
  lessons: Lesson[];
  weekdays: string[];
  settings: FormSettings;
  title: string;
  uni: { name: string; abbr: string; logo: string };
  faculties: Record<string, string>;
  unpublished?: boolean;
  no_group?: boolean;
}
export interface ScheduleChange {
  id: string;
  lesson_id: string;
  date: string;
  kind: "cancel" | "move" | "replace";
  room_id: string | null;
  slot_id: string | null;
  teacher_id: string | null;
  note: string;
  room?: string;
  subject?: string;
  group_name?: string;
}
export interface WeekSchedule {
  week_start: string;
  week_end: string;
  week_number: number;
  parity: "odd" | "even";
  days: { date: string; weekday: number; lessons: Lesson[]; off?: boolean }[];
  semester: Semester;
  unpublished?: boolean;
  no_group?: boolean;
}

export function mediaUrl(u: string | null | undefined): string {
  return u || "";
}
