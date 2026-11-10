"""Profil surati: rasmda odam yuzi borligini tekshirish (YuNet, OpenCV) va yuz atrofidan kvadrat qilib kesish.

Hayvon, manzara, buyum yoki guruh surati qabul qilinmaydi: aniq bitta odam yuzi bo'lishi va u rasmda yetarlicha katta bo'lishi kerak.
Model: OpenCV Zoo «face_detection_yunet_2023mar» (MIT litsenziya) — `university/models/` papkasida.
"""
from __future__ import annotations

import threading
from pathlib import Path

MODEL = Path(__file__).with_name("models") / "face_detection_yunet_2023mar.onnx"
SCORE = 0.85  # ishonch chegarasi (hayvon va buyumlarda yuz topilmaydi)
MIN_FACE = 0.14  # yuz kengligi rasm qisqa tomonining kamida 14% i
OUT = 512  # natija: 512×512 JPEG

_lock = threading.Lock()
_det = None


class FaceError(ValueError):
    """code: not_image | no_face | face_small | many_faces | unavailable"""


def _detector():
    global _det
    if _det is None:
        import cv2  # noqa: PLC0415

        try:
            cv2.utils.logging.setLogLevel(cv2.utils.logging.LOG_LEVEL_ERROR)
        except Exception:  # noqa: BLE001
            pass
        _det = cv2.FaceDetectorYN.create(str(MODEL), "", (320, 320), SCORE, 0.3, 5000)
    return _det


def available() -> bool:
    try:
        import cv2  # noqa: F401, PLC0415

        return MODEL.exists()
    except ImportError:
        return False


def detect(img) -> list[tuple[float, float, float, float, float]]:
    """[(x, y, w, h, score)] — asl rasm koordinatalarida."""
    h, w = img.shape[:2]
    scale = min(1.0, 800 / max(h, w))
    import cv2  # noqa: PLC0415

    small = cv2.resize(img, (max(1, int(w * scale)), max(1, int(h * scale)))) if scale < 1 else img
    with _lock:
        det = _detector()
        det.setInputSize((small.shape[1], small.shape[0]))
        _, faces = det.detect(small)
    out = []
    for f in faces if faces is not None else []:
        x, y, fw, fh = (float(v) / scale for v in f[:4])
        out.append((x, y, fw, fh, float(f[-1])))
    out.sort(key=lambda f: f[2] * f[3], reverse=True)
    return out


def portrait(raw: bytes) -> bytes:
    """Rasmni tekshiradi va yuz markazida 512×512 JPEG qaytaradi. Xato bo'lsa FaceError."""
    if not available():
        raise FaceError("unavailable")
    import cv2  # noqa: PLC0415
    import numpy as np  # noqa: PLC0415

    img = cv2.imdecode(np.frombuffer(raw, np.uint8), cv2.IMREAD_COLOR)
    if img is None or img.size == 0:
        raise FaceError("not_image")
    h, w = img.shape[:2]
    faces = detect(img)
    if not faces:
        raise FaceError("no_face")
    x, y, fw, fh, _ = faces[0]
    if fw < MIN_FACE * min(h, w):
        raise FaceError("face_small")
    # ikkinchi yuz ham katta bo'lsa — guruh surati
    if len(faces) > 1 and faces[1][2] >= fw * 0.55:
        raise FaceError("many_faces")
    # yuz atrofidan kvadrat: yuz ~38% kenglik, ko'zlar yuqori uchdan birda
    side = min(max(fw, fh) * 2.6, w, h)
    cx, cy = x + fw / 2, y + fh / 2 + fh * 0.12
    x0 = int(max(0, min(w - side, cx - side / 2)))
    y0 = int(max(0, min(h - side, cy - side * 0.48)))
    crop = img[y0: y0 + int(side), x0: x0 + int(side)]
    crop = cv2.resize(crop, (OUT, OUT), interpolation=cv2.INTER_AREA)
    ok, buf = cv2.imencode(".jpg", crop, [cv2.IMWRITE_JPEG_QUALITY, 88])
    if not ok:
        raise FaceError("not_image")
    return buf.tobytes()
