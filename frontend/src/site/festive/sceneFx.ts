// Bayram sahnasining jonli qatlamlari (bitta canvas): qor, gulbarglar, kuzgi barglar, abadiy olov uchqunlari,
// archa chiroqlari va yulduzi, osmondagi yulduzlar, oltin zarrachalar, chana izidagi uchqunlar.
// Suratdagi nuqtalar (masalan, olov yoki archa uchi) surat koordinatalarida (0..1) beriladi —
// har kadrda surat qutisi (Ken Burns harakati bilan birga) o'lchanib, piksellarga o'tkaziladi.

import { elmLeaf, mapleLeaf, mapleVeins } from "./leafPath";

export type Layer =
  | { k: "snow"; density?: number }
  | { k: "petals"; colors: string[]; density?: number }
  | { k: "leaves"; density?: number }
  | { k: "embers"; at: [number, number]; spread?: number }
  | { k: "flame"; at: [number, number]; r: number; color?: string }
  | { k: "bulbs"; pts: number[][] }
  | { k: "treestar"; at: [number, number]; size: number }
  | { k: "stars"; area: [number, number, number, number]; n: number } // kanvasdagi ulush: x0, y0, x1, y1
  | { k: "dust"; color: string; density?: number }
  | { k: "trail"; el: () => HTMLElement | null };

interface Part {
  x: number;
  y: number;
  vx: number;
  vy: number;
  s: number;
  r: number;
  vr: number;
  ph: number;
  vph: number;
  life: number;
  max: number;
  c: string;
  c2: string;
  z: number; // chuqurlik 0..1 (1 — yaqin)
  kind: "flake" | "petal" | "leaf" | "ember" | "dust" | "spark";
  shape: number;
}

const TAU = Math.PI * 2;
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(a: T[]): T => a[(Math.random() * a.length) | 0];

const LEAF_COLORS: [string, string][] = [
  ["#f2a541", "#b5651d"],
  ["#e8762d", "#9c3d12"],
  ["#d4a017", "#8a5a0b"],
  ["#c0392b", "#6e1b12"],
  ["#e9b44c", "#a4661f"],
];

export class SceneFx {
  private ctx: CanvasRenderingContext2D;
  private ps: Part[] = [];
  private w = 0;
  private h = 0;
  private dpr = 1;
  private raf = 0;
  private last = 0;
  private t = 0;
  private running = false;
  private acc: Record<string, number> = {};
  private stars: { x: number; y: number; s: number; ph: number; sp: number }[] = [];
  private bulbCol: string[] = [];
  private ro?: ResizeObserver;
  private sprites = new Map<string, HTMLCanvasElement>();
  private wind = 0;

  constructor(
    private canvas: HTMLCanvasElement,
    private layers: Layer[],
    private stage: () => DOMRect | null, // surat qutisi (sahifa koordinatalarida)
    private scale = 1, // ichki sahifalardagi ixcham lentada — kamroq
  ) {
    this.ctx = canvas.getContext("2d")!;
    this.resize();
    if (typeof ResizeObserver !== "undefined") {
      this.ro = new ResizeObserver(() => this.resize());
      this.ro.observe(canvas);
    }
    const b = layers.find((l) => l.k === "bulbs");
    if (b && b.k === "bulbs") {
      const cols = ["#fff1c9", "#fff1c9", "#ffe08a", "#ff5a5f", "#ffd166", "#7bdff2", "#b9fbc0", "#fff1c9"];
      this.bulbCol = b.pts.map(() => pick(cols));
    }
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = Math.max(1, r.width);
    this.h = Math.max(1, r.height);
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const st = this.layers.find((l) => l.k === "stars");
    this.stars = [];
    if (st && st.k === "stars") {
      const [x0, y0, x1, y1] = st.area;
      const n = Math.round(st.n * Math.min(1.5, this.w / 1200));
      for (let i = 0; i < n; i++) this.stars.push({ x: rnd(x0, x1) * this.w, y: rnd(y0, y1) * this.h, s: Math.random() < 0.12 ? rnd(1.3, 2) : rnd(0.5, 1.1), ph: rnd(0, TAU), sp: rnd(0.6, 2.2) });
    }
    // boshida ekran bo'sh turmasin
    if (!this.ps.length) for (let i = 0; i < 260; i++) this.spawn(0.05, true);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const loop = (now: number) => {
      if (!this.running) return;
      const dt = Math.min(0.04, (now - this.last) / 1000);
      this.last = now;
      this.step(dt);
      this.draw();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  destroy() {
    this.stop();
    this.ro?.disconnect();
    this.ps = [];
  }

  /** Bir martalik kadr (harakatni kamaytirish rejimi) */
  still() {
    this.draw();
  }

  private img(nx: number, ny: number): [number, number] | null {
    const s = this.stage();
    const c = this.canvas.getBoundingClientRect();
    if (!s) return null;
    return [s.left - c.left + nx * s.width, s.top - c.top + ny * s.height];
  }

  /* ------------------------------------------------------------ yaratish */
  private spawn(dt: number, anywhere = false) {
    const area = (this.w * this.h) / (1440 * 520);
    for (const l of this.layers) {
      let rate = 0;
      let make: (() => Part | null) | null = null;
      const d = ("density" in l && l.density) || 1;
      if (l.k === "snow") {
        rate = 70 * d;
        make = () => {
          const z = Math.pow(Math.random(), 1.6); // ko'pchiligi uzoqda (mayda)
          const s = z > 0.92 ? rnd(4, 7) : 0.7 + z * 2.6;
          return this.part("flake", rnd(-40, this.w + 40), anywhere ? rnd(0, this.h) : -10, rnd(-8, 8), 18 + z * 70, s, z, "#fff", "#fff");
        };
      } else if (l.k === "petals") {
        rate = 7 * d;
        make = () => {
          const z = rnd(0.25, 1);
          const p = this.part("petal", rnd(-60, this.w * 0.9), anywhere ? rnd(0, this.h) : -20, rnd(20, 50), 26 + z * 40, 5 + z * 8, z, pick(l.colors), "#ffffff");
          p.shape = Math.random();
          return p;
        };
      } else if (l.k === "leaves") {
        rate = 3.2 * d;
        make = () => {
          const z = rnd(0.3, 1);
          const [c, c2] = pick(LEAF_COLORS);
          const p = this.part("leaf", rnd(-60, this.w), anywhere ? rnd(0, this.h) : -24, rnd(10, 40), 30 + z * 45, 8 + z * 12, z, c, c2);
          p.shape = Math.random() < 0.55 ? 0 : 1; // 0 — tol (cho'zinchoq), 1 — chinor
          return p;
        };
      } else if (l.k === "embers" && !anywhere) {
        rate = 16;
        make = () => {
          const pt = this.img(l.at[0], l.at[1]);
          if (!pt) return null;
          const sp = (l.spread ?? 0.012) * (this.stage()?.width || 1000);
          const p = this.part("ember", pt[0] + rnd(-sp, sp), pt[1] + rnd(-sp * 0.5, sp * 0.5), rnd(-10, 10), -rnd(30, 70), rnd(0.8, 1.8), 1, pick(["#ffb347", "#ff8c1a", "#ffd27a"]), "#fff");
          p.max = rnd(1.4, 2.8);
          return p;
        };
      } else if (l.k === "dust") {
        rate = 5 * d;
        make = () => {
          const p = this.part("dust", rnd(0, this.w), anywhere ? rnd(0, this.h) : this.h + 10, rnd(-6, 6), -rnd(6, 16), rnd(1, 3.2), rnd(0.3, 1), l.color, l.color);
          p.max = rnd(7, 14);
          return p;
        };
      } else if (l.k === "trail" && !anywhere) {
        const el = l.el();
        if (el) {
          const r = el.getBoundingClientRect();
          const c = this.canvas.getBoundingClientRect();
          if (r.right > c.left && r.left < c.right) {
            rate = 60;
            make = () => {
              // chana yugurdagining orqa uchi (chap pastki qism) — oltin chang
              const p = this.part("spark", r.left - c.left + r.width * rnd(0.01, 0.06), r.top - c.top + r.height * rnd(0.72, 0.9), rnd(-30, -8), rnd(4, 26), rnd(0.8, 2.2), 1, pick(["#ffe9a8", "#ffd27a", "#fff6dd"]), "#fff");
              p.max = rnd(0.8, 1.6);
              return p;
            };
          }
        }
      }
      if (!make) continue;
      const key = l.k;
      this.acc[key] = (this.acc[key] || 0) + rate * area * this.scale * dt;
      let guard = 0;
      while (this.acc[key] >= 1 && guard++ < 400) {
        this.acc[key] -= 1;
        const p = make();
        if (p) this.ps.push(p);
      }
    }
  }

  private part(kind: Part["kind"], x: number, y: number, vx: number, vy: number, s: number, z: number, c: string, c2: string): Part {
    return { kind, x, y, vx, vy, s, z, c, c2, r: rnd(0, TAU), vr: rnd(-1.5, 1.5), ph: rnd(0, TAU), vph: rnd(1.2, 3.2), life: 0, max: 60, shape: 0 };
  }

  /* ------------------------------------------------------------ fizika */
  private step(dt: number) {
    this.t += dt;
    // shamol: sekin o'zgaradigan esish
    this.wind = Math.sin(this.t * 0.23) * 14 + Math.sin(this.t * 0.61) * 7;
    this.spawn(dt);
    const out: Part[] = [];
    for (const p of this.ps) {
      p.life += dt;
      p.ph += p.vph * dt;
      switch (p.kind) {
        case "flake":
          p.x += (p.vx + this.wind * (0.4 + p.z) + Math.sin(p.ph) * (6 + p.z * 10)) * dt;
          p.y += p.vy * dt;
          break;
        case "petal":
        case "leaf":
          p.x += (p.vx + this.wind * 1.4 + Math.sin(p.ph) * 26 * p.z) * dt;
          p.y += (p.vy + Math.cos(p.ph * 1.3) * 12) * dt;
          p.r += p.vr * dt;
          break;
        case "ember":
          p.vx += rnd(-60, 60) * dt;
          p.vy -= 8 * dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          break;
        case "dust":
          p.x += (p.vx + Math.sin(p.ph) * 6) * dt;
          p.y += p.vy * dt;
          break;
        case "spark":
          p.vy += 40 * dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          break;
      }
      if (p.life < p.max && p.y < this.h + 30 && p.y > -60 && p.x > -90 && p.x < this.w + 90) out.push(p);
    }
    this.ps = out.length > 1600 ? out.slice(out.length - 1600) : out;
  }

  /* ------------------------------------------------------------ chizish */
  private glow(color: string, soft = 0.35): HTMLCanvasElement {
    const key = color + soft;
    let c = this.sprites.get(key);
    if (c) return c;
    c = document.createElement("canvas");
    c.width = c.height = 64;
    const x = c.getContext("2d")!;
    const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.18, color);
    g.addColorStop(soft, color + "55");
    g.addColorStop(1, color + "00");
    x.fillStyle = g;
    x.fillRect(0, 0, 64, 64);
    this.sprites.set(key, c);
    return c;
  }

  private draw() {
    const c = this.ctx;
    c.clearRect(0, 0, this.w, this.h);
    // osmondagi yulduzlar
    for (const s of this.stars) {
      const a = 0.35 + 0.65 * Math.pow(0.5 + 0.5 * Math.sin(this.t * s.sp + s.ph), 3);
      c.globalAlpha = a;
      c.fillStyle = "#fff";
      c.beginPath();
      c.arc(s.x, s.y, s.s, 0, TAU);
      c.fill();
      if (s.s > 1.2) {
        c.globalAlpha = a * 0.5;
        c.drawImage(this.glow("#cfe0ff"), s.x - s.s * 4, s.y - s.s * 4, s.s * 8, s.s * 8);
      }
    }
    c.globalAlpha = 1;
    for (const l of this.layers) {
      if (l.k === "flame") this.drawFlame(l.at, l.r, l.color || "#ff9a2e");
      else if (l.k === "bulbs") this.drawBulbs(l.pts);
      else if (l.k === "treestar") this.drawStar(l.at, l.size);
    }
    for (const p of this.ps) {
      const fadeIn = Math.min(1, p.life / 0.6);
      const fadeOut = p.max < 60 ? Math.max(0, 1 - Math.max(0, p.life - p.max * 0.6) / (p.max * 0.4)) : 1;
      const a = fadeIn * fadeOut;
      if (a <= 0.01) continue;
      switch (p.kind) {
        case "flake": {
          if (p.s > 3.5) {
            // yaqin parcha — ob'ektivda xira (bokeh)
            c.globalAlpha = a * 0.55;
            c.drawImage(this.glow("#ffffff", 0.6), p.x - p.s * 1.6, p.y - p.s * 1.6, p.s * 3.2, p.s * 3.2);
          } else {
            c.globalAlpha = a * (0.45 + p.z * 0.5);
            c.fillStyle = "#fff";
            c.beginPath();
            c.arc(p.x, p.y, p.s, 0, TAU);
            c.fill();
          }
          break;
        }
        case "petal":
          this.drawPetal(p, a);
          break;
        case "leaf":
          this.drawLeaf(p, a);
          break;
        case "ember": {
          const fl = 0.6 + 0.4 * Math.sin(p.ph * 9);
          c.globalCompositeOperation = "lighter";
          c.globalAlpha = a * fl;
          c.drawImage(this.glow(p.c), p.x - p.s * 3, p.y - p.s * 3, p.s * 6, p.s * 6);
          c.globalCompositeOperation = "source-over";
          break;
        }
        case "dust":
        case "spark": {
          const tw = p.kind === "spark" ? 0.5 + 0.5 * Math.sin(p.ph * 14) : 0.6 + 0.4 * Math.sin(p.ph * 2);
          c.globalCompositeOperation = "lighter";
          c.globalAlpha = a * tw * (p.kind === "dust" ? 0.55 * p.z : 1);
          c.drawImage(this.glow(p.c), p.x - p.s * 3, p.y - p.s * 3, p.s * 6, p.s * 6);
          c.globalCompositeOperation = "source-over";
          break;
        }
      }
    }
    c.globalAlpha = 1;
  }

  private drawPetal(p: Part, a: number) {
    const c = this.ctx;
    c.save();
    c.translate(p.x, p.y);
    c.rotate(p.r);
    c.scale(Math.cos(p.ph) * 0.85 + 0.15 * Math.sign(Math.cos(p.ph) || 1), 1); // aylanib tushish (3D)
    c.globalAlpha = a * (0.7 + 0.3 * p.z);
    const s = p.s;
    const g = c.createLinearGradient(0, -s, 0, s);
    g.addColorStop(0, p.c2);
    g.addColorStop(0.7, p.c);
    g.addColorStop(1, p.c);
    c.fillStyle = g;
    c.beginPath();
    // yumaloq gulbarg, uchida kichik o'yiq
    c.moveTo(0, s);
    c.bezierCurveTo(s * 0.95, s * 0.6, s * 0.9, -s * 0.75, s * 0.18, -s);
    c.quadraticCurveTo(0, -s * 0.78, -s * 0.18, -s);
    c.bezierCurveTo(-s * 0.9, -s * 0.75, -s * 0.95, s * 0.6, 0, s);
    c.fill();
    c.globalAlpha *= 0.35;
    c.strokeStyle = p.c;
    c.lineWidth = 0.6;
    c.beginPath();
    c.moveTo(0, s * 0.9);
    c.lineTo(0, -s * 0.5);
    c.stroke();
    c.restore();
  }

  private drawLeaf(p: Part, a: number) {
    const c = this.ctx;
    c.save();
    c.translate(p.x, p.y);
    c.rotate(p.r);
    c.scale(Math.cos(p.ph) * 0.9 + 0.1, 1);
    c.globalAlpha = a * (0.75 + 0.25 * p.z);
    const s = p.s;
    const g = c.createLinearGradient(-s, -s, s, s);
    g.addColorStop(0, p.c);
    g.addColorStop(1, p.c2);
    c.fillStyle = g;
    if (p.shape === 0) elmLeaf(c, s);
    else mapleLeaf(c, s);
    c.fill();
    c.globalAlpha *= 0.45;
    c.strokeStyle = p.c2;
    c.lineWidth = Math.max(0.6, s * 0.05);
    if (p.shape === 0) {
      c.beginPath();
      c.moveTo(0, s * 1.1);
      c.lineTo(0, -s * 0.8);
    } else mapleVeins(c, s);
    c.stroke();
    c.restore();
  }

  private drawFlame(at: [number, number], r: number, color: string) {
    const pt = this.img(at[0], at[1]);
    const st = this.stage();
    if (!pt || !st) return;
    const c = this.ctx;
    const R = r * st.width;
    const fl = 0.75 + 0.15 * Math.sin(this.t * 9.3) + 0.1 * Math.sin(this.t * 23.1 + 1);
    c.globalCompositeOperation = "lighter";
    const g = c.createRadialGradient(pt[0], pt[1], 0, pt[0], pt[1], R * (1.6 + 0.2 * fl));
    g.addColorStop(0, `rgba(255,190,90,${0.42 * fl})`);
    g.addColorStop(0.35, `rgba(255,120,30,${0.2 * fl})`);
    g.addColorStop(1, "rgba(255,90,0,0)");
    c.fillStyle = g;
    c.beginPath();
    c.arc(pt[0], pt[1], R * 1.8, 0, TAU);
    c.fill();
    c.globalCompositeOperation = "source-over";
    void color;
  }

  private drawBulbs(pts: number[][]) {
    const c = this.ctx;
    const st = this.stage();
    if (!st) return;
    const k = Math.max(0.6, Math.min(1.4, st.width / 1000));
    c.globalCompositeOperation = "lighter";
    pts.forEach(([nx, ny], i) => {
      const pt = this.img(nx, ny);
      if (!pt) return;
      const tw = Math.pow(0.5 + 0.5 * Math.sin(this.t * (1.2 + (i % 5) * 0.37) + i * 1.7), 2);
      const col = this.bulbCol[i] || "#fff1c9";
      const s = (5 + 7 * tw) * k;
      c.globalAlpha = 0.35 + 0.65 * tw;
      c.drawImage(this.glow(col, 0.3), pt[0] - s, pt[1] - s, s * 2, s * 2);
      if (tw > 0.7) {
        // yulduzsimon chaqnash (ob'ektiv nurlari)
        c.globalAlpha = (tw - 0.7) * 2;
        c.strokeStyle = col;
        c.lineWidth = 1;
        const L = s * 1.8;
        c.beginPath();
        c.moveTo(pt[0] - L, pt[1]);
        c.lineTo(pt[0] + L, pt[1]);
        c.moveTo(pt[0], pt[1] - L);
        c.lineTo(pt[0], pt[1] + L);
        c.stroke();
      }
    });
    c.globalAlpha = 1;
    c.globalCompositeOperation = "source-over";
  }

  private drawStar(at: [number, number], size: number) {
    const pt = this.img(at[0], at[1]);
    const st = this.stage();
    if (!pt || !st) return;
    const c = this.ctx;
    const R = size * st.height;
    const pulse = 0.85 + 0.15 * Math.sin(this.t * 2.2);
    c.save();
    c.translate(pt[0], pt[1]);
    c.globalCompositeOperation = "lighter";
    // nur halqasi
    c.globalAlpha = 0.55 * pulse;
    c.drawImage(this.glow("#ffd77a", 0.45), -R * 3.2, -R * 3.2, R * 6.4, R * 6.4);
    // aylanuvchi nurlar
    c.rotate(this.t * 0.15);
    for (let i = 0; i < 8; i++) {
      c.rotate(TAU / 8);
      const L = R * (i % 2 ? 2.4 : 4) * pulse;
      const g = c.createLinearGradient(0, 0, 0, -L);
      g.addColorStop(0, "rgba(255,240,200,0.7)");
      g.addColorStop(1, "rgba(255,220,150,0)");
      c.fillStyle = g;
      c.beginPath();
      c.moveTo(-R * 0.08, 0);
      c.lineTo(0, -L);
      c.lineTo(R * 0.08, 0);
      c.fill();
    }
    c.restore();
    // yulduzning o'zi (oltin, besh qirrali)
    c.save();
    c.translate(pt[0], pt[1]);
    c.globalCompositeOperation = "source-over";
    const g = c.createRadialGradient(0, -R * 0.2, 0, 0, 0, R);
    g.addColorStop(0, "#fffbe8");
    g.addColorStop(0.45, "#ffd56b");
    g.addColorStop(1, "#d99a1e");
    c.fillStyle = g;
    c.shadowColor = "rgba(255,200,90,0.9)";
    c.shadowBlur = R * 1.2;
    c.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * TAU) / 10;
      const r = i % 2 ? R * 0.42 : R;
      c.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    c.closePath();
    c.fill();
    c.restore();
  }
}
