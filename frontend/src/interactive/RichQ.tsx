// Savol / variant matni: oddiy matn + $…$ ichidagi formulalar (KaTeX) + rasm
import katex from "katex";
import "katex/dist/katex.min.css";
import { useMemo } from "react";

export function RichQ({ text, image, className = "", imgClass = "" }: { text: string; image?: string; className?: string; imgClass?: string }) {
  const parts = useMemo(() => {
    const out: { math: boolean; s: string }[] = [];
    const re = /\$\$([^$]+)\$\$|\$([^$\n]+)\$/g;
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text || ""))) {
      if (m.index > last) out.push({ math: false, s: text.slice(last, m.index) });
      out.push({ math: true, s: m[1] || m[2] });
      last = m.index + m[0].length;
    }
    if (last < (text || "").length) out.push({ math: false, s: text.slice(last) });
    return out;
  }, [text]);
  return (
    <span className={`rq ${className}`} data-no-tr>
      {parts.map((p, i) =>
        p.math ? (
          <span key={i} className="rq-math" dangerouslySetInnerHTML={{ __html: katex.renderToString(p.s, { throwOnError: false, displayMode: false }) }} />
        ) : (
          <span key={i}>{p.s}</span>
        ),
      )}
      {image && <img src={image} alt="" className={`rq-img ${imgClass}`} loading="lazy" />}
    </span>
  );
}
