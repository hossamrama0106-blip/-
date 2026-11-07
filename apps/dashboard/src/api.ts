// طبقة الاتصال بالـ backend
import type {
  Alert,
  AuditEntry,
  CountersDaily,
  Employee,
  InboxSnapshot,
  KpiSnapshot,
  LiveStatus,
  NotificationItem,
  QueueTask,
  Violation,
} from "@khiam/shared";

export type { KpiSnapshot, MetricPoint, QueueTask, AuditEntry } from "@khiam/shared";

const BASE = "/api";

let AUTH = "";
export function setToken(t: string) {
  AUTH = t;
}
export function getToken() {
  return AUTH;
}

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { "content-type": "application/json", ...((init?.headers as Record<string, string>) ?? {}) };
  if (AUTH) headers.authorization = `Bearer ${AUTH}`;
  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as any).error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export interface LeaderboardRow {
  employeeId: string;
  name: string;
  color: string;
  msgs: number;
  comments: number;
  orders: number;
  openNoReply: number;
  avgGapMs: number | null;
  typingWpm: number;
  points: number;
  tasksDone: number;
  online: boolean;
  status: string;
}
export interface Leaderboard {
  rows: LeaderboardRow[];
  highlights: Record<string, string | null>;
}

export interface QueuePerEmployee {
  employeeId: string;
  name: string;
  color: string;
  current: QueueTask | null;
  doneToday: number;
}
export interface QueueStats {
  strict: boolean;
  waiting: number;
  assigned: number;
  doneToday: number;
  avgWaitMs: number | null;
  avgHandleMs: number | null;
  oldestWaitMs: number | null;
  waitingList: QueueTask[];
  perEmployee: QueuePerEmployee[];
}

export interface ReviewRow {
  id: string;
  employeeId: string;
  conversationRef: string;
  verdict: "good" | "ok" | "bad";
  score: number;
  aiNotes: string;
  sampleText: string;
  at: string;
}

export interface DailyReportRow {
  employeeId: string;
  name: string;
  color: string;
  whatsapp: string | null;
  msgs: number;
  comments: number;
  orders: number;
  tasksDone: number;
  points: number;
  avgGapMs: number | null;
  violations: number;
  reviews: { good: number; ok: number; bad: number };
  shift: string;
  online: boolean;
}
export interface DailyReport {
  date: string;
  generatedAt: string;
  team: {
    employees: number;
    onlineNow: number;
    msgs: number;
    comments: number;
    orders: number;
    tasksDone: number;
    points: number;
    violations: number;
    reviews: { good: number; ok: number; bad: number };
    avgHandleMs: number | null;
  };
  byChannel: Record<string, { waiting: number; assigned: number }>;
  rows: DailyReportRow[];
}

export interface Snapshot {
  employees: Employee[];
  live: Record<string, LiveStatus>;
  leaderboard: Leaderboard;
  inbox: InboxSnapshot;
  alerts: Alert[];
  violations: Violation[];
  notifications: NotificationItem[];
  reviews: ReviewRow[];
  nightMode: boolean;
  aiMode: string;
  queue: QueueStats;
  metrics: KpiSnapshot;
}

export const api = {
  health: () => http<{ ok: boolean }>("/health"),
  login: (username: string, password: string, whatsapp?: string) =>
    http("/auth/login", { method: "POST", body: JSON.stringify({ username, password, whatsapp }) }),
  snapshot: () => http<Snapshot>("/snapshot"),
  leaderboard: () => http<Leaderboard>("/leaderboard"),
  counters: () => http<{ counters: CountersDaily[] }>("/counters"),

  addEmployee: (data: { username: string; password: string; name: string; whatsapp: string; role?: string }) =>
    http<Employee>("/employees", { method: "POST", body: JSON.stringify(data) }),
  updateEmployee: (id: string, patch: Partial<Employee>) =>
    http<Employee>(`/employees/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  removeEmployee: (id: string) => http(`/employees/${id}`, { method: "DELETE" }),
  forceLogout: (id: string) => http(`/employees/${id}/logout`, { method: "POST" }),
  setFlags: (id: string, flags: { liveWatching?: boolean; spotlight?: boolean; superMonitor?: boolean }) =>
    http<LiveStatus>(`/employees/${id}/flags`, { method: "POST", body: JSON.stringify(flags) }),

  sendNotification: (data: { type: string; from: string; to: string; body: string }) =>
    http<NotificationItem>("/notifications", { method: "POST", body: JSON.stringify(data) }),
  addViolation: (data: { employeeId: string; type: string; severity?: string; reason: string; link?: string; imageUrl?: string }) =>
    http<Violation>("/violations", { method: "POST", body: JSON.stringify(data) }),
  timeline: (employeeId: string) =>
    http<Array<{ id: string; label: string; category: string; at: string }>>(`/timeline?employeeId=${encodeURIComponent(employeeId)}`),
  history: (employeeId: string) =>
    http<Array<{ id: string; url: string; title: string; visitAt: string }>>(`/history?employeeId=${encodeURIComponent(employeeId)}`),
  queueCommand: (id: string, cmd: string) =>
    http(`/employees/${id}/command`, { method: "POST", body: JSON.stringify({ cmd }) }),
  screenshotsFor: (employeeId: string) =>
    http<Array<{ id: string; dataUrl: string; at: string }>>(`/screenshots?employeeId=${encodeURIComponent(employeeId)}`),
  getSettings: () => http<{ googleSheetWebhook: string; ntfyTopic: string; queueStrict: boolean }>("/settings"),
  setSettings: (body: { googleSheetWebhook?: string; ntfyTopic?: string; queueStrict?: boolean }) =>
    http<{ googleSheetWebhook: string; ntfyTopic: string; queueStrict: boolean }>("/settings", { method: "POST", body: JSON.stringify(body) }),

  metrics: () => http<KpiSnapshot>("/metrics"),
  reportDaily: (date?: string) => http<DailyReport>(`/report/daily${date ? `?date=${encodeURIComponent(date)}` : ""}`),
  // إرسال واتساب تلقائي عبر WAHA (نائم بدون WAHA_URL → يرجّع {dormant:true})
  wahaSend: (data: { employeeId: string; text: string; image?: string }) =>
    http<{ ok: boolean; dormant?: boolean; error?: string; id?: string }>("/waha/send", { method: "POST", body: JSON.stringify(data) }),
  audit: (limit = 150) => http<AuditEntry[]>(`/audit?limit=${limit}`),
  queue: () => http<QueueStats>("/queue"),
  queueNext: (employeeId: string) =>
    http<{ task: QueueTask | null; queueWaiting: number }>("/queue/next", { method: "POST", body: JSON.stringify({ employeeId }) }),
  enqueueTask: (data: { customerRef: string; channel?: string; preview?: string; priority?: string; link?: string }) =>
    http<QueueTask>("/queue/enqueue", { method: "POST", body: JSON.stringify(data) }),
  assignTask: (id: string, employeeId: string) =>
    http<QueueTask>(`/queue/${id}/assign`, { method: "POST", body: JSON.stringify({ employeeId }) }),
  skipTask: (id: string, reason?: string) =>
    http<QueueTask>(`/queue/${id}/skip`, { method: "POST", body: JSON.stringify({ reason }) }),
  addPoint: (data: { employeeId: string; delta: number; reason: string }) =>
    http("/points", { method: "POST", body: JSON.stringify(data) }),
  resolveAlert: (id: string) => http(`/alerts/${id}/resolve`, { method: "POST" }),
  latestScreenshot: (employeeId: string) =>
    http<{ dataUrl: string; at: string; width: number; height: number } | null>(`/screenshots/latest?employeeId=${encodeURIComponent(employeeId)}`),
  reviewsFor: (employeeId: string) => http<ReviewRow[]>(`/reviews?employeeId=${encodeURIComponent(employeeId)}`),
  setNightMode: (enabled: boolean) =>
    http<{ enabled: boolean }>("/ai/night-mode", { method: "POST", body: JSON.stringify({ enabled }) }),
  evaluate: (data: { employeeId: string; conversationRef?: string; messages: { role: string; text: string }[] }) =>
    http("/ai/evaluate", { method: "POST", body: JSON.stringify(data) }),
};
