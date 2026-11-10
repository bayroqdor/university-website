// Kabinet: HEMIS'dagi ma'lumotlar (talaba — profil, GPA, davomat, baholar, imtihonlar, haftalik jadval; o'qituvchi — haftalik jadval)
import { CalendarDays, ChevronLeft, ChevronRight, ExternalLink, GraduationCap, RefreshCw, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { Lang } from "../../lib/api";
import { Card, Pill, Spinner } from "../../admin/ui";
import { portal, type HemisData } from "../api";
import { usePortal } from "../PortalApp";

const H: Record<Lang, Record<string, string>> = {
  uz: {
    title: "HEMIS ma’lumotlari", sub: "Oliy ta’lim axborot tizimidan", refresh: "Yangilash", open: "HEMIS’ni ochish", faculty: "Fakultet", specialty: "Yo‘nalish", group: "Guruh",
    level: "Kurs", semester: "Semestr", form: "Ta’lim shakli", pay: "To‘lov shakli", status: "Holati", year: "O‘quv yili", gpa: "GPA", credits: "Kredit", debts: "Qarzdor fanlar",
    att: "Davomat (qoldirilgan soatlar)", subject: "Fan", total: "Jami", excused: "Sababli", unexcused: "Sababsiz", grades: "Joriy baholar", exams: "Imtihon natijalari",
    schedule: "Haftalik jadval (HEMIS)", no_lessons: "Bu haftada dars yo‘q", none: "Ma’lumot yo‘q", updated: "Yangilangan", not_linked: "Hisobingiz hali HEMIS bilan bog‘lanmagan — o‘quv bo‘limiga murojaat qiling.",
    error: "HEMIS bilan bog‘lanib bo‘lmadi", lang_n: "Ta’lim tili", birth: "Tug‘ilgan sana", id: "Talaba ID",
  },
  ru: {
    title: "Данные HEMIS", sub: "Из информационной системы высшего образования", refresh: "Обновить", open: "Открыть HEMIS", faculty: "Факультет", specialty: "Направление", group: "Группа",
    level: "Курс", semester: "Семестр", form: "Форма обучения", pay: "Форма оплаты", status: "Статус", year: "Учебный год", gpa: "GPA", credits: "Кредиты", debts: "Задолженности",
    att: "Посещаемость (пропущенные часы)", subject: "Предмет", total: "Всего", excused: "Уважит.", unexcused: "Неуважит.", grades: "Текущие оценки", exams: "Результаты экзаменов",
    schedule: "Расписание на неделю (HEMIS)", no_lessons: "На этой неделе занятий нет", none: "Нет данных", updated: "Обновлено", not_linked: "Ваш аккаунт ещё не связан с HEMIS — обратитесь в учебный отдел.",
    error: "Не удалось связаться с HEMIS", lang_n: "Язык обучения", birth: "Дата рождения", id: "ID студента",
  },
  en: {
    title: "HEMIS data", sub: "From the higher education information system", refresh: "Refresh", open: "Open HEMIS", faculty: "Faculty", specialty: "Programme", group: "Group",
    level: "Year", semester: "Semester", form: "Study mode", pay: "Payment", status: "Status", year: "Academic year", gpa: "GPA", credits: "Credits", debts: "Failed subjects",
    att: "Attendance (missed hours)", subject: "Subject", total: "Total", excused: "Excused", unexcused: "Unexcused", grades: "Current grades", exams: "Exam results",
    schedule: "Weekly timetable (HEMIS)", no_lessons: "No classes this week", none: "No data", updated: "Updated", not_linked: "Your account is not linked to HEMIS yet — please contact the academic office.",
    error: "Could not reach HEMIS", lang_n: "Language", birth: "Date of birth", id: "Student ID",
  },
};

const fmtD = (iso: string | null | undefined, lang: Lang, time = false) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString(lang === "uz" ? "ru-RU" : lang, { day: "2-digit", month: "2-digit", ...(time ? {} : { year: "numeric" }), timeZone: "Asia/Tashkent" });
};

function weekStart(d: Date): string {
  const x = new Date(d);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x.toISOString().slice(0, 10);
}

export function HemisPanel() {
  const { user, lang } = usePortal();
  const l = H[lang] || H.uz;
  const [d, setD] = useState<HemisData | null>(null);
  const [busy, setBusy] = useState(false);
  const [week, setWeek] = useState(weekStart(new Date()));
  const load = useCallback(
    (force = false) => {
      setBusy(true);
      portal
        .hemis(force, week)
        .then(setD)
        .catch(() => setD({ enabled: true, error: "network" } as HemisData))
        .finally(() => setBusy(false));
    },
    [week],
  );
  useEffect(() => {
    load();
  }, [load]);
  if (!d) return null;
  if (!d.enabled) return null;
  const p = d.profile || {};
  const shift = (n: number) => {
    const x = new Date(week);
    x.setDate(x.getDate() + 7 * n);
    setWeek(x.toISOString().slice(0, 10));
  };
  const head = (
    <span className="hm-actions">
      {d.portal_url && (
        <a className="a-btn ghost sm" href={d.portal_url} target="_blank" rel="noreferrer">
          <ExternalLink size={14} /> {l.open}
        </a>
      )}
      <button className="a-btn ghost sm" onClick={() => load(true)} disabled={busy}>
        <RefreshCw size={14} className={busy ? "spin" : ""} /> {l.refresh}
      </button>
    </span>
  );
  if (d.error)
    return (
      <Card title={l.title} sub={l.sub} actions={head}>
        <p className="a-hint">{d.error === "not_linked" ? l.not_linked : `${l.error} (${d.error})`}</p>
      </Card>
    );
  const days = new Map<string, NonNullable<HemisData["schedule"]>>();
  for (const x of d.schedule || []) {
    const k = (x.date || "").slice(0, 10);
    days.set(k, [...(days.get(k) || []), x]);
  }
  const lastGpa = (d.gpa || [])[0];
  return (
    <div className="hm">
      <Card
        title={
          <span className="hm-title">
            <ShieldCheck size={18} /> {l.title}
          </span>
        }
        sub={d.fetched ? `${l.updated}: ${fmtD(d.fetched, lang, true)}` : l.sub}
        actions={head}
      >
        {user.role === "student" && (
          <>
            <div className="hm-kpis">
              <div>
                <small>{l.gpa}</small>
                <b>{lastGpa?.gpa ?? p.avg_gpa ?? "—"}</b>
              </div>
              <div>
                <small>{l.credits}</small>
                <b>{lastGpa?.credits ?? p.total_credit ?? "—"}</b>
              </div>
              <div>
                <small>{l.level}</small>
                <b>{p.level || "—"}</b>
              </div>
              <div>
                <small>{l.unexcused}</small>
                <b className={(d.attendance_by_subject || []).reduce((a, x) => a + x.unexcused, 0) > 0 ? "bad" : ""}>{(d.attendance_by_subject || []).reduce((a, x) => a + x.unexcused, 0)}</b>
              </div>
            </div>
            <div className="hm-grid">
              {(
                [
                  [l.id, p.student_id_number],
                  [l.faculty, p.faculty],
                  [l.specialty, p.specialty],
                  [l.group, p.group],
                  [l.semester, p.semester],
                  [l.year, p.education_year],
                  [l.form, p.education_form],
                  [l.pay, p.payment_form],
                  [l.lang_n, p.education_lang],
                  [l.status, p.status],
                ] as [string, unknown][]
              )
                .filter(([, v]) => v)
                .map(([k, v]) => (
                  <div key={k}>
                    <small>{k}</small>
                    <b>{String(v)}</b>
                  </div>
                ))}
            </div>
          </>
        )}
      </Card>

      <Card
        title={
          <span className="hm-title">
            <CalendarDays size={18} /> {l.schedule}
          </span>
        }
        actions={
          <span className="hm-week">
            <button className="a-icon" onClick={() => shift(-1)} aria-label="prev">
              <ChevronLeft size={16} />
            </button>
            <b>{fmtD(week, lang)}</b>
            <button className="a-icon" onClick={() => shift(1)} aria-label="next">
              <ChevronRight size={16} />
            </button>
          </span>
        }
      >
        {busy && !d.schedule ? (
          <Spinner />
        ) : days.size ? (
          <div className="hm-days">
            {[...days.entries()].map(([k, list]) => (
              <div key={k} className="hm-day">
                <b>{new Date(k).toLocaleDateString(lang === "uz" ? "uz-UZ" : lang, { weekday: "long", day: "2-digit", month: "2-digit" })}</b>
                {list.map((x, i) => (
                  <div key={i} className="hm-lesson">
                    <span className="hm-time">
                      {x.start}
                      {x.end ? `–${x.end}` : ""}
                    </span>
                    <span>
                      <b>{x.subject}</b>
                      <small>{[x.type, x.room, user.role === "student" ? x.teacher : x.group].filter(Boolean).join(" · ")}</small>
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        ) : (
          <p className="a-hint">{l.no_lessons}</p>
        )}
      </Card>

      {user.role === "student" && (
        <>
          <Card title={l.att}>
            {(d.attendance_by_subject || []).length ? (
              <div className="a-table-scroll">
                <table className="a-table">
                  <thead>
                    <tr>
                      <th>{l.subject}</th>
                      <th>{l.total}</th>
                      <th>{l.excused}</th>
                      <th>{l.unexcused}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(d.attendance_by_subject || []).map((x) => (
                      <tr key={x.subject}>
                        <td>{x.subject}</td>
                        <td>{x.hours}</td>
                        <td>{x.excused}</td>
                        <td>{x.unexcused ? <Pill tone="bad">{x.unexcused}</Pill> : 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="a-hint">{l.none}</p>
            )}
          </Card>
          <div className="a-grid2 top">
            <Card title={l.exams}>
              {(d.exams || []).length ? (
                <div className="a-table-scroll">
                  <table className="a-table">
                    <tbody>
                      {(d.exams || []).slice(0, 30).map((x, i) => (
                        <tr key={i}>
                          <td>
                            <b>{x.subject}</b>
                            <small className="hm-sub">
                              {[x.exam, x.final, x.semester].filter(Boolean).join(" · ")} · {fmtD(x.date, lang)}
                            </small>
                          </td>
                          <td className="num">
                            <Pill tone={Number(x.grade) >= 60 || (Number(x.grade) <= 5 && Number(x.grade) >= 3) ? "ok" : "warn"}>{x.grade ?? "—"}</Pill>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="a-hint">{l.none}</p>
              )}
            </Card>
            <Card title={l.grades}>
              {(d.grades || []).length ? (
                <div className="a-table-scroll">
                  <table className="a-table">
                    <tbody>
                      {(d.grades || []).slice(0, 30).map((x, i) => (
                        <tr key={i}>
                          <td>
                            <b>{x.subject}</b>
                            <small className="hm-sub">
                              {[x.type, x.teacher].filter(Boolean).join(" · ")} · {fmtD(x.date, lang)}
                            </small>
                          </td>
                          <td className="num">
                            <Pill tone="accent">{x.grade ?? "—"}</Pill>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="a-hint">{l.none}</p>
              )}
            </Card>
          </div>
          {(d.gpa || []).length > 0 && (
            <Card
              title={
                <span className="hm-title">
                  <GraduationCap size={18} /> GPA
                </span>
              }
            >
              <div className="a-table-scroll">
                <table className="a-table">
                  <thead>
                    <tr>
                      <th>{l.year}</th>
                      <th>{l.level}</th>
                      <th>{l.gpa}</th>
                      <th>{l.credits}</th>
                      <th>{l.debts}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(d.gpa || []).map((x, i) => (
                      <tr key={i}>
                        <td>{x.year}</td>
                        <td>{x.level}</td>
                        <td>
                          <b>{x.gpa}</b>
                        </td>
                        <td>{x.credits ?? "—"}</td>
                        <td>{x.debts ?? 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
