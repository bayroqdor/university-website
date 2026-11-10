// Admin: hamkorlik va karyera API (karyera markazi moderatsiyasi va sozlamalari, bitiruvchilar ro'yxati va statistikasi)
import { req } from "../lib/api";

export type CKind = "opportunity" | "partner" | "alumni" | "startup" | "insight" | "program" | "staff";
export type Rec = { id: string; title: string; slug?: string; status?: string; featured?: boolean; sort?: number; published_at?: string | null; created?: string; updated?: string; langs?: string[]; i18n?: Record<string, Record<string, unknown>>; [k: string]: unknown };

export interface CareerSettings {
  info: Partial<Record<"uz" | "ru" | "en", { html: string; content: unknown }>>;
  email: string;
  phone: string;
  room: string;
  hours: string;
  staff_ids: string[];
  notify: boolean;
  counts?: Record<string, number>;
}
export interface RegistryRow {
  id: string;
  name: string;
  year: number | null;
  program_id: string | null;
  program_text: string;
  job: string;
  company: string;
  city: string;
  email: string;
  phone: string;
  consent_contact: boolean;
  consent_publish: boolean;
  status: "new" | "contacted" | "story" | "archived";
  note: string;
  story_id: string | null;
  created: string;
}
export interface StatRow {
  year: number | string;
  program_id: string;
  graduates: number | string | null;
  employed_pct: number | string | null;
}

const qs = (p: Record<string, string>) => {
  const s = new URLSearchParams(Object.entries(p).filter(([, v]) => v)).toString();
  return s ? `?${s}` : "";
};

export const ca = {
  items: (kind: CKind) => req<{ items: Rec[] }>("GET", `/api/admin/items/${kind}`),
  item: (kind: CKind, id: string) => req<Rec>("GET", `/api/admin/items/${kind}/${id}`),
  save: (kind: CKind, d: Record<string, unknown>) => (d.id ? req<Rec>("PUT", `/api/admin/items/${kind}/${d.id}`, d) : req<Rec>("POST", `/api/admin/items/${kind}`, d)),
  remove: (kind: CKind, id: string) => req<{ ok: boolean }>("DELETE", `/api/admin/items/${kind}/${id}`),
  approve: (id: string) => req<{ item: Rec; mailed: boolean }>("POST", `/api/admin/career-center/opportunities/${id}/approve`),
  reject: (id: string, reason: string) => req<{ item: Rec; mailed: boolean }>("POST", `/api/admin/career-center/opportunities/${id}/reject`, { reason }),
  settings: () => req<CareerSettings>("GET", "/api/admin/career-center/settings"),
  saveSettings: (d: Partial<CareerSettings>) => req<CareerSettings>("PUT", "/api/admin/career-center/settings", d),
  registry: (p: { q?: string; year?: string; program?: string; status?: string }) =>
    req<{ items: RegistryRow[]; years: number[]; total: number }>("GET", `/api/admin/alumni/registry${qs(p as Record<string, string>)}`),
  registryUrl: (p: { q?: string; year?: string; program?: string; status?: string }) => `/api/admin/alumni/registry.xlsx${qs(p as Record<string, string>)}`,
  registryUpdate: (id: string, d: { status?: string; note?: string }) => req<{ ok: boolean }>("PUT", `/api/admin/alumni/registry/${id}`, d),
  registryDelete: (id: string) => req<{ ok: boolean }>("DELETE", `/api/admin/alumni/registry/${id}`),
  registryStory: (id: string) => req<{ id: string }>("POST", `/api/admin/alumni/registry/${id}/story`),
  stats: () => req<{ rows: StatRow[] }>("GET", "/api/admin/alumni/stats"),
  saveStats: (rows: StatRow[]) => req<{ rows: StatRow[] }>("PUT", "/api/admin/alumni/stats", { rows }),
};
