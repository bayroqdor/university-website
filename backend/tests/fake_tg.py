"""Telegram Bot API soxtasi (testlar uchun): har bir shaxsiy chatda foydalanuvchi ko'radigan xabarlar ro'yxati yuritiladi.

sendMessage/send* — xabar qo'shadi, editMessageText/editMessageReplyMarkup — o'zgartiradi (topilmasa yoki o'zgarmasa — Telegram'dagi kabi
xato), deleteMessage — o'chiradi. Xabar id'lari bitta hisoblagichdan (botning «xabarlar qutisi» kabi): foydalanuvchi xabarlari ham
`user()` orqali shu hisoblagichdan id oladi. Shunday qilib testlar «chatda nechta xabar qoldi» deb tekshira oladi.
"""
from __future__ import annotations

import itertools
import json
import re

import httpx

QUIET = ("getUpdates", "deleteWebhook", "setWebhook")  # fon long-polling oqimi
_IDS = itertools.count(1000)  # jarayon bo'yicha yagona: avvalgi testdan qolgan panel id'si yangi xabar bilan to'qnashmaydi


class FakeTG:
    def __init__(self, files: dict | None = None, username: str = "site_test_bot"):
        self.files = files or {}
        self.username = username
        self.calls: list[tuple[str, object]] = []  # (usul, JSON tana yoki multipart baytlar)
        self.sent: list[dict] = []  # sendMessage / editMessageText tanalari (+ "_m": usul)
        self.deleted: list[tuple[str, int]] = []
        self.toasts: list[dict] = []
        self.chats: dict[str, list[dict]] = {}
        self.ids = _IDS
        self.transport = httpx.MockTransport(self.handler)

    # --- Bot API
    @staticmethod
    def _ok(result):
        return httpx.Response(200, json={"ok": True, "result": result})

    @staticmethod
    def _err(desc: str):
        return httpx.Response(400, json={"ok": False, "error_code": 400, "description": desc})

    def _find(self, chat, mid) -> dict | None:
        return next((x for x in self.chats.get(str(chat), []) if x["id"] == int(mid or 0)), None)

    def _add(self, chat, **m) -> dict:
        m = {"id": next(self.ids), "from": "bot"} | m
        self.chats.setdefault(str(chat), []).append(m)
        return m

    def handler(self, req: httpx.Request):
        if "/file/bot" in req.url.path:
            fid = req.url.path.rsplit("/", 1)[-1].split(".")[0]
            return httpx.Response(200, content=self.files[fid])
        method = req.url.path.rsplit("/", 1)[-1]
        if "json" in req.headers.get("content-type", ""):
            body = json.loads(req.content or b"{}")
        else:
            body = req.read()
        if method in QUIET:
            return self._ok([] if method == "getUpdates" else True)
        if method == "answerCallbackQuery":  # tugma javobi (toast) — chatga ta'sir qilmaydi, alohida yoziladi
            self.toasts.append(body)
            return self._ok(True)
        self.calls.append((method, body))
        if method == "getMe":
            return self._ok({"id": 1, "username": self.username, "first_name": "UNI"})
        if method == "getWebhookInfo":
            return self._ok({"url": "", "pending_update_count": 0, "max_connections": 40})
        if method == "getFile":
            fid = body["file_id"]
            return self._ok({"file_id": fid, "file_size": len(self.files[fid]), "file_path": f"docs/{fid}.bin"})
        if isinstance(body, bytes):  # sendPhoto / sendDocument / sendMediaGroup … (multipart)
            chat = re.search(rb'name="chat_id"\r\n\r\n([^\r]+)', body).group(1).decode()
            n = body.count(b'"attach://') if method == "sendMediaGroup" else 1
            ms = [self._add(chat, kind=method, text="", markup=None) for _ in range(n)]
            return self._ok([{"message_id": m["id"]} for m in ms] if method == "sendMediaGroup" else {"message_id": ms[0]["id"]})
        chat = str(body.get("chat_id", ""))
        if method == "sendMessage":
            self.sent.append(body | {"_m": method})
            m = self._add(chat, kind="text", text=body.get("text", ""), markup=body.get("reply_markup"))
            return self._ok({"message_id": m["id"], "chat": {"id": chat}, "text": m["text"]})
        if method in ("editMessageText", "editMessageReplyMarkup"):
            m = self._find(chat, body.get("message_id"))
            if not m:
                return self._err("Bad Request: message to edit not found")
            if m["from"] != "bot" or (method == "editMessageText" and m["kind"] != "text"):
                return self._err("Bad Request: message can't be edited")
            text = body.get("text", m["text"]) if method == "editMessageText" else m["text"]
            if text == m["text"] and body.get("reply_markup") == m["markup"]:
                return self._err("Bad Request: message is not modified: specified new message content and reply markup are exactly the same")
            if method == "editMessageText":
                self.sent.append(body | {"_m": method})
            m["text"], m["markup"] = text, body.get("reply_markup")
            return self._ok({"message_id": m["id"], "chat": {"id": chat}, "text": m["text"]})
        if method == "deleteMessage":
            m = self._find(chat, body.get("message_id"))
            if not m:
                return self._err("Bad Request: message to delete not found")
            self.chats[chat].remove(m)
            self.deleted.append((chat, m["id"]))
            return self._ok(True)
        return self._ok(True)

    # --- foydalanuvchi tomoni
    def user(self, chat, **fields) -> dict:
        """Foydalanuvchi yozgan xabar: chatga qo'shiladi, update uchun message_id qaytadi."""
        m = self._add(chat, **{"from": "user", "kind": "text", "text": fields.get("text") or fields.get("caption") or "", "markup": None, "raw": fields})
        return m

    def visible(self, chat) -> list[dict]:
        return list(self.chats.get(str(chat), []))

    def bot_msgs(self, chat) -> list[dict]:
        return [x for x in self.visible(chat) if x["from"] == "bot"]

    def user_msgs(self, chat) -> list[dict]:
        return [x for x in self.visible(chat) if x["from"] == "user"]

    def msg(self, chat, mid) -> dict | None:
        return self._find(chat, mid)

    def methods(self) -> list[str]:
        return [m for m, _ in self.calls]

    def last_text(self, chat) -> str:
        """Chatdagi eng pastki bot xabari matni."""
        b = self.bot_msgs(chat)
        return b[-1]["text"] if b else ""

    @staticmethod
    def buttons(m: dict | None) -> list[str]:
        return [b.get("callback_data") or b.get("url") for row in ((m or {}).get("markup") or (m or {}).get("reply_markup") or {}).get("inline_keyboard", [])
                for b in row]
