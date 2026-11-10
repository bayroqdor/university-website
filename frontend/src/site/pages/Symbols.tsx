// O'zbekiston Respublikasi davlat ramzlari: bayroq, gerb, madhiya (3 tilda). Rasmlar — Wikimedia Commons (davlat ramzlari, jamoat mulki),
// madhiya — AQSh Harbiy-dengiz kuchlari orkestri ijrosidagi cholg'u yozuvi (jamoat mulki).
import { Download, Flag, Music, Pause, Play, Shield } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, NavLink, useParams } from "react-router-dom";
import type { Lang } from "../../lib/api";
import { useSite } from "../../lib/site";
import { Reveal } from "../chrome/ui";

type Kind = "flag" | "emblem" | "anthem";

const TX: Record<Lang, Record<string, string | string[]>> = {
  uz: {
    lead: "O‘zbekiston Respublikasining Davlat bayrog‘i, Davlat gerbi va Davlat madhiyasi — mustaqil davlatimizning ramzlari. Ularni hurmat qilish har bir fuqaroning burchi.",
    flag_lead: "O‘zbekiston Respublikasining Davlat bayrog‘i 1991-yil 18-noyabrda Oliy Kengashning sessiyasida qabul qilingan «O‘zbekiston Respublikasining Davlat bayrog‘i to‘g‘risida»gi Qonun bilan tasdiqlangan.",
    flag_body: [
      "Bayroq to‘g‘ri to‘rtburchak shaklida bo‘lib, uzunasiga ketgan uch rangdan iborat: yuqorida — moviy, o‘rtada — oq, pastda — yashil rang. Oq yo‘l chetlaridan ingichka qizil hoshiyalar bilan ajratilgan. Bayroqning eni va bo‘yi nisbati 1:2.",
      "Moviy rang — mangu osmon va obihayot ramzi. Oq rang — tinchlik va poklik ramzi. Yashil rang — tabiat yangilanishi va hosildorlik timsoli. Qizil hoshiyalar — har bir tirik vujudda urib turgan hayotiy kuch irmoqlari.",
      "Moviy yo‘lda, dastakka yaqin joyda oq rangli yangi oy (hilol) va o‘n ikkita besh qirrali yulduz tasvirlangan. Hilol — yangi tug‘ilgan mustaqil respublika ramzi, o‘n ikki yulduz — xalqimizning qadimiy taqvimi va madaniyatining timsoli.",
    ],
    emblem_lead: "O‘zbekiston Respublikasining Davlat gerbi 1992-yil 2-iyulda «O‘zbekiston Respublikasining Davlat gerbi to‘g‘risida»gi Qonun bilan tasdiqlangan.",
    emblem_body: [
      "Gerbda tog‘lar, daryolar va gullagan vodiy uzra ko‘tarilib kelayotgan quyosh tasvirlangan. Vodiy o‘ng tomondan bug‘doy boshoqlari, chap tomondan ochilgan chanoqli g‘o‘za shoxlari bilan o‘ralgan.",
      "Gerbning yuqori qismida sakkiz burchakli yulduz bor, uning ichida hilol va yulduz — respublika birligi va mustahkamligi ramzi. Markazda qanotlarini yoygan Humo qushi — baxt va erksevarlik timsoli.",
      "Gerbning pastki qismida, Davlat bayrog‘i ranglaridagi lentada «O‘zbekiston» deb yozilgan.",
    ],
    anthem_lead: "O‘zbekiston Respublikasining Davlat madhiyasi 1992-yil 10-dekabrda «O‘zbekiston Respublikasining Davlat madhiyasi to‘g‘risida»gi Qonun bilan tasdiqlangan. Musiqasi — Mutal Burhonov, so‘zlari — Abdulla Oripov.",
    lyrics: "Madhiya matni",
    chorus: "Naqarot",
    listen: "Madhiyani tinglash",
    download: "Yuklab olish (MP3)",
    rec: "Cholg‘u ijrosi. Yozuv: Wikimedia Commons (jamoat mulki).",
    adopted: "Qabul qilingan",
    more: "Batafsil",
    ratio: "Nisbat",
    authors: "Mualliflar",
    src: "Rasmlar: Wikimedia Commons (davlat ramzlari jamoat mulki hisoblanadi).",
  },
  ru: {
    lead: "Государственный флаг, Государственный герб и Государственный гимн Республики Узбекистан — символы нашего независимого государства. Уважать их — долг каждого гражданина.",
    flag_lead: "Государственный флаг Республики Узбекистан утверждён Законом «О Государственном флаге Республики Узбекистан», принятым на сессии Верховного Совета 18 ноября 1991 года.",
    flag_body: [
      "Флаг представляет собой прямоугольное полотнище из трёх горизонтальных полос: голубой (вверху), белой (в середине) и зелёной (внизу). Белая полоса отделена тонкими красными каймами. Соотношение ширины и длины флага — 1:2.",
      "Голубой цвет — символ вечного неба и живительной воды. Белый — символ мира и чистоты. Зелёный — олицетворение обновления природы и плодородия. Красные каймы — потоки жизненной силы, пульсирующей в каждом живом существе.",
      "На голубой полосе у древка изображены белый полумесяц и двенадцать белых пятиконечных звёзд. Полумесяц — символ возрождённой независимой республики, двенадцать звёзд — символ древнего календаря и культуры народа.",
    ],
    emblem_lead: "Государственный герб Республики Узбекистан утверждён Законом «О Государственном гербе Республики Узбекистан» 2 июля 1992 года.",
    emblem_body: [
      "На гербе изображено восходящее солнце над цветущей долиной с горами и реками. Долина обрамлена справа колосьями пшеницы, слева — ветвями хлопчатника с раскрытыми коробочками.",
      "В верхней части герба — восьмиугольная звезда с полумесяцем и звездой внутри, символ единства и прочности республики. В центре — птица Хумо с распростёртыми крыльями, символ счастья и свободолюбия.",
      "В нижней части герба на ленте в цветах Государственного флага — надпись «O‘zbekiston».",
    ],
    anthem_lead: "Государственный гимн Республики Узбекистан утверждён Законом «О Государственном гимне Республики Узбекистан» 10 декабря 1992 года. Музыка — Мутал Бурханов, слова — Абдулла Арипов.",
    lyrics: "Текст гимна (на государственном языке)",
    chorus: "Припев",
    listen: "Слушать гимн",
    download: "Скачать (MP3)",
    rec: "Инструментальное исполнение. Запись: Wikimedia Commons (общественное достояние).",
    adopted: "Утверждён",
    more: "Подробнее",
    ratio: "Пропорции",
    authors: "Авторы",
    src: "Изображения: Wikimedia Commons (государственные символы — общественное достояние).",
  },
  en: {
    lead: "The State Flag, the State Emblem and the State Anthem of the Republic of Uzbekistan are the symbols of our independent state. Respecting them is the duty of every citizen.",
    flag_lead: "The State Flag of the Republic of Uzbekistan was approved by the Law “On the State Flag of the Republic of Uzbekistan” adopted at the session of the Supreme Council on 18 November 1991.",
    flag_body: [
      "The flag is a rectangle of three horizontal stripes: blue at the top, white in the middle and green at the bottom. The white stripe is bordered by two thin red stripes. The width-to-length ratio is 1:2.",
      "Blue symbolises the eternal sky and water, the source of life. White stands for peace and purity. Green embodies the renewal of nature and fertility. The red stripes are the streams of vital force flowing in every living being.",
      "Near the hoist on the blue stripe there is a white crescent and twelve white five-pointed stars. The crescent symbolises the reborn independent republic; the twelve stars symbolise the ancient calendar and culture of the people.",
    ],
    emblem_lead: "The State Emblem of the Republic of Uzbekistan was approved by the Law “On the State Emblem of the Republic of Uzbekistan” on 2 July 1992.",
    emblem_body: [
      "The emblem shows the sun rising over a flourishing valley with mountains and rivers. The valley is framed by ears of wheat on the right and cotton branches with open bolls on the left.",
      "At the top there is an eight-pointed star with a crescent and a star inside, symbolising the unity and strength of the republic. In the centre is the Humo bird with outspread wings, a symbol of happiness and love of freedom.",
      "At the bottom, a ribbon in the colours of the State Flag bears the inscription “O‘zbekiston”.",
    ],
    anthem_lead: "The State Anthem of the Republic of Uzbekistan was approved by the Law “On the State Anthem of the Republic of Uzbekistan” on 10 December 1992. Music by Mutal Burhonov, lyrics by Abdulla Oripov.",
    lyrics: "Lyrics (in the state language)",
    chorus: "Chorus",
    listen: "Listen to the anthem",
    download: "Download (MP3)",
    rec: "Instrumental performance. Recording: Wikimedia Commons (public domain).",
    adopted: "Adopted",
    more: "Read more",
    ratio: "Ratio",
    authors: "Authors",
    src: "Images: Wikimedia Commons (state symbols are in the public domain).",
  },
};

const VERSE1 = ["Serquyosh, hur o‘lkam, elga baxt, najot,", "Sen o‘zing do‘stlarga yo‘ldosh, mehribon!", "Yashnagay to abad ilmu fan, ijod,", "Shuhrating porlasin toki bor jahon!"];
const CHORUS = ["Oltin bu vodiylar — jon O‘zbekiston,", "Ajdodlar mardona ruhi senga yor!", "Ulug‘ xalq qudrati jo‘sh urgan zamon,", "Olamni mahliyo aylagan diyor!"];
const VERSE2 = ["Bag‘ri keng o‘zbekning o‘chmas iymoni,", "Erkin, yosh avlodlar senga zo‘r qanot!", "Istiqlol mash’ali, tinchlik posboni,", "Haqsevar, ona yurt, mangu bo‘l obod!"];

const IMG: Record<Kind, string> = { flag: "/symbols/flag.svg", emblem: "/symbols/emblem.svg", anthem: "" };
const DATES: Record<Kind, string> = { flag: "18.11.1991", emblem: "02.07.1992", anthem: "10.12.1992" };

function useTx() {
  const { lang } = useSite();
  return TX[lang] || TX.uz;
}

/** Madhiyani tinglash: oddiy pleyer (o'ynatish/to'xtatish, vaqt chizig'i) */
export function AnthemPlayer({ compact = false }: { compact?: boolean }) {
  const x = useTx();
  const a = useRef<HTMLAudioElement>(null);
  const [on, setOn] = useState(false);
  const [t, setT] = useState({ cur: 0, dur: 146 });
  useEffect(() => {
    const el = a.current;
    if (!el) return;
    const upd = () => setT({ cur: el.currentTime, dur: el.duration || 146 });
    const end = () => setOn(false);
    el.addEventListener("timeupdate", upd);
    el.addEventListener("loadedmetadata", upd);
    el.addEventListener("ended", end);
    return () => {
      el.removeEventListener("timeupdate", upd);
      el.removeEventListener("loadedmetadata", upd);
      el.removeEventListener("ended", end);
    };
  }, []);
  const mm = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  return (
    <div className={`sy-player ${compact ? "compact" : ""}`}>
      <audio ref={a} src="/symbols/anthem.mp3" preload="metadata" />
      <button
        type="button"
        className="sy-play"
        aria-label={x.listen as string}
        onClick={() => {
          const el = a.current;
          if (!el) return;
          if (el.paused) {
            el.play().then(() => setOn(true)).catch(() => setOn(false));
          } else {
            el.pause();
            setOn(false);
          }
        }}
      >
        {on ? <Pause size={22} /> : <Play size={22} />}
      </button>
      <div className="sy-track">
        <b>{x.listen as string}</b>
        <input
          type="range"
          min={0}
          max={Math.round(t.dur)}
          value={Math.round(t.cur)}
          aria-label={x.listen as string}
          onChange={(e) => {
            if (a.current) a.current.currentTime = Number(e.target.value);
          }}
          style={{ ["--p" as string]: `${(t.cur / (t.dur || 1)) * 100}%` }}
        />
        <small>
          {mm(t.cur)} / {mm(t.dur)}
        </small>
      </div>
      {!compact && (
        <a className="sy-dl" href="/symbols/anthem.mp3" download="Ozbekiston-davlat-madhiyasi.mp3" title={x.download as string} aria-label={x.download as string}>
          <Download size={18} />
        </a>
      )}
    </div>
  );
}

function Tabs() {
  const { t } = useSite();
  const items: [Kind, string, ReactNode][] = [
    ["flag", t.sym_flag, <Flag key="f" size={17} />],
    ["emblem", t.sym_emblem, <Shield key="e" size={17} />],
    ["anthem", t.sym_anthem, <Music key="a" size={17} />],
  ];
  return (
    <nav className="sy-tabs" aria-label={`${t.sym_title} — ${t.menu}`}>
      {items.map(([k, label, ic]) => (
        <NavLink key={k} to={`/symbols/${k}`} className={({ isActive }) => (isActive ? "on" : "")}>
          {ic}
          {label}
        </NavLink>
      ))}
    </nav>
  );
}

function Detail({ kind }: { kind: Kind }) {
  const x = useTx();
  const { t } = useSite();
  const title = kind === "flag" ? t.sym_flag : kind === "emblem" ? t.sym_emblem : t.sym_anthem;
  return (
    <article className={`sy-detail ${kind === "anthem" ? "solo" : ""}`}>
      {/* madhiyaning surati yo'q — o'rniga bezak chizilmaydi, matn butun kenglikda */}
      {kind !== "anthem" && (
        <div className={`sy-visual ${kind}`}>
          <img src={IMG[kind]} alt={title} />
        </div>
      )}
      <div className="sy-text">
        <h2 className="h2">{title}</h2>
        <dl className="sy-facts">
          <div>
            <dt>{x.adopted as string}</dt>
            <dd>{DATES[kind]}</dd>
          </div>
          {kind === "flag" && (
            <div>
              <dt>{x.ratio as string}</dt>
              <dd>1 : 2</dd>
            </div>
          )}
          {kind === "anthem" && (
            <div>
              <dt>{x.authors as string}</dt>
              <dd>M. Burhonov · A. Oripov</dd>
            </div>
          )}
        </dl>
        <p className="sy-lead">{x[`${kind}_lead`] as string}</p>
        {kind === "anthem" ? (
          <>
            <AnthemPlayer />
            <p className="sy-note">{x.rec as string}</p>
            <h3 className="sy-h3">{x.lyrics as string}</h3>
            <div className="sy-lyrics" lang="uz">
              <p>{VERSE1.map((l) => [l, <br key={l} />])}</p>
              <p className="ch">
                <em>{x.chorus as string}:</em>
                <br />
                {CHORUS.map((l) => [l, <br key={l} />])}
              </p>
              <p>{VERSE2.map((l) => [l, <br key={l} />])}</p>
              <p className="ch">
                <em>{x.chorus as string}</em>
              </p>
            </div>
          </>
        ) : (
          (x[`${kind}_body`] as string[]).map((p) => <p key={p}>{p}</p>)
        )}
      </div>
    </article>
  );
}

export function SymbolsPage() {
  const { t } = useSite();
  const x = useTx();
  const { kind } = useParams();
  const k = (["flag", "emblem", "anthem"] as Kind[]).includes(kind as Kind) ? (kind as Kind) : null;
  useEffect(() => {
    document.title = `${k ? (k === "flag" ? t.sym_flag : k === "emblem" ? t.sym_emblem : t.sym_anthem) + " — " : ""}${t.sym_title}`;
  }, [k, t]);
  return (
    <section className="sec sy">
      <div className="wrap">
        <Reveal className="sy-head">
          <p className="ey">{t.sym_title}</p>
          <h1 className="h1">{k ? (k === "flag" ? t.sym_flag : k === "emblem" ? t.sym_emblem : t.sym_anthem) : t.sym_title}</h1>
          <p className="sy-intro">{x.lead as string}</p>
        </Reveal>
        <Tabs />
        {k ? (
          <Detail kind={k} />
        ) : (
          <div className="sy-cards">
            {(["flag", "emblem", "anthem"] as Kind[]).map((c) => (
              <Link key={c} to={`/symbols/${c}`} className="sy-card">
                {c !== "anthem" && (
                  <span className={`sy-card-img ${c}`}>
                    <img src={IMG[c]} alt="" loading="lazy" />
                  </span>
                )}
                <b>{c === "flag" ? t.sym_flag : c === "emblem" ? t.sym_emblem : t.sym_anthem}</b>
                <small>
                  {x.adopted as string}: {DATES[c]}
                </small>
                <span className="tlink">
                  {x.more as string} <span aria-hidden>→</span>
                </span>
              </Link>
            ))}
          </div>
        )}
        <p className="sy-src">{x.src as string}</p>
      </div>
    </section>
  );
}
