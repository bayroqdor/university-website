import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { isLang, pub, setApiLang, type Lang, type SiteData } from "./api";
import { DICTS, type Dict } from "./i18n";
import { useMotionReduced } from "../a11y/prefs";

type Theme = "light" | "dark";

interface Ctx {
  data: SiteData | null;
  error: boolean;
  t: Dict;
  /** saytning joriy tili (foydalanuvchi tanlagan yoki standart) */
  lang: Lang;
  defaultLang: Lang;
  setLang: (l: Lang) => void;
  theme: Theme;
  toggleTheme: () => void;
  motionOn: boolean;
  reload: () => void;
}

const SiteCtx = createContext<Ctx | null>(null);

export function useSite(): Ctx {
  const c = useContext(SiteCtx);
  if (!c) throw new Error("SiteProvider missing");
  return c;
}

function urlLang(): Lang | null {
  if (typeof window === "undefined") return null;
  const v = new URLSearchParams(window.location.search).get("lang");
  return isLang(v) ? v : null;
}

function storedLang(): Lang | null {
  try {
    const v = localStorage.getItem("lang");
    return isLang(v) ? v : null;
  } catch {
    return null;
  }
}

function persistLang(l: Lang) {
  try {
    localStorage.setItem("lang", l);
  } catch {
    /* */
  }
  // server sahifa sarlavhasi va meta teglarni ham shu tilda beradi
  document.cookie = `lang=${l}; path=/; max-age=31536000; samesite=lax`;
}

function storedTheme(): Theme | null {
  try {
    const v = localStorage.getItem("theme");
    return v === "dark" || v === "light" ? v : null;
  } catch {
    return null;
  }
}

export function SiteProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<SiteData | null>(null);
  const [error, setError] = useState(false);
  // tizimda «harakatni kamaytirish» yoki «Maxsus imkoniyatlar» → «Animatsiyalarni to'xtatish»
  const reducedMotion = useMotionReduced();
  const [theme, setTheme] = useState<Theme>(() => (document.documentElement.dataset.theme === "dark" ? "dark" : "light"));
  // til: havoladagi ?lang= → avval tanlangan til → saytning standart tili (serverdan)
  const [chosen, setChosen] = useState<Lang | null>(() => {
    const u = urlLang();
    if (u) persistLang(u);
    const l = u || storedLang();
    setApiLang(l || "");
    return l;
  });

  const seq = useRef(0);
  const reload = useCallback(() => {
    const n = ++seq.current; // tilni tez almashtirganda eski javob yangisini bosib ketmasin
    pub
      .site()
      .then((d) => {
        if (n !== seq.current) return;
        setData(d);
        setError(false);
      })
      .catch(() => setError(true));
  }, []);
  useEffect(reload, [reload, chosen]);

  const setLang = useCallback((l: Lang) => {
    persistLang(l);
    setApiLang(l);
    // havoladagi eski ?lang= qayta yuklashda tanlovni bekor qilmasin
    const u = new URL(window.location.href);
    if (u.searchParams.has("lang")) {
      u.searchParams.delete("lang");
      window.history.replaceState(window.history.state, "", u.pathname + u.search + u.hash);
    }
    setChosen(l);
  }, []);

  const lang: Lang = chosen || data?.lang || data?.site.lang || "uz";

  // sayt standart mavzusi (foydalanuvchi o'zi tanlamagan bo'lsa)
  useEffect(() => {
    if (!data || storedTheme()) return;
    const pref = data.site.theme;
    if (pref === "light" || pref === "dark") setTheme(pref);
  }, [data]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    if (!data) return;
    const root = document.documentElement;
    root.style.setProperty("--accent", data.site.accent || "#0F3D8C");
    root.style.setProperty("--accent2", data.site.accent2 || "#C8102E");
    if (data.site.favicon) {
      const link = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
      if (link) link.href = data.site.favicon;
    }
  }, [data]);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const toggleTheme = useCallback(() => {
    setTheme((t) => {
      const n = t === "dark" ? "light" : "dark";
      try {
        localStorage.setItem("theme", n);
      } catch {
        /* */
      }
      return n;
    });
  }, []);

  const value = useMemo<Ctx>(
    () => ({
      data,
      error,
      t: DICTS[lang] || DICTS.uz,
      lang,
      defaultLang: data?.default_lang || data?.site.lang || "uz",
      setLang,
      theme,
      toggleTheme,
      motionOn: (data?.site.animations ?? true) && !reducedMotion,
      reload,
    }),
    [data, error, theme, toggleTheme, reload, lang, setLang, reducedMotion],
  );
  return <SiteCtx.Provider value={value}>{children}</SiteCtx.Provider>;
}
