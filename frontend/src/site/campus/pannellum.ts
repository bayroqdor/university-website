// Pannellum 2.5.6 (MIT, o'z serverimizdan): skript faqat virtual tur sahifasi ochilganda yuklanadi.
import panoUrl from "pannellum/build/pannellum.js?url";
import "pannellum/build/pannellum.css";

export interface PannellumViewer {
  getYaw(): number;
  getPitch(): number;
  getHfov(): number;
  setHfov(h: number): PannellumViewer;
  loadScene(id: string, pitch?: number | "same", yaw?: number | "same", hfov?: number | "same"): PannellumViewer;
  getScene(): string;
  toggleFullscreen(): PannellumViewer;
  startAutoRotate(speed?: number): PannellumViewer;
  stopAutoRotate(): PannellumViewer;
  startOrientation(): void;
  stopOrientation(): void;
  isOrientationSupported(): boolean;
  isOrientationActive?(): boolean;
  mouseEventToCoords(e: MouseEvent): [number, number];
  addHotSpot(h: Record<string, unknown>, sceneId?: string): PannellumViewer;
  removeHotSpot(id: string, sceneId?: string): boolean;
  on(ev: string, fn: (...a: unknown[]) => void): PannellumViewer;
  destroy(): void;
}
interface Pannellum {
  viewer(el: HTMLElement | string, cfg: Record<string, unknown>): PannellumViewer;
}
declare global {
  interface Window {
    pannellum?: Pannellum;
  }
}

let loading: Promise<Pannellum> | null = null;
export function loadPannellum(): Promise<Pannellum> {
  if (window.pannellum) return Promise.resolve(window.pannellum);
  loading ||= new Promise<Pannellum>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = panoUrl;
    s.async = true;
    s.onload = () => (window.pannellum ? resolve(window.pannellum) : reject(new Error("pannellum")));
    s.onerror = () => {
      loading = null;
      reject(new Error("pannellum"));
    };
    document.head.appendChild(s);
  });
  return loading;
}
