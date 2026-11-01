// طبقة الاتصال بالـ backend
import type {
  Alert,
  CountersDaily,
  Employee,
  InboxSnapshot,
  LiveStatus,
  NotificationItem,
  Violation,
} from "@khiam/shared";

const BASE = "/api";

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "content-type": "application/json" },
    ...init,
  });
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
  online: boolean;
  status: string;
}
export interface Leaderboard {
  rows: LeaderboardRow[];
  highlights: Record<string, string | null>;
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
}

export const api = {
  health: () => http<{ ok: boolean }>("/health"),
  login: (code: string, whatsapp?: string) =>
    http("/auth/login", { method: "POST", body: JSON.stringify({ code, whatsapp }) }),
  snapshot: () => http<Snapshot>("/snapshot"),
  leaderboard: () => http<Leaderboard>("/leaderboard"),
  counters: () => http<{ counters: CountersDaily[] }>("/counters"),

  addEmployee: (data: { code: string; name: string; whatsapp: string }) =>
    http<Employee>("/employees", { method: "POST", body: JSON.stringify(data) }),
  updateEmployee: (id: string, patch: Partial<Employee>) =>
    http<Employee>(`/employees/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  removeEmployee: (id: string) => http(`/employees/${id}`, { method: "DELETE" }),
  setFlags: (id: string, flags: { liveWatching?: boolean; spotlight?: boolean; superMonitor?: boolean }) =>
    http<LiveStatus>(`/employees/${id}/flags`, { method: "POST", body: JSON.stringify(flags) }),

  sendNotification: (data: { type: string; from: string; to: string; body: string }) =>
    http<NotificationItem>("/notifications", { method: "POST", body: JSON.stringify(data) }),
  addViolation: (data: { employeeId: string; type: string; severity?: string; reason: string }) =>
    http<Violation>("/violations", { method: "POST", body: JSON.stringify(data) }),
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
