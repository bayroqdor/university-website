// Talabalar hayoti, abituriyent, galereya, kampus xaritasi va virtual tur — ochiq API (backend/university/api/campus.py)
import { req, type Lang } from "../../lib/api";

export interface Photo {
  url: string;
  alt: string;
  caption?: string;
  w?: number;
  h?: number;
}
export interface Sections {
  life: boolean;
  clubs: boolean;
  sport: boolean;
  dormitory: boolean;
  scholarships: boolean;
  gallery: boolean;
  steps: boolean;
  calculator: boolean;
  parents: boolean;
  map: boolean;
  tour: boolean;
}
export interface StaffCard {
  id: string;
  title: string;
  slug: string;
  position?: string;
  degree?: string;
  photo?: string;
  email?: string;
  phone?: string;
  hours?: string;
}
export interface Club {
  id: string;
  slug: string;
  title: string;
  category: "science" | "sport" | "creative" | "volunteer" | "other";
  summary?: string;
  html?: string;
  content?: unknown;
  leader?: string;
  leader_staff_id?: string;
  schedule?: string;
  place?: string;
  contact?: string;
  telegram?: string;
  join_url?: string;
  join_form?: boolean;
  cover?: string;
  cover_alt?: string;
  photos: Photo[];
  news_tag?: string;
}
export interface Achievement {
  id: string;
  title: string;
  year?: number;
  result?: string;
  athlete?: string;
  photo?: string;
  photo_alt?: string;
  url?: string;
}
export interface Facility {
  id: string;
  title: string;
  summary?: string;
  place?: string;
  hours?: string;
  photo?: string;
  photo_alt?: string;
}
export interface Dorm {
  id: string;
  title: string;
  summary?: string;
  address?: string;
  map_url?: string;
  capacity?: number | null;
  rooms?: string[];
  amenities?: string[];
  price?: string;
  price_period?: "month" | "semester" | "year";
  phone?: string;
  photos: Photo[];
}
export interface Scholarship {
  id: string;
  title: string;
  summary?: string;
  amount?: string;
  eligibility?: string;
  criteria?: string[];
  period?: string;
  documents?: string[];
  url?: string;
  tags?: string[];
}
export interface AlbumCard {
  id: string;
  slug: string;
  title: string;
  date?: string;
  summary?: string;
  count: number;
  videos_count: number;
  cover_photo: Photo | null;
}
export interface Album {
  id: string;
  slug: string;
  title: string;
  date?: string;
  summary?: string;
  photos: Photo[];
  videos: string[];
}
export interface Step {
  id: string;
  title: string;
  summary?: string;
  starts?: string;
  ends?: string;
  url?: string;
  button?: string;
  state: "done" | "now" | "next";
}
export interface StepsData {
  years: { year: number; label: string }[];
  year: number | null;
  label?: string;
  steps: Step[];
  current: number | null;
  intro: string;
}
export type Form = "day" | "extramural" | "evening" | "distance" | "second";
export interface CalcMeta {
  years: { year: number; label: string }[];
  by_year: Record<string, { forms: Form[]; langs: string[] }>;
  max_score: number;
  sources: Record<string, string>;
  intro: string;
}
export interface CalcRow {
  id: string;
  title: string;
  slug: string;
  form: Form;
  edu_lang: string;
  quota: number | null;
  grant: number | null;
  contract: number | null;
  status: "grant" | "contract" | "short" | "nodata";
  gap: number | null;
  grant_gap: number | null;
  fee: number | null;
}
export interface CalcResult {
  year: number | null;
  label?: string;
  results: CalcRow[];
  max_score: number;
  source: string;
  counts: Record<CalcRow["status"], number>;
}
export interface Spot {
  id: string;
  title: string;
  number?: number | null;
  summary?: string;
  inside?: string[];
  photo?: string;
  photo_alt?: string;
  x?: number | null;
  y?: number | null;
  scene_id?: string;
  url?: string;
}
export interface MapData {
  image: string;
  image_alt: string;
  lat: number;
  lon: number;
  zoom: number;
  spots: Spot[];
  tour: boolean;
}
export interface Hotspot {
  type: "scene" | "info";
  yaw: number;
  pitch: number;
  text: string;
  target?: string;
}
export interface Scene {
  id: string;
  title: string;
  summary?: string;
  panorama: string;
  yaw: number;
  pitch: number;
  hfov: number;
  hotspots: Hotspot[];
}
export interface RegInfo {
  enabled: boolean;
  state: "open" | "full" | "waitlist" | "closed" | "off";
  capacity: number | null;
  taken: number;
  left: number | null;
  deadline: string | null;
  waitlist: boolean;
  guests_max: number;
  fields: Record<"email" | "school" | "grade", "off" | "optional" | "required">;
  questions: { id: string; label: string; required: boolean }[];
}

const q = (lang: Lang, extra: Record<string, string | number | undefined> = {}) => {
  const p = new URLSearchParams({ lang });
  for (const [k, v] of Object.entries(extra)) if (v !== undefined && v !== "") p.set(k, String(v));
  return `?${p}`;
};

let sectionsP: Promise<Sections> | null = null;
export const cx = {
  sections: () => (sectionsP ||= req<Sections>("GET", "/api/campus/sections").catch((e) => ((sectionsP = null), Promise.reject(e)))),
  life: (lang: Lang) => req<{ sections: Sections; intro: string; clubs: Club[]; albums: AlbumCard[]; counts: Record<string, number> }>("GET", `/api/life${q(lang)}`),
  clubs: (lang: Lang) => req<{ items: Club[]; categories: Club["category"][]; intro: string }>("GET", `/api/clubs${q(lang)}`),
  club: (slug: string, lang: Lang) =>
    req<{ item: Club; leader: StaffCard | null; news: { id: string; title: string; slug: string; feature_image?: string; published_at?: string }[]; others: Club[] }>(
      "GET",
      `/api/clubs/${encodeURIComponent(slug)}${q(lang)}`,
    ),
  join: (slug: string, d: Record<string, string>) => req<{ ok: boolean; ticket?: number }>("POST", `/api/clubs/${encodeURIComponent(slug)}/join`, d),
  sport: (lang: Lang) => req<{ intro: string; clubs: Club[]; achievements: Achievement[]; facilities: Facility[] }>("GET", `/api/sport${q(lang)}`),
  dormitory: (lang: Lang) =>
    req<{
      intro: string;
      rules: string;
      steps: { title: string; text: string }[];
      faq: { q: string; a: string }[];
      apply_open: boolean;
      photo: string;
      photo_alt: string;
      contacts: StaffCard[];
      buildings: Dorm[];
    }>("GET", `/api/dormitory${q(lang)}`),
  dormApply: (d: Record<string, string>) => req<{ ok: boolean; ticket?: number }>("POST", "/api/dormitory/apply", d),
  scholarships: (lang: Lang) => req<{ items: Scholarship[]; tags: string[]; intro: string }>("GET", `/api/scholarships${q(lang)}`),
  gallery: (lang: Lang) => req<{ items: AlbumCard[]; years: number[]; intro: string }>("GET", `/api/gallery${q(lang)}`),
  album: (slug: string, lang: Lang) => req<{ item: Album; news: { title: string; slug: string } | null; others: AlbumCard[] }>("GET", `/api/gallery/${encodeURIComponent(slug)}${q(lang)}`),
  steps: (lang: Lang, year?: number) => req<StepsData>("GET", `/api/admission/steps${q(lang, { year })}`),
  calcMeta: (lang: Lang) => req<CalcMeta>("GET", `/api/admission/calculator${q(lang)}`),
  calc: (lang: Lang, p: { score: string; year?: number; form?: string; edu_lang?: string }) => req<CalcResult>("GET", `/api/admission/calc${q(lang, p)}`),
  parents: (lang: Lang) =>
    req<{
      intro: string;
      pay: string;
      faq: { q: string; a: string }[];
      contacts: StaffCard[];
      sections: Sections;
      tuition: boolean;
      dormitory: string;
      about: { name?: string; short_about?: string; mission?: string; values?: string[]; stats?: { value: string; suffix?: string; label: string }[]; address?: string; phones?: string[]; email?: string; hours?: string; map_url?: string };
    }>("GET", `/api/parents${q(lang)}`),
  map: (lang: Lang) => req<MapData>("GET", `/api/campus-map${q(lang)}`),
  tour: (lang: Lang) => req<{ scenes: Scene[]; first: string; intro: string }>("GET", `/api/tour${q(lang)}`),
  regInfo: (slug: string, lang: Lang) => req<RegInfo>("GET", `/api/events/${encodeURIComponent(slug)}/registration${q(lang)}`),
  register: (slug: string, d: Record<string, unknown>) =>
    req<{ status: "registered" | "waitlist"; position: number | null; email: boolean }>("POST", `/api/events/${encodeURIComponent(slug)}/register`, d),
};

/* ------------------------------------------------------------------ rasmlar: server kichraytirgan WebP (/img/m/{w}/{fayl}) */
const WIDTHS = [320, 480, 640, 960, 1280, 1600];
function thumbParts(url: string): [string, string] | null {
  const m = /^\/media\/([a-f0-9]{16}\.(?:png|jpg|webp))$/.exec(url || "");
  return m ? ["m", m[1]] : null;
}
/** Eng yaqin kenglikdagi kichraytirilgan nusxa (tashqi manzil — o'zgarishsiz). */
export function img(url: string, w: number): string {
  const p = thumbParts(url);
  if (!p) return url;
  const width = WIDTHS.find((x) => x >= w) || WIDTHS[WIDTHS.length - 1];
  return `/img/${p[0]}/${width}/${p[1]}`;
}
export function srcset(url: string, max = 1600): string | undefined {
  const p = thumbParts(url);
  if (!p) return undefined;
  return WIDTHS.filter((w) => w <= max)
    .map((w) => `/img/${p[0]}/${w}/${p[1]} ${w}w`)
    .join(", ");
}
export const ytId = (u: string) => /^[\w-]{11}$/.test(u) ? u : (/(?:v=|youtu\.be\/|embed\/|shorts\/|live\/)([\w-]{11})/.exec(u)?.[1] || "");
