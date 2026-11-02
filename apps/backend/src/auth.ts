// مصادقة بتوكنات موقّعة (HMAC-SHA256). لا تُحفظ أسرار على العميل، والتوكن يُتحقق منه على السيرفر.
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const IS_PROD = process.env.NODE_ENV === "production";

// سر توقيع التوكنات — لازم يتحدد في الإنتاج (وإلا التوكنات تتبطّل مع كل إعادة تشغيل وحمايتها ضعيفة).
const SECRET =
  process.env.AUTH_SECRET ||
  (() => {
    console.warn(
      IS_PROD
        ? "⚠️  AUTH_SECRET غير محدّد في الإنتاج — كل التوكنات هتتبطّل مع أي إعادة تشغيل وأمانها ضعيف. حدّده في .env"
        : "ℹ️  AUTH_SECRET غير محدّد — بيُولّد سر مؤقّت للتطوير (التوكنات تتبطّل مع إعادة التشغيل).",
    );
    return randomBytes(32).toString("hex");
  })();

const MAX_AGE_MS = Number(process.env.TOKEN_TTL_MS || 16 * 60 * 60 * 1000); // 16 ساعة

// كود دخول المدير — من متغيّر بيئة. في التطوير يرجع لـ ADMIN مع تنبيه؛ في الإنتاج لازم يتحدد (وإلا الدخول مقفول).
const ENV_ADMIN_CODE = (process.env.ADMIN_CODE || "").trim();
const EFFECTIVE_ADMIN_CODE = ENV_ADMIN_CODE || (IS_PROD ? "" : "ADMIN");
if (!ENV_ADMIN_CODE) {
  console.warn(
    IS_PROD
      ? "⚠️  ADMIN_CODE غير محدّد في الإنتاج — دخول المدير مقفول لحد ما تحدّده في .env"
      : "ℹ️  ADMIN_CODE غير محدّد — بيُستخدم كود التطوير ADMIN (متنفعش للإنتاج).",
  );
}

export interface Identity {
  id: string;
  role: "admin" | "employee";
  iat: number;
}

function sign(payload: string): string {
  return createHmac("sha256", SECRET).update(payload).digest("base64url");
}

export function signToken(id: string, role: "admin" | "employee"): string {
  const payload = Buffer.from(JSON.stringify({ id, role, iat: Date.now() })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifyToken(token: string | undefined | null): Identity | null {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot < 1) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = sign(payload);
  // مقارنة ثابتة الزمن
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString()) as Identity;
    if (!data.id || !data.role) return null;
    if (Date.now() - data.iat > MAX_AGE_MS) return null; // منتهي
    return data;
  } catch {
    return null;
  }
}

/** تحقّق كود المدير بمقارنة ثابتة الزمن. fail-closed في الإنتاج لو الكود مش محدّد. */
export function isAdminCode(code: string | undefined | null): boolean {
  if (!EFFECTIVE_ADMIN_CODE) return false; // الإنتاج بدون كود مضبوط = دخول المدير مقفول
  const given = Buffer.from(String(code ?? "").trim(), "utf8");
  const want = Buffer.from(EFFECTIVE_ADMIN_CODE, "utf8");
  if (given.length !== want.length) return false;
  return timingSafeEqual(given, want);
}

// ---------- حارس محاولات الدخول (يمنع تخمين الأكواد بالقوة الغاشمة) ----------
const WINDOW_MS = Number(process.env.LOGIN_WINDOW_MS || 60_000); // نافذة العدّ
const MAX_FAILS = Number(process.env.LOGIN_MAX_FAILS || 8); // محاولات فاشلة مسموحة بالنافذة
const BLOCK_MS = Number(process.env.LOGIN_BLOCK_MS || 5 * 60_000); // مدة الحظر بعد التجاوز

interface Attempt {
  fails: number;
  first: number;
  blockedUntil: number;
}
const attempts = new Map<string, Attempt>();

/** قبل محاولة الدخول: هل الـ key (IP) محظور حاليًا؟ */
export function loginGuard(key: string): { ok: true } | { ok: false; retryAfter: number } {
  const now = Date.now();
  const rec = attempts.get(key);
  if (rec && rec.blockedUntil > now) return { ok: false, retryAfter: Math.ceil((rec.blockedUntil - now) / 1000) };
  return { ok: true };
}

/** تسجيل محاولة فاشلة — بعد تجاوز الحد يُحظر الـ key مؤقتًا. */
export function loginFailed(key: string): void {
  const now = Date.now();
  // تنظيف كسول للسجلات المنتهية (يمنع تضخّم الخريطة تحت هجوم موزّع)
  if (attempts.size > 1000) for (const [k, r] of attempts) if (r.blockedUntil < now && now - r.first > WINDOW_MS) attempts.delete(k);
  let rec = attempts.get(key);
  if (!rec || now - rec.first > WINDOW_MS) rec = { fails: 0, first: now, blockedUntil: 0 };
  rec.fails++;
  if (rec.fails >= MAX_FAILS) rec.blockedUntil = now + BLOCK_MS;
  attempts.set(key, rec);
}

/** دخول ناجح → صفّر العدّاد لهذا الـ key. */
export function loginOk(key: string): void {
  attempts.delete(key);
}
