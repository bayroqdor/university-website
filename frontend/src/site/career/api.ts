// Hamkorlik va karyera: ochiq API (karyera markazi, hamkorlar, bitiruvchilar, startaplar, maqolalar)
import type { JSONContent } from "@tiptap/core";
import { req, type Lang } from "../../lib/api";

const q = (url: string, lang: Lang) => `${url}${url.includes("?") ? "&" : "?"}lang=${lang}`;

export type OppType = "internship" | "full_time" | "part_time" | "traineeship" | "project";
export type PartnerType = "industry" | "international" | "academic" | "government";
export type Stage = "idea" | "prototype" | "pilot" | "market";

export interface ProgramRef {
  id: string;
  title: string;
  slug: string;
  degree: string;
}
export interface StaffCard {
  id: string;
  title: string;
  slug: string;
  position: string;
  degree?: string;
  photo: string;
  email?: string;
  phone?: string;
  bio?: string;
}
interface Base {
  id: string;
  slug: string;
  title: string;
  status?: string;
  featured?: boolean;
  published_at?: string | null;
  updated?: string;
  lang?: Lang;
  langs?: Lang[];
}
export interface Opportunity extends Base {
  company: string;
  partner_id?: string;
  partner?: { slug: string; title: string; logo: string } | null;
  logo: string;
  type: OppType;
  program_ids: string[];
  city: string;
  remote: boolean;
  salary: string;
  summary: string;
  requirements: string[];
  apply_url: string;
  apply_email: string;
  apply_phone: string;
  deadline: string | null;
  expired: boolean;
  html?: string;
  content?: JSONContent | null;
  match?: boolean;
}
export interface Partner extends Base {
  logo: string;
  url: string;
  country: string;
  city: string;
  category: PartnerType;
  summary: string;
  description?: string;
  areas: string[];
  agreement_date?: string;
  practice_base: boolean;
  program_ids: string[];
  capacity: number | null;
  lat?: number | null;
  lng?: number | null;
  since: string;
}
export interface AlumniStory extends Base {
  year: number | null;
  program_id: string;
  program: string | ProgramRef | null;
  program_text: string;
  position: string;
  company: string;
  photo: string;
  quote: string;
  html?: string;
  content?: JSONContent | null;
}
export interface StatRow {
  year: number;
  program_id: string;
  program: string;
  graduates: number | null;
  employed_pct: number | null;
}
export interface TeamMember {
  name: string;
  role: string;
  staff_id: string;
  kind: "student" | "teacher" | "graduate" | "other";
  slug: string;
  photo: string;
  position: string;
}
export interface Startup extends Base {
  summary: string;
  stage: Stage;
  category: string;
  team: TeamMember[];
  images: string[];
  cover: string;
  video: string;
  awards: string[];
  partners: string[];
  partner_cards?: { slug: string; title: string; logo: string }[];
  contact_email: string;
  contact_phone: string;
  website: string;
  year: number | null;
  html?: string;
  content?: JSONContent | null;
}
export interface Insight extends Base {
  excerpt: string;
  cover: string;
  cover_alt: string;
  topics: string[];
  tags: string[];
  reading_time?: number;
  author?: { title: string; slug: string; photo: string; position: string } | null;
  sources?: { title: string; url: string }[];
  html?: string;
  content?: JSONContent | null;
  show_toc?: boolean;
}
export interface NewsRef {
  id: string;
  slug: string;
  title: string;
  published_at: string;
  feature_image: string;
  excerpt: string;
}

export const cc = {
  career: (lang: Lang) =>
    req<{ items: Opportunity[]; programs: ProgramRef[]; info: string; contacts: { email: string; phone: string; room: string; hours: string; staff: StaffCard[] } }>("GET", q("/api/career", lang)),
  opportunity: (slug: string, lang: Lang) => req<{ item: Opportunity; programs: ProgramRef[]; others: Opportunity[] }>("GET", q(`/api/career/${encodeURIComponent(slug)}`, lang)),
  submit: (d: Record<string, unknown>) => req<{ ok: boolean; ticket: number }>("POST", "/api/career/submit", d),
  partners: (lang: Lang) => req<{ items: Partner[]; programs: ProgramRef[] }>("GET", q("/api/cooperation/partners", lang)),
  partner: (slug: string, lang: Lang) =>
    req<{ item: Partner; programs: ProgramRef[]; news: NewsRef[]; opportunities: Opportunity[]; others: Partner[] }>("GET", q(`/api/cooperation/partners/${encodeURIComponent(slug)}`, lang)),
  practiceBases: (program: string, lang: Lang) => req<{ items: Partner[] }>("GET", q(`/api/cooperation/practice-bases?program=${encodeURIComponent(program)}`, lang)),
  alumni: (lang: Lang) => req<{ items: AlumniStory[]; stats: StatRow[]; programs: ProgramRef[] }>("GET", q("/api/alumni", lang)),
  story: (slug: string, lang: Lang) => req<{ item: AlumniStory; others: AlumniStory[] }>("GET", q(`/api/alumni/${encodeURIComponent(slug)}`, lang)),
  register: (d: Record<string, unknown>) => req<{ ok: boolean }>("POST", "/api/alumni/register", d),
  startups: (lang: Lang) => req<{ items: Startup[] }>("GET", q("/api/startups", lang)),
  startup: (slug: string, lang: Lang) => req<{ item: Startup; others: Startup[] }>("GET", q(`/api/startups/${encodeURIComponent(slug)}`, lang)),
  articles: (lang: Lang) => req<{ items: Insight[]; topics: string[] }>("GET", q("/api/articles", lang)),
  article: (slug: string, lang: Lang) => req<{ item: Insight; author: StaffCard | null; related: Insight[] }>("GET", q(`/api/articles/${encodeURIComponent(slug)}`, lang)),
};
