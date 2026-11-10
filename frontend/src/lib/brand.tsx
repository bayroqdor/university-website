// Institut logotipi (admin → Institut → Logotip) — kabinet, admin, test va o'yin sahifalarida bir xil
import { useEffect, useState } from "react";
import { pub } from "./api";
import "../styles/brand.css";

export type Brand = { logo: string; text: string; name: string };

let cache: Promise<Brand> | null = null;
let last: Brand | null = null;

function load(): Promise<Brand> {
  if (!cache) {
    cache = pub
      .site()
      .then((d) => (last = { logo: d.uni.logo || "", text: d.site.logo_text || d.uni.abbr || "UNI", name: d.uni.abbr || d.site.logo_text || "UNI" }))
      .catch(() => (last = { logo: "", text: "UNI", name: "UNI" }));
  }
  return cache;
}

export function useBrand(): Brand | null {
  const [b, setB] = useState<Brand | null>(last);
  useEffect(() => {
    let alive = true;
    load().then((x) => alive && setB(x));
    return () => {
      alive = false;
    };
  }, []);
  return b;
}

/** Logotip; yuklanmagan bo'lsa — qisqartma yozilgan doira */
export function BrandMark({ className = "", size = 40 }: { className?: string; size?: number }) {
  const b = useBrand();
  if (b?.logo) return <img className={`brand-img ${className}`} src={b.logo} alt={b.name} style={{ width: size, height: size }} />;
  return (
    <span className={`brand-fallback ${className}`} style={{ width: size, height: size, fontSize: Math.round(size * 0.3) }} aria-label={b?.name || "UNI"}>
      {b?.text || "UNI"}
    </span>
  );
}
