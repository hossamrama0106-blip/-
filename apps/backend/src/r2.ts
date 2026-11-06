// موصّل Cloudflare R2 (تخزين لقطات الشاشة) عبر S3 REST + توقيع SigV4 بـ node:crypto — بدون أي مكتبة.
// يُفعَّل تلقائيًا لما R2_ACCOUNT_ID + R2_ACCESS_KEY_ID + R2_SECRET_ACCESS_KEY + R2_BUCKET يبقوا موجودين.
// بدون مفاتيح: كل الدوال تتخطّى بهدوء (الطبقة نائمة) واللقطات تفضل data URL في الذاكرة.
//
// R2 متوافق مع S3: المنطقة "auto"، المسار path-style (البكت في المسار مش في الـ host).
// الرفع (PUT) موقّع بالهيدر؛ والقراءة رابط موقّع مسبقًا (presigned) عشان المتصفح يجيب الصورة
// مباشرةً من R2 بدون ما السيرفر يمرّر البايتات ولا يكشف مفاتيح R2.
import { createHash, createHmac } from "node:crypto";

const ACCOUNT = process.env.R2_ACCOUNT_ID || "";
const ACCESS_KEY = process.env.R2_ACCESS_KEY_ID || "";
const SECRET_KEY = process.env.R2_SECRET_ACCESS_KEY || "";
const BUCKET = process.env.R2_BUCKET || "";
const REGION = "auto";
const SERVICE = "s3";
const HOST = ACCOUNT ? `${ACCOUNT}.r2.cloudflarestorage.com` : "";

/** مربوط؟ (كل مفاتيح R2 موجودة) */
export const r2Enabled = (): boolean => !!(ACCOUNT && ACCESS_KEY && SECRET_KEY && BUCKET);

const sha256hex = (data: string | Buffer): string => createHash("sha256").update(data).digest("hex");
const hmac = (key: string | Buffer, data: string): Buffer => createHmac("sha256", key).update(data).digest();

// ترميز URI بأسلوب S3 (غير المحجوز لا يُرمَّز؛ و"/" يُرمَّز إلا في مكوّن المسار).
// ملاحظة: المفاتيح عندنا ASCII فقط (screenshots/<id>/<id>.webp) — بلا حاجة لترميز UTF-8.
function uriEncode(str: string, encodeSlash = true): string {
  return str.replace(/[^A-Za-z0-9_.~-]/g, (ch) => {
    if (ch === "/" && !encodeSlash) return ch;
    return "%" + ch.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0");
  });
}

function amzDates(d = new Date()): { amzDate: string; dateStamp: string } {
  const amzDate = d.toISOString().replace(/[:-]|\.\d{3}/g, ""); // YYYYMMDDTHHMMSSZ
  return { amzDate, dateStamp: amzDate.slice(0, 8) };
}

function signingKey(dateStamp: string): Buffer {
  const kDate = hmac("AWS4" + SECRET_KEY, dateStamp);
  const kRegion = hmac(kDate, REGION);
  const kService = hmac(kRegion, SERVICE);
  return hmac(kService, "aws4_request");
}

/** رفع كائن لـ R2 (PUT موقّع). يرجّع true لو نجح. */
export async function putObject(key: string, body: Buffer, contentType: string): Promise<boolean> {
  if (!r2Enabled()) return false;
  try {
    const { amzDate, dateStamp } = amzDates();
    const canonicalUri = "/" + uriEncode(BUCKET, false) + "/" + uriEncode(key, false);
    const payloadHash = sha256hex(body);
    const signed: Record<string, string> = {
      host: HOST,
      "content-type": contentType,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amzDate,
    };
    const keys = Object.keys(signed).sort();
    const signedHeaders = keys.join(";");
    const canonicalHeaders = keys.map((h) => `${h}:${signed[h]}\n`).join("");
    const canonicalRequest = ["PUT", canonicalUri, "", canonicalHeaders, signedHeaders, payloadHash].join("\n");
    const scope = `${dateStamp}/${REGION}/${SERVICE}/aws4_request`;
    const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256hex(canonicalRequest)].join("\n");
    const signature = hmac(signingKey(dateStamp), stringToSign).toString("hex");
    const authorization = `AWS4-HMAC-SHA256 Credential=${ACCESS_KEY}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
    const res = await fetch(`https://${HOST}${canonicalUri}`, {
      method: "PUT",
      headers: { ...signed, authorization },
      body,
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status} ${detail}`.trim());
    }
    return true;
  } catch (e) {
    console.warn("⚠️ R2: تعذّر رفع الكائن —", (e as Error).message);
    return false;
  }
}

/** رفع data URL (base64) ويرجّع المفتاح عند النجاح، أو "" لو نائم/فشل/صيغة غلط. */
export async function putDataUrl(key: string, dataUrl: string): Promise<string> {
  if (!r2Enabled()) return "";
  const m = /^data:([^;]+);base64,(.*)$/s.exec(dataUrl || "");
  if (!m) return "";
  const body = Buffer.from(m[2], "base64");
  const ok = await putObject(key, body, m[1] || "application/octet-stream");
  return ok ? key : "";
}

/** رابط GET موقّع مسبقًا (presigned، افتراضي 5 دقائق) — للمتصفح يجيب الصورة مباشرةً من R2. */
export function signedGetUrl(key: string, expiresSec = 300): string {
  if (!r2Enabled() || !key) return "";
  const { amzDate, dateStamp } = amzDates();
  const scope = `${dateStamp}/${REGION}/${SERVICE}/aws4_request`;
  const canonicalUri = "/" + uriEncode(BUCKET, false) + "/" + uriEncode(key, false);
  const q: Record<string, string> = {
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${ACCESS_KEY}/${scope}`,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(expiresSec),
    "X-Amz-SignedHeaders": "host",
  };
  const canonicalQuery = Object.keys(q)
    .sort()
    .map((k) => `${uriEncode(k)}=${uriEncode(q[k])}`)
    .join("&");
  const canonicalRequest = ["GET", canonicalUri, canonicalQuery, `host:${HOST}\n`, "host", "UNSIGNED-PAYLOAD"].join("\n");
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256hex(canonicalRequest)].join("\n");
  const signature = hmac(signingKey(dateStamp), stringToSign).toString("hex");
  return `https://${HOST}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}
