// موصّل Supabase عبر REST (بدون أي مكتبة) — يُفعَّل تلقائيًا لما SUPABASE_URL + SERVICE_ROLE_KEY
// يبقوا موجودين في .env. بدون مفاتيح: كل الدوال تتخطّى بهدوء (الطبقة نائمة).
//
// الاستخدام الحالي: تخزين لقطة الحالة كاملة (durable snapshot) في جدول ops_snapshot — عشان
// البيانات تعيش في السحابة وتصمد مع إعادة النشر/التشغيل. الجداول العلائقية (schema.sql)
// للمرحلة التالية: قراءة مباشرة من الداشبورد + Supabase Realtime.
//
// المفتاح service_role سرّي جدًا — يتخطّى RLS. يُستخدم من السيرفر فقط، أبدًا من المتصفح.

const URL_BASE = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const ANON_KEY = process.env.SUPABASE_ANON_KEY || ""; // publishable — آمن للمتصفح (محميّ بـ RLS)
const SNAPSHOT_TABLE = "ops_snapshot";

/** مربوط؟ (الرابط والمفتاح موجودين) */
export const supabaseEnabled = (): boolean => !!(URL_BASE && SERVICE_KEY);

/** إعداد Realtime للواجهة/الإكستنشن — الرابط + المفتاح العام فقط (أبدًا السرّي). */
export const realtimeConfig = (): { enabled: boolean; url: string; key: string } => ({
  enabled: supabaseEnabled() && !!ANON_KEY,
  url: URL_BASE,
  key: ANON_KEY,
});

function headers(extra: Record<string, string> = {}): Record<string, string> {
  return {
    apikey: SERVICE_KEY,
    authorization: `Bearer ${SERVICE_KEY}`,
    "content-type": "application/json",
    ...extra,
  };
}

// مهلة لكل نداء — عشان Supabase البطيء/المقطوع ما يعلّقش الإقلاع أو حلقة الحفظ.
const TIMEOUT_MS = Number(process.env.SUPABASE_TIMEOUT_MS) || 10000;
const withTimeout = (ms = TIMEOUT_MS): AbortSignal => AbortSignal.timeout(ms);

/** اقرأ لقطة الحالة المخزّنة (أو null لو مفيش/فشل الاتصال) */
export async function fetchSnapshot(): Promise<Record<string, unknown> | null> {
  if (!supabaseEnabled()) return null;
  try {
    const res = await fetch(`${URL_BASE}/rest/v1/${SNAPSHOT_TABLE}?id=eq.1&select=data`, {
      headers: headers(),
      signal: withTimeout(),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const rows = (await res.json()) as { data: Record<string, unknown> }[];
    return rows[0]?.data ?? null;
  } catch (e) {
    console.warn("⚠️ Supabase: تعذّر قراءة اللقطة —", (e as Error).message);
    return null;
  }
}

/** اكتب/حدّث لقطة الحالة (upsert على صف واحد id=1). يرجّع true لو نجح. */
export async function pushSnapshot(data: Record<string, unknown>): Promise<boolean> {
  if (!supabaseEnabled()) return false;
  try {
    const res = await fetch(`${URL_BASE}/rest/v1/${SNAPSHOT_TABLE}`, {
      method: "POST",
      headers: headers({ prefer: "resolution=merge-duplicates,return=minimal" }),
      body: JSON.stringify({ id: 1, data, updated_at: new Date().toISOString() }),
      signal: withTimeout(15000),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status} ${detail}`.trim());
    }
    return true;
  } catch (e) {
    console.warn("⚠️ Supabase: تعذّر حفظ اللقطة —", (e as Error).message);
    return false;
  }
}

/** بثّ أمر لحظي لموظف عبر Supabase Realtime (قناة cmds:<id>) — أفضل جهد، الـ polling fallback. */
export async function broadcastCommand(employeeId: string, cmd: string): Promise<boolean> {
  if (!supabaseEnabled()) return false;
  try {
    const res = await fetch(`${URL_BASE}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        messages: [{ topic: `cmds:${employeeId}`, event: "cmd", payload: { cmd } }],
      }),
      signal: withTimeout(8000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return true;
  } catch (e) {
    console.warn("⚠️ Supabase Realtime: تعذّر بثّ الأمر —", (e as Error).message);
    return false;
  }
}

/** فحص اتصال سريع عند الإقلاع — يرجّع true لو الجدول موجود والمفتاح صالح. */
export async function pingSupabase(): Promise<boolean> {
  if (!supabaseEnabled()) return false;
  try {
    const res = await fetch(`${URL_BASE}/rest/v1/${SNAPSHOT_TABLE}?id=eq.1&select=id`, {
      headers: headers(),
      signal: withTimeout(),
    });
    return res.ok;
  } catch {
    return false;
  }
}
