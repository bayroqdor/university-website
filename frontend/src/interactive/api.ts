// Interaktiv: testlar va «Bilimdon» jonli viktorinasi API
import { req } from "../lib/api";

export type QType = "single" | "multi" | "text";
export interface QOption {
  id: string;
  text: string;
  image?: string;
}
export interface Question {
  id: string;
  type: QType;
  text: string;
  image?: string;
  points: number;
  time: number;
  options: QOption[];
  correct: string[];
  answers?: string[];
}
export interface TestSettings {
  time_limit: number;
  shuffle_questions: boolean;
  shuffle_options: boolean;
  show_score: boolean;
  attempts: number;
  group_ids: string[];
  /** groups — faqat tanlangan guruhlar; code — kod/PIN orqali tizimga kirgan har kim */
  access: "groups" | "code";
  /** tanlangan guruhlardagi alohida talabalar uchun yopiq */
  blocked_student_ids: string[];
  subject: string;
  pass_percent: number;
  kind: "test" | "game";
  variants: number;
  /** himoyalangan rejim: sahifadan chiqish nazorati, nusxalash taqiqi */
  secure: boolean;
  max_leaves: number;
}
export interface Test {
  id: string;
  owner_id: string;
  title: string;
  description: string;
  questions: Question[];
  settings: TestSettings;
  status: "draft" | "open" | "closed";
  code: string;
  opens: string | null;
  closes: string | null;
  released: string | null;
  created: string;
  updated: string;
  open?: boolean;
  count?: number;
  attempts?: number;
  finished?: number;
  avg?: number | null;
}
export interface PublicQuestion {
  id: string;
  type: QType;
  text: string;
  image: string;
  points: number;
  options: QOption[];
  multi: boolean;
}
export interface Attempt {
  id: string;
  deadline: string | null;
  started: string;
  finished: string | null;
  answers: Record<string, string | string[]>;
  questions: PublicQuestion[];
  score: number | null;
  max_score: number | null;
  percent: number | null;
  secure: boolean;
  max_leaves: number;
  violations: number;
  closed_reason: string | null;
}
export type ViolationKind = "leave" | "screenshot" | "copy" | "paste" | "contextmenu" | "print" | "devtools";
export interface ResultRow {
  id: string;
  user: { id: string; name: string; login?: string; group?: string; photo?: string };
  started: string;
  finished: string | null;
  score: number | null;
  max_score: number | null;
  percent: number | null;
  correct: number;
  total: number;
  sent: string | null;
  answered: number;
  violations: number;
  closed_reason: string | null;
  events: string[];
}
export interface QStat {
  id: string;
  text: string;
  type: QType;
  answered: number;
  correct: number;
  percent: number;
  dist: Record<string, number>;
}
export interface SheetRow extends PublicQuestion {
  n: number;
  answer: string | string[] | null;
  correct: string[];
  accepted: string[];
  got: number;
  ok: boolean;
}
export interface Sheet {
  test: { id: string; title: string; subject: string };
  score: number;
  max_score: number;
  percent: number;
  finished: string;
  rows: SheetRow[];
  user?: { name: string; group?: string };
}
export interface PaperVariant {
  variant: number;
  questions: (PublicQuestion & { n: number })[];
  key: { n: number; answer: string }[];
}
export interface LiveView {
  id: string;
  pin: string;
  title: string;
  phase: "lobby" | "question" | "reveal" | "leaderboard" | "finished";
  index: number;
  total: number;
  now: number;
  started_at: number | null;
  deadline: number | null;
  limit: number | null;
  version: number;
  players_count: number;
  question?: PublicQuestion;
  answered?: number;
  correct?: string[];
  accepted?: string[];
  dist?: Record<string, number>;
  ranking?: { id: string; name: string; photo: string; score: number; streak: number; rank: number }[];
  players?: { id: string; name: string; photo: string }[];
  me?: { score: number; streak: number; rank: number | null; name: string; answer?: { v: unknown; ok: boolean; pts: number; t: number } };
  joined?: boolean;
}

export interface AccessGroup {
  id: string;
  name: string;
  /** professorga biriktirilgan (joriy semestr); false — avval tanlangan, hozir biriktirilmagan */
  assigned: boolean;
  students: { id: string; name: string; login: string; photo: string }[];
}
export interface AvailableTest {
  code: string;
  title: string;
  subject: string;
  teacher: string;
  count: number;
  time_limit: number;
  closes: string | null;
  attempts_left: number;
  in_progress: boolean;
}
export interface PendingStudent {
  id: string;
  name: string;
  login: string;
  group: string;
  photo: string;
}

export type PaperData = { test: { id: string; title: string; subject: string; description: string; count: number; max_score: number }; university: string; logo: string; teacher: string; variants: PaperVariant[] };

export const iq = {
  tests: () => req<{ items: Test[]; groups: { id: string; name: string }[] }>("GET", "/api/iq/tests"),
  test: (id: string) => req<Test>("GET", `/api/iq/tests/${id}`),
  accessGroups: (testId?: string) => req<{ items: AccessGroup[] }>("GET", `/api/iq/access-groups${testId ? `?test=${testId}` : ""}`),
  create: (d: Partial<Test>) => req<Test>("POST", "/api/iq/tests", d),
  save: (id: string, d: Partial<Test>) => req<Test>("PUT", `/api/iq/tests/${id}`, d),
  remove: (id: string) => req<{ ok: boolean }>("DELETE", `/api/iq/tests/${id}`),
  status: (id: string, status: string) => req<Test>("POST", `/api/iq/tests/${id}/status`, { status }),
  importXlsx: (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return req<{ questions: Question[]; errors: string[] }>("POST", "/api/iq/import", fd);
  },
  results: (id: string) => req<{ test: Test; rows: ResultRow[]; questions: QStat[]; pending: PendingStudent[] }>("GET", `/api/iq/tests/${id}/results`),
  release: (id: string) => req<{ sent: number; mailed: number }>("POST", `/api/iq/tests/${id}/release`),
  sheet: (aid: string) => req<Sheet>("GET", `/api/iq/attempts/${aid}/sheet`),
  paper: (id: string, variants: number) => req<PaperData>("GET", `/api/iq/tests/${id}/paper?variants=${variants}`),
  paperSigned: (id: string, variants: number, exp: string, tk: string) => req<PaperData>("GET", `/api/iq/paper-print/${id}?${new URLSearchParams({ variants: String(variants), exp, tk })}`),
  paperPdfUrl: (id: string, variants: number, group: number) => `/api/iq/tests/${id}/paper.pdf?variants=${variants}&group=${group}`,
  // talaba
  info: (code: string) =>
    req<{ code: string; title: string; description: string; subject: string; teacher: string; count: number; time_limit: number; attempts_allowed: number; open: boolean; secure: boolean; max_leaves: number; status: string; closes: string | null; released: boolean; mine: { id: string; finished: string | null; percent: number | null }[] }>(
      "GET",
      `/api/iq/t/${code}`,
    ),
  start: (code: string) => req<Attempt>("POST", `/api/iq/t/${code}/start`),
  answers: (aid: string, answers: Record<string, unknown>) => req<{ ok: boolean; saved: number }>("PUT", `/api/iq/attempts/${aid}/answers`, { answers }),
  submit: (aid: string, answers: Record<string, unknown>) => req<Attempt>("POST", `/api/iq/attempts/${aid}/submit`, { answers }),
  /** Qoidabuzarlik. keepalive — sahifa yopilayotganda ham so'rov yetib boradi. */
  violation: async (aid: string, kind: ViolationKind, answers?: Record<string, unknown>): Promise<Attempt | null> => {
    try {
      const r = await fetch(`/api/iq/attempts/${aid}/violation`, {
        method: "POST",
        credentials: "same-origin",
        keepalive: true,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, answers }),
      });
      return r.ok ? ((await r.json()) as Attempt) : null;
    } catch {
      return null;
    }
  },
  my: () => req<{ items: { id: string; code: string; title: string; subject: string; started: string; finished: string | null; released: boolean; percent: number | null; score: number | null; max_score: number | null; open: boolean; closed_reason: string | null }[] }>("GET", "/api/iq/my"),
  available: () => req<{ items: AvailableTest[] }>("GET", "/api/iq/available"),
  mySheet: (aid: string) => req<Sheet>("GET", `/api/iq/my/${aid}/sheet`),
  // Bilimdon
  liveCreate: (id: string) => req<{ id: string; pin: string }>("POST", `/api/iq/tests/${id}/live`),
  liveList: () => req<{ items: { id: string; pin: string; test_id: string; title: string; phase: string; players: number; created: string; finished: string | null; top: { name: string; score: number }[] }[] }>("GET", "/api/iq/live"),
  host: (gid: string) => req<LiveView>("GET", `/api/iq/live/${gid}`),
  hostAction: (gid: string, action: "start" | "next" | "end" | "kick", user_id?: string) => req<LiveView>("POST", `/api/iq/live/${gid}/${action}`, user_id ? { user_id } : {}),
  play: (pin: string) => req<LiveView>("GET", `/api/iq/play/${pin}`),
  join: (pin: string) => req<LiveView>("POST", `/api/iq/play/${pin}/join`),
  answer: (pin: string, value: unknown) => req<{ ok: boolean }>("POST", `/api/iq/play/${pin}/answer`, { value }),
};

export const qrUrl = (path: string) => `/api/qr.svg?text=${encodeURIComponent(window.location.origin + path)}`;
