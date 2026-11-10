// Ilmiy jurnal: ochiq API turlari va so'rovlar (backend: university/api/journal.py)
import { req, type Lang } from "../../lib/api";

export type Person = { id: string; name: string; role: string; position: string; affiliation: string; degree: string; country: string; orcid: string; photo: string; staff_id: string };
export type Journal = {
  title: string;
  abbr: string;
  issn_print: string;
  issn_online: string;
  publisher: string;
  founded: number | null;
  frequency: string;
  license: { code: string; url: string };
  cover: string;
  email: string;
  phone: string;
  address: string;
  texts: Record<string, string>;
  indexing: { title: string; url: string; logo: string }[];
  sections: { id: string; title: string }[];
  board: Person[];
  submissions_open: boolean;
  doi_prefix: string;
};
export type IssueRef = { id: string; volume: number; number: number; year: number; published_on: string; title: string; cover: string; url: string; pdf_url: string; key: string; draft?: boolean };
/** Admin ko'rib chiqish rejimi: sahifa (yoki undagi qoralamalar) saytda nega ko'rinmasligi va admin paneldagi tuzatish havolasi */
export type PreviewReason = { code: string; text: string; fix: string; fix_label: string };
type Pv = { preview?: PreviewReason[] };
export type Author = { given: string; family: string; name: string; aff: number[]; country: string; orcid: string; corresponding: boolean };
export type ArticleBrief = {
  id: string;
  num: number;
  slug: string;
  url: string;
  pdf_url: string;
  lang: string;
  title: string;
  title_i18n: Record<string, string>;
  authors: Author[];
  affiliations: string[];
  pages: { first: string; last: string };
  doi: string;
  section: { id: string; title: string };
  issue: IssueRef;
  published_on: string;
  views: number;
  downloads: number;
  draft?: boolean;
};
export type Article = ArticleBrief & {
  abstract: Record<string, { text: string; html: string }>;
  keywords: Record<string, string[]>;
  udc: string;
  dates: { received: string; revised: string; accepted: string; published: string };
  pdf_view: string;
  pdf_size: number;
  pdf_pages: number;
  references: string[];
  funding: string;
  license: { code: string; url: string };
  cite: { apa: string; gost: string; mla: string };
  bib_url: string;
  ris_url: string;
  abs_url: string;
};
export type Home = {
  journal: Journal;
  current: (IssueRef & { articles: ArticleBrief[] }) | null;
  latest: ArticleBrief[];
  years: number[];
  counts: { issues: number; articles: number };
} & Pv;

const q = (lang: Lang) => `lang=${encodeURIComponent(lang)}`;

export const jApi = {
  home: (lang: Lang) => req<Home>("GET", `/api/journal?${q(lang)}`),
  archive: (lang: Lang) => req<{ issues: (IssueRef & { articles: number })[] } & Pv>("GET", `/api/journal/archive?${q(lang)}`),
  issue: (key: string, lang: Lang) => req<{ issue: IssueRef; articles: ArticleBrief[] } & Pv>("GET", `/api/journal/issue/${encodeURIComponent(key)}?${q(lang)}`),
  article: (num: string, lang: Lang) => req<{ article: Article } & Pv>("GET", `/api/journal/article/${encodeURIComponent(num)}?${q(lang)}`),
  view: (num: number) => req<{ counted: boolean }>("POST", `/api/journal/article/${num}/view`),
  search: (p: Record<string, string>, lang: Lang) => req<{ items: ArticleBrief[]; total: number } & Pv>("GET", `/api/journal/search?${new URLSearchParams({ ...p, lang })}`),
  submit: (fd: FormData) => req<{ ok: boolean; ticket?: number }>("POST", "/api/journal/submit", fd),
};
