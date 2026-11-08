// حدّ معدّل per-employee على مسارات الكتابة — يمنع الموظف ينفخ أرقامه أو يغرق السيرفر بطلبات
// مباشرة بالتوكن المُعاد (curl بدل الواجهة). نافذة ثابتة في الذاكرة بلا مكتبات (زي حارس الدخول).
// الحدود سخيّة: تمسك السكربتات الآلية (مئات/ثانية) لا الموظف المشغول وقت الذروة. كلها قابلة للضبط من env.

interface Win {
  count: number;
  resetAt: number;
}
const buckets = new Map<string, Win>();

function hit(key: string, max: number, windowMs = 60_000): { ok: true } | { ok: false; retryAfter: number } {
  const now = Date.now();
  let w = buckets.get(key);
  if (!w || w.resetAt <= now) {
    w = { count: 0, resetAt: now + windowMs };
    buckets.set(key, w);
  }
  w.count++;
  if (buckets.size > 5000) for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k); // تنظيف كسول
  if (w.count > max) return { ok: false, retryAfter: Math.ceil((w.resetAt - now) / 1000) };
  return { ok: true };
}

const n = (v: string | undefined, d: number): number => {
  const x = Number(v);
  return Number.isFinite(x) && x > 0 ? x : d;
};

/** حد المسار (POST فقط) ودلوه المشترك. الحدود الافتراضية سخيّة؛ تُضبط من env. */
function spec(path: string, method: string): { bucket: string; max: number } | null {
  if (method !== "POST") return null;
  switch (path) {
    case "/api/activity":
      return { bucket: "activity", max: n(process.env.RATE_ACTIVITY_PER_MIN, 120) };
    case "/api/presence":
      return { bucket: "presence", max: n(process.env.RATE_PRESENCE_PER_MIN, 120) };
    case "/api/ai/evaluate":
      return { bucket: "evaluate", max: n(process.env.RATE_EVALUATE_PER_MIN, 60) };
    case "/api/history":
      return { bucket: "history", max: n(process.env.RATE_HISTORY_PER_MIN, 15) };
    case "/api/screenshots":
      return { bucket: "screenshots", max: n(process.env.RATE_SCREENSHOTS_PER_MIN, 90) };
    case "/api/queue/next":
    case "/api/queue/done":
      return { bucket: "queue", max: n(process.env.RATE_QUEUE_PER_MIN, 90) };
    case "/api/inbox":
    case "/api/queue/sync":
      return { bucket: "sync", max: n(process.env.RATE_SYNC_PER_MIN, 40) };
    default:
      return null;
  }
}

/** افحص الحد لمسار كتابة لموظف. يرجّع ok، أو تجاوزًا مع retryAfter والدلو (للتنبيه). */
export function checkRate(
  employeeId: string,
  path: string,
  method: string,
): { ok: true } | { ok: false; retryAfter: number; bucket: string } {
  const s = spec(path, method);
  if (!s) return { ok: true };
  const r = hit(`${employeeId}:${s.bucket}`, s.max);
  return r.ok ? { ok: true } : { ok: false, retryAfter: r.retryAfter, bucket: s.bucket };
}
