// Xavfsiz matematik ifoda tahlilchisi (eval ishlatilmaydi): y = f(x; a, b, …)
// Qo'llab-quvvatlanadi: + − * / ^ (daraja), unar minus, qavslar, o'zgaruvchilar va funksiyalar.

type Tok = { t: "num"; v: number } | { t: "id"; v: string } | { t: "op"; v: string } | { t: "lp" } | { t: "rp" } | { t: "comma" };
type Node =
  | { k: "num"; v: number }
  | { k: "var"; name: string }
  | { k: "un"; op: string; a: Node }
  | { k: "bin"; op: string; a: Node; b: Node }
  | { k: "call"; fn: string; args: Node[] };

const FUNCS: Record<string, (...a: number[]) => number> = {
  sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin, acos: Math.acos, atan: Math.atan, atan2: Math.atan2,
  sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh, exp: Math.exp, ln: Math.log, log: Math.log10, log10: Math.log10, log2: Math.log2,
  sqrt: Math.sqrt, cbrt: Math.cbrt, abs: Math.abs, floor: Math.floor, ceil: Math.ceil, round: Math.round, sign: Math.sign,
  min: Math.min, max: Math.max, pow: Math.pow,
};
const CONSTS: Record<string, number> = { pi: Math.PI, e: Math.E };

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  const s = src.replace(/[×·]/g, "*").replace(/[−–]/g, "-").replace(/÷/g, "/");
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (/[0-9.]/.test(c)) {
      const m = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i.exec(s.slice(i));
      if (!m) throw new Error(`son: ${s.slice(i, i + 6)}`);
      out.push({ t: "num", v: parseFloat(m[0]) });
      i += m[0].length;
      continue;
    }
    if (/[a-zA-Z_α-ωΑ-Ω]/.test(c)) {
      const m = /^[a-zA-Z_α-ωΑ-Ω][a-zA-Z0-9_α-ωΑ-Ω]*/.exec(s.slice(i))!;
      out.push({ t: "id", v: m[0] });
      i += m[0].length;
      continue;
    }
    if ("+-*/^".includes(c)) {
      if (c === "*" && s[i + 1] === "*") {
        out.push({ t: "op", v: "^" });
        i += 2;
        continue;
      }
      out.push({ t: "op", v: c });
      i++;
      continue;
    }
    if (c === "(") out.push({ t: "lp" });
    else if (c === ")") out.push({ t: "rp" });
    else if (c === ",") out.push({ t: "comma" });
    else throw new Error(`belgi: ${c}`);
    i++;
  }
  return out;
}

function parse(tokens: Tok[]): Node {
  let p = 0;
  const peek = () => tokens[p];
  const eat = () => tokens[p++];
  // ifoda := had (('+'|'-') had)*
  function expr(): Node {
    let n = term();
    while (peek()?.t === "op" && ((peek() as { v: string }).v === "+" || (peek() as { v: string }).v === "-")) {
      const op = (eat() as { v: string }).v;
      n = { k: "bin", op, a: n, b: term() };
    }
    return n;
  }
  // had := unar (('*'|'/'|yashirin ko'paytirish) unar)*
  function term(): Node {
    let n = unary();
    for (;;) {
      const t = peek();
      if (t?.t === "op" && (t.v === "*" || t.v === "/")) {
        eat();
        n = { k: "bin", op: t.v, a: n, b: unary() };
      } else if (t && (t.t === "num" || t.t === "id" || t.t === "lp")) {
        n = { k: "bin", op: "*", a: n, b: unary() }; // 2x, 3(x+1)
      } else return n;
    }
  }
  function unary(): Node {
    const t = peek();
    if (t?.t === "op" && (t.v === "-" || t.v === "+")) {
      eat();
      const a = unary();
      return t.v === "-" ? { k: "un", op: "-", a } : a;
    }
    return power();
  }
  // daraja o'ngdan assotsiativ: 2^3^2 = 2^9
  function power(): Node {
    const base = primary();
    const t = peek();
    if (t?.t === "op" && t.v === "^") {
      eat();
      return { k: "bin", op: "^", a: base, b: unary() };
    }
    return base;
  }
  function primary(): Node {
    const t = eat();
    if (!t) throw new Error("ifoda tugallanmagan");
    if (t.t === "num") return { k: "num", v: t.v };
    if (t.t === "lp") {
      const n = expr();
      if (eat()?.t !== "rp") throw new Error("')' kutilgan");
      return n;
    }
    if (t.t === "id") {
      if (peek()?.t === "lp") {
        eat();
        const args: Node[] = [];
        if (peek()?.t !== "rp") {
          args.push(expr());
          while (peek()?.t === "comma") {
            eat();
            args.push(expr());
          }
        }
        if (eat()?.t !== "rp") throw new Error("')' kutilgan");
        if (!FUNCS[t.v.toLowerCase()]) throw new Error(`noma’lum funksiya: ${t.v}`);
        return { k: "call", fn: t.v.toLowerCase(), args };
      }
      return { k: "var", name: t.v };
    }
    throw new Error("kutilmagan belgi");
  }
  const n = expr();
  if (p < tokens.length) throw new Error("ortiqcha belgilar");
  return n;
}

function evalNode(n: Node, env: Record<string, number>): number {
  switch (n.k) {
    case "num":
      return n.v;
    case "var":
      if (n.name in env) return env[n.name];
      if (n.name.toLowerCase() in CONSTS) return CONSTS[n.name.toLowerCase()];
      throw new Error(`noma’lum o‘zgaruvchi: ${n.name}`);
    case "un":
      return -evalNode(n.a, env);
    case "bin": {
      const a = evalNode(n.a, env);
      const b = evalNode(n.b, env);
      return n.op === "+" ? a + b : n.op === "-" ? a - b : n.op === "*" ? a * b : n.op === "/" ? a / b : Math.pow(a, b);
    }
    case "call":
      return FUNCS[n.fn](...n.args.map((x) => evalNode(x, env)));
  }
}

export interface Compiled {
  fn: (env: Record<string, number>) => number;
  error: string | null;
  vars: string[];
}

function collectVars(n: Node, out = new Set<string>()): string[] {
  if (n.k === "var" && !(n.name.toLowerCase() in CONSTS)) out.add(n.name);
  if (n.k === "un") collectVars(n.a, out);
  if (n.k === "bin") {
    collectVars(n.a, out);
    collectVars(n.b, out);
  }
  if (n.k === "call") n.args.forEach((a) => collectVars(a, out));
  return [...out];
}

/** Ifodadagi noma'lum o'zgaruvchilar (x va parametrlardan tashqari) */
export function unknownVars(src: string, allowed: string[]): string[] {
  const c = compile(src);
  return c.vars.filter((v) => v !== "x" && !allowed.includes(v));
}

const cache = new Map<string, Compiled>();

export function compile(src: string): Compiled {
  const hit = cache.get(src);
  if (hit) return hit;
  let res: Compiled;
  try {
    const ast = parse(tokenize(src));
    res = { fn: (env) => evalNode(ast, env), error: null, vars: collectVars(ast) };
  } catch (e) {
    res = { fn: () => NaN, error: (e as Error).message, vars: [] };
  }
  if (cache.size > 200) cache.clear();
  cache.set(src, res);
  return res;
}

/** Funksiya grafigi uchun nuqtalar */
export function sample(src: string, params: Record<string, number>, x0: number, x1: number, n: number): [number, number][] {
  const { fn } = compile(src);
  const out: [number, number][] = [];
  const N = Math.max(2, Math.min(n, 4000));
  for (let i = 0; i < N; i++) {
    const x = x0 + ((x1 - x0) * i) / (N - 1);
    let y: number;
    try {
      y = fn({ ...params, x });
    } catch {
      y = NaN;
    }
    out.push([x, Number.isFinite(y) ? y : NaN]);
  }
  return out;
}

export type Transform = "none" | "derivative" | "integral" | "normalize" | "cumsum";

/** O'qlar bo'yicha amallar: sonli hosila (markaziy ayirma), integral (trapetsiya), normallash, yig'indi */
export function transform(pts: [number, number][], t: Transform): [number, number][] {
  if (t === "none" || pts.length < 2) return pts;
  if (t === "derivative") {
    return pts.map((p, i) => {
      const a = pts[Math.max(0, i - 1)];
      const b = pts[Math.min(pts.length - 1, i + 1)];
      const dx = b[0] - a[0];
      return [p[0], dx ? (b[1] - a[1]) / dx : NaN];
    });
  }
  if (t === "integral") {
    let acc = 0;
    return pts.map((p, i) => {
      if (i > 0) {
        const q = pts[i - 1];
        if (Number.isFinite(p[1]) && Number.isFinite(q[1])) acc += ((p[1] + q[1]) / 2) * (p[0] - q[0]);
      }
      return [p[0], acc];
    });
  }
  if (t === "cumsum") {
    let acc = 0;
    return pts.map((p) => {
      acc += Number.isFinite(p[1]) ? p[1] : 0;
      return [p[0], acc];
    });
  }
  const ys = pts.map((p) => p[1]).filter(Number.isFinite);
  const lo = Math.min(...ys);
  const hi = Math.max(...ys);
  return pts.map((p) => [p[0], hi > lo ? (p[1] - lo) / (hi - lo) : 0]);
}
