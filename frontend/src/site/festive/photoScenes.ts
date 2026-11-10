// Bayram sahnalari: haqiqiy fotosurat (Wikimedia Commons, erkin litsenziya — muallif sahnada ko'rsatiladi) +
// jonli qatlamlar (sceneFx) + kerak bo'lsa salyut. Rasmlar: frontend/public/festive/*.webp
import type { Layer } from "./sceneFx";

export interface Credit {
  author: string;
  license: string;
  url: string;
}

export interface PhotoScene {
  photo: string;
  ar: number; // kenglik / balandlik
  side: "left" | "right"; // surat qaysi tomonda (matn — qarama-qarshisida)
  fit: "cover" | "height"; // height — surat butun balandlikda, yon tomonlari panel rangiga singib ketadi
  focal: [number, number]; // kesilganda qaysi nuqta saqlanadi (0..1)
  panel: string; // matn paneli rangi (surat cheti shu rangga o'tadi)
  tone: "dark" | "light";
  accent: string; // ko'z (eyebrow) va tugmalar
  credit: Credit;
  layers: Layer[];
  fireworks?: { palette: string[]; shells?: ("peony" | "chrysanthemum" | "willow" | "ring" | "crossette" | "strobe" | "palm")[] };
  extra?: "newyear";
}

const BULBS = [[0.6494, 0.4916], [0.6412, 0.3952], [0.5018, 0.8857], [0.6959, 0.6897], [0.6253, 0.8386], [0.4941, 0.6625], [0.6288, 0.913], [0.6312, 0.521], [0.5718, 0.848], [0.5594, 0.2872], [0.5306, 0.6048], [0.5929, 0.8323], [0.5371, 0.5367], [0.5094, 0.3407], [0.4794, 0.8606], [0.61, 0.5713], [0.5671, 0.5828], [0.5565, 0.0912], [0.6724, 0.4675], [0.5894, 0.631], [0.6059, 0.805], [0.5359, 0.6981], [0.5882, 0.913], [0.5718, 0.6709], [0.4824, 0.6237], [0.5824, 0.7872], [0.5482, 0.7652], [0.5406, 0.892], [0.4853, 0.9172], [0.45, 0.8008], [0.5518, 0.1855], [0.5329, 0.2191], [0.62, 0.4444], [0.5694, 0.5283], [0.5841, 0.3721], [0.6471, 0.9382], [0.6335, 0.3396], [0.5994, 0.4413], [0.5635, 0.4518], [0.5247, 0.4455], [0.51, 0.6132], [0.4688, 0.7862], [0.6176, 0.6499], [0.6124, 0.3857], [0.5465, 0.6478], [0.5076, 0.4958], [0.49, 0.5231], [0.4718, 0.5094], [0.5894, 0.5262], [0.5653, 0.3229], [0.6047, 0.3396], [0.5482, 0.4214], [0.6871, 0.7306], [0.6071, 0.7484], [0.7147, 0.7317], [0.5218, 0.9109], [0.6594, 0.7893], [0.6153, 0.4979], [0.5112, 0.5451], [0.6459, 0.7275], [0.6435, 0.2966], [0.7253, 0.609], [0.6529, 0.6415], [0.7406, 0.782], [0.7859, 0.8229]];

export const DEDMOROZ: { src: string; ar: number; credit: Credit } = {
  src: "/festive/newyear-dedmoroz.webp",
  ar: 0.654,
  credit: { author: "Dmitry Astakhov", license: "CC BY 4.0", url: "https://commons.wikimedia.org/wiki/File:Ded_Moroz.jpg" },
};

export const PHOTO_SCENES: Record<string, PhotoScene> = {
  newyear: {
    photo: "/festive/newyear.webp",
    ar: 1.782,
    side: "right",
    fit: "cover",
    focal: [0.62, 0.35],
    panel: "#0b1330",
    tone: "dark",
    accent: "#ffd77a",
    credit: { author: "epSos.de", license: "CC BY 2.0", url: "https://commons.wikimedia.org/wiki/File:Glowing_Christmas_Tree_Lights_in_the_Winter_Night.jpg" },
    layers: [
      { k: "stars", area: [0, 0, 1, 0.45], n: 70 },
      { k: "bulbs", pts: BULBS },
      { k: "treestar", at: [0.5715, 0.055], size: 0.04 },
      { k: "snow", density: 1 },
    ],
    fireworks: { palette: ["#ff4d6d", "#ffd166", "#06d6a0", "#4cc9f0", "#c77dff", "#ffffff"] },
    extra: "newyear",
  },
  navruz: {
    photo: "/festive/navruz.webp",
    ar: 1.3333,
    side: "right",
    fit: "cover",
    focal: [0.6, 0.45],
    panel: "#2c679e",
    tone: "dark",
    accent: "#ffe08a",
    credit: { author: "Armineaghayan", license: "CC BY-SA 4.0", url: "https://commons.wikimedia.org/wiki/File:Apricot_tree_in_blossoms,_april.jpg" },
    layers: [
      { k: "petals", colors: ["#ffd9e3", "#ffe8ee", "#fbc4d4", "#ffffff"], density: 0.8 },
      { k: "dust", color: "#fff4cf", density: 0.6 },
    ],
  },
  remembrance: {
    photo: "/festive/remembrance.webp",
    ar: 1.5004,
    side: "right",
    fit: "height",
    focal: [1, 0.5],
    panel: "#0f1210",
    tone: "dark",
    accent: "#e9b872",
    credit: { author: "Humoyun Mehridinov", license: "CC BY-SA 4.0", url: "https://commons.wikimedia.org/wiki/File:Motamsaro_ona_haykali_7.jpg" },
    layers: [
      { k: "flame", at: [0.533, 0.83], r: 0.06 },
      { k: "embers", at: [0.533, 0.74], spread: 0.012 },
      { k: "flame", at: [0.215, 0.7], r: 0.018 },
    ],
  },
  independence: {
    photo: "/festive/independence.webp",
    ar: 1.6848,
    side: "right",
    fit: "cover",
    focal: [0.5, 0.42],
    panel: "#132a57",
    tone: "dark",
    accent: "#8fd3ff",
    credit: { author: "Petar Milošević", license: "CC BY-SA 4.0", url: "https://commons.wikimedia.org/wiki/File:Ezgulik_monumenti_(%D0%B0%D1%80%D0%BA%D0%B0_%C2%AB%D0%AD%D0%B7%D0%B3%D1%83%D0%BB%D0%B8%D0%BA%C2%BB,_%D0%9F%D0%BB%D0%BE%D1%89%D0%B0%D0%B4%D1%8C_%D0%9C%D1%83%D1%81%D1%82%D0%B0%D0%BA%D0%B8%D0%BB%D0%BB%D0%B8%D0%BA,_%D0%A2%D0%B0%D1%88%D0%BA%D0%B5%D0%BD%D1%82).jpg" },
    layers: [{ k: "dust", color: "#cfe8ff", density: 0.5 }],
    // bayroq ranglari: ko'k, oq, yashil (va ingichka qizil chiziq)
    fireworks: { palette: ["#1eb5ea", "#ffffff", "#1eb53a", "#5ad1ff", "#ffffff", "#ce1126"], shells: ["peony", "peony", "chrysanthemum", "ring", "willow", "palm", "strobe"] },
  },
  teachers: {
    photo: "/festive/teachers.webp",
    ar: 1.486,
    side: "right",
    fit: "cover",
    focal: [0.55, 0.3],
    panel: "#f4ecdf",
    tone: "light",
    accent: "#9a5b13",
    credit: { author: "Bgag", license: "CC0", url: "https://commons.wikimedia.org/wiki/File:Ulugh_Beg_Madrasa,_Samarkand.jpg" },
    layers: [
      { k: "leaves", density: 1 },
      { k: "dust", color: "#ffd27a", density: 0.4 },
    ],
  },
  constitution: {
    photo: "/festive/constitution.webp",
    ar: 1.6114,
    side: "right",
    fit: "cover",
    focal: [0.58, 0.4],
    panel: "#1b2436",
    tone: "dark",
    accent: "#f2c46d",
    credit: { author: "LBM1948", license: "CC BY-SA 4.0", url: "https://commons.wikimedia.org/wiki/File:Tashkent,_Paque_Navoi_3.jpg" },
    layers: [
      { k: "snow", density: 0.25 },
      { k: "dust", color: "#ffe2a8", density: 0.5 },
    ],
  },
  flowers: {
    photo: "/festive/flowers.webp",
    ar: 1.3333,
    side: "right",
    fit: "cover",
    focal: [0.5, 0.45],
    panel: "#4d1030",
    tone: "dark",
    accent: "#ffc2d6",
    credit: { author: "Gábor Juhász", license: "CC0", url: "https://commons.wikimedia.org/wiki/File:Tulip-bouquet-vienna_(Unsplash).jpg" },
    layers: [
      { k: "petals", colors: ["#ff4d8d", "#ff7aa8", "#e0245e", "#ffd1e0", "#f5c518"], density: 0.9 },
      { k: "dust", color: "#ffd6e6", density: 0.6 },
    ],
  },
  eid: {
    photo: "/festive/eid.webp",
    ar: 1.4978,
    side: "right",
    fit: "cover",
    focal: [0.55, 0.62],
    panel: "#0a1a40",
    tone: "dark",
    accent: "#f3d27a",
    credit: { author: "Pixoos", license: "CC BY-SA 4.0", url: "https://commons.wikimedia.org/wiki/File:Bukhara_by_Pouria_Afkhami_aka_pixoos_02.jpg" },
    layers: [
      { k: "stars", area: [0, 0, 1, 0.5], n: 60 },
      { k: "dust", color: "#ffd98a", density: 0.7 },
    ],
  },
};
