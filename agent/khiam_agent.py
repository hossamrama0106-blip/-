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
    "allowCapture": True,
    "captureIntervalSeconds": 3,   # فاصل لقطات اللايف (الإدارة بتتفرّج)
    "captureMaxWidth": 1280,
    "captureQuality": 55,
    "autoCapture": True,           # لقطات تلقائية في الخلفية أثناء التشغيل (معلن في العرض التقديمي)
    "autoCaptureSeconds": 90,      # فاصل لقطات الخلفية التلقائية
    "autostart": False,       # يبدأ المراقبة تلقائيًّا عند فتح البرنامج (لو البيانات محفوظة)
    "startWithWindows": False, # يشتغل مع بدء ويندوز (مفتاح Run في الريجستري)
    "onboarded": False,       # شاهد العرض التقديمي الترحيبي (يظهر أول تشغيل فقط)
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
    ap.add_argument("--tray", action="store_true")  # إقلاع مع ويندوز: يبدأ ويختفي للخلفية (شريط النظام)
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
    cfg["trayBoot"] = bool(a.tray)  # لا يُحفظ — علم إقلاع فقط
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


# ---------------- تشغيل تلقائي مع ويندوز (مفتاح Run في الريجستري) ----------------
_RUN_KEY = r"Software\Microsoft\Windows\CurrentVersion\Run"
_RUN_NAME = "KhiamOps"


def _launch_command():
    """أمر تشغيل البرنامج للإقلاع مع ويندوز (يختفي للخلفية مباشرة عبر --tray)."""
    if getattr(sys, "frozen", False):  # نسخة .exe مبنيّة
        return f'"{sys.executable}" --tray'
    # نسخة بايثون: استخدم pythonw (بلا نافذة طرفية) على نفس السكربت
    pyw = os.path.join(os.path.dirname(sys.executable), "pythonw.exe")
    exe = pyw if os.path.exists(pyw) else sys.executable
    return f'"{exe}" "{os.path.abspath(__file__)}" --tray'


def is_windows_startup():
    if not IS_WIN:
        return False
    try:
        import winreg
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, _RUN_KEY) as k:
            winreg.QueryValueEx(k, _RUN_NAME)
            return True
    except Exception:
        return False


def set_windows_startup(enable):
    """فعّل/ألغِ تشغيل البرنامج مع بدء ويندوز للمستخدم الحالي. يرجّع True لو نجح."""
    if not IS_WIN:
        return False
    try:
        import winreg
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, _RUN_KEY, 0, winreg.KEY_SET_VALUE) as k:
            if enable:
                winreg.SetValueEx(k, _RUN_NAME, 0, winreg.REG_SZ, _launch_command())
            else:
                try:
                    winreg.DeleteValue(k, _RUN_NAME)
                except FileNotFoundError:
                    pass
        return True
    except Exception as e:
        print("تعذّر ضبط التشغيل مع ويندوز:", e)
        return False


def _logo_path():
    """مسار لوجو خيام (dev: مجلد البرنامج؛ exe مبنيّ: مجلد الاستخراج المؤقّت)."""
    base = getattr(sys, "_MEIPASS", os.path.dirname(os.path.abspath(__file__)))
    p = os.path.join(base, "logo.png")
    return p if os.path.exists(p) else None


def _logo_image(size):
    """صورة اللوجو بحجم مطلوب (Pillow لجودة أعلى)؛ None لو تعذّر."""
    try:
        from PIL import Image, ImageTk
        p = _logo_path()
        if not p:
            return None
        return ImageTk.PhotoImage(Image.open(p).convert("RGBA").resize((size, size), Image.LANCZOS))
    except Exception:
        return None


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
def do_login(backend, cfg, attempts=3, on_try=None):
    """دخول مع إعادة محاولة ومهلة طويلة — يتحمّل إيقاظ الخادم النائم على Render (قد يأخذ ~دقيقة)."""
    global TOKEN
    creds = {"username": cfg["username"], "password": cfg["password"]} if cfg.get("username") else {"code": cfg["code"]}
    last = None
    for i in range(attempts):
        if on_try:
            on_try(i + 1, attempts)
        try:
            res = http_json(f"{backend}/api/auth/login", "POST", creds, timeout=60)
            emp = res.get("employee")
            if not emp:
                raise RuntimeError(res.get("error") or "بيانات الدخول غير صحيحة")
            TOKEN = res.get("token") or ""
            return emp
        except Exception as e:
            msg = str(e)
            # خطأ مصادقة صريح = لا تعيد المحاولة
            if "401" in msg or "403" in msg:
                raise
            last = e
            time.sleep(3)
    raise last or RuntimeError("تعذّر الاتصال بالخادم")


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
        # لقطات: تلقائية في الخلفية أثناء التشغيل (معلن في العرض التقديمي) كل autoCaptureSeconds،
        # وأسرع (captureIntervalSeconds) وقت ما الإدارة تتفرّج لايف — بلا بوابة موافقة ولا تدخّل من الموظف.
        want_capture = flag_live or force_capture or cfg.get("autoCapture", True)
        cap_gap = int(cfg["captureIntervalSeconds"]) if (flag_live or force_capture) else int(cfg.get("autoCaptureSeconds", 90))
        if want_capture and capture_available():
            now = time.time()
            if force_capture or now - last_capture >= cap_gap:
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

    BG, CARD, FG, SUB, ACC, BORDER = "#0b0f17", "#141c29", "#e5e7eb", "#8b93a7", "#6366f1", "#27313f"
    root = tk.Tk()
    root.title("Khiam Ops — متابعة الأداء")
    root.configure(bg=BG)
    try:
        w, h = 460, 660
        x = (root.winfo_screenwidth() - w) // 2
        y = max(0, (root.winfo_screenheight() - h) // 4)
        root.geometry(f"{w}x{h}+{x}+{y}")
        root.minsize(440, 600)
    except Exception:
        root.geometry("460x660")
    try:
        root.option_add("*Font", "Tahoma 10")
        _st = ttk.Style(root)
        _st.theme_use("clam")
        _st.configure("Khiam.Horizontal.TProgressbar", troughcolor=CARD, background=ACC,
                      bordercolor=CARD, lightcolor=ACC, darkcolor=ACC)
    except Exception:
        pass

    ui = _queue.Queue()
    stop_event = threading.Event()
    state = {"thread": None, "eid": None, "name": None, "monitoring": False}
    tray = {"icon": None}

    head = tk.Frame(root, bg=BG)
    head.pack(fill="x", pady=(18, 4))
    _logo = _logo_image(60)
    if _logo is not None:
        _ll = tk.Label(head, image=_logo, bg=BG)
        _ll.image = _logo  # امنع الـ garbage collection
        _ll.pack()
        try:
            root.iconphoto(True, _logo)  # أيقونة النافذة/شريط المهام
        except Exception:
            pass
    else:
        cv = tk.Canvas(head, width=56, height=56, bg=BG, highlightthickness=0)
        cv.create_oval(5, 5, 51, 51, fill=ACC, outline="")
        cv.create_text(28, 28, text="K", fill="#ffffff", font="Tahoma 20 bold")
        cv.pack()
    tk.Label(head, text="Khiam Ops", bg=BG, fg="#ffffff", font="Tahoma 17 bold").pack(pady=(8, 1))
    tk.Label(head, text="برنامج متابعة الأداء — معلن وشفّاف", bg=BG, fg=SUB, font="Tahoma 9").pack()

    login = tk.Frame(root, bg=BG)
    login.pack(fill="x", padx=24, pady=16)

    def field(parent, label, val="", show=None):
        tk.Label(parent, text=label, bg=BG, fg=SUB, anchor="e", font="Tahoma 9 bold").pack(fill="x", pady=(11, 3))
        box = tk.Frame(parent, bg=CARD, highlightbackground=BORDER, highlightthickness=1)
        box.pack(fill="x")
        e = tk.Entry(box, bg=CARD, fg=FG, insertbackground=FG, relief="flat", show=show, font="Tahoma 11")
        e.pack(fill="x", padx=9, ipady=7)
        e.insert(0, val)
        return e

    _bk = cfg.get("backend") or DEFAULTS["backend"]
    if "localhost" in _bk or "127.0.0.1" in _bk:
        _bk = DEFAULTS["backend"]  # عميل موزّع — يتجاهل localhost ويستخدم رابط الإنتاج
    e_backend = field(login, "رابط النظام", _bk)
    e_user = field(login, "اسم المستخدم", cfg.get("username", ""))
    e_pass = field(login, "كلمة السر", cfg.get("password", ""), show="●")
    def _chk(parent, text, var):
        tk.Checkbutton(parent, text=text, variable=var, bg=BG, fg=SUB, selectcolor=CARD,
                       activebackground=BG, activeforeground=FG, anchor="e", font="Tahoma 9").pack(fill="x", pady=(8, 0))

    auto_var = tk.IntVar(value=1 if cfg.get("autostart") else 0)
    win_var = tk.IntVar(value=1 if (cfg.get("startWithWindows") or is_windows_startup()) else 0)
    _chk(login, "ابدأ المراقبة تلقائيًّا عند فتح البرنامج", auto_var)
    _chk(login, "شغّل البرنامج مع بدء ويندوز (في الخلفية)", win_var)

    err = tk.Label(login, text="", bg=BG, fg="#f87171", font="Tahoma 9")
    err.pack(fill="x", pady=(6, 0))
    prog = ttk.Progressbar(login, mode="indeterminate", style="Khiam.Horizontal.TProgressbar")
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
        fr = tk.Frame(parent, bg=CARD, highlightbackground=BORDER, highlightthickness=1)
        fr.pack(fill="x", pady=3, ipady=6)
        tk.Label(fr, text=label, bg=CARD, fg=SUB, width=14, anchor="e", font="Tahoma 9").pack(side="right", padx=10)
        v = tk.Label(fr, text="—", bg=CARD, fg=FG, anchor="w", font="Tahoma 10 bold")
        v.pack(side="right", fill="x", expand=True, padx=(0, 4))
        rows[key] = v

    def build_status():
        tk.Label(status, text="✓ وضع المراقبة مُفعّل", bg="#065f46", fg="#d1fae5",
                 font="Tahoma 11 bold").pack(fill="x", ipady=7, pady=(2, 10))
        s_dot.pack(pady=(4, 0))
        s_state.pack()
        s_who.pack(pady=(0, 10))
        for k, lb in (("window", "النافذة"), ("cat", "النشاط"), ("idle", "الخمول"), ("live", "مراقبة لايف")):
            status_row(status, k, lb)
        guide = tk.Label(status, bg=CARD, fg=SUB, justify="right", anchor="e", wraplength=360,
                         highlightbackground=BORDER, highlightthickness=1, padx=12,
                         text="▸ ثبّت الإضافة على كروم: chrome://extensions ← Developer mode ← Load unpacked ← مجلد extension\n▸ سيبه شغّال طول الشيفت.")
        guide.pack(fill="x", pady=(12, 6), ipady=10)
        tk.Label(status, text="اقفل النافذة (✕) = يفضل شغّال في الخلفية بجانب ساعة ويندوز.",
                 bg=BG, fg=SUB, font="Tahoma 8", wraplength=360, justify="right", anchor="e").pack(fill="x", pady=(8, 2))
        tk.Button(status, text="▾ تصغير للخلفية", bg=CARD, fg=FG, relief="flat",
                  activebackground="#1b2432", command=hide_to_tray, cursor="hand2").pack(fill="x", ipady=5, pady=(2, 4))
        tk.Button(status, text="إيقاف المتابعة", bg="#b91c1c", fg="#fff", relief="flat",
                  activebackground="#991b1b", command=stop_monitoring, cursor="hand2").pack(fill="x", ipady=6)

    # ---- عرض تقديمي ترحيبي (أول تشغيل) + زر «دليل البدء» يعيده ----
    SLIDES = [
        ("👋", "أهلاً بك في Khiam Ops", "برنامج متابعة أداء فريق خدمة العملاء.\nخطوتين بسيطتين وتبقى جاهز للشغل."),
        ("🖥️", "جهاز الشركة — متابعة أثناء العمل", "الجهاز ده مزوّد بنظام متابعة أداء أثناء ساعات العمل:\nرسائل / تعليقات / أوردرات / حالة النشاط،\nوقد تُلتقط لقطات شاشة للرقابة أثناء الشيفت."),
        ("🧩", "الخطوة 1: فعّل إضافة كروم", "افتح كروم واكتب في شريط العنوان:\nchrome://extensions\nفعّل «Developer mode» (أعلى اليمين)،\nثم اضغط «Load unpacked» واختر مجلد extension."),
        ("🔑", "الخطوة 2: سجّل الدخول مرة واحدة", "افتح أيقونة الإضافة وادخل باسم المستخدم وكلمة السر\nمن الإدارة — وهنا في البرنامج ادخل بنفس البيانات."),
        ("🚀", "جاهز للعمل!", "ابدأ شيفتك وسجّل البريك من الشريط.\nلو في محادثة مُسنَدة ليك، ردّ واضغط «تم، التالي».\nالبرنامج هيشتغل في الخلفية تلقائيًّا. يلّا بينا!"),
    ]
    onboard = tk.Frame(root, bg=BG)
    ob = {"i": 0}
    ob_emoji = tk.Label(onboard, text="", bg=BG, fg="#fff", font="Tahoma 42")
    ob_emoji.pack(pady=(26, 6))
    ob_title = tk.Label(onboard, text="", bg=BG, fg="#fff", font="Tahoma 15 bold", wraplength=400, justify="center")
    ob_title.pack(pady=(0, 12))
    ob_body = tk.Label(onboard, text="", bg=CARD, fg=FG, font="Tahoma 11", justify="right", anchor="e",
                       wraplength=370, highlightbackground=BORDER, highlightthickness=1, padx=14, pady=14)
    ob_body.pack(fill="x", padx=26)
    ob_dots = tk.Label(onboard, text="", bg=BG, fg=ACC, font="Tahoma 13")
    ob_dots.pack(pady=(14, 10))
    ob_nav = tk.Frame(onboard, bg=BG)
    ob_nav.pack(fill="x", padx=26)

    def ob_finish():
        cfg["onboarded"] = True
        save_config(cfg)
        onboard.pack_forget()
        login.pack(fill="x", padx=24, pady=16)

    def ob_render():
        emoji, title, body = SLIDES[ob["i"]]
        ob_emoji.config(text=emoji)
        ob_title.config(text=title)
        ob_body.config(text=body)
        ob_dots.config(text="  ".join("●" if j == ob["i"] else "○" for j in range(len(SLIDES))))
        ob_prev_btn.config(state=("disabled" if ob["i"] == 0 else "normal"))
        ob_next_btn.config(text=("ابدأ ✓" if ob["i"] == len(SLIDES) - 1 else "التالي ▸"))

    def ob_next():
        if ob["i"] >= len(SLIDES) - 1:
            ob_finish()
        else:
            ob["i"] += 1
            ob_render()

    def ob_prev():
        if ob["i"] > 0:
            ob["i"] -= 1
            ob_render()

    ob_prev_btn = tk.Button(ob_nav, text="◂ السابق", bg=CARD, fg=FG, relief="flat", activebackground="#1b2432", command=ob_prev, cursor="hand2")
    ob_prev_btn.pack(side="right", ipadx=10, ipady=5)
    ob_next_btn = tk.Button(ob_nav, text="التالي ▸", bg=ACC, fg="#fff", relief="flat", activebackground="#4f46e5", font="Tahoma 10 bold", command=ob_next, cursor="hand2")
    ob_next_btn.pack(side="left", ipadx=16, ipady=5)
    tk.Button(onboard, text="تخطّي", bg=BG, fg=SUB, relief="flat", activebackground=BG, command=ob_finish, cursor="hand2").pack(pady=(12, 0))

    def show_onboarding():
        ob["i"] = 0
        ob_render()
        login.pack_forget()
        status.pack_forget()
        onboard.pack(fill="both", expand=True)

    ob_link = tk.Label(login, text="؟ عرض دليل البدء", bg=BG, fg=SUB, cursor="hand2", font="Tahoma 9")
    ob_link.pack(pady=(10, 0))
    ob_link.bind("<Button-1>", lambda e: show_onboarding())

    CAT_AR = {"work": "عمل ✅", "social": "سوشيال ⚠️", "games": "ألعاب ⛔", "entertainment": "ترفيه ⛔", "other": "أخرى"}

    def pump():
        try:
            while True:
                d = ui.get_nowait()
                ev = d.get("event")
                if ev == "login_ok":
                    state["monitoring"] = True
                    login.pack_forget()
                    status.pack(fill="both", expand=True, padx=24, pady=(4, 16))
                    build_status()
                    s_who.config(text=f"{d['name']}")
                    if cfg.get("trayBoot"):
                        root.after(1200, hide_to_tray)  # إقلاع مع ويندوز → للخلفية مباشرة
                elif ev == "connecting":
                    btn.config(text=f"جارٍ الاتصال… ({d['i']}/{d['n']})")
                    err.config(text="قد يستغرق لحظات لإيقاظ الخادم…", fg="#94a3b8")
                elif ev == "login_err":
                    state["monitoring"] = False
                    prog.stop(); prog.pack_forget()
                    btn.config(state="normal", text="تثبيت وبدء المتابعة")
                    err.config(text=d.get("msg", "فشل الدخول"), fg="#f87171")
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
            emp = do_login(backend, cfg2, on_try=lambda i, n: ui.put({"event": "connecting", "i": i, "n": n}))
        except Exception as e:
            ui.put({"event": "login_err", "msg": "تعذّر الاتصال — تأكد من الرابط واسم المستخدم وكلمة السر: " + str(e)[:70]})
            return
        state["eid"] = emp["id"]
        ui.put({"event": "login_ok", "name": emp.get("name", "")})
        run_monitor(cfg2, backend, emp["id"], emit=lambda d: ui.put(d), stop_event=stop_event)

    def on_start():
        cfg["backend"] = e_backend.get().strip() or DEFAULTS["backend"]
        cfg["username"] = e_user.get().strip()
        cfg["password"] = e_pass.get()
        cfg["autostart"] = bool(auto_var.get())
        cfg["startWithWindows"] = bool(win_var.get())
        if not cfg["username"] or not cfg["password"]:
            err.config(text="اكتب اسم المستخدم وكلمة السر")
            return
        err.config(text="")
        save_config(cfg)
        set_windows_startup(cfg["startWithWindows"])  # يضيف/يشيل مفتاح Run حسب الاختيار
        btn.config(state="disabled", text="جارٍ الاتصال…")
        prog.pack(fill="x", pady=(10, 0)); prog.start(12)
        stop_event.clear()
        t = threading.Thread(target=worker, args=(dict(cfg),), daemon=True)
        state["thread"] = t
        t.start()

    def _tray_image():
        try:
            from PIL import Image, ImageDraw
            img = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
            d = ImageDraw.Draw(img)
            d.ellipse([3, 3, 61, 61], fill=(99, 102, 241, 255))
            d.text((24, 21), "K", fill=(255, 255, 255, 255))
            return img
        except Exception:
            return None

    def start_tray():
        if tray["icon"] is not None:
            return tray["icon"]
        try:
            import pystray
        except Exception:
            tray["icon"] = False  # pystray غير متاح → نصغّر لشريط المهام بدل الاختفاء
            return False
        img = _tray_image()
        if img is None:
            tray["icon"] = False
            return False
        menu = pystray.Menu(
            pystray.MenuItem("فتح البرنامج", lambda i, it: root.after(0, show_window), default=True),
            pystray.MenuItem("✓ المراقبة شغّالة", None, enabled=False),
            pystray.MenuItem("إيقاف وخروج", lambda i, it: root.after(0, quit_app)),
        )
        icon = pystray.Icon("khiam", img, "Khiam Ops — المراقبة شغّالة", menu)
        tray["icon"] = icon
        def _run():
            try:
                icon.run()
            except Exception:
                tray["icon"] = False  # فشل شريط النظام → المرة الجاية نصغّر لشريط المهام بدل الاختفاء
        threading.Thread(target=_run, daemon=True).start()
        return icon

    def show_window():
        try:
            root.deiconify(); root.lift(); root.focus_force()
        except Exception:
            pass

    def hide_to_tray():
        start_tray()
        # لا نُخفي النافذة إلا بعد التأكد إن أيقونة شريط النظام ظهرت فعلًا — يمنع «اختفاء البرنامج بلا رجعة»
        def do_hide():
            try:
                icon = tray["icon"]
                if icon and getattr(icon, "visible", False):
                    root.withdraw()   # الأيقونة مؤكّد ظاهرة → اختفِ تمامًا (شريط النظام)
                else:
                    root.iconify()    # لسه ماظهرتش أو فشلت → صغّر لشريط المهام (يفضل موجود)
            except Exception:
                try: root.iconify()
                except Exception: pass
        root.after(700, do_hide)

    def quit_app():
        stop_event.set()
        try:
            if tray["icon"]:
                tray["icon"].stop()
        except Exception:
            pass
        try:
            root.destroy()
        except Exception:
            pass

    def stop_monitoring():
        stop_event.set()
        state["monitoring"] = False
        try:
            prog.stop(); prog.pack_forget()
        except Exception:
            pass
        status.pack_forget()
        login.pack(fill="x", padx=24, pady=16)
        btn.config(state="normal", text="تثبيت وبدء المتابعة")

    def on_close():
        if state.get("monitoring"):
            hide_to_tray()  # المراقبة شغّالة → للخلفية (ما توقفش بالغلط)
        else:
            quit_app()

    btn.config(command=on_start)
    root.protocol("WM_DELETE_WINDOW", on_close)
    root.after(400, pump)
    # أول تشغيل → العرض التقديمي الترحيبي؛ وإلا تشغيل تلقائي لو مفعّل والبيانات محفوظة
    if not cfg.get("onboarded"):
        show_onboarding()
    elif (cfg.get("autostart") or cfg.get("trayBoot")) and cfg.get("username") and cfg.get("password"):
        root.after(600, on_start)
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
