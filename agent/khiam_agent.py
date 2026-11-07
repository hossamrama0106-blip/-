#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Khiam Ops — Windows Agent (مراقبة معلنة بموافقة).

النواة (النافذة النشطة، الخمول، حركة الماوس، تصنيف البرامج، heartbeat) تعمل بالـ stdlib فقط عبر ctypes.
لقطات الشاشة اختيارية وتتطلب (mss + Pillow)، ولا تُلتقط إلا عندما تفعّل الإدارة "لايف" ويكون allowCapture=true.
"""
import argparse
import base64
import ctypes
import json
import os
import sys
import time
from ctypes import wintypes
import urllib.request

IS_WIN = sys.platform.startswith("win")

DEFAULTS = {
    "backend": "http://localhost:8787",
    "username": "",
    "password": "",
    "code": "",
    "intervalSeconds": 10,
    "allowCapture": False,
    "captureIntervalSeconds": 3,
    "captureMaxWidth": 1280,
    "captureQuality": 55,
}


def load_config():
    cfg = dict(DEFAULTS)
    here = os.path.dirname(os.path.abspath(__file__))
    path = os.path.join(here, "config.json")
    if os.path.exists(path):
        try:
            with open(path, "r", encoding="utf-8") as f:
                cfg.update(json.load(f))
        except Exception as e:
            print("config.json خطأ:", e)
    ap = argparse.ArgumentParser()
    ap.add_argument("--username")
    ap.add_argument("--password")
    ap.add_argument("--code")
    ap.add_argument("--backend")
    ap.add_argument("--interval", type=int)
    ap.add_argument("--capture", action="store_true")
    a = ap.parse_args()
    if a.username:
        cfg["username"] = a.username
    if a.password:
        cfg["password"] = a.password
    if a.code:
        cfg["code"] = a.code
    if a.backend:
        cfg["backend"] = a.backend
    if a.interval:
        cfg["intervalSeconds"] = a.interval
    if a.capture:
        cfg["allowCapture"] = True
    cfg["username"] = cfg["username"] or os.environ.get("KHIAM_USERNAME", "")
    cfg["password"] = cfg["password"] or os.environ.get("KHIAM_PASSWORD", "")
    cfg["code"] = cfg["code"] or os.environ.get("KHIAM_CODE", "")
    return cfg


TOKEN = ""


def http_json(url, method="GET", body=None, timeout=8):
    data = json.dumps(body).encode("utf-8") if body is not None else None
    headers = {"content-type": "application/json"}
    if TOKEN:
        headers["authorization"] = "Bearer " + TOKEN
    req = urllib.request.Request(url, data=data, method=method, headers=headers)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8"))


# ---------------- Windows signals (ctypes) ----------------
if IS_WIN:
    user32 = ctypes.windll.user32
    kernel32 = ctypes.windll.kernel32

    class LASTINPUTINFO(ctypes.Structure):
        _fields_ = [("cbSize", wintypes.UINT), ("dwTime", wintypes.DWORD)]

    class POINT(ctypes.Structure):
        _fields_ = [("x", ctypes.c_long), ("y", ctypes.c_long)]

    def active_window_title():
        try:
            h = user32.GetForegroundWindow()
            n = user32.GetWindowTextLengthW(h)
            buf = ctypes.create_unicode_buffer(n + 1)
            user32.GetWindowTextW(h, buf, n + 1)
            return buf.value or ""
        except Exception:
            return ""

    def active_process_name():
        try:
            h = user32.GetForegroundWindow()
            pid = wintypes.DWORD()
            user32.GetWindowThreadProcessId(h, ctypes.byref(pid))
            hp = kernel32.OpenProcess(0x1000, False, pid.value)  # PROCESS_QUERY_LIMITED_INFORMATION
            if not hp:
                return ""
            try:
                size = wintypes.DWORD(260)
                buf = ctypes.create_unicode_buffer(260)
                if kernel32.QueryFullProcessImageNameW(hp, 0, buf, ctypes.byref(size)):
                    return os.path.basename(buf.value)
                return ""
            finally:
                kernel32.CloseHandle(hp)
        except Exception:
            return ""

    def idle_ms():
        try:
            lii = LASTINPUTINFO()
            lii.cbSize = ctypes.sizeof(LASTINPUTINFO)
            user32.GetLastInputInfo(ctypes.byref(lii))
            return int(kernel32.GetTickCount()) - int(lii.dwTime)
        except Exception:
            return 0

    def cursor_pos():
        try:
            p = POINT()
            user32.GetCursorPos(ctypes.byref(p))
            return (p.x, p.y)
        except Exception:
            return (0, 0)
else:
    def active_window_title():
        return "non-windows"

    def active_process_name():
        return ""

    def idle_ms():
        return 0

    def cursor_pos():
        return (0, 0)


# ---------------- classification ----------------
GAMES = ("steam", "epicgames", "league", "valorant", "cs2", "cs:go", "dota", "pubg", "minecraft", "roblox", "origin.exe")
SOCIAL = ("youtube", "tiktok", "twitter", "x.com", "snapchat", "reddit")
ENT = ("netflix", "shahid", "movie", "film", "مسلسل", "فيلم", "anime", "spotify")
WORK = ("business.facebook", "whatsapp", "operix", "instagram/direct", "meta business")


def classify(title, proc):
    t = (title + " " + proc).lower()
    if any(k in t for k in WORK):
        return "work", None
    if any(k in t for k in GAMES):
        return "games", "games"
    if any(k in t for k in ENT):
        return "entertainment", "entertainment"
    if ("facebook" in t and "business" not in t) or ("instagram" in t and "direct" not in t) or any(k in t for k in SOCIAL):
        return "social", "social"
    return "other", None


# ---------------- optional screenshots ----------------
_capture_ready = None


def capture_available():
    global _capture_ready
    if _capture_ready is None:
        try:
            import mss  # noqa: F401
            import PIL  # noqa: F401
            _capture_ready = True
        except Exception:
            _capture_ready = False
    return _capture_ready


def capture_webp(max_width, quality):
    import io
    import mss
    from PIL import Image
    with mss.mss() as sct:
        raw = sct.grab(sct.monitors[1])
        img = Image.frombytes("RGB", raw.size, raw.bgra, "raw", "BGRX")
    w, h = img.size
    if w > max_width:
        img = img.resize((max_width, int(h * max_width / w)))
    buf = io.BytesIO()
    img.save(buf, format="WEBP", quality=quality)
    data = buf.getvalue()
    return "data:image/webp;base64," + base64.b64encode(data).decode("ascii"), img.size[0], img.size[1]


def main():
    cfg = load_config()
    if not cfg.get("username") and not cfg["code"]:
        print("لازم دخول الموظف:  python khiam_agent.py --username mrsam511 --password ****")
        sys.exit(1)
    backend = cfg["backend"].rstrip("/")
    who = cfg.get("username") or cfg["code"]
    print(f"Khiam Agent — backend={backend} user={who} capture={'on' if cfg['allowCapture'] else 'off'} "
          f"(screenshots lib: {'متاح' if capture_available() else 'غير مثبّت'})")

    creds = {"username": cfg["username"], "password": cfg["password"]} if cfg.get("username") else {"code": cfg["code"]}
    try:
        res = http_json(f"{backend}/api/auth/login", "POST", creds)
    except Exception as e:
        print("فشل الدخول (تأكد من اسم المستخدم/كلمة السر):", e)
        sys.exit(1)
    emp = res.get("employee")
    if not emp:
        print("بيانات الدخول غير صحيحة")
        sys.exit(1)
    global TOKEN
    TOKEN = res.get("token") or ""
    eid = emp["id"]
    print(f"مسجّل: {emp.get('name')} ({eid})")

    interval = max(3, int(cfg["intervalSeconds"]))
    last_capture = 0.0
    last_cursor = cursor_pos()

    try:
        while True:
            title = active_window_title()
            proc = active_process_name()
            cat, status_hint = classify(title, proc)
            idle = idle_ms()
            cur = cursor_pos()
            moved = (idle < interval * 1000 + 3000) or (cur != last_cursor)
            last_cursor = cur

            payload = {
                "employeeId": eid,
                "agentConnected": True,
                "currentWindow": (title or proc or "—")[:120],
                "mouseMoved": bool(moved),
                "clientTime": int(time.time() * 1000),  # لكشف التلاعب بساعة الجهاز
            }
            if status_hint:
                payload["status"] = status_hint
            try:
                live = http_json(f"{backend}/api/presence", "POST", payload)
            except Exception as e:
                print("presence err:", e)
                time.sleep(interval)
                continue

            flag_live = bool(live.get("liveWatching")) or bool(live.get("superMonitor"))
            print(f"[{time.strftime('%H:%M:%S')}] نافذة='{payload['currentWindow']}' فئة={cat} خمول={idle // 1000}ث لايف={'●' if flag_live else '-'}")

            if flag_live and cfg["allowCapture"] and capture_available():
                now = time.time()
                if now - last_capture >= int(cfg["captureIntervalSeconds"]):
                    last_capture = now
                    try:
                        data_url, w, h = capture_webp(int(cfg["captureMaxWidth"]), int(cfg["captureQuality"]))
                        http_json(f"{backend}/api/screenshots", "POST", {"employeeId": eid, "dataUrl": data_url, "width": w, "height": h})
                        print(f"   ↳ لقطة مرفوعة {w}x{h} ({len(data_url) // 1024}KB WebP)")
                    except Exception as e:
                        print("   capture err:", e)

            time.sleep(interval)
    except KeyboardInterrupt:
        print("\nتم الإيقاف.")


if __name__ == "__main__":
    main()
