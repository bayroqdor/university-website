import { Camera, Check, Copy, Download, Inbox, KeyRound, Link2, Mail, MailCheck, RefreshCw, Save, Send, Trash2, Upload, UserPlus, Users } from "lucide-react";
import { copyOrPrompt } from "../../lib/clipboard";
import { useCallback, useEffect, useRef, useState } from "react";
import { Avatar } from "../../lib/Avatar";
import { admin, type Admin, type EmailLog, type Media, type Message, type Newsletter, type Smtp, type Subscriber } from "../api";
import { Btn, Card, Empty, Field, Input, Modal, PageHead, Pill, Select, Spinner, Textarea, Toggle, fmtDateTime, fmtNum, useConfirm, useRun, useToast } from "../ui";
import { useSearchParams } from "react-router-dom";

/* ------------------------------------------------------------------ pochta (SMTP) */
const PRESETS: Record<string, Partial<Smtp>> = {
  gmail: { host: "smtp.gmail.com", port: 587, security: "starttls" },
  yandex: { host: "smtp.yandex.ru", port: 465, security: "ssl" },
  mailru: { host: "smtp.mail.ru", port: 465, security: "ssl" },
  outlook: { host: "smtp.office365.com", port: 587, security: "starttls" },
  zoho: { host: "smtp.zoho.com", port: 465, security: "ssl" },
};

export function EmailPage() {
  const run = useRun();
  const toast = useToast();
  const [s, setS] = useState<Smtp | null>(null);
  const [pw, setPw] = useState("");
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState<"" | "save" | "test">("");
  const [log, setLog] = useState<EmailLog[]>([]);
  const [nls, setNls] = useState<Newsletter[]>([]);
  const load = useCallback(() => {
    admin.smtp().then(setS);
    admin.emailLog().then((r) => setLog(r.items));
    admin.newsletters().then((r) => setNls(r.items));
  }, []);
  useEffect(load, [load]);
  if (!s) return <Spinner />;
  const set = (p: Partial<Smtp>) => setS({ ...s, ...p });
  const save = async () => {
    setBusy("save");
    const r = await run(() => admin.saveSmtp({ ...s, password: pw || undefined }), "SMTP saqlandi");
    if (r) {
      setS(r);
      setPw("");
    }
    setBusy("");
  };
  const test = async () => {
    setBusy("test");
    await run(() => admin.saveSmtp({ ...s, password: pw || undefined }));
    const r = await run(() => admin.testSmtp(to));
    if (r) {
      if (r.ok) toast("Sinov xati yuborildi — pochtangizni tekshiring");
      else toast(`Xato: ${r.error}`, "error");
    }
    setBusy("");
    load();
  };
  return (
    <div className="a-page narrow">
      <PageHead title="Pochta" sub="SMTP ulash, sinov xati, tarqatmalar tarixi va yuborish jurnali" />
      <Card
        title={
          <span className="with-ic">
            SMTP server {s.configured ? <Pill tone="ok">ulangan</Pill> : <Pill tone="warn">sozlanmagan</Pill>}
          </span>
        }
        sub="Obunani tasdiqlash, yangi maqola xatlari va aloqa bildirishnomalari shu orqali yuboriladi"
        actions={
          <Btn kind="primary" icon={<Save size={15} />} busy={busy === "save"} onClick={save}>
            Saqlash
          </Btn>
        }
      >
        <div className="presets">
          <span className="a-label">Tayyor sozlamalar:</span>
          {Object.keys(PRESETS).map((k) => (
            <button key={k} className="chip" onClick={() => set(PRESETS[k])}>
              {k}
            </button>
          ))}
        </div>
        <div className="a-form-grid">
          <Field label="Server (host)">
            <Input value={s.host} onChange={(e) => set({ host: e.target.value })} placeholder="smtp.gmail.com" />
          </Field>
          <div className="a-grid2">
            <Field label="Port">
              <Input type="number" value={s.port} onChange={(e) => set({ port: Number(e.target.value) })} />
            </Field>
            <Field label="Himoya">
              <Select value={s.security} onChange={(v) => set({ security: v })} options={[{ value: "starttls", label: "STARTTLS (587)" }, { value: "ssl", label: "SSL/TLS (465)" }, { value: "none", label: "Yo‘q" }]} />
            </Field>
          </div>
          <Field label="Login">
            <Input value={s.username} onChange={(e) => set({ username: e.target.value })} autoComplete="off" />
          </Field>
          <Field label="Parol" hint={s.has_password ? "parol saqlangan — o‘zgartirish uchun yangisini kiriting" : "Gmail uchun «App password» (ilova paroli) kerak"}>
            <Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder={s.has_password ? "••••••••" : ""} autoComplete="new-password" />
          </Field>
          <Field label="Jo‘natuvchi email">
            <Input value={s.from_email} onChange={(e) => set({ from_email: e.target.value })} placeholder="ism@domen.uz" />
          </Field>
          <Field label="Jo‘natuvchi nomi">
            <Input value={s.from_name} onChange={(e) => set({ from_name: e.target.value })} placeholder="Ism Familiya" />
          </Field>
          <Field label="Javob manzili (Reply-To)" hint="ixtiyoriy">
            <Input value={s.reply_to} onChange={(e) => set({ reply_to: e.target.value })} />
          </Field>
        </div>
        <Toggle checked={s.enabled} onChange={(v) => set({ enabled: v })} label="Email yuborish yoqilgan" />
        <div className="test-row">
          <Input value={to} onChange={(e) => setTo(e.target.value)} placeholder="Sinov xati uchun email" />
          <Btn icon={<Send size={15} />} busy={busy === "test"} disabled={!to} onClick={test}>
            Sinov xati
          </Btn>
        </div>
      </Card>
      <Card title="Tarqatmalar tarixi" sub="Maqolalar obunachilarga yuborilgan holatlar" pad={false}>
        <div className="a-table-scroll">
          <table className="a-table">
            <thead>
              <tr>
                <th>Mavzu</th>
                <th>Sana</th>
                <th className="n">Yuborildi</th>
                <th className="n">Xato</th>
                <th>Holat</th>
              </tr>
            </thead>
            <tbody>
              {nls.length === 0 && (
                <tr>
                  <td colSpan={5} className="muted">
                    Hali tarqatma yo‘q
                  </td>
                </tr>
              )}
              {nls.map((n) => (
                <tr key={n.id}>
                  <td>{n.subject}</td>
                  <td>{fmtDateTime(n.created)}</td>
                  <td className="n">
                    {n.sent}/{n.total}
                  </td>
                  <td className="n">{n.failed || "—"}</td>
                  <td>{n.status === "done" ? <Pill tone="ok">tugadi</Pill> : <Pill tone="info">yuborilmoqda</Pill>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Card title="Yuborish jurnali" sub="So‘nggi 200 ta xat" pad={false} actions={<Btn size="sm" kind="ghost" icon={<RefreshCw size={14} />} onClick={load} title="Yangilash" />}>
        <div className="scroll-table">
          <div className="a-table-scroll">
            <table className="a-table">
              <thead>
                <tr>
                  <th>Vaqt</th>
                  <th>Turi</th>
                  <th>Kimga</th>
                  <th>Holat</th>
                </tr>
              </thead>
              <tbody>
                {log.map((l) => (
                  <tr key={l.id}>
                    <td>{fmtDateTime(l.ts)}</td>
                    <td>{{ confirm: "Tasdiqlash", welcome: "Xush kelibsiz", newsletter: "Tarqatma", contact: "Aloqa", test: "Sinov", notice: "Bildirishnoma" }[l.kind] || l.kind}</td>
                    <td>{l.recipient}</td>
                    <td title={l.error}>{l.status === "sent" ? <Pill tone="ok">yuborildi</Pill> : l.status === "skipped" ? <Pill>SMTP yo‘q</Pill> : <Pill tone="bad">xato</Pill>}</td>
                  </tr>
                ))}
                {log.length === 0 && (
                  <tr>
                    <td colSpan={4} className="muted">
                      Jurnal bo‘sh
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ obunachilar */
const SUB_SOURCE: Record<string, string> = {
  footer: "Sayt (pastki qism)",
  site: "Sayt",
  retry: "Qayta obuna",
  resubscribe: "Qayta obuna",
  admin: "Admin qo‘shgan",
  import: "Import",
};

export function SubscribersPage() {
  const run = useRun();
  const confirm = useConfirm();
  const [items, setItems] = useState<Subscriber[] | null>(null);
  const [filter, setFilter] = useState("all");
  const [sp] = useSearchParams();
  const [q, setQ] = useState(sp.get("q") || "");
  useEffect(() => {
    const v = sp.get("q");
    if (v !== null) setQ(v);
  }, [sp]);
  const [addOpen, setAddOpen] = useState(false);
  const [emails, setEmails] = useState("");
  const load = useCallback(() => admin.subscribers().then((r) => setItems(r.items)), []);
  useEffect(() => {
    load();
  }, [load]);
  if (!items) return <Spinner />;
  const count = (s: string) => items.filter((x) => x.status === s).length;
  const shown = items.filter((x) => (filter === "all" || x.status === filter) && (!q || x.email.includes(q.toLowerCase())));
  return (
    <div className="a-page">
      <PageHead
        title="Obunachilar"
        sub="Yangi maqolalar haqida email oladiganlar"
        actions={
          <>
            <a className="a-btn ghost md" href="/api/admin/subscribers.csv">
              <Download size={15} />
              <span>CSV</span>
            </a>
            <Btn kind="accent" icon={<UserPlus size={15} />} onClick={() => setAddOpen(true)}>
              Qo‘shish
            </Btn>
          </>
        }
      />
      <div className="kpis three">
        <div className="kpi">
          <div className="kpi-v">{fmtNum(count("active"))}</div>
          <div className="kpi-l">Faol obunachilar</div>
        </div>
        <div className="kpi">
          <div className="kpi-v">{fmtNum(count("pending"))}</div>
          <div className="kpi-l">Tasdiqlanmagan</div>
        </div>
        <div className="kpi">
          <div className="kpi-v">{fmtNum(count("unsubscribed"))}</div>
          <div className="kpi-l">Bekor qilganlar</div>
        </div>
      </div>
      <div className="list-tools">
        <div className="a-seg">
          {[
            ["all", "Barchasi"],
            ["active", "Faol"],
            ["pending", "Kutilmoqda"],
            ["unsubscribed", "Bekor qilgan"],
          ].map(([k, l]) => (
            <button key={k} className={filter === k ? "on" : ""} onClick={() => setFilter(k)}>
              {l}
            </button>
          ))}
        </div>
        <label className="a-search">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Email bo‘yicha qidirish…" />
        </label>
      </div>
      <Card pad={false}>
        {shown.length === 0 ? (
          <Empty icon={<Users size={28} />} title="Obunachilar yo‘q" />
        ) : (
          <div className="a-table-scroll">
            <table className="a-table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Holat</th>
                  <th>Manba</th>
                  <th>Qo‘shilgan</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {shown.map((x) => (
                  <tr key={x.id}>
                    <td>
                      <b>{x.email}</b>
                      {x.name && <small className="muted"> · {x.name}</small>}
                    </td>
                    <td>{x.status === "active" ? <Pill tone="ok">faol</Pill> : x.status === "pending" ? <Pill tone="warn">tasdiqlanmagan</Pill> : <Pill>bekor qilgan</Pill>}</td>
                    <td className="muted">
                      {SUB_SOURCE[x.source || ""] || x.source || "—"}
                      {x.lang && <span className="lang-code">{x.lang.toUpperCase()}</span>}
                    </td>
                    <td>{fmtDateTime(x.created)}</td>
                    <td className="actions">
                      {x.status === "pending" && (
                        <button className="a-icon" title="Tasdiqlash xatini qayta yuborish" onClick={() => run(() => admin.resendConfirm(x.id), "Xat yuborildi")}>
                          <Mail size={15} />
                        </button>
                      )}
                      {x.status !== "active" ? (
                        <button className="a-icon" title="Faollashtirish" onClick={async () => { await run(() => admin.setSubscriber(x.id, "active")); load(); }}>
                          <Check size={15} />
                        </button>
                      ) : (
                        <button className="a-icon" title="Obunani to‘xtatish" onClick={async () => { await run(() => admin.setSubscriber(x.id, "unsubscribed")); load(); }}>
                          <MailCheck size={15} />
                        </button>
                      )}
                      <button className="a-icon danger" title="O‘chirish" onClick={async () => { if (await confirm(`${x.email} o‘chirilsinmi?`)) { await run(() => admin.deleteSubscriber(x.id)); load(); } }}>
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Obunachilarni qo‘shish"
        footer={
          <>
            <Btn onClick={() => setAddOpen(false)}>Bekor qilish</Btn>
            <Btn
              kind="primary"
              onClick={async () => {
                const r = await run(() => admin.addSubscribers(emails));
                if (r) {
                  setAddOpen(false);
                  setEmails("");
                  load();
                }
              }}
            >
              Qo‘shish
            </Btn>
          </>
        }
      >
        <Field label="Email manzillar" hint="Har qatorga bittadan yoki vergul bilan. Faqat roziligi bor odamlarni qo‘shing — ular darhol faol bo‘ladi.">
          <Textarea rows={7} value={emails} onChange={(e) => setEmails(e.target.value)} />
        </Field>
      </Modal>
    </div>
  );
}

/* ------------------------------------------------------------------ xabarlar */
export function MessagesPage() {
  const run = useRun();
  const confirm = useConfirm();
  const [items, setItems] = useState<Message[] | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const load = useCallback(() => admin.messages().then((r) => setItems(r.items)), []);
  useEffect(() => {
    load();
  }, [load]);
  if (!items) return <Spinner />;
  const cur = items.find((x) => x.id === sel) || null;
  const open = async (m: Message) => {
    setSel(m.id);
    if (!m.read) {
      await admin.markMessage(m.id, true).catch(() => null);
      setItems((l) => l && l.map((x) => (x.id === m.id ? { ...x, read: true } : x)));
    }
  };
  return (
    <div className="a-page">
      <PageHead title="Xabarlar" sub={`Aloqa formasidan kelgan xabarlar · ${items.filter((x) => !x.read).length} ta o‘qilmagan`} />
      {items.length === 0 ? (
        <Card>
          <Empty icon={<Inbox size={28} />} title="Hozircha xabar yo‘q" />
        </Card>
      ) : (
        <div className="inbox">
          <ul className="inbox-list">
            {items.map((m) => (
              <li key={m.id} className={`${m.read ? "" : "unread"} ${sel === m.id ? "on" : ""}`} onClick={() => open(m)}>
                <b>{m.name}</b>
                <span>{m.subject || m.body.slice(0, 60)}</span>
                <small>{fmtDateTime(m.created)}</small>
              </li>
            ))}
          </ul>
          <div className="inbox-view">
            {cur ? (
              <>
                <div className="inbox-head">
                  <div>
                    <h3>{cur.subject || "(mavzusiz)"}</h3>
                    <p>
                      <b>{cur.name}</b> &lt;{cur.email}&gt; · {fmtDateTime(cur.created)}
                    </p>
                  </div>
                  <div className="row">
                    <a className="a-btn primary md" href={`mailto:${cur.email}?subject=${encodeURIComponent("Re: " + (cur.subject || ""))}`}>
                      <Send size={15} />
                      <span>Javob berish</span>
                    </a>
                    <Btn kind="ghost" onClick={async () => { await admin.markMessage(cur.id, false); load(); }}>
                      O‘qilmagan
                    </Btn>
                    <Btn kind="danger" icon={<Trash2 size={15} />} onClick={async () => { if (await confirm("Xabar o‘chirilsinmi?")) { await run(() => admin.deleteMessage(cur.id)); setSel(null); load(); } }} title="O‘chirish" />
                  </div>
                </div>
                <div className="inbox-body">{cur.body}</div>
              </>
            ) : (
              <Empty icon={<Mail size={28} />} title="Xabarni tanlang" />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ media */
export function MediaPage() {
  const run = useRun();
  const confirm = useConfirm();
  const toast = useToast();
  const [items, setItems] = useState<Media[] | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const load = useCallback(() => admin.media().then((r) => setItems(r.items)), []);
  useEffect(() => {
    load();
  }, [load]);
  const upload = async (files: FileList | null) => {
    if (!files) return;
    setBusy(true);
    for (const f of Array.from(files)) await run(() => admin.upload(f));
    setBusy(false);
    load();
  };
  const total = (items || []).reduce((a, m) => a + m.size, 0);
  const [urls, setUrls] = useState<string | null>(null);
  const [urlBusy, setUrlBusy] = useState(false);
  const importUrls = async () => {
    if (!urls) return;
    const list = urls.split(/\s+/).map((x) => x.trim()).filter((x) => /^https?:\/\//.test(x));
    setUrlBusy(true);
    let ok = 0;
    for (const u of list) {
      const r = await run(() => admin.uploadFromUrl(u));
      if (r) ok++;
    }
    setUrlBusy(false);
    toast(`${ok} / ${list.length} fayl yuklandi`);
    setUrls(null);
    load();
  };
  return (
    <div className="a-page">
      <PageHead
        title="Media"
        sub={`${items?.length ?? 0} ta fayl · ${fmtNum(total / 1024 / 1024, 1)} MB`}
        actions={
          <>
            <Btn icon={<Link2 size={15} />} onClick={() => setUrls("")}>
              URL dan yuklash
            </Btn>
            <Btn kind="accent" icon={<Upload size={15} />} busy={busy} onClick={() => input.current?.click()}>
              Yuklash
            </Btn>
          </>
        }
      />
      <Modal
        open={urls !== null}
        onClose={() => setUrls(null)}
        title="URL dan yuklash"
        width={620}
        footer={
          <>
            <Btn onClick={() => setUrls(null)}>Bekor qilish</Btn>
            <Btn kind="primary" busy={urlBusy} disabled={!urls?.trim()} onClick={importUrls}>
              Yuklash
            </Btn>
          </>
        }
      >
        <p className="a-hint">Rasm yoki PDF havolalarini kiriting (har qatorga bitta) — Server fayllarni yuklab olib, media kutubxonaga qo‘shadi.</p>
        <Textarea rows={6} className="mono" value={urls || ""} onChange={(e) => setUrls(e.target.value)} placeholder={"https://example.uz/rasm.jpg\nhttps://example.uz/hujjat.pdf"} />
      </Modal>
      <input ref={input} type="file" hidden multiple accept="image/*,application/pdf,.docx,.xlsx,.pptx" onChange={(e) => upload(e.target.files)} />
      <div
        className="a-drop big"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          upload(e.dataTransfer.files);
        }}
      >
        <Upload size={20} />
        <b>Fayllarni shu yerga tashlang</b>
        <span>PNG, JPG, WEBP, GIF, PDF, DOCX, XLSX, PPTX · 15 MB gacha · katta rasmlar avtomatik kichraytiriladi</span>
      </div>
      {!items ? (
        <Spinner />
      ) : (
        <div className="media-grid">
          {items.map((m) => (
            <div key={m.id} className="media-card">
              <div className="media-prev">{m.mime.startsWith("image/") ? <img src={m.url} alt="" loading="lazy" /> : <span className="a-pdf">{m.filename.split(".").pop()?.toUpperCase()}</span>}</div>
              <div className="media-info">
                <b title={m.original}>{m.original}</b>
                <small>
                  {m.width ? `${m.width}×${m.height} · ` : ""}
                  {fmtNum(m.size / 1024)} KB
                </small>
              </div>
              <div className="media-actions">
                <button
                  className="a-icon"
                  title="Havolani nusxalash"
                  onClick={() => {
                    copyOrPrompt(window.location.origin + m.url, "Havolani nusxalash").then((ok) => ok && toast("Havola nusxalandi"));
                  }}
                >
                  <Copy size={14} />
                </button>
                <button className="a-icon danger" title="O‘chirish" onClick={async () => { if (await confirm("Fayl o‘chirilsinmi? U ishlatilgan sahifalarda ko‘rinmay qoladi.")) { await run(() => admin.deleteMedia(m.id)); load(); } }}>
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ hisob va administratorlar */
export function AccountPage({ me, onMe }: { me: Admin; onMe: (a: Admin) => void }) {
  const run = useRun();
  const [f, setF] = useState({ name: me.name, email: me.email || "", login: me.login });
  const [pw, setPw] = useState({ current: "", next: "" });
  const isAdmin = me.role_id === "superadmin";
  return (
    <div className="a-page narrow">
      <PageHead title="Hisob" sub="Shaxsiy ma’lumotlar, parol va zaxira nusxa. Boshqa administratorlar — «Administratorlar» bo‘limida." />
      <Card title="Surat" sub="Yuz aniq ko‘rinadigan portret: tizim yuzni tekshiradi (hayvon, manzara, guruh surati qabul qilinmaydi) va markazlab kesadi">
        <div className="face-photo">
          <Avatar name={me.name} photo={me.data?.photo} size={96} />
          <label className="a-btn md">
            <Camera size={15} />
            <span>{me.data?.photo ? "Suratni almashtirish" : "Surat yuklash"}</span>
            <input
              type="file"
              accept="image/*"
              hidden
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                const r = await run(() => admin.myPhoto(file), "Surat yangilandi");
                if (r) onMe({ ...me, data: r.data });
              }}
            />
          </label>
        </div>
      </Card>
      <Card
        title="Mening hisobim"
        actions={
          <Btn
            kind="primary"
            icon={<Save size={15} />}
            onClick={async () => {
              const r = await run(() => admin.updateMe(f), "Saqlandi");
              if (r) onMe(r.admin);
            }}
          >
            Saqlash
          </Btn>
        }
      >
        <div className="a-form-grid">
          <Field label="Ism">
            <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          </Field>
          <Field label="Login">
            <Input value={f.login} onChange={(e) => setF({ ...f, login: e.target.value })} />
          </Field>
          <Field label="Email" hint="login o‘rniga ham ishlatish mumkin">
            <Input value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
          </Field>
        </div>
      </Card>
      <Card title="Parolni o‘zgartirish">
        <div className="a-form-grid">
          <Field label="Joriy parol">
            <Input type="password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} autoComplete="current-password" />
          </Field>
          <Field label="Yangi parol" hint="kamida 8 belgi">
            <Input type="password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} autoComplete="new-password" />
          </Field>
        </div>
        <Btn
          icon={<KeyRound size={15} />}
          disabled={!pw.current || pw.next.length < 8}
          onClick={async () => {
            const r = await run(() => admin.password(pw.current, pw.next), "Parol o‘zgartirildi");
            if (r) setPw({ current: "", next: "" });
          }}
        >
          Parolni yangilash
        </Btn>
      </Card>
      {isAdmin && (
      <Card title="Zaxira nusxa" sub="Barcha kontent, institut profili, sozlamalar, foydalanuvchilar va o‘quv ma’lumotlari (JSON). Media fayllar — serverdagi /data/media papkasida.">
        <a className="a-btn md" href="/api/admin/export">
          <Download size={15} />
          <span>Yuklab olish</span>
        </a>
      </Card>
      )}
    </div>
  );
}
