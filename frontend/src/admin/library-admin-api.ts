// Kutubxonachi paneli: muqova (rasm / elektron nashr sahifasi / avtomatik), fayl kimga ochiqligi, berish-qaytarishdagi takliflar.
import { req } from "../lib/api";
import type { Book } from "../library/api";

/** Elektron fayl kimga ochiq: hammaga (mehmon ham o'qiydi) / ro'yxatdan o'tganlar / faqat o'qituvchilar / tanlangan kafedra(lar). */
export type FileAccess = "public" | "registered" | "teachers" | "faculty";
export const normAccess = (v: string | undefined | null): FileAccess =>
  v === "public" || v === "teachers" || v === "faculty" ? v : "registered";

export type AdminBook = Book & { cover_auto?: number };

export type DeskOption = {
  copy_id: string;
  inv: string;
  barcode: string;
  location: string;
  status: "available" | "reserved" | "loaned";
  reserved_for_reader?: boolean;
  loan?: { id: string; due: string; issued: string; overdue: boolean; user: { id: string; name: string; login: string } };
};
export type DeskSuggestion = {
  id: string;
  title: string;
  subtitle: string;
  authors: string[];
  year: number | null;
  cover: string;
  copies: number;
  free: number;
  options: DeskOption[];
};

export const libCover = {
  /** PDF sahifasi (1 dan) yoki EPUB muqovasi — kichik JPEG */
  previewUrl: (fid: string, page: number) => `/api/admin/library/files/${fid}/preview?page=${page}`,
  fromPage: (bid: string, file_id: string, page: number) => req<AdminBook>("POST", `/api/admin/library/books/${bid}/cover/page`, { file_id, page }),
  auto: (bid: string) => req<AdminBook>("POST", `/api/admin/library/books/${bid}/cover/auto`),
  upload: (bid: string, file: Blob, name = "cover.jpg") => {
    const fd = new FormData();
    fd.append("file", file, name);
    return req<AdminBook>("POST", `/api/admin/library/books/${bid}/cover`, fd);
  },
};

export const libDesk = {
  /** issue: userId — o'quvchi (unga ajratilgan nusxalar ham chiqadi); return: prefer — shu o'quvchidagi kitoblar birinchi (boshqalarniki ham chiqadi) */
  suggest: (q: string, mode: "issue" | "return", userId?: string) =>
    req<{ items: DeskSuggestion[] }>(
      "GET",
      `/api/admin/library/desk/suggest?${new URLSearchParams(mode === "issue" ? { q, mode, user_id: userId || "" } : { q, mode, prefer: userId || "" }).toString()}`,
    ),
};

export const libSeedAccess = {
  save: (access: "public" | "registered") => req<{ access: string; updated: number }>("PUT", "/api/admin/library/seed/access", { access }),
};
