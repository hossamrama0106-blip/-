// حالة الداشبورد + الاتصال اللحظي (SSE)
import { create } from "zustand";
import { RealtimeEvent, type Alert, type Employee, type InboxSnapshot, type LiveStatus, type NotificationItem, type Violation } from "@khiam/shared";
import { api, getToken, setToken, type KpiSnapshot, type Leaderboard, type QueueStats, type Snapshot } from "./api";

interface DashState {
  connected: boolean;
  loggedIn: boolean;
  adminId: string | null;
  liteMode: boolean;
  nightMode: boolean;

  employees: Employee[];
  live: Record<string, LiveStatus>;
  leaderboard: Leaderboard | null;
  queue: QueueStats | null;
  kpi: KpiSnapshot | null;
  inbox: InboxSnapshot;
  alerts: Alert[];
  violations: Violation[];
  notifications: NotificationItem[];

  selectedId: string | null;
  liveEmployeeId: string | null;
  showSettings: boolean;
  showKpi: boolean;
  showAudit: boolean;
  showReport: boolean;
  showTour: boolean;
  showComments: boolean;
  showRemote: boolean;
  role: string;
  theme: string;

  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  init: () => Promise<void>;
  loadSnapshot: () => Promise<void>;
  connect: () => void;
  select: (id: string | null) => void;
  setLite: (v: boolean) => void;
  setNight: (v: boolean) => Promise<void>;
  openLive: (id: string) => void;
  closeLive: () => void;
  setShowSettings: (v: boolean) => void;
  setShowKpi: (v: boolean) => void;
  setShowAudit: (v: boolean) => void;
  setShowReport: (v: boolean) => void;
  setShowTour: (v: boolean) => void;
  setShowComments: (v: boolean) => void;
  setShowRemote: (v: boolean) => void;
  setTheme: (t: string) => void;
  refreshLeaderboard: () => Promise<void>;
  refreshKpi: () => Promise<void>;
  refresh: () => Promise<void>;
}

let es: EventSource | null = null;
let poll: ReturnType<typeof setInterval> | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let netHooks = false;

export const useDash = create<DashState>((set, get) => ({
  connected: false,
  loggedIn: false,
  adminId: null,
  role: "admin",
  liteMode: false,
  nightMode: false,

  employees: [],
  live: {},
  leaderboard: null,
  queue: null,
  kpi: null,
  inbox: { unreadMessages: 0, unreadComments: 0, at: "" },
  alerts: [],
  violations: [],
  notifications: [],
  selectedId: null,
  liveEmployeeId: null,
  showSettings: false,
  showKpi: false,
  showAudit: false,
  showReport: false,
  showTour: false,
  showComments: false,
  showRemote: false,
  theme: (typeof document !== "undefined" && document.documentElement.getAttribute("data-theme")) || "dark",

  async login(username: string, password: string) {
    const res: any = await api.login(username, password);
    setToken(res.token);
    const adminId = res.employee?.id ?? "admin";
    const role = res.employee?.role ?? "admin";
    try { localStorage.setItem("khiam_auth", JSON.stringify({ token: res.token, adminId, role })); } catch {}
    set({ loggedIn: true, adminId, role });
    await get().loadSnapshot();
    get().connect();
    try {
      if (!localStorage.getItem("khiam_onboard_v1")) set({ showTour: true });
    } catch {
      /* الوضع الخاص قد يمنع القراءة */
    }
  },

  logout() {
    try { localStorage.removeItem("khiam_auth"); } catch {}
    setToken("");
    try { if (es) es.close(); } catch {}
    es = null;
    if (poll) { clearInterval(poll); poll = null; }
    set({ loggedIn: false, connected: false, adminId: null });
  },

  // استعادة الجلسة من التخزين عند فتح الصفحة (يمنع إعادة كتابة الباسوورد كل refresh)
  async init() {
    let saved: { token: string; adminId: string; role: string } | null = null;
    try { const raw = localStorage.getItem("khiam_auth"); if (raw) saved = JSON.parse(raw); } catch {}
    if (!saved?.token) return;
    setToken(saved.token);
    set({ loggedIn: true, adminId: saved.adminId, role: saved.role });
    try {
      await get().loadSnapshot(); // توكن منتهي = 401
      get().connect();
    } catch {
      get().logout(); // توكن غير صالح → شاشة الدخول
    }
  },

  async loadSnapshot() {
    const snap: Snapshot = await api.snapshot();
    set({
      employees: snap.employees,
      live: snap.live,
      leaderboard: snap.leaderboard,
      queue: snap.queue,
      kpi: snap.metrics,
      inbox: snap.inbox,
      alerts: snap.alerts,
      violations: snap.violations,
      notifications: snap.notifications,
      nightMode: snap.nightMode,
    });
  },

  connect() {
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
    if (es) es.close();
    es = new EventSource("/api/stream?token=" + encodeURIComponent(getToken()));
    es.addEventListener("hello", () => {
      const wasConnected = get().connected;
      set({ connected: true });
      // عند إعادة الاتصال: أعد تحميل اللقطة الكاملة لتفادي البيانات القديمة
      if (!wasConnected) get().loadSnapshot().catch(() => {});
    });
    es.onerror = () => {
      set({ connected: false });
      // EventSource بيوقف المحاولة لو السيرفر رجّع خطأ (401 توكن / 502 أثناء إيقاظ Render) —
      // نعيد الاتصال صراحةً كل 4ث حتى يرجع، بلا تسجيل خروج ولا تدخّل من المدير.
      try { if (es) es.close(); } catch { /* تجاهل */ }
      es = null;
      if (!reconnectTimer) reconnectTimer = setTimeout(() => { reconnectTimer = null; if (get().loggedIn) get().connect(); }, 4000);
    };
    // رجوع النت / التركيز على التبويب → حدّث وأعد الاتصال فورًا (بلا خروج)
    if (!netHooks && typeof window !== "undefined") {
      netHooks = true;
      window.addEventListener("online", () => { if (get().loggedIn) get().connect(); });
      document.addEventListener("visibilitychange", () => { if (!document.hidden && get().loggedIn) get().loadSnapshot().catch(() => {}); });
    }

    const onStatus = (e: MessageEvent) => {
      const { payload } = JSON.parse(e.data);
      set((s) => ({ live: { ...s.live, [payload.employeeId]: payload } }));
    };
    es.addEventListener(RealtimeEvent.STATUS_CHANGED, onStatus);

    es.addEventListener(RealtimeEvent.EMPLOYEE_UPSERT, (e: MessageEvent) => {
      const { payload } = JSON.parse(e.data);
      set((s) => {
        const i = s.employees.findIndex((x) => x.id === payload.id);
        const employees = i >= 0 ? s.employees.map((x) => (x.id === payload.id ? payload : x)) : [...s.employees, payload];
        return { employees };
      });
    });
    es.addEventListener(RealtimeEvent.EMPLOYEE_REMOVED, (e: MessageEvent) => {
      const { payload } = JSON.parse(e.data);
      set((s) => ({ employees: s.employees.filter((x) => x.id !== payload.id) }));
    });

    es.addEventListener(RealtimeEvent.ALERT, (e: MessageEvent) => {
      const { payload } = JSON.parse(e.data) as { payload: Alert };
      set((s) => {
        const others = s.alerts.filter((a) => a.id !== payload.id);
        return { alerts: payload.resolvedAt ? others : [payload, ...others] };
      });
    });

    es.addEventListener(RealtimeEvent.VIOLATION, (e: MessageEvent) => {
      const { payload } = JSON.parse(e.data) as { payload: Violation };
      set((s) => ({ violations: [payload, ...s.violations.filter((v) => v.id !== payload.id)].slice(0, 100) }));
    });

    es.addEventListener(RealtimeEvent.NOTIFICATION, (e: MessageEvent) => {
      const { payload } = JSON.parse(e.data) as { payload: NotificationItem };
      set((s) => ({ notifications: [payload, ...s.notifications.filter((n) => n.id !== payload.id)].slice(0, 100) }));
    });

    es.addEventListener(RealtimeEvent.QUEUE, (e: MessageEvent) => {
      const { payload } = JSON.parse(e.data) as { payload: QueueStats };
      set({ queue: payload });
    });

    // عدّادات/صندوق الوارد: نحدّث اللوحة كل فترة بدل كل حدث
    let lbTimer: any = null;
    const scheduleLb = () => {
      if (lbTimer) return;
      lbTimer = setTimeout(async () => {
        lbTimer = null;
        try {
          const lb = await api.leaderboard();
          set({ leaderboard: lb });
        } catch {}
      }, 1500);
    };
    es.addEventListener(RealtimeEvent.COUNTERS_UPDATED, (e: MessageEvent) => {
      const { payload } = JSON.parse(e.data);
      if (payload?.inbox) set({ inbox: payload.inbox });
      scheduleLb();
    });
    es.addEventListener(RealtimeEvent.ACTIVITY, scheduleLb);

    // تحديث دوري احتياطي — لو SSE اتقطع على المنصّة، اللوحة تفضل محدّثة بلا refresh يدوي
    if (poll) clearInterval(poll);
    poll = setInterval(() => { get().loadSnapshot().catch(() => {}); }, 10000);
  },

  select: (id) => set({ selectedId: id }),
  setLite: (v) => set({ liteMode: v }),
  openLive: (id) => set({ liveEmployeeId: id }),
  closeLive: () => set({ liveEmployeeId: null }),
  setShowSettings: (v) => set({ showSettings: v }),
  setShowKpi: (v) => set({ showKpi: v }),
  setShowAudit: (v) => set({ showAudit: v }),
  setShowReport: (v) => set({ showReport: v }),
  setShowTour: (v) => set({ showTour: v }),
  setShowComments: (v) => set({ showComments: v }),
  setShowRemote: (v) => set({ showRemote: v }),
  setTheme: (t) => {
    try {
      localStorage.setItem("khiam_theme", t);
    } catch {
      /* الوضع الخاص قد يمنع التخزين */
    }
    if (t === "dark") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", t); // light أو midnight
    set({ theme: t });
  },
  async setNight(v) {
    try {
      await api.setNightMode(v);
    } catch {}
    set({ nightMode: v });
  },
  async refreshLeaderboard() {
    const lb = await api.leaderboard();
    set({ leaderboard: lb });
  },
  async refreshKpi() {
    try {
      const k = await api.metrics();
      set({ kpi: k });
    } catch {}
  },
  // تحديث يدوي فوري بدون تسجيل خروج — يعيد تحميل كل البيانات ويعيد اتصال اللحظي
  async refresh() {
    try { await get().loadSnapshot(); } catch { /* فشل مؤقّت (إيقاظ السيرفر) — نسيب الجلسة زي ما هي، ما نطردش المدير */ }
    try { await get().refreshLeaderboard(); } catch { /* تجاهل */ }
    get().connect();
  },
}));
