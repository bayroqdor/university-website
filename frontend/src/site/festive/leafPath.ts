// Barg shakllari (canvas yo'llari): chinor bargi — besh bo'lakli, tishchali; tol bargi — cho'zinchoq, uchli.
const MAPLE_R = [
  [0, -1], [0.06, -0.8], [0.13, -0.83], [0.17, -0.58], [0.3, -0.62], [0.36, -0.72], [0.47, -0.64], [0.62, -0.79], [0.6, -0.52],
  [0.76, -0.5], [0.98, -0.4], [0.82, -0.28], [0.86, -0.14], [0.62, -0.08], [0.66, 0.1], [0.5, 0.12], [0.56, 0.32], [0.32, 0.22],
  [0.2, 0.3], [0.05, 0.38],
];
const MAPLE = [...MAPLE_R, ...MAPLE_R.slice(1).reverse().map(([x, y]) => [-x, y])];

export function mapleLeaf(c: CanvasRenderingContext2D, s: number) {
  c.beginPath();
  MAPLE.forEach(([x, y], i) => (i ? c.lineTo(x * s, y * s) : c.moveTo(x * s, y * s)));
  c.closePath();
}

export function mapleVeins(c: CanvasRenderingContext2D, s: number) {
  c.beginPath();
  c.moveTo(0, s * 0.75);
  c.lineTo(0, -s * 0.9);
  for (const [x, y] of [[0.88, -0.38], [0.58, -0.72], [0.55, 0.25]]) {
    c.moveTo(0, s * 0.3);
    c.lineTo(x * s * 0.92, y * s * 0.92);
    c.moveTo(0, s * 0.3);
    c.lineTo(-x * s * 0.92, y * s * 0.92);
  }
}

export function elmLeaf(c: CanvasRenderingContext2D, s: number) {
  c.beginPath();
  c.moveTo(0, -s);
  c.bezierCurveTo(s * 0.55, -s * 0.62, s * 0.6, s * 0.35, 0, s * 0.85);
  c.bezierCurveTo(-s * 0.6, s * 0.35, -s * 0.55, -s * 0.62, 0, -s);
  c.closePath();
}
