// Admin → Virtual tur: ekvirektangulyar panoramalar (sahnalar), sahnalar orasida o'tish va ma'lumot nuqtalari.
import { Loader2, Rotate3d, Upload } from "lucide-react";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { req } from "../../lib/api";
import { PageHead } from "../ui";
import { em, ItemsPanel, SettingsCard, Tabs, VIS, Visible, useVisible, type Rec } from "./kit";

const TourEditor = lazy(() => import("./TourEditor"));

function PanoUpload({ value, onChange }: { value: string; onChange: (u: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const up = async (f?: File) => {
    if (!f) return;
    setBusy(true);
    setErr("");
    const fd = new FormData();
    fd.append("file", f);
    try {
      const r = await req<{ url: string }>("POST", "/api/admin/applicant/panorama", fd);
      onChange(r.url);
    } catch (e) {
      setErr(em(e));
    }
    setBusy(false);
    if (input.current) input.current.value = "";
  };
  return (
    <div className="cxa-pano-up">
      {value && <img src={value} alt="" className="cxa-pano-prev" />}
      <div
        className="a-drop"
        role="button"
        tabIndex={0}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), input.current?.click())}
        onClick={() => input.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          up(e.dataTransfer.files[0]);
        }}
      >
        {busy ? <Loader2 className="spin" /> : <Upload size={20} />}
        <b>{value ? "Panoramani almashtirish" : "Panorama yuklash"}</b>
        <span>Ekvirektangulyar 360° surat, nisbati 2:1 (masalan 6000×3000) · JPG/PNG/WEBP · 40 MB gacha</span>
        <input ref={input} type="file" hidden accept="image/jpeg,image/png,image/webp" onChange={(e) => up(e.target.files?.[0])} />
      </div>
      {err && (
        <p className="cxa-err" role="alert">
          {err}
        </p>
      )}
    </div>
  );
}

export function TourAdmin() {
  const [tab, setTab] = useState<"scenes" | "page">("scenes");
  const [vis, reload] = useVisible();
  const [scenes, setScenes] = useState<Rec[]>([]);
  const loadScenes = () => req<{ items: Rec[] }>("GET", "/api/admin/items/tour_scene").then((r) => setScenes(r.items)).catch(() => null);
  useEffect(() => {
    loadScenes();
  }, []);
  return (
    <div className="a-page">
      <PageHead
        title="Virtual tur"
        sub="360° sahnalar. Panorama yuklang, so‘ng panorama ustida o‘tish (boshqa sahnaga) va ma’lumot nuqtalarini qo‘ying. Kamida bitta nashr qilingan sahna bo‘lsa, /virtual-tour sahifasi saytda ochiladi."
        actions={<Visible on={vis?.tour} to="/virtual-tour" />}
      />
      <Tabs value={tab} onChange={setTab} items={[["scenes", "Sahnalar"], ["page", "Sahifa"]]} />
      {tab === "scenes" ? (
        <ItemsPanel
          kind="tour_scene"
          title="sahna"
          defaults={{ status: "draft", hotspots: [], yaw: 0, pitch: 0, hfov: 100 }}
          icon={<Rotate3d size={28} />}
          empty="Hali sahna yo‘q — birinchi panoramani yuklang"
          newLabel="Yangi sahna"
          onSaved={() => (reload(), loadScenes())}
          fields={[
            { key: "title", label: "Nomi", type: "text", wide: true, i18n: true },
            { key: "status", label: "Ko‘rinishi", type: "select", options: VIS },
            { key: "summary", label: "Qisqacha", type: "textarea", wide: true, i18n: true },
            { key: "panorama", label: "Panorama", type: "custom", render: ({ value, set }) => <PanoUpload value={(value as string) || ""} onChange={set} /> },
            {
              key: "hotspots",
              label: "Nuqtalar va boshlang‘ich ko‘rinish",
              type: "custom",
              render: ({ item, setItem }) => (
                <Suspense fallback={<Loader2 className="spin" />}>
                  <TourEditor item={item} setItem={setItem} scenes={scenes} />
                </Suspense>
              ),
            },
          ]}
          row={(x) => (
            <>
              <b>{String(x.title)}</b>
              <small>{x.panorama ? `${((x.hotspots as unknown[]) || []).length} ta nuqta` : "panorama yuklanmagan"}</small>
            </>
          )}
        />
      ) : (
        <SettingsCard
          group="applicant"
          section="tour"
          title="«Virtual tur» sahifasi"
          fields={[
            { key: "intro", label: "Kirish matni", type: "ltext", rows: 3 },
            { key: "first_scene", label: "Birinchi sahna", type: "select", options: [{ value: "", label: "— ro‘yxatdagi birinchisi —" }, ...scenes.map((s) => ({ value: String(s.id), label: String(s.title) }))] },
          ]}
        />
      )}
    </div>
  );
}
