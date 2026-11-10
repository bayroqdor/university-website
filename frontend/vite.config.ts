import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import a11yTextScale from "./a11y-text-scale";

const api = "http://127.0.0.1:8000";

export default defineConfig({
  plugins: [react()],
  // «Maxsus imkoniyatlar» → matn o'lchami: px shrift o'lchamlari var(--a11y-fz) ga ko'paytiriladi (a11y-text-scale.ts)
  css: { postcss: { plugins: [a11yTextScale()] } },
  server: {
    proxy: { "/api": api, "/media": api, "/rss.xml": api, "/sitemap.xml": api, "/robots.txt": api },
  },
  build: {
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/echarts") || id.includes("node_modules/zrender")) return "echarts";
          if (id.includes("node_modules/katex")) return "katex";
          if (id.includes("node_modules/lowlight") || id.includes("node_modules/highlight.js")) return "highlight";
          if (id.includes("node_modules/@tiptap") || id.includes("node_modules/prosemirror")) return "tiptap";
          return undefined;
        },
      },
    },
  },
});
