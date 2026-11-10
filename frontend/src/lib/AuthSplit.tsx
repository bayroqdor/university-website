// Kirish sahifasi: chapda oq forma, o'ngda tekis ko'k panel — xush kelibsiz matni va tugma (sayt uslubida, Onest, 2px).
import type { ReactNode } from "react";
import "../styles/matdash.css";
import { BrandMark } from "./brand";

export function AuthSplit({
  title,
  sub,
  children,
  foot,
  top,
  welcome,
  text,
  more,
}: {
  title: string;
  sub?: string;
  children: ReactNode;
  foot?: ReactNode;
  top?: ReactNode;
  welcome: string;
  text?: string;
  more?: { href: string; label: string };
}) {
  return (
    <div className="md-auth">
      <main className="md-auth-form">
        {top && <div className="md-auth-top">{top}</div>}
        <div className="md-auth-inner">
          <a href="/" className="md-auth-logo" aria-label="Home">
            <BrandMark size={52} />
          </a>
          <h1 className="md-auth-h">{title}</h1>
          {sub && <p className="md-auth-sub">{sub}</p>}
          {children}
          {foot && <div className="md-auth-foot">{foot}</div>}
        </div>
      </main>
      <aside className="md-auth-side" aria-hidden={!more}>
        <div className="md-auth-copy">
          <h2>{welcome}</h2>
          {text && <p>{text}</p>}
          {more && (
            <a className="md-auth-more" href={more.href}>
              <span>{more.label}</span>
            </a>
          )}
        </div>
      </aside>
    </div>
  );
}
