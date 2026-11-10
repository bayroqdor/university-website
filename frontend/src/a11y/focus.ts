// Modal oynalar uchun fokus tuzog'i: Tab / Shift+Tab oyna ichida aylanadi, yopilganda fokus avvalgi elementga qaytadi.
import { useEffect, type RefObject } from "react";

const TABBABLE =
  'a[href],area[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),iframe,audio[controls],video[controls],[contenteditable]:not([contenteditable="false"]),[tabindex]:not([tabindex="-1"])';

export function tabbables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(TABBABLE)).filter((el) => el.tabIndex >= 0 && el.getClientRects().length > 0 && !el.closest("[inert]"));
}

/** active bo'lganda: Tab tuzog'i; o'chganda (yoki komponent yo'qolganda) — fokus avvalgi elementga qaytadi */
export function useFocusTrap(ref: RefObject<HTMLElement | null>, active: boolean, restore = true) {
  useEffect(() => {
    if (!active) return;
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || !ref.current) return;
      const list = tabbables(ref.current);
      if (!list.length) {
        e.preventDefault();
        return;
      }
      const first = list[0];
      const last = list[list.length - 1];
      const cur = document.activeElement as HTMLElement | null;
      const inside = !!cur && ref.current.contains(cur);
      if (e.shiftKey && (cur === first || !inside)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (cur === last || !inside)) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      if (restore && prev && document.contains(prev)) window.setTimeout(() => prev.focus?.({ preventScroll: true }), 0);
    };
  }, [active, ref, restore]);
}
