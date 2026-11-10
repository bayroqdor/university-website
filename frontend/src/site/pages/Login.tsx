import { Eye, EyeOff } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ApiError, auth } from "../../lib/api";
import { AuthSplit } from "../../lib/AuthSplit";
import { useSite } from "../../lib/site";

export function LoginPage() {
  const { t, data } = useSite();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const raw = params.get("next") || "";
  // test (/t/…) yoki «Bilimdon» o'yini (/b/…) havolasidan kelgan bo'lsa — kirgandan keyin o'sha yerga qaytadi
  // kutubxona sahifalaridan (kitob, o'quvchi, pleyer — qaytish manzili «from» bilan; kabinetdagi kitob sahifasi) kelgan bo'lsa ham o'sha yerga qaytadi
  // ichki forum xabariga ulashilgan havola (/forum/<id>, ixtiyoriy #c-<izoh>) — kirgandan keyin o'sha xabarga
  const back =
    /^\/(t|b)\/[A-Za-z0-9]{3,12}$/.test(raw) || /^\/library(\/book\/[A-Za-z0-9_-]{4,40}|\/(read|listen)\/[A-Za-z0-9_-]{4,40}(\?from=[A-Za-z0-9%_.-]{1,300})?)?$/.test(raw) || /^\/(student|teacher|xodim)\/library\/book\/[A-Za-z0-9_-]{4,40}$/.test(raw) || /^\/forum\/[\w-]{1,40}(#c-[\w-]{1,40})?$/.test(raw) ? raw : "";
  // «Korporativ pochta» (next=mail) — kirgandan keyin kabinetdagi pochta; «Masofaviy ta'lim» (next=moodle) — kabinet
  const next = raw === "schedule" ? "/schedule" : raw === "mail" ? "/mail" : "";
  const [f, setF] = useState({ login: "", password: "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState(false);
  const go = (home: string) => nav(back && home !== "/admin" ? back : home === "/admin" ? (next === "/mail" ? "/admin/mail" : home) : `${home}${next}`, { replace: true });
  useEffect(() => {
    // allaqachon kirgan bo'lsa — o'z kabinetiga
    auth.me().then((r) => go(r.home)).catch(() => null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const r = await auth.login(f.login.trim(), f.password);
      go(r.home);
    } catch (e2) {
      const d = e2 instanceof ApiError ? e2.detail : "";
      setErr(d === "use_admin_login" || d === "invalid_credentials" ? t.err_credentials : d === "too_many_attempts" ? t.err_too_many : t.err_generic);
    }
    setBusy(false);
  };
  const { lang, setLang } = useSite();
  return (
    <AuthSplit
      title={t.login_title}
      sub={t.login_sub}
      welcome={data?.uni.name || data?.uni.abbr || "University"}
      text={t.login_help}
      more={{ href: "/", label: t.nav_home || "Home" }}
      top={
        <div className="md-auth-langs">
          {(["uz", "ru", "en"] as const).map((l) => (
            <button key={l} type="button" className={lang === l ? "on" : ""} onClick={() => setLang(l)}>
              {l.toUpperCase()}
            </button>
          ))}
        </div>
      }
    >
      <form className="md-auth-fields" onSubmit={submit}>
        {next === "/schedule" && <p className="md-auth-note">{t.schedule_login}</p>}
        {next === "/mail" && <p className="md-auth-note">{t.mail_login}</p>}
        {raw === "moodle" && <p className="md-auth-note">{t.moodle_login}</p>}
        <label className="a-field">
          <span className="a-label">{t.login_label}</span>
          <input className="a-input" required autoFocus value={f.login} onChange={(e) => setF({ ...f, login: e.target.value })} autoComplete="username" maxLength={120} />
        </label>
        <label className="a-field">
          <span className="a-label">{t.password}</span>
          <span className="md-pass">
            <input className="a-input" required type={show ? "text" : "password"} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} autoComplete="current-password" />
            <button type="button" onClick={() => setShow(!show)} aria-label={t.password}>
              {show ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </span>
        </label>
        {err && <p className="md-auth-err">{err}</p>}
        <button className="a-btn primary wide" disabled={busy}>
          {busy ? "…" : t.login_button}
        </button>
      </form>
    </AuthSplit>
  );
}
