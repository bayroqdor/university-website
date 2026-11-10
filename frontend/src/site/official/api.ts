// Rasmiy bo'limlar API mijozi (ochiq sayt)
import { req, type Lang } from "../../lib/api";

const q = (url: string, lang: Lang) => `${url}${url.includes("?") ? "&" : "?"}lang=${lang}`;

export interface OfficialDoc {
  id: string;
  title: string;
  category: string;
  number: string;
  date: string | null;
  year: number | null;
  summary: string;
  file: string;
  url: string;
  file_ext: string;
  file_size: number | null;
}

export interface Slot {
  day: number;
  start: string;
  end: string;
}
export interface ReceptionEntry {
  id: string;
  name: string;
  position: string;
  photo: string;
  staff_slug: string;
  slots: Slot[];
  place: string;
  room: string;
  phone: string;
  note: string;
  online_url: string;
}
export interface ReceptionData {
  items: ReceptionEntry[];
  today: string;
  weekday: number;
  now: string;
  window: { from: string; to: string };
}

export interface Indicator {
  key: string;
  label: string;
  kind: "value" | "breakdown";
  value: number | null;
  breakdown?: { label: string; value: number }[];
  updated: string;
  source: "auto" | "manual";
  hidden?: boolean;
  auto?: number | { label: string; value: number }[] | null;
  has_data?: boolean;
}
export interface Dataset {
  id: string;
  title: string;
  description: string;
  period: string;
  source: string;
  category: string;
  columns: string[];
  rows_count: number;
  updated_on: string | null;
  downloads: Record<"csv" | "xlsx" | "json", string>;
  table?: { columns: string[]; rows: (string | number)[][] };
}
export interface OpenData {
  indicators: Indicator[];
  datasets: Dataset[];
  generated: string;
  downloads: Partial<Record<"csv" | "xlsx" | "json", string>>;
}

export interface RankingEntry {
  id: string;
  year: number | null;
  category: string;
  place: string;
  total: number | null;
  url: string;
  note: string;
  logo: string;
}
export interface RankingGroup {
  key: string;
  title: string;
  logo: string;
  url: string;
  entries: RankingEntry[];
}

export interface Milestone {
  id: string;
  title: string;
  year: number | null;
  date: string | null;
  body: string;
  image: string;
  image_alt: string;
}

export interface Rector {
  name: string;
  title: string;
  photo: string;
  html: string;
  signature: string;
  staff_slug: string;
}

export interface Mention {
  id: string;
  title: string;
  outlet: string;
  logo: string;
  date: string | null;
  year: number | null;
  url: string;
  type: "article" | "video" | "tv" | "radio";
  summary: string;
  video_id: string;
}

export const off = {
  documents: (lang: Lang) => req<{ items: OfficialDoc[]; categories: { id: string; count: number }[] }>("GET", q("/api/official/documents", lang)),
  reception: (lang: Lang) => req<ReceptionData>("GET", q("/api/reception", lang)),
  book: (d: Record<string, string>) => req<{ ok: boolean; ticket: number }>("POST", "/api/reception/book", d),
  openData: (lang: Lang) => req<OpenData>("GET", q("/api/open-data", lang)),
  dataset: (id: string, lang: Lang) => req<Dataset>("GET", q(`/api/open-data/datasets/${id}`, lang)),
  rankings: (lang: Lang) => req<{ groups: RankingGroup[] }>("GET", q("/api/rankings", lang)),
  history: (lang: Lang) => req<{ items: Milestone[] }>("GET", q("/api/history", lang)),
  rector: (lang: Lang) => req<Rector>("GET", q("/api/rector", lang)),
  mentions: (lang: Lang) => req<{ items: Mention[]; years: number[]; types: string[] }>("GET", q("/api/media-mentions", lang)),
};

export const PRIVACY_URL = "/about/maxfiylik-siyosati";
