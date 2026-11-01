// مصادقة بتوكنات موقّعة (HMAC-SHA256). لا تُحفظ أسرار على العميل، والتوكن يُتحقق منه على السيرفر.
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const SECRET = process.env.AUTH_SECRET || randomBytes(32).toString("hex");
const MAX_AGE_MS = Number(process.env.TOKEN_TTL_MS || 16 * 60 * 60 * 1000); // 16 ساعة

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
