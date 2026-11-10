// Audiokitob pleyeri: boblar (bir kitobning audio fayllari), tezlik 0.75–2x, ±15 soniya, uxlash taymeri,
// to'xtagan joydan davom ettirish va telefonning qulflangan ekranidan boshqarish (Media Session API).
import { ArrowLeft, Headphones, ListMusic, Loader2, Moon, Pause, Play, RotateCcw, RotateCw, SkipBack, SkipForward } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { ApiError } from "../lib/api";
import { fmtDur, lib, type OpenFile } from "./api";
import { Cover, errText, f, LibLang, readerLang, useLT, useReaderBack, useViewerHome } from "./ui";

const SPEEDS = [0.75, 1, 1.25, 1.5, 1.75, 2];
const SLEEPS = [0, 15, 30, 60];

export default function AudioPage({ admin = false }: { admin?: boolean }) {
  return (
    <LibLang lang={readerLang()}>
      <AudioShell admin={admin} />
    </LibLang>
  );
}

function AudioShell({ admin }: { admin: boolean }) {
  const T = useLT();
  const { fid = "" } = useParams();
  const [d, setD] = useState<OpenFile | null>(null);
  const [err, setErr] = useState("");
  const home = useViewerHome(admin);
  useEffect(() => {
    setD(null);
    setErr("");
    lib
      .open(fid, admin)
      .then(setD)
      .catch((e) => {
        if (e instanceof ApiError && e.status === 401 && !admin) return void (window.location.href = `/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
        setErr(errText(e, T));
      });
  }, [fid, admin]); // eslint-disable-line react-hooks/exhaustive-deps
  if (err)
    return (
      <div className="rd rd-msg">
        <p>{err}</p>
        <Link to="/library" className="lb-btn primary">
          {T.back_catalog}
        </Link>
      </div>
    );
  if (!d)
    return (
      <div className="rd rd-msg">
        <Loader2 className="spin" size={30} />
        <p>{T.loading_book}</p>
      </div>
    );
  return <Player key={d.file.id} d={d} admin={admin} home={home} />;
}

function fmtTime(s: number): string {
  if (!isFinite(s) || s < 0) s = 0;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  const mm = String(m).padStart(h ? 2 : 1, "0");
  return `${h ? `${h}:` : ""}${mm}:${String(sec).padStart(2, "0")}`;
}

function Player({ d, admin, home }: { d: OpenFile; admin: boolean; home: string | undefined }) {
  const T = useLT();
  const nav = useNavigate();
  const loc = useLocation();
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [dur, setDur] = useState(d.file.duration || 0);
  const [speed, setSpeedS] = useState(() => {
    try {
      return Number(localStorage.getItem("au_speed") || 1) || 1;
    } catch {
      return 1;
    }
  });
  const [sleepEnd, setSleepEnd] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [list, setList] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const listened = useRef({ secs: 0, last: 0 });
  const chapters = d.siblings.length ? d.siblings : [d.file];
  const idx = Math.max(0, chapters.findIndex((c) => c.id === d.file.id));
  const base = admin ? "/admin/library/listen" : "/library/listen";
  const back = useReaderBack(d.book.id, admin, home);
  const preview = !!d.preview;
  // mehmon (ochiq fond) — tinglash joyi saqlanmaydi
  const noSave = preview || !!d.guest || home === "";

  // o'qish joyini saqlash (har 15 soniyada va sahifadan chiqishda)
  const save = useCallback(() => {
    const a = audio.current;
    if (!a || noSave) return;
    const secs = Math.round(listened.current.secs);
    listened.current.secs = 0;
    const total = a.duration || dur || 0;
    const percent = total ? (a.currentTime / total) * 100 : 0;
    lib.progress(d.file.id, { loc: String(Math.floor(a.currentTime)), percent, seconds: secs }).catch(() => undefined);
  }, [d.file.id, dur, noSave]);
  useEffect(() => {
    const t = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);
    const s = window.setInterval(() => !audio.current?.paused && save(), 15000);
    const hide = () => document.visibilityState === "hidden" && save();
    document.addEventListener("visibilitychange", hide);
    return () => {
      window.clearInterval(t);
      window.clearInterval(s);
      document.removeEventListener("visibilitychange", hide);
      save();
    };
  }, [save]);

  // boshlang'ich joy
  useEffect(() => {
    const a = audio.current;
    if (!a) return;
    const start = Number(d.progress?.loc || 0);
    const onMeta = () => {
      if (a.duration && isFinite(a.duration)) setDur(a.duration);
      if (start > 0 && start < (a.duration || Infinity) - 5) a.currentTime = start;
      a.playbackRate = speed;
    };
    a.addEventListener("loadedmetadata", onMeta, { once: true });
    return () => a.removeEventListener("loadedmetadata", onMeta);
  }, [d]); // eslint-disable-line react-hooks/exhaustive-deps

  const setSpeed = (v: number) => {
    setSpeedS(v);
    if (audio.current) audio.current.playbackRate = v;
    try {
      localStorage.setItem("au_speed", String(v));
    } catch {
      /* */
    }
  };
  const toggle = useCallback(() => {
    const a = audio.current;
    if (!a) return;
    if (a.paused) a.play().catch(() => undefined);
    else a.pause();
  }, []);
  const skip = useCallback((s: number) => {
    const a = audio.current;
    if (a) a.currentTime = Math.max(0, Math.min((a.duration || 0) - 0.5, a.currentTime + s));
  }, []);
  const go = useCallback(
    (i: number, autoplay = true) => {
      const c = chapters[i];
      if (!c) return;
      save();
      // boblar almashganda tarix yozuvi almashtiriladi; qaytish manzili (from) va «sayt ichidan ochilgan» belgisi saqlanadi
      const q = new URLSearchParams(loc.search);
      q.delete("play");
      if (autoplay) q.set("play", "1");
      const qs = q.toString();
      nav(`${base}/${c.id}${qs ? `?${qs}` : ""}`, { replace: true, state: loc.state });
    },
    [chapters, base, nav, save, loc.search, loc.state],
  );

  // avtomatik ijro (keyingi bobga o'tganda)
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("play") === "1") audio.current?.play().catch(() => undefined);
  }, [d]);

  // uxlash taymeri
  useEffect(() => {
    if (!sleepEnd) return;
    if (now >= sleepEnd) {
      audio.current?.pause();
      setSleepEnd(0);
    }
  }, [now, sleepEnd]);

  // Media Session: qulflangan ekran va quloqchin tugmalari
  useEffect(() => {
    const ms = navigator.mediaSession;
    if (!ms) return;
    try {
      ms.metadata = new MediaMetadata({
        title: chapters.length > 1 ? d.file.title || `${idx + 1}` : d.book.title,
        artist: (d.book.authors || []).join(", "),
        album: d.book.title,
        artwork: d.book.cover ? [{ src: new URL(d.book.cover, window.location.href).href, sizes: "512x512" }] : [],
      });
      ms.setActionHandler("play", () => audio.current?.play());
      ms.setActionHandler("pause", () => audio.current?.pause());
      ms.setActionHandler("seekbackward", () => skip(-15));
      ms.setActionHandler("seekforward", () => skip(15));
      ms.setActionHandler("previoustrack", idx > 0 ? () => go(idx - 1) : null);
      ms.setActionHandler("nexttrack", idx < chapters.length - 1 ? () => go(idx + 1) : null);
      ms.setActionHandler("seekto", (e) => {
        if (audio.current && e.seekTime != null) audio.current.currentTime = e.seekTime;
      });
    } catch {
      /* eski brauzerlar */
    }
    return () => {
      try {
        (["play", "pause", "seekbackward", "seekforward", "previoustrack", "nexttrack", "seekto"] as MediaSessionAction[]).forEach((a) => ms.setActionHandler(a, null));
      } catch {
        /* */
      }
    };
  }, [d, idx, chapters.length, go, skip]);

  useEffect(() => {
    const ms = navigator.mediaSession;
    if (!ms?.setPositionState || !dur) return;
    try {
      ms.setPositionState({ duration: dur, playbackRate: speed, position: Math.min(time, dur) });
    } catch {
      /* */
    }
  }, [time, dur, speed]);

  // klaviatura: bo'sh joy — ijro/pauza, ← → — 15 soniya
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || tag === "BUTTON") return;
      if (e.key === " ") (e.preventDefault(), toggle());
      else if (e.key === "ArrowLeft") skip(-15);
      else if (e.key === "ArrowRight") skip(15);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [toggle, skip]);

  const onTime = () => {
    const a = audio.current;
    if (!a) return;
    setTime(a.currentTime);
    const t = performance.now();
    if (!a.paused && listened.current.last) listened.current.secs += Math.min(2, (t - listened.current.last) / 1000) * 1;
    listened.current.last = t;
  };
  const sleepLeft = sleepEnd ? Math.max(0, Math.ceil((sleepEnd - now) / 60000)) : 0;
  const pct = dur ? (time / dur) * 100 : 0;

  return (
    <div className="au">
      <header className="au-top">
        <Link {...back} className="rd-ic" aria-label={T.close} title={T.close}>
          <ArrowLeft size={20} />
        </Link>
        <span className="au-kicker">
          <Headphones size={15} /> {T.fmt_audio}
          {preview && <em> · {T.preview}</em>}
        </span>
        <button className={`rd-ic ${list ? "on" : ""}`} onClick={() => setList(!list)} aria-pressed={list} aria-label={T.toc} title={T.toc}>
          <ListMusic size={20} />
        </button>
      </header>
      <main className={`au-main ${list ? "with-list" : ""}`}>
        <section className="au-card" aria-label={d.book.title}>
          <Cover title={d.book.title} src={d.book.cover} size="lg" className="au-cover" />
          <h1>{d.book.title}</h1>
          <p className="au-sub">
            {(d.book.authors || []).join(", ")}
            {chapters.length > 1 && (
              <>
                {" · "}
                {d.file.title || f(T.chapters, { n: idx + 1 })}
              </>
            )}
          </p>
          <audio
            ref={audio}
            src={d.url}
            preload="metadata"
            onPlay={() => ((listened.current.last = performance.now()), setPlaying(true))}
            onPause={() => (setPlaying(false), save())}
            onTimeUpdate={onTime}
            onDurationChange={(e) => isFinite(e.currentTarget.duration) && setDur(e.currentTarget.duration)}
            onWaiting={() => setBuffering(true)}
            onPlaying={() => setBuffering(false)}
            onCanPlay={() => setBuffering(false)}
            onEnded={() => {
              save();
              if (idx < chapters.length - 1) go(idx + 1);
            }}
          />
          <div className="au-seek">
            <input
              type="range"
              min={0}
              max={dur || 0}
              step={1}
              value={Math.min(time, dur || 0)}
              onChange={(e) => {
                if (audio.current) audio.current.currentTime = Number(e.target.value);
                setTime(Number(e.target.value));
              }}
              style={{ ["--p" as string]: `${pct}%` }}
              aria-label={T.page_of.replace("{p}", fmtTime(time)).replace("{n}", fmtTime(dur))}
            />
            <div className="au-times">
              <span>{fmtTime(time)}</span>
              <span>−{fmtTime(Math.max(0, dur - time))}</span>
            </div>
          </div>
          <div className="au-ctrl">
            <button className="au-b sm" onClick={() => go(idx - 1)} disabled={idx <= 0} aria-label={T.prev} title={T.prev}>
              <SkipBack size={20} />
            </button>
            <button className="au-b" onClick={() => skip(-15)} aria-label={T.back15} title={T.back15}>
              <RotateCcw size={24} />
              <i>15</i>
            </button>
            <button className="au-play" onClick={toggle} aria-label={playing ? T.pause : T.play}>
              {buffering && playing ? <Loader2 size={30} className="spin" /> : playing ? <Pause size={30} /> : <Play size={30} />}
            </button>
            <button className="au-b" onClick={() => skip(15)} aria-label={T.fwd15} title={T.fwd15}>
              <RotateCw size={24} />
              <i>15</i>
            </button>
            <button className="au-b sm" onClick={() => go(idx + 1)} disabled={idx >= chapters.length - 1} aria-label={T.next} title={T.next}>
              <SkipForward size={20} />
            </button>
          </div>
          <div className="au-opts">
            <label>
              <span>{T.speed}</span>
              <span className="rd-seg" role="group" aria-label={T.speed}>
                {SPEEDS.map((s) => (
                  <button key={s} className={speed === s ? "on" : ""} onClick={() => setSpeed(s)} aria-pressed={speed === s}>
                    {s}×
                  </button>
                ))}
              </span>
            </label>
            <label>
              <span>
                <Moon size={14} /> {T.sleep}
                {sleepLeft > 0 && <em> · {f(T.sleep_left, { m: sleepLeft })}</em>}
              </span>
              <span className="rd-seg" role="group" aria-label={T.sleep}>
                {SLEEPS.map((m) => {
                  const on = m === 0 ? !sleepEnd : false;
                  return (
                    <button key={m} className={on ? "on" : ""} onClick={() => setSleepEnd(m ? Date.now() + m * 60000 : 0)}>
                      {m ? f(T.minutes, { n: m }) : T.sleep_off}
                    </button>
                  );
                })}
              </span>
            </label>
          </div>
        </section>
        {list && (
          <aside className="au-list" aria-label={T.toc}>
            <b>{f(T.chapters, { n: chapters.length })}</b>
            <ol>
              {chapters.map((c, i) => {
                const p = d.progress_all?.[c.id]?.percent || 0;
                return (
                  <li key={c.id}>
                    <button className={i === idx ? "on" : ""} onClick={() => go(i)} aria-current={i === idx}>
                      <span className="n">{i + 1}</span>
                      <span className="t">{c.title || `${T.chapters.replace("{n}", "")} ${i + 1}`}</span>
                      <span className="d">{c.duration ? fmtDur(c.duration) : ""}</span>
                      {p > 0 && <span className="p" style={{ width: `${Math.min(100, p)}%` }} />}
                    </button>
                  </li>
                );
              })}
            </ol>
          </aside>
        )}
      </main>
    </div>
  );
}
