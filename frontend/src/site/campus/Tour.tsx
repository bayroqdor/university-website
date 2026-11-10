// Virtual tur (/virtual-tour): 360° panoramalar (Pannellum, faqat shu sahifada yuklanadi), sahnalar orasida o'tish nuqtalari,
// telefonda giroskop, to'liq ekran, klaviatura (strelkalar, +/−), «harakatni kamaytirish»da avtomatik aylanish yo'q;
// sahnalar ro'yxati va o'tish tugmalari — muqobil boshqaruv.
import { Compass, Maximize, Minus, Pause, Play, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { NotFound } from "../pages/Pages";
import { cx, type Scene } from "./api";
import { fill } from "./i18n";
import { loadPannellum, type PannellumViewer } from "./pannellum";
import { Hero, Loading, Section, useCx, useData } from "./ui";

export default function TourPage() {
  const { t, lang, motionOn } = useCx();
  const d = useData(() => cx.tour(lang), [lang]);
  const [sp, setSp] = useSearchParams();
  const host = useRef<HTMLDivElement>(null);
  const viewer = useRef<PannellumViewer | null>(null);
  const [cur, setCur] = useState("");
  const [rotating, setRotating] = useState(false);
  const [gyro, setGyro] = useState(false);
  const [err, setErr] = useState(false);
  const scenes: Scene[] = d && d !== "404" ? d.scenes : [];

  useEffect(() => {
    if (!d || d === "404" || !host.current || !d.scenes.length) return;
    let live = true;
    const start = d.scenes.some((s) => s.id === sp.get("scene")) ? (sp.get("scene") as string) : d.first;
    loadPannellum()
      .then((P) => {
        if (!live || !host.current) return;
        const cfg = {
          default: {
            firstScene: start,
            autoLoad: true,
            sceneFadeDuration: motionOn ? 500 : 0,
            autoRotate: motionOn ? -2 : 0,
            autoRotateInactivityDelay: -1,
            showControls: false,
            keyboardZoom: true,
            mouseZoom: true,
            compass: false,
            strings: { loadingLabel: t.loading, loadButtonLabel: t.tour },
          },
          scenes: Object.fromEntries(
            d.scenes.map((s) => [
              s.id,
              {
                title: s.title,
                type: "equirectangular",
                panorama: s.panorama,
                yaw: s.yaw || 0,
                pitch: s.pitch || 0,
                hfov: s.hfov || 100,
                hotSpots: s.hotspots.map((h) =>
                  h.type === "scene"
                    ? { type: "scene", pitch: h.pitch, yaw: h.yaw, sceneId: h.target, text: h.text || d.scenes.find((x) => x.id === h.target)?.title || "" }
                    : { type: "info", pitch: h.pitch, yaw: h.yaw, text: h.text },
                ),
              },
            ]),
          ),
        };
        const v = P.viewer(host.current, cfg);
        viewer.current = v;
        setCur(start);
        setRotating(motionOn);
        v.on("scenechange", (id) => {
          setCur(String(id));
          setSp({ scene: String(id) }, { replace: true });
        });
        v.on("mousedown", () => setRotating(false));
        v.on("touchstart", () => setRotating(false));
        v.on("error", () => setErr(true));
      })
      .catch(() => setErr(true));
    return () => {
      live = false;
      viewer.current?.destroy();
      viewer.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d, motionOn]);

  if (d === "404") return <NotFound />;
  if (!d) return <Loading />;
  const scene = scenes.find((s) => s.id === cur) || scenes[0];
  const v = () => viewer.current;
  const go = (id: string) => {
    v()?.loadScene(id);
    setCur(id);
  };
  const orientationOk = typeof window !== "undefined" && "DeviceOrientationEvent" in window && window.matchMedia?.("(pointer: coarse)").matches;
  return (
    <>
      <Hero crumbs={[{ to: "/admission", label: t.admission }, { label: t.tour }]} eyebrow={t.applicants} title={t.tour} lead={d.intro} />
      <Section className="tight-top">
        <div className="cx-tour">
          <div className="cx-tour-view">
            <div
              ref={host}
              className="cx-pano"
              tabIndex={0}
              role="application"
              aria-roledescription="360°"
              aria-label={fill(t.pano, { t: scene?.title || "" })}
            />
            {err && <p className="cx-formerr">{t.error}</p>}
            <div className="cx-tour-bar" role="toolbar" aria-label={t.tour}>
              <button type="button" className="cx-ibtn" onClick={() => v()?.setHfov((v()?.getHfov() || 100) - 15)} aria-label={t.zoom_in}>
                <Plus size={18} aria-hidden />
              </button>
              <button type="button" className="cx-ibtn" onClick={() => v()?.setHfov((v()?.getHfov() || 100) + 15)} aria-label={t.zoom_out}>
                <Minus size={18} aria-hidden />
              </button>
              {motionOn && (
                <button
                  type="button"
                  className="cx-ibtn"
                  aria-pressed={rotating}
                  aria-label={rotating ? t.pause : t.play}
                  onClick={() => {
                    if (rotating) v()?.stopAutoRotate();
                    else v()?.startAutoRotate(-2);
                    setRotating(!rotating);
                  }}
                >
                  {rotating ? <Pause size={18} aria-hidden /> : <Play size={18} aria-hidden />}
                </button>
              )}
              {orientationOk && (
                <button
                  type="button"
                  className="cx-ibtn"
                  aria-pressed={gyro}
                  aria-label={t.gyro}
                  onClick={() => {
                    if (gyro) v()?.stopOrientation();
                    else v()?.startOrientation();
                    setGyro(!gyro);
                  }}
                >
                  <Compass size={18} aria-hidden />
                </button>
              )}
              <button type="button" className="cx-ibtn" onClick={() => v()?.toggleFullscreen()} aria-label={t.fullscreen}>
                <Maximize size={18} aria-hidden />
              </button>
            </div>
          </div>
          <div className="cx-tour-side">
            {scene && (
              <div className="cx-tour-cur" aria-live="polite">
                <h2 className="cx-h3">{scene.title}</h2>
                {scene.summary && <p className="cx-p">{scene.summary}</p>}
                {scene.hotspots.some((h) => h.type === "info") && (
                  <ul className="cx-list">
                    {scene.hotspots
                      .filter((h) => h.type === "info")
                      .map((h, i) => (
                        <li key={i}>{h.text}</li>
                      ))}
                  </ul>
                )}
                {scene.hotspots.some((h) => h.type === "scene") && (
                  <p className="cx-tour-go">
                    {scene.hotspots
                      .filter((h) => h.type === "scene" && h.target)
                      .map((h, i) => (
                        <button key={i} type="button" className="cx-btn ghost sm" onClick={() => go(h.target as string)}>
                          {fill(t.go, { t: h.text || scenes.find((s) => s.id === h.target)?.title || "" })}
                        </button>
                      ))}
                  </p>
                )}
              </div>
            )}
            {scenes.length > 1 && (
              <>
                <h2 className="cx-h4">{t.scenes}</h2>
                <ol className="cx-scenes">
                  {scenes.map((s, i) => (
                    <li key={s.id}>
                      <button type="button" aria-current={s.id === scene?.id ? "true" : undefined} className={s.id === scene?.id ? "on" : ""} onClick={() => go(s.id)}>
                        <span className="tnum" aria-hidden>
                          {i + 1}
                        </span>
                        {s.title}
                      </button>
                    </li>
                  ))}
                </ol>
              </>
            )}
          </div>
        </div>
      </Section>
    </>
  );
}
