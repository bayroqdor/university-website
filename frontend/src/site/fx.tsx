// Vizual effektlar: kursor, silliq aylantirish, paydo bo'lish animatsiyalari, magnit tugmalar, hisoblagichlar
import Lenis from "lenis";
import { animate, motion, useInView, useMotionValue, useScroll, useSpring, useTransform, useVelocity, type MotionValue } from "motion/react";
import { Children, Fragment, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { useSite } from "../lib/site";

const EASE = [0.22, 1, 0.36, 1] as const;

/* ------------------------------------------------------------------ kursor */
export function Cursor() {
  const { data } = useSite();
  const dot = useRef<HTMLDivElement>(null);
  const ring = useRef<HTMLDivElement>(null);
  const label = useRef<HTMLSpanElement>(null);
  const enabled = (data?.site.cursor ?? true) && typeof window !== "undefined" && window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  useEffect(() => {
    if (!enabled) return;
    document.documentElement.classList.add("has-cursor");
    const pos = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    const ringPos = { ...pos };
    let raf = 0;
    let visible = false;
    let scale = 1;
    let target = 1;
    const onMove = (e: PointerEvent) => {
      pos.x = e.clientX;
      pos.y = e.clientY;
      if (!visible) {
        visible = true;
        ringPos.x = pos.x;
        ringPos.y = pos.y;
        dot.current?.classList.add("on");
        ring.current?.classList.add("on");
      }
      const el = (e.target as Element | null)?.closest?.("[data-cursor], a, button, input, textarea, select, label, [role=button]") as HTMLElement | null;
      const text = el?.dataset.cursor || "";
      const isField = !!el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);
      target = text ? 2.6 : el && !isField ? 1.9 : 1;
      // holat klasslari «cr-» prefiksli: sahifadagi .field, .text kabi klasslar bilan to'qnashmasin
      ring.current?.classList.toggle("cr-hover", !!el && !text && !isField);
      ring.current?.classList.toggle("cr-text", !!text);
      ring.current?.classList.toggle("cr-field", isField);
      dot.current?.classList.toggle("cr-field", isField || !!text);
      if (label.current) {
        if (text) label.current.textContent = text;
        label.current.classList.toggle("on", !!text && visible);
      }
    };
    const onLeave = () => {
      visible = false;
      dot.current?.classList.remove("on");
      ring.current?.classList.remove("on");
      label.current?.classList.remove("on");
    };
    const onDown = () => ring.current?.classList.add("cr-down");
    const onUp = () => ring.current?.classList.remove("cr-down");
    const loop = () => {
      // halqa kichik kechikish bilan ergashadi (chiziqli interpolyatsiya)
      ringPos.x += (pos.x - ringPos.x) * 0.16;
      ringPos.y += (pos.y - ringPos.y) * 0.16;
      scale += (target - scale) * 0.18;
      if (dot.current) dot.current.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0)`;
      if (ring.current) ring.current.style.transform = `translate3d(${ringPos.x}px, ${ringPos.y}px, 0) scale(${scale})`;
      // yozuv halqa bilan birga yuradi, lekin masshtablanmaydi — aniq va o'qiladigan bo'lib qoladi
      if (label.current) label.current.style.transform = `translate3d(${ringPos.x}px, ${ringPos.y}px, 0) translate(-50%, -50%)`;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerleave", onLeave);
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("pointerup", onUp);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      document.documentElement.classList.remove("has-cursor");
    };
  }, [enabled]);

  if (!enabled) return null;
  return (
    <>
      <div ref={ring} className="cursor-ring" aria-hidden />
      <span ref={label} className="cursor-label" aria-hidden />
      <div ref={dot} className="cursor-dot" aria-hidden />
    </>
  );
}

/* ------------------------------------------------------------------ silliq aylantirish */
let lenisInstance: Lenis | null = null;
export function scrollToTop(immediate = true) {
  if (lenisInstance) lenisInstance.scrollTo(0, { immediate });
  else window.scrollTo({ top: 0, behavior: immediate ? "auto" : "smooth" });
}
export function scrollToEl(el: Element | null, offset = -90) {
  if (!el) return;
  if (lenisInstance) lenisInstance.scrollTo(el as HTMLElement, { offset });
  else window.scrollTo({ top: (el as HTMLElement).getBoundingClientRect().top + window.scrollY + offset, behavior: "smooth" });
}

/** modal ochiqligida sahifa aylanmasin */
export function lockScroll(on: boolean) {
  document.documentElement.classList.toggle("scroll-locked", on);
  if (lenisInstance) (on ? lenisInstance.stop() : lenisInstance.start());
}

export function SmoothScroll() {
  const { data, motionOn } = useSite();
  const on = motionOn && (data?.site.smooth_scroll ?? true);
  useEffect(() => {
    if (!on) return;
    const l = new Lenis({ duration: 1.15, easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)), wheelMultiplier: 1, touchMultiplier: 1.4 });
    lenisInstance = l;
    let raf = 0;
    const loop = (time: number) => {
      l.raf(time);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      l.destroy();
      lenisInstance = null;
    };
  }, [on]);
  return null;
}

export function ScrollToTopOnRoute() {
  const { pathname, hash } = useLocation();
  // yangi sahifa birinchi chizilishidan oldin tepaga (aks holda avval eski joyda ochilib, keyin yuqoriga «sakraydi»)
  useLayoutEffect(() => {
    if (hash) {
      setTimeout(() => scrollToEl(document.getElementById(decodeURIComponent(hash.slice(1)))), 350);
      return;
    }
    window.scrollTo(0, 0);
    scrollToTop(true);
  }, [pathname, hash]);
  return null;
}

/* ------------------------------------------------------------------ paydo bo'lish */
export function Reveal({ children, delay = 0, y = 36, className, as = "div", style }: { children: ReactNode; delay?: number; y?: number; className?: string; as?: "div" | "section" | "li" | "article"; style?: CSSProperties }) {
  const { motionOn } = useSite();
  const Comp = motion[as];
  if (!motionOn) {
    const Tag = as;
    return (
      <Tag className={className} style={style}>
        {children}
      </Tag>
    );
  }
  return (
    <Comp className={className} style={style} initial={{ opacity: 0, y }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "0px 0px -8% 0px" }} transition={{ duration: 0.9, ease: EASE, delay }}>
      {children}
    </Comp>
  );
}

/** Ichidagi elementlar navbat bilan paydo bo'ladi */
export function Stagger({ children, className, gap = 0.08, as = "div" }: { children: ReactNode; className?: string; gap?: number; as?: "div" | "ul" | "ol" }) {
  const { motionOn } = useSite();
  const Comp = motion[as];
  if (!motionOn) {
    const Tag = as;
    return <Tag className={className}>{children}</Tag>;
  }
  return (
    <Comp className={className} initial="hidden" whileInView="show" viewport={{ once: true, margin: "0px 0px -8% 0px" }} variants={{ hidden: {}, show: { transition: { staggerChildren: gap } } }}>
      {Children.map(children, (c) =>
        c ? (
          <motion.div className="stagger-item" variants={{ hidden: { opacity: 0, y: 30 }, show: { opacity: 1, y: 0, transition: { duration: 0.8, ease: EASE } } }}>
            {c}
          </motion.div>
        ) : null,
      )}
    </Comp>
  );
}

/** Harflar pastdan niqob ostidan chiqib keladi (sahifa ochilganda yoki ko'rinishga kirganda) */
export function SplitText({ text, className, delay = 0, as = "span", stagger = 0.028, trigger = "mount" }: { text: string; className?: string; delay?: number; as?: "span" | "h1" | "h2"; stagger?: number; trigger?: "mount" | "view" }) {
  const { motionOn } = useSite();
  const Tag = as;
  if (!motionOn) return <Tag className={className}>{text}</Tag>;
  const words = text.split(" ");
  let i = 0;
  const run = trigger === "mount" ? { animate: "show" } : { whileInView: "show", viewport: { once: true, margin: "0px 0px -10% 0px" } };
  return (
    <motion.span className={`${className || ""} split-text`} initial="hidden" {...run} role={as === "span" ? undefined : "heading"} aria-level={as === "h1" ? 1 : as === "h2" ? 2 : undefined}>
      {/* ekran o'qish dasturlari uchun butun matn (harflarga bo'lingan nusxa yashirilgan) */}
      <span className="split-sr">{text}</span>
      {words.map((w, wi) => (
        <Fragment key={wi}>
          <span className="split-word" aria-hidden>
            {Array.from(w).map((ch) => {
              const d = delay + i++ * stagger;
              return (
                <span className="split-mask" key={d}>
                  <motion.span className="split-char" variants={{ hidden: { y: "110%" }, show: { y: "0%", transition: { duration: 1, ease: EASE, delay: d } } }}>
                    {ch}
                  </motion.span>
                </span>
              );
            })}
          </span>
          {wi < words.length - 1 && " "}
        </Fragment>
      ))}
    </motion.span>
  );
}

/** Matn aylantirish davomida so'zma-so'z «yonadi» */
export function ScrubText({ text, className }: { text: string; className?: string }) {
  const { motionOn } = useSite();
  const ref = useRef<HTMLParagraphElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 0.85", "end 0.45"] });
  if (!motionOn) return <p className={className}>{text}</p>;
  const words = text.split(/\s+/);
  return (
    <p ref={ref} className={`${className || ""} scrub`}>
      {words.map((w, i) => (
        <Word key={i} progress={scrollYProgress} range={[i / words.length, (i + 1) / words.length]}>
          {w}
        </Word>
      ))}
    </p>
  );
}
function Word({ children, progress, range }: { children: string; progress: MotionValue<number>; range: [number, number] }) {
  const opacity = useTransform(progress, range, [0.16, 1]);
  return (
    <motion.span style={{ opacity }} className="scrub-word">
      {children}{" "}
    </motion.span>
  );
}

/* ------------------------------------------------------------------ magnit tugma */
export function Magnetic({ children, strength = 0.35, className }: { children: ReactNode; strength?: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 220, damping: 16, mass: 0.4 });
  const sy = useSpring(y, { stiffness: 220, damping: 16, mass: 0.4 });
  const { motionOn } = useSite();
  if (!motionOn) return <span className={className}>{children}</span>;
  return (
    <motion.span
      ref={ref}
      className={`magnetic ${className || ""}`}
      style={{ x: sx, y: sy }}
      onPointerMove={(e) => {
        const r = ref.current!.getBoundingClientRect();
        x.set((e.clientX - (r.left + r.width / 2)) * strength);
        y.set((e.clientY - (r.top + r.height / 2)) * strength);
      }}
      onPointerLeave={() => {
        x.set(0);
        y.set(0);
      }}
    >
      {children}
    </motion.span>
  );
}

/* ------------------------------------------------------------------ hisoblagich */
export function Counter({ value, suffix = "" }: { value: string; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "0px 0px -10% 0px" });
  const { motionOn } = useSite();
  const target = parseFloat(value.replace(",", "."));
  const numeric = Number.isFinite(target) && /^[\d.,]+$/.test(value);
  const [shown, setShown] = useState(numeric && motionOn ? "0" : value);
  useEffect(() => {
    if (!inView || !numeric || !motionOn) return;
    const dec = (value.split(/[.,]/)[1] || "").length;
    const c = animate(0, target, { duration: 1.8, ease: EASE, onUpdate: (v) => setShown(v.toFixed(dec)) });
    return () => c.stop();
  }, [inView, numeric, motionOn, target, value]);
  return (
    <span ref={ref}>
      {shown}
      {suffix && <span className="counter-suffix">{suffix}</span>}
    </span>
  );
}

/* ------------------------------------------------------------------ yuguruvchi qator */
export function Marquee({ items, speed = 40 }: { items: string[]; speed?: number }) {
  const { motionOn } = useSite();
  const { scrollY } = useScroll();
  // aylantirish tezligiga qarab qator biroz qiyshayadi
  const velocity = useVelocity(scrollY);
  const skew = useSpring(useTransform(velocity, [-2500, 0, 2500], [8, 0, -8], { clamp: true }), { stiffness: 120, damping: 30 });
  if (!items.length) return null;
  const row = [...items, ...items];
  return (
    <div className="marquee" aria-hidden>
      <motion.div className="marquee-track" style={{ animationDuration: `${Math.max(12, items.length * (60 / speed) * 4)}s`, animationPlayState: motionOn ? "running" : "paused", skewX: skew }}>
        {row.map((w, i) => (
          <span key={i} className="marquee-item">
            {w}
            <i className="marquee-star">✦</i>
          </span>
        ))}
      </motion.div>
    </div>
  );
}

/* ------------------------------------------------------------------ o'qish jarayoni chizig'i */
export function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 120, damping: 24 });
  return <motion.div className="read-progress" style={{ scaleX }} />;
}

/** Parallaks: element aylantirish bilan sekinroq/tezroq siljiydi */
export function Parallax({ children, offset = 60, className }: { children: ReactNode; offset?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const { motionOn } = useSite();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], [offset, -offset]);
  return (
    <motion.div ref={ref} className={className} style={motionOn ? { y } : undefined}>
      {children}
    </motion.div>
  );
}

export { EASE };

/* ------------------------------------------------------------------ matnni kenglikka moslash */
/** Bir qatorli katta matn: shrift o'lchami konteyner kengligiga moslanadi (uzun ism ham to'liq sig'adi). */
export function FitText({ children, className, max = 230, min = 14 }: { children: string; className?: string; max?: number; min?: number }) {
  const box = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const b = box.current;
    const i = inner.current;
    if (!b || !i) return;
    const fit = () => {
      const base = 100;
      i.style.fontSize = `${base}px`;
      const w = i.getBoundingClientRect().width;
      const avail = b.clientWidth;
      if (!w || !avail) return;
      // 0.98 — shtrix chiziq va harflarning chekka qismlari uchun kichik zaxira
      i.style.fontSize = `${Math.max(min, Math.min(max, (base * avail * 0.98) / w))}px`;
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(b);
    document.fonts?.ready.then(fit).catch(() => null);
    return () => ro.disconnect();
  }, [children, max, min]);
  return (
    <div ref={box} className={className} aria-hidden>
      <span ref={inner}>{children}</span>
    </div>
  );
}
