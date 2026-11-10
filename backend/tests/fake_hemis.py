from __future__ import annotations

import httpx


def hemis_transport() -> httpx.MockTransport:
    def h(request: httpx.Request) -> httpx.Response:
        p = request.url.path
        page = lambda items: httpx.Response(200, json={"success": True, "data": {"items": items, "pagination": {"pageCount": 1, "totalCount": len(items)}}})
        if p.endswith("/public/student-profile") or (p.endswith("/student-info") and "501" not in str(request.url)):
            return httpx.Response(200, json={"success": True, "data": {"id": 777, "full_name": "HEMIS TALABA", "student_id_number": "399241100777", "group": {"id": 7, "name": "CS-25-1"}, "phone": "+998901112233"}})
        if p.endswith("/education-year-list"):
            return page([{"code": "2025", "name": "2025-2026", "current": False}, {"code": "2026", "name": "2026-2027", "current": True}])
        if p.endswith("/semester-list"):
            return page([{"id": 11, "name": "1-semestr", "education_year": {"code": "2026"}, "current": True}])
        if p.endswith("/group-list"):
            return page([{"id": 7, "name": "CS-25-1", "educationLang": {"code": "11", "name": "O‘zbek"}}, {"id": 8, "name": "EC-26-1"}])
        if p.endswith("/employee-list"):
            return page([{"id": 101, "full_name": "Namuna O‘qituvchi (1)", "employee_id_number": "3001", "staffPosition": {"name": "Katta o‘qituvchi"}, "academicDegree": {"name": "PhD"}, "academicRank": {"name": "Dotsent"}, "department": {"name": "Muhandislik kafedrasi"}}, {"id": 102, "full_name": "Yangi O'qituvchi", "employee_id_number": "3002"}])
        if p.endswith("/student-list"):
            return page([{"id": 501, "full_name": "TALABA BIR", "student_id_number": "student", "group": {"id": 7, "name": "CS-25-1"}, "specialty": {"name": "Dasturiy injiniring"}, "level": {"name": "2-kurs"}, "avg_gpa": "3.9"}, {"id": 502, "full_name": "Yangi Talaba", "student_id_number": "399241100555", "group": {"id": 8, "name": "EC-26-1"}}])
        if p.endswith("/student-info"):
            return httpx.Response(200, json={"success": True, "data": {"id": 501, "full_name": "TALABA BIR", "student_id_number": "student", "department": {"name": "Muhandislik kafedrasi"}, "group": {"id": 7, "name": "CS-25-1"}, "paymentForm": {"name": "Kontrakt"}}})
        if p.endswith("/schedule-list"):
            from datetime import datetime, timezone

            d = 86400
            a = int(datetime(2026, 9, 7, tzinfo=timezone.utc).timestamp())
            row = lambda dt, pn, st_, en, s, tr, au, em, gr: {"lesson_date": dt, "subject": {"name": s}, "trainingType": {"name": tr}, "lessonPair": {"name": pn, "start_time": st_, "end_time": en}, "auditorium": {"name": au}, "employee": em, "group": gr}
            tch = {"id": 101, "name": "Namuna O‘qituvchi (1)"}
            g7 = {"id": 7, "name": "CS-25-1"}
            return page([
                row(a, "1", "08:30", "09:50", "Dasturlash asoslari", "Ma’ruza", "204", tch, g7),
                row(a + 7 * d, "1", "08:30", "09:50", "Dasturlash asoslari", "Ma’ruza", "204", tch, g7),
                row(a + 14 * d, "1", "08:30", "09:50", "Dasturlash asoslari", "Ma’ruza", "204", tch, g7),
                row(a + d, "2", "10:00", "11:20", "Umumiy fizika", "Amaliyot", "101", {"id": 102, "name": "Yangi O'qituvchi"}, {"id": 8, "name": "EC-26-1"}),
            ])
        if p.endswith("/student-subject-list"):
            return page([{"curriculumSubject": {"subject": {"id": 9, "name": "Dasturlash asoslari", "code": "CS101"}, "credit": 6, "total_acload": 180}}])
        if p.endswith("/student-gpa-list"):
            return page([{"gpa": "3.85", "credit_sum": 30, "debt_subjects": 0, "educationYear": {"name": "2026"}}])
        return page([])

    return httpx.MockTransport(h)
