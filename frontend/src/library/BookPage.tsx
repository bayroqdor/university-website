// Kitob sahifasi: to'liq ma'lumot, formatlar bo'yicha tugmalar (O'qish / Tinglash / Bron), nusxalar holati, baho va izohlar, tavsiyalar.
// Bir xil tana (BookBody) ochiq saytda (/library/book/:id) va kabinet ichida (/student/library/book/:id …) ishlatiladi.
import { ArrowLeft, BookOpen, CalendarClock, CheckCircle2, Clock, Flag, GraduationCap, Headphones, Lock, MessageSquare, Reply, ThumbsUp, Trash2, Users } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { useSite } from "../lib/site";
import { lib, type BookView, type LibFile, type Review } from "./api";
import { AvailLine, canRead, Cover, errText, f, filePublic, FmtBadges, fmtDate, LibLang, Shelfbar, ShelfButton, Stars, useLang, useLibNav, useLT, useReaderLink } from "./ui";

export default function LibraryBookPage() {
  const { lang } = useSite();
  const { id = "" } = useParams();
  return (
    <LibLang lang={lang}>
      <BookBody id={id} />
    </LibLang>
  );
}

/** Kitob sahifasining tanasi. Havolalar (katalog, muallif, kalit so'z, tavsiyalar) LibNav kontekstiga qarab
 *  ochiq saytga yoki kabinet ichiga olib boradi; o'quvchi yopilganda shu sahifaga qaytadi. */
export function BookBody({ id }: { id: string }) {
  const T = useLT();
  const lang = useLang();
  const ln = useLibNav();
  const loc = useLocation();
  const readerLink = useReaderLink();
  const nav = useNavigate();
  const [d, setD] = useState<BookView | null>(null);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => {
    lib
      .book(id)
      .then(setD)
      .catch(() => setErr("404"));
  }, [id]);
  useEffect(() => {
    setD(null);
    setErr("");
    load();
    window.scrollTo({ top: 0 });
  }, [load]);
  if (err) return <div className="container lb-empty big">{T.nothing}</div>;
  if (!d) return <div className="lb-root container lb-loading">…</div>;
  const b = d.book;
  const me = d.me;
  const logged = !!me;
  const next = encodeURIComponent(loc.pathname);
  const login = `/login?next=${next}`;
  const ebooks = d.files.filter((x) => x.kind !== "audio");
  const audio = d.files.filter((x) => x.kind === "audio");
  const act = async (fn: () => Promise<unknown>, ok?: string) => {
    setBusy(true);
    setMsg("");
    try {
      await fn();
      if (ok) setMsg(ok);
      load();
    } catch (e) {
      setMsg("! " + errText(e, T));
    } finally {
      setBusy(false);
    }
  };
  // mehmon: ochiq fond fayllari darhol ochiladi, qolganlari — kirish sahifasiga (so'ng shu sahifaga qaytadi)
  const can = (x: LibFile) => canRead(x, logged);
  const locked = (x: LibFile) => logged && !can(x);
  const openFile = (x: LibFile) => {
    if (!can(x)) return logged ? undefined : nav(login);
    const r = readerLink(x);
    nav(r.to, { state: r.state });
  };
  const guestLocked = !logged && d.files.some((x) => !can(x));
  const forbidden = d.files.find((x) => locked(x));
  const pct = (x: LibFile) => Math.round(me?.progress[x.id]?.percent || 0);
  const formats = [...(d.availability.total ? (["paper"] as const) : []), ...new Set(d.files.map((x) => x.kind))] as ("paper" | "pdf" | "epub" | "audio")[];
  return (
    <div className="lb-root">
      <section className="lb-bookhero">
        <div className="container">
          <Link to={ln.catalog} className="lb-back">
            <ArrowLeft size={16} /> {T.back_catalog}
          </Link>
          <div className={`lb-bookhero-grid ${b.cover ? "" : "no-cover"}`}>
            {b.cover && (
              <div className="lb-bookhero-cover">
                <Cover title={b.title} src={b.cover} size="lg" />
              </div>
            )}
            <div className="lb-bookhero-main">
              {b.categories.length > 0 && (
                <div className="lb-crumbs">
                  {b.categories.map((c) => (
                    <Link key={c} to={`${ln.catalog}?category=${encodeURIComponent(c)}`}>
                      {c}
                    </Link>
                  ))}
                </div>
              )}
              <h1>{b.title}</h1>
              {b.subtitle && <p className="lb-sub">{b.subtitle}</p>}
              <p className="lb-authors">
                {b.authors.map((a, i) => (
                  <span key={a}>
                    {i > 0 && ", "}
                    <Link to={`${ln.catalog}?q=${encodeURIComponent(a)}`}>{a}</Link>
                  </span>
                ))}
              </p>
              <div className="lb-bookhero-meta">
                {d.rating.count > 0 && (
                  <span className="lb-rate-big">
                    <Stars value={d.rating.avg} size={18} /> <b>{d.rating.avg.toFixed(1)}</b> <small>{f(T.ratings_n, { n: d.rating.count })}</small>
                  </span>
                )}
                <FmtBadges formats={formats} />
                {b.year && <span className="lb-meta-pill">{b.year}</span>}
                {b.lang && <span className="lb-meta-pill">{b.lang.toUpperCase()}</span>}
                {b.pages && <span className="lb-meta-pill">{b.pages} {T.pages.toLowerCase()}</span>}
              </div>

              <div className="lb-actions">
                {ebooks.map((x) => (
                  <button key={x.id} className="lb-btn primary" disabled={locked(x)} onClick={() => openFile(x)}>
                    {can(x) ? <BookOpen size={18} /> : <Lock size={18} />}
                    {pct(x) > 0 ? f(T.read_continue, { p: pct(x) }) : T.read}
                    <small>{x.kind.toUpperCase()}</small>
                  </button>
                ))}
                {audio.length > 0 && (
                  <button className="lb-btn accent" disabled={locked(audio[0])} onClick={() => openFile(audio[0])}>
                    {can(audio[0]) ? <Headphones size={18} /> : <Lock size={18} />} {T.listen}
                    {audio.length > 1 && <small>{f(T.chapters, { n: audio.length })}</small>}
                  </button>
                )}
                {d.availability.total > 0 &&
                  (me?.loan ? (
                    <span className="lb-state ok">
                      <CheckCircle2 size={18} /> {f(T.you_have, { date: fmtDate(me.loan.due, lang) })}
                    </span>
                  ) : me?.reservation ? (
                    <span className={`lb-state ${me.reservation.status === "ready" ? "ok" : "wait"}`}>
                      {me.reservation.status === "ready" ? <CheckCircle2 size={18} /> : <Clock size={18} />}
                      {me.reservation.status === "ready" ? f(T.ready_pickup, { date: fmtDate(me.reservation.expires, lang) }) : f(T.in_queue, { n: me.reservation.position })}
                      <button className="lb-link" disabled={busy} onClick={() => act(() => lib.cancelReservation(me.reservation!.id))}>
                        {T.cancel_reservation}
                      </button>
                    </span>
                  ) : (
                    <button className="lb-btn ghost" disabled={busy} onClick={() => (logged ? act(() => lib.reserve(id), T.reserved) : nav(login))}>
                      <CalendarClock size={18} /> {d.availability.free ? T.reserve : T.reserve_queue}
                    </button>
                  ))}
                {logged && <ShelfButton bookId={id} shelves={me?.shelves || []} />}
              </div>
              {guestLocked && (
                <p className="lb-note">
                  <Lock size={14} /> <Link to={login}>{T.login}</Link> — {T.login_to_read.toLowerCase()}
                </p>
              )}
              {forbidden && (
                <p className="lb-note">
                  <Lock size={14} /> {f(T.file_forbidden, { who: (forbidden.audience || forbidden.access) === "teachers" ? T.for_teachers : T.for_faculty })}
                </p>
              )}
              {me?.problems && me.problems.length > 0 && !me.loan && d.availability.total > 0 && (
                <p className="lb-note warn">{me.problems.map((p) => (T as Record<string, string>)[`problem_${p}`] || p).join(" · ")}</p>
              )}
              {msg && <p className={`lb-msg ${msg.startsWith("!") ? "bad" : ""}`}>{msg.replace(/^! /, "")}</p>}
            </div>

            <aside className="lb-avail-card">
              <h3>{T.paper_copies}</h3>
              {d.availability.total ? (
                <>
                  <div className="lb-avail-big">
                    <b>{d.availability.free}</b>
                    <span>/ {d.availability.total}</span>
                  </div>
                  <AvailLine b={{ copies: d.availability.total, free: d.availability.free, formats: [] }} />
                  {!d.availability.free && d.availability.next_due && <small>{f(T.next_return, { date: fmtDate(d.availability.next_due, lang) })}</small>}
                  {d.availability.queue > 0 && (
                    <small>
                      <Users size={13} /> {f(T.queue_n, { n: d.availability.queue })}
                    </small>
                  )}
                </>
              ) : (
                <p className="muted">{T.no_paper}</p>
              )}
              {d.files.length > 0 && (
                <>
                  <h3>{T.e_versions}</h3>
                  <ul className="lb-files">
                    {d.files.map((x) => (
                      <li key={x.id}>
                        <button onClick={() => openFile(x)} disabled={locked(x)} title={!logged && !filePublic(x) ? T.login_to_read : undefined}>
                          {!can(x) ? <Lock size={15} /> : x.kind === "audio" ? <Headphones size={15} /> : <BookOpen size={15} />}
                          <span>{x.title || x.kind.toUpperCase()}</span>
                          <small>{x.kind === "audio" ? (x.duration ? f(T.minutes, { n: Math.round(x.duration / 60) }) : "") : x.pages ? `${x.pages}` : ""}</small>
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </aside>
          </div>
        </div>
      </section>

      <div className="container lb-bookbody">
        <div className="lb-bookcols">
          <div>
            {b.annotation && (
              <section className="lb-sec">
                <h2>{T.annotation}</h2>
                <p className="lb-annot">{b.annotation}</p>
              </section>
            )}
            <section className="lb-sec">
              <h2>{T.details}</h2>
              <dl className="lb-dl">
                {[
                  [T.by, b.authors.join(", ")],
                  [T.publisher, b.publisher],
                  [T.year, b.year],
                  [T.language, b.lang?.toUpperCase()],
                  [T.pages, b.pages],
                  [T.isbn, b.isbn],
                  [T.udc, b.udc],
                  [T.bbk, b.bbk],
                  [T.subject, b.categories.join(", ")],
                  [T.faculty, b.faculties.join(", ")],
                ]
                  .filter(([, v]) => v)
                  .map(([k, v]) => (
                    <div key={String(k)}>
                      <dt>{k}</dt>
                      <dd>{v}</dd>
                    </div>
                  ))}
              </dl>
              {b.keywords.length > 0 && (
                <div className="lb-kw">
                  {b.keywords.map((k) => (
                    <Link key={k} to={`${ln.catalog}?q=${encodeURIComponent(k)}`}>
                      #{k}
                    </Link>
                  ))}
                </div>
              )}
            </section>
            {d.lists.length > 0 && (
              <section className="lb-sec">
                <h2>
                  <GraduationCap size={20} /> {T.in_lists}
                </h2>
                <ul className="lb-lists">
                  {d.lists.map((l, i) => (
                    <li key={i}>
                      <b>{l.subject}</b> — {l.teacher}
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <Reviews bookId={id} logged={logged} />
          </div>
          <aside>
            <RatingCard d={d} onChange={load} />
          </aside>
        </div>
        <Shelfbar title={T.also_taken} items={d.also} />
        <Shelfbar title={T.similar} items={d.similar} />
      </div>
    </div>
  );
}

function RatingCard({ d, onChange }: { d: BookView; onChange: () => void }) {
  const T = useLT();
  const [err, setErr] = useState("");
  const r = d.rating;
  return (
    <section className="lb-ratecard">
      <h3>{T.rating}</h3>
      <div className="lb-rate-sum">
        <b>{r.avg ? r.avg.toFixed(1) : "—"}</b>
        <span>
          <Stars value={r.avg} size={16} />
          <small>{f(T.ratings_n, { n: r.count })}</small>
        </span>
      </div>
      <div className="lb-dist">
        {[5, 4, 3, 2, 1].map((s) => (
          <div key={s}>
            <span>{s}</span>
            <i>
              <em style={{ width: `${r.count ? ((r.dist[String(s)] || 0) / r.count) * 100 : 0}%` }} />
            </i>
            <small>{r.dist[String(s)] || 0}</small>
          </div>
        ))}
      </div>
      {d.me && (
        <div className="lb-myrate">
          <small>{T.your_rating}</small>
          <Stars
            value={r.mine || 0}
            size={24}
            onPick={
              r.can_rate
                ? async (n) => {
                    try {
                      await lib.rate(d.book.id, n);
                      onChange();
                    } catch (e) {
                      setErr(errText(e, T));
                    }
                  }
                : undefined
            }
          />
          {!r.can_rate && <p className="muted">{T.rate_hint}</p>}
          {err && <p className="lb-msg bad">{err}</p>}
        </div>
      )}
    </section>
  );
}

function Reviews({ bookId, logged }: { bookId: string; logged: boolean }) {
  const T = useLT();
  const lang = useLang();
  const [items, setItems] = useState<Review[] | null>(null);
  const [text, setText] = useState("");
  const [anon, setAnon] = useState(false);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [msg, setMsg] = useState("");
  const load = useCallback(() => lib.reviews(bookId).then((r) => setItems(r.items)).catch(() => setItems([])), [bookId]);
  useEffect(() => {
    load();
  }, [load]);
  const send = async (body: string, parent?: string) => {
    try {
      const r = await lib.addReview(bookId, { text: body, parent_id: parent, anonymous: anon });
      setMsg(r.status === "pending" ? T.pending_mod : "");
      setText("");
      setReply("");
      setReplyTo(null);
      load();
    } catch (e) {
      setMsg("! " + errText(e, T));
    }
  };
  const one = (r: Review, child = false) => (
    <article key={r.id} className={`lb-review ${child ? "child" : ""} ${r.status !== "approved" ? "pending" : ""}`}>
      <span className="lb-review-av">{r.author.photo ? <img src={r.author.photo} alt="" /> : (r.author.name || "?").slice(0, 1)}</span>
      <div>
        <div className="lb-review-h">
          <b>{r.author.name}</b>
          {r.author.faculty && <small>{r.author.faculty}</small>}
          {r.stars ? <Stars value={r.stars} size={12} /> : null}
          <time>{fmtDate(r.created, lang)}</time>
          {r.status === "pending" && <em className="lb-pend">{T.pending_mod}</em>}
        </div>
        <p>{r.text}</p>
        <div className="lb-review-f">
          {logged && r.status === "approved" && (
            <button className={r.voted ? "on" : ""} onClick={async () => (await lib.vote(r.id, "helpful"), load())}>
              <ThumbsUp size={14} /> {T.helpful} {r.helpful > 0 && <i>{r.helpful}</i>}
            </button>
          )}
          {logged && !child && (
            <button onClick={() => setReplyTo(replyTo === r.id ? null : r.id)}>
              <Reply size={14} /> {T.reply}
            </button>
          )}
          {logged && !r.own && r.status === "approved" && (
            <button
              onClick={async () => {
                const note = window.prompt(T.report);
                if (note !== null) {
                  await lib.vote(r.id, "report", note);
                  setMsg(T.reported);
                }
              }}
            >
              <Flag size={14} /> {T.report}
            </button>
          )}
          {r.own && (
            <button
              onClick={async () => {
                const t = window.prompt(T.edit, r.text);
                if (t && t !== r.text) {
                  try {
                    await lib.editReview(r.id, t);
                    load();
                  } catch (e) {
                    setMsg("! " + errText(e, T));
                  }
                }
              }}
            >
              {T.edit}
            </button>
          )}
          {r.own && (
            <button onClick={async () => (await lib.deleteReview(r.id), load())}>
              <Trash2 size={14} />
            </button>
          )}
        </div>
        {replyTo === r.id && (
          <form
            className="lb-reply"
            onSubmit={(e) => {
              e.preventDefault();
              send(reply, r.id);
            }}
          >
            <input value={reply} onChange={(e) => setReply(e.target.value)} maxLength={2000} placeholder={T.write_review} autoFocus />
            <button className="lb-btn primary sm">{T.send}</button>
          </form>
        )}
        {r.replies?.map((x) => one(x, true))}
      </div>
    </article>
  );
  return (
    <section className="lb-sec">
      <h2>
        <MessageSquare size={20} /> {T.reviews} {items && items.length > 0 && <i className="lb-count">{items.length}</i>}
      </h2>
      {logged && (
        <form
          className="lb-review-form"
          onSubmit={(e) => {
            e.preventDefault();
            send(text);
          }}
        >
          <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} rows={3} placeholder={T.write_review} />
          <div>
            <label className="lb-check">
              <input type="checkbox" checked={anon} onChange={(e) => setAnon(e.target.checked)} /> {T.anonymous} <small>({T.anonymous_hint})</small>
            </label>
            <small className="muted">{text.length}/2000</small>
            <button className="lb-btn primary" disabled={text.trim().length < 2}>
              {T.send}
            </button>
          </div>
        </form>
      )}
      {msg && <p className={`lb-msg ${msg.startsWith("!") ? "bad" : ""}`}>{msg.replace(/^! /, "")}</p>}
      {items && !items.length && <p className="muted">{T.no_reviews}</p>}
      <div className="lb-reviews">{items?.map((r) => one(r))}</div>
    </section>
  );
}
