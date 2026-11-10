// Foydalanuvchi surati (bo'lmasa — ism bosh harfi, tekis fon). Kabinet, admin panel va pochtada bir xil.
// Fon ranglari — sayt palitrasidagi sokin to'q tuslar (ko'k, yashil, oltin, kulrang), oq harf bilan o'qiladi.
const COLORS = ["#0a2e73", "#1e4a38", "#7d6120", "#2b5a94", "#4a5263", "#163b85", "#2f5d4a", "#5a4a7a"];

export function Avatar({ name, photo, size = 36, className = "" }: { name?: string; photo?: string | null; size?: number; className?: string }) {
  const n = (name || "?").trim();
  if (photo) return <img className={`av ${className}`} src={photo} alt="" width={size} height={size} style={{ width: size, height: size }} loading="lazy" />;
  let h = 0;
  for (const ch of n) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return (
    <span className={`av ph ${className}`} style={{ width: size, height: size, background: COLORS[h % COLORS.length], fontSize: Math.round(size * 0.42) }} aria-hidden="true">
      {n.slice(0, 1).toUpperCase()}
    </span>
  );
}

export default Avatar;
