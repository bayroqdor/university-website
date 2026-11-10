// Rasmlar karuseli (Instagram uslubida): o'ng/chap tugmalar rasm o'rtasida, pastda nuqtalar.
// Nuqtalar 5 tadan ko'p bo'lsa — 5 talik oyna siljiydi: oldinga o'tganda keyingi (6-) nuqta chiqadi, birinchisi yashirinadi.
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties } from "react";

export interface Slide {
  src: string;
  alt?: string;
}

const MAX_DOTS = 5;

export function dotWindow(idx: number, start: number, n: number): number {
  if (n <= MAX_DOTS) return 0;
  if (idx >= start + MAX_DOTS) return idx - MAX_DOTS + 1;
  if (idx < start) return idx;
  return Math.min(start, n - MAX_DOTS);
}

export function Carousel({ images, ratio = "4 / 3", onIndex, className = "" }: { images: Slide[]; ratio?: string; onIndex?: (i: number) => void; className?: string }) {
  const [idx, setIdx] = useState(0);
  const [start, setStart] = useState(0);
  const [drag, setDrag] = useState(0);
  const touch = useRef<{ x: number; y: number; w: number } | null>(null);
  const n = images.length;
  const go = (i: number) => {
    const next = Math.max(0, Math.min(n - 1, i));
    setIdx(next);
    setStart((s) => dotWindow(next, s, n));
    onIndex?.(next);
  };
  useEffect(() => {
    if (idx > n - 1) go(Math.max(0, n - 1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [n]);
  if (!n) return null;
  const first = Math.max(0, Math.min(start, n - MAX_DOTS));
  const visible = n <= MAX_DOTS ? images.map((_, i) => i) : Array.from({ length: MAX_DOTS }, (_, k) => first + k);
  return (
    <div
      className={`gal ${className}`}
      tabIndex={0}
      role="region"
      aria-roledescription="carousel"
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") go(idx + 1);
        if (e.key === "ArrowLeft") go(idx - 1);
      }}
    >
      <div
        className="gal-view"
        style={{ aspectRatio: ratio } as CSSProperties}
        onTouchStart={(e) => (touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, w: e.currentTarget.clientWidth })}
        onTouchMove={(e) => {
          if (!touch.current) return;
          const dx = e.touches[0].clientX - touch.current.x;
          if (Math.abs(dx) > Math.abs(e.touches[0].clientY - touch.current.y)) setDrag(dx);
        }}
        onTouchEnd={() => {
          const t = touch.current;
          touch.current = null;
          if (t && Math.abs(drag) > t.w * 0.18) go(idx + (drag < 0 ? 1 : -1));
          setDrag(0);
        }}
      >
        <div className="gal-track" style={{ transform: `translateX(calc(${-idx * 100}% + ${drag}px))`, transition: drag ? "none" : undefined }}>
          {images.map((im, i) => (
            <div className="gal-slide" key={i + im.src} aria-hidden={i !== idx}>
              <img src={im.src} alt={im.alt || ""} loading={i === 0 ? "eager" : "lazy"} decoding="async" draggable={false} />
            </div>
          ))}
        </div>
        {n > 1 && <span className="gal-count">{idx + 1}/{n}</span>}
        {idx > 0 && (
          <button type="button" className="gal-btn prev" onClick={() => go(idx - 1)} aria-label="Oldingi">
            <ChevronLeft size={20} />
          </button>
        )}
        {idx < n - 1 && (
          <button type="button" className="gal-btn next" onClick={() => go(idx + 1)} aria-label="Keyingi">
            <ChevronRight size={20} />
          </button>
        )}
      </div>
      {images[idx]?.alt && <div className="gal-cap">{images[idx].alt}</div>}
      {n > 1 && (
        <div className="gal-dots" aria-hidden="true">
          {visible.map((i, k) => {
            // oyna chetidagi nuqtalar kichikroq — ortida yana rasm borligini bildiradi (Instagram kabi)
            const edge = n > MAX_DOTS && ((k === 0 && first > 0) || (k === visible.length - 1 && first + MAX_DOTS < n));
            return <button type="button" tabIndex={-1} key={i} className={`gal-dot ${i === idx ? "on" : ""} ${edge ? "small" : ""}`} onClick={() => go(i)} />;
          })}
        </div>
      )}
    </div>
  );
}

export default Carousel;
