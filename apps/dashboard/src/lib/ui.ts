import { EmployeeStatus } from "@khiam/shared";

export type Tone = "good" | "warn" | "bad" | "neutral";

export const STATUS_META: Record<string, { label: string; tone: Tone; dot: string }> = {
  [EmployeeStatus.ONLINE]: { label: "متصل ويعمل", tone: "good", dot: "#22c55e" },
  [EmployeeStatus.TYPING]: { label: "يكتب ردًا", tone: "good", dot: "#38bdf8" },
  [EmployeeStatus.IN_CONVERSATION]: { label: "في محادثة", tone: "good", dot: "#34d399" },
  [EmployeeStatus.COMMENTS_PAGE]: { label: "صفحة التعليقات", tone: "good", dot: "#2dd4bf" },
  [EmployeeStatus.INTERMITTENT]: { label: "متقطع", tone: "warn", dot: "#f59e0b" },
  [EmployeeStatus.IDLE]: { label: "لا يتحرك", tone: "warn", dot: "#f59e0b" },
  [EmployeeStatus.SOCIAL]: { label: "سوشيال ميديا", tone: "bad", dot: "#ef4444" },
  [EmployeeStatus.GAMES]: { label: "ألعاب", tone: "bad", dot: "#ef4444" },
  [EmployeeStatus.ENTERTAINMENT]: { label: "ترفيه", tone: "bad", dot: "#ef4444" },
  [EmployeeStatus.NO_INTERNET]: { label: "النت مقطوع", tone: "bad", dot: "#f97316" },
  [EmployeeStatus.AGENT_DISCONNECTED]: { label: "الأداة غير متصلة", tone: "neutral", dot: "#64748b" },
  [EmployeeStatus.OFFLINE]: { label: "غير متصل", tone: "neutral", dot: "#64748b" },
};

export const PRESENCE_LABEL: Record<string, string> = {
  not_started: "لم يبدأ",
  working: "يعمل",
  break: "بريك",
  prayer: "صلاة",
  wc: "حمام",
  shift_ended: "أنهى الشيفت",
};

export const HIGHLIGHT_LABEL: Record<string, string> = {
  fastest: "⚡ الأسرع ردًا",
  mostReplies: "💬 الأكثر ردًا",
  mostOrders: "🛒 الأكثر أوردرات",
  mostTasks: "📋 الأكثر إنجازًا بالطابور",
  slowest: "🐌 الأبطأ",
  fewestReplies: "📉 الأقل ردًا",
  bestOverall: "🏆 الأفضل عمومًا",
  worstOverall: "⚠️ الأضعف عمومًا",
};

export function timeAgo(ms: number | string | null): string {
  if (!ms) return "—";
  const t = typeof ms === "string" ? new Date(ms).getTime() : ms;
  const diff = Date.now() - t;
  if (diff < 0) return "الآن";
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s} ث`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} د`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} س`;
  return `${Math.floor(h / 24)} يوم`;
}

export function fmtGap(ms: number | null): string {
  if (ms == null) return "—";
  if (ms < 60000) return `${Math.round(ms / 1000)}ث`;
  return `${Math.round(ms / 60000)}د`;
}

export function clockAt(iso: string | number | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" });
}
