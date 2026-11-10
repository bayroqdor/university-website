// Maxsus imkoniyatlar: «Matn o'lchami» (100–200%) uchun build vaqtidagi PostCSS o'zgartirish.
// Saytdagi shrift o'lchamlari px da yozilgan (rem deyarli yo'q), shuning uchun har bir font-size / font / px line-height
// qiymati calc(... * var(--a11y-fz, 1)) ga o'raladi. O'zgaruvchi faqat panel orqali o'rnatiladi (html[data-a11y-size]),
// standart holatda qiymat 1 — ko'rinish o'zgarmaydi. Katta sarlavhalar (≥ 30px) sekinroq kattalashadi (--a11y-fz-lg),
// aks holda telefonda 200% da uzun so'zlar ekranga sig'maydi.
// node_modules ichidagi CSS (KaTeX, shriftlar va h.k.) o'zgartirilmaydi.
import type { Plugin, Declaration } from "postcss";

const PX = /(-?\d*\.?\d+)px/g;

// ≥ 30px — katta sarlavha (--a11y-fz-lg); eng kichik qiymati ham ≥ 30px bo'lsa (clamp(40px, …, 88px)) — «display» sarlavha
// (--a11y-fz-xl: keng disleksiya shriftida qo'shimcha kichraytiriladi). clamp(24px, …, 30px) kabi telefonda kichik
// bo'ladigan sarlavhalar --a11y-fz-xl ni olmaydi — aks holda ular oddiy matndan ham kichrayib qolardi.
function factor(value: string): string {
  let max = 0;
  let min = Infinity;
  for (const m of value.matchAll(PX)) {
    const v = Math.abs(parseFloat(m[1]));
    max = Math.max(max, v);
    min = Math.min(min, v);
  }
  if (max < 30) return "var(--a11y-fz, 1)";
  return min >= 30 ? "var(--a11y-fz-xl, var(--a11y-fz-lg, 1))" : "var(--a11y-fz-lg, 1)";
}

function scaled(value: string): string {
  return `calc(${value} * ${factor(value)})`;
}

/** font shorthand: «600 14px/1.3 Onest» → o'lcham qismi o'raladi */
function scaleShorthand(value: string): string | null {
  const fn = /(clamp|min|max|calc)\([^()]*(\([^()]*\)[^()]*)*\)/.exec(value);
  if (fn && fn[0].includes("px")) {
    const after = value.slice(fn.index + fn[0].length);
    if (/^\s*(\/|\s|$)/.test(after)) return value.slice(0, fn.index) + scaled(fn[0]) + after;
  }
  return value.replace(/(^|\s)(\d*\.?\d+px)(?=\s*\/|\s+["'a-zA-Z])/, (_m, pre: string, size: string) => `${pre}${scaled(size)}`);
}

export default function a11yTextScale(): Plugin {
  return {
    postcssPlugin: "uni-a11y-text-scale",
    Declaration(decl: Declaration) {
      const file = decl.source?.input.file || "";
      if (file.includes("node_modules") || decl.value.includes("--a11y-fz") || !decl.value.includes("px")) return;
      if (decl.prop === "font-size" || (decl.prop === "line-height" && /^\s*\d*\.?\d+px\s*$/.test(decl.value))) {
        decl.value = scaled(decl.value.trim());
      } else if (decl.prop === "font") {
        const v = scaleShorthand(decl.value);
        if (v && v !== decl.value) decl.value = v;
      }
    },
  };
}
