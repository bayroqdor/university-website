// /accessibility — «Maxsus imkoniyatlar bayonoti»: muvofiqlik maqsadi (WCAG 2.2 AA), panel imkoniyatlari,
// klaviatura birikmalari, ma'lum cheklovlar va fikr-mulohaza uchun murojaat yo'li. Matn statik (uz / ru / en).
import { Link } from "react-router-dom";
import { useSite } from "../lib/site";
import { PageHero } from "../site/pages/Pages";
import { openA11yPanel, SHORTCUT } from "./prefs";
import { UniversalAccessIcon } from "./Panel";
import "../styles/a11y-statement.css";

type Row = [string, string];
interface Doc {
  eyebrow: string;
  title: string;
  sub: string;
  open: string;
  updated: string;
  s_target: string;
  target: string[];
  s_panel: string;
  panel: Row[];
  s_keys: string;
  keys_th: [string, string];
  keys: Row[];
  s_system: string;
  system: string[];
  s_limits: string;
  limits: string[];
  s_feedback: string;
  feedback: string;
  feedback_link: string;
  contacts: string;
}

const UZ: Doc = {
  eyebrow: "Maxsus imkoniyatlar",
  title: "Maxsus imkoniyatlar bayonoti",
  sub: "Sayt barcha foydalanuvchilar, jumladan ko‘rish, eshitish, harakat va idrok bilan bog‘liq cheklovlari bo‘lgan foydalanuvchilar uchun qulay bo‘lishi kerak.",
  open: "Maxsus imkoniyatlar panelini ochish",
  updated: "Bayonot 2026-yil 12-oktyabrda tayyorlangan.",
  s_target: "Muvofiqlik maqsadi",
  target: [
    "Maqsad — Web Content Accessibility Guidelines (WCAG) 2.2 standartining AA darajasiga muvofiqlik.",
    "Joriy holat: qisman muvofiq. Saytning asosiy sahifalari avtomatik (axe-core) va qo‘lda — faqat klaviatura bilan — tekshirilgan; quyida ma’lum cheklovlar keltirilgan.",
  ],
  s_panel: "Maxsus imkoniyatlar paneli",
  panel: [
    ["Matn o‘lchami", "100% dan 200% gacha; sahifa tuzilishi tor ekranda ham buzilmaydi."],
    ["Oraliqlar", "qatorlar, harflar va so‘zlar oralig‘ini kengaytirish."],
    ["Shrift", "oson o‘qiladigan (Atkinson Hyperlegible Next, kirill harflari uchun Andika) yoki disleksiya uchun (OpenDyslexic)."],
    ["Rang sxemalari", "qora fonda oq, oq fonda qora, qora fonda sariq, havorang fonda ko‘k (kontrast kamida 7:1) va oq-qora."],
    ["Rasmlar", "ko‘rsatish, yashirish (o‘rnida tavsifi chiqadi) yoki oq-qora."],
    ["O‘qish va harakat", "havolalarni ajratish, kuchaytirilgan fokus ramkasi, katta kursor, o‘qish chizg‘ichi va niqob, animatsiyalarni to‘xtatish."],
    ["Ovozli o‘qish", "sahifa yoki belgilangan matnni brauzer ovozi bilan o‘qish; yangilik va e’lonlarda «Tinglash» tugmasi."],
  ],
  s_keys: "Klaviatura",
  keys_th: ["Tugmalar", "Vazifasi"],
  keys: [
    ["Tab / Shift + Tab", "keyingi / oldingi element"],
    ["Enter, Probel", "havola yoki tugmani ishga tushirish"],
    ["Esc", "menyu, qidiruv va oynalarni yopish"],
    [SHORTCUT, "maxsus imkoniyatlar paneli"],
    ["Ctrl + K yoki /", "sayt bo‘yicha qidiruv"],
    ["↑ ↓", "qidiruv natijalari bo‘ylab harakat"],
  ],
  s_system: "Qurilma sozlamalari",
  system: [
    "Tizimdagi «harakatni kamaytirish» sozlamasi yoqilgan bo‘lsa, animatsiyalar avtomatik o‘chadi.",
    "Windows yuqori kontrast rejimi (forced colors) va «kontrastni oshirish» sozlamasi qo‘llab-quvvatlanadi.",
    "Brauzerda sahifani 400% gacha kattalashtirish mumkin; birinchi Tab bosilganda «Asosiy matnga o‘tish» havolasi chiqadi.",
  ],
  s_limits: "Ma’lum cheklovlar",
  limits: [
    "Bo‘limlar yuklagan ayrim PDF va skanerlangan hujjatlar matn sifatida o‘qilmasligi mumkin.",
    "Ayrim eski yangiliklardagi rasmlarning tavsifi qisqa yoki umumiy.",
    "Videolarning hammasida ham subtitr yo‘q.",
    "O‘zbek tilida ovozli o‘qish brauzerda o‘zbekcha ovoz bo‘lishiga bog‘liq; bo‘lmasa, eng yaqin ovoz ishlatiladi.",
    "Tashqi xizmatlardan joylangan kontent (YouTube, xarita, Telegram) ularning o‘z imkoniyatlariga bog‘liq.",
  ],
  s_feedback: "Fikr-mulohaza",
  feedback: "Saytdan foydalanishda qiyinchilikka duch kelsangiz yoki biror ma’lumotni boshqa ko‘rinishda olishni istasangiz, virtual qabulxona orqali yozing — murojaatingiz ko‘rib chiqiladi.",
  feedback_link: "Virtual qabulxonaga yozish",
  contacts: "Boshqa aloqa usullari",
};

const RU: Doc = {
  eyebrow: "Версия для слабовидящих",
  title: "Заявление о доступности",
  sub: "Сайт должен быть удобен для всех, в том числе для людей с нарушениями зрения, слуха, моторики и восприятия.",
  open: "Открыть панель специальных возможностей",
  updated: "Заявление подготовлено 12 октября 2026 года.",
  s_target: "Цель соответствия",
  target: [
    "Цель — соответствие уровню AA стандарта Web Content Accessibility Guidelines (WCAG) 2.2.",
    "Текущий статус: частичное соответствие. Основные страницы проверены автоматически (axe-core) и вручную — только с клавиатуры; известные ограничения перечислены ниже.",
  ],
  s_panel: "Панель специальных возможностей",
  panel: [
    ["Размер текста", "от 100% до 200%; на узком экране страница не ломается."],
    ["Интервалы", "увеличенные межстрочный, межбуквенный интервалы и интервал между словами."],
    ["Шрифт", "удобочитаемый (Atkinson Hyperlegible Next, для кириллицы — Andika) или для дислексии (OpenDyslexic)."],
    ["Цветовые схемы", "белый на чёрном, чёрный на белом, жёлтый на чёрном, синий на голубом (контраст не ниже 7:1) и оттенки серого."],
    ["Изображения", "показывать, скрыть (вместо изображения — его описание) или чёрно-белые."],
    ["Чтение и навигация", "выделение ссылок, усиленная рамка фокуса, крупный курсор, линейка и маска для чтения, остановка анимации."],
    ["Озвучивание", "чтение страницы или выделенного текста голосом браузера; кнопка «Слушать» в новостях и объявлениях."],
  ],
  s_keys: "Клавиатура",
  keys_th: ["Клавиши", "Действие"],
  keys: [
    ["Tab / Shift + Tab", "следующий / предыдущий элемент"],
    ["Enter, Пробел", "перейти по ссылке, нажать кнопку"],
    ["Esc", "закрыть меню, поиск и окна"],
    [SHORTCUT, "панель специальных возможностей"],
    ["Ctrl + K или /", "поиск по сайту"],
    ["↑ ↓", "перемещение по результатам поиска"],
  ],
  s_system: "Настройки устройства",
  system: [
    "Если в системе включено «уменьшение движения», анимация отключается автоматически.",
    "Поддерживаются режим высокой контрастности Windows (forced colors) и настройка «повышенный контраст».",
    "Страницу можно увеличить в браузере до 400%; при первом нажатии Tab появляется ссылка «Перейти к содержанию».",
  ],
  s_limits: "Известные ограничения",
  limits: [
    "Некоторые PDF и сканированные документы, загруженные подразделениями, могут не читаться как текст.",
    "В части старых новостей описания изображений краткие или общие.",
    "Не у всех видео есть субтитры.",
    "Озвучивание на узбекском языке зависит от наличия узбекского голоса в браузере; если его нет, используется ближайший голос.",
    "Встроенный контент внешних сервисов (YouTube, карты, Telegram) зависит от их собственных возможностей.",
  ],
  s_feedback: "Обратная связь",
  feedback: "Если вам трудно пользоваться сайтом или нужна информация в другом формате, напишите через виртуальную приёмную — обращение будет рассмотрено.",
  feedback_link: "Написать в виртуальную приёмную",
  contacts: "Другие способы связи",
};

const EN: Doc = {
  eyebrow: "Accessibility",
  title: "Accessibility statement",
  sub: "This website should work for everyone, including people with visual, hearing, motor and cognitive disabilities.",
  open: "Open the accessibility panel",
  updated: "This statement was prepared on 12 October 2026.",
  s_target: "Conformance target",
  target: [
    "Our target is conformance with level AA of the Web Content Accessibility Guidelines (WCAG) 2.2.",
    "Current status: partially conformant. The main pages have been tested automatically (axe-core) and manually with a keyboard only; known limitations are listed below.",
  ],
  s_panel: "Accessibility panel",
  panel: [
    ["Text size", "from 100% to 200%; the layout reflows on narrow screens."],
    ["Spacing", "wider line, letter and word spacing."],
    ["Font", "hyperlegible (Atkinson Hyperlegible Next, with Andika for Cyrillic) or dyslexia-friendly (OpenDyslexic)."],
    ["Colour schemes", "white on black, black on white, yellow on black, blue on light blue (contrast of at least 7:1) and greyscale."],
    ["Images", "show, hide (the description is shown instead) or greyscale."],
    ["Reading and navigation", "highlighted links, enhanced focus outline, large cursor, reading guide and mask, stop animations."],
    ["Text to speech", "reads the page or the selected text with the browser’s voice; a “Listen” button on news and announcements."],
  ],
  s_keys: "Keyboard",
  keys_th: ["Keys", "Action"],
  keys: [
    ["Tab / Shift + Tab", "next / previous element"],
    ["Enter, Space", "follow a link, press a button"],
    ["Esc", "close menus, search and dialogs"],
    [SHORTCUT, "accessibility panel"],
    ["Ctrl + K or /", "search the site"],
    ["↑ ↓", "move through search results"],
  ],
  s_system: "Device settings",
  system: [
    "If “reduce motion” is on in your system settings, animations are switched off automatically.",
    "Windows high contrast (forced colors) and the “increase contrast” setting are supported.",
    "Pages can be zoomed in the browser up to 400%; the first Tab press reveals a “Skip to main content” link.",
  ],
  s_limits: "Known limitations",
  limits: [
    "Some PDFs and scanned documents uploaded by departments may not be readable as text.",
    "Image descriptions in some older news items are short or generic.",
    "Not all videos have captions.",
    "Uzbek text to speech depends on an Uzbek voice being available in the browser; otherwise the closest voice is used.",
    "Embedded content from external services (YouTube, maps, Telegram) depends on those services.",
  ],
  s_feedback: "Feedback",
  feedback: "If you have difficulty using this website or need information in another format, write to us through the virtual reception and we will look into it.",
  feedback_link: "Write to the virtual reception",
  contacts: "Other ways to contact us",
};

const DOCS = { uz: UZ, ru: RU, en: EN };

export function AccessibilityStatementPage() {
  const { lang, data } = useSite();
  const d = DOCS[lang] || UZ;
  const u = data?.uni;
  return (
    <>
      <PageHero eyebrow={d.eyebrow} title={d.title} sub={d.sub}>
        <button type="button" className="bt bt-blue ast-open" onClick={openA11yPanel}>
          <UniversalAccessIcon size={20} />
          {d.open}
        </button>
      </PageHero>
      <section className="section tight ast">
        <div className="container ast-in">
          <section aria-labelledby="ast-target">
            <h2 id="ast-target">{d.s_target}</h2>
            {d.target.map((p) => (
              <p key={p}>{p}</p>
            ))}
          </section>
          <section aria-labelledby="ast-panel">
            <h2 id="ast-panel">{d.s_panel}</h2>
            <dl className="ast-dl">
              {d.panel.map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          </section>
          <section aria-labelledby="ast-keys">
            <h2 id="ast-keys">{d.s_keys}</h2>
            <div className="ast-table">
              <table>
                <thead>
                  <tr>
                    <th scope="col">{d.keys_th[0]}</th>
                    <th scope="col">{d.keys_th[1]}</th>
                  </tr>
                </thead>
                <tbody>
                  {d.keys.map(([k, v]) => (
                    <tr key={k}>
                      <th scope="row">
                        <kbd>{k}</kbd>
                      </th>
                      <td>{v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section aria-labelledby="ast-system">
            <h2 id="ast-system">{d.s_system}</h2>
            <ul>
              {d.system.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </section>
          <section aria-labelledby="ast-limits">
            <h2 id="ast-limits">{d.s_limits}</h2>
            <ul>
              {d.limits.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </section>
          <section aria-labelledby="ast-feedback">
            <h2 id="ast-feedback">{d.s_feedback}</h2>
            <p>{d.feedback}</p>
            <p>
              <Link to="/contact#contact-form" className="bt bt-blue">
                {d.feedback_link}
              </Link>
            </p>
            {u && (u.email || u.phones?.length) ? (
              <p className="ast-contacts">
                {d.contacts}:{" "}
                {u.email && <a href={`mailto:${u.email}`}>{u.email}</a>}
                {u.email && u.phones?.length ? ", " : ""}
                {u.phones?.map((p, i) => (
                  <span key={p}>
                    {i > 0 && ", "}
                    <a href={`tel:${p.replace(/[^+\d]/g, "")}`} className="tnum">
                      {p}
                    </a>
                  </span>
                ))}
              </p>
            ) : null}
            <p className="ast-updated">{d.updated}</p>
          </section>
        </div>
      </section>
    </>
  );
}
