// Bayram zarrachalari dvigateli: bitta canvas, requestAnimationFrame, sahifa yashirilganda to'xtaydi.
// Havodagi zarrachalar (qor, gulbarg, konfetti, harflar...), bosganda portlash, salyut raketalari va sichqoncha izi.
import { mapleLeaf, mapleVeins } from "./leafPath";
import type { Kind, Theme } from "./themes";

interface P {
  k: Kind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  g: number; // tortishish
  drag: number;
  s: number; // o'lcham
  r: number; // burchak
  vr: number;
  ph: number; // tebranish fazasi
  sw: number; // tebranish kuchi
  life: number;
  max: number;
  c: string;
  c2: string;
  a: number;
  ch?: string;
  trail?: boolean;
  px?: number;
  py?: number;
  rocket?: boolean;
  ty?: number;
  depth: number;
}

const TAU = Math.PI * 2;
// yorug' mavzuda oq zarrachalar ko'rinmaydi — ranglar va qo'shilish usuli shunga moslanadi
let LIGHT = true;
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(arr: T[]): T => arr[(Math.random() * arr.length) | 0];

export class Engine {
  private ctx: CanvasRenderingContext2D;
  private ps: P[] = [];
  private w = 0;
  private h = 0;
  private dpr = 1;
  private raf = 0;
  private last = 0;
  private acc = 0;
  private nextRocket = 2.2;
  private running = false;
  private scale = 1;
  private bag: Kind[] = [];
  // bosganda: zarb to'lqini halqalari va harakat izli uchqunlar (yorug' sahifada ham yorqin ko'rinadi)
  private rings: { x: number; y: number; life: number; max: number; c: string; r: number }[] = [];
  private streaks: { x: number; y: number; vx: number; vy: number; life: number; max: number; c: string; w: number }[] = [];

  constructor(
    private canvas: HTMLCanvasElement,
    private t: Theme,
    private intensity: number,
    private opts: { particles: boolean; fireworks: boolean },
  ) {
    this.ctx = canvas.getContext("2d")!;
    LIGHT = document.documentElement.dataset.theme !== "dark";
    for (const a of t.ambient) for (let i = 0; i < a.weight; i++) this.bag.push(a.kind);
    this.resize();
  }

  resize() {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    this.canvas.width = Math.floor(this.w * this.dpr);
    this.canvas.height = Math.floor(this.h * this.dpr);
    this.canvas.style.width = `${this.w}px`;
    this.canvas.style.height = `${this.h}px`;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    // kichik ekranda kamroq zarracha
    this.scale = Math.max(0.35, Math.min(1.3, (this.w * this.h) / (1440 * 860)));
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    // boshida ekran bo'sh turmasin
    if (this.opts.particles) for (let i = 0; i < this.cap() * 0.45; i++) this.ambient(true);
    const loop = (now: number) => {
      if (!this.running) return;
      const dt = Math.min(0.05, (now - this.last) / 1000);
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
    this.ps = [];
    this.ctx.clearRect(0, 0, this.w, this.h);
  }

  private cap() {
    return Math.round(this.t.max * this.scale * (0.55 + this.intensity * 0.3));
  }

  /* ------------------------------------------------------------ zarracha yaratish */
  private make(k: Kind, x: number, y: number, o: Partial<P> = {}): P {
    const depth = rnd(0.45, 1);
    const cols = LIGHT ? this.t.colors.filter((x) => x.toLowerCase() !== "#ffffff") : this.t.colors;
    const c = pick(cols.length ? cols : this.t.colors);
    const base: P = { k, x, y, vx: 0, vy: 0, g: 0, drag: 0, s: 8, r: rnd(0, TAU), vr: rnd(-1.2, 1.2), ph: rnd(0, TAU), sw: rnd(10, 40), life: 0, max: 99, c, c2: pick(cols.length ? cols : this.t.colors), a: 1, depth };
    switch (k) {
      case "flake":
        Object.assign(base, { s: rnd(1.6, 4.6) * (depth + 0.25), vy: rnd(28, 70) * depth, sw: rnd(12, 34), c: "#ffffff", vr: rnd(-0.6, 0.6) });
        if (Math.random() < 0.22) base.s = rnd(6, 11) * depth; // katta qor parchasi (naqshli)
        break;
      case "petal":
        Object.assign(base, { s: rnd(6, 11) * depth, vy: rnd(30, 60) * depth, sw: rnd(30, 70), vr: rnd(-2.2, 2.2) });
        break;
      case "blossom":
        Object.assign(base, { s: rnd(7, 12) * depth, vy: rnd(25, 50) * depth, sw: rnd(25, 60), vr: rnd(-1, 1) });
        break;
      case "tulip":
        Object.assign(base, { s: rnd(10, 15) * depth, vy: rnd(30, 55) * depth, sw: rnd(20, 40), vr: rnd(-0.8, 0.8), c: pick(["#e63946", "#ff4d6d", "#ffb703", "#ff8fab"]) });
        break;
      case "heart":
        Object.assign(base, { s: rnd(7, 13) * depth, vy: rnd(28, 55) * depth, sw: rnd(20, 50), vr: rnd(-0.8, 0.8), c: pick(["#ff4d6d", "#ff8fab", "#e5383b"]) });
        break;
      case "mimosa":
        Object.assign(base, { s: rnd(5, 9) * depth, vy: rnd(25, 45) * depth, sw: rnd(20, 45), c: "#ffd60a" });
        break;
      case "confetti":
        Object.assign(base, { s: rnd(5, 9) * (depth + 0.2), vy: rnd(55, 110) * depth, sw: rnd(20, 60), vr: rnd(-6, 6) });
        break;
      case "leaf":
      case "maple":
        Object.assign(base, { s: rnd(9, 16) * depth, vy: rnd(35, 70) * depth, sw: rnd(40, 90), vr: rnd(-2, 2), c: k === "leaf" ? pick(["#8d6e63", "#b23a48", "#c58940"]) : pick(["#e07a1f", "#c0392b", "#f2a541", "#b5651d", "#e63946"]) });
        break;
      case "spark":
        Object.assign(base, { s: rnd(1.4, 3.2), vy: rnd(-25, 25), sw: rnd(5, 15), max: rnd(3, 7) });
        break;
      case "star":
        Object.assign(base, { s: rnd(3.5, 7) * depth, vy: rnd(-18, 18), sw: rnd(5, 18), vr: rnd(-0.6, 0.6), max: rnd(4, 9), c: pick(LIGHT ? cols : [...cols, "#ffffff"]) });
        break;
      case "letter": {
        const set = this.t.letters || ["가"];
        Object.assign(base, { s: rnd(16, 34) * depth, vy: rnd(-40, -18) * depth, sw: rnd(10, 30), vr: rnd(-0.4, 0.4), ch: pick(set), max: rnd(8, 14) });
        break;
      }
      case "plane":
        Object.assign(base, { s: rnd(14, 22), vx: rnd(70, 120), vy: rnd(-10, 10), sw: rnd(20, 50), vr: 0, r: 0, c: "#ffffff", max: 30 });
        break;
      case "skylantern":
        Object.assign(base, { s: rnd(9, 16) * depth, vy: -rnd(18, 34) * depth, sw: rnd(10, 25), vr: 0, r: 0, max: 40 });
        break;
      case "balloon":
        Object.assign(base, { s: rnd(14, 24) * depth, vy: -rnd(30, 60) * depth, sw: rnd(15, 35), vr: 0, r: 0, max: 40 });
        break;
      case "coin":
        Object.assign(base, { s: rnd(6, 10) * depth, vy: rnd(40, 75) * depth, sw: rnd(15, 40), vr: rnd(-3, 3), c: "#f4c430" });
        break;
      case "crescent":
        Object.assign(base, { s: rnd(8, 14) * depth, vy: -rnd(12, 25), sw: rnd(10, 25), vr: rnd(-0.3, 0.3), c: "#f5c542", max: 24 });
        break;
      case "taegeuk":
        Object.assign(base, { s: rnd(8, 13) * depth, vy: rnd(35, 60) * depth, sw: rnd(20, 50), vr: rnd(-2, 2) });
        break;
    }
    return Object.assign(base, o);
  }

  private ambient(anywhere = false) {
    if (!this.bag.length) return;
    const k = pick(this.bag);
    const dir = k === "letter" || k === "skylantern" || k === "balloon" || k === "crescent" ? "rise" : this.t.dir;
    let x = rnd(-20, this.w + 20);
    let y = dir === "rise" ? this.h + 30 : -30;
    if (k === "plane") {
      x = -40;
      y = rnd(this.h * 0.15, this.h * 0.75);
    } else if (dir === "float") y = k === "confetti" ? -20 : this.h + 30;
    if (k === "spark" || k === "star") y = rnd(0, this.h);
    if (anywhere && k !== "plane") y = rnd(0, this.h);
    this.ps.push(this.make(k, x, y));
  }

  /* ------------------------------------------------------------ bosganda portlash */
  burst(x: number, y: number) {
    const vivid = this.vivid();
    const c1 = pick(vivid);
    const c2 = pick(vivid);
    // 1) zarb to'lqini — ikki halqa
    this.rings.push({ x, y, life: 0, max: 0.55, c: c1, r: 74 });
    this.rings.push({ x, y, life: -0.08, max: 0.6, c: c2, r: 46 });
    // 2) yorqin uchqunlar (harakat izi bilan) — portlash
    const n = Math.round(26 + this.intensity * 6);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + rnd(-0.12, 0.12);
      const sp = rnd(330, 640);
      this.streaks.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0, max: rnd(0.45, 0.8), c: i % 3 ? c1 : c2, w: rnd(2, 3.2) });
    }
    // 3) bayram shakllari (qor parchasi, gulbarg, yurak...) — kattaroq, tortishish bilan
    const kinds: Kind[] = this.t.burst.length && this.t.burst[0] !== "spark" ? this.t.burst : this.bag.length ? Array.from(new Set(this.bag)) : ["star"];
    const m = Math.round(12 + this.intensity * 3);
    for (let i = 0; i < m; i++) {
      const k = pick(kinds);
      const a = rnd(0, TAU);
      const sp = rnd(160, 380);
      const p = this.make(k, x, y, { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 120, g: 420, drag: 1.8, max: rnd(1.3, 2), sw: rnd(4, 12) });
      p.s *= 1.6;
      if (LIGHT && (k === "flake" || k === "star")) p.c = pick(vivid);
      this.ps.push(p);
    }
    // 4) miltillovchi oltin chang — sekin tushadi
    for (let i = 0; i < 16; i++) {
      const a = rnd(0, TAU);
      const sp = rnd(40, 200);
      this.ps.push(this.make("star", x, y, { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40, g: 90, drag: 2.2, max: rnd(1, 1.7), s: rnd(2.6, 4.2), c: i % 2 ? c1 : LIGHT ? "#f59e0b" : "#fff3c4" }));
    }
  }

  /** yorug' fonda ham ko'rinadigan to'yingan ranglar */
  private vivid(): string[] {
    const lum = (h: string) => {
      const v = h.replace("#", "");
      const [r, g, b] = [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16) / 255);
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const cs = this.t.colors.filter((c) => /^#[0-9a-f]{6}$/i.test(c) && (LIGHT ? lum(c) < 0.72 : lum(c) > 0.25));
    return cs.length ? cs : LIGHT ? ["#e63946", "#1d4ed8", "#f59e0b"] : ["#ffd166", "#4cc9f0", "#ff4d6d"];
  }

  /** sichqoncha izi */
  trail(x: number, y: number) {
    if (this.ps.length > this.cap() + 80) return;
    this.ps.push(this.make(Math.random() < 0.3 ? "star" : "spark", x + rnd(-4, 4), y + rnd(-4, 4), { vx: rnd(-30, 30), vy: rnd(-10, 50), g: 40, drag: 1.5, max: rnd(0.5, 0.9), s: rnd(1.4, 3.2) }));
  }

  /* ------------------------------------------------------------ salyut */
  private rocket() {
    const x = rnd(this.w * 0.12, this.w * 0.88);
    const ty = rnd(this.h * 0.12, this.h * 0.42);
    this.ps.push(this.make("spark", x, this.h + 10, { rocket: true, ty, vx: rnd(-25, 25), vy: -rnd(this.h * 0.9, this.h * 1.15), g: 220, s: 2.6, max: 4, c: LIGHT ? "#f59e0b" : "#fff6d5", trail: true }));
  }

  private explode(x: number, y: number, n: number) {
    const palette = this.t.colors.filter((c) => c.toLowerCase() !== "#1a1a1a" && !(LIGHT && c.toLowerCase() === "#ffffff"));
    const c1 = pick(palette);
    const c2 = pick(palette);
    const ring = Math.random() < 0.3;
    const sp0 = rnd(170, 290);
    for (let i = 0; i < n; i++) {
      const ang = ring ? (i / n) * TAU : rnd(0, TAU);
      const sp = ring ? sp0 : rnd(40, sp0);
      this.ps.push(this.make("spark", x, y, { vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, g: 90, drag: 1.25, max: rnd(1.1, 1.9), s: rnd(1.6, 2.8), c: i % 3 === 0 ? c2 : c1, trail: true }));
    }
    // markazdagi chaqnash
    for (let i = 0; i < 10; i++) this.ps.push(this.make("star", x, y, { vx: rnd(-60, 60), vy: rnd(-60, 60), g: 50, drag: 2, max: rnd(0.5, 0.9), s: rnd(3, 5), c: LIGHT ? c1 : "#ffffff" }));
  }

  /* ------------------------------------------------------------ fizika */
  private step(dt: number) {
    if (this.opts.particles) {
      this.acc += dt * this.t.rate * this.scale * (0.5 + this.intensity * 0.35);
      const cap = this.cap();
      while (this.acc >= 1) {
        this.acc -= 1;
        if (this.ps.length < cap) this.ambient();
      }
    }
    if (this.opts.fireworks && this.t.fireworks && !document.querySelector(".fs2")) {
      this.nextRocket -= dt;
      if (this.nextRocket <= 0) {
        this.rocket();
        if (Math.random() < 0.35) window.setTimeout(() => this.running && this.rocket(), 260);
        this.nextRocket = rnd(3.2, 6.5) / (0.6 + this.intensity * 0.25);
      }
    }
    const out: P[] = [];
    for (const p of this.ps) {
      p.life += dt;
      p.ph += dt * (p.k === "confetti" ? 6 : 1.6);
      if (p.trail) {
        p.px = p.x;
        p.py = p.y;
      }
      if (p.drag) {
        const f = Math.exp(-p.drag * dt);
        p.vx *= f;
        p.vy *= f;
      }
      p.vy += p.g * dt;
      const sway = p.g ? 0 : Math.cos(p.ph) * p.sw * dt;
      p.x += p.vx * dt + sway;
      p.y += p.vy * dt;
      p.r += p.vr * dt;
      if (p.rocket && (p.vy >= -30 || p.y <= (p.ty ?? 0))) {
        this.explode(p.x, p.y, Math.round(60 + this.intensity * 20));
        continue;
      }
      const fade = p.max < 99 ? 1 - p.life / p.max : 1;
      p.a = Math.max(0, Math.min(1, fade * (p.k === "star" || p.k === "spark" ? 0.55 + 0.45 * Math.sin(p.ph * 3) : 1)));
      const inside = p.y < this.h + 60 && p.y > -80 && p.x > -80 && p.x < this.w + 80;
      if (p.life < p.max && (inside || p.life < 0.3)) out.push(p);
    }
    this.ps = out;
    for (const r of this.rings) r.life += dt;
    this.rings = this.rings.filter((r) => r.life < r.max);
    for (const st of this.streaks) {
      st.life += dt;
      const f = Math.exp(-5.2 * dt);
      st.vx *= f;
      st.vy = st.vy * f + 260 * dt;
      st.x += st.vx * dt;
      st.y += st.vy * dt;
    }
    this.streaks = this.streaks.filter((st) => st.life < st.max);
  }

  /* ------------------------------------------------------------ chizish */
  private draw() {
    const c = this.ctx;
    c.clearRect(0, 0, this.w, this.h);
    LIGHT = document.documentElement.dataset.theme !== "dark";
    for (const p of this.ps) {
      if (p.a <= 0.01) continue;
      c.save();
      c.globalAlpha = p.a;
      if ((p.k === "spark" || p.k === "star") && !LIGHT) c.globalCompositeOperation = "lighter";
      if (p.trail && p.px !== undefined) {
        c.strokeStyle = p.c;
        c.lineWidth = p.s * 0.8;
        c.lineCap = "round";
        c.beginPath();
        c.moveTo(p.px, p.py!);
        c.lineTo(p.x, p.y);
        c.stroke();
      }
      c.translate(p.x, p.y);
      DRAW[p.k](c, p);
      c.restore();
    }
    this.drawClick(c);
  }

  private drawClick(c: CanvasRenderingContext2D) {
    if (!this.rings.length && !this.streaks.length) return;
    c.save();
    c.globalCompositeOperation = LIGHT ? "source-over" : "lighter";
    c.lineCap = "round";
    for (const r of this.rings) {
      if (r.life < 0) continue;
      const t = r.life / r.max;
      const e = 1 - Math.pow(1 - t, 3);
      c.globalAlpha = (1 - t) * 0.9;
      c.strokeStyle = r.c;
      c.lineWidth = 4 * (1 - t) + 0.6;
      c.shadowColor = r.c;
      c.shadowBlur = 12;
      c.beginPath();
      c.arc(r.x, r.y, 6 + r.r * e, 0, TAU);
      c.stroke();
    }
    for (const st of this.streaks) {
      const t = st.life / st.max;
      const a = t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4;
      const k = 0.045; // iz uzunligi = tezlik × k
      c.globalAlpha = a;
      c.shadowColor = st.c;
      c.shadowBlur = 8;
      c.strokeStyle = st.c;
      c.lineWidth = st.w;
      c.beginPath();
      c.moveTo(st.x - st.vx * k, st.y - st.vy * k);
      c.lineTo(st.x, st.y);
      c.stroke();
      c.shadowBlur = 0;
      c.strokeStyle = LIGHT ? "rgba(255,255,255,0.85)" : "#fff";
      c.lineWidth = st.w * 0.4;
      c.beginPath();
      c.moveTo(st.x - st.vx * k * 0.5, st.y - st.vy * k * 0.5);
      c.lineTo(st.x, st.y);
      c.stroke();
    }
    c.restore();
  }
}

/* ------------------------------------------------------------ shakllar */
type Draw = (c: CanvasRenderingContext2D, p: P) => void;

function glowDot(c: CanvasRenderingContext2D, r: number, color: string) {
  const g = c.createRadialGradient(0, 0, 0, 0, 0, r * 3);
  g.addColorStop(0, LIGHT ? color : "#ffffff");
  g.addColorStop(LIGHT ? 0.4 : 0.25, color);
  g.addColorStop(1, "rgba(255,255,255,0)");
  c.fillStyle = g;
  c.beginPath();
  c.arc(0, 0, r * 3, 0, TAU);
  c.fill();
}

function starPath(c: CanvasRenderingContext2D, r: number, n = 5, inner = 0.45) {
  c.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const rr = i % 2 ? r * inner : r;
    const a = (i / (n * 2)) * TAU - Math.PI / 2;
    c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  c.closePath();
}

function heartPath(c: CanvasRenderingContext2D, s: number) {
  c.beginPath();
  c.moveTo(0, s * 0.35);
  c.bezierCurveTo(-s * 1.1, -s * 0.35, -s * 0.45, -s * 1.05, 0, -s * 0.45);
  c.bezierCurveTo(s * 0.45, -s * 1.05, s * 1.1, -s * 0.35, 0, s * 0.35);
  c.closePath();
}

const DRAW: Record<Kind, Draw> = {
  flake(c, p) {
    c.rotate(p.r);
    if (p.s < 5.5) {
      const g = c.createRadialGradient(0, 0, 0, 0, 0, p.s);
      g.addColorStop(0, LIGHT ? "rgba(140,185,240,0.95)" : "rgba(255,255,255,0.95)");
      g.addColorStop(1, LIGHT ? "rgba(140,185,240,0)" : "rgba(255,255,255,0)");
      c.fillStyle = g;
      c.beginPath();
      c.arc(0, 0, p.s, 0, TAU);
      c.fill();
      return;
    }
    // naqshli qor parchasi
    c.strokeStyle = LIGHT ? "rgba(110,165,235,0.95)" : "rgba(255,255,255,0.95)";
    c.shadowColor = LIGHT ? "rgba(255,255,255,1)" : "rgba(160,215,255,0.9)";
    c.shadowBlur = 6;
    c.lineWidth = Math.max(1, p.s / 7);
    c.lineCap = "round";
    for (let i = 0; i < 6; i++) {
      c.rotate(TAU / 6);
      c.beginPath();
      c.moveTo(0, 0);
      c.lineTo(0, -p.s);
      c.moveTo(0, -p.s * 0.55);
      c.lineTo(-p.s * 0.28, -p.s * 0.8);
      c.moveTo(0, -p.s * 0.55);
      c.lineTo(p.s * 0.28, -p.s * 0.8);
      c.stroke();
    }
  },
  petal(c, p) {
    c.rotate(p.r);
    c.scale(1, 0.55 + 0.45 * Math.abs(Math.sin(p.ph)));
    const g = c.createLinearGradient(0, -p.s, 0, p.s);
    g.addColorStop(0, "#ffffff");
    g.addColorStop(1, p.c);
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(0, -p.s);
    c.bezierCurveTo(p.s * 0.9, -p.s * 0.6, p.s * 0.7, p.s * 0.7, 0, p.s);
    c.bezierCurveTo(-p.s * 0.7, p.s * 0.7, -p.s * 0.9, -p.s * 0.6, 0, -p.s);
    c.fill();
  },
  blossom(c, p) {
    c.rotate(p.r);
    const col = p.c === "#ffffff" ? "#ffd1dc" : p.c;
    for (let i = 0; i < 5; i++) {
      c.rotate(TAU / 5);
      const g = c.createRadialGradient(0, -p.s * 0.55, 0, 0, -p.s * 0.55, p.s * 0.6);
      g.addColorStop(0, "#ffffff");
      g.addColorStop(1, col);
      c.fillStyle = g;
      c.beginPath();
      c.ellipse(0, -p.s * 0.55, p.s * 0.42, p.s * 0.55, 0, 0, TAU);
      c.fill();
    }
    c.fillStyle = "#ffd166";
    c.beginPath();
    c.arc(0, 0, p.s * 0.2, 0, TAU);
    c.fill();
  },
  tulip(c, p) {
    c.rotate(p.r * 0.3);
    const s = p.s;
    c.strokeStyle = "#2d6a4f";
    c.lineWidth = s * 0.12;
    c.beginPath();
    c.moveTo(0, s * 0.2);
    c.quadraticCurveTo(s * 0.15, s * 0.9, 0, s * 1.4);
    c.stroke();
    const g = c.createLinearGradient(0, -s, 0, s * 0.4);
    g.addColorStop(0, "#ffffff");
    g.addColorStop(0.35, p.c);
    g.addColorStop(1, p.c);
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(-s * 0.55, -s * 0.2);
    c.lineTo(-s * 0.55, -s * 0.85);
    c.lineTo(-s * 0.2, -s * 0.45);
    c.lineTo(0, -s);
    c.lineTo(s * 0.2, -s * 0.45);
    c.lineTo(s * 0.55, -s * 0.85);
    c.lineTo(s * 0.55, -s * 0.2);
    c.quadraticCurveTo(s * 0.5, s * 0.35, 0, s * 0.35);
    c.quadraticCurveTo(-s * 0.5, s * 0.35, -s * 0.55, -s * 0.2);
    c.fill();
  },
  heart(c, p) {
    c.rotate(p.r * 0.4);
    const g = c.createRadialGradient(-p.s * 0.3, -p.s * 0.5, 0, 0, 0, p.s * 1.2);
    g.addColorStop(0, "#ffd6e0");
    g.addColorStop(1, p.c);
    c.fillStyle = g;
    c.shadowColor = p.c;
    c.shadowBlur = 8;
    heartPath(c, p.s);
    c.fill();
  },
  mimosa(c, p) {
    c.shadowColor = "#ffd60a";
    c.shadowBlur = 10;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + p.r;
      c.fillStyle = i % 2 ? "#ffe066" : "#ffd60a";
      c.beginPath();
      c.arc(Math.cos(a) * p.s * 0.6, Math.sin(a) * p.s * 0.6, p.s * 0.42, 0, TAU);
      c.fill();
    }
    c.fillStyle = "#fff3b0";
    c.beginPath();
    c.arc(0, 0, p.s * 0.45, 0, TAU);
    c.fill();
  },
  confetti(c, p) {
    c.rotate(p.r);
    c.scale(1, Math.cos(p.ph));
    c.fillStyle = p.c;
    if (p.ph % 2 > 1) c.fillRect(-p.s / 2, -p.s * 0.3, p.s, p.s * 0.6);
    else {
      c.beginPath();
      c.arc(0, 0, p.s * 0.4, 0, TAU);
      c.fill();
    }
  },
  leaf(c, p) {
    c.rotate(p.r);
    c.scale(1, 0.6 + 0.4 * Math.sin(p.ph));
    c.fillStyle = p.c;
    c.beginPath();
    c.ellipse(0, 0, p.s * 0.45, p.s, 0, 0, TAU);
    c.fill();
    c.strokeStyle = "rgba(255,255,255,0.35)";
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(0, -p.s);
    c.lineTo(0, p.s);
    c.stroke();
  },
  maple(c, p) {
    c.rotate(p.r);
    c.scale(0.25 + 0.75 * Math.abs(Math.cos(p.ph)), 1); // aylanib tushadi
    const s = p.s;
    const g = c.createLinearGradient(-s, -s, s, s);
    g.addColorStop(0, "#f6c453");
    g.addColorStop(0.55, p.c);
    g.addColorStop(1, "#8a3b12");
    c.fillStyle = g;
    mapleLeaf(c, s);
    c.fill();
    c.strokeStyle = "rgba(110,45,10,0.45)";
    c.lineWidth = Math.max(0.6, s * 0.05);
    mapleVeins(c, s);
    c.stroke();
  },
  spark(c, p) {
    glowDot(c, p.s, p.c);
  },
  star(c, p) {
    c.rotate(p.r);
    c.shadowColor = p.c;
    c.shadowBlur = p.s * 3;
    c.fillStyle = p.c;
    starPath(c, p.s, 5, 0.42);
    c.fill();
    c.fillStyle = "#ffffff";
    starPath(c, p.s * 0.45, 5, 0.42);
    c.fill();
  },
  letter(c, p) {
    c.rotate(p.r * 0.3);
    c.font = `800 ${p.s}px 'Noto Sans KR', 'Plus Jakarta Sans', system-ui, sans-serif`;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.shadowColor = p.c;
    c.shadowBlur = 14;
    c.fillStyle = p.c;
    c.fillText(p.ch || "가", 0, 0);
  },
  plane(c, p) {
    const tilt = Math.sin(p.ph) * 0.25;
    c.rotate(tilt);
    const s = p.s;
    c.fillStyle = "#ffffff";
    c.strokeStyle = "rgba(15,61,140,0.45)";
    c.lineWidth = 1.2;
    c.shadowColor = "rgba(15,61,140,0.35)";
    c.shadowBlur = 8;
    c.beginPath();
    c.moveTo(s, 0);
    c.lineTo(-s, -s * 0.55);
    c.lineTo(-s * 0.45, 0);
    c.lineTo(-s, s * 0.55);
    c.closePath();
    c.fill();
    c.stroke();
    c.beginPath();
    c.moveTo(s, 0);
    c.lineTo(-s * 0.45, 0);
    c.lineTo(-s * 0.7, s * 0.25);
    c.stroke();
  },
  skylantern(c, p) {
    const s = p.s;
    const glow = c.createRadialGradient(0, s * 0.2, 0, 0, s * 0.2, s * 3);
    glow.addColorStop(0, "rgba(255,190,90,0.55)");
    glow.addColorStop(1, "rgba(255,190,90,0)");
    c.fillStyle = glow;
    c.beginPath();
    c.arc(0, s * 0.2, s * 3, 0, TAU);
    c.fill();
    const g = c.createLinearGradient(0, -s, 0, s);
    g.addColorStop(0, "#ffd166");
    g.addColorStop(1, "#f77f00");
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(-s * 0.55, -s);
    c.lineTo(s * 0.55, -s);
    c.lineTo(s * 0.7, s * 0.8);
    c.quadraticCurveTo(0, s * 1.05, -s * 0.7, s * 0.8);
    c.closePath();
    c.fill();
    c.fillStyle = "#fff3b0";
    c.beginPath();
    c.arc(0, s * 0.75, s * 0.18, 0, TAU);
    c.fill();
  },
  balloon(c, p) {
    const s = p.s;
    c.rotate(Math.sin(p.ph) * 0.12);
    c.strokeStyle = "rgba(80,80,80,0.5)";
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(0, s * 1.15);
    c.bezierCurveTo(s * 0.3, s * 1.6, -s * 0.3, s * 2, 0, s * 2.6);
    c.stroke();
    const g = c.createRadialGradient(-s * 0.35, -s * 0.45, s * 0.1, 0, 0, s * 1.2);
    g.addColorStop(0, "#ffffff");
    g.addColorStop(0.25, p.c);
    g.addColorStop(1, p.c);
    c.fillStyle = g;
    c.beginPath();
    c.ellipse(0, 0, s * 0.85, s * 1.1, 0, 0, TAU);
    c.fill();
    c.beginPath();
    c.moveTo(-s * 0.15, s * 1.08);
    c.lineTo(s * 0.15, s * 1.08);
    c.lineTo(0, s * 1.25);
    c.fill();
  },
  coin(c, p) {
    c.rotate(p.r);
    c.scale(Math.cos(p.ph * 2), 1);
    const s = p.s;
    const g = c.createRadialGradient(-s * 0.3, -s * 0.3, 0, 0, 0, s);
    g.addColorStop(0, "#fff3b0");
    g.addColorStop(1, "#d4a017");
    c.fillStyle = g;
    c.beginPath();
    c.arc(0, 0, s, 0, TAU);
    c.fill();
    c.fillStyle = "rgba(120,80,0,0.75)";
    c.fillRect(-s * 0.28, -s * 0.28, s * 0.56, s * 0.56);
  },
  crescent(c, p) {
    c.rotate(p.r - 0.5);
    c.shadowColor = "#f5c542";
    c.shadowBlur = 14;
    c.fillStyle = "#f5c542";
    c.beginPath();
    c.arc(0, 0, p.s, 0, TAU);
    c.arc(p.s * 0.42, -p.s * 0.12, p.s * 0.86, 0, TAU, true);
    c.fill("evenodd");
  },
  taegeuk(c, p) {
    c.rotate(p.r);
    const s = p.s;
    c.fillStyle = "#cd2e3a";
    c.beginPath();
    c.arc(0, 0, s, Math.PI, 0);
    c.arc(s / 2, 0, s / 2, 0, Math.PI, true);
    c.arc(-s / 2, 0, s / 2, 0, Math.PI);
    c.fill();
    c.fillStyle = "#0047a0";
    c.beginPath();
    c.arc(0, 0, s, 0, Math.PI);
    c.arc(-s / 2, 0, s / 2, Math.PI, 0, true);
    c.arc(s / 2, 0, s / 2, Math.PI, 0);
    c.fill();
  },
};
