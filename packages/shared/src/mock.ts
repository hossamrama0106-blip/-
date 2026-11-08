// بيانات تجريبية للتطوير المحلي (قبل ربط Supabase)
import { Role } from "./enums.js";
import type { Employee } from "./types.js";

const COLORS = [
  "#ef4444", "#f97316", "#eab308", "#22c55e", "#14b8a6",
  "#3b82f6", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16",
  "#f43f5e", "#a855f7",
];

const NAMES = [
  "أحمد سمير", "مريم خالد", "يوسف عادل", "سارة محمود", "كريم فؤاد",
  "نورا حسن", "محمد طارق", "هبة علي", "عمر صلاح", "دينا رأفت",
  "إسلام جمال", "رنا وليد",
];

export function seedEmployees(): Employee[] {
  const now = new Date().toISOString();
  return NAMES.map((name, i) => ({
    id: `emp_${String(i + 1).padStart(3, "0")}`,
    code: `K${1000 + i + 1}`,
    name,
    whatsapp: `+2010${String(10000000 + i * 111111).slice(0, 8)}`,
    role: i === 0 ? Role.ADMIN : Role.EMPLOYEE,
    active: true,
    superMonitor: false,
    consentAt: i % 4 === 0 ? null : now, // بعضهم لسه مـا وافقش
    avatarColor: COLORS[i % COLORS.length],
    createdAt: now,
  }));
}
