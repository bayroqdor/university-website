// Kabinet API mijozi (talaba va o'qituvchi)
import { req, type Group, type Lesson, type OfficialForm, type Semester, type TimeSlot, type User, type WeekSchedule } from "../lib/api";
import type { TopResult } from "../lib/TopBar";

export interface Me {
  user: User;
  semester: Semester | null;
  semesters: Semester[];
  weekdays: string[];
  slots: TimeSlot[];
  group?: Group | null;
  program?: { id: string; title: string; slug: string } | null;
  faculty?: { id: string; title: string; slug: string } | null;
  curator?: User | null;
  faculties?: { id: string; title: string }[];
  editable_faculties?: { id: string; title: string }[];
  sections?: string[];
  section_ids?: string[];
  courses?: Course[];
}
export interface FacultyDoc {
  id: string;
  title: string;
  slug: string;
  status: string;
  summary?: string;
  content?: unknown;
  html?: string;
  cover?: string;
  dean?: string;
  email?: string;
  phone?: string;
  updated?: string;
}
export interface Course {
  group_id: string;
  group_name: string;
  course: number;
  subject_id: string;
  subject: string;
  subject_code: string;
  lessons_per_week: number;
  students: number;
}
export interface Notice {
  id: string;
  title: string;
  body: string;
  audience: string;
  group_id: string | null;
  group_name?: string | null;
  author_id: string;
  author?: string;
  pinned: number | boolean;
  created: string;
  /** shaxsiy avtomatik bildirishnoma (forum: blog_like / blog_comment / blog_quote) — matn `meta` bo'yicha joriy tilda chiqariladi */
  kind?: string | null;
  ref?: string | null;
  link?: string | null;
  meta?: { actor?: string; post?: string; cid?: string | null } | null;
  seen?: boolean;
}
export interface SubjectSummary {
  subject_id: string;
  subject: string;
  credits: number | null;
  score: number;
  max: number;
  count: number;
  pct: number | null;
  grade5: number | null;
  kinds: Record<string, { score: number; max: number; count: number; pct: number | null }>;
}
export interface Grade {
  id: string;
  student_id: string;
  subject_id: string;
  semester_id: string;
  kind: string;
  title: string;
  score: number;
  max: number;
  date: string;
  comment: string;
  teacher_id: string;
  ts: string;
  subject?: string;
  credits?: number | null;
}
export interface Today {
  date: string;
  weekday: number;
  semester: Semester | null;
  lessons: Lesson[];
  notices: Notice[];
  week?: { number: number; parity: string };
  gpa?: number | null;
  subjects?: SubjectSummary[];
  attendance?: { pct: number | null; absent: number; total: number };
  pending_assignments?: Assignment[];
  pending_count?: number;
  courses?: Course[];
  groups?: number;
  students?: number;
  to_grade?: number;
  assignments?: number;
}
export interface AttendanceRow {
  id: string;
  lesson_id: string;
  date: string;
  student_id: string;
  status: string;
  note: string;
  subject?: string;
  subject_id?: string;
  type?: string;
}
export interface Attachment {
  label: string;
  url: string;
}
export interface Assignment {
  id: string;
  subject_id: string;
  group_id: string;
  teacher_id: string;
  semester_id: string | null;
  title: string;
  description: string;
  due: string | null;
  max: number;
  attachments: Attachment[];
  created: string;
  updated: string;
  subject?: string;
  group_name?: string;
  teacher?: string;
  submissions?: number;
  graded?: number;
  submission?: Submission | null;
}
export interface Submission {
  id: string;
  assignment_id: string;
  student_id: string;
  text: string;
  attachments: Attachment[];
  submitted: string;
  score: number | null;
  feedback: string | null;
  graded_by: string | null;
  graded_at: string | null;
  student?: string;
}
export interface Material {
  id: string;
  subject_id: string;
  group_id: string | null;
  teacher_id: string;
  title: string;
  description: string;
  url: string;
  attachments: Attachment[];
  created: string;
  subject?: string;
  group_name?: string | null;
  teacher?: string;
}
export interface StudentRow {
  id: string;
  name: string;
  login: string;
  email: string;
  data: Record<string, string>;
  mark?: AttendanceRow | null;
  grades?: Grade[];
  summary?: SubjectSummary | null;
  attendance?: { total: number; present: number; pct: number | null };
  submission?: Submission | null;
}

const q = (p: Record<string, string | undefined>) => {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(p)) if (v) s.set(k, v);
  const x = s.toString();
  return x ? `?${x}` : "";
};

export interface HemisLesson {
  date: string | null;
  subject: string;
  type: string;
  pair: string;
  start: string;
  end?: string;
  room?: string;
  teacher: string;
  group?: string;
}
export interface HemisData {
  enabled: boolean;
  portal_url?: string;
  error?: string;
  fetched?: string;
  profile?: Record<string, string | number | null | undefined>;
  attendance?: (HemisLesson & { absent_on: number; absent_off: number; explicable: boolean })[];
  attendance_by_subject?: { subject: string; hours: number; excused: number; unexcused: number }[];
  grades?: { date: string | null; subject: string; type: string; grade: number | null; teacher: string }[];
  exams?: { date: string | null; subject: string; exam: string; final: string; grade: number | null; regrade?: number | null; semester: string }[];
  gpa?: { year: string; level: string; gpa: number | string; credits: number | null; subjects: number | null; debts: number | null }[];
  schedule?: HemisLesson[];
  week_start?: string;
  errors?: string[];
}

export const portal = {
  search: (q: string, lang: string) => req<{ items: TopResult[] }>("GET", `/api/portal/search?${new URLSearchParams({ q, lang })}`),
  hemis: (force = false, week = "") => req<HemisData>("GET", `/api/portal/hemis?${new URLSearchParams({ ...(force ? { force: "1" } : {}), ...(week ? { week } : {}) })}`),
  faculty: (id: string) => req<{ item: FacultyDoc; teachers: { id: string; name: string; position: string; photo: string }[] }>("GET", `/api/portal/faculty/${id}`),
  saveFaculty: (id: string, d: Record<string, unknown>) => req<{ item: FacultyDoc }>("PUT", `/api/portal/faculty/${id}`, d),
  me: () => req<Me>("GET", "/api/portal/me"),
  photo: (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return req<User>("POST", "/api/portal/photo", fd);
  },
  removePhoto: () => req<User>("DELETE", "/api/portal/photo"),
  today: () => req<Today>("GET", "/api/portal/today"),
  schedule: (week?: string, semester?: string) => req<WeekSchedule>("GET", `/api/portal/schedule${q({ week, semester })}`),
  form: (semester?: string, faculty?: string) => req<OfficialForm>("GET", `/api/portal/form${q({ semester, faculty })}`),
  notices: () => req<{ items: Notice[] }>("GET", "/api/portal/notices"),
  notifications: () => req<{ items: Notice[]; unread: number }>("GET", "/api/portal/notifications"),
  notificationsSeen: (ids?: string[]) => req<{ ok: boolean; updated: number }>("POST", "/api/portal/notifications/seen", ids ? { ids } : {}),
  profile: (d: { email?: string; data?: Record<string, string> }) => req<User>("PUT", "/api/portal/profile", d),
  password: (current: string, next: string) => req<{ ok: boolean }>("POST", "/api/portal/password", { current, new: next }),
  upload: (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return req<{ url: string; original: string }>("POST", "/api/portal/upload", fd);
  },
};

export interface TgStatus {
  bot: string;
  linked: { name: string; username: string; linked: string } | null;
  pending: boolean;
}
export interface TgLink {
  url: string;
  code: string;
  expires: string;
  ttl: number;
  qr: string;
  bot: string;
}
export const tg = {
  status: () => req<TgStatus>("GET", "/api/portal/telegram"),
  link: () => req<TgLink>("POST", "/api/portal/telegram/link"),
  unlink: () => req<{ ok: boolean }>("DELETE", "/api/portal/telegram"),
};

export const student = {
  grades: (semester?: string) => req<{ items: Grade[]; subjects: SubjectSummary[]; gpa: number | null; semester: Semester | null }>("GET", `/api/student/grades${q({ semester })}`),
  attendance: (semester?: string) =>
    req<{ subjects: { subject_id: string; subject: string; total: number; present: number; absent: number; late: number; excused: number; pct: number | null }[]; recent: AttendanceRow[]; total: number; attended: number; pct: number | null; absent: number; semester: Semester | null }>(
      "GET",
      `/api/student/attendance${q({ semester })}`,
    ),
  assignments: () => req<{ items: Assignment[] }>("GET", "/api/student/assignments"),
  submit: (id: string, text: string, attachments: Attachment[]) => req<Submission>("POST", `/api/student/assignments/${id}/submit`, { text, attachments }),
  materials: () => req<{ items: Material[] }>("GET", "/api/student/materials"),
};

export const teacher = {
  courses: (semester?: string) => req<{ items: Course[]; semester: Semester }>("GET", `/api/teacher/courses${q({ semester })}`),
  students: (gid: string) => req<{ group: Group; items: StudentRow[] }>("GET", `/api/teacher/groups/${gid}/students`),
  attendance: (lid: string, date: string) => req<{ lesson: Lesson; date: string; students: StudentRow[]; dates: string[]; statuses: string[] }>("GET", `/api/teacher/lessons/${lid}/attendance?date_=${date}`),
  setAttendance: (lid: string, date: string, marks: { student_id: string; status: string; note?: string }[]) => req<{ ok: boolean; saved: number }>("PUT", `/api/teacher/lessons/${lid}/attendance`, { date, marks }),
  journal: (group: string, subject: string, semester?: string) =>
    req<{ students: StudentRow[]; attendance_dates: string[]; attendance: Record<string, Record<string, string>>; group: Group; subject: { id: string; name: string; code: string; credits: number | null }; semester: Semester }>(
      "GET",
      `/api/teacher/journal${q({ group, subject, semester })}`,
    ),
  addGrade: (d: Partial<Grade>) => req<Grade>("POST", "/api/teacher/grades", d),
  bulkGrades: (d: { group_id: string; subject_id: string; semester_id?: string; kind: string; title: string; max: number; date: string; marks: { student_id: string; score: number | string; comment?: string }[] }) =>
    req<{ added: number }>("POST", "/api/teacher/grades/bulk", d),
  updateGrade: (id: string, d: Partial<Grade>) => req<Grade>("PUT", `/api/teacher/grades/${id}`, d),
  deleteGrade: (id: string) => req<{ ok: boolean }>("DELETE", `/api/teacher/grades/${id}`),
  assignments: () => req<{ items: Assignment[] }>("GET", "/api/teacher/assignments"),
  saveAssignment: (d: Partial<Assignment>, id?: string) => (id ? req<Assignment>("PUT", `/api/teacher/assignments/${id}`, d) : req<Assignment>("POST", "/api/teacher/assignments", d)),
  deleteAssignment: (id: string) => req<{ ok: boolean }>("DELETE", `/api/teacher/assignments/${id}`),
  submissions: (id: string) => req<{ assignment: Assignment; items: StudentRow[] }>("GET", `/api/teacher/assignments/${id}/submissions`),
  gradeSubmission: (sid: string, score: number | null, feedback: string) => req<Submission>("PUT", `/api/teacher/submissions/${sid}`, { score, feedback }),
  materials: () => req<{ items: Material[] }>("GET", "/api/teacher/materials"),
  saveMaterial: (d: Partial<Material>, id?: string) => (id ? req<Material>("PUT", `/api/teacher/materials/${id}`, d) : req<Material>("POST", "/api/teacher/materials", d)),
  deleteMaterial: (id: string) => req<{ ok: boolean }>("DELETE", `/api/teacher/materials/${id}`),
  notices: () => req<{ items: Notice[] }>("GET", "/api/teacher/notices"),
  sendNotice: (d: { title: string; body: string; group_id: string; pinned?: boolean }) => req<Notice>("POST", "/api/teacher/notices", d),
  deleteNotice: (id: string) => req<{ ok: boolean }>("DELETE", `/api/teacher/notices/${id}`),
};

/* ------------------------------------------------------------------ blog, kalendar, eslatmalar */
export interface BlogAuthor {
  id: string;
  name: string;
  role: string;
  photo: string;
  faculty: string;
  group: string;
  position: string;
  course: number | null;
}
export interface BlogComment {
  id: string;
  post_id: string;
  author_id: string;
  body: string;
  hidden: boolean;
  created: string;
  quote_id?: string | null;
  author: BlogAuthor;
}
export interface BlogPost {
  id: string;
  author_id: string;
  title: string;
  body?: string;
  excerpt: string;
  cover: string | null;
  tags: string[];
  comments_enabled: boolean;
  comments_locked: boolean;
  status: "published" | "hidden";
  pinned: boolean;
  views: number;
  created: string;
  updated: string;
  author: BlogAuthor;
  likes: number;
  liked: boolean;
  comments: number;
  can_comment: boolean;
  last_at: string;
  last_author: BlogAuthor | null;
  participants: BlogAuthor[];
}
export type BlogSettings = { enabled: boolean; comments: boolean };
/** `doc` — muharrir (Tiptap) hujjati; eski yozuvlarda bo'lmaydi, unda `body` (HTML) ko'rsatiladi */
export type BlogPostFull = BlogPost & { body: string; doc?: Record<string, unknown> | null; comment_list: BlogComment[]; mine: boolean; settings: BlogSettings; activity: Record<string, number> };
export type BlogDraft = { title: string; body: string; doc?: Record<string, unknown> | null; cover: string; tags: string[]; comments_enabled: boolean };
export type BlogAuthorStat = BlogAuthor & { posts: number };

export type EventKind = "busy" | "task" | "meeting" | "exam" | "personal" | "free";
export interface CalEvent {
  id: string;
  title: string;
  note: string;
  kind: EventKind;
  start: string;
  end: string;
  time_from: string;
  time_to: string;
  done: boolean;
}
export type CalLesson = { date: string; start: string; end: string; subject: string; group: string; room: string; type: string };
export type CalDeadline = { date: string; title: string; subject: string; id: string };

export type NoteCat = "study" | "personal" | "important" | "other";
export interface Note {
  id: string;
  title: string;
  body: string;
  category: NoteCat;
  pinned: boolean;
  created: string;
  updated: string;
}

export const blog = {
  list: (p: { q?: string; tag?: string; mine?: boolean; author?: string; sort?: "activity" | "new" | "top" } = {}) =>
    req<{ items: BlogPost[]; settings: BlogSettings; tags: [string, number][]; me: BlogAuthor; authors: BlogAuthorStat[]; author: BlogAuthor | null; stats: { topics: number; replies: number; members: number } }>("GET", `/api/portal/blog${q({ q: p.q, tag: p.tag, author: p.author, mine: p.mine ? "1" : undefined, sort: p.sort })}`),
  get: (id: string) => req<BlogPostFull>("GET", `/api/portal/blog/${id}`),
  create: (d: BlogDraft) => req<BlogPostFull>("POST", "/api/portal/blog", d),
  update: (id: string, d: BlogDraft) => req<BlogPostFull>("PUT", `/api/portal/blog/${id}`, d),
  remove: (id: string) => req<{ ok: boolean }>("DELETE", `/api/portal/blog/${id}`),
  like: (id: string) => req<{ liked: boolean; likes: number }>("POST", `/api/portal/blog/${id}/like`),
  comment: (id: string, body: string, quote_ids: string[] = []) => req<BlogComment>("POST", `/api/portal/blog/${id}/comments`, { body, quote_ids }),
  removeComment: (cid: string) => req<{ ok: boolean }>("DELETE", `/api/portal/blog/comments/${cid}`),
};

export const calendar = {
  range: (start: string, end: string) => req<{ events: CalEvent[]; lessons: CalLesson[]; deadlines: CalDeadline[] }>("GET", `/api/portal/calendar${q({ start, end })}`),
  add: (d: Partial<CalEvent>) => req<CalEvent>("POST", "/api/portal/calendar", d),
  update: (id: string, d: Partial<CalEvent>) => req<CalEvent>("PUT", `/api/portal/calendar/${id}`, d),
  remove: (id: string) => req<{ ok: boolean }>("DELETE", `/api/portal/calendar/${id}`),
};

export const notes = {
  list: () => req<{ items: Note[] }>("GET", "/api/portal/notes"),
  add: (d: Partial<Note>) => req<Note>("POST", "/api/portal/notes", d),
  update: (id: string, d: Partial<Note>) => req<Note>("PUT", `/api/portal/notes/${id}`, d),
  remove: (id: string) => req<{ ok: boolean }>("DELETE", `/api/portal/notes/${id}`),
};
