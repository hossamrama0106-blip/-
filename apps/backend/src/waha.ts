// موصّل WAHA (WhatsApp HTTP API — بوابة واتساب ذاتية الاستضافة) لإرسال التقارير/الملخّصات
// تلقائيًا لواتساب الموظف. zero-dep (fetch فقط). يُفعَّل لما WAHA_URL يبقى موجودًا.
//
// نائم بدون إعداد: كل الدوال تُرجِع {ok:false, dormant:true} بهدوء — والداشبورد يفضل
// يستخدم رابط wa.me اليدوي. الإرسال التلقائي يحصل فقط بفعل أدمن صريح (مش بث خلفي).
//
// WAHA REST: POST {BASE}/api/sendText {session, chatId, text}
//            POST {BASE}/api/sendImage {session, chatId, file:{mimetype,filename,data}, caption}
// chatId لواتساب الفرد = "<رقم دولي>@c.us". مفتاح اختياري عبر هيدر X-Api-Key.
const BASE = (process.env.WAHA_URL || "").replace(/\/+$/, "");
const SESSION = process.env.WAHA_SESSION || "default";
const API_KEY = process.env.WAHA_API_KEY || "";
const TIMEOUT_MS = Number(process.env.WAHA_TIMEOUT_MS) || 15000;

/** مربوط؟ (WAHA_URL موجود) */
export const wahaEnabled = (): boolean => !!BASE;

export interface WahaResult {
  ok: boolean;
  dormant?: boolean;
  error?: string;
  id?: string;
}

/** تطبيع رقم واتساب لصيغة دولية بدون + (أرقام مصرية محلية 0… → 20…) */
export function waChatId(raw: string): string | null {
  let d = (raw || "").replace(/[^0-9]/g, "");
  if (!d) return null;
  if (d.startsWith("00")) d = d.slice(2);
  else if (d.startsWith("0")) d = "20" + d.slice(1);
  return d ? `${d}@c.us` : null;
}

function headers(): Record<string, string> {
  const h: Record<string, string> = { "content-type": "application/json", accept: "application/json" };
  if (API_KEY) h["X-Api-Key"] = API_KEY;
  return h;
}

async function post(path: string, body: unknown): Promise<WahaResult> {
  if (!wahaEnabled()) return { ok: false, dormant: true };
  try {
    const res = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try { const j = (await res.json()) as { message?: string; error?: string }; msg = j.message || j.error || msg; } catch { /* */ }
      return { ok: false, error: msg };
    }
    let id: string | undefined;
    try { const j = (await res.json()) as { id?: string | { _serialized?: string } }; id = typeof j.id === "string" ? j.id : j.id?._serialized; } catch { /* */ }
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: String((e as Error)?.message || e) };
  }
}

/** إرسال نص لواتساب رقم (raw: أي صيغة — يُطبَّع) */
export async function sendText(rawPhone: string, text: string): Promise<WahaResult> {
  const chatId = waChatId(rawPhone);
  if (!chatId) return { ok: false, error: "رقم غير صالح" };
  if (!text) return { ok: false, error: "نص فارغ" };
  return post("/api/sendText", { session: SESSION, chatId, text });
}

/** إرسال صورة (data URL أو رابط http) مع تعليق — للتقارير المصحوبة بلقطة/دليل */
export async function sendImage(rawPhone: string, image: string, caption = ""): Promise<WahaResult> {
  const chatId = waChatId(rawPhone);
  if (!chatId) return { ok: false, error: "رقم غير صالح" };
  if (!image) return { ok: false, error: "صورة فارغة" };
  const m = /^data:([^;]+);base64,(.*)$/.exec(image);
  const file = m
    ? { mimetype: m[1], filename: "report." + (m[1].split("/")[1] || "png"), data: m[2] }
    : { url: image };
  return post("/api/sendImage", { session: SESSION, chatId, file, caption });
}
