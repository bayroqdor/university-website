// Profil → Telegram: botni kabinetga bog'lash (bir martalik havola + QR, zaxira 6 xonali kod), holat va uzish
import { KeyRound, Send, Unlink } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Btn, Card, fmtDateTime, useConfirm, useRun, useToast } from "../../admin/ui";
import { tg, type TgLink, type TgStatus } from "../api";
import { usePortal } from "../PortalApp";

const TL: Record<string, Record<string, string>> = {
  uz: { connect: "Telegram’ni ulash", by_code: "Kod orqali", code: "Kod", open: "Telegram’ni ochish", account: "Akkaunt", username: "Foydalanuvchi nomi",
        linked: "Ulangan", unlink: "Uzish", unlink_q: "Telegram uzilsinmi?", done: "Telegram ulandi", off: "Telegram uzildi", left: "Qoldi" },
  ru: { connect: "Подключить Telegram", by_code: "По коду", code: "Код", open: "Открыть Telegram", account: "Аккаунт", username: "Имя пользователя",
        linked: "Подключён", unlink: "Отключить", unlink_q: "Отключить Telegram?", done: "Telegram подключён", off: "Telegram отключён", left: "Осталось" },
  en: { connect: "Connect Telegram", by_code: "With a code", code: "Code", open: "Open Telegram", account: "Account", username: "Username",
        linked: "Connected", unlink: "Disconnect", unlink_q: "Disconnect Telegram?", done: "Telegram connected", off: "Telegram disconnected", left: "Left" },
};

const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

export function TelegramCard() {
  const { lang } = usePortal();
  const L = TL[lang] || TL.uz;
  const run = useRun();
  const toast = useToast();
  const confirm = useConfirm();
  const [st, setSt] = useState<TgStatus | null>(null);
  const [link, setLink] = useState<TgLink | null>(null);
  const [left, setLeft] = useState(0);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => tg.status().then(setSt).catch(() => setSt(null)), []);
  useEffect(() => {
    load();
  }, [load]);

  // havola / kod amal qilayotganda: har 3 soniyada holat (ulangach karta o'zi yangilanadi) va qolgan vaqt
  useEffect(() => {
    if (!link) return;
    const end = Date.parse(link.expires);
    const tick = () => {
      const s = Math.max(0, Math.round((end - Date.now()) / 1000));
      setLeft(s);
      if (!s) setLink(null);
    };
    tick();
    const t1 = window.setInterval(tick, 1000);
    const t2 = window.setInterval(() => {
      if (document.hidden) return;
      tg.status()
        .then((r) => {
          setSt(r);
          if (r.linked) {
            setLink(null);
            toast(L.done);
          }
        })
        .catch(() => undefined);
    }, 3000);
    return () => {
      window.clearInterval(t1);
      window.clearInterval(t2);
    };
  }, [link, toast, L.done]);

  const start = async (open: boolean) => {
    // brauzer yangi oynani bloklamasligi uchun — bosish paytida ochiladi, manzil javobdan keyin beriladi
    const w = open ? window.open("about:blank", "_blank") : null;
    setBusy(true);
    const r = await run(() => tg.link());
    setBusy(false);
    if (!r) {
      w?.close();
      return;
    }
    setLink(r);
    if (w) w.location.href = r.url;
  };

  if (!st || !st.bot) return null;
  const u = st.linked;
  return (
    <Card title={<span className="pp-ct"><Send size={17} /> Telegram</span>} className="tgc">
      {u ? (
        <>
          <div className="pf-row">
            <span>{L.account}</span>
            <b>{u.name || "—"}</b>
          </div>
          <div className="pf-row">
            <span>{L.username}</span>
            <b>{u.username ? `@${u.username}` : "—"}</b>
          </div>
          <div className="pf-row">
            <span>{L.linked}</span>
            <b>{fmtDateTime(u.linked)}</b>
          </div>
          <div className="tgc-actions">
            <Btn
              icon={<Unlink size={15} />}
              onClick={async () => {
                if (!(await confirm(L.unlink_q))) return;
                const r = await run(() => tg.unlink(), L.off);
                if (r) setSt({ ...st, linked: null });
              }}
            >
              {L.unlink}
            </Btn>
          </div>
        </>
      ) : link ? (
        <div className="tgc-pending">
          <div className="tgc-row">
            <img className="tgc-qr" src={`data:image/svg+xml;utf8,${encodeURIComponent(link.qr)}`} alt="QR" width={132} height={132} />
            <div className="tgc-side">
              <div className="tgc-code">
                <span>{L.code}</span>
                <b>{`${link.code.slice(0, 3)} ${link.code.slice(3)}`}</b>
              </div>
              <div className="tgc-left">
                <span>{L.left}</span>
                <b>{mmss(left)}</b>
              </div>
            </div>
          </div>
          <div className="tgc-actions">
            <a className="a-btn primary md" href={link.url} target="_blank" rel="noopener noreferrer">
              <Send size={15} />
              <span>{L.open}</span>
            </a>
          </div>
        </div>
      ) : (
        <div className="tgc-actions">
          <Btn kind="primary" icon={<Send size={15} />} busy={busy} onClick={() => start(true)}>
            {L.connect}
          </Btn>
          <Btn icon={<KeyRound size={15} />} disabled={busy} onClick={() => start(false)}>
            {L.by_code}
          </Btn>
        </div>
      )}
    </Card>
  );
}
