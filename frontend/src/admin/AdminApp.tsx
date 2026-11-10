// Boshqaruv paneli: menyu va sahifalar administrator roli (Rollar bo'limi) ruxsatlari bo'yicha ko'rinadi
import {
  BarChart3, Bell, Briefcase, Eye, EyeOff, Building2, Cloud, Crown, HelpCircle, SearchCheck, CalendarDays, CalendarRange, ExternalLink, FileSpreadsheet, FileText, GraduationCap, Handshake, Image, Inbox, KeyRound, Landmark, LayoutDashboard,
  Layers, LibraryBig, Link2, MailOpen, Megaphone, Menu, MessageSquareDot, Newspaper, PanelsTopLeft, PenSquare, PartyPopper, Wallet, School, Send, Server, Settings, ShieldCheck, UserCog, Users, UsersRound, Target, Award } from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import "../styles/admin.css";
import "../styles/admin-uni.css";
import "../styles/admin-fx.css";
import "../styles/shell.css";
import { pub, setUnauthorizedHandler } from "../lib/api";
import { ChartLabels } from "../rich/labels";
import { DICTS } from "../lib/i18n";
import MailApp, { useMailUnread } from "../mail/MailApp";
import { AuthSplit } from "../lib/AuthSplit";
import { admin, errMsg, type Admin } from "./api";
import { AcademicPage } from "./pages/Academic";
import { DocList, DocumentsPage, LinksPage } from "./pages/Content";
import { AlumniAdminPage, ArticlesAdminPage, CareerCenterAdminPage, PartnersAdminPage, StartupsAdminPage } from "./pages/Career";
import { BookOpen as IcArticles, Lightbulb as IcStartups } from "lucide-react";
import { MenuPage } from "./pages/Menu";
import { Dashboard } from "./pages/Dashboard";
import { DocEditor } from "./pages/DocEditor";
import { MailServerPage } from "./pages/MailServer";
import { AccountPage, MediaPage, SubscribersPage } from "./pages/Other";
import { DeskPage } from "./pages/Desk";
import { ADMIN_LANGS, at, getAdminLang, setAdminLang, startTranslator, type AdminLang } from "./i18n";
import { TopLang, TopSearch } from "../lib/TopBar";
import { MdShell, type MdGroup, type MdLink } from "../lib/MdShell";
import { LANG_NATIVE } from "../lib/i18n";
import { FacultyStaffPage, FaqAdminPage, HemisPage, SeoPage, StoragePage, TelegramPage } from "./pages/Extras";
import { HistoryAdmin, MentionsAdmin, OpenDataAdmin, PrivacyAdmin, RankingsAdmin, ReceptionAdmin, RectorAdmin } from "./pages/Official";
import { CalendarClock as IcReception, Database as IcOpenData, History as IcHistory, Lock as IcPrivacy, Quote as IcRector, Trophy as IcRankings, Tv as IcMedia } from "lucide-react";
import { TgComposerPage, TgPostsPage } from "./pages/TgChannel";
import { OfficeSettingsPage } from "../office/AdminSettings";
import { DocEditorPage, DocsPage } from "../office/Docs";
import { desk } from "./desk-api";
import { AdminsPage, RolesPage } from "./pages/Roles";
import { ProfessorsPage } from "./pages/People";
import { SchedulePage } from "./pages/Schedule";
import { SitePage, UniPage } from "./pages/Settings";
import { UsersPage } from "./pages/Users";
import { PopupsPage } from "./pages/Popups";
import { UpGoalsAdminPage } from "./pages/UpGoals";
import { GrantsAdminPage } from "./pages/Grants";
// talabalar hayoti va abituriyent bo'limlari (admin/campus)
import { Award as IcAward, BedDouble as IcDorm, CalendarCheck as IcSteps, Calculator as IcCalc, ClipboardList as IcReg, Dumbbell as IcSport, Images as IcGallery, Map as IcMap, Rotate3d as IcTour, UsersRound as IcClubs, HeartHandshake as IcParents } from "lucide-react";
import { ClubsAdmin, DormAdmin, GalleryAdmin, ScholarshipsAdmin, SportAdmin } from "./campus/Life";
import { MapAdmin, ParentsAdmin, ScoresAdmin, StepsAdmin } from "./campus/Applicant";
import { EventRegAdmin } from "./campus/EventReg";
import { TourAdmin } from "./campus/Tour";
import { FestivePage } from "./pages/Festive";
import { TuitionPage } from "./pages/Tuition";
import { BlogAdminPage } from "./pages/Blog";
import { Btn, ConfirmProvider, Empty, Input, Spinner, ToastProvider } from "./ui";
import { useBrand } from "../lib/brand";
import { BookOpenText } from "lucide-react";

const LibraryAdmin = lazy(() => import("./pages/Library"));
const libEl = (
  <Suspense fallback={<Spinner />}>
    <LibraryAdmin />
  </Suspense>
);
// ilmiy jurnal: sozlamalar, tahrir hay'ati, sonlar, maqolalar, yuborilganlar (alohida bo'lak)
const JournalAdmin = lazy(() => import("./pages/Journal").then((m) => ({ default: m.JournalAdminPage })));
const JournalArticle = lazy(() => import("./pages/Journal").then((m) => ({ default: m.JournalArticleEditor })));
const journalEl = (
  <Suspense fallback={<Spinner />}>
    <JournalAdmin />
  </Suspense>
);
const journalArticleEl = (
  <Suspense fallback={<Spinner />}>
    <JournalArticle />
  </Suspense>
);

function useTheme() {
  const [dark, setDark] = useState(
    () => document.documentElement.dataset.theme === "dark",
  );
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
  }, [dark]);
  return [
    dark,
    () => {
      setDark(!dark);
      try {
        localStorage.setItem("theme", dark ? "light" : "dark");
      } catch {
        /* */
      }
    },
  ] as const;
}

function Login({ onDone }: { onDone: (a: Admin) => void }) {
  const [f, setF] = useState({ login: "", password: "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState(false);
  const [name, setName] = useState("");
  useEffect(() => {
    pub
      .site()
      .then((d) => setName(d.uni.name || d.uni.abbr || ""))
      .catch(() => null);
  }, []);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const r = await admin.login(f.login, f.password);
      onDone(r.admin);
    } catch (e2) {
      setErr(errMsg(e2));
    }
    setBusy(false);
  };
  const lang = getAdminLang();
  return (
    <AuthSplit
      title={at("Kirish")}
      sub={at("Boshqaruv paneli")}
      welcome={name || "University"}
      text={at("Sayt kontenti, o‘quv jarayoni, kutubxona, pochta va murojaatlar — barchasi bitta boshqaruv panelida.")}
      more={{ href: "/", label: at("Saytni ochish") }}
      top={
        <div className="md-auth-langs" data-no-tr="">
          {ADMIN_LANGS.map((l) => (
            <button
              key={l.id}
              type="button"
              className={lang === l.id ? "on" : ""}
              onClick={() => {
                setAdminLang(l.id);
                window.location.reload();
              }}
            >
              {l.label}
            </button>
          ))}
        </div>
      }
    >
      <form className="md-auth-fields" onSubmit={submit}>
        <label className="a-field">
          <span className="a-label">Login yoki email</span>
          <Input autoFocus value={f.login} onChange={(e) => setF({ ...f, login: e.target.value })} autoComplete="username" />
        </label>
        <label className="a-field">
          <span className="a-label">Parol</span>
          <span className="md-pass">
            <Input type={show ? "text" : "password"} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} autoComplete="current-password" />
            <button type="button" onClick={() => setShow(!show)} title={show ? at("Yashirish") : at("Ko‘rsatish")} aria-label={show ? at("Yashirish") : at("Ko‘rsatish")}>
              {show ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </span>
        </label>
        {err && <div className="a-error">{err}</div>}
        <Btn kind="primary" type="submit" busy={busy} className="wide">
          Kirish
        </Btn>
      </form>
    </AuthSplit>
  );
}

type NavItem = { to: string; label: string; icon: ReactNode; perm: string; end?: boolean; hint?: string; el: ReactNode; sub?: [string, ReactNode][] };

type RailId = "dash" | "site" | "inst" | "study" | "settings";
const RAILS: { id: RailId; label: string; icon: ReactNode }[] = [
  { id: "dash", label: "Boshqaruv paneli", icon: <LayoutDashboard size={22} /> },
  { id: "site", label: "Sayt", icon: <PanelsTopLeft size={22} /> },
  { id: "inst", label: "Institut", icon: <Landmark size={22} /> },
  { id: "study", label: "O‘quv jarayoni", icon: <School size={22} /> },
  { id: "settings", label: "Sozlamalar", icon: <Settings size={22} /> },
];

function navTree(me: Admin, setMe: (a: Admin | null) => void): { group: string; rail: RailId; items: NavItem[] }[] {
  return [
    { group: "Boshqaruv paneli", rail: "dash", items: [{ to: "/admin", label: "Statistika", icon: <BarChart3 size={18} />, perm: "stats", end: true, el: <Dashboard /> }] },
    {
      group: "Ilovalar",
      rail: "dash",
      items: [
        { to: "/admin/mail", label: "Mening pochtam", icon: <MailOpen size={18} />, perm: "mail", hint: "kiruvchi, yuborilgan, qoralamalar…", el: <MailApp lang={getAdminLang()} /> },
        { to: "/admin/desk", label: "Murojaatlar", icon: <Inbox size={18} />, perm: "messages", hint: "service desk: aloqa formasi va bo‘lim pochtalari", el: <DeskPage /> },
        { to: "/admin/subscribers", label: "Obunachilar", icon: <Bell size={18} />, perm: "subscribers", el: <SubscribersPage /> },
        { to: "/admin/blog", label: "Blog", icon: <PenSquare size={18} />, perm: "blog", hint: "talaba va o‘qituvchilar blogi: moderatsiya, izohlar", el: <BlogAdminPage /> },
        { to: "/admin/docs", label: "Hujjatlar", icon: <FileText size={18} />, perm: "*", hint: "Word, Excel, PowerPoint — ONLYOFFICE’da yaratish va tahrirlash", el: <DocsPage lang={getAdminLang()} />, sub: [["docs/:id", <DocEditorPage lang={getAdminLang()} />]] },
      ],
    },
    {
      group: "Sayt tuzilishi",
      rail: "site",
      items: [
        { to: "/admin/menu", label: "Menyu", icon: <Menu size={18} />, perm: "menu", hint: "yuqori menyu va futer", el: <MenuPage /> },
        { to: "/admin/home", label: "Bosh sahifa", icon: <LayoutDashboard size={18} />, perm: "home", hint: "bloklar tartibi, bosh ekran", el: <SitePage mode="home" /> },
        { to: "/admin/pages", label: "Sahifalar", icon: <FileText size={18} />, perm: "pages", hint: "institut haqida, qabul…", el: <DocList kind="page" />, sub: [["pages/:id", <DocEditor kind="page" />]] },
        { to: "/admin/media", label: "Media", icon: <Image size={18} />, perm: "media", hint: "rasmlar va fayllar", el: <MediaPage /> },
        { to: "/admin/faq", label: "Savol-javoblar (FAQ)", icon: <HelpCircle size={18} />, perm: "faq", hint: "Aloqa sahifasidagi ko‘p so‘raladigan savollar", el: <FaqAdminPage /> },
        { to: "/admin/popups", label: "E’lon oynasi", icon: <MessageSquareDot size={18} />, perm: "popups", hint: "saytga kirganda chiqadigan oyna", el: <PopupsPage /> },
        { to: "/admin/upgoals", label: "BRM (UpGoals)", icon: <Target size={18} />, perm: "pages", hint: "/upgoals: institut hissasi, faoliyat, hujjatlar", el: <UpGoalsAdminPage /> },
        { to: "/admin/festive", label: "Bayram bezaklari", icon: <PartyPopper size={18} />, perm: "festive", hint: "Yangi yil, Navro‘z, Hayit, Mustaqillik…", el: <FestivePage /> },
      ],
    },
    {
      // talabalar hayoti (admin/campus): mazmuni bo'lmagan bo'lim saytda ko'rinmaydi
      group: "Talabalar hayoti",
      rail: "site",
      items: [
        { to: "/admin/clubs", label: "To‘garaklar va klublar", icon: <IcClubs size={18} />, perm: "student_life", hint: "ilmiy, sport, ijodiy, volontyorlik; qo‘shilish arizalari", el: <ClubsAdmin /> },
        { to: "/admin/sport", label: "Sport", icon: <IcSport size={18} />, perm: "student_life", hint: "yutuqlar va sport inshootlari", el: <SportAdmin /> },
        { to: "/admin/dormitory", label: "Talabalar turar joyi", icon: <IcDorm size={18} />, perm: "student_life", hint: "binolar, qoidalar, ariza berish", el: <DormAdmin /> },
        { to: "/admin/scholarships", label: "Stipendiyalar", icon: <IcAward size={18} />, perm: "student_life", hint: "stipendiyalar va imtiyozlar", el: <ScholarshipsAdmin /> },
        { to: "/admin/gallery", label: "Galereya", icon: <IcGallery size={18} />, perm: "gallery", hint: "albomlar, suratlar (alt matn), videolar", el: <GalleryAdmin /> },
      ],
    },
    {
      group: "Abituriyent",
      rail: "site",
      items: [
        { to: "/admin/admission-steps", label: "Qabul bosqichlari", icon: <IcSteps size={18} />, perm: "admission", hint: "qabul yili bo‘yicha sana va bosqichlar", el: <StepsAdmin /> },
        { to: "/admin/passing-scores", label: "O‘tish ballari", icon: <IcCalc size={18} />, perm: "admission", hint: "kvota va o‘tish ballari, Excel; kalkulyator", el: <ScoresAdmin /> },
        { to: "/admin/parents", label: "Ota-onalar uchun", icon: <IcParents size={18} />, perm: "admission", el: <ParentsAdmin /> },
        { to: "/admin/event-registrations", label: "Tadbirga ro‘yxat", icon: <IcReg size={18} />, perm: "events", hint: "ochiq eshiklar kuni va boshqa tadbirlar: ro‘yxat, Excel, eslatma", el: <EventRegAdmin /> },
        { to: "/admin/campus-map", label: "Kampus xaritasi", icon: <IcMap size={18} />, perm: "admission", hint: "bosh reja va raqamlangan joylar", el: <MapAdmin /> },
        { to: "/admin/virtual-tour", label: "Virtual tur", icon: <IcTour size={18} />, perm: "admission", hint: "360° panoramalar va o‘tish nuqtalari", el: <TourAdmin /> },
      ],
    },
    {
      group: "Kontent",
      rail: "site",
      items: [
        { to: "/admin/news", label: "Yangiliklar", icon: <Newspaper size={18} />, perm: "news", el: <DocList kind="news" />, sub: [["news/:id", <DocEditor kind="news" />]] },
        { to: "/admin/announcements", label: "E’lonlar", icon: <Megaphone size={18} />, perm: "announcements", el: <DocList kind="announce" />, sub: [["announcements/:id", <DocEditor kind="announce" />]] },
        { to: "/admin/events", label: "Tadbirlar", icon: <CalendarDays size={18} />, perm: "events", el: <DocList kind="event" />, sub: [["events/:id", <DocEditor kind="event" />]] },
        { to: "/admin/telegram/posts", label: "Telegram kanal", icon: <Send size={18} />, perm: "site", hint: "kanal va guruhlarga post yozish, tahrirlash", el: <TgPostsPage />, sub: [["telegram/posts/:id", <TgComposerPage />]] },
      ],
    },
    {
      // rasmiy bo'limlar va «institut ruhi» (official.py): bo'sh bo'lim saytda ko'rinmaydi
      group: "Institut sahifalari",
      rail: "site",
      items: [
        { to: "/admin/reception", label: "Qabul jadvali", icon: <IcReception size={18} />, perm: "reception", hint: "rahbariyatning fuqarolarni qabul qilish kunlari va vaqtlari", el: <ReceptionAdmin /> },
        { to: "/admin/open-data", label: "Ochiq ma’lumotlar", icon: <IcOpenData size={18} />, perm: "opendata", hint: "ko‘rsatkichlar va yuklab olinadigan to‘plamlar", el: <OpenDataAdmin /> },
        { to: "/admin/rankings", label: "Reytinglar", icon: <IcRankings size={18} />, perm: "rankings", el: <RankingsAdmin /> },
        { to: "/admin/history", label: "Tarix", icon: <IcHistory size={18} />, perm: "history", hint: "vaqt chizig‘i: yil, voqea, rasm", el: <HistoryAdmin /> },
        { to: "/admin/rector", label: "Rektor murojaati", icon: <IcRector size={18} />, perm: "uni", el: <RectorAdmin /> },
        { to: "/admin/media-mentions", label: "OAV biz haqimizda", icon: <IcMedia size={18} />, perm: "mentions", hint: "maqola, video, TV va radio", el: <MentionsAdmin /> },
        { to: "/admin/privacy", label: "Maxfiylik siyosati", icon: <IcPrivacy size={18} />, perm: "pages", hint: "sahifalar muharririda ochiladi", el: <PrivacyAdmin /> },
      ],
    },
    {
      group: "Ilm-fan",
      rail: "site",
      items: [
        { to: "/admin/journal", label: "Ilmiy jurnal", icon: <BookOpenText size={18} />, perm: "journal", hint: "sonlar, maqolalar, tahrir hay’ati, Google Scholar", el: journalEl, sub: [["journal/articles/:id", journalArticleEl]] },
      ],
    },
    {
      // karyera markazi, hamkorlar va amaliyot bazalari, bitiruvchilar, startaplar, foydali maqolalar (career.py)
      group: "Hamkorlik va karyera",
      rail: "site",
      items: [
        { to: "/admin/career-center", label: "Karyera markazi", icon: <Briefcase size={18} />, perm: "career_center", hint: "imkoniyatlar, kompaniyalar arizalari (moderatsiya), ma’lumot bloki", el: <CareerCenterAdminPage /> },
        { to: "/admin/partners", label: "Hamkorlar", icon: <Handshake size={18} />, perm: "partners", hint: "sanoat, xalqaro, akademik, davlat; amaliyot bazalari", el: <PartnersAdminPage /> },
        { to: "/admin/alumni", label: "Bitiruvchilar", icon: <GraduationCap size={18} />, perm: "alumni", hint: "hikoyalar, ro‘yxat, bandlik statistikasi", el: <AlumniAdminPage /> },
        { to: "/admin/startups", label: "Startaplar", icon: <IcStartups size={18} />, perm: "startups", hint: "talaba va o‘qituvchilar loyihalari", el: <StartupsAdminPage /> },
        { to: "/admin/articles", label: "Foydali maqolalar", icon: <IcArticles size={18} />, perm: "articles", hint: "fan, ta’lim, texnologiyalar; RSS", el: <ArticlesAdminPage /> },
      ],
    },
    {
      group: "Institut",
      rail: "inst",
      items: [
        { to: "/admin/programs", label: "Yo‘nalishlar", icon: <GraduationCap size={18} />, perm: "programs", el: <DocList kind="program" />, sub: [["programs/:id", <DocEditor kind="program" />]] },
        { to: "/admin/tuition", label: "Kontrakt narxlari", icon: <Wallet size={18} />, perm: "programs", hint: "yo‘nalishlar bo‘yicha to‘lov, chegirmalar", el: <TuitionPage /> },
        { to: "/admin/faculties", label: "Kafedralar", icon: <Landmark size={18} />, perm: "faculties", el: <DocList kind="faculty" />, sub: [["faculties/:id", <DocEditor kind="faculty" />]] },
        { to: "/admin/structure", label: "Tuzilma", icon: <Building2 size={18} />, perm: "structure", el: <DocList kind="department" />, sub: [["structure/:id", <DocEditor kind="department" />]] },
        { to: "/admin/professors", label: "Professorlar", icon: <UsersRound size={18} />, perm: "professors", hint: "professor-o‘qituvchilar profillari", el: <ProfessorsPage /> },
        { to: "/admin/faculty-staff", label: "Kafedra xodimlari", icon: <Crown size={18} />, perm: "faculty_staff", hint: "xodimlarni kafedraga biriktirish, mudir", el: <FacultyStaffPage /> },
        { to: "/admin/grants", label: "Grant taqsimoti", icon: <Award size={18} />, perm: "grants", hint: "arizalar, Excel, natijalarni e’lon qilish", el: <GrantsAdminPage /> },
        { to: "/admin/careers", label: "Vakansiyalar", icon: <Briefcase size={18} />, perm: "careers", hint: "Careers: ish o‘rinlari va arizalar", el: <DocList kind="vacancy" />, sub: [["careers/:id", <DocEditor kind="vacancy" />]] },
        { to: "/admin/documents", label: "Hujjatlar", icon: <Layers size={18} />, perm: "documents", el: <DocumentsPage /> },
        { to: "/admin/links", label: "Foydali havolalar", icon: <Link2 size={18} />, perm: "links", el: <LinksPage /> },
      ],
    },
    {
      group: "O‘quv jarayoni",
      rail: "study",
      items: [
        { to: "/admin/schedule", label: "Dars jadvali", icon: <CalendarRange size={18} />, perm: "schedule", el: <SchedulePage /> },
        { to: "/admin/academic", label: "Guruhlar, fanlar, semestrlar", icon: <School size={18} />, perm: "academic", el: <AcademicPage /> },
        { to: "/admin/users", label: "Foydalanuvchilar", icon: <Users size={18} />, perm: "users", hint: "professor-o‘qituvchilar, xodimlar, talabalar", el: <UsersPage /> },
      ],
    },
    {
      group: "Kutubxona",
      rail: "study",
      items: [
        { to: "/admin/library", label: "Kutubxona", icon: <LibraryBig size={18} />, perm: "library", hint: "fond, berish/qaytarish, elektron kitoblar, qarzdorlar", el: libEl, sub: [["library/*", libEl]] },
      ],
    },
    {
      group: "Pochta",
      rail: "settings",
      items: [
        { to: "/admin/mail-server", label: "Pochta serveri", icon: <Server size={18} />, perm: "mail_server", hint: "domen, DNS yozuvlari, Stalwart", el: <MailServerPage /> },
      ],
    },
    {
      group: "Sozlamalar",
      rail: "settings",
      items: [
        { to: "/admin/uni", label: "Institut ma’lumotlari", icon: <Landmark size={18} />, perm: "uni", hint: "nom, logotip, aloqa, raqamlar", el: <UniPage /> },
        { to: "/admin/site", label: "Sayt sozlamalari", icon: <Settings size={18} />, perm: "site", hint: "ranglar, til, kabinet", el: <SitePage /> },
        { to: "/admin/seo", label: "SEO", icon: <SearchCheck size={18} />, perm: "site", hint: "qidiruv tizimlari, kalit so‘zlar, tasdiqlash", el: <SeoPage /> },
        { to: "/admin/hemis", label: "HEMIS", icon: <GraduationCap size={18} />, perm: "site", hint: "HEMIS API: o‘qituvchilar, talabalar, jadval, davomat", el: <HemisPage /> },
        { to: "/admin/telegram", label: "Telegram bot", icon: <Send size={18} />, perm: "site", hint: "virtual qabulxona Telegram’da", el: <TelegramPage /> },
        { to: "/admin/office", label: "ONLYOFFICE", icon: <FileSpreadsheet size={18} />, perm: "site", hint: "hujjat serveri: ko‘rish va tahrirlash", el: <OfficeSettingsPage /> },
        { to: "/admin/storage", label: "Fayl saqlash (S3)", icon: <Cloud size={18} />, perm: "site", hint: "media va fayllar S3 omborida", el: <StoragePage /> },
        { to: "/admin/account", label: "Hisobim", icon: <UserCog size={18} />, perm: "*", el: <AccountPage me={me} onMe={setMe} /> },
      ],
    },
    {
      group: "Boshqaruv",
      rail: "settings",
      items: [
        { to: "/admin/roles", label: "Rollar", icon: <KeyRound size={18} />, perm: "roles", hint: "qaysi rol qaysi bo‘limlarni ko‘radi", el: <RolesPage /> },
        { to: "/admin/admins", label: "Administratorlar", icon: <ShieldCheck size={18} />, perm: "admins", hint: "admin panelga kiradigan hisoblar", el: <AdminsPage me={me} /> },
      ],
    },
  ];
}

const can = (me: Admin, perm: string) => perm === "*" || (me.perms || []).includes(perm);

function NoAccess() {
  return (
    <div className="a-page narrow">
      <Empty icon={<ShieldCheck size={30} />} title="Bu bo‘limga ruxsat yo‘q">
        <p className="a-hint">Rolingizga bu bo‘lim biriktirilmagan. Bosh administratorga murojaat qiling.</p>
      </Empty>
    </div>
  );
}

const SEARCH_TYPES: Record<string, string> = {
  news: "Yangilik", announce: "E’lon", event: "Tadbir", page: "Sahifa", program: "Yo‘nalish", faculty: "Kafedra", department: "Tuzilma", staff: "Professor",
  vacancy: "Vakansiya", partner: "Hamkor", document: "Hujjat", link: "Havola", faq: "Savol-javob", user: "Foydalanuvchi", ticket: "Murojaat", subscriber: "Obunachi",
  club: "Klub", album: "Albom", scholarship: "Stipendiya", dorm: "Yotoqxona",
  opportunity: "Karyera imkoniyati", alumni: "Bitiruvchi", startup: "Startap", insight: "Foydali maqola",
  reception: "Qabul jadvali", dataset: "Ochiq ma’lumotlar", ranking: "Reyting", milestone: "Tarix", mention: "OAV",
};
const searchLabels = (() => {
  const types: Record<string, string> = {};
  for (const [k, v] of Object.entries(SEARCH_TYPES)) types[k] = at(v);
  return { search: at("Qidirish: bo‘lim, yangilik, foydalanuvchi…"), menu: at("Bo‘limlar"), results: at("Natijalar"), none: at("Hech narsa topilmadi"), hint: at("Kamida 2 ta harf kiriting"), types };
})();

function Shell({ me, setMe }: { me: Admin; setMe: (a: Admin | null) => void }) {
  const [dark, toggle] = useTheme();
  const loc = useLocation();
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    if (!can(me, "messages")) return;
    const tick = () =>
      desk
        .board({ assignee: "" })
        .then((r) => setUnread((r.counts.new || 0) + r.tickets.filter((t) => t.unread && t.stage !== "new" && (!t.assignee_id || t.assignee_id === me.id)).length))
        .catch(() => null);
    tick();
    const h = window.setInterval(tick, 60000);
    return () => window.clearInterval(h);
  }, [loc.pathname, me]);
  const mailUnread = useMailUnread(can(me, "mail"));
  const brand = useBrand();
  const editing = /^\/admin\/(news|announcements|events|pages|programs|faculties|structure)\/[^/]+$/.test(loc.pathname);
  const tree = navTree(me, setMe);
  const nav = tree.map((g) => ({ ...g, items: g.items.filter((it) => can(me, it.perm)) })).filter((g) => g.items.length);
  const all = tree.flatMap((g) => g.items);
  const first = nav.flatMap((g) => g.items)[0];
  const menuItems = useMemo(
    () => nav.flatMap((g) => g.items.map((it) => ({ label: at(it.label), to: it.to, icon: it.icon, hint: [g.group, it.hint].filter(Boolean).map((x) => at(x as string)).join(" · "), alt: [it.label, it.hint || "", g.group || ""] }))),
    [me], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const searchFn = useCallback((q: string) => admin.search(q).then((r) => r.items), []);
  const badge = (to: string) => (to === "/admin/desk" ? unread : to === "/admin/mail" ? mailUnread : 0);
  const groups: MdGroup[] = RAILS.map((r) => ({
    id: r.id,
    label: at(r.label),
    icon: r.icon,
    sections: nav
      .filter((g) => g.rail === r.id)
      .map((g) => ({ cap: at(g.group), items: g.items.map((it) => ({ to: it.to, label: at(it.label), icon: it.icon, end: it.end, hint: it.hint ? at(it.hint) : undefined, badge: badge(it.to) })) })),
  })).filter((g) => g.sections.length);
  const has = (to: string) => nav.some((g) => g.items.some((it) => it.to === to));
  const apps: MdLink[] = (
    [
      { to: "/admin/news/new", label: "Yangilik yozish", sub: "yangi maqola", icon: <Newspaper size={20} />, tone: "primary", need: "/admin/news" },
      { to: "/admin/announcements/new", label: "E’lon berish", sub: "saytdagi e’lonlar", icon: <Megaphone size={20} />, tone: "gold", need: "/admin/announcements" },
      { to: "/admin/mail", label: "Mening pochtam", sub: "kiruvchi xatlar", icon: <MailOpen size={20} />, tone: "sky", need: "/admin/mail" },
      { to: "/admin/desk", label: "Murojaatlar", sub: "service desk", icon: <Inbox size={20} />, tone: "red", need: "/admin/desk" },
      { to: "/admin/schedule", label: "Dars jadvali", sub: "jadval tuzish", icon: <CalendarRange size={20} />, tone: "green", need: "/admin/schedule" },
      { to: "/admin/users", label: "Foydalanuvchilar", sub: "talaba va o‘qituvchilar", icon: <Users size={20} />, tone: "primary", need: "/admin/users" },
      { to: "/admin/library", label: "Kutubxona", sub: "fond va kitob berish", icon: <LibraryBig size={20} />, tone: "gold", need: "/admin/library" },
      { to: "/admin/media", label: "Media", sub: "rasmlar va fayllar", icon: <Image size={20} />, tone: "sky", need: "/admin/media" },
    ] as (MdLink & { need: string })[]
  )
    .filter((a) => has(a.need))
    .map(({ need: _n, ...a }) => ({ ...a, label: at(a.label), sub: a.sub && at(a.sub) }));
  const notes: MdLink[] = [
    ...(can(me, "messages") ? [{ to: "/admin/desk", label: at("Murojaatlar"), sub: at("yangi va javobsiz murojaatlar"), icon: <Inbox size={20} />, tone: "red" as const, count: unread }] : []),
    ...(can(me, "mail") ? [{ to: "/admin/mail", label: at("Mening pochtam"), sub: at("o‘qilmagan xatlar"), icon: <MailOpen size={20} />, tone: "sky" as const, count: mailUnread }] : []),
  ];
  const logout = async () => {
    await admin.logout().catch(() => null);
    setMe(null);
  };
  return (
    <MdShell
      editing={editing}
      groups={groups}
      home="/admin"
      brand={{ name: brand?.name || "UNI", sub: at("boshqaruv paneli"), href: "/" }}
      labels={{
        menu: at("Menyu"),
        search: at("Qidirish"),
        apps: at("Tezkor amallar"),
        appsTitle: at("Tezkor amallar"),
        notes: at("Bildirishnomalar"),
        notesEmpty: at("Yangi bildirishnoma yo‘q"),
        theme: dark ? at("Yorug‘ mavzu") : at("Qorong‘i mavzu"),
        profile: at("Profil"),
        logout: at("Chiqish"),
        home: at("Bosh sahifa"),
        site: at("Saytni ochish"),
      }}
      search={(close) => <TopSearch modal onDone={close} quickLabel={at("Tezkor havolalar")} menu={menuItems} fetcher={searchFn} labels={searchLabels} />}
      apps={apps}
      notes={notes}
      lang={
        <TopLang
          value={getAdminLang()}
          title={at("Til")}
          options={ADMIN_LANGS.map((l) => ({ id: l.id, label: l.label, native: LANG_NATIVE[l.id] }))}
          onChange={(l) => {
            setAdminLang(l as AdminLang);
            window.location.reload();
          }}
        />
      }
      user={{
        name: me.name || me.login,
        role: me.role_name || "Administrator",
        email: me.email || me.login,
        photo: me.data?.photo,
        onLogout: logout,
        links: [
          { to: "/admin/account", label: at("Hisobim"), sub: at("profil, parol va xavfsizlik"), icon: <UserCog size={20} />, tone: "primary" },
          ...(can(me, "mail") ? [{ to: "/admin/mail", label: at("Mening pochtam"), sub: at("kiruvchi xatlar"), icon: <MailOpen size={20} />, tone: "sky" as const }] : []),
          { to: "/", label: at("Saytni ochish"), sub: typeof window !== "undefined" ? window.location.host : "", icon: <ExternalLink size={20} />, tone: "green", external: true },
        ],
      }}
      dark={dark}
      onTheme={toggle}
    >
      <Routes>
        <Route index element={can(me, "stats") ? <Dashboard /> : first && first.to !== "/admin" ? <Navigate to={first.to} replace /> : <NoAccess />} />
        {all.flatMap((it) => {
          const ok = can(me, it.perm);
          const path = it.to.replace(/^\/admin\/?/, "");
          if (!path) return [];
          return [<Route key={path} path={path} element={ok ? it.el : <NoAccess />} />, ...(it.sub || []).map(([p, el]) => <Route key={p} path={p} element={ok ? el : <NoAccess />} />)];
        })}
        <Route path="staff" element={<Navigate to="/admin/professors" replace />} />
        <Route path="messages" element={<Navigate to="/admin/desk" replace />} />
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Routes>
    </MdShell>
  );
}

export default function AdminApp() {
  const [me, setMe] = useState<Admin | null | undefined>(undefined);
  const lang = getAdminLang();
  useEffect(() => startTranslator(lang), [lang]);
  useEffect(() => {
    document.title = "Admin";
    document.documentElement.classList.add("admin-root");
    setUnauthorizedHandler(() => setMe(null));
    admin
      .me()
      .then((r) => setMe(r.admin))
      .catch(() => setMe(null));
    return () => {
      document.documentElement.classList.remove("admin-root");
      setUnauthorizedHandler(null);
    };
  }, []);
  return (
    <ToastProvider>
      <ConfirmProvider>
        <ChartLabels.Provider value={DICTS[lang]}>
          {me === undefined ? (
            <Spinner />
          ) : me === null ? (
            <Login onDone={() => admin.me().then((r) => setMe(r.admin)).catch(() => setMe(null))} />
          ) : (
            <Shell me={me} setMe={setMe} />
          )}
        </ChartLabels.Provider>
      </ConfirmProvider>
    </ToastProvider>
  );
}
