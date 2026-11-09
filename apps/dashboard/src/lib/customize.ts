// تخصيص الداشبورد (لكل متصفّح، محفوظ محليًّا): اللون المميّز + ترتيب/إخفاء اللوحات.
import { create } from "zustand";

export type PanelKey = "queue" | "team" | "leaderboard" | "alerts";

export const PANELS: { key: PanelKey; label: string }[] = [
  { key: "queue", label: "المحادثات المعيّنة" },
  { key: "team", label: "شبكة الفريق" },
  { key: "leaderboard", label: "المتصدّرون" },
  { key: "alerts", label: "التنبيهات الحية (يمين)" },
];

// لوحات العمود الأيسر القابلة لإعادة الترتيب (التنبيهات في العمود الأيمن — إظهار/إخفاء فقط)
const ORDERABLE: PanelKey[] = ["queue", "team", "leaderboard"];
export const ACCENT_PRESETS = ["#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#ec4899", "#8b5cf6", "#14b8a6"];

function normalizeOrder(o: unknown): PanelKey[] {
  const arr = Array.isArray(o) ? (o.filter((x) => ORDERABLE.includes(x as PanelKey)) as PanelKey[]) : [];
  for (const k of ORDERABLE) if (!arr.includes(k)) arr.push(k); // أضف أي ناقص
  return arr;
}

function lighten(hex: string, amt = 0.28): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const mix = (c: number) => Math.round(c + (255 - c) * amt);
  const r = mix((n >> 16) & 255), g = mix((n >> 8) & 255), b = mix(n & 255);
  return "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
}

/** يطبّق اللون المميّز على متغيّرات Tailwind (brand-500/400) على مستوى الجذر — حيّ وفوري. */
export function applyAccent(hex: string | null) {
  try {
    const root = document.documentElement;
    if (hex && /^#[0-9a-f]{6}$/i.test(hex)) {
      root.style.setProperty("--color-brand-500", hex);
      root.style.setProperty("--color-brand-400", lighten(hex));
    } else {
      root.style.removeProperty("--color-brand-500");
      root.style.removeProperty("--color-brand-400");
    }
  } catch { /* تجاهل */ }
}

interface CustomState {
  accent: string | null; // null = اللون الافتراضي
  hidden: PanelKey[];
  order: PanelKey[];
  setAccent: (c: string | null) => void;
  togglePanel: (k: PanelKey) => void;
  movePanel: (k: PanelKey, dir: -1 | 1) => void;
  reset: () => void;
}

function load(): { accent: string | null; hidden: PanelKey[]; order: PanelKey[] } {
  let saved: any = {};
  try { const r = localStorage.getItem("khiam_custom"); if (r) saved = JSON.parse(r); } catch { /* تجاهل */ }
  return {
    accent: typeof saved.accent === "string" ? saved.accent : null,
    hidden: Array.isArray(saved.hidden) ? saved.hidden.filter((x: any) => PANELS.some((p) => p.key === x)) : [],
    order: normalizeOrder(saved.order),
  };
}
function persist(s: CustomState) {
  try { localStorage.setItem("khiam_custom", JSON.stringify({ accent: s.accent, hidden: s.hidden, order: s.order })); } catch { /* تجاهل */ }
}

const initial = load();
applyAccent(initial.accent); // طبّق المحفوظ عند الإقلاع

export const useCustomize = create<CustomState>((set, get) => ({
  accent: initial.accent,
  hidden: initial.hidden,
  order: initial.order,
  setAccent: (c) => { applyAccent(c); set({ accent: c }); persist(get()); },
  togglePanel: (k) => {
    const hidden = get().hidden.includes(k) ? get().hidden.filter((x) => x !== k) : [...get().hidden, k];
    set({ hidden }); persist(get());
  },
  movePanel: (k, dir) => {
    const o = [...get().order];
    const i = o.indexOf(k), j = i + dir;
    if (i < 0 || j < 0 || j >= o.length) return;
    [o[i], o[j]] = [o[j], o[i]];
    set({ order: o }); persist(get());
  },
  reset: () => { applyAccent(null); set({ accent: null, hidden: [], order: normalizeOrder([]) }); persist(get()); },
}));
