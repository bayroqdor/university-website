import "@fontsource-variable/fraunces";
import "@fontsource-variable/fraunces/wght-italic.css";
import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import "@fontsource-variable/lora";
import "@fontsource-variable/plus-jakarta-sans";
import "@fontsource-variable/onest";
import { lazy, StrictMode, Suspense, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { SiteProvider, useSite } from "./lib/site";
import { ChartLabels } from "./rich/labels";
import { SiteLayout } from "./site/Layout";
import { AnnouncementPage, EventPage, NewsItemPage, PageView } from "./site/pages/Article";
import { HomePage } from "./site/pages/Home";
import { LoginPage } from "./site/pages/Login";
import { SymbolsPage } from "./site/pages/Symbols";
import { UpGoalsPage } from "./site/pages/UpGoals";
import { GrantsPage } from "./site/pages/Grants";
import { A11yRoot } from "./a11y/Root";
import { AccessibilityStatementPage } from "./a11y/Statement";
import { SearchPage } from "./site/chrome/Search";
import { campusRoutes } from "./site/campus/routes";
import {
  AboutIndex,
  AdmissionPage,
  AnnouncementsPage,
  ContactPage,
  DepartmentPage,
  EventsPage,
  FacultiesPage,
  FacultyPage,
  LinksPage,
  NewsListPage,
  NotFound,
  ProgramPage,
  ProgramsPage,
  SchedulePage,
  StaffDetailPage,
  StaffPage,
  StructurePage,
  StudentsPage,
  SubscribeStatePage,
  UnsubscribePage,
  RequestPage,
} from "./site/pages/Pages";
import { CareerPage, CareersPage, TelegramPage } from "./site/pages/Careers";
import { DocumentPage } from "./site/pages/DocView";
import "./styles/prose.css";
import "./styles/site.css";
import "./styles/site-uni.css";
import "./styles/uni-theme.css";
import "./styles/festive.css";
import "./styles/festive-scenes.css";
import "./styles/popup.css";
import "./styles/tuition.css";
import "./styles/theme.css";
import "./styles/office.css";

const AdminApp = lazy(() => import("./admin/AdminApp"));
const PortalApp = lazy(() => import("./portal/PortalApp"));
const PrintDoc = lazy(() => import("./print/PrintDoc"));
const OgCard = lazy(() => import("./print/PrintDoc").then((m) => ({ default: m.OgCard })));

function Labels({ children }: { children: ReactNode }) {
  const { t } = useSite();
  return <ChartLabels.Provider value={t}>{children}</ChartLabels.Provider>;
}

function Public() {
  return (
    <SiteProvider>
      <Labels>
        <SiteLayout />
      </Labels>
    </SiteProvider>
  );
}

const TakeTestPage = lazy(() => import("./interactive/Play").then((m) => ({ default: m.TakeTestPage })));
const PlayerPage = lazy(() => import("./interactive/Play").then((m) => ({ default: m.PlayerPage })));
const HostPage = lazy(() => import("./interactive/Play").then((m) => ({ default: m.HostPage })));
const PaperPrintPage = lazy(() => import("./interactive/Play").then((m) => ({ default: m.PaperPrintPage })));
const LibraryCatalog = lazy(() => import("./library/Catalog"));
const LibraryBookPage = lazy(() => import("./library/BookPage"));
const ReaderPage = lazy(() => import("./library/Reader"));
const DocViewPage = lazy(() => import("./office/Docs").then((m) => ({ default: m.DocViewPage })));
const AudioPage = lazy(() => import("./library/Audio"));
const ForumLink = lazy(() => import("./portal/ForumLink"));
const JournalApp = lazy(() => import("./site/journal/JournalApp"));
// rasmiy bo'limlar: me'yoriy hujjatlar, qabul jadvali, ochiq ma'lumotlar, reytinglar, tarix, rektor murojaati, OAV
const official = () => import("./site/official");
const RegulatoryDocsPage = lazy(() => official().then((m) => ({ default: m.RegulatoryDocsPage })));
const ReceptionPage = lazy(() => official().then((m) => ({ default: m.ReceptionPage })));
const OpenDataPage = lazy(() => official().then((m) => ({ default: m.OpenDataPage })));
const RankingsPage = lazy(() => official().then((m) => ({ default: m.RankingsPage })));
const HistoryPage = lazy(() => official().then((m) => ({ default: m.HistoryPage })));
const RectorPage = lazy(() => official().then((m) => ({ default: m.RectorPage })));
const MediaMentionsPage = lazy(() => official().then((m) => ({ default: m.MediaMentionsPage })));
// hamkorlik va karyera: karyera markazi, hamkorlar va amaliyot bazalari, bitiruvchilar, startaplar, foydali maqolalar
const coop = () => import("./site/career");
const CareerCenterPage = lazy(() => coop().then((m) => ({ default: m.CareerCenterPage })));
const OpportunityPage = lazy(() => coop().then((m) => ({ default: m.OpportunityPage })));
const CoopPartnersPage = lazy(() => coop().then((m) => ({ default: m.CooperationPartnersPage })));
const PartnerPage = lazy(() => coop().then((m) => ({ default: m.PartnerPage })));
const AlumniPage = lazy(() => coop().then((m) => ({ default: m.AlumniPage })));
const AlumniStoryPage = lazy(() => coop().then((m) => ({ default: m.AlumniStoryPage })));
const StartupsPage = lazy(() => coop().then((m) => ({ default: m.StartupsPage })));
const StartupPage = lazy(() => coop().then((m) => ({ default: m.StartupPage })));
const ArticlesPage = lazy(() => coop().then((m) => ({ default: m.ArticlesPage })));
const ArticlePage = lazy(() => coop().then((m) => ({ default: m.ArticlePage })));
const loader = <div className="page-loader"><span /></div>;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/admin/library/read/:fid" element={<Suspense fallback={loader}><ReaderPage admin /></Suspense>} />
        <Route path="/admin/library/listen/:fid" element={<Suspense fallback={loader}><AudioPage admin /></Suspense>} />
        <Route path="/admin/*" element={<Suspense fallback={loader}><AdminApp /></Suspense>} />
        <Route path="/student/*" element={<Suspense fallback={loader}><PortalApp role="student" /></Suspense>} />
        <Route path="/teacher/*" element={<Suspense fallback={loader}><PortalApp role="teacher" /></Suspense>} />
        <Route path="/xodim/*" element={<Suspense fallback={loader}><PortalApp role="staff" /></Suspense>} />
        {/* PDF va ijtimoiy tarmoq kartalari uchun (server Chromium orqali ochadi) */}
        {/* Interaktiv: test yechish, «Bilimdon» o'yinchisi va boshlovchi ekrani, qog'oz variantlar */}
        <Route path="/t/:code" element={<Suspense fallback={loader}><TakeTestPage /></Suspense>} />
        <Route path="/b/:pin" element={<Suspense fallback={loader}><PlayerPage /></Suspense>} />
        <Route path="/live/:id" element={<Suspense fallback={loader}><HostPage /></Suspense>} />
        <Route path="/print/iq/:id" element={<Suspense fallback={loader}><PaperPrintPage /></Suspense>} />
        {/* Kutubxona: elektron kitob o'quvchisi va audiokitob pleyeri — to'liq ekran */}
        <Route path="/library/read/:fid" element={<Suspense fallback={loader}><ReaderPage /></Suspense>} />
        <Route path="/library/listen/:fid" element={<Suspense fallback={loader}><AudioPage /></Suspense>} />
        <Route path="/print/og" element={<Suspense fallback={null}><OgCard /></Suspense>} />
        <Route path="/print/og/:section/:slug" element={<Suspense fallback={null}><OgCard /></Suspense>} />
        <Route path="/print/:section/:slug" element={<Suspense fallback={null}><PrintDoc /></Suspense>} />
        <Route path="/login" element={<SiteProvider><LoginPage /></SiteProvider>} />
        {/* ichki forum xabariga ulashilgan havola: kabinetdagi mavzuga yoki kirish sahifasiga yo'naltiradi */}
        <Route path="/forum/:id" element={<Suspense fallback={loader}><ForumLink /></Suspense>} />
        <Route path="/docs/view" element={<Suspense fallback={loader}><DocViewPage /></Suspense>} />
        <Route element={<Public />}>
          <Route index element={<HomePage />} />
          <Route path="about" element={<AboutIndex />} />
          <Route path="about/:slug" element={<PageView />} />
          <Route path="pages/:slug" element={<PageView />} />
          <Route path="programs" element={<ProgramsPage />} />
          <Route path="programs/:slug" element={<ProgramPage />} />
          <Route path="faculties" element={<FacultiesPage />} />
          <Route path="faculties/:slug" element={<FacultyPage />} />
          <Route path="structure" element={<StructurePage />} />
          <Route path="structure/:slug" element={<DepartmentPage />} />
          <Route path="staff" element={<StaffPage />} />
          <Route path="staff/:slug" element={<StaffDetailPage />} />
          <Route path="news" element={<NewsListPage />} />
          <Route path="news/:slug" element={<NewsItemPage />} />
          <Route path="announcements" element={<AnnouncementsPage />} />
          <Route path="announcements/:slug" element={<AnnouncementPage />} />
          <Route path="events" element={<EventsPage />} />
          <Route path="events/:slug" element={<EventPage />} />
          <Route path="admission" element={<AdmissionPage />} />
          <Route path="symbols" element={<SymbolsPage />} />
          <Route path="symbols/:kind" element={<SymbolsPage />} />
          <Route path="grant-redistribution" element={<GrantsPage />} />
          <Route path="grants" element={<Navigate to="/grant-redistribution" replace />} />
          <Route path="upgoals" element={<UpGoalsPage />} />
          <Route path="upgoals/:n" element={<UpGoalsPage />} />
          <Route path="search" element={<SearchPage />} />
          {/* talabalar hayoti, galereya, abituriyent, kampus xaritasi, virtual tur — site/campus */}
          {campusRoutes}
          <Route path="accessibility" element={<AccessibilityStatementPage />} />
          <Route path="students" element={<StudentsPage />} />
          <Route path="documents" element={<Suspense fallback={loader}><RegulatoryDocsPage /></Suspense>} />
          <Route path="reception" element={<Suspense fallback={loader}><ReceptionPage /></Suspense>} />
          <Route path="open-data" element={<Suspense fallback={loader}><OpenDataPage /></Suspense>} />
          <Route path="rankings" element={<Suspense fallback={loader}><RankingsPage /></Suspense>} />
          <Route path="history" element={<Suspense fallback={loader}><HistoryPage /></Suspense>} />
          <Route path="rector" element={<Suspense fallback={loader}><RectorPage /></Suspense>} />
          <Route path="media-mentions" element={<Suspense fallback={loader}><MediaMentionsPage /></Suspense>} />
          <Route path="privacy" element={<Navigate to="/about/maxfiylik-siyosati" replace />} />
          <Route path="document" element={<DocumentPage />} />
          <Route path="partners" element={<Suspense fallback={loader}><CoopPartnersPage /></Suspense>} />
          <Route path="partners/:slug" element={<Suspense fallback={loader}><PartnerPage /></Suspense>} />
          <Route path="career-center" element={<Suspense fallback={loader}><CareerCenterPage /></Suspense>} />
          <Route path="career-center/:slug" element={<Suspense fallback={loader}><OpportunityPage /></Suspense>} />
          <Route path="alumni" element={<Suspense fallback={loader}><AlumniPage /></Suspense>} />
          <Route path="alumni/:slug" element={<Suspense fallback={loader}><AlumniStoryPage /></Suspense>} />
          <Route path="startups" element={<Suspense fallback={loader}><StartupsPage /></Suspense>} />
          <Route path="startups/:slug" element={<Suspense fallback={loader}><StartupPage /></Suspense>} />
          <Route path="articles" element={<Suspense fallback={loader}><ArticlesPage /></Suspense>} />
          <Route path="articles/:slug" element={<Suspense fallback={loader}><ArticlePage /></Suspense>} />
          <Route path="links" element={<LinksPage />} />
          <Route path="schedule" element={<SchedulePage />} />
          <Route path="contact" element={<ContactPage />} />
          <Route path="faq" element={<Navigate to="/contact#faq" replace />} />
          <Route path="careers" element={<CareersPage />} />
          <Route path="telegram" element={<TelegramPage />} />
          <Route path="careers/:slug" element={<CareerPage />} />
          <Route path="library" element={<Suspense fallback={loader}><LibraryCatalog /></Suspense>} />
          <Route path="library/book/:id" element={<Suspense fallback={loader}><LibraryBookPage /></Suspense>} />
          {/* Ilmiy jurnal: arxiv, sonlar, maqolalar (Google Scholar), tahrir hay'ati, qo'lyozma yuborish */}
          <Route path="journal/*" element={<Suspense fallback={loader}><JournalApp /></Suspense>} />
          <Route path="subscribe/confirmed" element={<SubscribeStatePage ok />} />
          <Route path="subscribe/invalid" element={<SubscribeStatePage ok={false} />} />
          <Route path="unsubscribe" element={<UnsubscribePage />} />
          <Route path="request/:token" element={<RequestPage />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
      {/* maxsus imkoniyatlar: panel, Alt+Shift+A, ovozli o'qish — barcha sahifalarda */}
      <A11yRoot />
    </BrowserRouter>
  </StrictMode>,
);

// PWA: oflayn qobiq va oxirgi EPUB kitoblar (faqat yig'ilgan versiyada)
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => null);
  });
}
