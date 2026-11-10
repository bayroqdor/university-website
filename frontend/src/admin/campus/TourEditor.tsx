// Virtual tur sahnasi muharriri: panorama ko'rinishida bosilgan nuqtaga o'tish yoki ma'lumot nuqtasini qo'yish,
// boshlang'ich ko'rinishni (yaw / pitch / masshtab) joriy ko'rinishdan olish. Pannellum faqat shu oynada yuklanadi.
import { Crosshair, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { loadPannellum, type PannellumViewer } from "../../site/campus/pannellum";
import { Btn, Input } from "../ui";
import type { Rec } from "./kit";

export interface HS {
  type: "scene" | "info";
  yaw: number;
  pitch: number;
  text: string;
  target?: string;
  i18n?: Record<string, string>;
}

export default function TourEditor({ item, setItem, scenes }: { item: Rec; setItem: (fn: (r: Rec) => Rec) => void; scenes: Rec[] }) {
  const host = useRef<HTMLDivElement>(null);
  const v = useRef<PannellumViewer | null>(null);
  const [mode, setMode] = useState<"scene" | "info">("info");
  const [err, setErr] = useState("");
  const hs = (item.hotspots as HS[]) || [];
  const pano = String(item.panorama || "");
  const others = scenes.filter((s) => s.id !== item.id);

  useEffect(() => {
    if (!pano || !host.current) return;
    let live = true;
    loadPannellum()
      .then((P) => {
        if (!live || !host.current) return;
        v.current?.destroy();
        v.current = P.viewer(host.current, {
          type: "equirectangular",
          panorama: pano,
          autoLoad: true,
          showControls: true,
          compass: false,
          yaw: Number(item.yaw) || 0,
          pitch: Number(item.pitch) || 0,
          hfov: Number(item.hfov) || 100,
        });
      })
      .catch(() => setErr("Panorama ko‘rsatkichini yuklab bo‘lmadi"));
    return () => {
      live = false;
      v.current?.destroy();
      v.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pano]);

  const add = (e: React.MouseEvent) => {
    if (!v.current || !e.altKey) return;
    const [pitch, yaw] = v.current.mouseEventToCoords(e.nativeEvent);
    setItem((r) => ({ ...r, hotspots: [...((r.hotspots as HS[]) || []), { type: mode, yaw: Math.round(yaw * 10) / 10, pitch: Math.round(pitch * 10) / 10, text: "", target: mode === "scene" ? String(others[0]?.id || "") : undefined }] }));
  };
  const addCenter = () => {
    if (!v.current) return;
    setItem((r) => ({
      ...r,
      hotspots: [...((r.hotspots as HS[]) || []), { type: mode, yaw: Math.round(v.current!.getYaw() * 10) / 10, pitch: Math.round(v.current!.getPitch() * 10) / 10, text: "", target: mode === "scene" ? String(others[0]?.id || "") : undefined }],
    }));
  };
  const upd = (i: number, p: Partial<HS>) => setItem((r) => ({ ...r, hotspots: ((r.hotspots as HS[]) || []).map((h, j) => (j === i ? { ...h, ...p } : h)) }));
  if (!pano) return <p className="a-hint">Avval panorama yuklang.</p>;
  return (
    <div className="cxa-tour">
      <div ref={host} className="cxa-pano" onClick={add} />
      {err && <p className="cxa-err">{err}</p>}
      <div className="cxa-row">
        <select className="a-input cxa-sel" value={mode} onChange={(e) => setMode(e.target.value as "scene" | "info")} aria-label="Nuqta turi">
          <option value="info">Ma’lumot nuqtasi</option>
          <option value="scene" disabled={!others.length}>
            Boshqa sahnaga o‘tish
          </option>
        </select>
        <Btn size="sm" icon={<Crosshair size={14} />} onClick={addCenter}>
          Markazga nuqta qo‘yish
        </Btn>
        <Btn
          size="sm"
          onClick={() =>
            v.current && setItem((r) => ({ ...r, yaw: Math.round(v.current!.getYaw()), pitch: Math.round(v.current!.getPitch()), hfov: Math.round(v.current!.getHfov()) }))
          }
        >
          Joriy ko‘rinish — boshlang‘ich
        </Btn>
        <span className="a-hint">Alt + bosish — bosilgan joyga nuqta.</span>
      </div>
      {hs.length > 0 && (
        <ol className="cxa-hs">
          {hs.map((h, i) => (
            <li key={i}>
              <b>{h.type === "scene" ? "O‘tish" : "Ma’lumot"}</b>
              {h.type === "scene" && (
                <select className="a-input" value={h.target || ""} onChange={(e) => upd(i, { target: e.target.value })} aria-label="Qaysi sahnaga">
                  {others.map((s) => (
                    <option key={s.id as string} value={s.id as string}>
                      {String(s.title)}
                    </option>
                  ))}
                </select>
              )}
              <Input value={h.text} placeholder={h.type === "scene" ? "Yozuv (ixtiyoriy)" : "Matn (majburiy)"} onChange={(e) => upd(i, { text: e.target.value })} aria-label="Matn" />
              <Input value={h.i18n?.ru || ""} placeholder="RU" onChange={(e) => upd(i, { i18n: { ...(h.i18n || {}), ru: e.target.value } })} aria-label="Matn RU" />
              <Input value={h.i18n?.en || ""} placeholder="EN" onChange={(e) => upd(i, { i18n: { ...(h.i18n || {}), en: e.target.value } })} aria-label="Matn EN" />
              <small className="tnum">
                {h.yaw}° / {h.pitch}°
              </small>
              <button type="button" className="a-icon danger" aria-label="Nuqtani o‘chirish" onClick={() => setItem((r) => ({ ...r, hotspots: hs.filter((_, j) => j !== i) }))}>
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
