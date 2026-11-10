// Haqiqiy salyut (canvas): raketa uchib chiqadi (uchqunli iz va tutun bilan), cho'qqida portlaydi.
// Portlash turlari: pion (shar), xrizantema (uzun izli), tol (oltin, osilib tushadi), halqa, krossett (bo'linadi),
// strob (miltillaydi), ikki rangli yadro. Fizika: havo qarshiligi, tortishish, issiqlikdan rangga o'tish, oxirida chirsillash.
// Qorong'i fon uchun: yorug'lik qo'shiladi ("lighter"), portlash osmonni bir zum yoritadi.

type RGB = [number, number, number];
type ShellKind = "peony" | "chrysanthemum" | "willow" | "ring" | "crossette" | "strobe" | "palm";

interface Star {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  rgb: RGB;
  size: number;
  drag: number;
  g: number;
  trail: number; // iz uzunligi (nuqtalar)
  hist: number[]; // [x0,y0,x1,y1,...]
  strobe?: boolean;
  glitter?: boolean; // orqasidan oltin chang to'kiladi
  split?: boolean; // krossett: yarim yo'lda 4 ga bo'linadi
  crackle?: boolean;
  hot: number; // boshida oq-issiq bo'lish davomiyligi (s)
}

interface Rocket {
  x: number;
  y: number;
  vx: number;
  vy: number;
  ty: number;
  hist: number[];
  shell: ShellKind;
  colors: RGB[];
  scale: number;
}

interface Puff {
  x: number;
  y: number;
  r: number;
  vr: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  a: number;
  tint?: RGB;
}

interface Flash {
  x: number;
  y: number;
  life: number;
  max: number;
  r: number;
  rgb: RGB;
}

const TAU = Math.PI * 2;
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(a: T[]): T => a[(Math.random() * a.length) | 0];

export function hexRgb(h: string): RGB {
  const s = h.replace("#", "");
  const v = s.length === 3 ? s.split("").map((c) => parseInt(c + c, 16)) : [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16));
  return [v[0], v[1], v[2]];
}

const GOLD: RGB = [255, 196, 92];
const WHITE: RGB = [255, 250, 235];

export interface FireworksOptions {
  palette: string[]; // bayram ranglari
  auto?: boolean; // o'zi otib turadi
  intensity?: number; // 1..3
  smoke?: boolean;
  shells?: ShellKind[];
  groundY?: number; // 0..1 — raketa shu balandlikdan uchadi (sahna pastki qismi)
  /** portlash mumkin bo'lgan osmon qismi (kanvas pikselida): matn ustida portlamasin */
  sky?: () => { x0: number; x1: number; y0: number; y1: number } | null;
}

export class Fireworks {
  private ctx: CanvasRenderingContext2D;
  private stars: Star[] = [];
  private rockets: Rocket[] = [];
  private puffs: Puff[] = [];
  private flashes: Flash[] = [];
  private sky = 0; // osmon yorug'ligi (0..1)
  private skyRgb: RGB = WHITE;
  private w = 0;
  private h = 0;
  private dpr = 1;
  private raf = 0;
  private last = 0;
  private running = false;
  private next = 0.6;
  private ro?: ResizeObserver;
  private sprites = new Map<string, HTMLCanvasElement>();
  private palette: RGB[];

  constructor(
    private canvas: HTMLCanvasElement,
    private o: FireworksOptions,
  ) {
    this.ctx = canvas.getContext("2d")!;
    this.palette = o.palette.map(hexRgb);
    this.resize();
    if (typeof ResizeObserver !== "undefined") {
      this.ro = new ResizeObserver(() => this.resize());
      this.ro.observe(canvas);
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
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const loop = (t: number) => {
      if (!this.running) return;
      const dt = Math.min(0.033, (t - this.last) / 1000);
      this.last = t;
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
    this.stars = [];
    this.rockets = [];
    this.ctx.clearRect(0, 0, this.w, this.h);
  }

  /** Raketa otish: x — gorizontal (px), ty — portlash balandligi (px). Berilmasa — tasodifiy. */
  launch(x?: number, ty?: number, shell?: ShellKind) {
    const ground = this.h * (this.o.groundY ?? 1);
    const sky = this.o.sky?.() ?? { x0: this.w * 0.1, x1: this.w * 0.9, y0: this.h * 0.08, y1: this.h * 0.36 };
    const sx = x ?? rnd(sky.x0, sky.x1);
    const target = ty ?? rnd(sky.y0, sky.y1);
    const g = 320;
    const height = Math.max(40, ground - target);
    const vy = -Math.sqrt(2 * g * height) * rnd(0.98, 1.03);
    const x0 = x != null ? sx + rnd(-40, 40) : sx;
    const t = -vy / g;
    const kinds = this.o.shells?.length ? this.o.shells : (["peony", "peony", "chrysanthemum", "willow", "ring", "crossette", "strobe", "palm"] as ShellKind[]);
    const c1 = pick(this.palette);
    let c2 = pick(this.palette);
    if (c2 === c1 && this.palette.length > 1) c2 = this.palette[(this.palette.indexOf(c1) + 1) % this.palette.length];
    // kichik sahnada portlash ham kichikroq
    const scale = Math.max(0.55, Math.min(1.25, this.h / 520));
    this.rockets.push({ x: x0, y: ground + 6, vx: (sx - x0) / t, vy, ty: target, hist: [], shell: shell ?? pick(kinds), colors: [c1, c2], scale });
  }

  /** Bir nechta raketa ketma-ket (bayram avji) */
  salvo(n = 4) {
    for (let i = 0; i < n; i++) window.setTimeout(() => this.running && this.launch(), i * rnd(140, 320));
  }

  /* ------------------------------------------------------------ fizika */
  private step(dt: number) {
    if (this.o.auto) {
      this.next -= dt;
      if (this.next <= 0) {
        const k = this.o.intensity ?? 2;
        if (Math.random() < 0.12) this.salvo(3 + ((Math.random() * 3) | 0));
        else this.launch();
        this.next = rnd(0.9, 2.6) / (0.55 + k * 0.3);
      }
    }
    // raketalar
    const keep: Rocket[] = [];
    for (const r of this.rockets) {
      r.hist.push(r.x, r.y);
      if (r.hist.length > 16) r.hist.splice(0, 2);
      r.vy += 320 * dt;
      r.x += r.vx * dt + Math.sin(r.y * 0.05) * 0.25; // ozgina tebranish
      r.y += r.vy * dt;
      // uchqunli iz
      for (let i = 0; i < 2; i++)
        this.stars.push(this.star(r.x + rnd(-1.5, 1.5), r.y + rnd(0, 4), rnd(-18, 18), rnd(10, 60), rnd(0.25, 0.6), GOLD, rnd(0.8, 1.4), { drag: 2.2, g: 60, trail: 2, hot: 0.05 }));
      if (this.o.smoke !== false && Math.random() < 0.5) this.puffs.push({ x: r.x, y: r.y + 6, r: rnd(5, 8), vr: rnd(10, 18), vx: rnd(-6, 6), vy: rnd(-4, 6), life: 0, max: rnd(1.2, 2.2), a: 0.1 });
      if (r.vy >= -40 || r.y <= r.ty) this.burst(r);
      else keep.push(r);
    }
    this.rockets = keep;

    // yulduzlar
    const out: Star[] = [];
    for (const s of this.stars) {
      s.life += dt;
      if (s.trail > 1) {
        s.hist.push(s.x, s.y);
        if (s.hist.length > s.trail * 2) s.hist.splice(0, 2);
      }
      const f = Math.exp(-s.drag * dt);
      s.vx *= f;
      s.vy = s.vy * f + s.g * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      if (s.glitter && Math.random() < 0.35) this.stars.push(this.star(s.x, s.y, rnd(-8, 8), rnd(0, 20), rnd(0.4, 0.9), GOLD, rnd(0.5, 1), { drag: 3, g: 70, trail: 0, hot: 0, strobe: true }));
      if (s.split && s.life > s.max * 0.45) {
        const a0 = rnd(0, TAU);
        for (let i = 0; i < 4; i++) {
          const a = a0 + (i * TAU) / 4;
          this.stars.push(this.star(s.x, s.y, Math.cos(a) * 90 + s.vx * 0.3, Math.sin(a) * 90 + s.vy * 0.3, rnd(0.6, 0.9), s.rgb, s.size * 0.8, { drag: 1.6, g: 80, trail: 6, hot: 0.05 }));
        }
        this.flashes.push({ x: s.x, y: s.y, life: 0, max: 0.12, r: 14, rgb: WHITE });
        continue;
      }
      if (s.crackle && s.life > s.max * 0.82 && Math.random() < 0.08) {
        for (let i = 0; i < 3; i++) this.stars.push(this.star(s.x + rnd(-10, 10), s.y + rnd(-10, 10), 0, 0, rnd(0.06, 0.14), WHITE, rnd(1, 1.8), { drag: 0, g: 0, trail: 0, hot: 1 }));
      }
      if (s.life < s.max && s.y < this.h + 20) out.push(s);
    }
    this.stars = out.length > 2600 ? out.slice(out.length - 2600) : out;

    for (const p of this.puffs) {
      p.life += dt;
      p.r += p.vr * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    this.puffs = this.puffs.filter((p) => p.life < p.max);
    for (const fl of this.flashes) fl.life += dt;
    this.flashes = this.flashes.filter((fl) => fl.life < fl.max);
    this.sky = Math.max(0, this.sky - dt * 2.2);
  }

  private star(x: number, y: number, vx: number, vy: number, max: number, rgb: RGB, size: number, o: Partial<Star>): Star {
    return { x, y, vx, vy, life: 0, max, rgb, size, drag: 1.4, g: 70, trail: 4, hist: [], hot: 0.15, ...o };
  }

  private burst(r: Rocket) {
    const sc = r.scale;
    const [c1, c2] = r.colors;
    const { x, y } = r;
    // portlash chaqnashi va osmon yorug'ligi
    this.flashes.push({ x, y, life: 0, max: 0.2, r: 90 * sc, rgb: c1 });
    this.sky = Math.min(1, this.sky + 0.55);
    this.skyRgb = c1;
    if (this.o.smoke !== false)
      for (let i = 0; i < 7; i++) this.puffs.push({ x: x + rnd(-50, 50) * sc, y: y + rnd(-50, 50) * sc, r: rnd(50, 90) * sc, vr: rnd(10, 22), vx: rnd(-8, 8), vy: rnd(2, 10), life: 0, max: rnd(2.5, 4), a: 0.045, tint: c1 });

    // sharsimon yo'nalish (proyeksiya chetlarda zichroq — haqiqiy portlash ko'rinishi)
    const sphere = (n: number, speed: number, f: (vx: number, vy: number, i: number) => void) => {
      for (let i = 0; i < n; i++) {
        const z = rnd(-1, 1);
        const t = rnd(0, TAU);
        const k = Math.sqrt(1 - z * z);
        const sp = speed * rnd(0.92, 1.06);
        f(Math.cos(t) * k * sp, Math.sin(t) * k * sp, i);
      }
    };
    const S = 1.4 * sc;
    switch (r.shell) {
      case "peony":
        sphere(160, 300 * S, (vx, vy, i) => this.stars.push(this.star(x, y, vx, vy, rnd(1.5, 2.2), i % 5 === 0 ? c2 : c1, rnd(1.7, 2.5), { drag: 1.9, g: 85, trail: 7, crackle: Math.random() < 0.15 })));
        sphere(28, 120 * S, (vx, vy) => this.stars.push(this.star(x, y, vx, vy, rnd(1, 1.4), c2, rnd(1.4, 2), { drag: 2, g: 80, trail: 3 }))); // yadro
        break;
      case "chrysanthemum":
        sphere(150, 290 * S, (vx, vy) => this.stars.push(this.star(x, y, vx, vy, rnd(1.8, 2.5), c1, rnd(1.5, 2.2), { drag: 1.7, g: 75, trail: 14, glitter: Math.random() < 0.35 })));
        break;
      case "willow":
        sphere(130, 230 * S, (vx, vy) => this.stars.push(this.star(x, y, vx, vy, rnd(2.8, 3.8), GOLD, rnd(1.3, 2), { drag: 2.4, g: 55, trail: 22, glitter: Math.random() < 0.5, hot: 0.25 })));
        break;
      case "palm":
        for (let i = 0; i < 9; i++) {
          const a = (i / 9) * TAU + rnd(-0.1, 0.1);
          for (let j = 0; j < 6; j++) {
            const sp = (240 + j * 12) * S;
            this.stars.push(this.star(x, y, Math.cos(a) * sp, Math.sin(a) * sp - 40, rnd(2, 2.6), j % 2 ? GOLD : c1, rnd(1.8, 2.5), { drag: 1.8, g: 90, trail: 16, glitter: true }));
          }
        }
        break;
      case "ring": {
        const tilt = rnd(0.35, 1);
        const rot = rnd(0, TAU);
        const n = 70;
        const sp = 260 * S;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * TAU;
          const ex = Math.cos(a) * sp;
          const ey = Math.sin(a) * sp * tilt;
          this.stars.push(this.star(x, y, ex * Math.cos(rot) - ey * Math.sin(rot), ex * Math.sin(rot) + ey * Math.cos(rot), rnd(1.5, 1.9), c1, 2, { drag: 1.8, g: 70, trail: 6 }));
        }
        sphere(24, 90 * S, (vx, vy) => this.stars.push(this.star(x, y, vx, vy, 1.2, c2, 1.8, { drag: 2, g: 70, trail: 3 })));
        break;
      }
      case "crossette":
        sphere(26, 230 * S, (vx, vy) => this.stars.push(this.star(x, y, vx, vy, rnd(1.4, 1.7), c1, 2.2, { drag: 1.5, g: 80, trail: 8, split: true })));
        break;
      case "strobe":
        sphere(110, 260 * S, (vx, vy) => this.stars.push(this.star(x, y, vx, vy, rnd(2.2, 3), WHITE, rnd(1.4, 2), { drag: 2, g: 60, trail: 2, strobe: true, hot: 0 })));
        sphere(30, 140 * S, (vx, vy) => this.stars.push(this.star(x, y, vx, vy, 1.4, c1, 2, { drag: 2, g: 70, trail: 5 })));
        break;
    }
  }

  /* ------------------------------------------------------------ chizish */
  private sprite(rgb: RGB): HTMLCanvasElement {
    const key = rgb.join(",");
    let c = this.sprites.get(key);
    if (c) return c;
    c = document.createElement("canvas");
    c.width = c.height = 64;
    const x = c.getContext("2d")!;
    const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.12, `rgba(${key},0.95)`);
    g.addColorStop(0.35, `rgba(${key},0.35)`);
    g.addColorStop(1, `rgba(${key},0)`);
    x.fillStyle = g;
    x.fillRect(0, 0, 64, 64);
    this.sprites.set(key, c);
    return c;
  }

  private smokeSprite(rgb: RGB): HTMLCanvasElement {
    const key = "s" + rgb.join(",");
    let c = this.sprites.get(key);
    if (c) return c;
    c = document.createElement("canvas");
    c.width = c.height = 64;
    const x = c.getContext("2d")!;
    const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, `rgba(${rgb.join(",")},1)`);
    g.addColorStop(0.5, `rgba(${rgb.join(",")},0.45)`);
    g.addColorStop(1, `rgba(${rgb.join(",")},0)`);
    x.fillStyle = g;
    x.fillRect(0, 0, 64, 64);
    this.sprites.set(key, c);
    return c;
  }

  private draw() {
    const c = this.ctx;
    c.clearRect(0, 0, this.w, this.h);
    // osmonning yorishishi
    if (this.sky > 0.01) {
      c.globalCompositeOperation = "lighter";
      c.fillStyle = `rgba(${this.skyRgb.join(",")},${0.035 * this.sky})`;
      c.fillRect(0, 0, this.w, this.h);
    }
    // tutun: yumshoq chetli bulutchalar (portlash rangida biroz yoritilgan)
    c.globalCompositeOperation = "source-over";
    for (const p of this.puffs) {
      const t = p.life / p.max;
      const a = p.a * Math.sin(Math.PI * Math.min(1, t * 1.15));
      if (a <= 0.003) continue;
      const col: RGB = p.tint && t < 0.3 ? (p.tint.map((v) => Math.round(v * 0.5 + 150 * 0.5)) as RGB) : [160, 166, 182];
      c.globalAlpha = a;
      c.drawImage(this.smokeSprite(col), p.x - p.r, p.y - p.r, p.r * 2, p.r * 2);
    }
    c.globalAlpha = 1;
    c.globalCompositeOperation = "lighter";
    // raketalar
    for (const r of this.rockets) {
      c.strokeStyle = "rgba(255,210,140,0.55)";
      c.lineWidth = 1.6;
      c.beginPath();
      for (let i = 0; i < r.hist.length; i += 2) (i ? c.lineTo : c.moveTo).call(c, r.hist[i], r.hist[i + 1]);
      c.lineTo(r.x, r.y);
      c.stroke();
      c.drawImage(this.sprite(GOLD), r.x - 7, r.y - 7, 14, 14);
    }
    // yulduzlar
    for (const s of this.stars) {
      const t = s.life / s.max;
      let a = t < 0.75 ? 1 : 1 - (t - 0.75) / 0.25;
      if (s.strobe) a *= Math.random() < 0.45 ? 1 : 0.08;
      else if (t > 0.6) a *= 0.7 + Math.random() * 0.3; // so'nib borayotganda miltillash
      if (a <= 0.02) continue;
      // issiq (oq) boshlanish → rang
      const hotK = s.hot > 0 ? Math.max(0, 1 - s.life / s.hot) : 0;
      const rgb: RGB = hotK > 0 ? [s.rgb[0] + (255 - s.rgb[0]) * hotK, s.rgb[1] + (255 - s.rgb[1]) * hotK, s.rgb[2] + (255 - s.rgb[2]) * hotK].map(Math.round) as RGB : s.rgb;
      if (s.hist.length >= 4) {
        const n = s.hist.length / 2;
        c.lineCap = "round";
        for (let i = 1; i < n; i++) {
          const k = i / n;
          c.strokeStyle = `rgba(${rgb.join(",")},${a * k * 0.55})`;
          c.lineWidth = s.size * (0.4 + k * 0.7);
          c.beginPath();
          c.moveTo(s.hist[(i - 1) * 2], s.hist[(i - 1) * 2 + 1]);
          c.lineTo(s.hist[i * 2], s.hist[i * 2 + 1]);
          c.stroke();
        }
        c.strokeStyle = `rgba(${rgb.join(",")},${a * 0.6})`;
        c.beginPath();
        c.moveTo(s.hist[s.hist.length - 2], s.hist[s.hist.length - 1]);
        c.lineTo(s.x, s.y);
        c.stroke();
      }
      const d = s.size * 5;
      c.globalAlpha = a;
      c.drawImage(this.sprite(rgb), s.x - d / 2, s.y - d / 2, d, d);
      c.globalAlpha = 1;
    }
    // chaqnashlar
    for (const fl of this.flashes) {
      const t = fl.life / fl.max;
      const r = fl.r * (0.6 + t * 0.6);
      const g = c.createRadialGradient(fl.x, fl.y, 0, fl.x, fl.y, r);
      g.addColorStop(0, `rgba(255,255,255,${0.9 * (1 - t)})`);
      g.addColorStop(0.25, `rgba(${fl.rgb.join(",")},${0.45 * (1 - t)})`);
      g.addColorStop(1, `rgba(${fl.rgb.join(",")},0)`);
      c.fillStyle = g;
      c.beginPath();
      c.arc(fl.x, fl.y, r, 0, TAU);
      c.fill();
    }
    c.globalCompositeOperation = "source-over";
  }
}
