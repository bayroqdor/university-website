// Tashriflarni hisoblash: sahifa ko'rish, faollik va maqolani o'qish.
// Server bir sahifaning 30 daqiqa ichida qayta ochilishini (refresh) yangi ko'rish sifatida hisoblamaydi.
import { useEffect } from "react";
import { useLocation } from "react-router-dom";

function post(url: string, body: unknown) {
  const data = JSON.stringify(body);
  try {
    fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: data, keepalive: true, credentials: "same-origin" }).catch(() => null);
  } catch {
    /* */
  }
}

let firstRef: string | null = document.referrer || "";
const PRIVATE = /^\/(admin|student|teacher|print)/;

export function usePageTracking() {
  const loc = useLocation();
  useEffect(() => {
    if (PRIVATE.test(loc.pathname)) return;
    const qs = new URLSearchParams(loc.search);
    const utm = qs.get("utm_source") || qs.get("ref") || "";
    post("/api/t/pv", { path: loc.pathname, ref: firstRef, lang: navigator.language, utm });
    firstRef = "";
  }, [loc.pathname, loc.search]);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible" && !PRIVATE.test(window.location.pathname)) post("/api/t/ping", {});
    }, 30000);
    return () => window.clearInterval(id);
  }, []);
}

/** Maqolani o'qish: faol vaqt va eng chuqur aylantirish ulushi */
export function useReadTracking(slug: string | undefined, articleEl: React.RefObject<HTMLElement | null>, kind = "news") {
  useEffect(() => {
    if (!slug) return;
    let seconds = 0;
    let depth = 0;
    let lastSent = 0;
    const tick = window.setInterval(() => {
      if (document.visibilityState === "visible") seconds += 1;
      if (seconds - lastSent >= 15) send();
    }, 1000);
    const onScroll = () => {
      const el = articleEl.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const seen = (window.innerHeight - r.top) / Math.max(r.height, 1);
      depth = Math.max(depth, Math.min(1, Math.max(0, seen)));
    };
    const send = () => {
      lastSent = seconds;
      post("/api/t/read", { slug, kind, seconds, depth });
    };
    const onHide = () => document.visibilityState === "hidden" && send();
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("visibilitychange", onHide);
    onScroll();
    return () => {
      window.clearInterval(tick);
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("visibilitychange", onHide);
      if (seconds > 3) send();
    };
  }, [slug, articleEl, kind]);
}
