// Ulashilgan forum havolasi /forum/<id>(#c-<izoh>): rolga bog'liq emas — kirgan foydalanuvchini o'z kabinetidagi mavzuga,
// kirmaganni esa kirish sahifasiga (qaytish manzili bilan) yo'naltiradi. Mazmun bu yerda ko'rsatilmaydi.
import { useEffect } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { auth } from "../lib/api";

export default function ForumLink() {
  const { id = "" } = useParams();
  const { hash } = useLocation();
  const nav = useNavigate();
  useEffect(() => {
    const pid = /^[\w-]{1,40}$/.test(id) ? id : "";
    const anchor = /^#c-[\w-]{1,40}$/.test(hash) ? hash : "";
    auth
      .me()
      .then((r) => nav(r.home === "/admin" ? "/admin/blog" : pid ? `${r.home}/blog/${pid}${anchor}` : `${r.home}/blog`, { replace: true }))
      .catch(() => nav(`/login?next=${encodeURIComponent(`/forum/${pid}${anchor}`)}`, { replace: true }));
  }, [id, hash, nav]);
  return <div className="page-loader"><span /></div>;
}
