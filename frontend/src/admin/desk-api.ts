// Murojaatlar (service desk) API mijozi
import { req } from "../lib/api";

export type StageId = "new" | "in_progress" | "waiting" | "resolved" | "failed";
export type Priority = "low" | "medium" | "high" | "critical";
export interface Stage {
  id: StageId;
  title: string;
  color: string;
}
export interface Person {
  id: string;
  name: string;
  photo: string;
}
export interface DeskCategory {
  id: string;
  title: string;
  color: string;
  mailbox: string;
  member_ids: string[];
  sort: number;
  active: boolean;
}
export interface Ticket {
  id: string;
  number: number;
  number_label: string;
  title: string;
  body: string;
  stage: StageId;
  priority: Priority;
  category_id: string | null;
  category: DeskCategory | null;
  requester_name: string;
  requester_email: string;
  requester_phone: string;
  source: "web" | "email" | "manual" | "telegram" | "careers" | "chat" | "reception";
  tg_chat?: string | null;
  ip: string;
  assignee_id: string | null;
  assignee: Person | null;
  created: string;
  updated: string;
  first_response_at: string | null;
  resolved_at: string | null;
  last_in_at: string | null;
  unread: boolean;
  lang?: string | null;
  rating?: number | null;
  rating_comment?: string | null;
  rated_at?: string | null;
  rating_agent_id?: string | null;
  channels: { id: Channel; ready: boolean }[];
}
export type Channel = "telegram" | "email" | "chat";
export interface DeskFile {
  name: string;
  url?: string;
  size?: number;
  mime?: string;
  kind?: "image" | "video" | "audio" | "file";
  error?: string;
}
export interface DeskEvent {
  id: number;
  ticket_id: string;
  kind: "created" | "message_in" | "message_out" | "note" | "transition" | "start" | "auto" | "assign" | "update" | "rating";
  author_id: string | null;
  author_name: string;
  author: Person | null;
  content: string;
  meta: Record<string, unknown>;
  created: string;
}
export interface Board {
  stages: Stage[];
  categories: DeskCategory[];
  counts: Record<StageId | "unread", number>;
  tickets: Ticket[];
  agents: Person[];
  me: string;
  mail_ready: boolean;
  tg_ready: boolean;
  poll: { new?: number; reply?: number; ts?: string; errors?: string[] };
}
export interface TicketFull {
  ticket: Ticket;
  events: DeskEvent[];
  history: { id: string; number: number; title: string; stage: StageId; created: string }[];
  public_url: string;
}
export interface OperatorStat {
  user_id: string;
  user: Person;
  assigned: number;
  open: number;
  resolved: number;
  failed: number;
  rated: number;
  csat: number | null;
  stars: Record<"1" | "2" | "3" | "4" | "5", number>;
  avg_first_response_min: number | null;
  avg_resolve_min: number | null;
}
export interface DeskStats {
  period: { start: string; end: string };
  overview: {
    total: number;
    open: number;
    unassigned: number;
    by_stage: Record<StageId, number>;
    by_source: Record<string, number>;
    avg_first_response_min: number | null;
    avg_resolve_min: number | null;
    csat: number | null;
    ratings: number;
    rating_dist: Record<"1" | "2" | "3" | "4" | "5", number>;
    positive_pct: number | null;
  };
  operators: OperatorStat[];
  timeline: { date: string; created: number; resolved: number }[];
  categories: { id: string; title: string; color: string; count: number }[];
}

const q = (p: Record<string, string>) => new URLSearchParams(Object.entries(p).filter(([, v]) => v)).toString();

export const desk = {
  board: (p: { q?: string; category?: string; assignee?: string } = {}) => req<Board>("GET", `/api/admin/desk?${q(p as Record<string, string>)}`),
  ticket: (id: string) => req<TicketFull>("GET", `/api/admin/desk/tickets/${id}`),
  create: (d: Record<string, unknown>) => req<TicketFull>("POST", "/api/admin/desk/tickets", d),
  update: (id: string, d: Record<string, unknown>) => req<TicketFull>("PUT", `/api/admin/desk/tickets/${id}`, d),
  remove: (id: string) => req<{ ok: boolean }>("DELETE", `/api/admin/desk/tickets/${id}`),
  start: (id: string) => req<TicketFull>("POST", `/api/admin/desk/tickets/${id}/start`),
  move: (id: string, stage: StageId, reason = "") => req<TicketFull>("POST", `/api/admin/desk/tickets/${id}/move`, { stage, reason }),
  reassign: (id: string, assignee_id: string, reason: string) => req<TicketFull>("POST", `/api/admin/desk/tickets/${id}/reassign`, { assignee_id, reason }),
  note: (id: string, content: string) => req<TicketFull>("POST", `/api/admin/desk/tickets/${id}/note`, { content }),
  reply: (id: string, body: string, from_addr: string, files: File[], channel: Channel = "email") => {
    const fd = new FormData();
    fd.append("body", body);
    fd.append("from_addr", from_addr);
    fd.append("channel", channel);
    for (const f of files) fd.append("files", f, f.name);
    return req<TicketFull>("POST", `/api/admin/desk/tickets/${id}/reply`, fd);
  },
  categories: () => req<{ items: DeskCategory[]; agents: Person[]; domain: string }>("GET", "/api/admin/desk/categories"),
  saveCategories: (items: Partial<DeskCategory>[]) => req<{ items: DeskCategory[]; agents: Person[]; domain: string }>("PUT", "/api/admin/desk/categories", { items }),
  poll: () => req<{ new: number; reply: number; errors: string[] }>("POST", "/api/admin/desk/poll"),
  stats: (p: { days?: number; start?: string; end?: string }) =>
    req<DeskStats>("GET", `/api/admin/desk/stats?${q(Object.fromEntries(Object.entries(p).map(([k, v]) => [k, v ? String(v) : ""])))}`),
};
