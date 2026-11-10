// Talaba va o'qituvchi kabinetlari: umumiy qobiq, rolga qarab menyu va sahifalar
import {
  Bell,
  Briefcase,
  BookMarked,
  CalendarRange,
  LayoutGrid,
  Newspaper,
  NotebookPen,
  BookOpen,
  Library,
  Mail,
  MessageCircle,
  Quote,
  CalendarDays,
  ClipboardCheck,
  ExternalLink,
  FileText,
  FolderOpen,
  GraduationCap,
  Heart,
  Home,
  Landmark,
  MessagesSquare,
  Presentation,
  UserRound,
  Users,
  Zap,
} from "lucide-react";
import {
  createContext,
  lazy,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { TopLang, TopSearch } from "../lib/TopBar";
import "../styles/admin.css";
import "../styles/admin-uni.css";
import "../styles/portal.css";
import "../styles/shell.css";
import { MdShell, type MdGroup, type MdLink } from "../lib/MdShell";
import {
  auth,
  isLang,
  setUnauthorizedHandler,
  type Lang,
  type Role,
  type User,
} from "../lib/api";
import { LANG_NATIVE } from "../lib/i18n";
import { ConfirmProvider, Spinner, ToastProvider } from "../admin/ui";
import { portal, type Me, type Notice } from "./api";
import { PDICTS, type PDict } from "./i18n";
import { NoticesPage, ProfilePage, SchedulePage } from "./pages/Common";
import { CareerPortalPage } from "./pages/Career";
import MailApp, { useMailUnread } from "../mail/MailApp";
import { StaffDashboard, TeacherFaculty } from "./pages/Staff";
import { ago, BlogEditPage, BlogPage, BlogPostPage, forumNotice } from "./pages/Blog";
import { ADICTS } from "./apps-i18n";
import { CalendarPage } from "./pages/Calendar";
import { NotesPage } from "./pages/Notes";
import {
  StudentAssignments,
  StudentAttendance,
  StudentDashboard,
  StudentGrades,
  StudentMaterials,
} from "./pages/Student";
import {
  TeacherAssignments,
  TeacherAttendance,
  TeacherCourses,
  TeacherDashboard,
  TeacherJournal,
  TeacherMaterials,
  TeacherNotices,
} from "./pages/Teacher";
import { useBrand } from "../lib/brand";

interface Ctx {
  me: Me;
  user: User;
  t: PDict;
  lang: Lang;
  setLang: (l: Lang) => void;
  reload: () => void;
}
const PortalCtx = createContext<Ctx | null>(null);
export function usePortal(): Ctx {
  const c = useContext(PortalCtx);
  if (!c) throw new Error("PortalProvider missing");
  return c;
}

function storedLang(): Lang {
  try {
    const v = localStorage.getItem("lang");
    return isLang(v) ? v : "uz";
  } catch {
    return "uz";
  }
}

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

const InteractiveRoutes = lazy(() => import("../interactive/Teacher").then((m) => ({ default: m.InteractiveRoutes })));
const MyLibraryPage = lazy(() => import("../library/Portal").then((m) => ({ default: m.MyLibraryPage })));
const TeacherListsPage = lazy(() => import("../library/Portal").then((m) => ({ default: m.TeacherListsPage })));
const CabinetBookPage = lazy(() => import("../library/Portal").then((m) => ({ default: m.CabinetBookPage })));
const CabinetCatalogPage = lazy(() => import("../library/Portal").then((m) => ({ default: m.CabinetCatalogPage })));
const DocsPage = lazy(() => import("../office/Docs").then((m) => ({ default: m.DocsPage })));
const DocEditorPage = lazy(() => import("../office/Docs").then((m) => ({ default: m.DocEditorPage })));
const MyTestsPage = lazy(() => import("../interactive/Student").then((m) => ({ default: m.MyTestsPage })));

type PRole = "student" | "teacher" | "staff";
type NavIt = { to: string; key: keyof PDict; icon: ReactNode; end?: boolean; group: keyof PDict };
const NAV: Record<PRole, NavIt[]> = {
  student: [
    { to: "", key: "dashboard", icon: <Home size={17} />, end: true, group: "g_study" },
    { to: "schedule", key: "schedule", icon: <CalendarDays size={17} />, group: "g_study" },
    { to: "grades", key: "grades", icon: <GraduationCap size={17} />, group: "g_study" },
    { to: "attendance", key: "attendance", icon: <ClipboardCheck size={17} />, group: "g_study" },
    { to: "tests", key: "tests", icon: <Zap size={17} />, group: "g_study" },
    { to: "assignments", key: "assignments", icon: <BookOpen size={17} />, group: "g_study" },
    { to: "materials", key: "materials", icon: <FolderOpen size={17} />, group: "g_study" },
    { to: "library", key: "library", icon: <Library size={17} />, group: "g_study" },
    { to: "career", key: "career", icon: <Briefcase size={17} />, group: "g_study" },
    { to: "blog", key: "blog", icon: <Newspaper size={17} />, group: "g_apps" },
    { to: "calendar", key: "calendar", icon: <CalendarRange size={17} />, group: "g_apps" },
    { to: "notes", key: "notes_app", icon: <NotebookPen size={17} />, group: "g_apps" },
    { to: "docs", key: "docs_app", icon: <FileText size={17} />, group: "g_apps" },
    { to: "mail", key: "mail", icon: <Mail size={17} />, group: "g_comm" },
    { to: "notices", key: "notices", icon: <Bell size={17} />, group: "g_comm" },
    { to: "profile", key: "profile", icon: <UserRound size={17} />, group: "g_account" },
  ],
  teacher: [
    { to: "", key: "dashboard", icon: <Home size={17} />, end: true, group: "g_teach" },
    { to: "schedule", key: "schedule", icon: <CalendarDays size={17} />, group: "g_teach" },
    { to: "courses", key: "courses", icon: <Users size={17} />, group: "g_teach" },
    { to: "attendance", key: "attendance", icon: <ClipboardCheck size={17} />, group: "g_teach" },
    { to: "journal", key: "journal", icon: <GraduationCap size={17} />, group: "g_teach" },
    { to: "interactive", key: "interactive", icon: <Zap size={17} />, group: "g_teach" },
    { to: "assignments", key: "assignments", icon: <BookOpen size={17} />, group: "g_teach" },
    { to: "materials", key: "materials", icon: <FolderOpen size={17} />, group: "g_teach" },
    { to: "library", key: "library", icon: <Library size={17} />, group: "g_teach" },
    { to: "reading-lists", key: "lit_lists", icon: <BookMarked size={17} />, group: "g_teach" },
    { to: "faculty", key: "my_faculty", icon: <Landmark size={17} />, group: "g_teach" },
    { to: "blog", key: "blog", icon: <Newspaper size={17} />, group: "g_apps" },
    { to: "calendar", key: "calendar", icon: <CalendarRange size={17} />, group: "g_apps" },
    { to: "notes", key: "notes_app", icon: <NotebookPen size={17} />, group: "g_apps" },
    { to: "docs", key: "docs_app", icon: <FileText size={17} />, group: "g_apps" },
    { to: "mail", key: "mail", icon: <Mail size={17} />, group: "g_comm" },
    { to: "notices", key: "notices", icon: <Bell size={17} />, group: "g_comm" },
    { to: "profile", key: "profile", icon: <UserRound size={17} />, group: "g_account" },
  ],
  staff: [
    { to: "", key: "dashboard", icon: <Home size={17} />, end: true, group: "g_study" },
    { to: "schedule", key: "schedule", icon: <CalendarDays size={17} />, group: "g_study" },
    { to: "blog", key: "blog", icon: <Newspaper size={17} />, group: "g_apps" },
    { to: "calendar", key: "calendar", icon: <CalendarRange size={17} />, group: "g_apps" },
    { to: "notes", key: "notes_app", icon: <NotebookPen size={17} />, group: "g_apps" },
    { to: "docs", key: "docs_app", icon: <FileText size={17} />, group: "g_apps" },
    { to: "mail", key: "mail", icon: <Mail size={17} />, group: "g_comm" },
    { to: "notices", key: "notices", icon: <Bell size={17} />, group: "g_comm" },
    { to: "profile", key: "profile", icon: <UserRound size={17} />, group: "g_account" },
  ],
};

/** Qo'ng'iroqcha: shaxsiy o'qilmagan bildirishnomalar (forum: yoqtirish, javob, iqtibos). Har daqiqada, sahifa almashganda va
 *  oynaga qaytilganda yangilanadi; mavzu sahifasi ochilganda unga oid bildirishnomalar o'qilgan hisoblanadi. */
function useNotifications(base: string) {
  const [items, setItems] = useState<Notice[]>([]);
  const { pathname } = useLocation();
  const load = useCallback(() => portal.notifications().then((r) => setItems(r.items)).catch(() => null), []);
  const seen = useCallback((ids?: string[]) => {
    setItems((x) => (ids ? x.filter((n) => !ids.includes(n.id)) : []));
    portal.notificationsSeen(ids).catch(() => null);
  }, []);
  useEffect(() => {
    load();
  }, [load, pathname]);
  useEffect(() => {
    const iv = window.setInterval(load, 60000);
    const vis = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", vis);
    return () => {
      window.clearInterval(iv);
      document.removeEventListener("visibilitychange", vis);
    };
  }, [load]);
  useEffect(() => {
    const m = pathname.match(new RegExp(`^${base}/blog/([\\w-]+)$`));
    const ids = m ? items.filter((n) => n.ref === m[1]).map((n) => n.id) : [];
    if (ids.length) seen(ids);
  }, [pathname, items, base, seen]);
  return { items, seen };
}

function Shell({
  role,
  me,
  reload,
}: {
  role: PRole;
  me: Me;
  reload: () => void;
}) {
  const [dark, toggle] = useTheme();
  const [lang, setLangState] = useState<Lang>(storedLang);
  const nav = useNavigate();
  const t = PDICTS[lang];
  const setLang = (l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem("lang", l);
    } catch {
      /* */
    }
    document.cookie = `lang=${l}; path=/; max-age=31536000; samesite=lax`;
  };
  useEffect(() => {
    document.title = role === "student" ? t.student_portal : role === "staff" ? t.staff_portal : t.teacher_portal;
    document.documentElement.lang = lang;
  }, [role, t, lang]);
  const base = role === "staff" ? "/xodim" : `/${role}`;
  const ctx = useMemo<Ctx>(
    () => ({ me, user: me.user, t, lang, setLang, reload }),
    [me, t, lang, reload],
  );
  const u = me.user;
  const brand = useBrand();
  const unread = useMailUnread();
  const notif = useNotifications(base);
  const at = ADICTS[lang] || ADICTS.uz;
  const NIC: Record<string, ReactNode> = { blog_like: <Heart size={20} />, blog_comment: <MessageCircle size={20} />, blog_quote: <Quote size={20} /> };
  const notifRows: MdLink[] = notif.items.flatMap((n) => {
    if (n.kind === "career")
      return [{ to: `${base}/career`, label: n.title, sub: ago(n.created, lang), icon: <Briefcase size={20} />, tone: "primary" as const, unread: true, onOpen: () => notif.seen([n.id]) }];
    const f = forumNotice(n, lang, base);
    return f
      ? [{ to: f.to, label: f.text, sub: `«${n.meta?.post || ""}» · ${ago(n.created, lang)}`, icon: NIC[n.kind || ""] || <Bell size={20} />, tone: n.kind === "blog_like" ? ("red" as const) : ("primary" as const), unread: true, onOpen: () => notif.seen([n.id]) }]
      : [];
  });
  const navItems = NAV[role].filter(
    (it) => (it.to !== "faculty" || (me.editable_faculties || []).length > 0) && (role !== "staff" || it.to !== "schedule" || (me.section_ids || []).includes("study")),
  );
  const menuItems = useMemo(() => navItems.map((it) => ({ label: t[it.key] as string, to: it.to ? `${base}/${it.to}` : base, icon: it.icon, hint: t[it.group] as string })), [navItems.length, t, base]); // eslint-disable-line react-hooks/exhaustive-deps
  const searchFn = useCallback((q: string) => portal.search(q, lang).then((r) => r.items), [lang]);
  const RAIL_IC: Record<string, ReactNode> = { g_study: <GraduationCap size={22} />, g_teach: <Presentation size={22} />, g_apps: <LayoutGrid size={22} />, g_comm: <MessagesSquare size={22} />, g_account: <UserRound size={22} /> };
  const groups: MdGroup[] = [...new Set(navItems.map((it) => it.group))].map((gk) => ({
    id: gk,
    label: t[gk] as string,
    icon: RAIL_IC[gk] || <Home size={22} />,
    sections: [
      {
        cap: t[gk] as string,
        items: navItems
          .filter((it) => it.group === gk)
          .map((it) => ({ to: it.to ? `${base}/${it.to}` : base, label: t[it.key] as string, icon: it.icon, end: it.end, badge: it.to === "mail" ? unread : 0 })),
      },
    ],
  }));
  const quick: MdLink[] = navItems
    .filter((it) => it.to && it.group !== "g_account")
    .slice(0, 8)
    .map((it, i) => ({ to: `${base}/${it.to}`, label: t[it.key] as string, sub: t[it.group] as string, icon: it.icon, tone: (["primary", "sky", "green", "gold", "red"] as const)[i % 5] }));
  const logout = async () => {
    await auth.logout().catch(() => null);
    nav("/login", { replace: true });
  };
  const portalName = role === "student" ? t.student_portal : role === "staff" ? t.staff_portal : t.teacher_portal;
  return (
    <PortalCtx.Provider value={ctx}>
      <MdShell
        groups={groups}
        home={base}
        brand={{ name: brand?.name || "UNI", sub: portalName, href: "/" }}
        labels={{
          menu: t.sr_menu,
          search: t.md_search,
          apps: t.md_apps,
          appsTitle: t.md_apps,
          notes: t.notices,
          notesEmpty: t.md_notes_empty,
          theme: dark ? t.md_theme_light : t.md_theme_dark,
          profile: t.profile,
          logout: t.logout,
          home: t.dashboard,
          site: t.md_open_site,
        }}
        search={(close) => (
          <TopSearch modal onDone={close} quickLabel={t.md_quick} menu={menuItems} fetcher={searchFn} labels={{ search: t.sr_ph, menu: t.sr_menu, results: t.sr_results, none: t.sr_none, hint: t.sr_hint, types: t.sr_types }} />
        )}
        apps={quick}
        notes={[
          ...notifRows,
          { to: `${base}/mail`, label: t.mail, sub: t.md_unread_mail, icon: <Mail size={20} />, tone: "sky", count: unread },
        ]}
        notesFoot={notifRows.length ? <button type="button" onClick={() => notif.seen()}>{at.n_read_all}</button> : null}
        lang={<TopLang value={lang} title={t.lang_title} options={(Object.keys(LANG_NATIVE) as Lang[]).map((l) => ({ id: l, label: l.toUpperCase(), native: LANG_NATIVE[l] }))} onChange={(l) => setLang(l as Lang)} />}
        user={{
          name: u.name || u.login,
          role: role === "student" ? me.group?.name || portalName : u.data?.position || portalName,
          email: u.email || "@" + u.login,
          photo: u.data?.photo,
          onLogout: logout,
          links: [
            { to: `${base}/profile`, label: t.profile, sub: t.md_profile_sub, icon: <UserRound size={20} />, tone: "primary" },
            { to: `${base}/mail`, label: t.mail, sub: t.md_unread_mail, icon: <Mail size={20} />, tone: "sky", count: unread },
            { to: "/", label: t.md_open_site, sub: typeof window !== "undefined" ? window.location.host : "", icon: <ExternalLink size={20} />, tone: "green", external: true },
          ],
        }}
        dark={dark}
        onTheme={toggle}
      >
          <Suspense fallback={<Spinner />}>
          <Routes>
            {role === "staff" ? (
              <>
                <Route index element={<StaffDashboard />} />
                <Route path="schedule" element={<SchedulePage />} />
              </>
            ) : role === "student" ? (
              <>
                <Route index element={<StudentDashboard />} />
                <Route path="schedule" element={<SchedulePage />} />
                <Route path="grades" element={<StudentGrades />} />
                <Route path="attendance" element={<StudentAttendance />} />
                <Route path="assignments" element={<StudentAssignments />} />
                <Route path="materials" element={<StudentMaterials />} />
                <Route path="tests" element={<MyTestsPage />} />
                <Route path="career" element={<CareerPortalPage />} />
                <Route path="library" element={<MyLibraryPage />} />
              </>
            ) : (
              <>
                <Route index element={<TeacherDashboard />} />
                <Route path="schedule" element={<SchedulePage />} />
                <Route path="courses" element={<TeacherCourses />} />
                <Route path="attendance" element={<TeacherAttendance />} />
                <Route path="journal" element={<TeacherJournal />} />
                <Route path="assignments" element={<TeacherAssignments />} />
                <Route path="materials" element={<TeacherMaterials />} />
                <Route path="faculty" element={<TeacherFaculty />} />
                <Route path="interactive/*" element={<InteractiveRoutes />} />
                <Route path="library" element={<MyLibraryPage />} />
                <Route path="reading-lists" element={<TeacherListsPage />} />
              </>
            )}
            {/* kutubxona katalogi va kitob sahifasi kabinet ichida (o'quvchidan qaytganda ham shu yerga) */}
            <Route path="library/catalog" element={<CabinetCatalogPage />} />
            <Route path="library/book/:id" element={<CabinetBookPage />} />
            <Route path="blog" element={<BlogPage />} />
            <Route path="blog/new" element={<BlogEditPage />} />
            <Route path="blog/author/:uid" element={<BlogPage />} />
            <Route path="blog/:id" element={<BlogPostPage />} />
            <Route path="blog/:id/edit" element={<BlogEditPage />} />
            <Route path="calendar" element={<CalendarPage />} />
            <Route path="notes" element={<NotesPage />} />
            <Route path="docs" element={<Suspense fallback={<Spinner />}><DocsPage lang={lang} /></Suspense>} />
            <Route path="docs/:id" element={<Suspense fallback={<Spinner />}><DocEditorPage lang={lang} /></Suspense>} />
            <Route path="mail" element={<MailApp lang={lang} />} />
            <Route
              path="notices"
              element={
                role === "teacher" ? <TeacherNotices /> : <NoticesPage />
              }
            />
            <Route path="profile" element={<ProfilePage />} />
            <Route path="*" element={<Navigate to={base} replace />} />
          </Routes>
          </Suspense>
      </MdShell>
    </PortalCtx.Provider>
  );
}

export default function PortalApp({ role }: { role: PRole }) {
  const [me, setMe] = useState<Me | null | "anon" | "wrong">(null);
  const [tick, setTick] = useState(0);
  const nav = useNavigate();
  useEffect(() => {
    document.documentElement.classList.add("admin-root");
    setUnauthorizedHandler(() => setMe("anon"));
    portal
      .me()
      .then((m) => setMe(m.user.role === role ? m : "wrong"))
      .catch(() => setMe("anon"));
    return () => {
      document.documentElement.classList.remove("admin-root");
      setUnauthorizedHandler(null);
    };
  }, [role, tick]);
  useEffect(() => {
    // forum mavzusi havolasi (/student/blog/<id> va h.k.) — kirgandan keyin / o'z kabinetida o'sha mavzuga qaytish
    const m = window.location.pathname.match(/^\/(student|teacher|xodim)\/blog\/([\w-]{1,40})$/);
    const post = m && m[2] !== "new" ? m[2] : "";
    const hash = /^#c-[\w-]{1,40}$/.test(window.location.hash) ? window.location.hash : "";
    // kabinetdagi kitob sahifasi havolasi — kirgandan keyin / boshqa kabinetda o'sha kitobga
    const bm = window.location.pathname.match(/^\/(student|teacher|xodim)\/library\/book\/([A-Za-z0-9_-]{4,40})$/);
    const book = bm ? bm[2] : "";
    const login = post ? `/login?next=${encodeURIComponent(`/forum/${post}${hash}`)}` : book ? `/login?next=${encodeURIComponent(window.location.pathname)}` : "/login";
    if (me === "anon") nav(login, { replace: true });
    if (me === "wrong")
      auth
        .me()
        .then((r) => nav(post && r.home !== "/admin" ? `${r.home}/blog/${post}${hash}` : book ? (r.home !== "/admin" ? `${r.home}/library/book/${book}` : `/library/book/${book}`) : r.home, { replace: true }))
        .catch(() => nav(login, { replace: true }));
  }, [me, nav]);
  if (!me || me === "anon" || me === "wrong") return <Spinner />;
  const r: Role = me.user.role;
  if (r !== "student" && r !== "teacher" && r !== "staff") return <Spinner />;
  return (
    <ToastProvider>
      <ConfirmProvider>
        <Shell role={role} me={me} reload={() => setTick((x) => x + 1)} />
      </ConfirmProvider>
    </ToastProvider>
  );
}
