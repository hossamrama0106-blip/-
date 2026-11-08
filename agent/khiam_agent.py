#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Khiam Ops — برنامج متابعة الأداء (ويندوز) — بواجهة رسومية + وضع طرفية.

• واجهة رسومية (افتراضي عند الفتح بالدبل-كليك): نافذة دخول + شريط تثبيت + شاشة حالة حيّة.
• وضع طرفية (--headless أو بوجود اسم مستخدم في الأوامر): يشتغل في الخلفية بلا نافذة.
النواة (النافذة النشطة/الخمول/الماوس/التصنيف/heartbeat) تعمل بالـ stdlib فقط عبر ctypes.
لقطات الشاشة اختيارية (mss + Pillow) وتُلتقط فقط عند تفعيل الإدارة "لايف" بموافقة.
"""
import argparse
import base64
import ctypes
import json
import os
import sys
import threading
import time
from ctypes import wintypes
import urllib.request

IS_WIN = sys.platform.startswith("win")

DEFAULTS = {
    "backend": "https://khiam-ops.onrender.com",
    "username": "",
    "password": "",
    "code": "",
    "intervalSeconds": 10,
    "allowCapture": False,
    "captureIntervalSeconds": 3,
    "captureMaxWidth": 1280,
    "captureQuality": 55,
}


def config_path():
    return os.path.join(os.path.dirname(os.path.abspath(__file__)), "config.json")


def load_config():
    cfg = dict(DEFAULTS)
    path = config_path()
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
    ap.add_argument("--headless", action="store_true")
    a, _ = ap.parse_known_args()
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
    cfg["headless"] = bool(a.headless)
    cfg["username"] = cfg["username"] or os.environ.get("KHIAM_USERNAME", "")
    cfg["password"] = cfg["password"] or os.environ.get("KHIAM_PASSWORD", "")
    cfg["code"] = cfg["code"] or os.environ.get("KHIAM_CODE", "")
    return cfg


def save_config(cfg):
    keep = {k: cfg.get(k) for k in DEFAULTS if k in cfg}
    try:
        with open(config_path(), "w", encoding="utf-8") as f:
            json.dump(keep, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print("تعذّر حفظ config.json:", e)


TOKEN = ""


def http_json(url, method="GET", body=None, timeout=12):
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
            hp = kernel32.OpenProcess(0x1000, False, pid.value)
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


# ---------------- core login + monitor loop ----------------
def do_login(backend, cfg):
    global TOKEN
    creds = {"username": cfg["username"], "password": cfg["password"]} if cfg.get("username") else {"code": cfg["code"]}
    res = http_json(f"{backend}/api/auth/login", "POST", creds)
    emp = res.get("employee")
    if not emp:
        raise RuntimeError("بيانات الدخول غير صحيحة")
    TOKEN = res.get("token") or ""
    return emp


def run_monitor(cfg, backend, eid, emit=None, stop_event=None):
    """حلقة المتابعة. emit(dict) تُستدعى كل دورة بالحالة؛ stop_event للإيقاف."""
    interval = max(3, int(cfg["intervalSeconds"]))
    last_capture = 0.0
    last_cursor = cursor_pos()

    def say(d):
        if emit:
            try:
                emit(d)
            except Exception:
                pass

    while not (stop_event and stop_event.is_set()):
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
            "clientTime": int(time.time() * 1000),
        }
        if status_hint:
            payload["status"] = status_hint
        ok = True
        try:
            live = http_json(f"{backend}/api/presence", "POST", payload)
        except Exception as e:
            ok = False
            live = {}
            say({"event": "err", "msg": str(e)})
        flag_live = bool(live.get("liveWatching")) or bool(live.get("superMonitor"))
        say({
            "event": "tick", "ok": ok, "window": payload["currentWindow"], "cat": cat,
            "idle": idle // 1000, "live": flag_live, "time": time.strftime("%H:%M:%S"),
        })
        # أوامر الإدارة
        force_capture = False
        for cmd in (live.get("commands") or []):
            if cmd == "reload":
                try:
                    cfg.update({k: v for k, v in load_config().items() if k in DEFAULTS})
                    interval = max(3, int(cfg["intervalSeconds"]))
                except Exception:
                    pass
            elif cmd == "screenshot_now":
                force_capture = True
                last_capture = 0.0
        if (flag_live or force_capture) and cfg["allowCapture"] and capture_available():
            now = time.time()
            if now - last_capture >= int(cfg["captureIntervalSeconds"]):
                last_capture = now
                try:
                    data_url, w, h = capture_webp(int(cfg["captureMaxWidth"]), int(cfg["captureQuality"]))
                    http_json(f"{backend}/api/screenshots", "POST", {"employeeId": eid, "dataUrl": data_url, "width": w, "height": h})
                    say({"event": "shot", "w": w, "h": h})
                except Exception as e:
                    say({"event": "err", "msg": "لقطة: " + str(e)})
        # نوم قابل للمقاطعة
        for _ in range(interval * 2):
            if stop_event and stop_event.is_set():
                break
            time.sleep(0.5)


# ---------------- headless (console) ----------------
def run_headless(cfg):
    if not cfg.get("username") and not cfg["code"]:
        print("لازم دخول:  python khiam_agent.py --username <user> --password <pass>")
        sys.exit(1)
    backend = cfg["backend"].rstrip("/")
    try:
        emp = do_login(backend, cfg)
    except Exception as e:
        print("فشل الدخول:", e)
        sys.exit(1)
    eid = emp["id"]
    print(f"مسجّل: {emp.get('name')} ({eid}) — backend={backend}")

    def emit(d):
        if d.get("event") == "tick":
            print(f"[{d['time']}] نافذة='{d['window']}' فئة={d['cat']} خمول={d['idle']}ث لايف={'●' if d['live'] else '-'}")
        elif d.get("event") == "err":
            print("  خطأ:", d.get("msg"))
        elif d.get("event") == "shot":
            print(f"  ↳ لقطة {d['w']}x{d['h']}")

    stop = threading.Event()
    try:
        run_monitor(cfg, backend, eid, emit=emit, stop_event=stop)
    except KeyboardInterrupt:
        print("\nتم الإيقاف.")


# ---------------- GUI (tkinter) ----------------
def run_gui(cfg):
    import queue as _queue
    import tkinter as tk
    from tkinter import ttk

    BG, CARD, FG, SUB, ACC = "#0f141c", "#1b2432", "#e5e7eb", "#94a3b8", "#6366f1"
    root = tk.Tk()
    root.title("Khiam Ops — متابعة الأداء")
    root.configure(bg=BG)
    root.geometry("440x560")
    try:
        root.option_add("*Font", "Tahoma 10")
    except Exception:
        pass

    ui = _queue.Queue()
    stop_event = threading.Event()
    state = {"thread": None, "eid": None, "name": None}

    tk.Label(root, text="Khiam Ops", bg=BG, fg="#fff", font="Tahoma 18 bold").pack(pady=(16, 2))
    tk.Label(root, text="برنامج متابعة الأداء — معلن وشفّاف", bg=BG, fg=SUB, font="Tahoma 9").pack()

    login = tk.Frame(root, bg=BG)
    login.pack(fill="x", padx=24, pady=16)

    def field(parent, label, val="", show=None):
        tk.Label(parent, text=label, bg=BG, fg=SUB, anchor="e").pack(fill="x", pady=(8, 2))
        e = tk.Entry(parent, bg=CARD, fg=FG, insertbackground=FG, relief="flat", show=show)
        e.pack(fill="x", ipady=5)
        e.insert(0, val)
        return e

    e_backend = field(login, "رابط النظام", cfg.get("backend", DEFAULTS["backend"]))
    e_user = field(login, "اسم المستخدم", cfg.get("username", ""))
    e_pass = field(login, "كلمة السر", cfg.get("password", ""), show="●")
    cap_var = tk.IntVar(value=1 if cfg.get("allowCapture") else 0)
    tk.Checkbutton(login, text="السماح بلقطات الشاشة عند طلب الإدارة (لايف)", variable=cap_var,
                   bg=BG, fg=SUB, selectcolor=CARD, activebackground=BG, anchor="e").pack(fill="x", pady=(10, 0))

    err = tk.Label(login, text="", bg=BG, fg="#f87171", font="Tahoma 9")
    err.pack(fill="x", pady=(6, 0))
    prog = ttk.Progressbar(login, mode="indeterminate")
    btn = tk.Button(login, text="تثبيت وبدء المتابعة", bg=ACC, fg="#fff", relief="flat",
                    activebackground="#4f46e5", font="Tahoma 11 bold", cursor="hand2")
    btn.pack(fill="x", ipady=8, pady=(12, 0))

    # شاشة الحالة
    status = tk.Frame(root, bg=BG)
    s_dot = tk.Label(status, text="●", bg=BG, fg="#64748b", font="Tahoma 14")
    s_state = tk.Label(status, text="غير متصل", bg=BG, fg=FG, font="Tahoma 12 bold")
    s_who = tk.Label(status, text="", bg=BG, fg=SUB, font="Tahoma 9")
    rows = {}

    def status_row(parent, key, label):
        fr = tk.Frame(parent, bg=CARD)
        fr.pack(fill="x", pady=3, ipady=4)
        tk.Label(fr, text=label, bg=CARD, fg=SUB, width=14, anchor="e").pack(side="right", padx=8)
        v = tk.Label(fr, text="—", bg=CARD, fg=FG, anchor="w")
        v.pack(side="right", fill="x", expand=True)
        rows[key] = v

    def build_status():
        s_dot.pack(pady=(4, 0))
        s_state.pack()
        s_who.pack(pady=(0, 10))
        for k, lb in (("window", "النافذة"), ("cat", "النشاط"), ("idle", "الخمول"), ("live", "مراقبة لايف")):
            status_row(status, k, lb)
        guide = tk.Label(status, bg=CARD, fg=SUB, justify="right", anchor="e", wraplength=360,
                         text="▸ ثبّت الإضافة على كروم: chrome://extensions ← Developer mode ← Load unpacked ← مجلد extension\n▸ سيبه شغّال طول الشيفت.")
        guide.pack(fill="x", pady=(12, 6), ipady=8)
        tk.Button(status, text="إيقاف المتابعة", bg="#b91c1c", fg="#fff", relief="flat",
                  activebackground="#991b1b", command=on_stop, cursor="hand2").pack(fill="x", ipady=6, pady=(4, 0))

    CAT_AR = {"work": "عمل ✅", "social": "سوشيال ⚠️", "games": "ألعاب ⛔", "entertainment": "ترفيه ⛔", "other": "أخرى"}

    def pump():
        try:
            while True:
                d = ui.get_nowait()
                ev = d.get("event")
                if ev == "login_ok":
                    login.pack_forget()
                    status.pack(fill="both", expand=True, padx=24, pady=(4, 16))
                    build_status()
                    s_who.config(text=f"{d['name']}")
                elif ev == "login_err":
                    prog.stop(); prog.pack_forget()
                    btn.config(state="normal", text="تثبيت وبدء المتابعة")
                    err.config(text=d.get("msg", "فشل الدخول"))
                elif ev == "tick":
                    s_dot.config(fg="#22c55e" if d["ok"] else "#f97316")
                    s_state.config(text="متصل ويعمل" if d["ok"] else "تعذّر الاتصال")
                    if "window" in rows:
                        rows["window"].config(text=d["window"])
                        rows["cat"].config(text=CAT_AR.get(d["cat"], d["cat"]))
                        rows["idle"].config(text=f"{d['idle']} ثانية")
                        rows["live"].config(text="🔴 الإدارة تتابع الآن" if d["live"] else "—")
                elif ev == "err":
                    s_dot.config(fg="#f97316")
        except Exception:
            pass
        root.after(400, pump)

    def worker(cfg2):
        backend = cfg2["backend"].rstrip("/")
        try:
            emp = do_login(backend, cfg2)
        except Exception as e:
            ui.put({"event": "login_err", "msg": "تأكد من الاسم/كلمة السر/الرابط: " + str(e)[:80]})
            return
        state["eid"] = emp["id"]
        ui.put({"event": "login_ok", "name": emp.get("name", "")})
        run_monitor(cfg2, backend, emp["id"], emit=lambda d: ui.put(d), stop_event=stop_event)

    def on_start():
        cfg["backend"] = e_backend.get().strip() or DEFAULTS["backend"]
        cfg["username"] = e_user.get().strip()
        cfg["password"] = e_pass.get()
        cfg["allowCapture"] = bool(cap_var.get())
        if not cfg["username"] or not cfg["password"]:
            err.config(text="اكتب اسم المستخدم وكلمة السر")
            return
        err.config(text="")
        save_config(cfg)
        btn.config(state="disabled", text="جارٍ الاتصال…")
        prog.pack(fill="x", pady=(10, 0)); prog.start(12)
        stop_event.clear()
        t = threading.Thread(target=worker, args=(dict(cfg),), daemon=True)
        state["thread"] = t
        t.start()

    def on_stop():
        stop_event.set()
        try:
            root.destroy()
        except Exception:
            pass

    btn.config(command=on_start)
    root.protocol("WM_DELETE_WINDOW", on_stop)
    root.after(400, pump)
    root.mainloop()


def main():
    cfg = load_config()
    # طرفية لو طُلب صراحةً أو مرّرت بيانات دخول؛ وإلا واجهة رسومية.
    if cfg.get("headless"):
        run_headless(cfg)
        return
    try:
        run_gui(cfg)
    except Exception as e:
        print("الواجهة الرسومية غير متاحة، تشغيل وضع الطرفية:", e)
        run_headless(cfg)


if __name__ == "__main__":
    main()
