// Admin → ONLYOFFICE: hujjat serveri ulanishi (standart: docker-compose'dagi «onlyoffice» konteyneri, sayt orqali proksi)
import { AlertTriangle, CheckCircle2, FileSpreadsheet, PlugZap } from "lucide-react";
import { useEffect, useState } from "react";
import { Btn, Card, Field, Input, PageHead, Pill, Spinner, Toggle, useRun, useToast } from "../admin/ui";
import { req } from "../lib/api";

interface OfficeTest {
  ok: boolean;
  health_ms: number;
  fetch_ms: number | null;
  convert_ms: number;
  problems: string[];
}

interface OfficeCfg {
  enabled: boolean;
  url: string;
  internal_url: string;
  app_url: string;
  has_secret: boolean;
}

export function OfficeSettingsPage() {
  const run = useRun();
  const toast = useToast();
  const [cfg, setCfg] = useState<OfficeCfg | null>(null);
  const [secret, setSecret] = useState("");
  const [test, setTest] = useState<"" | "…" | OfficeTest | string>("");
  useEffect(() => {
    req<{ config: OfficeCfg }>("GET", "/api/admin/office").then((r) => setCfg(r.config));
  }, []);
  if (!cfg) return <Spinner />;
  const set = (p: Partial<OfficeCfg>) => setCfg({ ...cfg, ...p });
  return (
    <div className="a-page">
      <PageHead
        title="ONLYOFFICE"
        sub="Word, Excel va PowerPoint hujjatlarini brauzerda ochish va tahrirlash: kabinet va admin panelidagi «Hujjatlar» ilovasi — yangi hujjat yaratish, yuklash va tahrirlash. Ochiq saytda ONLYOFFICE ishlatilmaydi: PDF sayt ichida tez ko‘rsatiladi, Word/Excel fayllari yuklab olinadi."
        actions={<Pill tone={cfg.enabled ? "ok" : "muted"}>{cfg.enabled ? "Yoqilgan" : "O‘chiq"}</Pill>}
      />
      <div className="a-grid2 top">
        <Card title="Hujjat serveri (Document Server)">
          <Toggle checked={cfg.enabled} onChange={(v) => set({ enabled: v })} label="ONLYOFFICE’dan foydalanish" hint="o‘chirilsa — kabinetdagi hujjatlar faqat yuklab olinadi" />
          <div className="a-form-grid" style={{ marginTop: 14 }}>
            <Field label="Brauzer uchun manzil" hint="standart: /office-ds — server sayt orqali proksilanadi (alohida domen shart emas); tashqi server: https://office.domen.uz" wide>
              <Input value={cfg.url} onChange={(e) => set({ url: e.target.value })} placeholder="/office-ds" />
            </Field>
            <Field label="Ichki manzil (sayt → server)" hint="docker-compose: http://onlyoffice">
              <Input value={cfg.internal_url} onChange={(e) => set({ internal_url: e.target.value })} placeholder="http://onlyoffice" />
            </Field>
            <Field label="Saytning ichki manzili (server → sayt)" hint="hujjat serveri faylni shu manzildan yuklaydi va saqlash xabarini yuboradi. Faqat ichki manzil (docker-compose: http://web:8000) — tashqi domen (https://…) hujjatlarni daqiqalab sekinlashtiradi">
              <Input value={cfg.app_url} onChange={(e) => set({ app_url: e.target.value })} placeholder="http://web:8000" />
            </Field>
            <Field label="JWT kaliti" hint={cfg.has_secret ? "kalit o‘rnatilgan (docker-compose’da avtomatik yaratiladi) — o‘zgartirish uchun yangisini kiriting" : "hujjat serveridagi JWT_SECRET bilan bir xil bo‘lishi kerak"} wide>
              <Input type="password" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder={cfg.has_secret ? "••••••••" : ""} autoComplete="new-password" />
            </Field>
          </div>
          <div className="a-row" style={{ marginTop: 16, gap: 10, display: "flex", flexWrap: "wrap" }}>
            <Btn
              kind="primary"
              onClick={async () => {
                const r = await run(() => req<{ config: OfficeCfg }>("PUT", "/api/admin/office", { ...cfg, ...(secret ? { secret } : {}) }));
                if (r) {
                  setCfg(r.config);
                  setSecret("");
                  toast("Saqlandi");
                }
              }}
            >
              Saqlash
            </Btn>
            <Btn
              icon={<PlugZap size={15} />}
              onClick={async () => {
                setTest("…");
                try {
                  setTest(await req<OfficeTest>("POST", "/api/admin/office/test"));
                } catch (e) {
                  setTest(String((e as { detail?: string }).detail || e));
                }
              }}
            >
              Ulanishni tekshirish
            </Btn>
            {test === "…" ? (
              <span className="a-hint">Tekshirilmoqda… (hujjat serveri saytdan sinov faylini yuklab olib, konvertatsiya qiladi)</span>
            ) : typeof test === "string" && test ? (
              <span className="a-hint">Javob yo‘q: {test} — server birinchi ishga tushishda 1–2 daqiqa tayyorlanadi</span>
            ) : null}
          </div>
          {test && typeof test === "object" && (
            <div className="oo-test">
              {test.ok ? (
                <span className="oo-test-ok">
                  <CheckCircle2 size={16} /> Hujjat serveri ishlayapti
                </span>
              ) : (
                <span className="oo-test-bad">
                  <AlertTriangle size={16} /> Hujjat serveri saytdan faylni ololmayapti — hujjatlar ochilmaydi yoki juda sekin ochiladi
                </span>
              )}
              <ul>
                <li>sayt → server: {test.health_ms} ms</li>
                <li>server → sayt (faylni yuklash): {test.fetch_ms == null ? "—" : `${test.fetch_ms} ms`}</li>
                <li>konvertatsiya: {test.convert_ms} ms</li>
              </ul>
              {test.problems.map((p) => (
                <p key={p} className="oo-test-bad">
                  {p}
                </p>
              ))}
            </div>
          )}
        </Card>
        <Card title="Qanday ishlaydi">
          <ul className="oo-how">
            <li>
              <FileSpreadsheet size={16} /><span><b>Saytda:</b> PDF havolalari sayt ichidagi ko‘ruvchida (pdf.js) darhol ochiladi, .docx, .xlsx, .pptx — yuklab olinadi. ONLYOFFICE mehmonlarga yuklanmaydi.</span>
            </li>
            <li>
              <FileSpreadsheet size={16} /><span><b>Kabinet va admin panelida:</b> Ilovalar → «Hujjatlar» — «Yaratish» bosilib turi tanlanadi (Hujjat, Jadval, Taqdimot) va darhol tahrirlagich ochiladi; o‘zgarishlar avtomatik saqlanadi, oxirgi 10 versiya serverda turadi.</span>
            </li>
            <li>
              <FileSpreadsheet size={16} /><span><b>Docker:</b> «onlyoffice» konteyneri JWT kalitini o‘zi yaratadi (office-secrets volume), sayt uni o‘qiydi — qo‘lda sozlash shart emas. Kamida ~2 GB bo‘sh xotira kerak.</span>
            </li>
          </ul>
        </Card>
      </div>
    </div>
  );
}
