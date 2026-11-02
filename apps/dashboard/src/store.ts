// حالة الداشبورد + الاتصال اللحظي (SSE)
import { create } from "zustand";
import { RealtimeEvent, type Alert, type Employee, type InboxSnapshot, type LiveStatus, type NotificationItem, type Violation } from "@khiam/shared";
import { api, getToken, setToken, type Leaderboard, type QueueStats, type Snapshot } from "./api";

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
  inbox: InboxSnapshot;
  alerts: Alert[];
  violations: Violation[];
  notifications: NotificationItem[];

  selectedId: string | null;
  liveEmployeeId: string | null;
  showSettings: boolean;

  login: (code: string) => Promise<void>;
  loadSnapshot: () => Promise<void>;
  connect: () => void;
  select: (id: string | null) => void;
  setLite: (v: boolean) => void;
  setNight: (v: boolean) => Promise<void>;
  openLive: (id: string) => void;
  closeLive: () => void;
  setShowSettings: (v: boolean) => void;
  refreshLeaderboard: () => Promise<void>;
}

let es: EventSource | null = null;

export const useDash = create<DashState>((set, get) => ({
  connected: false,
  loggedIn: false,
  adminId: null,
  liteMode: false,
  nightMode: false,

  employees: [],
  live: {},
  leaderboard: null,
  queue: null,
  inbox: { unreadMessages: 0, unreadComments: 0, at: "" },
  alerts: [],
  violations: [],
  notifications: [],
  selectedId: null,
  liveEmployeeId: null,
  showSettings: false,

  async login(code: string) {
    const res: any = await api.login(code);
    setToken(res.token);
    set({ loggedIn: true, adminId: res.employee?.id ?? "admin" });
    await get().loadSnapshot();
    get().connect();
  },

  async loadSnapshot() {
    const snap: Snapshot = await api.snapshot();
    set({
      employees: snap.employees,
      live: snap.live,
      leaderboard: snap.leaderboard,
      queue: snap.queue,
      inbox: snap.inbox,
      alerts: snap.alerts,
      violations: snap.violations,
      notifications: snap.notifications,
      nightMode: snap.nightMode,
    });
  },

  connect() {
    if (es) es.close();
    es = new EventSource("/api/stream?token=" + encodeURIComponent(getToken()));
    es.addEventListener("hello", () => {
      const wasConnected = get().connected;
      set({ connected: true });
      // عند إعادة الاتصال: أعد تحميل اللقطة الكاملة لتفادي البيانات القديمة
      if (!wasConnected) get().loadSnapshot().catch(() => {});
    });
    es.onerror = () => set({ connected: false });

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
  },

  select: (id) => set({ selectedId: id }),
  setLite: (v) => set({ liteMode: v }),
  openLive: (id) => set({ liveEmployeeId: id }),
  closeLive: () => set({ liveEmployeeId: null }),
  setShowSettings: (v) => set({ showSettings: v }),
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
}));
