// Sayt chati — o'ng pastki burchak. Avval ism-familiya va telefon, keyin suhbat: tez savollar yoki o'z savoli.
// Javoblar sayt kontentidan (backend: university/chatbot.py, sun'iy intellektsiz). Javob topilmasa — murojaatlar bo'limiga
// suhbat tarixi bilan yuboriladi. Suhbat brauzerda eslab qolinadi (localStorage: sid), qayta ochilganda davom etadi.
import {
  ArrowUpRight,
  MessageCircle,
  Phone,
  RotateCcw,
  Send,
  User,
  X,
} from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { req, type Lang } from "../../lib/api";
import { useSite } from "../../lib/site";
import "../../styles/chat.css";

type ChatLink = { title: string; to: string; sub?: string };
type Msg = {
  from: "user" | "bot";
  text: string;
  links?: ChatLink[];
  at: string;
  intent?: string;
};
type Sess = {
  sid: string;
  name: string;
  phone: string;
  messages: Msg[];
  quick: string[];
  ticket?: boolean;
};

const KEY = "uni-chat";
const TX: Record<Lang, Record<string, string>> = {
  uz: {
    open: "Savol bering",
    title: "Yordamchi",
    status: "Saytdagi ma’lumotlardan darhol javob beradi",
    intro:
      "Suhbatni boshlash uchun ismingiz va telefon raqamingizni yozing — javob topilmasa, mutaxassis shu raqamga bog‘lanadi.",
    name: "Ism va familiya",
    phone: "Telefon raqam",
    start: "Suhbatni boshlash",
    consent:
      "Ma’lumotlar faqat murojaatingizga javob berish uchun ishlatiladi.",
    placeholder: "Savolingizni yozing…",
    send: "Yuborish",
    quick: "Tez savollar",
    restart: "Yangi suhbat",
    close: "Yopish",
    bad_name: "Ism va familiyani to‘liq yozing",
    bad_phone: "Telefon raqamni to‘g‘ri kiriting",
    error: "Xatolik. Qaytadan urinib ko‘ring.",
    ticket: "Murojaatingiz qabul qilingan — mutaxassis bog‘lanadi",
  },
  ru: {
    open: "Задать вопрос",
    title: "Помощник",
    status: "Отвечает сразу по материалам сайта",
    intro:
      "Чтобы начать, укажите имя и телефон — если ответа не найдётся, специалист перезвонит вам.",
    name: "Имя и фамилия",
    phone: "Номер телефона",
    start: "Начать чат",
    consent: "Данные используются только для ответа на ваше обращение.",
    placeholder: "Напишите вопрос…",
    send: "Отправить",
    quick: "Быстрые вопросы",
    restart: "Новый чат",
    close: "Закрыть",
    bad_name: "Укажите имя и фамилию полностью",
    bad_phone: "Проверьте номер телефона",
    error: "Ошибка. Попробуйте ещё раз.",
    ticket: "Обращение принято — специалист свяжется с вами",
  },
  en: {
    open: "Ask a question",
    title: "Assistant",
    status: "Answers instantly from the website",
    intro:
      "To start, enter your name and phone — if there’s no answer, a specialist will call you back.",
    name: "Full name",
    phone: "Phone number",
    start: "Start chat",
    consent: "Your details are used only to answer your request.",
    placeholder: "Type your question…",
    send: "Send",
    quick: "Quick questions",
    restart: "New chat",
    close: "Close",
    bad_name: "Please enter your full name",
    bad_phone: "Please check the phone number",
    error: "Something went wrong. Please try again.",
    ticket: "Request received — a specialist will contact you",
  },
};

function load(): string {
  try {
    return localStorage.getItem(KEY) || "";
  } catch {
    return "";
  }
}
function store(v: string) {
  try {
    if (v) localStorage.setItem(KEY, v);
    else localStorage.removeItem(KEY);
  } catch {
    /* maxfiy rejim */
  }
}
const time = (iso: string) =>
  iso
    ? new Date(iso).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

function LinkRow({ l }: { l: ChatLink }) {
  const inner = (
    <>
      <span>
        <b>{l.title}</b>
        {l.sub && <small>{l.sub}</small>}
      </span>
      <ArrowUpRight size={15} aria-hidden />
    </>
  );
  if (/^https?:/.test(l.to))
    return (
      <a
        className="cw-link"
        href={l.to}
        target="_blank"
        rel="noopener noreferrer"
      >
        {inner}
      </a>
    );
  return (
    <Link className="cw-link" to={l.to}>
      {inner}
    </Link>
  );
}

export function ChatWidget() {
  const { lang } = useSite();
  const t = TX[lang] || TX.uz;
  const [open, setOpen] = useState(false);
  const [s, setS] = useState<Sess | null>(null);
  const [quick, setQuick] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("+998 ");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const list = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const fab = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);
  const wasOpen = useRef(false);
  // ochilganda fokus oynaga, yopilganda — ochuvchi tugmaga (klaviatura va ekran o'qish dasturlari uchun)
  useEffect(() => {
    if (open) {
      wasOpen.current = true;
      window.setTimeout(() => panel.current?.querySelector<HTMLElement>("input, textarea, button:not(.cw-ic)")?.focus(), 60);
    } else if (wasOpen.current) {
      wasOpen.current = false;
      const a = document.activeElement;
      if (!a || a === document.body || !document.contains(a)) fab.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const sid = load();
    if (sid && !s)
      req<Sess>("GET", `/api/chat/${sid}`)
        .then(setS)
        .catch(() => store(""));
    req<{ items: string[] }>("GET", `/api/chat/quick?lang=${lang}`)
      .then((r) => setQuick(r.items))
      .catch(() => null);
  }, [open, lang]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    list.current?.scrollTo({
      top: list.current.scrollHeight,
      behavior: "smooth",
    });
  }, [s?.messages.length, busy]);

  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || document.querySelector("dialog[open]")) return;
      const inside = panel.current?.contains(document.activeElement);
      setOpen(false);
      if (inside) fab.current?.focus();
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open]);

  const start = async (e: FormEvent) => {
    e.preventDefault();
    setErr("");
    if (name.trim().length < 3) return setErr(t.bad_name);
    if (phone.replace(/\D/g, "").length < 9) return setErr(t.bad_phone);
    setBusy(true);
    try {
      const r = await req<Sess>("POST", "/api/chat/start", {
        name,
        phone,
        lang,
      });
      store(r.sid);
      setS(r);
      setQuick(r.quick);
      window.setTimeout(() => input.current?.focus(), 50);
    } catch (x) {
      const d = String(
        (x as { detail?: string }).detail ||
          (x instanceof Error ? x.message : ""),
      );
      setErr(
        d.includes("bad_phone")
          ? t.bad_phone
          : d.includes("bad_name")
            ? t.bad_name
            : t.error,
      );
    } finally {
      setBusy(false);
    }
  };

  const ask = async (q: string) => {
    const v = q.trim();
    if (!v || !s || busy) return;
    setText("");
    const mine: Msg = { from: "user", text: v, at: new Date().toISOString() };
    setS({ ...s, messages: [...s.messages, mine] });
    setBusy(true);
    try {
      const r = await req<{ message: Msg; ticket: boolean }>(
        "POST",
        `/api/chat/${s.sid}`,
        { text: v, lang },
      );
      setS((p) =>
        p
          ? { ...p, messages: [...p.messages, r.message], ticket: r.ticket }
          : p,
      );
    } catch {
      setS((p) =>
        p
          ? {
              ...p,
              messages: [
                ...p.messages,
                { from: "bot", text: t.error, at: new Date().toISOString() },
              ],
            }
          : p,
      );
    } finally {
      setBusy(false);
      input.current?.focus();
    }
  };

  const restart = () => {
    store("");
    setS(null);
  };

  const shown = s?.messages || [];
  const lastBot = shown.length === 1 && shown[0].from === "bot";
  return (
    <>
      <button
        ref={fab}
        type="button"
        className={`cw-fab ${open ? "on" : ""}`}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="cw-panel"
        aria-label={open ? t.close : t.open}
      >
        {open ? <X size={22} /> : <MessageCircle size={22} />}
        {!open && <span className="cw-fab-l">{t.open}</span>}
      </button>
      {open && (
        <section
          ref={panel}
          id="cw-panel"
          className="cw"
          role="dialog"
          aria-label={t.title}
        >
          <header className="cw-h">
            <span className="cw-h-mark" aria-hidden>
              <MessageCircle size={18} />
            </span>
            <span className="cw-h-t">
              <b>{t.title}</b>
              <small>{t.status}</small>
            </span>
            {s && (
              <button
                type="button"
                className="cw-ic"
                onClick={restart}
                title={t.restart}
                aria-label={t.restart}
              >
                <RotateCcw size={16} />
              </button>
            )}
            <button
              type="button"
              className="cw-ic"
              onClick={() => setOpen(false)}
              title={t.close}
              aria-label={t.close}
            >
              <X size={18} />
            </button>
          </header>

          {!s ? (
            <form className="cw-start" onSubmit={start}>
              <p>
                {t.intro} {t.consent}
              </p>
              <label className="cw-f">
                <span>{t.name}</span>
                <span className="cw-in">
                  <User size={16} aria-hidden />
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoComplete="name"
                    maxLength={120}
                    required
                    autoFocus
                  />
                </span>
              </label>
              <label className="cw-f">
                <span>{t.phone}</span>
                <span className="cw-in">
                  <Phone size={16} aria-hidden />
                  <input
                    value={phone}
                    onChange={(e) =>
                      setPhone(e.target.value.replace(/[^\d+\s()-]/g, ""))
                    }
                    inputMode="tel"
                    autoComplete="tel"
                    maxLength={20}
                    required
                  />
                </span>
              </label>
              {err && (
                <p className="cw-err" role="alert">
                  {err}
                </p>
              )}
              <button className="cw-btn" disabled={busy}>
                {t.start}
              </button>
            </form>
          ) : (
            <>
              <div className="cw-list" ref={list} aria-live="polite">
                {shown.map((m, i) => (
                  <div key={i} className={`cw-m ${m.from}`}>
                    {m.text && <p>{m.text}</p>}
                    {!!m.links?.length && (
                      <div className="cw-links">
                        {m.links.map((l, k) => (
                          <LinkRow key={k} l={l} />
                        ))}
                      </div>
                    )}
                    <time>{time(m.at)}</time>
                  </div>
                ))}
                {busy && (
                  <div className="cw-m bot cw-typing" aria-hidden>
                    <i />
                    <i />
                    <i />
                  </div>
                )}
                {(lastBot || shown.length < 4) && !!quick.length && (
                  <div className="cw-quick">
                    <small>{t.quick}</small>
                    {quick.map((q) => (
                      <button
                        key={q}
                        type="button"
                        onClick={() => ask(q)}
                        disabled={busy}
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {s.ticket && <p className="cw-ticket">{t.ticket}</p>}
              <form
                className="cw-send"
                onSubmit={(e) => {
                  e.preventDefault();
                  ask(text);
                }}
              >
                <textarea
                  ref={input}
                  rows={1}
                  value={text}
                  placeholder={t.placeholder}
                  maxLength={1000}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      ask(text);
                    }
                  }}
                  aria-label={t.placeholder}
                />
                <button
                  className="cw-go"
                  disabled={busy || !text.trim()}
                  aria-label={t.send}
                  title={t.send}
                >
                  <Send size={18} />
                </button>
              </form>
            </>
          )}
        </section>
      )}
    </>
  );
}
