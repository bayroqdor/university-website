// Admin → Pochta serveri: institutning o'z pochta serveri (Stalwart) bilan bog'lanish, hisoblarni avtomatik yaratish, tekshiruv
import { copyOrPrompt } from "../../lib/clipboard";
import {
  CheckCircle2,
  PlugZap,
  RefreshCw,
  Save,
  Server,
  ShieldCheck,
  UsersRound,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { mailAdmin, type DnsInfo, type MailAdmin } from "../../mail/api";
import { Copy, Globe } from "lucide-react";
import {
  Btn,
  Card,
  Field,
  Input,
  PageHead,
  Pill,
  Select,
  Spinner,
  Toggle,
  useRun,
} from "../ui";

type Cfg = Record<string, string | number | boolean>;
const SEC = [
  { value: "ssl", label: "SSL/TLS" },
  { value: "starttls", label: "STARTTLS" },
  { value: "none", label: "Yo‘q" },
];

export function MailServerPage() {
  const run = useRun();
  const [d, setD] = useState<MailAdmin | null>(null);
  const [c, setC] = useState<Cfg>({});
  const [secrets, setSecrets] = useState({
    master_password: "",
    stalwart_password: "",
    stalwart_token: "",
  });
  const [busy, setBusy] = useState<"" | "save" | "test" | "sync">("");
  const [checks, setChecks] = useState<
    { name: string; ok: boolean; detail: string }[] | null
  >(null);
  const apply = (r: MailAdmin) => {
    setD(r);
    setC(r.config);
  };
  const load = useCallback(() => {
    mailAdmin.get().then(apply);
  }, []);
  useEffect(load, [load]);
  useEffect(() => {
    if (!d?.state.running) return;
    const id = window.setInterval(
      () => mailAdmin.get().then((r) => setD(r)),
      1500,
    );
    return () => window.clearInterval(id);
  }, [d?.state.running]);
  if (!d) return <Spinner />;
  const set = (p: Cfg) => setC({ ...c, ...p });
  const s = (k: string) => String(c[k] ?? "");
  const n = (k: string) => Number(c[k] ?? 0);
  const payload = () => {
    const out: Record<string, unknown> = { ...c };
    for (const [k, v] of Object.entries(secrets)) if (v) out[k] = v;
    for (const k of Object.keys(out)) if (k.startsWith("has_")) delete out[k];
    return out;
  };
  const save = async () => {
    setBusy("save");
    const r = await run(() => mailAdmin.save(payload()), "Saqlandi");
    if (r) {
      apply(r);
      setSecrets({
        master_password: "",
        stalwart_password: "",
        stalwart_token: "",
      });
    }
    setBusy("");
  };
  const test = async () => {
    setBusy("test");
    const saved = await run(() => mailAdmin.save(payload()));
    if (saved) apply(saved);
    const r = await run(() => mailAdmin.test());
    if (r) setChecks(r.checks);
    setBusy("");
  };
  const sync = async () => {
    setBusy("sync");
    const r = await run(() => mailAdmin.sync(), "Sinxronlash boshlandi");
    if (r) setD(r);
    setBusy("");
  };
  const st = d.state;
  const pct = st.total ? Math.round((st.done / st.total) * 100) : 0;
  const stalwart = s("provision") === "stalwart";
  return (
    <div className="a-page narrow">
      <PageHead
        title="Pochta serveri"
        sub="Har bir xodim va talabaga institut manzili (login@domen): kabinetda «Pochta» bo‘limi — kiruvchi, yuborilgan, qoralamalar, spam, savat, arxiv"
        actions={
          <Btn
            kind="primary"
            icon={<Save size={15} />}
            busy={busy === "save"}
            onClick={save}
          >
            Saqlash
          </Btn>
        }
      />

      <Card
        title={
          <span className="with-ic">
            <Server size={17} /> Holat{" "}
            {d.ready ? (
              <Pill tone="ok">yoqilgan</Pill>
            ) : (
              <Pill tone="warn">o‘chirilgan</Pill>
            )}
          </span>
        }
        sub={`Manzillar: login@${s("domain") || "domen"} · faol foydalanuvchilar: ${d.users}`}
        actions={
          <>
            <Btn
              icon={<PlugZap size={15} />}
              busy={busy === "test"}
              onClick={test}
            >
              Ulanishni tekshirish
            </Btn>
            {stalwart && (
              <Btn
                icon={<UsersRound size={15} />}
                busy={busy === "sync" || st.running}
                onClick={sync}
                disabled={!d.ready}
              >
                Hisoblarni sinxronlash
              </Btn>
            )}
          </>
        }
      >
        <div className="a-form-grid">
          <Toggle
            checked={!!c.enabled}
            onChange={(v) => set({ enabled: v })}
            label="Pochtani yoqish"
            hint="Yoqilgach, kabinetlar va admin panelda «Pochta» bo‘limi ishlaydi"
          />
          <Field
            label="Pochta domeni"
            hint="Masalan: example.edu — manzillar j.doe@example.edu ko‘rinishida bo‘ladi"
          >
            <Input
              value={s("domain")}
              onChange={(e) => set({ domain: e.target.value })}
              placeholder="example.edu"
            />
          </Field>
        </div>
        {checks && (
          <div className="mail-checks">
            {checks.map((x) => (
              <div key={x.name} className={x.ok ? "ok" : "bad"}>
                {x.ok ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
                <b>{x.name}</b>
                <span>{x.detail}</span>
              </div>
            ))}
          </div>
        )}
        {(st.running || st.finished) && stalwart && (
          <div className="mail-sync">
            <div className="mail-bar">
              <i style={{ width: `${st.running ? pct : 100}%` }} />
            </div>
            <small>
              {st.running
                ? `Sinxronlanmoqda: ${st.done} / ${st.total}`
                : `Oxirgi sinxronlash: ${st.finished} · ${st.total - 1} ta hisob`}
              {st.errors > 0 && ` · xatolar: ${st.errors}`}
            </small>
          </div>
        )}
      </Card>

      <Card
        title="IMAP va SMTP"
        sub="Veb-pochta xatlarni IMAP orqali o‘qiydi va SMTP orqali yuboradi. Docker’da: xost «mail», IMAP 993 (SSL), SMTP 465 (SSL) — avtomatik sozlanadi"
      >
        <div className="a-form-grid">
          <div className="a-grid3">
            <Field label="IMAP xost">
              <Input
                value={s("imap_host")}
                onChange={(e) => set({ imap_host: e.target.value })}
                placeholder="mail"
              />
            </Field>
            <Field label="Port">
              <Input
                type="number"
                value={n("imap_port")}
                onChange={(e) => set({ imap_port: Number(e.target.value) })}
              />
            </Field>
            <Field label="Himoya">
              <Select
                value={s("imap_security") as "ssl"}
                onChange={(v) => set({ imap_security: v })}
                options={SEC as { value: "ssl"; label: string }[]}
              />
            </Field>
          </div>
          <div className="a-grid3">
            <Field label="SMTP xost">
              <Input
                value={s("smtp_host")}
                onChange={(e) => set({ smtp_host: e.target.value })}
                placeholder="mail"
              />
            </Field>
            <Field label="Port">
              <Input
                type="number"
                value={n("smtp_port")}
                onChange={(e) => set({ smtp_port: Number(e.target.value) })}
              />
            </Field>
            <Field label="Himoya">
              <Select
                value={s("smtp_security") as "ssl"}
                onChange={(v) => set({ smtp_security: v })}
                options={SEC as { value: "ssl"; label: string }[]}
              />
            </Field>
          </div>
          <Toggle
            checked={!!c.tls_verify}
            onChange={(v) => set({ tls_verify: v })}
            label="TLS sertifikatini tekshirish"
            hint="Ichki tarmoqda o‘z-o‘zidan imzolangan sertifikat bo‘lsa o‘chiring"
          />
        </div>
      </Card>

      <Card
        title={
          <span className="with-ic">
            <ShieldCheck size={17} /> Xizmat hisobi
          </span>
        }
        sub="Veb-pochta foydalanuvchi parollarini saqlamaydi: xizmat hisobi foydalanuvchi nomidan kiradi (Stalwart: «impersonate» huquqi). Hisob sinxronlashda avtomatik yaratiladi."
      >
        <div className="a-form-grid">
          <div className="a-grid2">
            <Field label="Xizmat hisobi" hint="masalan webmail@example.edu">
              <Input
                value={s("master_user")}
                onChange={(e) => set({ master_user: e.target.value })}
              />
            </Field>
            <Field
              label="Paroli"
              hint={
                c.has_master_password
                  ? "o‘rnatilgan — o‘zgartirish uchun yangisini yozing"
                  : "o‘rnatilmagan"
              }
            >
              <Input
                type="password"
                autoComplete="new-password"
                value={secrets.master_password}
                onChange={(e) =>
                  setSecrets({ ...secrets, master_password: e.target.value })
                }
                placeholder={c.has_master_password ? "••••••••" : ""}
              />
            </Field>
          </div>
          <Field
            label="Kirish formati"
            hint="Stalwart: {address}%{master} · Dovecot: {address}*{master} · test serverlar: {local}"
          >
            <Input
              value={s("login_format")}
              onChange={(e) => set({ login_format: e.target.value })}
            />
          </Field>
        </div>
      </Card>

      <Card
        title="Hisoblarni avtomatik boshqarish"
        sub="Foydalanuvchi qo‘shilsa, Excel’dan import qilinsa, login yoki parol o‘zgarsa yoki o‘chirilsa — pochta serveridagi hisob ham shunga mos o‘zgaradi"
      >
        <div className="a-form-grid">
          <Field label="Rejim">
            <Select
              value={s("provision") as "stalwart"}
              onChange={(v) => set({ provision: v })}
              options={
                [
                  {
                    value: "stalwart",
                    label: "Stalwart Mail Server (JMAP boshqaruv API)",
                  },
                  {
                    value: "none",
                    label: "Qo‘lda (hisoblar serverda alohida yaratiladi)",
                  },
                ] as { value: "stalwart"; label: string }[]
              }
            />
          </Field>
          {stalwart && (
            <>
              <Field
                label="Stalwart manzili"
                hint="Docker’da: http://mail:8080"
              >
                <Input
                  value={s("stalwart_url")}
                  onChange={(e) => set({ stalwart_url: e.target.value })}
                />
              </Field>
              <div className="a-grid2">
                <Field label="Administrator logini">
                  <Input
                    value={s("stalwart_user")}
                    onChange={(e) => set({ stalwart_user: e.target.value })}
                  />
                </Field>
                <Field
                  label="Paroli"
                  hint={
                    c.has_stalwart_password ? "o‘rnatilgan" : "o‘rnatilmagan"
                  }
                >
                  <Input
                    type="password"
                    autoComplete="new-password"
                    value={secrets.stalwart_password}
                    onChange={(e) =>
                      setSecrets({
                        ...secrets,
                        stalwart_password: e.target.value,
                      })
                    }
                    placeholder={c.has_stalwart_password ? "••••••••" : ""}
                  />
                </Field>
              </div>
              <Field
                label="yoki API kaliti (Bearer)"
                hint={
                  c.has_stalwart_token
                    ? "o‘rnatilgan"
                    : "ixtiyoriy — berilsa login/parol o‘rniga ishlatiladi"
                }
              >
                <Input
                  type="password"
                  autoComplete="off"
                  value={secrets.stalwart_token}
                  onChange={(e) =>
                    setSecrets({ ...secrets, stalwart_token: e.target.value })
                  }
                />
              </Field>
            </>
          )}
          <div className="a-grid2">
            <Field
              label="Quti hajmi (MB)"
              hint="0 — cheklovsiz (yangi hisoblarga)"
            >
              <Input
                type="number"
                value={n("quota_mb")}
                onChange={(e) => set({ quota_mb: Number(e.target.value) })}
              />
            </Field>
            <Field
              label="Ilovalar chegarasi (MB)"
              hint="bitta xatdagi fayllar jami"
            >
              <Input
                type="number"
                value={n("max_attach_mb")}
                onChange={(e) => set({ max_attach_mb: Number(e.target.value) })}
              />
            </Field>
          </div>
        </div>
      </Card>

      <Card
        title="Telefon va Thunderbird uchun"
        sub="Foydalanuvchilar pochta sahifasida ko‘radi. Login — to‘liq manzil, parol — kabinet paroli (parol o‘rnatilganda serverga ham yuboriladi)"
      >
        <div className="a-grid2">
          <Field label="IMAP (tashqi)" hint="masalan: mail.example.edu:993 (SSL)">
            <Input
              value={s("public_imap")}
              onChange={(e) => set({ public_imap: e.target.value })}
            />
          </Field>
          <Field
            label="SMTP (tashqi)"
            hint="masalan: mail.example.edu:465 (SSL)"
          >
            <Input
              value={s("public_smtp")}
              onChange={(e) => set({ public_smtp: e.target.value })}
            />
          </Field>
        </div>
      </Card>

      <DnsCard host={s("mail_host")} ip={s("server_ip")} onHost={(v) => set({ mail_host: v })} onIp={(v) => set({ server_ip: v })} onSave={save} />

      <Card title="Qanday ishga tushiriladi" pad>
        <ol className="mail-steps">
          <li>
            <code>docker compose up -d</code> — sayt bilan birga <b>Stalwart</b> pochta serveri ham ishga tushadi (ochiq kodli, IMAP/SMTP/JMAP, spam
            filtri, DKIM).
          </li>
          <li>
            Pochta serveri o‘zini <b>avtomatik sozlaydi</b>: server nomi, domen, DKIM kalitlari va administrator paroli (umumiy volume’da). Sayt shu parolni
            o‘zi o‘qiydi — bu sahifada hech narsa kiritish shart emas.
          </li>
          <li>Sayt xizmat hisobini va barcha xodim, o‘qituvchi va talabalar qutilarini o‘zi yaratadi; yangi foydalanuvchi qo‘shilganda qutisi darhol ochiladi.</li>
          <li>
            DNS: <code>MX</code> → mail.{s("domain") || "example.edu"}, SPF, DKIM va DMARC yozuvlari (yuqoridagi DNS bo‘limi), 25/465/993 portlarni oching.
          </li>
        </ol>
      </Card>

      {d.log.length > 0 && (
        <Card
          title="Jurnal"
          sub="Pochta serveridagi oxirgi amallar"
          actions={
            <Btn size="sm" icon={<RefreshCw size={14} />} onClick={load}>
              Yangilash
            </Btn>
          }
        >
          <div className="mail-log">
            {d.log.map((x, i) => (
              <div key={i} className={x.ok ? "ok" : "bad"}>
                {x.ok ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
                <time>{x.ts}</time>
                <b>{x.what}</b>
                {x.detail && <span>{x.detail}</span>}
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}


const HOSTING_TIPS: Record<string, string> = {
  A: "Turi: A · Nom (Host): mail · Qiymat (IPv4): server IP. Cloudflare’da bulutchani o‘chiring (DNS only) — aks holda pochta ishlamaydi.",
  MX: "Turi: MX · Nom: @ (yoki bo‘sh) · Pochta serveri (Mail server / Value): mail.domen · Prioritet: 10.",
  TXT: "Turi: TXT · Nom: jadvaldagi «Nom» ustuni · Qiymat: qo‘shtirnoqsiz, bitta qatorda to‘liq nusxalang.",
  CNAME: "Turi: CNAME · Nom: jadvaldagi nom · Maqsad (Target): mail.domen.",
  SRV: "Turi: SRV · Xizmat: _imaps / _submissions · Protokol: _tcp · Prioritet 0 · Og‘irlik (Weight) 1 · Port · Maqsad: mail.domen.",
  CAA: "Turi: CAA · Nom: @ · Flag: 0 · Teg (Tag): issue · Qiymat: letsencrypt.org.",
};

function CopyBtn({ text }: { text: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      className={`dns-copy ${ok ? "ok" : ""}`}
      title="Nusxa olish"
      onClick={() => {
        copyOrPrompt(text, "Nusxa olish").then((done) => {
          if (!done) return;
          setOk(true);
          window.setTimeout(() => setOk(false), 1300);
        });
      }}
    >
      {ok ? <CheckCircle2 size={14} /> : <Copy size={14} />}
    </button>
  );
}

/** Hosting panelga kiritiladigan DNS yozuvlari: domen va sozlamalardan; DKIM — Stalwart’dan */
function DnsCard({ host, ip, onHost, onIp, onSave }: { host: string; ip: string; onHost: (v: string) => void; onIp: (v: string) => void; onSave: () => Promise<void> }) {
  const [dmarc, setDmarc] = useState("quarantine");
  const [all, setAll] = useState(false);
  const [d, setD] = useState<DnsInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => mailAdmin.dns(dmarc).then(setD).catch(() => setD(null)), [dmarc]);
  useEffect(() => {
    load();
  }, [load]);
  const recs = (d?.records || []).filter((r) => all || r.required);
  return (
    <Card
      title={
        <span className="with-ic">
          <Globe size={17} /> DNS yozuvlari
        </span>
      }
      sub="Domen hostingi panelida (ahost, Cloudflare, cPanel, reg.uz…) shu yozuvlarni qo‘shing. Har bir katakdagi tugma — nusxa olish. «Nom» ustuni panelning «Host / Name» maydoniga, «Qiymat» — «Value / Content» maydoniga yoziladi."
      actions={
        <Btn size="sm" icon={<RefreshCw size={14} />} busy={busy} onClick={async () => { setBusy(true); await onSave(); await load(); setBusy(false); }}>
          Saqlab yangilash
        </Btn>
      }
    >
      <div className="a-form-grid">
        <div className="a-grid3">
          <Field label="Pochta serveri nomi" hint="MX shu nomga yo‘naltiriladi">
            <Input value={host} onChange={(e) => onHost(e.target.value)} placeholder="mail.example.edu" />
          </Field>
          <Field label="Server IP manzili" hint="A yozuvi uchun (IPv4)">
            <Input value={ip} onChange={(e) => onIp(e.target.value)} placeholder="203.0.113.10" />
          </Field>
          <Field label="DMARC siyosati" hint="avval «quarantine», hammasi ishlagach «reject»">
            <Select
              value={dmarc as "quarantine"}
              onChange={(v) => setDmarc(v)}
              options={[
                { value: "none", label: "none — faqat kuzatish" },
                { value: "quarantine", label: "quarantine — spamga" },
                { value: "reject", label: "reject — rad etish" },
              ] as { value: "quarantine"; label: string }[]}
            />
          </Field>
        </div>
      </div>
      {d && (
        <>
          <div className="dns-meta">
            {d.source === "stalwart" ? <Pill tone="ok">DKIM kalitlari Stalwart’dan olindi</Pill> : <Pill tone="warn">DKIM — Stalwart ulanganidan keyin chiqadi</Pill>}
            {d.error && <Pill tone="bad">{d.error}</Pill>}
            <label className="chk">
              <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> Tavsiya etiladigan yozuvlarni ham ko‘rsatish (SRV, MTA-STS, autoconfig, CAA)
            </label>
          </div>
          <div className="dns-table-wrap">
            <div className="a-table-scroll">
              <table className="a-table dns-table">
                <thead>
                  <tr>
                    <th>Turi</th>
                    <th>Nom (Host)</th>
                    <th>Qiymat (Value)</th>
                    <th>Prioritet</th>
                    <th>TTL</th>
                  </tr>
                </thead>
                <tbody>
                  {recs.map((r, i) => (
                    <tr key={i} className={r.placeholder ? "warn" : ""}>
                      <td>
                        <Pill tone={r.required ? "accent" : "muted"}>{r.type}</Pill>
                      </td>
                      <td>
                        <span className="dns-cell">
                          <code>{r.host}</code>
                          <CopyBtn text={r.host} />
                        </span>
                      </td>
                      <td>
                        <span className="dns-cell">
                          <code className="dns-val">{r.value}</code>
                          <CopyBtn text={r.value} />
                        </span>
                        <small className="dns-why">{r.why}</small>
                      </td>
                      <td className="mono">{r.priority ?? "—"}</td>
                      <td className="mono">{r.ttl}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <details className="dns-help">
            <summary>Hosting panelda qanday kiritiladi?</summary>
            <ul>
              {Object.entries(HOSTING_TIPS).map(([k, v]) => (
                <li key={k}>
                  <b>{k}:</b> {v}
                </li>
              ))}
              <li>Ba’zi panellar nomga domenni o‘zi qo‘shadi: «_dmarc» deb yozing, «_dmarc.{d.domain}» emas. Ildiz (domenning o‘zi) uchun «@» yoki bo‘sh qoldiring.</li>
              <li>TXT qiymati 255 belgidan uzun bo‘lsa (RSA DKIM), ko‘pchilik panellar uni o‘zi bo‘ladi — qiymatni to‘liq bitta qatorda kiriting.</li>
              <li>Teskari DNS (PTR) — server IP manzili uchun {d.mail_host} nomini hosting/VPS provayderingizdan so‘rang; busiz Gmail xatlarni spamga tushirishi mumkin.</li>
              <li>O‘zgarishlar 5 daqiqadan 24 soatgacha tarqaladi. Tekshirish: <code>nslookup -type=mx {d.domain}</code></li>
            </ul>
          </details>
          <details className="dns-help">
            <summary>Zona fayli (BIND) — barcha yozuvlar birdaniga</summary>
            <div className="dns-zone">
              <CopyBtn text={d.zone} />
              <pre>{d.zone}</pre>
            </div>
          </details>
        </>
      )}
    </Card>
  );
}
