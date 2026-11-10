// Shaxsiy ma'lumot yig'adigan formalar uchun rozilik qatori: maxfiylik siyosatiga havola (yuborish tugmasidan oldin, belgilash talab qilinmaydi)
import { Link } from "react-router-dom";
import { useSite } from "../../lib/site";
import "../../styles/official-consent.css";

const T = {
  uz: ["Yuborish orqali shaxsiy ma’lumotlaringiz ", "Maxfiylik siyosati", "ga muvofiq qayta ishlanishiga rozilik bildirasiz."],
  ru: ["Отправляя форму, вы соглашаетесь на обработку персональных данных в соответствии с ", "Политикой конфиденциальности", "."],
  en: ["By submitting, you agree that your personal data will be processed in accordance with the ", "Privacy policy", "."],
};

export const PRIVACY_PATH = "/about/maxfiylik-siyosati";

export function Consent({ className = "", dark = false }: { className?: string; dark?: boolean }) {
  const { lang } = useSite();
  const [a, b, c] = T[lang] || T.uz;
  return (
    <p className={`of-consent ${dark ? "on-dark" : ""} ${className}`}>
      {a}
      <Link to={PRIVACY_PATH}>{b}</Link>
      {c}
    </p>
  );
}
