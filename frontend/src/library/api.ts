// Kutubxona API klienti: katalog, o'quvchi amallari, o'qish/tinglash, o'qituvchi ro'yxatlari va kutubxonachi paneli
import { req } from "../lib/api";

export type Fmt = "paper" | "pdf" | "epub" | "audio";
export interface BookCard {
  id: string;
  title: string;
  subtitle: string;
  authors: string[];
  cover: string;
  year: number | null;
  lang: string;
  rating: number;
  ratings: number;
  formats: Fmt[];
  copies: number;
  free: number;
  categories: string[];
  snippet?: string;
}
export interface Book {
  id: string;
  title: string;
  subtitle: string;
  authors: string[];
  isbn: string;
  publisher: string;
  year: number | null;
  lang: string;
  pages: number | null;
  cover: string;
  annotation: string;
  categories: string[];
  faculties: string[];
  keywords: string[];
  udc: string;
  bbk: string;
  price?: number | null;
  rating_avg: number;
  rating_count: number;
  created: string;
  updated: string;
}
export interface LibFile {
  id: string;
  kind: "pdf" | "epub" | "audio";
  title: string;
  pages: number | null;
  duration: number | null;
  size: number;
  /** o'qish uchun kirish kerakmi: "public" — ochiq fond (mehmonlar ham o'qiydi), "registered" — faqat tizimga kirganlar */
  access: "public" | "registered";
  /** kirganlar orasida kim o'qiy oladi: hamma / faqat o'qituvchilar / kafedra */
  audience?: "all" | "teachers" | "faculty";
  allowed: boolean;
  /** hozirgi ko'ruvchi o'qiy oladimi (mehmon ham) */
  can_read?: boolean;
  sort: number;
}
export interface Availability {
  total: number;
  free: number;
  next_due: string | null;
  queue: number;
}
export interface RatingInfo {
  avg: number;
  count: number;
  dist: Record<string, number>;
  mine?: number | null;
  can_rate?: boolean;
}
export interface Review {
  id: string;
  book_id: string;
  parent_id: string | null;
  text: string;
  stars: number | null;
  status: "pending" | "approved" | "hidden" | "rejected";
  anonymous: number;
  reason: string | null;
  created: string;
  edited: string | null;
  author: { name: string; faculty: string; photo: string; role: string; real?: boolean };
  helpful: number;
  voted: boolean;
  own: boolean;
  replies?: Review[];
}
export interface Loan {
  id: string;
  copy_id: string;
  book_id: string;
  user_id: string;
  issued: string;
  due: string;
  returned: string | null;
  renewals: number;
  inv: string;
  title: string;
  authors?: string[];
  cover?: string;
  overdue?: boolean;
  location?: string;
}
export interface Reservation {
  id: string;
  book_id: string;
  status: "waiting" | "ready";
  created: string;
  expires: string | null;
  title: string;
  cover?: string;
  authors?: string[];
  position: number;
}
export interface Fine {
  id: string;
  loan_id: string | null;
  user_id: string;
  amount: number;
  kind: "late" | "lost";
  status: "unpaid" | "paid" | "waived";
  note: string | null;
  created: string;
  resolved: string | null;
  title?: string;
  user?: { id: string; name: string; login: string };
}
export interface Shelf {
  id: string;
  name: string;
  kind: "reading" | "want" | "done" | "custom";
  items: BookCard[];
}
export interface Progress {
  file_id: string;
  book_id: string;
  loc: string;
  percent: number;
  seconds: number;
  updated: string;
  kind?: string;
  title?: string;
  cover?: string;
  authors?: string[];
  file_title?: string;
}
export interface Mark {
  id: string;
  file_id: string;
  kind: "bookmark" | "highlight" | "note";
  loc: string;
  text: string;
  note: string;
  color: string;
  created: string;
  title?: string;
  book_id?: string;
  file_kind?: string;
}
export interface CourseList {
  id: string;
  teacher_id: string;
  teacher: string;
  subject_id: string | null;
  subject_name: string;
  semester_id: string | null;
  title: string;
  items: { kind: "main" | "extra"; note: string; book: BookCard }[];
}
export interface Facets {
  categories: { name: string; count: number }[];
  faculties: { name: string; count: number }[];
  langs: { name: string; count: number }[];
  years: [number | null, number | null];
  total: number;
  copies: number;
  files: number;
}
export interface SearchResult {
  items: BookCard[];
  total: number;
  page: number;
  pages: number;
  ms?: number;
}
export interface BookView {
  book: Book;
  availability: Availability;
  files: LibFile[];
  rating: RatingInfo;
  also: BookCard[];
  similar: BookCard[];
  lists: { teacher: string; subject: string }[];
  me: null | {
    loan: { id: string; due: string; renewals: number } | null;
    reservation: (Reservation & { position: number }) | null;
    shelves: string[];
    progress: Record<string, { percent: number; loc: string }>;
    problems: string[];
  };
}
export interface OpenFile {
  file: LibFile & { toc: { title: string; page?: number; href?: string; level?: number }[] };
  url: string;
  ttl: number;
  book: { id: string; title: string; authors: string[]; cover: string };
  progress: Progress | null;
  marks: Mark[];
  siblings: LibFile[];
  download: boolean;
  preview?: boolean;
  /** mehmon ochiq fond faylini o'qiyapti — o'qish joyi va belgilar saqlanmaydi */
  guest?: boolean;
  /** ko'ruvchining bosh sahifasi ("" — mehmon), «yopish» tugmasi uchun (faqat frontendda) */
  home?: string;
  progress_all: Record<string, { loc: string; percent: number }>;
}
export interface MyLibrary {
  loans: Loan[];
  reservations: Reservation[];
  fines: Fine[];
  unpaid: number;
  shelves: Shelf[];
  continue: Progress[];
  stats: { seconds: number; pages: number; books_done: number; loans: number; days: { day: string; seconds: number; pages: number }[] };
  for_you: BookCard[];
  course_lists: CourseList[];
  prefs: { channels: string[]; tg_chat: string | null; font: number };
  problems: string[];
  rules: { limit: number; days: number; renew_days: number; max_renewals: number; fine_per_day: number; currency: string; hold_days: number };
  telegram_bot: string;
}

const qs = (o: Record<string, string | number | boolean | undefined | null>) =>
  new URLSearchParams(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== "" && v !== false).map(([k, v]) => [k, String(v)])).toString();

export const lib = {
  home: () => req<{ facets: Facets; popular: BookCard[]; newest: BookCard[]; top_rated: BookCard[]; teacher_picks: BookCard[]; for_you?: BookCard[]; peers?: BookCard[]; continue?: Progress[]; user: { id: string; name: string; role: string } | null }>("GET", "/api/lib/home"),
  search: (p: Record<string, string | number | boolean | undefined>) => req<SearchResult>("GET", `/api/lib/search?${qs(p)}`),
  book: (id: string) => req<BookView>("GET", `/api/lib/books/${id}`),
  reviews: (id: string) => req<{ items: Review[] }>("GET", `/api/lib/books/${id}/reviews`),
  reserve: (id: string) => req<Reservation>("POST", `/api/lib/books/${id}/reserve`),
  cancelReservation: (rid: string) => req<{ ok: boolean }>("DELETE", `/api/lib/reservations/${rid}`),
  renew: (lid: string) => req<Loan>("POST", `/api/lib/loans/${lid}/renew`),
  rate: (id: string, stars: number) => req<RatingInfo>("POST", `/api/lib/books/${id}/rate`, { stars }),
  addReview: (id: string, d: { text: string; stars?: number; parent_id?: string; anonymous?: boolean }) => req<Review>("POST", `/api/lib/books/${id}/reviews`, d),
  editReview: (rid: string, text: string) => req<Review>("PUT", `/api/lib/reviews/${rid}`, { text }),
  deleteReview: (rid: string) => req<{ ok: boolean }>("DELETE", `/api/lib/reviews/${rid}`),
  vote: (rid: string, kind: "helpful" | "report", note = "") => req<{ helpful: number }>("POST", `/api/lib/reviews/${rid}/vote`, { kind, note }),
  me: () => req<MyLibrary>("GET", "/api/lib/me"),
  history: () => req<{ loans: Loan[]; reading: Progress[]; fines: Fine[]; reservations: Reservation[]; marks: Mark[] }>("GET", "/api/lib/me/history"),
  shelfCreate: (name: string) => req<Shelf>("POST", "/api/lib/shelves", { name }),
  shelfDelete: (sid: string) => req<{ ok: boolean }>("DELETE", `/api/lib/shelves/${sid}`),
  shelfAdd: (sid: string, book_id: string) => req<{ shelves: string[] }>("POST", `/api/lib/shelves/${sid}/items`, { book_id }),
  shelfRemove: (sid: string, book_id: string) => req<{ shelves: string[] }>("DELETE", `/api/lib/shelves/${sid}/items/${book_id}`),
  prefs: (d: Partial<{ channels: string[]; font: number }>) => req<MyLibrary["prefs"]>("PUT", "/api/lib/prefs", d),
  telegram: () => req<{ url: string }>("POST", "/api/lib/prefs/telegram"),
  open: (fid: string, admin = false) => req<OpenFile>("POST", admin ? `/api/admin/library/files/${fid}/open` : `/api/lib/files/${fid}/open`),
  progress: (fid: string, d: { loc: string; percent: number; seconds?: number; pages?: number }) => req<Progress>("PUT", `/api/lib/files/${fid}/progress`, d),
  addMark: (fid: string, d: Partial<Mark>) => req<Mark>("POST", `/api/lib/files/${fid}/marks`, d),
  editMark: (mid: string, d: Partial<Mark>) => req<Mark>("PUT", `/api/lib/marks/${mid}`, d),
  deleteMark: (mid: string) => req<{ ok: boolean }>("DELETE", `/api/lib/marks/${mid}`),
  downloadUrl: (fid: string) => `/api/lib/files/${fid}/download`,
  lists: () => req<{ items: CourseList[]; subjects: { id: string; name: string }[]; semester: { id: string; name: string } | null; semesters: { id: string; name: string }[] }>("GET", "/api/lib/course-lists"),
  saveList: (d: { subject_id?: string; subject_name: string; semester_id?: string; title?: string; items: { book_id: string; kind: string; note?: string }[] }, id?: string) =>
    req<CourseList>(id ? "PUT" : "POST", id ? `/api/lib/course-lists/${id}` : "/api/lib/course-lists", d),
  copyList: (id: string, semester_id: string) => req<CourseList>("POST", `/api/lib/course-lists/${id}/copy`, { semester_id }),
  deleteList: (id: string) => req<{ ok: boolean }>("DELETE", `/api/lib/course-lists/${id}`),
};

// ------------------------------------------------------------------ kutubxonachi
export interface Copy {
  id: string;
  book_id: string;
  inv: string;
  barcode: string;
  location: string;
  status: "available" | "loaned" | "reserved" | "repair" | "lost" | "writtenoff";
  note: string | null;
  price: number | null;
  seen: string | null;
  holder?: { loan_id: string; issued: string; due: string; user: { id: string; name: string; login: string } } | null;
}
export interface AdminFile extends Omit<LibFile, "access"> {
  /** «Kimga ochiq»: hammaga (mehmon ham) / ro'yxatdan o'tganlar / faqat o'qituvchilar / tanlangan kafedra(lar) */
  access: "public" | "registered" | "teachers" | "faculty";
  book_id: string;
  path: string;
  orig: string;
  faculty_ids: string[];
  indexed: number;
  created: string;
}
export interface Reader {
  user: { id: string; name: string; login: string; role: string; email: string; photo: string; student_no: string; group: string; course: number | null; active: boolean };
  loans: Loan[];
  reservations: Reservation[];
  unpaid: number;
  fines: Fine[];
  problems: string[];
  limit: number;
  days: number;
}
export interface LibStats {
  today: { issued: number; returned: number; overdue: number; queue: number; on_loan: number; unpaid: number; pending_reviews: number };
  fund: { books: number; copies: number; files: number; by_status: Record<string, number> };
  top_borrowed: { id: string; title: string; n: number }[];
  top_read: { id: string; title: string; n: number }[];
  top_listened: { id: string; title: string; n: number }[];
  daily: { day: string; issued: number }[];
  by_faculty: { faculty: string; total: number; courses: Record<string, number> }[];
  shortage: { id: string; title: string; queue: number; copies: number }[];
  unused: { id: string; title: string; created: string; copies: number }[];
  files: { id: string; kind: string; title: string; opened: number; completed: number }[];
}
export type LibSettings = {
  loan_days_student: number;
  loan_days_teacher: number;
  limit_student: number;
  limit_teacher: number;
  renew_days: number;
  max_renewals: number;
  fine_per_day: number;
  lost_coef: number;
  hold_days: number;
  allow_download: boolean;
  auto_approve: boolean;
  max_file_mb: number;
  currency: string;
  review_edit_hours: number;
  rate_min_percent: number;
  can_edit?: boolean;
};
export type QueueItem = Reservation & { user: { id: string; name: string; login: string }; inv: string | null; copy_id: string | null };
export type OverdueItem = Loan & { days: number; user: { id: string; name: string; login: string; phone: string; email: string } };

export type SeedRow = {
  key: string; title: string; authors: string[]; lang: string; kinds: string[]; files: number; size: number; license: string; source: string;
  status: "pending" | "partial" | "done" | "deleted" | "error"; book_id: string | null; error: string;
};
export type SeedStatus = { items: SeedRow[]; running: boolean; current: string; done: number; total: number; bytes: number; errors: { key: string; title: string; error: string }[] };

export const libAdmin = {
  seed: () => req<SeedStatus>("GET", "/api/admin/library/seed"),
  seedStart: (d: { keys?: string[]; restore?: boolean } = {}) => req<SeedStatus>("POST", "/api/admin/library/seed", d),
  seedStop: () => req<{ stopping: boolean }>("POST", "/api/admin/library/seed/stop"),
  books: (p: Record<string, string | number | undefined>) => req<SearchResult & { facets: Facets }>("GET", `/api/admin/library/books?${qs(p)}`),
  book: (id: string) => req<{ book: Book; copies: Copy[]; files: AdminFile[]; availability: Availability; rating: RatingInfo; queue: QueueItem[] }>("GET", `/api/admin/library/books/${id}`),
  createBook: (d: Record<string, unknown>) => req<Book>("POST", "/api/admin/library/books", d),
  saveBook: (id: string, d: Record<string, unknown>) => req<Book>("PUT", `/api/admin/library/books/${id}`, d),
  deleteBook: (id: string) => req<{ ok: boolean }>("DELETE", `/api/admin/library/books/${id}`),
  cover: (id: string, file: Blob, name = "cover.png") => {
    const fd = new FormData();
    fd.append("file", file, name);
    return req<Book>("POST", `/api/admin/library/books/${id}/cover`, fd);
  },
  isbn: (isbn: string) => req<Partial<Book> & { source: string; isbn: string }>("GET", `/api/admin/library/isbn/${encodeURIComponent(isbn)}`),
  addCopies: (id: string, d: { count?: number; invs?: string; location?: string; price?: number | null }) => req<{ items: Copy[] }>("POST", `/api/admin/library/books/${id}/copies`, d),
  saveCopy: (cid: string, d: Partial<Copy>) => req<Copy>("PUT", `/api/admin/library/copies/${cid}`, d),
  deleteCopy: (cid: string) => req<{ ok: boolean }>("DELETE", `/api/admin/library/copies/${cid}`),
  copyHistory: (cid: string) => req<{ items: (Loan & { user: { id: string; name: string; login: string } })[] }>("GET", `/api/admin/library/copies/${cid}/history`),
  lookup: (code: string) => req<{ copy: Copy; book: { id: string; title: string; authors: string[]; cover: string }; holder: { loan: Loan; user: { id: string; name: string; login: string } } | null; reserved_for: { id: string; name: string; expires: string } | null }>(
    "GET",
    `/api/admin/library/copy?${qs({ code })}`,
  ),
  upload: (id: string, file: File, meta: { title?: string; access?: string; faculty_ids?: string; duration?: number; sort?: number }, onProgress?: (p: number) => void) =>
    new Promise<AdminFile>((resolve, reject) => {
      // katta fayl (200 MB gacha) — yuklash jarayonini ko'rsatish uchun XHR
      const fd = new FormData();
      fd.append("file", file);
      Object.entries(meta).forEach(([k, v]) => v !== undefined && fd.append(k, String(v)));
      const x = new XMLHttpRequest();
      x.open("POST", `/api/admin/library/books/${id}/files`);
      x.setRequestHeader("X-Admin-Realm", "admin");
      x.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
      x.onload = () => {
        try {
          const j = JSON.parse(x.responseText);
          if (x.status >= 200 && x.status < 300) resolve(j);
          else reject(new Error(j.detail || String(x.status)));
        } catch {
          reject(new Error(String(x.status)));
        }
      };
      x.onerror = () => reject(new Error("network"));
      x.send(fd);
    }),
  saveFile: (fid: string, d: Partial<AdminFile>) => req<AdminFile>("PUT", `/api/admin/library/files/${fid}`, d),
  deleteFile: (fid: string) => req<{ ok: boolean }>("DELETE", `/api/admin/library/files/${fid}`),
  readers: (q: string) => req<{ items: { id: string; name: string; login: string; role: string; group: string; student_no: string; photo: string }[] }>("GET", `/api/admin/library/readers?${qs({ q })}`),
  reader: (uid: string) => req<Reader>("GET", `/api/admin/library/readers/${uid}`),
  readerHistory: (uid: string) => req<{ loans: Loan[]; reading: Progress[]; fines: Fine[]; reservations: Reservation[] }>("GET", `/api/admin/library/readers/${uid}/history`),
  issue: (user_id: string, code: string, force = false) => req<{ loan: Loan; reader: Reader }>("POST", "/api/admin/library/issue", { user_id, code, force }),
  ret: (code: string, lost = false) => req<{ loan: Loan; fine: { amount: number } | null; late_days: number; reserved_for: string | null; reserved_for_name: string | null; reader: { id: string; name: string } | null }>("POST", "/api/admin/library/return", { code, lost }),
  loans: (kind: "active" | "overdue") => req<{ items: (OverdueItem & { overdue?: boolean })[] }>("GET", `/api/admin/library/loans?kind=${kind}`),
  queue: () => req<{ items: QueueItem[] }>("GET", "/api/admin/library/queue"),
  cancelReservation: (rid: string) => req<{ ok: boolean }>("POST", `/api/admin/library/reservations/${rid}/cancel`),
  fines: (status = "") => req<{ items: Fine[]; currency: string }>("GET", `/api/admin/library/fines?${qs({ status })}`),
  resolveFine: (fid: string, status: "paid" | "waived", note: string) => req<Fine>("POST", `/api/admin/library/fines/${fid}`, { status, note }),
  reviews: () => req<{ items: (Review & { book_title: string; reports: number; author: { name: string; login: string; faculty: string } })[] }>("GET", "/api/admin/library/reviews"),
  moderate: (rid: string, status: "approved" | "hidden" | "rejected", reason = "") => req<Review>("POST", `/api/admin/library/reviews/${rid}`, { status, reason }),
  locations: () => req<{ items: { location: string; n: number }[]; last: Record<string, unknown> | null }>("GET", "/api/admin/library/locations"),
  inventory: (location: string, codes: string[]) =>
    req<{ location: string; expected: number; found: Copy[]; missing: (Copy & { title: string })[]; foreign: (Copy & { title: string })[]; unknown: string[]; at: string }>("POST", "/api/admin/library/inventory", { location, codes }),
  stats: (days: number) => req<LibStats>("GET", `/api/admin/library/stats?days=${days}`),
  settings: () => req<LibSettings>("GET", "/api/admin/library/settings"),
  saveSettings: (d: Partial<LibSettings>) => req<LibSettings>("PUT", "/api/admin/library/settings", d),
  audit: (q = "") => req<{ items: { id: string; at: string; actor: string; action: string; entity: string; entity_id: string; old: unknown; new: unknown }[] }>("GET", `/api/admin/library/audit?${qs({ q })}`),
  importFile: (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return req<{ rows: number; books: number; copies: number; merged: number; skipped: { row: number; reason: string }[] }>("POST", "/api/admin/library/import", fd);
  },
  runJobs: () => req<Record<string, number | boolean>>("POST", "/api/admin/library/jobs"),
};

export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function fmtDur(sec: number | null | undefined): string {
  if (!sec || !isFinite(sec)) return "0:00";
  const s = Math.floor(sec % 60);
  const m = Math.floor(sec / 60) % 60;
  const h = Math.floor(sec / 3600);
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}
