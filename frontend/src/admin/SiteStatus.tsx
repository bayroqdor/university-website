// Yangi bo'limlar (institut sahifalari, talabalar hayoti, abituriyent, karyera): bo'lim saytda ko'rinadimi.
// Bo'sh bo'lim (chop etilgan yozuv yo'q) saytda 404 va menyuda yashirin — admin buni shu yerda ko'radi.
import { AlertTriangle, ExternalLink, Info } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { req } from "../lib/api";
import "../styles/site-status-admin.css";

export type SectionState = { visible: boolean; in_menu: boolean };

/** `dep` o'zgarganda (masalan, ro'yxat qayta yuklanganda) holat qayta so'raladi. */
export function useSiteSection(path: string, dep?: unknown): SectionState | null {
  const [s, setS] = useState<SectionState | null>(null);
  useEffect(() => {
    let live = true;
    req<Record<string, SectionState>>("GET", "/api/admin/site-sections")
      .then((r) => live && setS(r[path] || null))
      .catch(() => live && setS(null));
    return () => {
      live = false;
    };
  }, [path, dep]);
  return s;
}

/** Sarlavhadagi «Saytda» havolasi: faqat bo'lim saytda ochilsa (aks holda 404 sahifaga olib bormaydi). */
export function SiteLink({ path, state, label = "Saytda" }: { path: string; state: SectionState | null; label?: string }) {
  if (!state?.visible) return null;
  return (
    <a className="a-btn default md" href={path} target="_blank" rel="noreferrer">
      <ExternalLink size={15} /> {label}
    </a>
  );
}

/** Holat qatori: bo'lim yashirin bo'lsa — sababi va nima qilish kerakligi; menyuda havola bo'lmasa — eslatma. */
export function SiteNote({ state, hidden }: { state: SectionState | null; hidden?: string }) {
  if (!state) return null;
  if (!state.visible)
    return (
      <p className="ss-note warn" role="status">
        <AlertTriangle size={15} aria-hidden />
        <span>{hidden || "Saytda ko‘rinmaydi: hali birorta yozuv chop etilmagan. Yozuvni «Saytda ko‘rinadi» holatida saqlang — sahifa va menyudagi havola darhol paydo bo‘ladi."}</span>
      </p>
    );
  if (!state.in_menu)
    return (
      <p className="ss-note" role="status">
        <Info size={15} aria-hidden />
        <span>
          Sahifa saytda ochiladi, lekin menyuda havolasi yo‘q. Kerak bo‘lsa, <Link to="/admin/menu">Menyu</Link> bo‘limida qo‘shing.
        </span>
      </p>
    );
  return null;
}
