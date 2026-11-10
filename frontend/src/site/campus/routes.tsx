// Talabalar hayoti va abituriyent sahifalari — alohida (lazy) bo'laklar; virtual tur (Pannellum) — o'z bo'lagida.
import { lazy, Suspense, type ReactNode } from "react";
import { Route } from "react-router-dom";

const L = lazy(() => import("./Life").then((m) => ({ default: m.StudentLifePage })));
const Clubs = lazy(() => import("./Life").then((m) => ({ default: m.ClubsPage })));
const ClubP = lazy(() => import("./Life").then((m) => ({ default: m.ClubPage })));
const Sport = lazy(() => import("./Life").then((m) => ({ default: m.SportPage })));
const Dorm = lazy(() => import("./Life").then((m) => ({ default: m.DormitoryPage })));
const Sch = lazy(() => import("./Life").then((m) => ({ default: m.ScholarshipsPage })));
const Gal = lazy(() => import("./Gallery").then((m) => ({ default: m.GalleryPage })));
const Alb = lazy(() => import("./Gallery").then((m) => ({ default: m.AlbumPage })));
const Steps = lazy(() => import("./Admission").then((m) => ({ default: m.StepsPage })));
const Calc = lazy(() => import("./Admission").then((m) => ({ default: m.CalculatorPage })));
const Par = lazy(() => import("./Admission").then((m) => ({ default: m.ParentsPage })));
const MapP = lazy(() => import("./Map").then((m) => ({ default: m.CampusMapPage })));
const Tour = lazy(() => import("./Tour"));

const fallback = <div className="page-loader"><span /></div>;
const S = (el: ReactNode) => <Suspense fallback={fallback}>{el}</Suspense>;

/** Ochiq sayt yo'llari (main.tsx dagi Public layout ichida). */
export const campusRoutes = [
  <Route key="sl" path="student-life" element={S(<L />)} />,
  <Route key="cl" path="clubs" element={S(<Clubs />)} />,
  <Route key="cl1" path="clubs/:slug" element={S(<ClubP />)} />,
  <Route key="sp" path="sport" element={S(<Sport />)} />,
  <Route key="dm" path="dormitory" element={S(<Dorm />)} />,
  <Route key="sc" path="scholarships" element={S(<Sch />)} />,
  <Route key="ga" path="gallery" element={S(<Gal />)} />,
  <Route key="ga1" path="gallery/:slug" element={S(<Alb />)} />,
  <Route key="st" path="admission/steps" element={S(<Steps />)} />,
  <Route key="ca" path="admission/calculator" element={S(<Calc />)} />,
  <Route key="pa" path="parents" element={S(<Par />)} />,
  <Route key="mp" path="campus-map" element={S(<MapP />)} />,
  <Route key="vt" path="virtual-tour" element={S(<Tour />)} />,
];
