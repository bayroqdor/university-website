// Bayram uslublari: ranglar, havoda uchadigan zarrachalar, bosganda portlash, salyut, gulchambar (girlyanda) turi va logotip bezagi
export type Kind =
  | "flake"
  | "petal"
  | "blossom"
  | "tulip"
  | "heart"
  | "mimosa"
  | "confetti"
  | "leaf"
  | "maple"
  | "spark"
  | "star"
  | "letter"
  | "plane"
  | "skylantern"
  | "balloon"
  | "coin"
  | "crescent"
  | "taegeuk";

export type Garland = "lights" | "bunting" | "lanterns" | "korean-lanterns" | "flowers" | "ribbon" | "balloons" | "none";

export interface Theme {
  colors: string[];
  glow: string; // banner va tugmalar uchun asosiy rang
  ambient: { kind: Kind; weight: number }[]; // havodagi zarrachalar
  rate: number; // soniyada (o'rta ekran, o'rta intensivlik)
  max: number;
  dir: "fall" | "rise" | "float";
  burst: Kind[]; // bosganda
  fireworks: boolean;
  garland: Garland;
  garlandText?: string[]; // bayroqchalardagi harflar
  letters?: string[];
  logo: "snowcap" | "tulip" | "heart" | "crescent" | "lantern" | "flag" | "star" | "balloon" | "taegeuk" | "hangul" | "moon" | "none";
  icon: string; // banner belgisi (SVG nomi)
  calm?: boolean; // xotira kuni — salyutsiz, sokin
}

const HANGUL = ["ㄱ", "ㄴ", "ㄷ", "ㄹ", "ㅁ", "ㅂ", "ㅅ", "ㅇ", "ㅈ", "ㅎ", "가", "나", "한", "글", "사", "랑", "꿈", "빛"];

export const THEMES: Record<string, Theme> = {
  newyear: {
    colors: ["#ff4d6d", "#ffd166", "#06d6a0", "#4cc9f0", "#ffffff", "#c77dff"],
    glow: "#4cc9f0",
    ambient: [
      { kind: "flake", weight: 8 },
      { kind: "star", weight: 1 },
    ],
    rate: 26,
    max: 210,
    dir: "fall",
    burst: ["spark"],
    fireworks: true,
    garland: "lights",
    logo: "snowcap",
    icon: "tree",
  },
  navruz: {
    colors: ["#ff8fab", "#ffc2d4", "#ffe5ec", "#90be6d", "#f9c74f", "#ffffff"],
    glow: "#43aa8b",
    ambient: [
      { kind: "petal", weight: 6 },
      { kind: "blossom", weight: 3 },
      { kind: "tulip", weight: 1 },
    ],
    rate: 14,
    max: 120,
    dir: "fall",
    burst: ["petal", "blossom", "tulip"],
    fireworks: false,
    garland: "flowers",
    logo: "tulip",
    icon: "tulip",
  },
  flowers: {
    colors: ["#ff4d8d", "#ff8fab", "#ffc2d4", "#ffd60a", "#c77dff"],
    glow: "#ff4d8d",
    ambient: [
      { kind: "petal", weight: 5 },
      { kind: "mimosa", weight: 3 },
      { kind: "heart", weight: 2 },
    ],
    rate: 12,
    max: 110,
    dir: "fall",
    burst: ["heart", "petal", "mimosa"],
    fireworks: false,
    garland: "flowers",
    logo: "heart",
    icon: "flower",
  },
  remembrance: {
    colors: ["#b23a48", "#e3b04b", "#a1887f"],
    glow: "#b23a48",
    ambient: [], // sokin kun: havoda zarrachalar yo'q, faqat sahnadagi abadiy olov uchqunlari
    rate: 4,
    max: 36,
    dir: "fall",
    burst: [],
    fireworks: false,
    garland: "ribbon",
    logo: "none",
    icon: "candle",
    calm: true,
  },
  independence: {
    colors: ["#0099b5", "#ffffff", "#1eb53a", "#ce1126", "#7fdcf0"],
    glow: "#0099b5",
    ambient: [
      { kind: "confetti", weight: 6 },
      { kind: "star", weight: 1 },
    ],
    rate: 16,
    max: 150,
    dir: "fall",
    burst: ["confetti", "star"],
    fireworks: true,
    garland: "bunting",
    logo: "flag",
    icon: "flag",
  },
  teachers: {
    colors: ["#f4b400", "#4285f4", "#ea4335", "#34a853", "#ffffff"],
    glow: "#4285f4",
    ambient: [
      { kind: "maple", weight: 4 },
      { kind: "leaf", weight: 2 },
    ],
    rate: 5,
    max: 50,
    dir: "fall",
    burst: ["maple", "leaf"],
    fireworks: false,
    garland: "bunting",
    garlandText: ["A", "B", "C", "1", "2", "3"],
    logo: "star",
    icon: "book",
  },
  constitution: {
    colors: ["#e0b23a", "#0099b5", "#1eb53a", "#ffffff"],
    glow: "#e0b23a",
    ambient: [{ kind: "spark", weight: 1 }],
    rate: 6,
    max: 60,
    dir: "rise",
    burst: ["spark", "star"],
    fireworks: false,
    garland: "ribbon",
    logo: "flag",
    icon: "book",
  },
  eid: {
    colors: ["#f5c542", "#ffe29a", "#2bb673", "#ffffff", "#ffb703"],
    glow: "#f5c542",
    ambient: [{ kind: "spark", weight: 1 }], // oltin uchqunlar (yulduz va oy — sahnaning o'zida)
    rate: 9,
    max: 90,
    dir: "rise",
    burst: ["star", "spark", "crescent"],
    fireworks: false,
    garland: "lanterns",
    logo: "crescent",
    icon: "crescent",
  },
  seollal: {
    colors: ["#d7263d", "#f4c430", "#1b4f9c", "#2e8b57", "#ffffff", "#ff8fab"],
    glow: "#d7263d",
    ambient: [
      { kind: "blossom", weight: 4 },
      { kind: "petal", weight: 3 },
      { kind: "coin", weight: 1 },
      { kind: "letter", weight: 1 },
    ],
    rate: 12,
    max: 110,
    dir: "fall",
    burst: ["coin", "blossom", "letter"],
    fireworks: true,
    garland: "korean-lanterns",
    letters: ["福", "복", "春", "新年"],
    logo: "lantern",
    icon: "lantern",
  },
  children: {
    colors: ["#ff5d73", "#ffc145", "#3ddc97", "#4cc9f0", "#b388eb"],
    glow: "#ff5d73",
    ambient: [
      { kind: "balloon", weight: 2 },
      { kind: "confetti", weight: 5 },
    ],
    rate: 12,
    max: 110,
    dir: "float",
    burst: ["confetti", "balloon", "star"],
    fireworks: true,
    garland: "balloons",
    logo: "balloon",
    icon: "balloon",
  },
  korea: {
    colors: ["#cd2e3a", "#0047a0", "#1a1a1a", "#ffffff"],
    glow: "#0047a0",
    ambient: [
      { kind: "taegeuk", weight: 1 },
      { kind: "confetti", weight: 5 },
    ],
    rate: 12,
    max: 120,
    dir: "fall",
    burst: ["confetti", "taegeuk"],
    fireworks: true,
    garland: "bunting",
    logo: "taegeuk",
    icon: "flag",
  },
  chuseok: {
    colors: ["#e07a1f", "#c0392b", "#f2c14e", "#8e5a2b", "#ffd166"],
    glow: "#e07a1f",
    ambient: [
      { kind: "maple", weight: 5 },
      { kind: "skylantern", weight: 1 },
      { kind: "spark", weight: 1 },
    ],
    rate: 10,
    max: 90,
    dir: "fall",
    burst: ["maple", "spark"],
    fireworks: false,
    garland: "korean-lanterns",
    logo: "moon",
    icon: "moon",
  },
  hangul: {
    colors: ["#1b4f9c", "#d7263d", "#f4c430", "#2e8b57", "#7b2cbf"],
    glow: "#1b4f9c",
    ambient: [
      { kind: "letter", weight: 5 },
      { kind: "spark", weight: 1 },
    ],
    rate: 8,
    max: 70,
    dir: "rise",
    burst: ["letter"],
    fireworks: false,
    garland: "bunting",
    garlandText: ["한", "글", "ㄱ", "ㄴ", "ㄷ", "가"],
    letters: HANGUL,
    logo: "hangul",
    icon: "hangul",
  },
};

export function themeOf(style: string): Theme {
  return THEMES[style] || THEMES.newyear;
}
